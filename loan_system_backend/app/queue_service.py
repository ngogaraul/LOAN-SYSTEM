from __future__ import annotations

import asyncio
import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.cache import invalidate_all_api_cache
from app.config import BACKGROUND_SCORING_BATCH_SIZE, SCORE_QUEUE_NAME
from app.db import SessionLocal
from app.models import LoanApplication
from app.redis_runtime import get_redis
from app.score_service import score_application_by_id

logger = logging.getLogger("loan_system")


def _queue_key() -> str:
    return SCORE_QUEUE_NAME


def _pending_key() -> str:
    return f"{SCORE_QUEUE_NAME}:pending"


def _processing_key() -> str:
    return f"{SCORE_QUEUE_NAME}:processing"


async def enqueue_score_job(app_id: int) -> bool:
    redis = await get_redis()
    if redis is None:
        return False
    pending_added = await redis.sadd(_pending_key(), str(app_id))
    if pending_added:
        await redis.rpush(_queue_key(), str(app_id))
        return True
    return False


async def enqueue_stale_applications(
    session: AsyncSession,
    batch_size: int = BACKGROUND_SCORING_BATCH_SIZE,
) -> dict[str, int]:
    candidates = (await session.execute(
        select(LoanApplication.id)
        .where(LoanApplication.score_stale.is_(True))
        .where(LoanApplication.status.in_(["SUBMITTED", "SCORED", "REVIEW"]))
        .order_by(LoanApplication.id.asc())
        .limit(batch_size)
    )).scalars().all()

    queued = 0
    for app_id in candidates:
        if await enqueue_score_job(int(app_id)):
            queued += 1
    return {"queued": queued, "scanned": len(candidates)}


async def pop_score_job(timeout_seconds: int = 5) -> int | None:
    redis = await get_redis()
    if redis is None:
        await asyncio.sleep(timeout_seconds)
        return None
    value = await redis.brpoplpush(_queue_key(), _processing_key(), timeout_seconds)
    if not value:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


async def complete_score_job(app_id: int) -> None:
    redis = await get_redis()
    if redis is None:
        return
    await redis.lrem(_processing_key(), 0, str(app_id))
    await redis.srem(_pending_key(), str(app_id))


async def reclaim_processing_jobs() -> None:
    redis = await get_redis()
    if redis is None:
        return
    inflight = await redis.lrange(_processing_key(), 0, -1)
    if not inflight:
        return
    for app_id in inflight:
        await redis.lrem(_processing_key(), 0, app_id)
        await redis.lpush(_queue_key(), app_id)
    logger.warning("Reclaimed %s scoring jobs left in processing state.", len(inflight))


async def run_worker_forever() -> None:
    await reclaim_processing_jobs()
    while True:
        app_id = await pop_score_job(timeout_seconds=5)
        if app_id is None:
            continue

        try:
            async with SessionLocal() as session:
                status, _payload = await score_application_by_id(session, app_id, force=False)
                if status == 200:
                    await invalidate_all_api_cache()
                elif status in {400, 502}:
                    app_ = await session.get(LoanApplication, app_id)
                    if app_ and app_.status not in {"APPROVED", "REJECTED"}:
                        app_.score_stale = True
                        await session.commit()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Queue worker failed while processing application_id=%s", app_id)
        finally:
            await complete_score_job(app_id)
