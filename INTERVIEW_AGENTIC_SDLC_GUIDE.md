# Agentic URL Shortener — Interview-ready changes

This add-on upgrades the **deployed Node.js/PostgreSQL + React** project while keeping the public API and AWS infrastructure unchanged until a reviewer deliberately releases a code change.

## What was actually added

- `NodeJS/sdlc/engine.mjs`: explicit DAG, parallelizable task waves, entry/exit evidence gates, requirement clarification, design and release sign-offs, bounded QA retry, workspace rollback, safe-stop, revision-based invalidation, per-node timings, tamper-evident audit JSONL.
- `NodeJS/sdlc/api.mjs`: localhost-only Cognito JWT + allowlisted subject service. No runtime AWS deployment permissions. Approval identity is taken from validated JWT, not a typed name.
- `NodeJS/sdlc/requirements-ai.mjs`: **optional** OpenAI review advisory. No key needed for deterministic demo. Never gives the model code execution/deployment access; schema-validated model feedback is only advisory.
- `NodeJS/sdlc/apply-proposal.mjs`: local-only, fail-closed, explicit human promotion to working source after manual source review and approval. It checks source digests to avoid overwriting concurrent changes; it NEVER pushes or deploys.
- `Frontend`: optional **Agentic SDLC** dashboard tab (visible only with localhost URL) with scenario intake, task graph, plans, human approvals, clarification, history, metrics, code previews and audit evidence.
- `NodeJS/test/sdlc.test.mjs`: realistic new and modified source scenario tests, auth restriction tests, tamper/retry/rollback tests.

### Architecture boundary

**Public path**: React (CloudFront) → Cognito → API Gateway HTTPS → ECS Fargate Node.js → PostgreSQL. Unchanged by this package.

**Engineering control path** (local/private only): React local development server (localhost:5173) → Cognito-protected local SDLC API (127.0.0.1:3100) → isolated workspace under `NodeJS/.sdlc-runs` → review and test artifacts. No public SDLC routes and no production deployment credentials in that service. `VITE_SDLC_API_BASE_URL` must NOT be set when deploying CloudFront.

## Three scenarios and evidence

1. **Greenfield**: add authenticated `POST /api/v1/links/bulk-revoke` endpoint and `PgLinkStore.bulkRevoke`, with owner-scoped SQL and negative tests.
2. **Brownfield**: reject impersonation aliases `support-desk` and `security-team` without changing valid link behavior.
3. **Ambiguous**: "expire quickly" stops at WAITING_INPUT until a product owner provides exact default hours; revision 2 causes new plan/test evidence and invalidated approvals.

For each run: requirement intake (`artifacts/intake.json`), impact (`impact.json` with actual source hashes), architecture (`architecture.md`), security design, test plan, approval snapshots, isolated source proposal, generated executable tests, QA logs, static security evidence, docs, readiness, final summary, and append-only hash-chain `audit.jsonl`.

## Important limitations (speak to these during interview)

- The coding agents are **bounded deterministic change recipes** for three reviewable cases, not general-purpose code-writing LLM agents. Optional AI does bounded requirement analysis; it does not write arbitrary patches.
- Replanning currently invalidates all requirement descendants, not a minimal dependency slice. Parallel DAG nodes are synchronized by wave; some steps use synchronous file operations. This is a working orchestration prototype, not a distributed job scheduler.
- File-backed run state and hash-linked audit entries are not cross-process durable database transactions or immutable S3 Object Lock logs. Run one process locally; use Postgres + immutable archival in production.
- Approval identifies human from verified Cognito JWT when operated through the local API. CLI approvals rely on local operating-system access and a configured reviewer label.
- QA runs generated tests without live PostgreSQL. Before production release, run unit, full PG integration, security scans, container build, and smoke tests.
- The engine has no AWS deploy action; its rollback is **workspace rollback**, not rollback of an ECS service. Production rollback should use the previous ECS task definition and a human-approved change request.
- Metrics include terminal run success rate, retry count, rollback counts, recovery duration (task failure → successful retry), and end-to-end latency. Use a dedicated telemetry store for production retention.
- Never run unreviewed model-generated code with unbounded filesystem access or production AWS credentials.

## Delivery walkthrough

Run each scenario, inspect `intake`, `impact`, `architecture` and `test_plan` outputs in UI. Approve design; run real code-generation and tests; optionally simulate one transient QA failure; review the generated code and QA log; approve release; inspect evidence export. For ambiguous: show requirement clarification and invalidation of earlier revision. Explain why generated changes are NOT automatically deployed.

The application API and React frontend continue running independently; no link data/database reset occurs.

### Optional AI requirements advisor

By default the three reproducible scenarios do **not** make external AI calls. If you want model-assisted requirements review, configure only the local runner's environment (never React `.env` or Git):

```bash
export SDLC_USE_AI_REQUIREMENTS=true
export OPENAI_MODEL=YOUR_AVAILABLE_MODEL
export OPENAI_API_KEY=YOUR_KEY_FROM_PROVIDER
# npm run sdlc:server
```

The optional service sends the requirement text, scenario and candidate file names (not source code, AWS credentials or private URLs) to the model; it validates the returned advisory schema and **never** authorizes a code patch or release. `OPENAI_API_KEY` is not included in the ZIP. See official Responses API guidance: https://developers.openai.com/api/docs/guides/text .
