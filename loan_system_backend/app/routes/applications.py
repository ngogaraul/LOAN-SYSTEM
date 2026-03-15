from sanic import Blueprint
from sanic.response import json
from sqlalchemy import select, desc, asc, or_
from datetime import datetime

from app.db import SessionLocal
from app.models import (
    LoanApplication,
    Client,
    ClientFinancial,
    CreditScore,
    Decision,
    User,
    CreditlineFinancial,
)
from app.auth_guard import require_auth

bp = Blueprint("applications", url_prefix="/applications")


def _slug_creditline_seed(value):
    text = "".join(ch for ch in str(value or "").upper() if ch.isalnum())
    return text[:16] or "CLIENT"


async def _generate_creditline(session, client):
    base = _slug_creditline_seed(getattr(client, "account", None) or getattr(client, "id", None))
    stamp = datetime.utcnow().strftime("%Y%m%d%H%M%S")

    for attempt in range(100):
        suffix = f"-{attempt}" if attempt else ""
        candidate = f"AUTO-{base}-{stamp}{suffix}"
        existing = await session.scalar(
            select(LoanApplication.id).where(LoanApplication.creditline == candidate).limit(1)
        )
        if not existing:
            return candidate

    raise RuntimeError("failed to generate unique creditline")


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
    counts = {}
    for v in vals:
        counts[v] = counts.get(v, 0) + 1
    return max(counts, key=counts.get)


def aggregate_creditlines(rows):
    if not rows:
        return None

    valid_dates = [r.start_date for r in rows if r.start_date]
    start_date = min(valid_dates) if valid_dates else ""

    return {
        "outstanding": sum(_to_float(r.outstanding) for r in rows),
        "payment_plan": sum(_to_float(r.payment_plan) for r in rows),
        "remaining_period": max(_to_float(r.remaining_period) for r in rows),
        "periodicity": _mode([r.periodicity for r in rows], 0.0),
        "class_value": _mode([r.class_value for r in rows], 0.0),
        "compulsory_saving": sum(_to_float(r.compulsory_saving) for r in rows),
        "voluntary_saving": sum(_to_float(r.voluntary_saving) for r in rows),
        "salary": max(_to_float(r.salary) for r in rows),
        "duration": max(_to_float(r.duration) for r in rows),
        "start_date": start_date,
    }


def _resolved_payment_plan(app_, linked_creditline=None, fin=None, creditlines=None):
    app_payment_plan = _to_float(getattr(app_, "payment_plan", None), 0.0)
    if app_payment_plan > 0:
        return app_payment_plan

    linked_payment_plan = _to_float(getattr(linked_creditline, "payment_plan", None), 0.0)
    if linked_payment_plan > 0:
        return linked_payment_plan

    fin_payment_plan = _to_float(getattr(fin, "payment_plan", None), 0.0)
    if fin_payment_plan > 0:
        return fin_payment_plan

    if creditlines:
        creditline_payment_plan = max((_to_float(row.payment_plan, 0.0) for row in creditlines), default=0.0)
        if creditline_payment_plan > 0:
            return creditline_payment_plan

    return None


@bp.post("/")
@require_auth(roles=["ADMIN", "ANALYST"])
async def create_application(request):
    data = request.json or {}
    client_id = data.get("client_id")
    creditline = (data.get("creditline") or "").strip()
    amount_requested = data.get("amount_requested", 0)
    payment_plan = data.get("payment_plan", 0)
    purpose = data.get("purpose", "")
    term_requested = data.get("term_requested", 0)

    if not client_id:
        return json({"error": "client_id is required"}, status=400)

    async with SessionLocal() as session:
        client = await session.get(Client, int(client_id))
        if not client:
            return json({"error": "client not found"}, status=404)

        client_creditlines = (await session.execute(
            select(CreditlineFinancial)
            .where(CreditlineFinancial.client_id == int(client_id))
            .order_by(desc(CreditlineFinancial.id))
        )).scalars().all()
        used_creditlines = set((await session.execute(
            select(LoanApplication.creditline)
            .where(LoanApplication.client_id == int(client_id))
        )).scalars().all())

        if not creditline:
            available_creditline = next(
                (
                    (row.creditline or "").strip()
                    for row in client_creditlines
                    if (row.creditline or "").strip() and (row.creditline or "").strip() not in used_creditlines
                ),
                "",
            )
            if available_creditline:
                creditline = available_creditline
            else:
                creditline = await _generate_creditline(session, client)
                new_creditline = CreditlineFinancial(client_id=int(client_id), creditline=creditline)
                session.add(new_creditline)
                client_creditlines = [new_creditline]

        existing = await session.scalar(
            select(LoanApplication).where(LoanApplication.creditline == creditline)
        )
        if existing:
            return json(
                {"error": "duplicate_creditline", "message": "Creditline already exists"},
                status=409,
            )

        matched_creditline = next(
            (row for row in client_creditlines if (row.creditline or "").strip() == creditline),
            None,
        )
        if not matched_creditline:
            session.add(CreditlineFinancial(client_id=int(client_id), creditline=creditline))

        app_ = LoanApplication(
            client_id=int(client_id),
            creditline=creditline,
            amount_requested=float(amount_requested),
            payment_plan=float(payment_plan or 0),
            purpose=str(purpose),
            term_requested=int(term_requested),
            status="SUBMITTED",
        )
        session.add(app_)
        await session.commit()
        await session.refresh(app_)

        return json({
            "application_id": app_.id,
            "client_id": app_.client_id,
            "creditline": app_.creditline,
            "payment_plan": app_.payment_plan,
            "status": app_.status,
        })


