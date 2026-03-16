import asyncio
import os

import pandas as pd
from sqlalchemy import select

from app.db import SessionLocal
from app.models import Client, ClientFinancial, CreditlineFinancial


EXCEL_PATH = os.getenv(
    "IMPORT_EXCEL_PATH",
    r"C:\Users\ngoga\Desktop\Graduation project\credit_scoring\data\Final Raw Data.xlsx",
)


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

    inserted = 0
    updated = 0
    skipped_no_client = 0

    async with SessionLocal() as session:
        for _, row in dataframe.iterrows():
            account = to_str(row.get("account"))
            creditline_value = to_str(row.get("creditline"))
            if not account or not creditline_value:
                continue

            client = await session.scalar(select(Client).where(Client.account == account))
            if not client:
                skipped_no_client += 1
                continue

            existing = await session.scalar(
                select(CreditlineFinancial)
                .where(CreditlineFinancial.client_id == client.id)
                .where(CreditlineFinancial.creditline == creditline_value)
            )

            if existing:
                record = existing
                updated += 1
            else:
                record = CreditlineFinancial(client_id=client.id, creditline=creditline_value)
                session.add(record)
                inserted += 1

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

            if (inserted + updated) % 500 == 0:
                await session.commit()
                print(f"Processed {inserted + updated} creditline rows...")

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
    print(f"Inserted creditline rows: {inserted}")
    print(f"Updated creditline rows: {updated}")
    print(f"Skipped rows (no matching client in DB): {skipped_no_client}")


if __name__ == "__main__":
    asyncio.run(main())
