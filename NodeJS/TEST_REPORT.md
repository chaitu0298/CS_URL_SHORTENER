# Validation report — AWS-oriented upgrade

As built in this workspace, the following checks **were executed**:

- Node.js `npm test`: **17 test definitions**, **16 passed**, **1 PostgreSQL integration case skipped** because no PostgreSQL server / `PG_TEST_URL` was supplied. Includes the original 12 workflow/service tests plus 4 new expiration-contract tests; skipped integration test covers real DB creation, owner-only analytics, redirect, revoke, expiry and listing.
- Node.js `node --check` on the new Postgres store, server, DB tool, and browser API client: passed.
- Java `bash test-workflow.sh`: **12 JDK-only orchestration assertions passed**.
- API contract `openapi.yaml`, Docker Compose files and Postman JSON syntax: successfully parsed.

**Not executed here** (tools/dependencies not installed):

- Docker Compose startup, real PostgreSQL migrations and end-to-end API calls.
- Maven full Spring Boot tests, including H2-backed API tests and PostgreSQL integration test.
- Docker image builds, Terraform validate/plan/apply, ECS/RDS deployment and Cognito login flow.

GitHub Actions workflows are included to run real PostgreSQL integration tests for both implementations in a CI environment with Node/Maven and PostgreSQL. They have not been run in this workspace. A deployed application must be validated in the destination AWS account; a ZIP alone does **not** establish production readiness.
