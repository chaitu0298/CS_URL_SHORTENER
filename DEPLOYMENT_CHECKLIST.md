# Launch checklist (interactive release gate)

- [ ] Provision Cognito SPA user pool/client and validate signing keys, issuer, audience/client_id and `token_use`.
- [ ] Configure VPC, subnets, ACM cert, Route 53, and allowed origins.
- [ ] Push and scan immutable ECR image tag/digest; no secrets or .env included.
- [ ] Provision RDS in private subnets, enable encryption, backups, restore test and Multi-AZ for production.
- [ ] Provision Secrets Manager HMAC secret; enable rotation plan.
- [ ] Verify app-to-RDS TLS with `verify-full` and trusted CA bundle.
- [ ] Apply schema once in an approved change window; preserve migration history and rollback strategy.
- [ ] Run integration tests against PostgreSQL, then health/readiness, create, redirect, expiry, owner-ACL, revoke and restore.
- [ ] Verify Cognito PKCE flow from the frontend and CORS exact-origin rules.
- [ ] Put AWS WAF and per-tenant budgets/quotas in front of the app; test malicious URLs and phishing policy.
- [ ] Add CloudWatch alarms for 5xx/latency/CPU/DB free space/connections, log retention and incident runbooks.
- [ ] Decide expiry/analytics retention policy with compliance and document data deletion.
- [ ] Perform sustained and burst load tests; verify click accuracy, race conditions, rate limiting and DB pool sizing.
- [ ] Approve release with human review; use rollback / staged deployment and retain audit evidence.
