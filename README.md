# Loan System

Monorepo containing the Loan System backend and frontend applications.

## Overview

- **Backend:** Sanic-based API (Python) located in `loan_system_backend/`.
- **Frontend:** React + Vite UI located in `loan-system-frontend/`.

This repository provides the API and a simple web UI for managing clients, applications, scoring, and decisions.

## Repository structure

- `loan_system_backend/` — Python backend, dependencies in `requirements.txt`, main app in `app/`.
- `loan-system-frontend/` — Frontend built with React and Vite.
- `README.md` — This file.
- `.gitignore` — Root gitignore for the project.

## Prerequisites

- Python 3.11+ (recommended)
- Node.js 18+ and npm/yarn
- A database supported by SQLAlchemy (set via `DATABASE_URL`)

## Environment variables

The backend loads environment variables (via python-dotenv if present). Important vars include:

- `APP_HOST` — backend host (default `0.0.0.0`)
- `APP_PORT` — backend port (default `9000`)
- `DATABASE_URL` — database connection URL (required)
- `SCORING_API_BASE` — scoring service base URL (default `http://localhost:8000`)
- `SCORING_API_KEY` — API key used by the backend to call the scoring service
- `AUTH_MODE` — `legacy`, `oidc`, `hybrid`, or `email_code` (Docker defaults to `oidc`)
- `JWT_SECRET` — JWT signing secret (default `change_me`)
- `JWT_ALG` — JWT algorithm (default `HS256`)
- `JWT_EXPIRE_MIN` — JWT expiry in minutes (default `480`)
- `EMAIL_CODE_ALLOWED_ADMIN_EMAILS` — comma-separated approved admin emails for email-code login
- `EMAIL_CODE_ALLOWED_ANALYST_EMAILS` — comma-separated approved analyst emails for email-code login
- `EMAIL_CODE_LENGTH` — number of digits in the one-time login code
- `EMAIL_CODE_TTL_MIN` — minutes before a login code expires
- `EMAIL_CODE_RESEND_COOLDOWN_SEC` — resend cooldown for requesting another login code
- `EMAIL_CODE_DELIVERY_TIMEOUT_SEC` — timeout for external email delivery requests
- `EMAIL_CODE_DELIVERY_MODE` — `resend`, `smtp`, or `log`
- `AUTH_SESSION_COOKIE_NAME` — HttpOnly session cookie name (default `rca_session`)
- `AUTH_SESSION_COOKIE_SECURE` — whether the session cookie requires HTTPS
- `AUTH_SESSION_HOURS` — session lifetime in hours
- `SMTP_HOST` / `SMTP_PORT` / `SMTP_USERNAME` / `SMTP_PASSWORD` — SMTP settings for code delivery
- `SMTP_FROM_EMAIL` / `SMTP_FROM_NAME` — sender details for login code emails
- `RESEND_API_KEY` / `RESEND_API_BASE` — Resend API credentials for hosted code delivery
- `RESEND_FROM_EMAIL` / `RESEND_FROM_NAME` — sender details when `EMAIL_CODE_DELIVERY_MODE=resend`
- `OIDC_ISSUER` — OIDC issuer URL for the external identity provider
- `OIDC_TOKEN_URL` — token endpoint used by `/auth/login` when OIDC mode is enabled
- `OIDC_JWKS_URL` — JWKS endpoint used to verify external access tokens
- `OIDC_CLIENT_ID` — OIDC client id
- `ADMIN_BOOTSTRAP_KEY` — optional bootstrap admin key

Create a `.env` file in `loan_system_backend/` with the values you need, for example:

```
DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/loans
JWT_SECRET=supersecret
APP_PORT=9000
```

## Setup & Run

Backend (Windows example):

```powershell
cd "loan_system_backend"
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
python -m app.main
```

Notes:
- The backend uses Sanic (`app/main.py`). If you prefer, run with a process manager or container.
- In Docker, the backend defaults to `AUTH_MODE=oidc` and authenticates against the bundled Keycloak service.
- In `AUTH_MODE=email_code`, the backend generates one-time codes, stores only their hashes, delivers them by Resend, SMTP, or log mode, and creates an HttpOnly browser session after verification.
- In Docker, the trained scoring model API is included as `scoring-api` on port `8000`.
- Redis now backs the shared API cache and the scoring job queue.
- Background scoring is queue-based and handled by the `scoring-worker` service.
- Demo accounts from the imported realm:
  - `admin@loan.local` / `Admin123!`
  - `analyst@loan.local` / `Analyst123!`

Frontend:

```bash
cd "loan-system-frontend"
npm install
npm run dev
```

Open the frontend dev server (Vite) in your browser (usually http://localhost:5173).

## Development notes

- API origin is allowed for `http://localhost:5173` in the backend CORS config (adjust as needed).
- Backend routes are registered under `loan_system_backend/app/routes/`.
- Frontend source is under `loan-system-frontend/src/`.
- User creation/deletion is disabled in-app when `AUTH_MODE` uses external identity (`oidc`) because account lifecycle is provider-managed.
- Manual scoring remains immediate via the score button, while stale applications are enqueued and rescored by workers.
- For production deployment guidance, use [docs/production-checklist.md](/C:/Users/ngoga/Desktop/new/docs/production-checklist.md).
- For capacity testing, use [load-tests/README.md](/C:/Users/ngoga/Desktop/new/load-tests/README.md).

## Contributing

1. Create a branch for your change.
2. Run tests and linters locally (none included by default).
3. Open a PR with a clear description.

# BANK-LOAN-EVALUATION-SYSTEM
