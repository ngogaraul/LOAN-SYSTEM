import asyncio

import httpx

from app.config import SCORING_API_BASE, SCORING_API_KEY


class ScoringServiceError(Exception):
    def __init__(self, message: str, *, status_code: int = 502, retry_after: int | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.retry_after = retry_after


def _parse_retry_after(response: httpx.Response) -> int | None:
    value = (response.headers.get("retry-after") or "").strip()
    if not value:
        return None
    try:
        parsed = int(float(value))
    except ValueError:
        return None
    return max(parsed, 1)


def _score_failure_message(status_code: int, retry_after: int | None = None) -> str:
    if status_code == 429:
        if retry_after:
            return (
                f"Scoring service is temporarily rate-limited by the hosting provider. "
                f"Please wait about {retry_after} seconds and try again."
            )
        return (
            "Scoring service is temporarily rate-limited by the hosting provider. "
            "Please wait a moment and try again."
        )
    if status_code in {502, 503, 504}:
        return "Scoring service is temporarily unavailable. Please try again shortly."
    return f"Scoring service returned HTTP {status_code}."


async def call_scoring_api(payload: dict) -> dict:
    headers = {}
    if SCORING_API_KEY:
        headers["x-api-key"] = SCORING_API_KEY

    max_attempts = 3
    backoff_seconds = [1, 3]

    for attempt in range(max_attempts):
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                response = await client.post(
                    f"{SCORING_API_BASE}/predict",
                    json=payload,
                    headers=headers,
                )
            if response.status_code == 429 and attempt < max_attempts - 1:
                retry_after = _parse_retry_after(response)
                await asyncio.sleep(retry_after or backoff_seconds[attempt])
                continue
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as exc:
            status_code = exc.response.status_code
            retry_after = _parse_retry_after(exc.response)
            if status_code in {429, 502, 503, 504} and attempt < max_attempts - 1:
                await asyncio.sleep(retry_after or backoff_seconds[attempt])
                continue
            raise ScoringServiceError(
                _score_failure_message(status_code, retry_after),
                status_code=status_code,
                retry_after=retry_after,
            ) from exc
        except httpx.RequestError as exc:
            if attempt < max_attempts - 1:
                await asyncio.sleep(backoff_seconds[attempt])
                continue
            raise ScoringServiceError(
                "Scoring service could not be reached. Please try again shortly.",
                status_code=502,
            ) from exc

    raise ScoringServiceError(
        "Scoring service is temporarily unavailable. Please try again shortly.",
        status_code=503,
    )
