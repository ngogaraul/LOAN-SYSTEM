import os
from dotenv import load_dotenv

load_dotenv()

APP_HOST = os.getenv("APP_HOST", "0.0.0.0")
APP_PORT = int(os.getenv("APP_PORT", "9000"))
DATABASE_URL = os.getenv("DATABASE_URL")
SCORING_API_BASE = os.getenv("SCORING_API_BASE", "http://localhost:8000")
CORS_ORIGINS = [origin.strip() for origin in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",") if origin.strip()]
JWT_SECRET = os.getenv("JWT_SECRET", "change_me")
JWT_ALG = os.getenv("JWT_ALG", "HS256")
JWT_EXPIRE_MIN = int(os.getenv("JWT_EXPIRE_MIN", "480"))
ADMIN_BOOTSTRAP_KEY = os.getenv("ADMIN_BOOTSTRAP_KEY", "")
DB_POOL_SIZE = int(os.getenv("DB_POOL_SIZE", "10"))
DB_MAX_OVERFLOW = int(os.getenv("DB_MAX_OVERFLOW", "20"))
DB_POOL_RECYCLE = int(os.getenv("DB_POOL_RECYCLE", "1800"))
LOGIN_RATE_LIMIT_WINDOW_SEC = int(os.getenv("LOGIN_RATE_LIMIT_WINDOW_SEC", "300"))
LOGIN_RATE_LIMIT_MAX_ATTEMPTS = int(os.getenv("LOGIN_RATE_LIMIT_MAX_ATTEMPTS", "5"))


def validate_runtime_config() -> None:
    missing = []

    if not DATABASE_URL:
        missing.append("DATABASE_URL")

    if not JWT_SECRET or JWT_SECRET.strip() in {"", "change_me"} or len(JWT_SECRET.strip()) < 16:
        missing.append("JWT_SECRET")

    if missing:
        raise RuntimeError(
            "Invalid runtime configuration. Set strong values for: " + ", ".join(sorted(missing))
        )
