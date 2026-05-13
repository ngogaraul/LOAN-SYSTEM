from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import (
    AUTH_MODE,
    EMAIL_OTP_ALLOWED_ADMIN_EMAILS,
    EMAIL_OTP_ALLOWED_ANALYST_EMAILS,
    OIDC_ADMIN_ROLE,
    OIDC_ANALYST_ROLE,
)
from app.models import User


def auth_mode_uses_oidc() -> bool:
    return AUTH_MODE in {"oidc", "hybrid"}


def auth_mode_uses_email_otp() -> bool:
    return AUTH_MODE == "email_otp"


def auth_mode_allows_local() -> bool:
    return AUTH_MODE in {"legacy", "hybrid"}


def auth_mode_uses_external() -> bool:
    return auth_mode_uses_oidc() or auth_mode_uses_email_otp()


def _normalized_roles(payload: dict[str, Any]) -> set[str]:
    roles: set[str] = set()

    realm_access = payload.get("realm_access")
    if isinstance(realm_access, dict):
        roles.update(str(role).strip().upper() for role in realm_access.get("roles", []) if role)

    for key in ("roles", "groups"):
        raw_values = payload.get(key)
        if isinstance(raw_values, (list, tuple, set)):
            roles.update(str(role).strip().upper().lstrip("/") for role in raw_values if role)

    return {role for role in roles if role}


def claims_to_profile(payload: dict[str, Any]) -> dict[str, Any]:
    roles = _normalized_roles(payload)

    role = "ANALYST"
    if OIDC_ADMIN_ROLE in roles or "ADMIN" in roles:
        role = "ADMIN"
    elif OIDC_ANALYST_ROLE in roles or "ANALYST" in roles:
        role = "ANALYST"

    email = str(payload.get("email") or "").strip().lower() or None
    preferred_username = str(payload.get("preferred_username") or "").strip()
    name = (
        str(payload.get("name") or "").strip()
        or preferred_username
        or email
        or "User"
    )

    return {
        "external_subject": str(payload.get("sub") or "").strip() or None,
        "email": email,
        "name": name,
        "role": role,
    }


def email_otp_claims_to_profile(payload: dict[str, Any]) -> dict[str, Any]:
    email = str(payload.get("email") or "").strip().lower()
    if not email:
        raise ValueError("OTP identity is missing email")

    if email in EMAIL_OTP_ALLOWED_ADMIN_EMAILS:
        role = "ADMIN"
    elif email in EMAIL_OTP_ALLOWED_ANALYST_EMAILS:
        role = "ANALYST"
    else:
        raise PermissionError("This email is not allowed to access the system")

    return {
        "external_subject": str(payload.get("sub") or "").strip() or None,
        "email": email,
        "name": str(payload.get("email") or "").strip() or email,
        "role": role,
    }


async def sync_user_from_claims(session: AsyncSession, payload: dict[str, Any]) -> User:
    profile = claims_to_profile(payload)
    external_subject = profile["external_subject"]
    email = profile["email"]

    if not external_subject and not email:
        raise ValueError("OIDC token missing both subject and email")

    user = None
    if external_subject:
        user = await session.scalar(
            select(User).where(User.external_subject == external_subject)
        )

    if not user and email:
        user = await session.scalar(select(User).where(User.email == email))

    if not user:
        user = User(
            name=profile["name"],
            email=email or f"{external_subject}@external.local",
            password_hash="EXTERNAL_AUTH",
            role=profile["role"],
            external_subject=external_subject,
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)
        return user

    changed = False
    if profile["name"] and user.name != profile["name"]:
        user.name = profile["name"]
        changed = True
    if email and user.email != email:
        user.email = email
        changed = True
    if external_subject and user.external_subject != external_subject:
        user.external_subject = external_subject
        changed = True
    if user.role != profile["role"]:
        user.role = profile["role"]
        changed = True

    if changed:
        await session.commit()
        await session.refresh(user)

    return user


async def sync_user_from_email_otp_claims(session: AsyncSession, payload: dict[str, Any]) -> User:
    profile = email_otp_claims_to_profile(payload)
    external_subject = profile["external_subject"]
    email = profile["email"]

    user = None
    if external_subject:
        user = await session.scalar(select(User).where(User.external_subject == external_subject))

    if not user and email:
        user = await session.scalar(select(User).where(User.email == email))

    if not user:
        user = User(
            name=profile["name"],
            email=email,
            password_hash="EXTERNAL_AUTH",
            role=profile["role"],
            external_subject=external_subject,
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)
        return user

    changed = False
    if user.name != profile["name"]:
        user.name = profile["name"]
        changed = True
    if user.role != profile["role"]:
        user.role = profile["role"]
        changed = True
    if external_subject and user.external_subject != external_subject:
        user.external_subject = external_subject
        changed = True

    if changed:
        await session.commit()
        await session.refresh(user)

    return user
