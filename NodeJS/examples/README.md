# Real Generated Examples

These three folders were produced by actually running the JavaScript workflow and granting explicit example reviewer approvals. Each contains:
- `run.json`: persisted DAG nodes, decisions and metrics
- `audit.jsonl`: SHA-256 linked event log
- `artifacts/`: design, threat model, test plan, real Node QA output, readiness
- `generated/`: created/patched source and scenario-specific test

`evidence.json` summarizes final outcome and validation status. The brownfield example blocks reserved aliases; the ambiguous example uses a product-owner decision of 48 hours and revision 2. Greenfield deliberately injects a one-time QA failure; its run records recovery and successful final validation. These are reproducible demonstrations, **not evidence of deployment**.
