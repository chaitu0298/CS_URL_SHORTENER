# AWS deployment — pick NodeJS OR SpringBoot

This example deploys one production-mode backend to ECS Fargate behind an HTTPS ALB. The DB is private RDS PostgreSQL 16-compatible (version AWS chooses), secrets are injected by ECS, and browser clients use Cognito access tokens. Create **separate Terraform state / names** to deploy both versions simultaneously. This is a starter architecture; test and harden before accepting real traffic.

## Prerequisites

- AWS CLI, Terraform >=1.6, Docker, IAM permissions, and a configured AWS profile.
- Existing VPC with at least **two public subnets** (IGW routes) and **two private subnets** (distinct AZs), in the same Region.
- Registered domain (for example `go.example.com`) and an **issued ACM certificate** for the exact domain in the same region.
- Cognito User Pool + public SPA app client (no client secret) using authorization code + PKCE. Record pool ID and client ID; use the access token, not ID token.
- A public Route 53 hosted zone ID if you want Terraform to add the DNS alias. Otherwise add your DNS record manually.
- Budget for ALB, Fargate, RDS, snapshots and logs, even with no user traffic. No AWS resources are deployed by this package alone.

## 1. Create a secret for analytics hash HMAC

```bash
aws secretsmanager create-secret --name shortener/visitor-secret \
  --secret-string "$(openssl rand -hex 32)" --region us-east-1
```

Save its ARN as `visitor_secret_arn`. Never put the value in Terraform variables or source control.

## 2. Build + push image to ECR

Replace account, region, and backend; do **not** push `.env` files.

```bash
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION=us-east-1
APP_KIND=node  # or spring
REPO="shortener-${APP_KIND}"
aws ecr create-repository --repository-name "$REPO" --region "$REGION"
aws ecr get-login-password --region "$REGION" | docker login \
  --username AWS --password-stdin "$AWS_ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com"
cd NodeJS # or SpringBoot; run from this repository root
IMAGE="$AWS_ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/$REPO:1"
docker build --pull -t "$IMAGE" .
docker push "$IMAGE"
```

Images download the official RDS global CA bundle at build time; supply-chain review and pin image digests for a real deployment.

## 3. Provision AWS resources

```bash
cd ../aws/terraform  # when starting from NodeJS or SpringBoot
cp terraform.tfvars.example terraform.tfvars
# Fill all real values. Set app_kind and image_uri for the image just pushed.
terraform init
terraform plan
terraform apply
```

The template uses: HTTPS ALB on port 443, an ECS service with 2 Fargate tasks, Security Groups restricting DB traffic to those tasks, RDS PostgreSQL in private subnets (not public), ECS-managed injection of RDS-generated password, Secrets Manager HMAC key, CloudWatch logs and optional Route 53 record.

**Networking note:** to avoid requiring NAT/VPC endpoints in a minimal deployment example, the Fargate tasks are in **public subnets with a public IP**, but only accept inbound connections from the ALB security group. For stricter enterprise deployment, run Fargate in private subnets and add NAT or required VPC endpoints. RDS remains private either way.

**Availability note:** RDS `multi_az=false` in the example to limit interview costs, so the DB remains a single-AZ failure point. Set `multi_az=true`, add RDS performance/backup alarms, and do restore testing before production.

## 4. Initialize schema

- **SpringBoot**: Flyway runs `V1__initialize.sql` on application startup; database tables appear automatically. Inspect ECS logs.
- **NodeJS**: run **one schema-migration task** (`node src/db-tool.mjs migrate`) in ECS **before user traffic**. In the ECS Console: Task Definitions -> latest revision -> Run task, select the same VPC/subnets/security group, and override the `shortener` container command to `node,src/db-tool.mjs,migrate`. Run one task only and review logs. Subsequent schema changes should use migration version tracking and a controlled CI/release process, not ad-hoc `CREATE TABLE` from every replica.

You may see ALB health checks pass before Node schema initialization (`/ready` only tests DB connectivity); do **not** turn on traffic until migration succeeds and creation/redirect tests pass.

## 5. Verify HTTPS and frontend access

```bash
curl -i "https://go.example.com/health"
curl -i "https://go.example.com/ready"
# Replace TOKEN with a Cognito access token for the configured pool+client.
curl -i -X POST "https://go.example.com/api/v1/links" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"url":"https://example.org","ttlHours":24}'
```

Set `VITE_API_BASE_URL=https://go.example.com` for your React frontend; put its exact origin into `cors_origins`, e.g. `https://app.example.com,http://localhost:5173`.

## 6. Expired-link retention task

Redirect always checks DB UTC expiration in the synchronous path. For cleanup:

- Node: schedule an ECS task with command `node src/db-tool.mjs cleanup` (EventBridge Scheduler nightly), using the same DB networking/secrets.
- Spring: run a *single* scheduled-worker instance with `CLEANUP_ENABLED=true`; avoid enabling it on every API task. Retention defaults to 90 days after expiry.

## 7. Operational hardening not automated here

- Protect ALB with **AWS WAF** (IP/rate-based rules, bot mitigation), define per-customer quotas and abuse reporting.
- Review IAM, CloudWatch dashboards and alerts (5xx, latency, DB connections, CPU, errors), backups, restore, multi-AZ, dead-letter handling for asynchronous analytics at scale.
- Set AWS Budgets alerts and CI gating. Add a staging account, IaC state locking/backups, planned schema migrations, controlled blue/green releases, and vulnerability scans.
- Rotate Secrets Manager keys, revisit per-instance rate limiting, privacy/data-retention requirements and GDPR right-to-erasure procedures.
- Browser direct calls use Cognito JWT; **never embed `API_KEY` or DB credentials in frontend code**.
- The free TLS certificate can only serve domains it covers; do not use HTTP or the ALB DNS name with a mismatched certificate for real customers.

**Visitor analytics behind ALB:** The example config sets `TRUST_PROXY=true` so the application uses the last address added to `X-Forwarded-For`, rather than the ALB socket address, when hashing visitors. Keep task ingress restricted to the ALB security group; do not enable this flag for directly accessible services. If you add CloudFront or another proxy, revisit the trusted-proxy chain and privacy policy.
