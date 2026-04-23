from __future__ import annotations

import json

from app.config import API_CACHE_NAMESPACE
from app.redis_runtime import get_redis


class SharedAPICache:
    def __init__(self, namespace: str) -> None:
        self.namespace = namespace
        self.version_key = f"{namespace}:version"

    async def _current_version(self) -> str | None:
        redis = await get_redis()
        if redis is None:
            return None
        version = await redis.get(self.version_key)
        if version is None:
            await redis.set(self.version_key, "1")
            return "1"
        return str(version)

    async def get(self, key: str):
        redis = await get_redis()
        if redis is None:
            return None
        version = await self._current_version()
        raw = await redis.get(f"{self.namespace}:v{version}:{key}")
        if raw is None:
            return None
        return json.loads(raw)

    async def set(self, key: str, value: object, ttl_seconds: int) -> None:
        redis = await get_redis()
        if redis is None:
            return
        version = await self._current_version()
        await redis.set(
            f"{self.namespace}:v{version}:{key}",
            json.dumps(value),
            ex=max(int(ttl_seconds), 1),
        )

    async def invalidate_all(self) -> None:
        redis = await get_redis()
        if redis is None:
            return
        await redis.incr(self.version_key)


api_cache = SharedAPICache(API_CACHE_NAMESPACE)


async def invalidate_all_api_cache() -> None:
    await api_cache.invalidate_all()
