# AWS DEPLOYMENT COMMANDS — PUBLIC HTTPS URL SHORTENER

This is the **copy/paste runbook** for the complete URL-shortener backend. Use a local terminal (macOS/Linux or **Windows Git Bash with Docker Desktop** (or WSL with Docker integration)). No AWS Console clicking or existing VPC/domain/ACM certificate is required. The supplied scripts and CloudFormation templates create all AWS infrastructure. **Nothing has been deployed to your AWS account by the project author.**

> **You will incur AWS charges:** RDS PostgreSQL, a NAT Gateway + data processing, App Runner, Secrets Manager, ECR storage and data transfer. NAT and database cost money even with zero requests. Before running, check billing/service quotas and set an AWS Budget. These templates are an interview-ready, publicly reachable deployment foundation, not a security-certified large-scale production system. Deploy only in an AWS account where you are authorized to create resources.

## 0. Prerequisites

Install [AWS CLI v2](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html), [Docker](https://docs.docker.com/get-docker/), and Python 3 (for the optional auth demo). **AWS CLI needs permission to create CloudFormation, VPC, RDS, App Runner, IAM roles (PassRole), ECR, Cognito and Secrets Manager resources.** Administrator access in a dedicated sandbox is easiest for an interview; prefer scoped deployment roles in real environments. Do **not** use the AWS root account. Never commit `.aws/credentials` or secrets.

```bash
aws --version
# Docker Desktop must be running, and Linux containers enabled
docker info
python3 --version
```

## 1. Authenticate to AWS (choose ONE method)

**Recommended: IAM Identity Center (SSO)**

```bash
aws configure sso --profile shortener
aws sso login --profile shortener
export AWS_PROFILE=shortener
export AWS_REGION=us-east-1
aws sts get-caller-identity
```

**Alternative: IAM access keys you are authorized to use (not root keys)**

```bash
aws configure --profile shortener
# Enter Access key ID, Secret access key, us-east-1, json when prompted
export AWS_PROFILE=shortener
export AWS_REGION=us-east-1
aws sts get-caller-identity
```

You can also use already configured credentials / an assumed role: omit `AWS_PROFILE` if that is how you normally authenticate. **Never paste credentials into these project scripts.**

## 2. Unzip and open the project

Extract `AWS_URL_Shortener_AWS_Deployable.zip`, then:

```bash
cd AWS_Ready_URL_Shortener
chmod +x aws/cli/*.sh
```

On Windows, run these commands in **Git Bash** with Docker Desktop started (Linux containers), or use WSL Ubuntu with Docker integration. `.sh` commands are Bash, not PowerShell syntax. The included scripts use relative CloudFormation template paths compatible with Windows AWS CLI 2.15.12.

## 3. DEPLOY THE JAVASCRIPT BACKEND — one command

```bash
./aws/cli/deploy.sh node
```

This provisions a **new VPC, public/private subnets, internet gateway, NAT gateway, private PostgreSQL on RDS, two Secrets Manager secrets, Cognito pool/app client, ECR image repository, IAM roles, an App Runner VPC connector and a public HTTPS App Runner service**. It also builds and pushes the Node.js Docker image and runs the versioned initial schema migration under a PostgreSQL advisory lock.

It prints something like (the actual address will differ):

```text
API_BASE_URL=https://xxxxxxxx.us-east-1.awsapprunner.com
HEALTH=https://xxxxxxxx.us-east-1.awsapprunner.com/health
READY=https://xxxxxxxx.us-east-1.awsapprunner.com/ready
COGNITO_USER_POOL_ID=us-east-1_xxxxx
COGNITO_APP_CLIENT_ID=xxxxx
```

Use the URL actually printed; the example is not a live endpoint.

```bash
./aws/cli/status.sh node
./aws/cli/smoke.sh node
```

## 4. Create a user, authenticate and create a PUBLIC short URL

`POST /api/v1/links` is protected with a Cognito **access token** (JWT). Anybody can visit a generated short link, but only a signed-in user can create/list/revoke links. To test without a frontend:

```bash
./aws/cli/auth-demo.sh node
```

The script interactively asks for an email and password. Enter `yes` for a first-time user; Cognito sends an email verification code. After confirmation it gets an access token, calls `POST /api/v1/links`, and prints the actual public short URL. It then checks that a redirect responds `302`.

**Manually with cURL (replace values):**

```bash
export API_BASE_URL='https://ACTUAL-PUBLIC-URL.awsapprunner.com'
export ACCESS_TOKEN='PASTE_YOUR_COGNITO_ACCESS_TOKEN'
curl -i -X POST "$API_BASE_URL/api/v1/links" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: exampleKey1234' \
  -d '{"url":"https://www.google.com","alias":"google123","expiresAt":"2026-12-31T23:59:59Z"}'
```

Use a **future** `expiresAt` within 365 days, or simply use `"ttlHours":48` instead. Do not send both. The server stores timestamps in UTC, rejects expired/revoked links with HTTP 410, and records redirects in PostgreSQL. Visitors don't need credentials to use `https://YOUR-API-URL/google123`.

## 5. React integration — later, without redeploying all infrastructure

When your frontend is hosted at `https://app.example.com/`, run:

```bash
./aws/cli/configure-frontend.sh node https://app.example.com/
```

This updates the Cognito OAuth callback and the backend CORS allowed origins **without rebuilding the Docker image**. Be sure the frontend origin is the actual `https://` origin; `https://app.example.com/` is only an example. The callback must match the actual OAuth callback path your React app uses (e.g. `https://app.example.com/auth/callback`); change the command argument accordingly.

Use your `status.sh` output:

```bash
# Create React .env.production (in your FRONTEND repository)
VITE_API_BASE_URL=https://YOUR_ACTUAL_APP_RUNNER_URL
VITE_COGNITO_USER_POOL_ID=us-east-1_ACTUALPOOL
VITE_COGNITO_CLIENT_ID=ACTUALCLIENT
VITE_COGNITO_REGION=us-east-1
```

Use Cognito **authorization code + PKCE** in React. Send `Authorization: Bearer <access_token>` for all `/api/v1/links` operations. Do not put `X-API-Key`, RDS credentials, visitor hash secrets, or AWS credentials into React. This ZIP has a `frontend-example/urlShortenerClient.js` starter API client and `openapi.yaml`.

## 6. Updating code / redeployment

Edit code, then run the **same deploy command**. The script builds a fresh immutable image tag, pushes it to ECR, and updates the App Runner service stack, retaining RDS data:

```bash
./aws/cli/deploy.sh node
```

For database changes add a **reviewed, versioned migration**. Node currently runs its initial `001_init` exactly once. For a new Node SQL migration, update `src/bootstrap-server.mjs` to incorporate the new numbered file and keep the advisory lock/transaction. Make backward-compatible changes before breaking ones; do not rely on simple redeploy for rollback of schema changes.

## 7. Inspect AWS resources and logs

```bash
./aws/cli/status.sh node
aws cloudformation describe-stacks --stack-name shortener-node-demo-infra --region us-east-1
aws cloudformation describe-stacks --stack-name shortener-node-demo-node-api --region us-east-1
aws apprunner list-services --region us-east-1
aws rds describe-db-instances --region us-east-1
aws logs describe-log-groups --log-group-name-prefix /aws/apprunner --region us-east-1
```

If deployment fails, inspect stack errors:

```bash
aws cloudformation describe-stack-events --stack-name shortener-node-demo-node-api \
 --query 'StackEvents[0:15].[Timestamp,ResourceStatus,ResourceStatusReason]' --output table
```

The script **does not** swallow deployment failures. AWS service creation can fail because of IAM/service quota, unavailable instance class/AZ combinations, regional App Runner availability, or networking issues.

## 8. Delete resources to stop ongoing charges

**WARNING:** these delete the API, PostgreSQL instance and Cognito users. Database data cannot be recovered except from retained final snapshots. Each environment is separate:

```bash
./aws/cli/destroy.sh node
```

You must type `DELETE shortener-node-demo` as confirmation. CloudFormation takes a final RDS snapshot by design. **RDS snapshots remain billable** until separately deleted. Inspect RDS snapshots, CloudWatch logs and AWS Cost Explorer afterward.

## 9. Explicit low-level AWS commands (the deploy script runs these for you)

The infrastructure, including Cognito, IAM, the VPC and RDS, is declared in `aws/cli/infra.json`; the public App Runner service is declared in `aws/cli/service.json`. If you prefer to run the steps manually instead of using `deploy.sh`:

```bash
# From AWS_Ready_URL_Shortener root, with AWS_PROFILE and AWS_REGION configured:
export STACK_PREFIX=shortener-node-demo
export INFRA_STACK="${STACK_PREFIX}-infra"

# 1. Validate templates:
MSYS_NO_PATHCONV=1 aws cloudformation validate-template --template-body file://aws/cli/infra.json
MSYS_NO_PATHCONV=1 aws cloudformation validate-template --template-body file://aws/cli/service.json

# 2. Create database/networking/auth/ECR/permissions:
aws cloudformation deploy --stack-name "$INFRA_STACK" \
  --template-file aws/cli/infra.json --capabilities CAPABILITY_IAM \
  --parameter-overrides DbClass=db.t4g.micro CallbackUrl=http://localhost:5173/

# 3. Discover ECR repository from stack outputs:
REPO=$(aws cloudformation describe-stacks --stack-name "$INFRA_STACK" \
  --query 'Stacks[0].Outputs[?OutputKey==`NodeRepositoryUri`].OutputValue | [0]' --output text)
REGION=$(aws configure get region --profile "${AWS_PROFILE:-shortener}")
REGION="${AWS_REGION:-${REGION:-us-east-1}}"
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
aws ecr get-login-password --region "$REGION" | docker login --username AWS \
  --password-stdin "$ACCOUNT.dkr.ecr.$REGION.amazonaws.com"
IMAGE="${REPO}:$(date -u +%Y%m%d%H%M%S)"
docker build --platform linux/amd64 -t "$IMAGE" NodeJS
docker push "$IMAGE"

# 4. Deploy the public App Runner API (initial placeholder URL):
aws cloudformation deploy --stack-name "${STACK_PREFIX}-node-api" \
  --template-file aws/cli/service.json \
  --parameter-overrides "InfraStack=$INFRA_STACK" AppKind=node "ImageUri=$IMAGE" \
  ApiBaseUrl=https://example.invalid CorsOrigins=http://localhost:5173

# 5. Read generated public HTTPS URL and configure short links to use it:
API=$(aws cloudformation describe-stacks --stack-name "${STACK_PREFIX}-node-api" \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiUrl`].OutputValue | [0]' --output text)
aws cloudformation deploy --stack-name "${STACK_PREFIX}-node-api" \
  --template-file aws/cli/service.json \
  --parameter-overrides "InfraStack=$INFRA_STACK" AppKind=node "ImageUri=$IMAGE" \
  "ApiBaseUrl=$API" CorsOrigins=http://localhost:5173

