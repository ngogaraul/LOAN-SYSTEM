import hashlib
import random
import time
import pandas as pd
import requests

# =========================
# CONFIG
# =========================
EXCEL_PATH = r"C:\Users\ngoga\Desktop\Graduation project\credit_scoring\data\Final Raw Data.xlsx"   # <-- put your file path here
BASE_URL = "http://localhost:9000"

ADMIN_EMAIL = "Admin@test.com"
ADMIN_PASSWORD = "Admin@123"

# If you already have a token, you can paste it here and skip login.
TOKEN_OVERRIDE = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI3Iiwicm9sZSI6IkFETUlOIiwiZXhwIjoxNzcyMTMzOTQ4fQ.iBpAvfHD9RUOjaAHee9qP9Pt6NyjI2W65-BbQ6Exu8A"  # e.g. "eyJhbGciOi..."


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
    """Create deterministic random generator from account string."""
    h = hashlib.md5(key.encode("utf-8")).hexdigest()
    seed = int(h[:8], 16)
    return random.Random(seed)

def make_name(account: str) -> str:
    r = deterministic_rng(account)
    return f"{r.choice(FIRST_NAMES)} {r.choice(LAST_NAMES)}"

def make_phone(account: str, used: set) -> str:
    """
    Generates a Rwanda-like phone: 07 + 8 digits (10 digits total).
    Ensures uniqueness across generated phones.
    """
    r = deterministic_rng("phone:" + account)
    # Keep trying until unique (should be fast)
    for _ in range(50):
        num = r.randint(0, 99_999_999)
        phone = "07" + f"{num:08d}"
        if phone not in used:
            used.add(phone)
            return phone
    # fallback if something weird happens
    phone = "07" + str(int(time.time() * 1000))[-8:]
    used.add(phone)
    return phone

def login_get_token() -> str:
    resp = requests.post(f"{BASE_URL}/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD
    }, timeout=30)
    resp.raise_for_status()
    return resp.json()["token"]

def main():
    # 1) Load Excel
    df = pd.read_excel(EXCEL_PATH)

    if "Account" not in df.columns:
        raise ValueError(f"Excel must contain 'Account' column. Found: {list(df.columns)}")

    # 2) Unique clients by Account
    accounts = (
        df["Account"]
        .dropna()
        .astype(str)
        .str.strip()
        .unique()
        .tolist()
    )

    print(f"Found {len(accounts)} unique clients (unique Account).")

    # 3) Auth
    token = TOKEN_OVERRIDE.strip() or login_get_token()
    headers = {"Authorization": f"Bearer {token}"}

    # 4) Upload
    used_phones = set()
    created = 0
    skipped = 0
    failed = 0

    for acc in accounts:
        payload = {
            "account": acc,
            "full_name": make_name(acc),
            "phone": make_phone(acc, used_phones),
            "status": "ACTIVE"
        }

        try:
            r = requests.post(f"{BASE_URL}/clients/", json=payload, headers=headers, timeout=30)
            if r.status_code == 409:
                # already exists
                skipped += 1
                continue
            r.raise_for_status()
            created += 1

        except Exception as e:
            failed += 1
            print(f"[FAILED] account={acc} error={e}")
            # show backend response if any
            try:
                print(" response:", r.status_code, r.text)
            except Exception:
                pass

    print("\nDONE")
    print(" created:", created)
    print(" skipped(existing):", skipped)
    print(" failed:", failed)

if __name__ == "__main__":
    main()