# Production-oriented architecture and engineering decisions

```text
             Browser frontend (React / Vite)
             Cognito OAuth2 authorization-code + PKCE
                           |
                   ACCESS TOKEN (JWT)
                           |
                 HTTPS / DNS + ACM
                           |
                      AWS WAF *
                           |
                Public ALB (443 / TLS)
                           |
                ECS Fargate tasks (2)
          either Node 22 or Spring Boot 3
              auth, validation, owner ACL
              link creation, list, revocation
                    redirect service
                           |
             RDS PostgreSQL (PRIVATE)
        links / idempotency / click_events
                           |
                CloudWatch / backup

* WAF not automatically provisioned by the included Terraform.
```

## API request and data-flow decisions

- Cognito access tokens are validated by the **backend**, including JWT signature/expiry, `token_use=access`, issuer and app client. The subject (`sub`) is the owner key. Do not expose an API key in a public SPA.
- Create: validate URL, one expiration setting, code uniqueness, owner-scoped idempotency; transaction saves link + idempotency together. Aliases cannot shadow API/health paths.
- Redirect: public; atomically increments `click_count` in PostgreSQL only when `expires_at > NOW()` and `revoked_at IS NULL`, adds hashed visitor event in the same transaction, returns `302` with a no-store cache policy. Expired/revoked returns `410`.
- List/analytics/revoke: authenticated and owner-scoped. Unknown and unowned codes both return `404` to prevent enumeration.
- Database runs in private RDS subnets; task SG allows inbound from ALB SG only, DB SG accepts 5432 only from task SG. Production mode refuses an API-key-only setup. RDS and HMAC secrets are sourced from AWS Secrets Manager.
- Browser CORS is an exact origin allowlist, not `*`. TLS termination happens at the ALB; outbound RDS TLS is enforced with `verify-full` and RDS trust bundle in the image.
- Uniqueness and idempotency are guarded in PostgreSQL across multiple replicas (Node uses advisory transaction locks for request keys; Java catches unique violations and resolves the winning idempotent request after rollback).
- Link codes are generated with cryptographic RNG. They are not encrypted secrets; access control applies to management APIs, not public redirects.
- Visitor analytics store a truncated HMAC of the visitor IP, not raw IP. Trust `X-Forwarded-For` **only** when the service is exclusively behind a configured ALB. Per-owner in-process quotas are soft gates; use WAF/API Gateway for distributed abuse controls.

## Expiry and retention

`ttlHours=48` and `expiresAt=...Z` normalize into PostgreSQL `TIMESTAMPTZ`. Neither means 30 days by default. Values must be 1–8760 hours or explicit ISO-8601 date-time with timezone, and expire within 365 days of creation. Redirect checks expiration synchronously in the DB. The nightly optional cleanup deletes records **more than 90 days after expiration**, cascades analytics and idempotency records, and therefore eventually switches expired URLs from `410` to `404` after deletion.

## Boundaries and risks

- A single hot short code increments one DB row per click, which limits throughput; for substantial load introduce async event ingestion (Kinesis/SQS), Redis caching with accurate TTL, batched analytics, and consider redirect analytics as eventually consistent.
- Expired records retained for 90 days support analytics but increase DB size and personal-data retention. Define deletion/legal retention with privacy counsel.
- The included Terraform provides private RDS with **single-AZ by default** for cost (change `multi_az=true` before real production).
- ECS tasks use public subnets with public IPs to avoid NAT in the interview setup; SGs prevent direct inbound Internet traffic. A stricter enterprise setup should use private ECS subnets and NAT/VPC endpoints.
- Logging is CloudWatch only; alarms, tracing, dashboards, WAF and CI/CD release gates need configuration before launch.
- Database schemas are greenfield only; a previous JSON/H2 database is not automatically migrated into PostgreSQL. Build a separately approved data migration for existing real records.

## Agentic SDLC

Both projects retain the original DAG-based agentic SDLC CLI with requirements, parallel design/security/test planning, approval gates, QA retries, safe-stop, dynamic graph changes and audit history. The deployment artifacts deploy the **API**, not the agentic CLI as a hosted orchestration platform; this keeps dangerous automation out of the public request path. Historical scenario outputs should not be mistaken for proof that the new PostgreSQL code was generated/validated by an LLM.
