import os
from dotenv import load_dotenv

load_dotenv()

APP_HOST = os.getenv("APP_HOST", "0.0.0.0")
APP_PORT = int(os.getenv("APP_PORT", "9000"))
DATABASE_URL = os.getenv("DATABASE_URL")
SCORING_API_BASE = os.getenv("SCORING_API_BASE", "http://localhost:8000")
SCORING_API_KEY = os.getenv("SCORING_API_KEY", "").strip()
SCORING_API_TIMEOUT_SEC = int(os.getenv("SCORING_API_TIMEOUT_SEC", "90"))
CORS_ORIGINS = [origin.strip() for origin in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",") if origin.strip()]
AUTH_MODE = os.getenv("AUTH_MODE", "legacy").strip().lower()
if AUTH_MODE == "email_otp":
    AUTH_MODE = "email_code"
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
EMAIL_CODE_ALLOWED_ADMIN_EMAILS = {
    email.strip().lower()
    for email in os.getenv("EMAIL_CODE_ALLOWED_ADMIN_EMAILS", os.getenv("EMAIL_OTP_ALLOWED_ADMIN_EMAILS", "")).split(",")
    if email.strip()
}
EMAIL_CODE_ALLOWED_ANALYST_EMAILS = {
    email.strip().lower()
    for email in os.getenv("EMAIL_CODE_ALLOWED_ANALYST_EMAILS", os.getenv("EMAIL_OTP_ALLOWED_ANALYST_EMAILS", "")).split(",")
    if email.strip()
}
EMAIL_CODE_LENGTH = int(os.getenv("EMAIL_CODE_LENGTH", "6"))
EMAIL_CODE_TTL_MIN = int(os.getenv("EMAIL_CODE_TTL_MIN", "10"))
EMAIL_CODE_RESEND_COOLDOWN_SEC = int(os.getenv("EMAIL_CODE_RESEND_COOLDOWN_SEC", "60"))
EMAIL_CODE_MAX_VERIFY_ATTEMPTS = int(os.getenv("EMAIL_CODE_MAX_VERIFY_ATTEMPTS", "5"))
EMAIL_CODE_DELIVERY_TIMEOUT_SEC = int(os.getenv("EMAIL_CODE_DELIVERY_TIMEOUT_SEC", "20"))
EMAIL_CODE_DELIVERY_MODE = os.getenv("EMAIL_CODE_DELIVERY_MODE", "").strip().lower() or (
    "smtp" if os.getenv("SMTP_HOST", "").strip() else "log"
)
BREVO_API_KEY = os.getenv("BREVO_API_KEY", "").strip()
BREVO_API_BASE = os.getenv("BREVO_API_BASE", "https://api.brevo.com/v3").strip().rstrip("/")
BREVO_FROM_EMAIL = os.getenv("BREVO_FROM_EMAIL", "").strip()
BREVO_FROM_NAME = os.getenv("BREVO_FROM_NAME", "RCA Loan System").strip()
SMTP_HOST = os.getenv("SMTP_HOST", "").strip()
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USERNAME = os.getenv("SMTP_USERNAME", "").strip()
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "").strip()
SMTP_FROM_EMAIL = os.getenv("SMTP_FROM_EMAIL", "").strip()
SMTP_FROM_NAME = os.getenv("SMTP_FROM_NAME", "RCA Loan System").strip()
SMTP_USE_TLS = os.getenv("SMTP_USE_TLS", "true").strip().lower() == "true"
SMTP_USE_SSL = os.getenv("SMTP_USE_SSL", "false").strip().lower() == "true"
RESEND_API_KEY = os.getenv("RESEND_API_KEY", "").strip()
RESEND_API_BASE = os.getenv("RESEND_API_BASE", "https://api.resend.com").strip().rstrip("/")
RESEND_FROM_EMAIL = os.getenv("RESEND_FROM_EMAIL", SMTP_FROM_EMAIL).strip()
RESEND_FROM_NAME = os.getenv("RESEND_FROM_NAME", SMTP_FROM_NAME).strip()
AUTH_SESSION_COOKIE_NAME = os.getenv("AUTH_SESSION_COOKIE_NAME", "rca_session").strip()
AUTH_SESSION_COOKIE_SECURE = os.getenv("AUTH_SESSION_COOKIE_SECURE", "false").strip().lower() == "true"
AUTH_SESSION_COOKIE_SAMESITE = os.getenv(
    "AUTH_SESSION_COOKIE_SAMESITE",
    "None" if AUTH_SESSION_COOKIE_SECURE else "Lax",
).strip().capitalize()
AUTH_SESSION_HOURS = int(os.getenv("AUTH_SESSION_HOURS", "12"))
CREDITLINE_DELETE_UNDO_TTL_MIN = int(os.getenv("CREDITLINE_DELETE_UNDO_TTL_MIN", "30"))
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

    if SCORING_API_TIMEOUT_SEC < 5:
        missing.append("SCORING_API_TIMEOUT_SEC")

    if auth_mode in {"legacy", "hybrid"} and (
        not JWT_SECRET or JWT_SECRET.strip() in {"", "change_me"} or len(JWT_SECRET.strip()) < 16
    ):
        missing.append("JWT_SECRET")

    if auth_mode not in {"legacy", "oidc", "hybrid", "email_code"}:
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

    if auth_mode == "email_code":
        if not EMAIL_CODE_ALLOWED_ADMIN_EMAILS and not EMAIL_CODE_ALLOWED_ANALYST_EMAILS:
            missing.append("EMAIL_CODE_ALLOWED_ADMIN_EMAILS/EMAIL_CODE_ALLOWED_ANALYST_EMAILS")
        if EMAIL_CODE_LENGTH < 4 or EMAIL_CODE_LENGTH > 8:
            missing.append("EMAIL_CODE_LENGTH")
        if EMAIL_CODE_DELIVERY_MODE not in {"smtp", "log", "resend", "brevo"}:
            missing.append("EMAIL_CODE_DELIVERY_MODE")
        if EMAIL_CODE_DELIVERY_TIMEOUT_SEC < 5:
            missing.append("EMAIL_CODE_DELIVERY_TIMEOUT_SEC")
        if EMAIL_CODE_DELIVERY_MODE == "brevo":
            if not BREVO_API_KEY:
                missing.append("BREVO_API_KEY")
            if not BREVO_FROM_EMAIL:
                missing.append("BREVO_FROM_EMAIL")
        if EMAIL_CODE_DELIVERY_MODE == "smtp":
            if not SMTP_HOST:
                missing.append("SMTP_HOST")
            if not SMTP_FROM_EMAIL:
                missing.append("SMTP_FROM_EMAIL")
            if not SMTP_USERNAME:
                missing.append("SMTP_USERNAME")
            if not SMTP_PASSWORD:
                missing.append("SMTP_PASSWORD")
        if EMAIL_CODE_DELIVERY_MODE == "resend":
            if not RESEND_API_KEY:
                missing.append("RESEND_API_KEY")
            if not RESEND_FROM_EMAIL:
                missing.append("RESEND_FROM_EMAIL")
        if AUTH_SESSION_COOKIE_SAMESITE not in {"Lax", "Strict", "None"}:
            missing.append("AUTH_SESSION_COOKIE_SAMESITE")

    if missing:
        raise RuntimeError(
            "Invalid runtime configuration. Set strong values for: " + ", ".join(sorted(missing))
        )
