# Proposed change

Bulk revoke API (greenfield)

Requirement: Add an authenticated bulk revoke API so an owner can revoke multiple short links in one request.

Changed files: src/server.mjs, src/postgres-store.mjs

Test: `node --test test/generated.test.mjs` from the run workspace.

This is a reviewable proposal, NOT deployed code. Verify PostgreSQL integration and production readiness before merging.
