# Production Deployment Checklist

## Before First Deploy

1. Copy [.env.production.example](/C:/Users/ngoga/Desktop/new/.env.production.example) to a real `.env.production` file and replace every placeholder secret.
2. Provision managed PostgreSQL and confirm:
   - TLS is enabled if your provider requires it.
   - the `loan_system` database exists.
   - the DB user has create/alter privileges for the app startup schema checks.
3. Provision Redis for:
   - shared API cache
   - scoring job queue
4. Confirm your OIDC provider values:
   - `OIDC_ISSUER`
   - `OIDC_TOKEN_URL`
   - `OIDC_JWKS_URL`
   - `OIDC_CLIENT_ID`
   - `OIDC_CLIENT_SECRET`
5. Set a strong `JWT_SECRET` even when running OIDC mode.
6. Set a strong `SCORING_API_KEY`.

## Recommended Topology

- `frontend`: static nginx container
- `backend`: 2-3 replicas behind a load balancer
- `scoring-worker`: 2+ replicas for queued scoring jobs
- `scoring-api`: 2+ replicas if model inference volume is high
- managed PostgreSQL
- Redis

## Production Compose Run

Use the production compose file with the production env file:

```powershell
docker compose --env-file .env.production -f docker-compose.production.yml up -d --build
```

To scale service replicas:

```powershell
docker compose --env-file .env.production -f docker-compose.production.yml up -d --scale backend=3 --scale scoring-api=2 --scale scoring-worker=3
```

## Post-Deploy Verification

1. Open the frontend URL and verify login.
2. Check backend health:
   - `GET /api/health`
3. Check scoring API health by container logs or direct service routing.
4. Create a test application and verify:
   - manual scoring returns immediately
   - stale applications are later rescored by the worker
5. Update client financials and confirm the related application becomes stale and is rescored.
6. Approve or reject an application and confirm the dashboard updates correctly.

## Observability

Add these before relying on production:

- container log shipping
- PostgreSQL monitoring
- Redis monitoring
- uptime checks on frontend and backend
- alerting on worker failures and queue growth

## Rollback Plan

1. Keep the previous image tag available.
2. Back up PostgreSQL before schema-affecting releases.
3. If a release fails:
   - scale traffic away from the new backend
   - redeploy the previous backend and worker images
   - keep Redis if only app code changed

## Capacity Test Gate

Do not finalize production sizing until the k6 scripts in [load-tests/README.md](/C:/Users/ngoga/Desktop/new/load-tests/README.md) have been run against a production-like environment.
