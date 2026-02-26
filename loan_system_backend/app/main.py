from sanic import Sanic
from sanic.response import json
from sqlalchemy import text
from sanic_cors import CORS
import logging
from sanic.exceptions import SanicException

from app.config import APP_HOST, APP_PORT
from app.db import SessionLocal
from app.logging_config import setup_logging

from app.routes.clients import bp as clients_bp
from app.routes.applications import bp as applications_bp
from app.routes.scoring import bp as scoring_bp
from app.routes.decisions import bp as decisions_bp
from app.routes.auth import bp as auth_bp
from app.routes.dashboard import bp as dashboard_bp
from app.routes.admin import bp as admin_bp  # ✅ ADD

setup_logging()
logger = logging.getLogger("loan_system")

app = Sanic("loan_system_core")
CORS(app, resources={r"/*": {"origins": ["http://localhost:5173"]}}, supports_credentials=False)


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