import jwt
from datetime import datetime, timedelta, timezone
from passlib.context import CryptContext
from passlib.exc import UnknownHashError
from jwt import PyJWKClient

from app.auth_service import auth_mode_allows_local, auth_mode_uses_oidc
from app.config import (
    JWT_SECRET,
    JWT_ALG,
    JWT_EXPIRE_MIN,
    OIDC_AUDIENCE,
    OIDC_ISSUER,
    OIDC_JWKS_URL,
)

# Stable hashing (no bcrypt issues)
pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")
_oidc_jwk_client = None


def hash_password(pw: str) -> str:
    if pw is None or str(pw).strip() == "":
        raise ValueError("password is required")
    return pwd_context.hash(pw)


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return pwd_context.verify(pw, hashed)
    except UnknownHashError:
        return False
    except Exception:
        return False


def create_token(user_id: int, role: str) -> str:
    exp = datetime.now(timezone.utc) + timedelta(minutes=JWT_EXPIRE_MIN)
    payload = {
        "sub": str(user_id),
        "role": role,
        "exp": exp
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


def decode_local_token(token: str) -> dict:
    return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])


def _get_oidc_jwk_client() -> PyJWKClient:
    global _oidc_jwk_client
    if _oidc_jwk_client is None:
        _oidc_jwk_client = PyJWKClient(OIDC_JWKS_URL)
    return _oidc_jwk_client


def decode_oidc_token(token: str) -> dict:
    signing_key = _get_oidc_jwk_client().get_signing_key_from_jwt(token)
    kwargs = {
        "algorithms": ["RS256"],
        "issuer": OIDC_ISSUER,
        "options": {"verify_aud": bool(OIDC_AUDIENCE)},
    }
    if OIDC_AUDIENCE:
        kwargs["audience"] = OIDC_AUDIENCE
    return jwt.decode(token, signing_key.key, **kwargs)


def decode_token(token: str) -> dict:
    errors = []

    if auth_mode_allows_local():
        try:
            return decode_local_token(token)
        except Exception as exc:
            errors.append(exc)

    if auth_mode_uses_oidc():
        try:
            return decode_oidc_token(token)
        except Exception as exc:
            errors.append(exc)

    if errors:
        raise errors[-1]
    raise jwt.InvalidTokenError("No enabled authentication provider could decode the token")
