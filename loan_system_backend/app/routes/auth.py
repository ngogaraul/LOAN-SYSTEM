from collections import deque
from time import time

import httpx
from sanic import Blueprint
from sanic.response import json
from sqlalchemy import select

from app.auth_guard import require_auth
from app.auth_service import (
    auth_mode_allows_local,
    auth_mode_uses_email_code,
    auth_mode_uses_oidc,
    sync_user_from_claims,
    sync_user_from_email,
)
from app.config import (
    AUTH_MODE,
    AUTH_SESSION_COOKIE_NAME,
    AUTH_SESSION_COOKIE_SAMESITE,
    AUTH_SESSION_COOKIE_SECURE,
    AUTH_SESSION_HOURS,
    EMAIL_CODE_LENGTH,
    LOGIN_RATE_LIMIT_MAX_ATTEMPTS,
    LOGIN_RATE_LIMIT_WINDOW_SEC,
    OIDC_CLIENT_ID,
    OIDC_CLIENT_SECRET,
    OIDC_SCOPE,
    OIDC_TOKEN_URL,
)
from app.db import SessionLocal
from app.email_login import create_user_session, deliver_login_code, issue_login_code, revoke_session, verify_login_code
from app.models import User
from app.security import create_token, decode_token, hash_password, verify_password

bp = Blueprint("auth", url_prefix="/auth")
_LOGIN_ATTEMPTS: dict[str, deque[float]] = {}


def _login_rate_limit_key(request, email: str) -> str:
    forwarded_for = request.headers.get("X-Forwarded-For", "")
    ip_address = forwarded_for.split(",")[0].strip() or getattr(request, "remote_addr", "") or "unknown"
    return f"{ip_address}:{email or 'unknown'}"


def _is_rate_limited(key: str) -> bool:
    now = time()
    attempts = _LOGIN_ATTEMPTS.setdefault(key, deque())
    while attempts and now - attempts[0] > LOGIN_RATE_LIMIT_WINDOW_SEC:
        attempts.popleft()
    return len(attempts) >= LOGIN_RATE_LIMIT_MAX_ATTEMPTS


def _record_failed_attempt(key: str) -> None:
    attempts = _LOGIN_ATTEMPTS.setdefault(key, deque())
    attempts.append(time())


def _clear_failed_attempts(key: str) -> None:
    _LOGIN_ATTEMPTS.pop(key, None)


def _set_session_cookie(response, session_token: str) -> None:
    response.add_cookie(
        AUTH_SESSION_COOKIE_NAME,
        session_token,
        httponly=True,
        secure=AUTH_SESSION_COOKIE_SECURE,
        samesite=AUTH_SESSION_COOKIE_SAMESITE,
        path="/",
        max_age=AUTH_SESSION_HOURS * 3600,
    )


def _clear_session_cookie(response) -> None:
    response.delete_cookie(
        AUTH_SESSION_COOKIE_NAME,
        path="/",
        httponly=True,
        secure=AUTH_SESSION_COOKIE_SECURE,
        samesite=AUTH_SESSION_COOKIE_SAMESITE,
    )


@bp.get("/config")
async def auth_config(request):
    return json({
        "mode": AUTH_MODE,
        "external_user_management": False,
        "email_code_length": EMAIL_CODE_LENGTH if auth_mode_uses_email_code() else 0,
    })


