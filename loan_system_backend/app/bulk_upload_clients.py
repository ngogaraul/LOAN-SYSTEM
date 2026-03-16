import hashlib
import os
import random
import time

import pandas as pd
import requests


EXCEL_PATH = os.getenv(
    "IMPORT_EXCEL_PATH",
    r"C:\Users\ngoga\Desktop\Graduation project\credit_scoring\data\Final Raw Data.xlsx",
)
BASE_URL = os.getenv("IMPORT_BASE_URL", "http://localhost:9000")
ADMIN_EMAIL = os.getenv("IMPORT_ADMIN_EMAIL", "admin@loan.local")
ADMIN_PASSWORD = os.getenv("IMPORT_ADMIN_PASSWORD", "Admin123!")
TOKEN_OVERRIDE = (os.getenv("IMPORT_TOKEN_OVERRIDE", "") or "").strip()


FIRST_NAMES = [
    "John", "Jane", "Michael", "Sarah", "David", "Emily", "James", "Grace",
    "Daniel", "Maria", "Joseph", "Esther", "Paul", "Ruth", "Peter", "Alice",
    "Eric", "Diane", "Brian", "Linda"
]
LAST_NAMES = [
    "Mukamana", "Uwimana", "Niyonzima", "Habimana", "Ndayisenga", "Munyaneza",
    "Nsengimana", "Mutesi", "Rukundo", "Habyarimana", "Kamanzi", "Mutabazi",
    "Bizimana", "Manzi", "Umutoni", "Nyirahabimana"
]


def deterministic_rng(key: str) -> random.Random:
    digest = hashlib.md5(key.encode("utf-8")).hexdigest()
    return random.Random(int(digest[:8], 16))


def make_name(account: str) -> str:
    generator = deterministic_rng(account)
    return f"{generator.choice(FIRST_NAMES)} {generator.choice(LAST_NAMES)}"


def make_phone(account: str, used_numbers: set[str]) -> str:
    generator = deterministic_rng("phone:" + account)
    for _ in range(50):
        candidate = "07" + f"{generator.randint(0, 99_999_999):08d}"
        if candidate not in used_numbers:
            used_numbers.add(candidate)
            return candidate

    fallback = "07" + str(int(time.time() * 1000))[-8:]
    used_numbers.add(fallback)
    return fallback


def login_get_token() -> str:
    response = requests.post(
        f"{BASE_URL}/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=30,
    )
    response.raise_for_status()
    return response.json()["token"]


def main():
    dataframe = pd.read_excel(EXCEL_PATH)

    if "Account" not in dataframe.columns:
        raise ValueError(f"Excel must contain 'Account' column. Found: {list(dataframe.columns)}")

    accounts = (
        dataframe["Account"]
        .dropna()
        .astype(str)
        .str.strip()
        .unique()
        .tolist()
    )

    print(f"Found {len(accounts)} unique clients.")

    token = TOKEN_OVERRIDE or login_get_token()
    headers = {"Authorization": f"Bearer {token}"}

    used_phones: set[str] = set()
    created = 0
    skipped = 0
    failed = 0

    for account in accounts:
        payload = {
            "account": account,
            "full_name": make_name(account),
            "phone": make_phone(account, used_phones),
            "status": "ACTIVE",
        }

        try:
            response = requests.post(
                f"{BASE_URL}/clients/",
                json=payload,
                headers=headers,
                timeout=30,
            )
            if response.status_code == 409:
                skipped += 1
                continue

            response.raise_for_status()
            created += 1
        except Exception as exc:
            failed += 1
            print(f"[FAILED] account={account} error={exc}")
            try:
                print(" response:", response.status_code, response.text)
            except Exception:
                pass

    print("\nDONE")
    print(" created:", created)
    print(" skipped(existing):", skipped)
    print(" failed:", failed)


if __name__ == "__main__":
    main()
