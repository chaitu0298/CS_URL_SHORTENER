# Worked Scenarios — JavaScript

## 1. Greenfield (new URL shortener)

**Intent:** Build a new service with link create/redirect, expiration, analytics, protection, and tests.

**Decomposition:** requirement capture -> parallel impact/design/threat/test plan -> design approval -> parallel service implementation/test creation -> real test execution + independent security check -> documentation/release assessment -> final reviewer signoff.

**Agent output:** `workspace/src/{shortener,server}.mjs`; `workspace/test/{service,generated}.test.mjs`. The generated suite runs real HTTP requests, validates persistence, security, idempotency, and analytics. A one-time injected QA failure proves retry before continuing. **Control:** neither agents nor CI perform deployment.

## 2. Brownfield (misleading aliases)

**Requirement:** Existing URLs must keep working, but creation of `support-desk` or `security-team` aliases should be rejected.

**Codebase reasoning:** `server.mjs` routes `POST` to `LinkStore.create()`, which delegates alias validation to `validateAlias`; existing links are loaded from the persisted store. Only the reserved-alias extension set in `shortener.mjs` needs a source-level change. No migration is required.

**Change:** bounded replacement of `new Set([]); // EXTENSION_ALIAS_POLICY` in the workspace, with exact-anchor verification. **Testing:** a generated regression rejects the restricted alias and allows ordinary aliases, while original HTTP tests still pass. **Safety:** permanent QA failure deletes generated workspace and records rollback.

## 3. Ambiguous (“expire quickly”)

**Ambiguity:** The phrase lacks a TTL value, and guessing would cause unexpected data loss.

**Branch:** `intake` exits in `WAITING_INPUT`, with no source changes. Owner enters TTL in hours (example 48) using the CLI; this creates a new revision. Graph fan-out runs again and requires new design approval. **Change:** generated service default TTL is updated; explicit per-request `ttlHours` overrides it. **Tests:** generated test verifies both default and override with a controlled clock. **Governance:** release reviewer must approve after QA passes.

## 4. Dynamic revision / policy risk

A later request mentioning `public-facing`, `regulated`, `phishing`, or `abuse controls` adds an `abuse_review` node, makes it an entry prerequisite of the design gate, archives the earlier revision and invalidates old signoffs. This is a dependency-graph replan, not a static sequence replay.

## Risk matrix

| Risk | Validation/control | Residual limitation |
|---|---|---|
| Unsafe redirect destination | Only HTTP/HTTPS; reject URL credentials | No domain safety or phishing reputation feed |
| Duplicate codes | Random code collision checks; alias conflict 409 | File store not distributed |
| Expired link still redirecting | Every redirect checks expiration | No scheduled purge/retention |
| Unauthorized management | API key and per-process rate limit | No IAM, audit identity proof or global throttling |
| Bad automation patch | Exact patch anchor; scoped workspace; regression tests | No arbitrary code synthesis |
| Stale human approval | Revise removes approvals and outputs | No enterprise e-signatures |
| Test failure | Retry once, rollback workspace, safe-stop | No autonomous fix loop |
| Audit edits | SHA chain verified before resumption | Not externally signed or append-only |
