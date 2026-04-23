import asyncio
import hashlib
import os
import random

import pandas as pd
from sqlalchemy import select

from app.db import SessionLocal
from app.models import Client, ClientFinancial, CreditlineFinancial


EXCEL_PATH = os.getenv(
    "IMPORT_EXCEL_PATH",
    r"C:\Users\ngoga\Desktop\Graduation project\credit_scoring\data\Final Raw Data.xlsx",
)

STATUS = os.getenv("IMPORT_CLIENT_STATUS", "ACTIVE").strip().upper() or "ACTIVE"

KINYARWANDA_MALE_NAMES = [
    "Nshimiyimana", "Hategekimana", "Niyonzima", "Mugisha", "Uwase", "Bizimana",
    "Habimana", "Mutabazi", "Ndayisaba", "Rukundo", "Nkurunziza", "Nsengimana",
    "Munyaneza", "Niyigena", "Muyobozi", "Bikorwa", "Tuyisenge", "Habarurema",
]

KINYARWANDA_FEMALE_NAMES = [
    "Mukamana", "Uwimana", "Nyirahabimana", "Umutoni", "Iradukunda", "Ingabire",
    "Niyonsenga", "Umutoniwase", "Isimbi", "Ineza", "Mutoni", "Nishimwe",
    "Umutesi", "Kabatesi", "Uwase", "Iradukunda", "Murekatete", "Niyomugabo",
]

KINYARWANDA_FAMILY_NAMES = [
    "Uwimana", "Mukamana", "Niyonzima", "Habimana", "Nsengimana", "Munyaneza",
    "Ndayisaba", "Mutabazi", "Rukundo", "Hategekimana", "Mugisha", "Nshimiyimana",
    "Umutoni", "Ingabire", "Iradukunda", "Bizimana", "Murekatete", "Nkurunziza",
]


def deterministic_rng(key: str) -> random.Random:
    digest = hashlib.sha256(key.encode("utf-8")).hexdigest()
    return random.Random(int(digest[:16], 16))


def generated_gender(account: str) -> str:
    return "FEMALE" if deterministic_rng(f"gender:{account}").randint(0, 1) else "MALE"


def generated_name(account: str) -> str:
    gender = generated_gender(account)
    rng = deterministic_rng(f"name:{account}")
    first_name = rng.choice(KINYARWANDA_FEMALE_NAMES if gender == "FEMALE" else KINYARWANDA_MALE_NAMES)
    family_name = rng.choice(KINYARWANDA_FAMILY_NAMES)
    return f"{first_name} {family_name}"


def generated_phone(account: str) -> str:
    rng = deterministic_rng(f"phone:{account}")
    return "07" + f"{rng.randint(0, 99_999_999):08d}"


def to_float(value, default=0.0):
    try:
        if pd.isna(value):
            return default
        if isinstance(value, str):
            value = value.replace(",", "").strip()
        if value == "":
            return default
        return float(value)
    except Exception:
        return default


def to_str(value):
    if value is None or pd.isna(value):
        return ""
    return str(value).strip()


def norm_col(value):
    return str(value).strip().lower().replace("\n", " ").replace("\t", " ")


def aggregate_client_financials(rows: list[CreditlineFinancial]) -> dict:
    valid_dates = [row.start_date for row in rows if str(row.start_date or "").strip()]
    return {
        "outstanding": sum(to_float(row.outstanding) for row in rows),
        "payment_plan": sum(to_float(row.payment_plan) for row in rows),
        "remaining_period": max((to_float(row.remaining_period) for row in rows), default=0.0),
        "periodicity": max((to_float(row.periodicity) for row in rows), default=0.0),
        "class_value": max((to_float(row.class_value) for row in rows), default=0.0),
        "compulsory_saving": sum(to_float(row.compulsory_saving) for row in rows),
        "voluntary_saving": sum(to_float(row.voluntary_saving) for row in rows),
        "salary": max((to_float(row.salary) for row in rows), default=0.0),
        "duration": max((to_float(row.duration) for row in rows), default=0.0),
        "start_date": min(valid_dates) if valid_dates else "",
    }


