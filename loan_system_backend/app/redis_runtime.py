from __future__ import annotations

from redis import asyncio as redis

from app.config import REDIS_URL

_redis_client: redis.Redis | None = None


async def get_redis() -> redis.Redis | None:
    global _redis_client
    if not REDIS_URL:
        return None
    if _redis_client is None:
        _redis_client = redis.from_url(
            REDIS_URL,
            decode_responses=True,
            health_check_interval=30,
        )
    return _redis_client


async def close_redis() -> None:
    global _redis_client
    if _redis_client is not None:
        await _redis_client.aclose()
        _redis_client = None
