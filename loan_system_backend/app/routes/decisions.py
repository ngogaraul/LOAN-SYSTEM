from sanic import Blueprint
from sanic.response import json
from sqlalchemy import select

from app.cache import invalidate_all_api_cache
from app.db import SessionLocal
from app.models import LoanApplication, Decision, CreditScore
from app.auth_guard import require_auth

bp = Blueprint("decisions", url_prefix="/applications")

VALID = {"APPROVE", "REJECT", "REVIEW"}

@bp.post("/<app_id:int>/decision")
@require_auth(roles=["ADMIN", "ANALYST"])
async def make_decision(request, app_id: int):
    data = request.json or {}
    final_decision = (data.get("final_decision") or "").upper()
    comment = (data.get("comment") or "").strip()

    if final_decision not in VALID:
        return json({"error": f"final_decision must be one of {sorted(list(VALID))}"}, status=400)

    user = request.ctx.user
    analyst_id = int(user["id"])
    role = user.get("role", "ANALYST")

    async with SessionLocal() as session:
        app_ = await session.get(LoanApplication, app_id)
        if not app_:
            return json({"error": "application not found"}, status=404)

        # ✅ MUST score first (model output required)
        score_id = await session.scalar(
            select(CreditScore.id).where(CreditScore.application_id == app_id).limit(1)
        )
        if not score_id:
            return json({
                "error": "application_not_scored",
                "message": "Score the application first: POST /applications/<id>/score"
            }, status=400)

        # ✅ If already finalized, only ADMIN can add decisions
        if app_.status in {"APPROVED", "REJECTED"} and role != "ADMIN":
            return json({
                "error": "forbidden",
                "message": "Application already finalized (APPROVED/REJECTED). Admin required to add more decisions."
            }, status=403)

        # Save decision row (audit)
        d = Decision(
            application_id=app_.id,
            analyst_id=analyst_id,
            final_decision=final_decision,
            comment=comment
        )
        session.add(d)

        # Update application status
        if final_decision == "APPROVE":
            app_.status = "APPROVED"
        elif final_decision == "REJECT":
            app_.status = "REJECTED"
        else:
            app_.status = "REVIEW"

        await session.commit()
        await invalidate_all_api_cache()

        return json({
            "application_id": app_.id,
            "status": app_.status,
            "decision": final_decision
        })
@bp.post("/<app_id:int>/override-decision")
@require_auth(roles=["ADMIN"])
async def override_decision(request, app_id: int):
    data = request.json or {}
    final_decision = (data.get("final_decision") or "").strip().upper()
    comment = (data.get("comment") or "").strip()
    override_reason = (data.get("override_reason") or "").strip()

    if final_decision not in VALID:
        return json({"error": f"final_decision must be one of {sorted(list(VALID))}"}, status=400)

    if not override_reason:
        return json({"error": "override_reason is required for admin override"}, status=400)

    admin_id = int(request.ctx.user["id"])

    async with SessionLocal() as session:
        app_ = await session.get(LoanApplication, app_id)
        if not app_:
            return json({"error": "application not found"}, status=404)

        # Must have been scored at least once (same as normal decision rule)
        score_id = await session.scalar(
            select(CreditScore.id).where(CreditScore.application_id == app_id).limit(1)
        )
        if not score_id:
            return json({
                "error": "application_not_scored",
                "message": "Score the application first before override."
            }, status=400)

        # Create decision row with override marker (audit)
        full_comment = f"OVERRIDE REASON: {override_reason}. " + (comment or "")

        d = Decision(
            application_id=app_.id,
            analyst_id=admin_id,
            final_decision=final_decision,
            comment=full_comment
        )
        session.add(d)

        # Update application status
        if final_decision == "APPROVE":
            app_.status = "APPROVED"
        elif final_decision == "REJECT":
            app_.status = "REJECTED"
        else:
            app_.status = "REVIEW"

        await session.commit()
        await invalidate_all_api_cache()

        return json({
            "application_id": app_.id,
            "status": app_.status,
            "decision": final_decision,
            "override": True
        })
