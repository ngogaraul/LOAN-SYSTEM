from sanic import Blueprint
from sanic.response import json
from sqlalchemy import select, desc, or_

from app.db import SessionLocal
from app.models import Client, ClientFinancial, LoanApplication, CreditlineFinancial
from app.auth_guard import require_auth

bp = Blueprint("clients", url_prefix="/clients")


def _to_float(v, default=None):
    if v is None:
        return default
    try:
        if isinstance(v, str):
            v = v.replace(",", "").strip()
        return float(v)
    except Exception:
        return default


def _role_upper(request):
    r = (getattr(request.ctx, "user", None) or {}).get("role", "")
    return str(r).strip().upper()


def _status_upper(v: str) -> str:
    return str(v or "").strip().upper()


@bp.post("/")
@require_auth(roles=["ADMIN", "ANALYST"])
async def create_client(request):
    data = request.json or {}
    account = (data.get("account") or "").strip()
    full_name = (data.get("full_name") or "").strip()
    phone = (data.get("phone") or "").strip()
    status = _status_upper(data.get("status") or "ACTIVE")

    if status not in {"ACTIVE", "SUSPENDED", "CLOSED"}:
        status = "ACTIVE"

    if not account:
        return json({"error": "account is required"}, status=400)

    async with SessionLocal() as session:
        existing = await session.scalar(select(Client).where(Client.account == account))
        if existing:
            return json({"error": "client already exists", "client_id": existing.id}, status=409)

        client = Client(
            account=account,
            full_name=full_name,
            phone=phone,
            status=status
        )
        session.add(client)
        await session.commit()
        await session.refresh(client)

        fin = ClientFinancial(client_id=client.id)
        session.add(fin)
        await session.commit()

        return json({
            "client_id": client.id,
            "account": client.account,
            "status": client.status
        })


@bp.get("/")
@require_auth(roles=["ADMIN", "ANALYST"])
async def search_clients(request):
    q = (request.args.get("search") or "").strip()
    status = _status_upper(request.args.get("status") or "")

    try:
        page = int(request.args.get("page") or 1)
        page_size = int(request.args.get("page_size") or 10)
    except ValueError:
        return json({"error": "page and page_size must be integers"}, status=400)

    if page < 1:
        page = 1
    if page_size < 1:
        page_size = 10
    if page_size > 100:
        page_size = 100

    offset = (page - 1) * page_size

    async with SessionLocal() as session:
        stmt = select(Client)

        if status:
            stmt = stmt.where(Client.status == status)

        if q:
            stmt = stmt.where(
                or_(
                    Client.account.ilike(f"%{q}%"),
                    Client.full_name.ilike(f"%{q}%")
                )
            )

        total_stmt = select(Client)

        if status:
            total_stmt = total_stmt.where(Client.status == status)

        if q:
            total_stmt = total_stmt.where(
                or_(
                    Client.account.ilike(f"%{q}%"),
                    Client.full_name.ilike(f"%{q}%")
                )
            )

        total_rows = (await session.execute(total_stmt)).scalars().all()
        total = len(total_rows)

        rows = (
            await session.execute(
                stmt.order_by(Client.id.desc()).offset(offset).limit(page_size)
            )
        ).scalars().all()

        return json({
            "page": page,
            "page_size": page_size,
            "total": total,
            "items": [
                {
                    "id": c.id,
                    "account": c.account,
                    "full_name": c.full_name,
                    "phone": c.phone,
                    "status": getattr(c, "status", "ACTIVE")
                }
                for c in rows
            ]
        })


@bp.get("/<client_id:int>")
@require_auth(roles=["ADMIN", "ANALYST"])
async def get_client(request, client_id: int):
    async with SessionLocal() as session:
        client = await session.get(Client, client_id)
        if not client:
            return json({"error": "client not found"}, status=404)

        fin = await session.scalar(select(ClientFinancial).where(ClientFinancial.client_id == client_id))

        return json({
            "id": client.id,
            "account": client.account,
            "full_name": client.full_name,
            "phone": client.phone,
            "status": getattr(client, "status", "ACTIVE"),
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
            }
        })


@bp.put("/<client_id:int>")
@require_auth(roles=["ADMIN", "ANALYST"])
async def update_client(request, client_id: int):
    data = request.json or {}
    full_name = data.get("full_name")
    phone = data.get("phone")

    async with SessionLocal() as session:
        client = await session.get(Client, client_id)
        if not client:
            return json({"error": "client not found"}, status=404)

        if full_name is not None:
            client.full_name = str(full_name).strip()

        if phone is not None:
            client.phone = str(phone).strip()

        await session.commit()

        return json({
            "message": "client updated",
            "client": {
                "id": client.id,
                "account": client.account,
                "full_name": client.full_name,
                "phone": client.phone,
                "status": getattr(client, "status", "ACTIVE")
            }
        })


