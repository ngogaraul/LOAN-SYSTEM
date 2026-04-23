from __future__ import annotations

from typing import Any

import pandas as pd
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.http_client import call_scoring_api
from app.models import Client, CreditScore, CreditlineFinancial, LoanApplication
from app.utils import payload_signature


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


def _normalized_start_date(value) -> str:
    parsed = pd.to_datetime(value, errors="coerce")
    if pd.isna(parsed):
        return ""
    return parsed.strftime("%Y-%m-%d")


def build_model_records(account: str, rows: list[CreditlineFinancial]) -> list[dict]:
    records = []
    for row in rows:
        creditline = str(row.creditline or "").strip()
        start_date = _normalized_start_date(row.start_date)
        payment_plan = _to_float(row.payment_plan)
        duration = int(_to_float(row.duration, 0))
        remaining_period = int(_to_float(row.remaining_period, 0))
        if (
            not creditline
            or not start_date
            or payment_plan <= 0
            or duration <= 0
            or remaining_period < 0
            or remaining_period > duration
        ):
            continue

        records.append({
            "Account": str(account),
            "Creditline": creditline,
            "Outstanding": _to_float(row.outstanding),
            "Payment plan": payment_plan,
            "Start date": start_date,
            "Duration": duration,
            "Remaining Period": remaining_period,
            "Periodicity": max(int(_to_float(row.periodicity, 0)), 0),
            "Compulsory saving": _to_float(row.compulsory_saving),
            "Voluntary saving": _to_float(row.voluntary_saving),
            "Salary": _to_float(row.salary),
        })
    return records


def _decision_from_flag(risk_flag: str) -> str:
    flag = str(risk_flag or "").strip().upper()
    if flag == "PASS":
        return "APPROVE"
    if flag in {"REVIEW", "CAUTION"}:
        return "REVIEW"
    return "REJECT"


def _probability_default(probabilities: dict[str, Any]) -> float:
    probabilities = probabilities or {}
    return float(probabilities.get("High Risk", 0.0)) + (float(probabilities.get("Medium Risk", 0.0)) * 0.5)


def _pick_application_result(app_creditline: str, results: list[dict]) -> tuple[dict | None, str]:
    normalized_creditline = str(app_creditline or "").strip()
    direct_match = next(
        (item for item in results if str(item.get("creditline") or "").strip() == normalized_creditline),
        None,
    )
    if direct_match:
        return direct_match, "creditline_match"

    if not results:
        return None, "no_results"

    riskiest = max(
        results,
        key=lambda item: _probability_default(item.get("probabilities") or {}),
    )
    return riskiest, "client_riskiest_creditline"


async def mark_client_applications_stale(session: AsyncSession, client_id: int) -> None:
    applications = (await session.execute(
        select(LoanApplication).where(LoanApplication.client_id == client_id)
    )).scalars().all()
    for app_ in applications:
        if app_.status not in {"APPROVED", "REJECTED"}:
            app_.score_stale = True


async def score_application_by_id(
    session: AsyncSession,
    app_id: int,
    *,
    force: bool = False,
) -> tuple[int, dict[str, Any]]:
    app_ = await session.get(LoanApplication, app_id)
    if not app_:
        return 404, {"error": "application not found"}

    client = await session.get(Client, app_.client_id)
    if not client:
        return 404, {"error": "client not found"}

    if app_.status in {"APPROVED", "REJECTED"}:
        return 409, {
            "error": "already_finalized",
            "message": f"Application is already {app_.status}. Admin override required to re-score."
        }

    creditlines = (await session.execute(
        select(CreditlineFinancial)
        .where(CreditlineFinancial.client_id == app_.client_id)
        .order_by(desc(CreditlineFinancial.id))
    )).scalars().all()

    if not creditlines:
        return 404, {
            "error": "no_creditlines",
            "message": "No creditline financials found for this client."
        }

    payload = {"records": build_model_records(client.account, creditlines)}
    if not payload["records"]:
        return 400, {
            "error": "invalid_creditlines",
            "message": "No creditline records with valid dates are available for scoring."
        }

    sig = payload_signature(payload)

    latest_score = await session.scalar(
        select(CreditScore)
        .where(CreditScore.application_id == app_id)
        .order_by(desc(CreditScore.scored_at))
        .limit(1)
    )

    if latest_score and not force:
        meta = {}
        if isinstance(latest_score.top_factors, dict):
            meta = (latest_score.top_factors or {}).get("_meta", {}) or {}

        if meta.get("payload_sig") == sig:
            app_.status = "SCORED"
            app_.score_stale = False
            await session.commit()
            return 200, {
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
            }

    try:
        result = await call_scoring_api(payload)
    except Exception as exc:
        return 502, {
            "error": "scoring_service_failed",
            "message": str(exc),
        }

    results = result.get("results") or []
    matched, selection_strategy = _pick_application_result(app_.creditline, results)
    if not matched:
        return 502, {
            "error": "scoring_result_missing",
            "message": "Scoring API did not return any usable result for this client."
        }

    probabilities = matched.get("probabilities") or {}
    score_payload = {
        "probability_default": _probability_default(probabilities),
        "credit_score": int(matched["fico_like_score"]),
        "risk_band": str(matched["score_band"]),
        "decision": _decision_from_flag(str(matched.get("risk_flag") or "")),
        "top_factors": matched.get("top_factors") or [],
        "predicted_target": str(matched.get("predicted_target") or ""),
        "risk_flag": str(matched.get("risk_flag") or ""),
    }

    stored_top_factors = {
        "factors": score_payload["top_factors"],
        "_meta": {
            "payload_sig": sig,
            "predicted_target": score_payload["predicted_target"],
            "risk_flag": score_payload["risk_flag"],
            "selection_strategy": selection_strategy,
            "source_creditline": str(matched.get("creditline") or ""),
        }
    }

    cs = CreditScore(
        application_id=app_.id,
        probability_default=float(score_payload["probability_default"]),
        credit_score=int(score_payload["credit_score"]),
        risk_band=str(score_payload["risk_band"]),
        decision_suggestion=str(score_payload["decision"]),
        top_factors=stored_top_factors,
        model_version="model-20260422"
    )
    session.add(cs)

    app_.status = "SCORED"
    app_.score_stale = False

    await session.commit()

    return 200, {
        "application_id": app_.id,
        "status": app_.status,
        "cached": False,
        "score": score_payload,
    }


async def score_stale_applications(session: AsyncSession, batch_size: int) -> dict[str, int]:
    candidates = (await session.execute(
        select(LoanApplication)
        .where(LoanApplication.score_stale.is_(True))
        .where(LoanApplication.status.in_(["SUBMITTED", "SCORED", "REVIEW"]))
        .order_by(LoanApplication.id.asc())
        .limit(batch_size)
    )).scalars().all()

    processed = 0
    failed = 0
    for app_ in candidates:
        status, _payload = await score_application_by_id(session, app_.id, force=False)
        processed += 1
        if status != 200:
            failed += 1
            app_.score_stale = True
            await session.commit()

    return {"processed": processed, "failed": failed}
