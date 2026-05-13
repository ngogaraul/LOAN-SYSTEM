from sanic import Blueprint
from sanic.response import json
from sqlalchemy import select
from collections import deque
from time import time
import httpx
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token

from app.auth_service import (
    auth_mode_allows_local,
    auth_mode_uses_external,
    auth_mode_uses_google,
    auth_mode_uses_oidc,
    sync_user_from_claims,
    sync_user_from_google_claims,
)
from app.config import (
    AUTH_MODE,
    GOOGLE_ALLOWED_ADMIN_EMAILS,
    GOOGLE_ALLOWED_ANALYST_EMAILS,
    GOOGLE_CLIENT_ID,
    LOGIN_RATE_LIMIT_MAX_ATTEMPTS,
    LOGIN_RATE_LIMIT_WINDOW_SEC,
    OIDC_CLIENT_ID,
    OIDC_CLIENT_SECRET,
    OIDC_SCOPE,
    OIDC_TOKEN_URL,
)
from app.db import SessionLocal
from app.models import User
from app.security import hash_password, verify_password, create_token, decode_token
from app.auth_guard import require_auth

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


@bp.get("/config")
async def auth_config(request):
    return json({
        "mode": AUTH_MODE,
        "external_user_management": auth_mode_uses_external(),
        "google_client_id": GOOGLE_CLIENT_ID if auth_mode_uses_google() else "",
        "allowed_admin_emails": sorted(GOOGLE_ALLOWED_ADMIN_EMAILS),
        "allowed_analyst_emails": sorted(GOOGLE_ALLOWED_ANALYST_EMAILS),
    })


@bp.post("/register")
@require_auth(roles=["ADMIN"])
async def register(request):
    if auth_mode_uses_external():
        return json({
            "error": "external_auth_managed",
            "message": "User creation is managed by the external identity provider.",
        }, status=501)

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
            role=role
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)

        return json({
            "message": "user_created",
            "user_id": user.id
        })


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


async def _login_with_google_credential(credential: str):
    verified_payload = google_id_token.verify_oauth2_token(
        credential,
        google_requests.Request(),
        GOOGLE_CLIENT_ID,
    )
    async with SessionLocal() as session:
        user = await sync_user_from_google_claims(session, verified_payload)

    token = create_token(user.id, user.role)
    return {
        "token": token,
        "role": user.role,
        "user_id": user.id,
        "provider": "google",
    }


@bp.post("/login")
async def login(request):
    if auth_mode_uses_google():
        return json({
            "error": "google_sign_in_required",
            "message": "Use Google sign-in to continue.",
        }, status=501)

    data = request.json or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    rate_key = _login_rate_limit_key(request, email)

    if _is_rate_limited(rate_key):
        return json({
            "error": "too_many_attempts",
            "message": "Too many login attempts. Try again later."
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


@bp.post("/google")
async def google_login(request):
    if not auth_mode_uses_google():
        return json({
            "error": "google_sign_in_disabled",
            "message": "Google sign-in is not enabled.",
        }, status=501)

    data = request.json or {}
    credential = str(data.get("credential") or "").strip()
    if not credential:
        return json({"error": "credential_required"}, status=400)

    try:
        auth_result = await _login_with_google_credential(credential)
    except PermissionError as exc:
        return json({"error": "forbidden", "message": str(exc)}, status=403)
    except ValueError as exc:
        return json({"error": "invalid_google_token", "message": str(exc)}, status=401)
    except Exception as exc:
        return json({"error": "google_auth_failed", "message": str(exc)}, status=502)

    return json(auth_result)
