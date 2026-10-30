# Assignment coverage — tested implementation vs future work

| Requirement | Implemented now | Remaining limitation |
|---|---|---|
| Intent normalization | Scenario-specific acceptance criteria, ambiguity detection, optional model advisory | Arbitrary freeform requirements outside three recipes intentionally rejected |
| Task decomposition | 14–15 DAG tasks, explicit dependencies and risk-specific abuse review | Task template is bounded, not LLM-generated universal task planner |
| Brownfield codebase reasoning | Actual `postgres-store.mjs` / `server.mjs` source digests, impacted flow + changed file previews | Static file impact map, no full graph AST/index |
| Stateful orchestration | Concurrent ready task waves, synchronization, persistent run status, two gates | File-backed local single-process state, not distributed queue |
| Decision traceability | Human approval revision + upstream artifact digest, hash-chained JSONL audit, verification | Logs not immutable S3 Object Lock / externally anchored; CLI reviewer labels weaker than JWT reviewer |
| Reliability | QA retry once, safe stop, workspace rollback, revision invalidate and replan, per-node run metrics | Does not perform ECS rollback; work queues not horizontally scalable |
| Engineering output | Executable generated code/tests, architecture, security notes, API change preview, docs | Bounded recipes; no GitHub pull-request writer; generated tests run without live DB |
| Security | Cognito JWT and explicit subject allowlist for localhost runner; restricted source paths, read-only preview before apply | Need vulnerability scanning, real auth end-to-end, pen test |
| Release readiness | QA/static guardrail reports and human release checkpoint | Live PostgreSQL and AWS smoke tests stay separate/manual; human must merge and deploy |
| Final summary | Artifacts, audit trail, risk/limits, metric rollup, example runs | Human interview walk-through required |

Existing AWS URL Shortener APIs, RDS PostgreSQL, Cognito, API Gateway, ECS Fargate, and React URL dashboard are untouched by the overlay until an approved code change is manually applied/deployed.

## Verification performed in build environment
- Backend `node --test test/*.test.mjs`: run `npm test` to see the latest counts (one PostgreSQL integration test is expected to skip without a database) due to no DB.
- React `node --test tests/*.test.mjs`: 15 pass.
- SDLC 3 scenarios: completed end-to-end via deterministic runner, including injected recoverable failure, two simulated approvals, and verified audit chain.
- Git Bash scripts: Bash syntax checked.
- Vite production build and live Cognito/AWS end-to-end tests: **not executed** (npm registry and AWS credentials unavailable here). Do them locally before deploying.
