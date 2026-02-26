from sanic import Blueprint
from sanic.response import json
from sqlalchemy import select

from app.db import SessionLocal
from app.models import Client, ClientFinancial, LoanApplication
from app.auth_guard import require_auth
from app.models import CreditlineFinancial
from sqlalchemy import desc

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
    # request.ctx.user expected like {"id":..., "role":...}
    r = (getattr(request.ctx, "user", None) or {}).get("role", "")
    return str(r).strip().upper()


@bp.post("/")
@require_auth(roles=["ADMIN", "ANALYST"])
async def create_client(request):
    data = request.json or {}
    account = (data.get("account") or "").strip()
    full_name = (data.get("full_name") or "").strip()
    phone = (data.get("phone") or "").strip()

    if not account:
        return json({"error": "account is required"}, status=400)

    async with SessionLocal() as session:
        existing = await session.scalar(select(Client).where(Client.account == account))
        if existing:
            return json({"error": "client already exists", "client_id": existing.id}, status=409)

        client = Client(account=account, full_name=full_name, phone=phone)
        session.add(client)
        await session.commit()
        await session.refresh(client)

        fin = ClientFinancial(client_id=client.id)
        session.add(fin)
        await session.commit()

        return json({"client_id": client.id, "account": client.account})


@bp.get("/")
@require_auth(roles=["ADMIN", "ANALYST"])
async def search_clients(request):
    q = (request.args.get("search") or "").strip()

    async with SessionLocal() as session:
        if not q:
            rows = (await session.execute(select(Client).order_by(Client.id.desc()).limit(50))).scalars().all()
        else:
            rows = (await session.execute(
                select(Client)
                .where((Client.account.ilike(f"%{q}%")) | (Client.full_name.ilike(f"%{q}%")))
                .order_by(Client.id.desc())
                .limit(50)
            )).scalars().all()

        return json([{
            "id": c.id,
            "account": c.account,
            "full_name": c.full_name,
            "phone": c.phone
        } for c in rows])


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


# ✅ NEW: edit client profile (name/phone/account if you want)
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
                "phone": client.phone
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


# ✅ NEW: delete client (ADMIN only)
@bp.delete("/<client_id:int>")
@require_auth(roles=["ADMIN"])
async def delete_client(request, client_id: int):
    async with SessionLocal() as session:
        client = await session.get(Client, client_id)
        if not client:
            return json({"error": "client not found"}, status=404)

        # safety: don’t allow deleting a client with applications
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

        return json([{
            "id": r.id,
            "creditline": r.creditline,
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