@bp.put("/<client_id:int>/financials")
@require_auth(roles=["ADMIN", "ANALYST"])
async def update_financials(request, client_id: int):
    data = request.json or {}

    async with SessionLocal() as session:
        client = await session.get(Client, client_id)
        if not client:
            return json({"error": "client not found"}, status=404)

        fin = await session.scalar(select(ClientFinancial).where(ClientFinancial.client_id == client_id))
        if not fin:
            fin = ClientFinancial(client_id=client_id)
            session.add(fin)

        if "outstanding" in data:
            fin.outstanding = _to_float(data.get("outstanding"), fin.outstanding) or 0
        if "payment_plan" in data:
            fin.payment_plan = _to_float(data.get("payment_plan"), fin.payment_plan) or 0
        if "remaining_period" in data:
            fin.remaining_period = _to_float(data.get("remaining_period"), fin.remaining_period) or 0
        if "periodicity" in data:
            fin.periodicity = _to_float(data.get("periodicity"), fin.periodicity) or 0
        if "class_value" in data:
            fin.class_value = _to_float(data.get("class_value"), fin.class_value) or 0
        if "compulsory_saving" in data:
            fin.compulsory_saving = _to_float(data.get("compulsory_saving"), fin.compulsory_saving) or 0
        if "voluntary_saving" in data:
            fin.voluntary_saving = _to_float(data.get("voluntary_saving"), fin.voluntary_saving) or 0
        if "salary" in data:
            fin.salary = _to_float(data.get("salary"), fin.salary) or 0
        if "duration" in data:
            fin.duration = _to_float(data.get("duration"), fin.duration) or 0
        if "start_date" in data:
            fin.start_date = str(data.get("start_date") or "").strip()

        await session.commit()

        return json({
            "message": "financials updated",
            "client_id": client_id,
            "financials": {
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
            }
        })


@bp.patch("/<client_id:int>/status")
@require_auth(roles=["ADMIN"])
async def change_client_status(request, client_id: int):
    data = request.json or {}
    new_status = _status_upper(data.get("status"))

    if new_status not in {"ACTIVE", "SUSPENDED", "CLOSED"}:
        return json({
            "error": "invalid_status",
            "message": "status must be ACTIVE, SUSPENDED, or CLOSED"
        }, status=400)

    async with SessionLocal() as session:
        client = await session.get(Client, client_id)
        if not client:
            return json({"error": "client not found"}, status=404)

        client.status = new_status
        await session.commit()

        return json({
            "message": "client status updated",
            "client_id": client_id,
            "status": client.status
        })


@bp.delete("/<client_id:int>")
@require_auth(roles=["ADMIN"])
async def delete_client(request, client_id: int):
    async with SessionLocal() as session:
        client = await session.get(Client, client_id)
        if not client:
            return json({"error": "client not found"}, status=404)

        has_app = await session.scalar(
            select(LoanApplication.id).where(LoanApplication.client_id == client_id).limit(1)
        )
        if has_app:
            return json({
                "error": "cannot_delete",
                "message": "Client has loan applications. Delete applications first or disable client instead."
            }, status=409)

        fin = await session.scalar(select(ClientFinancial).where(ClientFinancial.client_id == client_id))
        if fin:
            await session.delete(fin)

        creditlines = (await session.execute(
            select(CreditlineFinancial).where(CreditlineFinancial.client_id == client_id)
        )).scalars().all()
        for r in creditlines:
            await session.delete(r)

        await session.delete(client)
        await session.commit()

        return json({"message": "client deleted", "client_id": client_id})


@bp.get("/<client_id:int>/creditlines")
@require_auth(roles=["ADMIN", "ANALYST"])
async def list_client_creditlines(request, client_id: int):
    async with SessionLocal() as session:
        rows = (await session.execute(
            select(CreditlineFinancial)
            .where(CreditlineFinancial.client_id == client_id)
            .order_by(desc(CreditlineFinancial.id))
        )).scalars().all()

        linked_apps = (await session.execute(
            select(LoanApplication.id, LoanApplication.creditline)
            .where(LoanApplication.client_id == client_id)
        )).all()
        linked_by_creditline = {
            str(creditline or "").strip(): app_id
            for app_id, creditline in linked_apps
            if str(creditline or "").strip()
        }

        return json([{
            "id": r.id,
            "creditline": r.creditline,
            "application_id": linked_by_creditline.get(str(r.creditline or "").strip()),
            "is_available": str(r.creditline or "").strip() not in linked_by_creditline,
            "outstanding": r.outstanding,
            "payment_plan": r.payment_plan,
            "remaining_period": r.remaining_period,
            "periodicity": r.periodicity,
            "class_value": r.class_value,
            "compulsory_saving": r.compulsory_saving,
            "voluntary_saving": r.voluntary_saving,
            "salary": r.salary,
            "duration": r.duration,
            "start_date": r.start_date,
            "days_in_arrears": r.days_in_arrears,
            "principal_arrears": r.principal_arrears,
            "interest_arrears": r.interest_arrears,
        } for r in rows])