# 6. Public smoke checks:
curl -i "$API/health"
curl -i "$API/ready"
```

For ordinary use **prefer the one-command scripts**, which also perform validations and select the correct project and stack names.

## Architecture and release limitations

- **Public HTTPS:** AWS App Runner assigned domain; TLS is managed by AWS. You do not need Route 53 or ACM for this default URL.
- **Private database:** Amazon RDS PostgreSQL, RDS inbound from VPC connector security group only, SSL peer verification using AWS RDS CA bundle, 7-day backups and a final stack-deletion snapshot.
- **Network:** two private subnets, two public subnets, a **single NAT Gateway** (cost and availability trade-off). App Runner VPC outbound internet requires NAT; Cognito JWKS validation must be able to reach public Cognito endpoints.
- **Security:** Cognito JWT access tokens on management endpoints, public redirects, Secrets Manager for DB and visitor secrets, CORS allowlist, bounded app-side rate limits. Add AWS WAF, abuse controls, request quotas, auditing and secret rotation before broad public promotion.
- **Availability:** RDS single-AZ in this cost-oriented interview config; App Runner autoscaling caps at 3 instances and min 1. For production launch, plan multi-AZ RDS, multi-AZ NAT or VPC endpoints, alarms and restore tests.
- **Operations:** no automatic scheduled cleanup task. Expired links stop redirecting immediately, but stored expired records are retained until cleanup. Node has `src/db-tool.mjs cleanup` job which should run in only one worker, not every replica. Schedule a dedicated maintenance job as a next step.
- **No AWS resources were provisioned or externally integration tested from this workspace.** You must validate real AWS creation, Docker builds, authenticated API calls, networking, budgets and snapshot restore in your account.

## Official AWS references

- https://docs.aws.amazon.com/apprunner/latest/dg/network-vpc.html
- https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-apprunner-service.html
- https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-rds-dbinstance.html
- https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-cognito-userpoolclient.html
- https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-sso.html