@bp.get("/")
@require_auth(roles=["ADMIN", "ANALYST"])
async def list_applications(request):
    status = (request.args.get("status") or "").strip().upper()
    sort = (request.args.get("sort") or "latest").strip().lower()
    search = (request.args.get("search") or "").strip()

    try:
        page = int(request.args.get("page") or 1)
        page_size = int(request.args.get("page_size") or 20)
    except ValueError:
        return json({"error": "page and page_size must be integers"}, status=400)

    page = max(page, 1)
    page_size = min(max(page_size, 1), 100)
    offset = (page - 1) * page_size

    async with SessionLocal() as session:
        q = select(LoanApplication, Client).join(Client, Client.id == LoanApplication.client_id)

        if status:
            q = q.where(LoanApplication.status == status)

        if search:
            if search.isdigit():
                sid = int(search)
                q = q.where(or_(
                    LoanApplication.id == sid,
                    LoanApplication.client_id == sid,
                    Client.id == sid,
                ))
            else:
                q = q.where(or_(
                    Client.account.ilike(f"%{search}%"),
                    Client.full_name.ilike(f"%{search}%"),
                    LoanApplication.creditline.ilike(f"%{search}%"),
                ))

        q = q.order_by(asc(LoanApplication.id) if sort == "oldest" else desc(LoanApplication.id))
        q = q.offset(offset).limit(page_size)

        rows = (await session.execute(q)).all()

        items = []
        for app_, client in rows:
            items.append({
                "id": app_.id,
                "client_id": app_.client_id,
                "creditline": app_.creditline,
                "client": {
                    "account": client.account,
                    "full_name": client.full_name,
                    "phone": client.phone,
                },
                "amount_requested": app_.amount_requested,
                "payment_plan": app_.payment_plan,
                "purpose": app_.purpose,
                "term_requested": app_.term_requested,
                "status": app_.status,
                "submitted_at": str(app_.submitted_at),
            })

        return json({
            "page": page,
            "page_size": page_size,
            "status_filter": status or None,
            "search": search or None,
            "items": items,
        })


@bp.get("/<app_id:int>")
@require_auth(roles=["ADMIN", "ANALYST"])
async def get_application(request, app_id: int):
    async with SessionLocal() as session:
        app_ = await session.get(LoanApplication, app_id)
        if not app_:
            return json({"error": "application not found"}, status=404)

        linked_creditline = await session.scalar(
            select(CreditlineFinancial)
            .where(CreditlineFinancial.client_id == app_.client_id)
            .where(CreditlineFinancial.creditline == app_.creditline)
            .order_by(desc(CreditlineFinancial.id))
            .limit(1)
        )
        fin = await session.scalar(
            select(ClientFinancial).where(ClientFinancial.client_id == app_.client_id)
        )
        creditlines = (await session.execute(
            select(CreditlineFinancial).where(CreditlineFinancial.client_id == app_.client_id)
        )).scalars().all()

        return json({
            "id": app_.id,
            "client_id": app_.client_id,
            "creditline": getattr(app_, "creditline", ""),
            "amount_requested": app_.amount_requested,
            "payment_plan": _resolved_payment_plan(app_, linked_creditline, fin, creditlines),
            "purpose": app_.purpose,
            "term_requested": app_.term_requested,
            "status": app_.status,
            "submitted_at": str(app_.submitted_at),
        })


