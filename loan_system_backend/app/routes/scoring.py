from sanic import Blueprint
from sanic.response import json
from app.cache import invalidate_all_api_cache

from app.auth_guard import require_auth
from app.db import SessionLocal
from app.score_service import score_application_by_id

bp = Blueprint("scoring", url_prefix="/applications")


@bp.post("/<app_id:int>/score")
@require_auth(roles=["ADMIN", "ANALYST"])
async def score_application(request, app_id: int):
    async with SessionLocal() as session:
        status, payload = await score_application_by_id(session, app_id)
        if status == 200:
            await invalidate_all_api_cache()
        return json(payload, status=status)
