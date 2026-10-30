# Suggested 10-Minute Interview Demonstration — JavaScript

1. **(1 minute) State your principle:** autonomous agents own bounded tasks, human reviewers own risk acceptance and release readiness. Show `ARCHITECTURE.md` DAG.
2. **(2 minutes) Exercise REST:** `npm start`; create alias via `curl`, redirect once, inspect click analytics. Show that management endpoints reject missing API key.
3. **(2 minutes) Show greenfield:** `node src/cli.mjs run greenfield --inject-qa-fail-once`; inspect `run.json` and design documents. Demonstrate enforced design approval, parallel implementation + test generation, QA retry, and release approval.
4. **(2 minutes) Show brownfield:** create a brownfield run, approve design, inspect isolated `workspace/src/shortener.mjs` (reserved alias patch) and generated test. Original source stays unchanged.
5. **(1 minute) Show ambiguity:** `run ambiguous` stops at `WAITING_INPUT`. Enter `answer ID 48 "Product Owner"`, show revised TTL policy. Explain why it wasn't inferred.
6. **(1 minute) Show graph replan:** `revise ID "Build public-facing service with phishing controls" - Owner`; inspect `abuse_review`, now required for design approval. Signoffs do not transfer.
7. **(1 minute) Discuss limitations:** prototype uses deterministic audited agents and file persistence; production needs a model adapter with sandboxed tool calls, CI, signed approvals, queue/leases, Postgres, and abuse/retention controls.

**Questions to anticipate:**

- **Is it really agentic?** It's a stateful, tool-executing, dependency-based SDLC controller with gated task agents. It is not a claim of arbitrary autonomous LLM software development.
- **How do agents coordinate?** Explicit parents, parallel ready nodes, SHA-256 outputs, persistent state, barrier synchronization.
- **What if QA fails?** One retry; then safe-stop, generated workspace rollback, retry/rollback metrics and immutable source retained.
- **What if requirement changes?** Versioned plan, previous approval invalidation and conditional graph expansion.
- **How do you prevent deployment risk?** There is no deploy tool or permission in this prototype. Both design and release gates require a reviewer.
