from sanic import Sanic
from sanic.response import json
from sqlalchemy import text
from sanic_cors import CORS
import logging
import asyncio
import contextlib
from sanic.exceptions import SanicException

from app.config import (
    APP_HOST,
    APP_PORT,
    BACKGROUND_SCORING_BATCH_SIZE,
    BACKGROUND_SCORING_ENABLED,
    BACKGROUND_SCORING_INTERVAL_SEC,
    CORS_ORIGINS,
    validate_runtime_config,
)
from app.db import SessionLocal, engine
from app.logging_config import setup_logging
from app.models import Base
from app.queue_service import enqueue_stale_applications
from app.redis_runtime import close_redis

from app.routes.clients import bp as clients_bp
from app.routes.applications import bp as applications_bp
from app.routes.scoring import bp as scoring_bp
from app.routes.decisions import bp as decisions_bp
from app.routes.auth import bp as auth_bp
from app.routes.dashboard import bp as dashboard_bp
from app.routes.admin import bp as admin_bp  # ✅ ADD

setup_logging()
logger = logging.getLogger("loan_system")
validate_runtime_config()

app = Sanic("loan_system_core")
CORS(app, resources={r"/*": {"origins": CORS_ORIGINS}}, supports_credentials=True)


@app.before_server_start
async def ensure_schema(app_, loop):
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

        async with SessionLocal() as session:
            await session.execute(text("""
                ALTER TABLE loan_applications
                ADD COLUMN IF NOT EXISTS payment_plan DOUBLE PRECISION DEFAULT 0
            """))
            await session.execute(text("""
                ALTER TABLE creditline_financials
                ADD COLUMN IF NOT EXISTS interest_rate DOUBLE PRECISION DEFAULT 0
            """))
            await session.execute(text("""
                ALTER TABLE users
                ADD COLUMN IF NOT EXISTS external_subject VARCHAR(255)
            """))
            await session.execute(text("""
                ALTER TABLE clients
                ADD COLUMN IF NOT EXISTS gender VARCHAR(16) DEFAULT 'UNKNOWN'
            """))
            await session.execute(text("""
                ALTER TABLE loan_applications
                ADD COLUMN IF NOT EXISTS score_stale BOOLEAN DEFAULT TRUE
            """))
            await session.execute(text("""
                UPDATE loan_applications la
                SET payment_plan = cf.payment_plan
                FROM creditline_financials cf
                WHERE la.client_id = cf.client_id
                  AND la.creditline = cf.creditline
                  AND COALESCE(la.payment_plan, 0) = 0
            """))
            await session.execute(text("""
                CREATE UNIQUE INDEX IF NOT EXISTS ix_users_external_subject
                ON users(external_subject)
                WHERE external_subject IS NOT NULL
            """))
            await session.execute(text("""
                CREATE UNIQUE INDEX IF NOT EXISTS uq_creditline_financials_client_creditline
                ON creditline_financials(client_id, creditline)
            """))
            await session.commit()
        logger.info("Schema check complete.")
    except Exception:
        logger.exception("Schema check failed during startup.")
        raise


async def background_scoring_loop() -> None:
    while True:
        try:
            async with SessionLocal() as session:
                result = await enqueue_stale_applications(session, BACKGROUND_SCORING_BATCH_SIZE)
                if result["queued"]:
                    logger.info(
                        "Background scoring queued=%s scanned=%s",
                        result["queued"],
                        result["scanned"],
                    )
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Background scoring loop failed.")
        await asyncio.sleep(max(BACKGROUND_SCORING_INTERVAL_SEC, 5))


@app.after_server_start
async def start_background_tasks(app_, _loop):
    if not BACKGROUND_SCORING_ENABLED:
        return
    app_.ctx.background_scoring_task = asyncio.create_task(background_scoring_loop())
    logger.info("Background scoring loop started.")


@app.before_server_stop
async def stop_background_tasks(app_, _loop):
    task = getattr(app_.ctx, "background_scoring_task", None)
    if task:
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task
    await close_redis()


@app.get("/health")
async def health(request):
    logger.info("Health check endpoint called.")
    return json({"status": "ok"})


@app.get("/db-check")
async def db_check(request):
    try:
        async with SessionLocal() as session:
            result = await session.execute(text("SELECT 1;"))
            value = result.scalar()
        return json({"db": "ok", "result": value})
    except Exception as e:
        return json({"db": "error", "message": str(e)}, status=500)


@app.get("/routes")
async def routes(request):
    return json({"routes": sorted([r.uri for r in app.router.routes_all.values()])})


@app.exception(Exception)
async def handle_exceptions(request, exception):
    logger.exception("Unhandled error")

    if isinstance(exception, SanicException):
        return json({
            "error": exception.__class__.__name__,
            "message": exception.args[0] if exception.args else "Request error"
        }, status=exception.status_code)

    return json({
        "error": "internal_server_error",
        "message": "Something went wrong. Please contact system administrator."
    }, status=500)


# ✅ Register routes
app.blueprint(clients_bp)
app.blueprint(applications_bp)
app.blueprint(scoring_bp)
app.blueprint(decisions_bp)
app.blueprint(auth_bp)
app.blueprint(dashboard_bp)
app.blueprint(admin_bp)  # ✅ ADD


if __name__ == "__main__":
    app.run(host=APP_HOST, port=APP_PORT, debug=True)
