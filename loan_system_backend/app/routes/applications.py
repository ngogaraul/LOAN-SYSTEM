from sanic import Blueprint
from sanic.response import json
from sqlalchemy import select, desc, asc, or_

from app.db import SessionLocal
from app.models import (
    LoanApplication,
    Client,
    ClientFinancial,
    CreditScore,
    Decision,
    User,
)
from app.auth_guard import require_auth

bp = Blueprint("applications", url_prefix="/applications")


@bp.post("/")
@require_auth(roles=["ADMIN", "ANALYST"])
async def create_application(request):
    data = request.json or {}
    client_id = data.get("client_id")

    # ✅ NEW
    creditline = (data.get("creditline") or "").strip()

    amount_requested = data.get("amount_requested", 0)
    purpose = data.get("purpose", "")
    term_requested = data.get("term_requested", 0)

    if not client_id:
        return json({"error": "client_id is required"}, status=400)

    if not creditline:
        return json({"error": "creditline is required"}, status=400)

    async with SessionLocal() as session:
        client = await session.get(Client, int(client_id))
        if not client:
            return json({"error": "client not found"}, status=404)

        # prevent duplicate creditline cleanly
        existing = await session.scalar(select(LoanApplication).where(LoanApplication.creditline == creditline))
        if existing:
            return json({"error": "duplicate_creditline", "message": "Creditline already exists"}, status=409)

        app_ = LoanApplication(
            client_id=int(client_id),
            creditline=creditline,
            amount_requested=float(amount_requested),
            purpose=str(purpose),
            term_requested=int(term_requested),
            status="SUBMITTED"
        )
        session.add(app_)
        await session.commit()
        await session.refresh(app_)

        return json({
            "application_id": app_.id,
            "client_id": app_.client_id,
            "creditline": app_.creditline,
            "status": app_.status
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
                    Client.id == sid
                ))
            else:
                q = q.where(or_(
                    Client.account.ilike(f"%{search}%"),
                    Client.full_name.ilike(f"%{search}%"),
                    LoanApplication.creditline.ilike(f"%{search}%")
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
                    "phone": client.phone
                },
                "amount_requested": app_.amount_requested,
                "purpose": app_.purpose,
                "term_requested": app_.term_requested,
                "status": app_.status,
                "submitted_at": str(app_.submitted_at)
            })

        return json({
            "page": page,
            "page_size": page_size,
            "status_filter": status or None,
            "search": search or None,
            "items": items
        })


@bp.get("/<app_id:int>/details")
@require_auth(roles=["ADMIN", "ANALYST"])
async def application_details(request, app_id: int):
    async with SessionLocal() as session:
        app_ = await session.get(LoanApplication, app_id)
        if not app_:
            return json({"error": "application not found"}, status=404)

        client = await session.get(Client, app_.client_id)
        fin = await session.scalar(select(ClientFinancial).where(ClientFinancial.client_id == app_.client_id))

        latest_score = await session.scalar(
            select(CreditScore)
            .where(CreditScore.application_id == app_id)
            .order_by(desc(CreditScore.scored_at))
            .limit(1)
        )

        decision_rows = (await session.execute(
            select(Decision).where(Decision.application_id == app_id).order_by(desc(Decision.decided_at))
        )).scalars().all()

        decisions = []
        for d in decision_rows:
            analyst = await session.get(User, d.analyst_id)
            decisions.append({
                "id": d.id,
                "final_decision": d.final_decision,
                "comment": d.comment,
                "analyst": None if not analyst else {"id": analyst.id, "name": analyst.name, "email": analyst.email},
                "decided_at": str(d.decided_at)
            })

        return json({
            "application": {
                "id": app_.id,
                "client_id": app_.client_id,
                "creditline": app_.creditline,
                "amount_requested": app_.amount_requested,
                "purpose": app_.purpose,
                "term_requested": app_.term_requested,
                "status": app_.status,
                "submitted_at": str(app_.submitted_at)
            },
            "client": None if not client else {
                "id": client.id,
                "account": client.account,
                "full_name": client.full_name,
                "phone": client.phone
            },
            "financials": None if not fin else {
                "outstanding": fin.outstanding,
                "payment_plan": fin.payment_plan,
                "remaining_period": fin.remaining_period,
                "periodicity": fin.periodicity,
                "class_value": fin.class_value,
                "compulsory_saving": fin.compulsory_saving,
                "voluntary_saving": fin.voluntary_saving,
                "salary": fin.salary,
                "duration": fin.duration,
                "start_date": fin.start_date
            },
            "latest_score": None if not latest_score else {
                "probability_default": latest_score.probability_default,
                "credit_score": latest_score.credit_score,
                "risk_band": latest_score.risk_band,
                "decision_suggestion": latest_score.decision_suggestion,
                "top_factors": latest_score.top_factors,
                "model_version": latest_score.model_version,
                "scored_at": str(latest_score.scored_at)
            },
            "decisions": decisions
        })