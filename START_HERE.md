# Start here

1. Choose a backend: **NodeJS**.
2. Start PostgreSQL + backend locally: `cd NodeJS && docker compose up --build` (port 3000) && docker compose up --build` (port 8080). Docker is required. Use only one compose stack at once; both expose local PostgreSQL on 5432.
3. In Postman, import `postman/NodeJS.postman_collection.json` and its matching environment.
4. Read `README.md` for every API endpoint, the absolute UTC expiration contract, user ownership and example requests.
5. Read `frontend-example/README.md` before building your React frontend. Production uses Cognito Bearer access tokens (not a hardcoded API key).
6. Read `aws/DEPLOY.md`, fill the Terraform example with your AWS identifiers, and review `DEPLOYMENT_CHECKLIST.md` before any external release.
7. Read `TEST_REPORT.md` for tests that passed and those still requiring Docker/Maven/Terraform/AWS.

**No cloud resources have been deployed. The production launch gate is not passed; this is an AWS-deployable starting point that requires environment-specific verification.**
