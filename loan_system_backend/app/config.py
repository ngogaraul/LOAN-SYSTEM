import os
from dotenv import load_dotenv

load_dotenv()

APP_HOST = os.getenv("APP_HOST", "0.0.0.0")
APP_PORT = int(os.getenv("APP_PORT", "9000"))
DATABASE_URL = os.getenv("DATABASE_URL")
SCORING_API_BASE = os.getenv("SCORING_API_BASE", "http://localhost:8000")
SCORING_API_KEY = os.getenv("SCORING_API_KEY", "").strip()
CORS_ORIGINS = [origin.strip() for origin in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",") if origin.strip()]
AUTH_MODE = os.getenv("AUTH_MODE", "legacy").strip().lower()
JWT_SECRET = os.getenv("JWT_SECRET", "change_me")
JWT_ALG = os.getenv("JWT_ALG", "HS256")
JWT_EXPIRE_MIN = int(os.getenv("JWT_EXPIRE_MIN", "480"))
OIDC_ISSUER = os.getenv("OIDC_ISSUER", "").strip()
OIDC_TOKEN_URL = os.getenv("OIDC_TOKEN_URL", "").strip()
OIDC_JWKS_URL = os.getenv("OIDC_JWKS_URL", "").strip()
OIDC_AUDIENCE = os.getenv("OIDC_AUDIENCE", "").strip()
OIDC_CLIENT_ID = os.getenv("OIDC_CLIENT_ID", "").strip()
OIDC_CLIENT_SECRET = os.getenv("OIDC_CLIENT_SECRET", "").strip()
OIDC_SCOPE = os.getenv("OIDC_SCOPE", "openid profile email").strip()
OIDC_ADMIN_ROLE = os.getenv("OIDC_ADMIN_ROLE", "ADMIN").strip().upper()
OIDC_ANALYST_ROLE = os.getenv("OIDC_ANALYST_ROLE", "ANALYST").strip().upper()
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "").strip()
GOOGLE_ALLOWED_ADMIN_EMAILS = {
    email.strip().lower()
    for email in os.getenv("GOOGLE_ALLOWED_ADMIN_EMAILS", "").split(",")
    if email.strip()
}
GOOGLE_ALLOWED_ANALYST_EMAILS = {
    email.strip().lower()
    for email in os.getenv("GOOGLE_ALLOWED_ANALYST_EMAILS", "").split(",")
    if email.strip()
}
ADMIN_BOOTSTRAP_KEY = os.getenv("ADMIN_BOOTSTRAP_KEY", "")
DB_POOL_SIZE = int(os.getenv("DB_POOL_SIZE", "10"))
DB_MAX_OVERFLOW = int(os.getenv("DB_MAX_OVERFLOW", "20"))
DB_POOL_RECYCLE = int(os.getenv("DB_POOL_RECYCLE", "1800"))
LOGIN_RATE_LIMIT_WINDOW_SEC = int(os.getenv("LOGIN_RATE_LIMIT_WINDOW_SEC", "300"))
LOGIN_RATE_LIMIT_MAX_ATTEMPTS = int(os.getenv("LOGIN_RATE_LIMIT_MAX_ATTEMPTS", "5"))
REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0").strip()
API_CACHE_TTL_SEC = int(os.getenv("API_CACHE_TTL_SEC", "30"))
API_CACHE_NAMESPACE = os.getenv("API_CACHE_NAMESPACE", "loan-system:api-cache").strip()
BACKGROUND_SCORING_ENABLED = os.getenv("BACKGROUND_SCORING_ENABLED", "true").strip().lower() == "true"
BACKGROUND_SCORING_INTERVAL_SEC = int(os.getenv("BACKGROUND_SCORING_INTERVAL_SEC", "30"))
BACKGROUND_SCORING_BATCH_SIZE = int(os.getenv("BACKGROUND_SCORING_BATCH_SIZE", "10"))
SCORE_QUEUE_NAME = os.getenv("SCORE_QUEUE_NAME", "loan-system:score-jobs").strip()


def validate_runtime_config() -> None:
    missing = []
    auth_mode = AUTH_MODE or "legacy"

    if not DATABASE_URL:
        missing.append("DATABASE_URL")

    if auth_mode in {"legacy", "hybrid"} and (
        not JWT_SECRET or JWT_SECRET.strip() in {"", "change_me"} or len(JWT_SECRET.strip()) < 16
    ):
        missing.append("JWT_SECRET")

    if auth_mode not in {"legacy", "oidc", "hybrid", "google"}:
        missing.append("AUTH_MODE")

    if auth_mode in {"oidc", "hybrid"}:
        if not OIDC_ISSUER:
            missing.append("OIDC_ISSUER")
        if not OIDC_TOKEN_URL:
            missing.append("OIDC_TOKEN_URL")
        if not OIDC_JWKS_URL:
            missing.append("OIDC_JWKS_URL")
        if not OIDC_CLIENT_ID:
            missing.append("OIDC_CLIENT_ID")

    if auth_mode == "google":
        if not GOOGLE_CLIENT_ID:
            missing.append("GOOGLE_CLIENT_ID")
        if not GOOGLE_ALLOWED_ADMIN_EMAILS and not GOOGLE_ALLOWED_ANALYST_EMAILS:
            missing.append("GOOGLE_ALLOWED_ADMIN_EMAILS/GOOGLE_ALLOWED_ANALYST_EMAILS")

    if missing:
        raise RuntimeError(
            "Invalid runtime configuration. Set strong values for: " + ", ".join(sorted(missing))
        )