@bp.get("/<app_id:int>/details")
@require_auth(roles=["ADMIN", "ANALYST"])
async def application_details(request, app_id: int):
    async with SessionLocal() as session:
        app_ = await session.get(LoanApplication, app_id)
        if not app_:
            return json({"error": "application not found"}, status=404)

        client = await session.get(Client, app_.client_id)

        fin = await session.scalar(
            select(ClientFinancial).where(ClientFinancial.client_id == app_.client_id)
        )

        creditlines = (await session.execute(
            select(CreditlineFinancial)
            .where(CreditlineFinancial.client_id == app_.client_id)
            .order_by(desc(CreditlineFinancial.id))
        )).scalars().all()
        linked_creditline = next(
            (row for row in creditlines if (row.creditline or "").strip() == (app_.creditline or "").strip()),
            None,
        )

        agg_fin = aggregate_creditlines(creditlines) if creditlines else None

        latest_score = await session.scalar(
            select(CreditScore)
            .where(CreditScore.application_id == app_id)
            .order_by(desc(CreditScore.scored_at))
            .limit(1)
        )

        decision_rows = (await session.execute(
            select(Decision)
            .where(Decision.application_id == app_id)
            .order_by(desc(Decision.decided_at))
        )).scalars().all()

        decisions = []
        for d in decision_rows:
            analyst = await session.get(User, d.analyst_id)
            decisions.append({
                "id": d.id,
                "final_decision": d.final_decision,
                "comment": d.comment,
                "analyst": None if not analyst else {
                    "id": analyst.id,
                    "name": analyst.name,
                    "email": analyst.email,
                },
                "decided_at": str(d.decided_at),
            })

        financial_payload = None
        if agg_fin:
            financial_payload = agg_fin
        elif fin:
            financial_payload = {
                "outstanding": fin.outstanding,
                "payment_plan": fin.payment_plan,
                "remaining_period": fin.remaining_period,
                "periodicity": fin.periodicity,
                "class_value": fin.class_value,
                "compulsory_saving": fin.compulsory_saving,
                "voluntary_saving": fin.voluntary_saving,
                "salary": fin.salary,
                "duration": fin.duration,
                "start_date": fin.start_date,
            }

        return json({
            "application": {
                "id": app_.id,
                "client_id": app_.client_id,
                "creditline": getattr(app_, "creditline", ""),
                "amount_requested": app_.amount_requested,
                "payment_plan": _resolved_payment_plan(app_, linked_creditline, fin, creditlines),
                "purpose": app_.purpose,
                "term_requested": app_.term_requested,
                "status": app_.status,
                "submitted_at": str(app_.submitted_at),
            },
            "client": None if not client else {
                "id": client.id,
                "account": client.account,
                "full_name": client.full_name,
                "phone": client.phone,
                "status": getattr(client, "status", "ACTIVE"),
            },
            "financials": financial_payload,
            "latest_score": None if not latest_score else {
                "probability_default": latest_score.probability_default,
                "credit_score": latest_score.credit_score,
                "risk_band": latest_score.risk_band,
                "decision_suggestion": latest_score.decision_suggestion,
                "top_factors": latest_score.top_factors,
                "model_version": latest_score.model_version,
                "scored_at": str(latest_score.scored_at),
            },
            "decisions": decisions,
        })


@bp.put("/<app_id:int>")
@require_auth(roles=["ADMIN", "ANALYST"])
async def update_application(request, app_id: int):
    data = request.json or {}

    async with SessionLocal() as session:
        app_ = await session.get(LoanApplication, app_id)
        if not app_:
            return json({"error": "application not found"}, status=404)

        if app_.status != "SUBMITTED":
            return json({
                "error": "cannot_edit",
                "message": "Only SUBMITTED applications can be edited.",
            }, status=409)

        if "amount_requested" in data:
            app_.amount_requested = float(data.get("amount_requested") or 0)

        if "payment_plan" in data:
            app_.payment_plan = float(data.get("payment_plan") or 0)

        if "purpose" in data:
            app_.purpose = str(data.get("purpose") or "")

        if "term_requested" in data:
            app_.term_requested = int(data.get("term_requested") or 0)

        if "creditline" in data:
            new_creditline = str(data.get("creditline") or "").strip()
            if not new_creditline:
                return json({"error": "creditline cannot be empty"}, status=400)

            existing = await session.scalar(
                select(LoanApplication)
                .where(LoanApplication.creditline == new_creditline)
                .where(LoanApplication.id != app_id)
            )
            if existing:
                return json({
                    "error": "duplicate_creditline",
                    "message": "Creditline already exists.",
                }, status=409)

            app_.creditline = new_creditline

        await session.commit()

        return json({"message": "application updated", "application_id": app_id})


@bp.delete("/<app_id:int>")
@require_auth(roles=["ADMIN", "ANALYST"])
async def delete_application(request, app_id: int):
    role = str((request.ctx.user or {}).get("role", "ANALYST")).strip().upper()

    async with SessionLocal() as session:
        app_ = await session.get(LoanApplication, app_id)
        if not app_:
            return json({"error": "application not found"}, status=404)

        if app_.status in {"APPROVED", "REJECTED"}:
            return json({
                "error": "cannot_delete_finalized",
                "message": "Cannot delete APPROVED/REJECTED applications.",
            }, status=409)

        if role == "ANALYST" and app_.status != "SUBMITTED":
            return json({
                "error": "forbidden",
                "message": "Analyst can only delete SUBMITTED applications.",
            }, status=403)

        if role == "ADMIN" and app_.status not in {"SUBMITTED", "SCORED"}:
            return json({
                "error": "cannot_delete",
                "message": "Admin can only delete SUBMITTED/SCORED applications.",
            }, status=409)

        scores = (await session.execute(
            select(CreditScore).where(CreditScore.application_id == app_id)
        )).scalars().all()
        for s in scores:
            await session.delete(s)

        decs = (await session.execute(
            select(Decision).where(Decision.application_id == app_id)
        )).scalars().all()
        for d in decs:
            await session.delete(d)

        await session.delete(app_)
        await session.commit()

        return json({"message": "application deleted", "application_id": app_id})
