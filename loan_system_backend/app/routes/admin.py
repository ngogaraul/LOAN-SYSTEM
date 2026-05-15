from sanic import Blueprint
from sanic.response import json
from sqlalchemy import select

from app.auth_service import auth_mode_uses_external
from app.db import SessionLocal
from app.models import User, Decision
from app.auth_guard import require_auth
from app.security import hash_password

bp = Blueprint("admin", url_prefix="/admin")


@bp.get("/me")
@require_auth(roles=["ADMIN", "ANALYST"])
async def me(request):
    # Provided by require_auth
    return json({"user": request.ctx.user})


@bp.get("/users")
@require_auth(roles=["ADMIN"])
async def list_users(request):
    async with SessionLocal() as session:
        rows = (await session.execute(select(User).order_by(User.id.desc()))).scalars().all()
        return json([
            {
                "id": u.id,
                "name": u.name,
                "email": u.email,
                "role": u.role,
                "auth_source": "external" if u.external_subject else "legacy",
                "created_at": str(u.created_at),
            }
            for u in rows
        ])


@bp.delete("/users/<user_id:int>")
@require_auth(roles=["ADMIN"])
async def delete_user(request, user_id: int):
    async with SessionLocal() as session:
        u = await session.get(User, user_id)
        if not u:
            return json({"error": "user_not_found"}, status=404)

        if int(request.ctx.user["id"]) == int(user_id):
            return json({
                "error": "cannot_delete_self",
                "message": "You cannot delete the account you are currently using.",
            }, status=409)

        if auth_mode_uses_external() and u.external_subject:
            return json({
                "error": "external_auth_managed",
                "message": "Delete this user from the external identity provider instead.",
            }, status=409)

        # prevent FK restrict error (decisions.analyst_id -> users.id)
        ref = await session.scalar(
            select(Decision.id).where(Decision.analyst_id == user_id).limit(1)
        )
        if ref:
            return json({
                "error": "cannot_delete",
                "message": "User is referenced by decisions. Remove decisions first or implement soft-disable."
            }, status=409)

        await session.delete(u)
        await session.commit()

        return json({"message": "user_deleted", "user_id": user_id})


@bp.put("/users/<user_id:int>")
@require_auth(roles=["ADMIN"])
async def update_user(request, user_id: int):
    data = request.json or {}
    name = str(data.get("name") or "").strip()
    email = str(data.get("email") or "").strip().lower()
    role = str(data.get("role") or "").strip().upper()
    password = str(data.get("password") or "")

    if not name or not email or role not in {"ADMIN", "ANALYST"}:
        return json({
            "error": "invalid_payload",
            "message": "name, email, and a valid role are required.",
        }, status=400)

    async with SessionLocal() as session:
        u = await session.get(User, user_id)
        if not u:
            return json({"error": "user_not_found"}, status=404)

        if auth_mode_uses_external() and u.external_subject:
            return json({
                "error": "external_auth_managed",
                "message": "Edit this user from the external identity provider instead.",
            }, status=409)

        existing = await session.scalar(select(User).where(User.email == email))
        if existing and int(existing.id) != int(user_id):
            return json({
                "error": "email_exists",
                "message": "Another user already uses that email address.",
            }, status=409)

        u.name = name
        u.email = email
        u.role = role
        if password.strip():
            u.password_hash = hash_password(password)

        await session.commit()
        await session.refresh(u)

        return json({
            "message": "user_updated",
            "user": {
                "id": u.id,
                "name": u.name,
                "email": u.email,
                "role": u.role,
                "auth_source": "external" if u.external_subject else "legacy",
                "created_at": str(u.created_at),
            },
        })
