# Deployment Plan

Date: 2026-03-16
Project: Loan System

## Objective

Deploy the current Loan System in a way that is:

- repeatable
- secure enough for controlled production use
- easier to scale
- easier to recover when failures happen

This plan assumes Docker-based deployment.

## Target Architecture

### Services

1. `frontend`
   - React/Vite static build
   - served by Nginx
   - proxies `/api/*` to backend

2. `backend`
   - Sanic API
   - async SQLAlchemy + asyncpg
   - JWT auth

3. `postgres`
   - main relational database
   - persistent Docker volume

4. `scoring service`
   - currently external or separate
   - configured through `SCORING_API_BASE`

## Files Added For Deployment

- [`docker-compose.yml`](./docker-compose.yml)
- [`.env.docker.example`](./.env.docker.example)
- [`loan_system_backend/Dockerfile`](./loan_system_backend/Dockerfile)
- [`loan_system_backend/.dockerignore`](./loan_system_backend/.dockerignore)
- [`loan_system_backend/.env.example`](./loan_system_backend/.env.example)
- [`loan-system-frontend/Dockerfile`](./loan-system-frontend/Dockerfile)
- [`loan-system-frontend/nginx.conf`](./loan-system-frontend/nginx.conf)
- [`loan-system-frontend/.dockerignore`](./loan-system-frontend/.dockerignore)
- [`loan-system-frontend/.env.example`](./loan-system-frontend/.env.example)

## Pre-Deployment Checklist

1. Install Docker Desktop or Docker Engine.
2. Confirm PostgreSQL port is free or change `POSTGRES_PORT`.
3. Confirm frontend port is free or change `FRONTEND_PORT`.
4. Set a strong `JWT_SECRET`.
5. Set a strong `POSTGRES_PASSWORD`.
6. Confirm `SCORING_API_BASE` points to the correct scoring service.
7. Backup current production or staging database before first rollout.

## Environment Setup

Create a root `.env` from [`.env.docker.example`](./.env.docker.example).

Minimum required changes:

```env
POSTGRES_DB=loan_system
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_strong_db_password
JWT_SECRET=your_long_random_secret
SCORING_API_BASE=http://your-scoring-service:8000
```

## First Deployment

From the project root:

```powershell
Copy-Item .env.docker.example .env
docker compose up --build -d
```

Check status:

```powershell
docker compose ps
```

Check logs:

```powershell
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f postgres
```

Frontend URL:

```text
http://localhost:8080
```

Backend URL:

```text
http://localhost:9000
```

If you deploy the containers separately on the same Docker network:

1. Use `loan-system-postgres` as the database host, or add a network alias of `postgres` to the Postgres container.
2. Do not use `localhost` inside the backend container for PostgreSQL.
3. Keep the database name as `loan_system`, not `loan system`.

## Smoke Test After Deployment

1. Open the frontend URL.
2. Confirm login page loads first.
3. Login as analyst.
4. Confirm analyst portal loads.
5. Search clients.
6. Create a new application using an existing creditline.
7. Create another application using a new creditline with interest rate.
8. Confirm payment plan appears on application details.
9. Edit payment plan and confirm term recalculates.
10. Delete a draft application and confirm generated orphan creditline does not remain visible.
11. Logout and confirm redirect to login.

## Rollback Plan

If deployment fails:

1. Stop the new containers:

```powershell
docker compose down
```

2. Restore the last known working image set or git revision.
3. Restore the database backup if schema/data changes caused the issue.
4. Bring services back up using the previous release.

## Operational Recommendations

### Good enough for first controlled deployment

- Docker-based isolation
- explicit environment variables
- backend config validation
- DB connection pooling
- login rate limiting
- tested core flows

### Next upgrades after initial deployment

1. Put Nginx or Traefik in front with HTTPS.
2. Move login throttling to Redis-backed shared rate limiting.
3. Move tokens from `localStorage` to cookie-based auth.
4. Move scoring to a background queue if scoring latency grows.
5. Add monitoring and alerting.
6. Add real browser E2E tests against staging.

## Known Remaining Risks

1. Schema changes still happen at backend startup.
2. Login rate limiting is in-memory only.
3. Frontend bundle is still large.
4. No centralized observability stack yet.
