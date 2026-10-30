# NEW: CLI-ONLY AWS DEPLOYMENT

**Start with [AWS_DEPLOYMENT_COMMANDS.md](AWS_DEPLOYMENT_COMMANDS.md) for AWS login, one-command provision/deploy, public HTTPS URL, testing, updates, React CORS, and cleanup.**

# AWS-ready URL Shortener — JavaScript

Two backend choices, **each** with PostgreSQL, one precise expiration contract, protected owner-scoped management APIs, Docker packaging, and a retained agentic SDLC CLI (from the interview prototype).

## Files

- `NodeJS/` — Node 22, PostgreSQL `pg`, Cognito access-token validation (`aws-jwt-verify`), SQL schema, container, workflow CLI.
- `aws/terraform/` — Example HTTPS ALB + ECS Fargate + private RDS PostgreSQL + Secrets Manager + CloudWatch log group + optional Route 53.
- `frontend-example/` — Browser-safe fetch client and React/Vite integration notes.
- `postman/` — Bearer/JWT API collections and environments; run with real access tokens.
- `aws/DEPLOY.md` — AWS setup and deployment steps.

## Quick start: run ONE backend locally with real PostgreSQL

Requires Docker and Docker Compose.

**Node.js**:

```bash
cd NodeJS
docker compose up --build
# API on http://localhost:3000
```

Both use development-only API key `local-demo-key`. The database persists in a Docker named volume. Never deploy these Compose development secrets or key to AWS.

## API contract (six API operations + readiness)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/v1/links` | Bearer access token (prod) | Create short link |
| GET | `/api/v1/links` | Bearer | List current user's links (paginated) |
| GET | `/api/v1/links/{code}/analytics` | Bearer | Owner-only analytics |
| DELETE | `/api/v1/links/{code}` | Bearer | Soft revoke; code never reused |
| GET | `/{code}` | Public | 302 redirect; expired or revoked -> 410 |
| GET | `/health` | Public | Liveness |
| GET | `/ready` | Public | Database readiness; ALB health check |

### Expiration rules

- Accept one of `ttlHours` (integer 1–8760), or `expiresAt` (ISO-8601 with explicit timezone, e.g. `2026-11-01T12:00:00Z`).
- Neither supplied: **30 days by default**.
- A link must expire more than one minute in the future and no later than 365 days after creation.
- Persist UTC instant in `TIMESTAMPTZ`; redirect checks expiration in PostgreSQL **on each request**, not only a cron job.
- Expired/revoked: HTTP **410 Gone**, no click recorded.
- Cleanup is a **separate** task. Keep expired records for 90 days after expiration (default) for retention; deletion can eventually make an old link return 404 instead of 410. Avoid running purge during test evidence capture.

### Example local create

```bash
curl -i -X POST http://localhost:3000/api/v1/links \
 -H 'Content-Type: application/json' -H 'X-API-Key: local-demo-key' \
 -H 'Idempotency-Key: create-link-001' \
 -d '{"url":"https://example.org/path","alias":"demo2026","expiresAt":"2026-12-31T23:59:59Z"}'
```

## API responses

Created: `201` (`200` for idempotent replay), body includes `code`, `shortUrl`, `destination`, `createdAt`, `expiresAt`, `replay`.
Management errors: `400` bad input, `401` no/invalid token, `404` not owned or not found, `409` duplicate alias/idempotency conflict, `429` local rate limit, `503` code allocation failure.
`GET /api/v1/links?page=0&size=20` returns `{items, page, size, total}`. Maximum size is 100. `DELETE` returns `204` and is idempotent for the same owner.

## Production caveats

This package is **deployment-oriented, not independently production-certified**. Both codebases and Terraform need real AWS environment integration tests, traffic/load tests, security review, observability alerts, WAF, backups/restore drills, secret rotation, CI checks, and operational ownership before a live public launch. Docker/Java/Maven/Terraform/RDS could not be executed in the authoring environment; inspect `TEST_REPORT.md` for exact validation evidence.

## Agentic assignment

The existing workflow code (`NodeJS/src/workflow.mjs`) is preserved for greenfield/brownfield/ambiguous scenario demonstrations. It is a **separate orchestration CLI** from the deployed HTTP server: do not assume it is a live autonomous LLM service.
