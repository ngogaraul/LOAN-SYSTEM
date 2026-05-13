from __future__ import annotations

import asyncio
import hashlib
import hmac
import secrets
import smtplib
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage

import httpx
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import (
    AUTH_SESSION_HOURS,
    BREVO_API_BASE,
    BREVO_API_KEY,
    BREVO_FROM_EMAIL,
    BREVO_FROM_NAME,
    EMAIL_CODE_DELIVERY_MODE,
    EMAIL_CODE_DELIVERY_TIMEOUT_SEC,
    EMAIL_CODE_LENGTH,
    EMAIL_CODE_RESEND_COOLDOWN_SEC,
    EMAIL_CODE_TTL_MIN,
    JWT_SECRET,
    RESEND_API_BASE,
    RESEND_API_KEY,
    RESEND_FROM_EMAIL,
    RESEND_FROM_NAME,
    SMTP_FROM_EMAIL,
    SMTP_FROM_NAME,
    SMTP_HOST,
    SMTP_PASSWORD,
    SMTP_PORT,
    SMTP_USERNAME,
    SMTP_USE_SSL,
    SMTP_USE_TLS,
)
from app.models import LoginCode, User, UserSession


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def hash_secret(value: str) -> str:
    return hashlib.sha256(f"{JWT_SECRET}:{value}".encode("utf-8")).hexdigest()


def generate_login_code() -> str:
    max_value = 10 ** EMAIL_CODE_LENGTH
    return str(secrets.randbelow(max_value)).zfill(EMAIL_CODE_LENGTH)


def generate_session_token() -> str:
    return secrets.token_urlsafe(48)


async def ensure_code_not_rate_limited(session: AsyncSession, email: str) -> None:
    latest_code = await session.scalar(
        select(LoginCode)
        .where(LoginCode.email == email)
        .order_by(LoginCode.created_at.desc())
        .limit(1)
    )
    if not latest_code:
        return
    elapsed = (utc_now() - latest_code.created_at).total_seconds()
    if elapsed < EMAIL_CODE_RESEND_COOLDOWN_SEC:
        remaining = int(max(1, EMAIL_CODE_RESEND_COOLDOWN_SEC - elapsed))
        raise ValueError(f"Please wait {remaining} seconds before requesting another code.")


async def issue_login_code(session: AsyncSession, user: User) -> str:
    await ensure_code_not_rate_limited(session, user.email)

    code = generate_login_code()
    expires_at = utc_now() + timedelta(minutes=EMAIL_CODE_TTL_MIN)

    await session.execute(
        delete(LoginCode).where(
            LoginCode.email == user.email,
            LoginCode.used_at.is_(None),
        )
    )
    session.add(
        LoginCode(
            user_id=user.id,
            email=user.email,
            role=user.role,
            code_hash=hash_secret(code),
            expires_at=expires_at,
        )
    )
    await session.commit()
    return code


async def verify_login_code(session: AsyncSession, email: str, code: str) -> User:
    record = await session.scalar(
        select(LoginCode)
        .where(
            LoginCode.email == email,
            LoginCode.used_at.is_(None),
        )
        .order_by(LoginCode.created_at.desc())
        .limit(1)
    )
    if not record:
        raise ValueError("No active login code found for this email.")
    if record.expires_at < utc_now():
        raise ValueError("The login code has expired. Request a new one.")
    if not hmac.compare_digest(record.code_hash, hash_secret(code)):
        raise ValueError("The login code is invalid.")

    record.used_at = utc_now()
    user = await session.get(User, record.user_id)
    await session.commit()
    if not user:
        raise ValueError("The linked user account was not found.")
    return user


async def create_user_session(session: AsyncSession, user: User) -> str:
    token = generate_session_token()
    expires_at = utc_now() + timedelta(hours=AUTH_SESSION_HOURS)
    session.add(
        UserSession(
            user_id=user.id,
            session_hash=hash_secret(token),
            expires_at=expires_at,
        )
    )
    await session.commit()
    return token


async def get_user_for_session(session: AsyncSession, token: str) -> User | None:
    session_row = await session.scalar(
        select(UserSession)
        .where(
            UserSession.session_hash == hash_secret(token),
            UserSession.revoked_at.is_(None),
        )
        .limit(1)
    )
    if not session_row:
        return None
    if session_row.expires_at < utc_now():
        session_row.revoked_at = utc_now()
        await session.commit()
        return None

    session_row.last_used_at = utc_now()
    user = await session.get(User, session_row.user_id)
    await session.commit()
    return user


