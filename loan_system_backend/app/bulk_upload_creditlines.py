import asyncio
import pandas as pd

from sqlalchemy import select
from app.db import SessionLocal
from app.models import Client, CreditlineFinancial


EXCEL_PATH = r"C:\Users\ngoga\Desktop\Graduation project\credit_scoring\data\Final Raw Data.xlsx"   # <-- change to your real path
SHEET_NAME = 0  # None = first sheet


def to_float(x, default=0.0):
    try:
        if pd.isna(x):
            return default
        if isinstance(x, str):
            x = x.replace(",", "").strip()
        if x == "":
            return default
        return float(x)
    except Exception:
        return default


def to_str(x):
    if x is None or pd.isna(x):
        return ""
    return str(x).strip()


def norm_col(s):
    return str(s).strip().lower().replace("\n", " ").replace("\t", " ")


async def main():
    df = pd.read_excel(EXCEL_PATH, sheet_name=0)

    # normalize columns
    df.columns = [norm_col(c) for c in df.columns]

    # map your excel columns to internal keys
    # (adjust if your excel has slightly different spellings)
    colmap = {
        "account": "account",
        "creditline": "creditline",
        "outstanding": "outstanding",
        "principal arrears": "principal_arrears",
        "interestarrears": "interest_arrears",
        "interest arrears": "interest_arrears",
        "daysinarrears": "days_in_arrears",
        "days in arrears": "days_in_arrears",
        "payment plan": "payment_plan",
        "start date": "start_date",
        "duration": "duration",
        "remaining period": "remaining_period",
        "remaining": "remaining_period",
        "periodicity": "periodicity",
        "class": "class_value",
        "compulsory saving": "compulsory_saving",
        "voluntary saving": "voluntary_saving",
        "salary": "salary",
    }

    # ensure required
    if "account" not in df.columns:
        raise ValueError("Excel must contain 'Account' column")

    inserted = 0
    skipped_no_client = 0

    async with SessionLocal() as session:
        for i, row in df.iterrows():
            account = to_str(row.get("account"))
            if not account:
                continue

            client = await session.scalar(select(Client).where(Client.account == account))
            if not client:
                skipped_no_client += 1
                continue

            rec = CreditlineFinancial(
                client_id=client.id,
                creditline=to_str(row.get("creditline")),

                outstanding=to_float(row.get("outstanding")),
                principal_arrears=to_float(row.get("principal arrears")),
                interest_arrears=to_float(row.get("interest arrears") if "interest arrears" in df.columns else row.get("interestarrears")),
                days_in_arrears=to_float(row.get("days in arrears") if "days in arrears" in df.columns else row.get("daysinarrears")),

                payment_plan=to_float(row.get("payment plan")),
                start_date=to_str(row.get("start date")),
                duration=to_float(row.get("duration")),
                remaining_period=to_float(row.get("remaining period") if "remaining period" in df.columns else row.get("remaining")),
                periodicity=to_float(row.get("periodicity")),
                class_value=to_float(row.get("class")),
                compulsory_saving=to_float(row.get("compulsory saving")),
                voluntary_saving=to_float(row.get("voluntary saving")),
                salary=to_float(row.get("salary")),
            )

            session.add(rec)
            inserted += 1

            # commit in batches (fast + safe)
            if inserted % 500 == 0:
                await session.commit()
                print(f"Committed {inserted} rows...")

        await session.commit()

    print("DONE")
    print(f"Inserted creditline rows: {inserted}")
    print(f"Skipped rows (no matching client in DB): {skipped_no_client}")


if __name__ == "__main__":
    asyncio.run(main())