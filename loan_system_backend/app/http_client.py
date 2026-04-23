import httpx
from app.config import SCORING_API_BASE, SCORING_API_KEY

async def call_scoring_api(payload: dict) -> dict:
    async with httpx.AsyncClient(timeout=15.0) as client:
        headers = {}
        if SCORING_API_KEY:
            headers["x-api-key"] = SCORING_API_KEY
        r = await client.post(f"{SCORING_API_BASE}/predict", json=payload, headers=headers)
        r.raise_for_status()
        return r.json()
