# Verification record — AWS SDLC control plane upgrade

## Locally validated in artifact build

- Node.js tests: 27 passed, one PostgreSQL integration test skipped (live DB not provisioned in this execution environment).
- React logic tests: 15 passed.
- `node --check`: SDLC API, engine, and deployment-related JavaScript passed.
- `bash -n`: new deploy/status/destroy scripts and modified frontend deployment scripts passed.
- JSON parse and static AWS resource assertion tests for `aws/cli/sdlc-service.json` passed.

## Must validate in YOUR AWS account before claiming deployed

1. `aws cloudformation validate-template --template-body file://aws/cli/sdlc-service.json`.
2. ECS task reaches runningCount=1 and ALB health `/sdlc/health` is healthy.
3. Anonymous `/sdlc/runs` denied 401 by API Gateway; valid Cognito non-admin denied 403 by service.
4. Cognito allowlisted admin can create scenario, advance, inspect code, approve, and complete run.
5. ECS restart preserves runs in encrypted EFS, audit verification remains true; no public URL shortener regression.
6. React CloudFront build succeeds, authorized SDLC tab appears, other users cannot see protected content; callback login still works.
7. Confirm deployment IAM role has no AWS resource write permissions; review CloudWatch logs for accidental sensitive data.

## Known limitations

- Existing change recipes are deterministic and bounded to three scenarios; optional LLM advisory does not autonomously write arbitrary changes.
- Not a hardened code execution sandbox. Avoid user-supplied commands, packages, or third-party generated code in this runner.
- Audit hash chain is not independently immutable. Single task + file storage limits availability and concurrency.
- Production-level separation of duties, automatic release gating, abuse protection, metrics/alarms, load testing, and full DR restore testing are not complete.
- No real AWS resource deployment was performed from this environment; your AWS account may surface further permissions/service limitations.
