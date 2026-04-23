# Load Tests

These scripts use [k6](https://k6.io/) to measure real throughput and latency before production sizing.

## Install k6

Windows:

```powershell
winget install k6.k6
```

## Auth Options

The scripts support either:

- `ACCESS_TOKEN` directly, or
- OIDC password grant values for a test user

Required when not passing `ACCESS_TOKEN`:

- `OIDC_USERNAME`
- `OIDC_PASSWORD`

Optional:

- `BACKEND_LOGIN_URL`

If `BACKEND_LOGIN_URL` is omitted, the scripts will use `BASE_URL + /auth/login`.

## Browse Test

This simulates authenticated dashboard/list traffic.

```powershell
k6 run `
  -e BASE_URL=http://localhost:9000 `
  -e OIDC_USERNAME=analyst@loan.local `
  -e OIDC_PASSWORD=Analyst123! `
  .\load-tests\browse.js
```

## Scoring Test

This exercises the scoring endpoint. Point it at a non-finalized application.

```powershell
k6 run `
  -e BASE_URL=http://localhost:9000 `
  -e OIDC_USERNAME=analyst@loan.local `
  -e OIDC_PASSWORD=Analyst123! `
  -e APPLICATION_ID=2 `
  .\load-tests\scoring.js
```

## What To Watch

- `http_req_duration` p95 and p99
- `http_req_failed`
- score endpoint latency
- backend CPU and memory
- scoring-api CPU and memory
- Redis memory
- PostgreSQL CPU, connections, and slow queries