@bp.post("/register")
@require_auth(roles=["ADMIN"])
async def register(request):
    data = request.json or {}
    name = (data.get("name") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    role = (data.get("role") or "ANALYST").strip().upper()

    if not name or not email or not password:
        return json({"error": "name, email, password required"}, status=400)

    async with SessionLocal() as session:
        existing = await session.scalar(select(User).where(User.email == email))
        if existing:
            return json({"error": "user_exists"}, status=409)

        user = User(
            name=name,
            email=email,
            password_hash=hash_password(password),
            role=role,
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)

        return json({"message": "user_created", "user_id": user.id})


async def _login_with_local_user(email: str, password: str):
    async with SessionLocal() as session:
        user = await session.scalar(select(User).where(User.email == email))
        if not user:
            return None
        if not verify_password(password, user.password_hash):
            return None
        token = create_token(user.id, user.role)
        return {
            "token": token,
            "role": user.role,
            "user_id": user.id,
            "provider": "legacy",
        }


async def _login_with_oidc(email: str, password: str):
    form_data = {
        "grant_type": "password",
        "client_id": OIDC_CLIENT_ID,
        "username": email,
        "password": password,
        "scope": OIDC_SCOPE,
    }
    if OIDC_CLIENT_SECRET:
        form_data["client_secret"] = OIDC_CLIENT_SECRET

    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.post(
            OIDC_TOKEN_URL,
            data=form_data,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )

    if response.status_code in {400, 401, 403}:
        return None

    response.raise_for_status()
    payload = response.json()
    access_token = payload.get("access_token")
    if not access_token:
        raise ValueError("OIDC provider response did not include access_token")

    decoded = decode_token(access_token)
    async with SessionLocal() as session:
        user = await sync_user_from_claims(session, decoded)

    return {
        "token": access_token,
        "role": user.role,
        "user_id": user.id,
        "provider": "oidc",
    }


@bp.post("/request-code")
async def request_code(request):
    if not auth_mode_uses_email_code():
        return json({
            "error": "email_code_disabled",
            "message": "Email code sign-in is not enabled.",
        }, status=501)

    data = request.json or {}
    email = (data.get("email") or "").strip().lower()
    rate_key = _login_rate_limit_key(request, email)

    if not email:
        return json({"error": "email_required"}, status=400)
    if _is_rate_limited(rate_key):
        return json({
            "error": "too_many_attempts",
            "message": "Too many login attempts. Try again later.",
        }, status=429)

    try:
        async with SessionLocal() as session:
            user = await sync_user_from_email(session, email)
            code = await issue_login_code(session, user)
        await deliver_login_code(email, code, user.role)
    except PermissionError as exc:
        _record_failed_attempt(rate_key)
        return json({"error": "forbidden", "message": str(exc)}, status=403)
    except ValueError as exc:
        return json({"error": "request_not_allowed", "message": str(exc)}, status=429)
    except Exception as exc:
        return json({"error": "email_delivery_failed", "message": str(exc)}, status=502)

    _clear_failed_attempts(rate_key)
    return json({"message": "login_code_sent"})


@bp.post("/verify-code")
async def verify_code(request):
    if not auth_mode_uses_email_code():
        return json({
            "error": "email_code_disabled",
            "message": "Email code sign-in is not enabled.",
        }, status=501)

    data = request.json or {}
    email = (data.get("email") or "").strip().lower()
    code = str(data.get("code") or "").strip()
    if not email or not code:
        return json({"error": "email_and_code_required"}, status=400)

    try:
        async with SessionLocal() as session:
            user = await verify_login_code(session, email, code)
            session_token = await create_user_session(session, user)
    except PermissionError as exc:
        return json({"error": "forbidden", "message": str(exc)}, status=403)
    except ValueError as exc:
        return json({"error": "invalid_code", "message": str(exc)}, status=401)

    response = json({
        "message": "signed_in",
        "role": user.role,
        "user_id": user.id,
        "email": user.email,
        "provider": "email_code",
    })
    _set_session_cookie(response, session_token)
    return response


@bp.post("/logout")
async def logout(request):
    session_token = request.cookies.get(AUTH_SESSION_COOKIE_NAME)
    if session_token:
        async with SessionLocal() as session:
            await revoke_session(session, session_token)
    response = json({"message": "signed_out"})
    _clear_session_cookie(response)
    return response


@bp.post("/login")
async def login(request):
    if auth_mode_uses_email_code():
        return json({
            "error": "email_code_required",
            "message": "Use request-code and verify-code to continue.",
        }, status=501)

    data = request.json or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    rate_key = _login_rate_limit_key(request, email)

    if _is_rate_limited(rate_key):
        return json({
            "error": "too_many_attempts",
            "message": "Too many login attempts. Try again later.",
        }, status=429)

    auth_result = None

    if auth_mode_uses_oidc():
        try:
            auth_result = await _login_with_oidc(email, password)
        except Exception as exc:
            if not auth_mode_allows_local():
                return json({
                    "error": "identity_provider_unavailable",
                    "message": str(exc),
                }, status=502)

    if not auth_result and auth_mode_allows_local():
        auth_result = await _login_with_local_user(email, password)

    if not auth_result:
        _record_failed_attempt(rate_key)
        return json({"error": "invalid_credentials"}, status=401)

    _clear_failed_attempts(rate_key)
    return json(auth_result)


@bp.get("/me")
@require_auth(roles=["ADMIN", "ANALYST"])
async def me(request):
    return json({"user": request.ctx.user})