async def revoke_session(session: AsyncSession, token: str) -> None:
    session_row = await session.scalar(
        select(UserSession)
        .where(
            UserSession.session_hash == hash_secret(token),
            UserSession.revoked_at.is_(None),
        )
        .limit(1)
    )
    if not session_row:
        return
    session_row.revoked_at = utc_now()
    await session.commit()


def _send_smtp_email(to_email: str, subject: str, html_body: str, text_body: str) -> None:
    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = f"{SMTP_FROM_NAME} <{SMTP_FROM_EMAIL}>"
    message["To"] = to_email
    message.set_content(text_body)
    message.add_alternative(html_body, subtype="html")

    if SMTP_USE_SSL:
        with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, timeout=EMAIL_CODE_DELIVERY_TIMEOUT_SEC) as server:
            if SMTP_USERNAME:
                server.login(SMTP_USERNAME, SMTP_PASSWORD)
            server.send_message(message)
        return

    with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=EMAIL_CODE_DELIVERY_TIMEOUT_SEC) as server:
        if SMTP_USE_TLS:
            server.starttls()
        if SMTP_USERNAME:
            server.login(SMTP_USERNAME, SMTP_PASSWORD)
        server.send_message(message)


async def _send_resend_email(to_email: str, subject: str, html_body: str, text_body: str) -> None:
    payload = {
        "from": f"{RESEND_FROM_NAME} <{RESEND_FROM_EMAIL}>",
        "to": [to_email],
        "subject": subject,
        "html": html_body,
        "text": text_body,
    }
    headers = {
        "Authorization": f"Bearer {RESEND_API_KEY}",
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=EMAIL_CODE_DELIVERY_TIMEOUT_SEC) as client:
        response = await client.post(f"{RESEND_API_BASE}/emails", headers=headers, json=payload)

    if response.status_code >= 400:
        detail = response.text.strip()
        raise RuntimeError(
            f"Resend API error ({response.status_code})"
            + (f": {detail}" if detail else "")
        )


async def _send_brevo_email(to_email: str, subject: str, html_body: str, text_body: str) -> None:
    payload = {
        "sender": {
            "name": BREVO_FROM_NAME,
            "email": BREVO_FROM_EMAIL,
        },
        "to": [
            {
                "email": to_email,
            }
        ],
        "subject": subject,
        "htmlContent": html_body,
        "textContent": text_body,
    }
    headers = {
        "api-key": BREVO_API_KEY,
        "accept": "application/json",
        "content-type": "application/json",
    }

    async with httpx.AsyncClient(timeout=EMAIL_CODE_DELIVERY_TIMEOUT_SEC) as client:
        response = await client.post(f"{BREVO_API_BASE}/smtp/email", headers=headers, json=payload)

    if response.status_code >= 400:
        detail = response.text.strip()
        raise RuntimeError(
            f"Brevo API error ({response.status_code})"
            + (f": {detail}" if detail else "")
        )


async def deliver_login_code(email: str, code: str, role: str) -> None:
    subject = "Your Loan System login code"
    text_body = (
        f"Hello,\n\n"
        f"Your one-time login code for the {role.title()} portal is: {code}\n\n"
        f"This code expires in {EMAIL_CODE_TTL_MIN} minutes."
    )
    html_body = (
        f"<h2>Loan System login code</h2>"
        f"<p>Your one-time login code for the <strong>{role.title()}</strong> portal is:</p>"
        f"<p style='font-size:28px;font-weight:bold;letter-spacing:4px;'>{code}</p>"
        f"<p>This code expires in {EMAIL_CODE_TTL_MIN} minutes.</p>"
    )

    if EMAIL_CODE_DELIVERY_MODE == "log":
        print(f"[EMAIL_CODE_DEBUG] email={email} role={role} code={code}")
        return

    if EMAIL_CODE_DELIVERY_MODE == "resend":
        await _send_resend_email(email, subject, html_body, text_body)
        return

    if EMAIL_CODE_DELIVERY_MODE == "brevo":
        await _send_brevo_email(email, subject, html_body, text_body)
        return

    try:
        await asyncio.wait_for(
            asyncio.to_thread(_send_smtp_email, email, subject, html_body, text_body),
            timeout=EMAIL_CODE_DELIVERY_TIMEOUT_SEC,
        )
    except asyncio.TimeoutError as exc:
        raise RuntimeError("SMTP delivery timed out.") from exc
