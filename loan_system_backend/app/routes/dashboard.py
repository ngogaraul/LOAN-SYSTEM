from sanic import Blueprint
from sanic.response import json
from sqlalchemy import select, func, desc

from app.cache import api_cache
from app.config import API_CACHE_TTL_SEC
from app.db import SessionLocal
from app.auth_guard import require_auth
from app.models import LoanApplication, CreditScore

bp = Blueprint("dashboard", url_prefix="/dashboard")


@bp.get("/")
@require_auth(roles=["ADMIN", "ANALYST"])
async def dashboard(request):
    cache_key = "dashboard:summary"
    cached = await api_cache.get(cache_key)
    if cached is not None:
        return json(cached)

    async with SessionLocal() as session:
        # Counts by status
        status_rows = (await session.execute(
            select(LoanApplication.status, func.count(LoanApplication.id))
            .group_by(LoanApplication.status)
        )).all()

        status_counts = {s: int(c) for s, c in status_rows}

        # Recent applications
        recent = (await session.execute(
            select(LoanApplication)
            .order_by(desc(LoanApplication.id))
            .limit(10)
        )).scalars().all()

        recent_list = [{
            "id": a.id,
            "client_id": a.client_id,
            "amount_requested": a.amount_requested,
            "purpose": a.purpose,
            "term_requested": a.term_requested,
            "status": a.status,
            "submitted_at": str(a.submitted_at)
        } for a in recent]

        latest_score_sq = (
            select(
                CreditScore.application_id.label("application_id"),
                func.max(CreditScore.scored_at).label("latest_scored_at"),
            )
            .group_by(CreditScore.application_id)
            .subquery()
        )
        band_rows = (await session.execute(
            select(CreditScore.risk_band, func.count(CreditScore.id))
            .join(
                latest_score_sq,
                (CreditScore.application_id == latest_score_sq.c.application_id)
                & (CreditScore.scored_at == latest_score_sq.c.latest_scored_at),
            )
            .group_by(CreditScore.risk_band)
        )).all()

        risk_band_counts = {b: int(c) for b, c in band_rows if b is not None}

        payload = {
            "status_counts": status_counts,
            "risk_band_counts": risk_band_counts,
            "recent_applications": recent_list
        }
        await api_cache.set(cache_key, payload, ttl_seconds=API_CACHE_TTL_SEC)
        return json(payload)
