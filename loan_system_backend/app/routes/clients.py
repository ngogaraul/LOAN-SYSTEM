from sanic import Blueprint
from sanic.response import json
from sqlalchemy import select, desc, or_, func

from app.cache import api_cache, invalidate_all_api_cache
from app.config import API_CACHE_TTL_SEC
from app.db import SessionLocal
from app.models import Client, ClientFinancial, LoanApplication, CreditlineFinancial
from app.auth_guard import require_auth
from app.score_service import mark_client_applications_stale

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


def _creditline_value(v: str) -> str:
    return str(v or "").strip()


def _is_orphan_shell_creditline(row, linked_creditline_values: set[str]) -> bool:
    creditline_value = _creditline_value(getattr(row, "creditline", ""))
    if not creditline_value or creditline_value in linked_creditline_values:
        return False

    numeric_fields = [
        "outstanding",
        "principal_arrears",
        "interest_arrears",
        "payment_plan",
        "interest_rate",
        "days_in_arrears",
        "duration",
        "remaining_period",
        "periodicity",
        "class_value",
        "compulsory_saving",
        "voluntary_saving",
        "salary",
    ]

    if any((_to_float(getattr(row, field, 0), 0) or 0) != 0 for field in numeric_fields):
        return False

    return not str(getattr(row, "start_date", "") or "").strip()


def _build_linked_application_payload(app_):
    if not app_:
        return None

    return {
        "id": app_.id,
        "creditline": _creditline_value(getattr(app_, "creditline", "")),
        "status": getattr(app_, "status", "SUBMITTED"),
        "amount_requested": _to_float(getattr(app_, "amount_requested", 0), 0) or 0,
        "payment_plan": _to_float(getattr(app_, "payment_plan", 0), 0) or 0,
        "purpose": getattr(app_, "purpose", "") or "",
        "term_requested": getattr(app_, "term_requested", 0) or 0,
        "submitted_at": str(getattr(app_, "submitted_at", "") or ""),
    }


def _build_creditline_payload(row, linked_application=None):
    application_payload = _build_linked_application_payload(linked_application)
    creditline_value = _creditline_value(
        (getattr(row, "creditline", None) if row else None)
        or (getattr(linked_application, "creditline", None) if linked_application else "")
        or ""
    )

    return {
        "id": getattr(row, "id", None),
        "creditline": creditline_value,
        "application_id": application_payload["id"] if application_payload else None,
        "application": application_payload,
        "has_linked_application": application_payload is not None,
        "is_available": application_payload is None,
        "outstanding": _to_float(getattr(row, "outstanding", 0), 0) or 0,
        "payment_plan": _to_float(getattr(row, "payment_plan", 0), 0) or 0,
        "interest_rate": _to_float(getattr(row, "interest_rate", 0), 0) or 0,
        "remaining_period": _to_float(getattr(row, "remaining_period", 0), 0) or 0,
        "periodicity": _to_float(getattr(row, "periodicity", 0), 0) or 0,
        "class_value": _to_float(getattr(row, "class_value", 0), 0) or 0,
        "compulsory_saving": _to_float(getattr(row, "compulsory_saving", 0), 0) or 0,
        "voluntary_saving": _to_float(getattr(row, "voluntary_saving", 0), 0) or 0,
        "salary": _to_float(getattr(row, "salary", 0), 0) or 0,
        "duration": _to_float(getattr(row, "duration", 0), 0) or 0,
        "start_date": str(getattr(row, "start_date", "") or ""),
        "days_in_arrears": _to_float(getattr(row, "days_in_arrears", 0), 0) or 0,
        "principal_arrears": _to_float(getattr(row, "principal_arrears", 0), 0) or 0,
        "interest_arrears": _to_float(getattr(row, "interest_arrears", 0), 0) or 0,
        "source": "financial" if row is not None else "application_only",
    }


def _apply_creditline_updates(row, data):
    numeric_fields = (
        "outstanding",
        "principal_arrears",
        "interest_arrears",
        "payment_plan",
        "interest_rate",
        "days_in_arrears",
        "duration",
        "remaining_period",
        "periodicity",
        "class_value",
        "compulsory_saving",
        "voluntary_saving",
        "salary",
    )

    for field in numeric_fields:
        if field in data:
            setattr(row, field, _to_float(data.get(field), getattr(row, field, 0)) or 0)

    if "start_date" in data:
        row.start_date = str(data.get("start_date") or "").strip()


