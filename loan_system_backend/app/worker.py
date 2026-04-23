from __future__ import annotations

import asyncio
import logging

from app.logging_config import setup_logging
from app.queue_service import run_worker_forever


async def _main() -> None:
    setup_logging()
    logging.getLogger("loan_system").info("Scoring worker started.")
    await run_worker_forever()


if __name__ == "__main__":
    asyncio.run(_main())
