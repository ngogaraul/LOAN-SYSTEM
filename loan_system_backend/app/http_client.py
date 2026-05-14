import asyncio
import logging

import httpx

from app.config import SCORING_API_BASE, SCORING_API_KEY, SCORING_API_TIMEOUT_SEC

logger = logging.getLogger("loan_system")


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
            logger.info(
                "Calling scoring API: base=%s attempt=%s records=%s timeout=%ss",
                SCORING_API_BASE,
                attempt + 1,
                len(payload.get("records") or []),
                SCORING_API_TIMEOUT_SEC,
            )
            timeout = httpx.Timeout(SCORING_API_TIMEOUT_SEC, connect=20.0)
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.post(
                    f"{SCORING_API_BASE}/predict",
                    json=payload,
                    headers=headers,
                )
            if response.status_code == 429 and attempt < max_attempts - 1:
                retry_after = _parse_retry_after(response)
                logger.warning(
                    "Scoring API rate-limited request: status=429 retry_after=%s attempt=%s base=%s",
                    retry_after,
                    attempt + 1,
                    SCORING_API_BASE,
                )
                await asyncio.sleep(retry_after or backoff_seconds[attempt])
                continue
            logger.info(
                "Scoring API response received: status=%s attempt=%s base=%s",
                response.status_code,
                attempt + 1,
                SCORING_API_BASE,
            )
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as exc:
            status_code = exc.response.status_code
            retry_after = _parse_retry_after(exc.response)
            if status_code in {429, 502, 503, 504} and attempt < max_attempts - 1:
                logger.warning(
                    "Retrying scoring API after HTTP error: status=%s retry_after=%s attempt=%s base=%s",
                    status_code,
                    retry_after,
                    attempt + 1,
                    SCORING_API_BASE,
                )
                await asyncio.sleep(retry_after or backoff_seconds[attempt])
                continue
            logger.exception(
                "Scoring API returned HTTP error: status=%s base=%s",
                status_code,
                SCORING_API_BASE,
            )
            raise ScoringServiceError(
                _score_failure_message(status_code, retry_after),
                status_code=status_code,
                retry_after=retry_after,
            ) from exc
        except httpx.RequestError as exc:
            if isinstance(exc, httpx.TimeoutException):
                if attempt < max_attempts - 1:
                    logger.warning(
                        "Retrying scoring API after timeout: attempt=%s base=%s",
                        attempt + 1,
                        SCORING_API_BASE,
                    )
                    await asyncio.sleep(backoff_seconds[attempt])
                    continue
                logger.exception(
                    "Scoring API timed out: base=%s timeout=%ss",
                    SCORING_API_BASE,
                    SCORING_API_TIMEOUT_SEC,
                )
                raise ScoringServiceError(
                    "Scoring service timed out while processing the request. "
                    "On free hosting this can happen while the model service wakes up. "
                    "Please try again shortly.",
                    status_code=504,
                ) from exc
            if attempt < max_attempts - 1:
                logger.warning(
                    "Retrying scoring API after request error: attempt=%s base=%s error=%s",
                    attempt + 1,
                    SCORING_API_BASE,
                    repr(exc),
                )
                await asyncio.sleep(backoff_seconds[attempt])
                continue
            logger.exception(
                "Scoring API request failed: base=%s error=%s",
                SCORING_API_BASE,
                repr(exc),
            )
            raise ScoringServiceError(
                "Scoring service could not be reached. Please try again shortly.",
                status_code=502,
            ) from exc

    raise ScoringServiceError(
        "Scoring service is temporarily unavailable. Please try again shortly.",
        status_code=503,
    )
