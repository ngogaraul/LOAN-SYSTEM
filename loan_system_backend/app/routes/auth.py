from sanic import Blueprint
from sanic.response import json
from sqlalchemy import select
from collections import deque
from time import time

from app.db import SessionLocal
from app.models import User
from app.security import hash_password, verify_password, create_token
from app.auth_guard import require_auth
from app.config import LOGIN_RATE_LIMIT_MAX_ATTEMPTS, LOGIN_RATE_LIMIT_WINDOW_SEC

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
            role=role
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)

        return json({
            "message": "user_created",
            "user_id": user.id
        })


@bp.post("/login")
async def login(request):
    data = request.json or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    rate_key = _login_rate_limit_key(request, email)

    if _is_rate_limited(rate_key):
        return json({
            "error": "too_many_attempts",
            "message": "Too many login attempts. Try again later."
        }, status=429)

    async with SessionLocal() as session:
        user = await session.scalar(select(User).where(User.email == email))
        if not user:
            _record_failed_attempt(rate_key)
            return json({"error": "invalid_credentials"}, status=401)

        if not verify_password(password, user.password_hash):
            _record_failed_attempt(rate_key)
            return json({"error": "invalid_credentials"}, status=401)

        _clear_failed_attempts(rate_key)
        token = create_token(user.id, user.role)

        return json({
            "token": token,
            "role": user.role,
            "user_id": user.id
        })
