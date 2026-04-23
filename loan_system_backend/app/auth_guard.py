from functools import wraps
from sanic.response import json
from sqlalchemy import select

from app.auth_service import auth_mode_uses_oidc, sync_user_from_claims
from app.db import SessionLocal
from app.models import User
from app.security import decode_token


def require_auth(roles=None):
    roles = roles or []

    def decorator(handler):
        @wraps(handler)
        async def wrapper(request, *args, **kwargs):
            auth_header = request.headers.get("Authorization", "")
            if not auth_header.startswith("Bearer "):
                return json({"error": "unauthorized"}, status=401)

            token = auth_header.split(" ")[1]

            try:
                payload = decode_token(token)
            except Exception:
                return json({"error": "invalid_token"}, status=401)

            user_id = payload.get("sub")
            role = str(payload.get("role", "")).strip().upper()

            if auth_mode_uses_oidc() and payload.get("iss"):
                async with SessionLocal() as session:
                    user = await sync_user_from_claims(session, payload)
                user_id = user.id
                role = str(user.role or "").strip().upper()
            elif user_id:
                async with SessionLocal() as session:
                    local_user = await session.scalar(select(User).where(User.id == int(user_id)))
                    if local_user:
                        role = str(local_user.role or role).strip().upper()

            request.ctx.user = {
                "id": int(user_id),
                "role": role
            }

            if roles and role not in roles:
                return json({"error": "forbidden"}, status=403)

            return await handler(request, *args, **kwargs)

        return wrapper

    return decorator
