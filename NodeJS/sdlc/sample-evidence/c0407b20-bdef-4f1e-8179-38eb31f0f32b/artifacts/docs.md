# Proposed change

Impersonation alias prevention (brownfield)

Requirement: Reject misleading support-desk and security-team aliases while keeping existing URLs working.

Changed files: src/postgres-store.mjs

Test: `node --test test/generated.test.mjs` from the run workspace.

This is a reviewable proposal, NOT deployed code. Verify PostgreSQL integration and production readiness before merging.
