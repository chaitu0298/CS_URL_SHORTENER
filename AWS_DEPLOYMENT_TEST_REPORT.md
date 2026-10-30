# AWS CLI deployment package — validation report

**Verified in the offline build environment:**

- `npm test`: **16 passed; 1 PostgreSQL integration test skipped** (needs running PostgreSQL).
- `node --check NodeJS/src/bootstrap-server.mjs`: passed.
- `bash -n aws/cli/*.sh`: all CLI deployment/management scripts syntax checks passed.
- `python -m json.tool aws/cli/infra.json` and `service.json`: valid JSON; reference consistency checked (all `Ref` and `Fn::GetAtt` resource references resolve statically).
- Node.js migration bootstrap uses a PostgreSQL transaction + advisory lock and schema migration version record; it runs before starting the HTTP server, so /ready does not succeed before DB bootstrap.
- AWS templates create separate RDS databases and Cognito pools for Node by default.

**NOT verified in this environment:** Docker builds, actual CloudFormation validation, App Runner/RDS creation in a real AWS account, live authenticated requests to an AWS endpoint, email confirmation delivery, Cognito PKCE sign-in, data recovery from RDS snapshots. AWS credentials and network/service access were not provided. Do not claim the deployment was run successfully in AWS without performing it using your own AWS account.

**Pre-launch follow-ups:** AWS WAF and request-rate protections, multi-AZ RDS + NAT resiliency, CloudWatch alarms and cost budgets, secret rotation, scheduled expired-data cleanup, staging environments, load testing and capacity planning. The default infrastructure is a budget-aware interview/demo configuration; it incurs real recurring charges even while idle.
