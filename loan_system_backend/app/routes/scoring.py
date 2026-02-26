from sanic import Blueprint
from sanic.response import json
from sqlalchemy import select, desc

import pandas as pd

from app.db import SessionLocal
from app.models import LoanApplication, CreditScore, CreditlineFinancial
from app.http_client import call_scoring_api
from app.auth_guard import require_auth
from app.utils import payload_signature

bp = Blueprint("scoring", url_prefix="/applications")


# =========================
# Helpers
# =========================
def _to_float(x, default=0.0):
    try:
        if x is None:
            return default
        if isinstance(x, str):
            x = x.replace(",", "").strip()
        if x == "":
            return default
        return float(x)
    except Exception:
        return default


def _mode(values, default=0.0):
    vals = [v for v in values if v is not None]
    if not vals:
        return default
    s = pd.Series(vals)
    m = s.mode()
    if len(m) == 0:
        return default
    return float(m.iloc[0])


def aggregate_creditlines(rows: list[CreditlineFinancial]) -> dict:
    """
    Aggregate multiple creditlines into ONE row
    matching ML model expected features.
    """

    if not rows:
        return {}

    # handle dates safely
    dates = []
    for r in rows:
        d = pd.to_datetime(r.start_date, errors="coerce")
        if not pd.isna(d):
            dates.append(d)

    start_date = min(dates).strftime("%Y-%m-%d") if dates else ""

    return {
        # These keys MUST match your ML model training columns
        "Outstanding": sum(_to_float(r.outstanding) for r in rows),
        "Payment plan": sum(_to_float(r.payment_plan) for r in rows),
        "Remaining Period": max(_to_float(r.remaining_period) for r in rows),
        "Periodicity": _mode([r.periodicity for r in rows], 0.0),
        "Class": _mode([r.class_value for r in rows], 0.0),
        "Compulsory saving": sum(_to_float(r.compulsory_saving) for r in rows),
        "Voluntary saving": sum(_to_float(r.voluntary_saving) for r in rows),
        "Salary": max(_to_float(r.salary) for r in rows),
        " Duration": max(_to_float(r.duration) for r in rows),
        "Start date": start_date
    }


# =========================
# Score Application
# =========================
@bp.post("/<app_id:int>/score")
@require_auth(roles=["ADMIN", "ANALYST"])
async def score_application(request, app_id: int):

    async with SessionLocal() as session:
        app_ = await session.get(LoanApplication, app_id)
        if not app_:
            return json({"error": "application not found"}, status=404)

        # Block finalized apps
        if app_.status in {"APPROVED", "REJECTED"}:
            return json({
                "error": "already_finalized",
                "message": f"Application is already {app_.status}. Admin override required to re-score."
            }, status=409)

        # 🔥 NEW: fetch ALL creditlines for this client
        creditlines = (await session.execute(
            select(CreditlineFinancial)
            .where(CreditlineFinancial.client_id == app_.client_id)
        )).scalars().all()

        if not creditlines:
            return json({
                "error": "no_creditlines",
                "message": "No creditline financials found for this client."
            }, status=404)

        # 🔥 Aggregate them
        payload = aggregate_creditlines(creditlines)

        sig = payload_signature(payload)

        # Check latest existing score for this application
        latest_score = await session.scalar(
            select(CreditScore)
            .where(CreditScore.application_id == app_id)
            .order_by(desc(CreditScore.scored_at))
            .limit(1)
        )

        if latest_score:
            meta = {}
            if isinstance(latest_score.top_factors, dict):
                meta = (latest_score.top_factors or {}).get("_meta", {}) or {}

            if meta.get("payload_sig") == sig:
                return json({
                    "application_id": app_.id,
                    "status": app_.status,
                    "cached": True,
                    "score": {
                        "probability_default": latest_score.probability_default,
                        "credit_score": latest_score.credit_score,
                        "risk_band": latest_score.risk_band,
                        "decision": latest_score.decision_suggestion,
                        "top_factors": (latest_score.top_factors or {}).get("factors", latest_score.top_factors)
                    }
                })

        # Call ML scoring API
        try:
            result = await call_scoring_api(payload)
        except Exception as e:
            return json({
                "error": "scoring_service_failed",
                "message": str(e)
            }, status=502)

        stored_top_factors = {
            "factors": result.get("top_factors", []),
            "_meta": {
                "payload_sig": sig
            }
        }

        cs = CreditScore(
            application_id=app_.id,
            probability_default=float(result["probability_default"]),
            credit_score=int(result["credit_score"]),
            risk_band=str(result["risk_band"]),
            decision_suggestion=str(result["decision"]),
            top_factors=stored_top_factors,
            model_version="v1"
        )
        session.add(cs)

        app_.status = "SCORED"

        await session.commit()

        return json({
            "application_id": app_.id,
            "status": app_.status,
            "cached": False,
            "score": result
        })