async def main():
    dataframe = pd.read_excel(EXCEL_PATH, sheet_name=0)
    dataframe.columns = [norm_col(column) for column in dataframe.columns]

    if "account" not in dataframe.columns:
        raise ValueError("Excel must contain 'Account' column")
    if "creditline" not in dataframe.columns:
        raise ValueError("Excel must contain 'Creditline' column")

    created_clients = 0
    updated_clients = 0
    inserted_creditlines = 0
    updated_creditlines = 0

    async with SessionLocal() as session:
        for _, row in dataframe.iterrows():
            account = to_str(row.get("account"))
            creditline_value = to_str(row.get("creditline"))
            if not account or not creditline_value:
                continue

            client = await session.scalar(select(Client).where(Client.account == account))
            if client:
                client.full_name = generated_name(account)
                client.gender = generated_gender(account)
                client.phone = generated_phone(account)
                client.status = STATUS
                updated_clients += 1
            else:
                client = Client(
                    account=account,
                    full_name=generated_name(account),
                    gender=generated_gender(account),
                    phone=generated_phone(account),
                    status=STATUS,
                )
                session.add(client)
                await session.flush()
                created_clients += 1

            fin = await session.scalar(select(ClientFinancial).where(ClientFinancial.client_id == client.id))
            if not fin:
                fin = ClientFinancial(client_id=client.id)
                session.add(fin)

            existing = await session.scalar(
                select(CreditlineFinancial)
                .where(CreditlineFinancial.client_id == client.id)
                .where(CreditlineFinancial.creditline == creditline_value)
            )

            if existing:
                record = existing
                updated_creditlines += 1
            else:
                record = CreditlineFinancial(client_id=client.id, creditline=creditline_value)
                session.add(record)
                inserted_creditlines += 1

            record.outstanding = to_float(row.get("outstanding"))
            record.principal_arrears = to_float(
                row.get("principal arrears")
                if "principal arrears" in dataframe.columns
                else row.get("principalarrears")
            )
            record.interest_arrears = to_float(
                row.get("interest arrears")
                if "interest arrears" in dataframe.columns
                else row.get("interestarrears")
            )
            record.days_in_arrears = to_float(
                row.get("days in arrears")
                if "days in arrears" in dataframe.columns
                else row.get("daysinarrears")
            )
            record.payment_plan = to_float(row.get("payment plan"))
            record.start_date = to_str(row.get("start date"))
            record.duration = to_float(row.get("duration"))
            record.remaining_period = to_float(
                row.get("remaining period")
                if "remaining period" in dataframe.columns
                else row.get("remaining")
            )
            record.periodicity = to_float(row.get("periodicity"))
            record.class_value = to_float(row.get("class"))
            record.compulsory_saving = to_float(row.get("compulsory saving"))
            record.voluntary_saving = to_float(row.get("voluntary saving"))
            record.salary = to_float(row.get("salary"))

            if (created_clients + updated_clients + inserted_creditlines + updated_creditlines) % 500 == 0:
                await session.commit()
                print(
                    f"Processed rows with clients(created={created_clients}, updated={updated_clients}) "
                    f"creditlines(inserted={inserted_creditlines}, updated={updated_creditlines})"
                )

        await session.commit()

        clients = (await session.execute(select(Client))).scalars().all()
        for client in clients:
            rows = (await session.execute(
                select(CreditlineFinancial).where(CreditlineFinancial.client_id == client.id)
            )).scalars().all()
            if not rows:
                continue

            aggregate = aggregate_client_financials(rows)
            fin = await session.scalar(select(ClientFinancial).where(ClientFinancial.client_id == client.id))
            if not fin:
                fin = ClientFinancial(client_id=client.id)
                session.add(fin)

            fin.outstanding = aggregate["outstanding"]
            fin.payment_plan = aggregate["payment_plan"]
            fin.remaining_period = aggregate["remaining_period"]
            fin.periodicity = aggregate["periodicity"]
            fin.class_value = aggregate["class_value"]
            fin.compulsory_saving = aggregate["compulsory_saving"]
            fin.voluntary_saving = aggregate["voluntary_saving"]
            fin.salary = aggregate["salary"]
            fin.duration = aggregate["duration"]
            fin.start_date = aggregate["start_date"]

        await session.commit()

    print("DONE")
    print(f"Clients created: {created_clients}")
    print(f"Clients updated: {updated_clients}")
    print(f"Creditlines inserted: {inserted_creditlines}")
    print(f"Creditlines updated: {updated_creditlines}")


if __name__ == "__main__":
    asyncio.run(main())