@bp.post("/")
@require_auth(roles=["ADMIN", "ANALYST"])
async def create_client(request):
    data = request.json or {}
    account = (data.get("account") or "").strip()
    full_name = (data.get("full_name") or "").strip()
    gender = str(data.get("gender") or "UNKNOWN").strip().upper()
    phone = (data.get("phone") or "").strip()
    status = _status_upper(data.get("status") or "ACTIVE")

    if status not in {"ACTIVE", "SUSPENDED", "CLOSED"}:
        status = "ACTIVE"
    if gender not in {"MALE", "FEMALE", "UNKNOWN"}:
        gender = "UNKNOWN"

    if not account:
        return json({"error": "account is required"}, status=400)

    async with SessionLocal() as session:
        existing = await session.scalar(select(Client).where(Client.account == account))
        if existing:
            return json({"error": "client already exists", "client_id": existing.id}, status=409)

        client = Client(
            account=account,
            full_name=full_name,
            gender=gender,
            phone=phone,
            status=status
        )
        session.add(client)
        await session.commit()
        await session.refresh(client)

        fin = ClientFinancial(client_id=client.id)
        session.add(fin)
        await session.commit()
        await invalidate_all_api_cache()

        return json({
            "client_id": client.id,
            "account": client.account,
            "gender": client.gender,
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
    cache_key = f"clients:list:{q}:{status}:{page}:{page_size}"
    cached = await api_cache.get(cache_key)
    if cached is not None:
        return json(cached)

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

        total_stmt = select(func.count(Client.id))

        if status:
            total_stmt = total_stmt.where(Client.status == status)

        if q:
            total_stmt = total_stmt.where(
                or_(
                    Client.account.ilike(f"%{q}%"),
                    Client.full_name.ilike(f"%{q}%")
                )
            )

        total = int((await session.scalar(total_stmt)) or 0)

        rows = (
            await session.execute(
                stmt.order_by(Client.id.desc()).offset(offset).limit(page_size)
            )
        ).scalars().all()

        payload = {
            "page": page,
            "page_size": page_size,
            "total": total,
            "items": [
                {
                    "id": c.id,
                    "account": c.account,
                    "full_name": c.full_name,
                    "gender": getattr(c, "gender", "UNKNOWN"),
                    "phone": c.phone,
                    "status": getattr(c, "status", "ACTIVE")
                }
                for c in rows
            ]
        }
        await api_cache.set(cache_key, payload, ttl_seconds=API_CACHE_TTL_SEC)
        return json(payload)


@bp.get("/<client_id:int>")
@require_auth(roles=["ADMIN", "ANALYST"])
async def get_client(request, client_id: int):
    cache_key = f"clients:get:{client_id}"
    cached = await api_cache.get(cache_key)
    if cached is not None:
        return json(cached)

    async with SessionLocal() as session:
        client = await session.get(Client, client_id)
        if not client:
            return json({"error": "client not found"}, status=404)

        fin = await session.scalar(select(ClientFinancial).where(ClientFinancial.client_id == client_id))

        payload = {
            "id": client.id,
            "account": client.account,
            "full_name": client.full_name,
            "gender": getattr(client, "gender", "UNKNOWN"),
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
        }
        await api_cache.set(cache_key, payload, ttl_seconds=API_CACHE_TTL_SEC)
        return json(payload)


@bp.put("/<client_id:int>")
@require_auth(roles=["ADMIN", "ANALYST"])
async def update_client(request, client_id: int):
    data = request.json or {}
    full_name = data.get("full_name")
    gender = data.get("gender")
    phone = data.get("phone")

    async with SessionLocal() as session:
        client = await session.get(Client, client_id)
        if not client:
            return json({"error": "client not found"}, status=404)

        if full_name is not None:
            client.full_name = str(full_name).strip()

        if gender is not None:
            normalized_gender = str(gender).strip().upper()
            if normalized_gender in {"MALE", "FEMALE", "UNKNOWN"}:
                client.gender = normalized_gender

        if phone is not None:
            client.phone = str(phone).strip()

        await session.commit()
        await invalidate_all_api_cache()

        return json({
            "message": "client updated",
            "client": {
                "id": client.id,
                "account": client.account,
                "full_name": client.full_name,
                "gender": getattr(client, "gender", "UNKNOWN"),
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

        await mark_client_applications_stale(session, client_id)
        await session.commit()
        await invalidate_all_api_cache()

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
        await invalidate_all_api_cache()

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
        await invalidate_all_api_cache()

        return json({"message": "client deleted", "client_id": client_id})


@bp.put("/<client_id:int>/creditlines/<creditline_id:int>")
@require_auth(roles=["ADMIN"])
async def update_creditline(request, client_id: int, creditline_id: int):
    data = request.json or {}

    async with SessionLocal() as session:
        client = await session.get(Client, client_id)
        if not client:
            return json({"error": "client not found"}, status=404)

        row = await session.scalar(
            select(CreditlineFinancial).where(
                CreditlineFinancial.id == creditline_id,
                CreditlineFinancial.client_id == client_id,
            )
        )
        if not row:
            return json({"error": "creditline not found"}, status=404)

        original_creditline = _creditline_value(row.creditline)
        updated_creditline = original_creditline

        if "creditline" in data:
            updated_creditline = _creditline_value(data.get("creditline"))
            if not updated_creditline:
                return json({"error": "creditline is required"}, status=400)

            if updated_creditline != original_creditline:
                duplicate_row = await session.scalar(
                    select(CreditlineFinancial.id).where(
                        CreditlineFinancial.client_id == client_id,
                        CreditlineFinancial.creditline == updated_creditline,
                        CreditlineFinancial.id != creditline_id,
                    )
                )
                if duplicate_row:
                    return json({
                        "error": "creditline_exists",
                        "message": "A creditline with that value already exists for this client.",
                    }, status=409)

                conflicting_application = await session.scalar(
                    select(LoanApplication.id).where(
                        LoanApplication.creditline == updated_creditline
                    )
                )
                if conflicting_application:
                    return json({
                        "error": "creditline_in_use",
                        "message": "That creditline is already linked to another loan application.",
                    }, status=409)

        linked_application = await session.scalar(
            select(LoanApplication).where(
                LoanApplication.client_id == client_id,
                LoanApplication.creditline == original_creditline,
            )
        )

        row.creditline = updated_creditline
        _apply_creditline_updates(row, data)

        if linked_application and updated_creditline != original_creditline:
            linked_application.creditline = updated_creditline

        await mark_client_applications_stale(session, client_id)
        await session.commit()
        await invalidate_all_api_cache()

        if linked_application and updated_creditline != original_creditline:
            await session.refresh(linked_application)

        return json({
            "message": "creditline updated",
            "creditline": _build_creditline_payload(row, linked_application),
        })


@bp.delete("/<client_id:int>/creditlines/<creditline_id:int>")
@require_auth(roles=["ADMIN"])
async def delete_creditline(request, client_id: int, creditline_id: int):
    async with SessionLocal() as session:
        client = await session.get(Client, client_id)
        if not client:
            return json({"error": "client not found"}, status=404)

        row = await session.scalar(
            select(CreditlineFinancial).where(
                CreditlineFinancial.id == creditline_id,
                CreditlineFinancial.client_id == client_id,
            )
        )
        if not row:
            return json({"error": "creditline not found"}, status=404)

        linked_application_id = await session.scalar(
            select(LoanApplication.id).where(
                LoanApplication.client_id == client_id,
                LoanApplication.creditline == _creditline_value(row.creditline),
            )
        )
        if linked_application_id:
            return json({
                "error": "creditline_linked",
                "message": "This creditline is linked to a loan application and cannot be deleted.",
            }, status=409)

        deleted_creditline = _creditline_value(row.creditline)
        await session.delete(row)
        await session.commit()
        await invalidate_all_api_cache()

        return json({
            "message": "creditline deleted",
            "client_id": client_id,
            "creditline_id": creditline_id,
            "creditline": deleted_creditline,
        })


@bp.get("/<client_id:int>/creditlines")
@require_auth(roles=["ADMIN", "ANALYST"])
async def list_client_creditlines(request, client_id: int):
    cache_key = f"clients:creditlines:{client_id}"
    cached = await api_cache.get(cache_key)
    if cached is not None:
        return json(cached)

    async with SessionLocal() as session:
        client = await session.get(Client, client_id)
        if not client:
            return json({"error": "client not found"}, status=404)

        rows = (await session.execute(
            select(CreditlineFinancial)
            .where(CreditlineFinancial.client_id == client_id)
            .order_by(desc(CreditlineFinancial.id))
        )).scalars().all()

        linked_apps = (await session.execute(
            select(LoanApplication)
            .where(LoanApplication.client_id == client_id)
            .order_by(desc(LoanApplication.id))
        )).scalars().all()
        linked_by_creditline = {
            _creditline_value(app.creditline): app
            for app in linked_apps
            if _creditline_value(app.creditline)
        }
        linked_creditline_values = set(linked_by_creditline.keys())

        visible_rows = [
            r for r in rows
            if not _is_orphan_shell_creditline(r, linked_creditline_values)
        ]

        payload = []
        seen_creditlines = set()

        for row in visible_rows:
            creditline_key = _creditline_value(row.creditline)
            payload.append(_build_creditline_payload(row, linked_by_creditline.get(creditline_key)))
            if creditline_key:
                seen_creditlines.add(creditline_key)

        for creditline_key, linked_application in linked_by_creditline.items():
            if creditline_key and creditline_key not in seen_creditlines:
                payload.append(_build_creditline_payload(None, linked_application))

        await api_cache.set(cache_key, payload, ttl_seconds=API_CACHE_TTL_SEC)
        return json(payload)
