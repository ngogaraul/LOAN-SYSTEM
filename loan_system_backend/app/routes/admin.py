from sanic import Blueprint
from sanic.response import json
from sqlalchemy import select

from app.db import SessionLocal
from app.models import User, Decision
from app.auth_guard import require_auth

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