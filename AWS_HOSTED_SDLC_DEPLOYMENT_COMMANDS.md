# AWS-hosted Agentic SDLC — Git Bash deployment commands (AWS CLI 2.15.12 compatible)

> Run from `AWS_Ready_URL_Shortener` in Git Bash on Windows. The backend ECS API, RDS and existing Cognito must **already be deployed and healthy**. Provisioning the additional SDLC stack incurs AWS charges.
>
> **DO NOT SHARE ACCESS KEYS OR TOKENS.** If the previous credential disclosed in the chat has not been revoked, rotate it before running these commands.

## 1. Apply overlay in your existing project

Back up your existing application and keep your fixed `NodeJS/Dockerfile`, `aws/cli/deploy-ecs.sh`, `ecs-service.json`, frontend login callback, and production `.env` files. Extract `Agentic_SDLC_AWS_Hosted_Overlay.zip` into your existing `AWS_Ready_URL_Shortener` folder (merge directories and replace only the overlay files). Do NOT replace your working application with an old full-project ZIP.

## 2. Log in and verify prerequisites

```bash
export AWS_PROFILE=shortener
export AWS_REGION=us-east-1
aws --version
aws sts get-caller-identity
docker info
```

If you use IAM Identity Center, log in with `aws sso login --profile shortener`. For IAM access-key profiles with CLI 2.15.12, use `aws configure --profile shortener` locally (never paste keys in chat).

## 3. Find your Cognito administrator `sub` (UUID)

Use your **existing signed-in account's Cognito `sub` attribute**, not its email address, API key or AWS IAM ARN. In the AWS Console: Cognito > User pools > your existing shortener user pool > Users > select the user > `sub`.

Get your user pool from the deployed infrastructure stack:

```bash
POOL_ID=$(MSYS_NO_PATHCONV=1 aws cloudformation describe-stacks   --stack-name shortener-node-demo-infra   --query "Stacks[0].Outputs[?OutputKey=='CognitoPoolId'].OutputValue | [0]" --output text)
echo "Cognito user pool: $POOL_ID"
```

To look up a specific username already visible in your Cognito console, you may run:

```bash
# Replace with your Cognito username; this prints the UUID, not a token.
aws cognito-idp admin-get-user --user-pool-id "$POOL_ID" --username "YOUR_COGNITO_USERNAME"   --query "UserAttributes[?Name=='sub'].Value | [0]" --output text
```

If IAM denies `admin-get-user`, use the Cognito console. **Do not paste tokens or usernames here.**

## 4. Validate then deploy the *separate* SDLC service

```bash
MSYS_NO_PATHCONV=1 aws cloudformation validate-template   --template-body file://aws/cli/sdlc-service.json
```

Only after template validation succeeds, provide your Cognito UUID:

```bash
export SDLC_ADMIN_SUB="00000000-0000-4000-8000-000000000000" # REPLACE THIS EXAMPLE
bash ./aws/cli/deploy-sdlc.sh node "$SDLC_ADMIN_SUB"
```

This command builds a dedicated bounded SDLC Docker image, pushes to a new ECR repo, and deploys Cognito JWT HTTP API, VPC Link, private ALB, ECS and encrypted EFS. It **does not** create or alter RDS or change the existing URL-shortening API. For subsequent code changes, use the same `deploy-sdlc.sh` command, which makes a new versioned Docker image and updates the SDLC ECS service while preserving EFS.

## 5. Verify backend

```bash
bash ./aws/cli/status-sdlc.sh node
```

Expected health endpoint: `https://<separate-id>.execute-api.us-east-1.amazonaws.com/sdlc/health` returns JSON. All protected routes must return `401 Unauthorized` **without** a Cognito token:

```bash
SDLC_URL=$(MSYS_NO_PATHCONV=1 aws cloudformation describe-stacks   --stack-name shortener-node-demo-sdlc   --query "Stacks[0].Outputs[?OutputKey=='SdlcApiUrl'].OutputValue | [0]" --output text)
curl -i "$SDLC_URL/sdlc/runs"  # Should return HTTP 401 (not 200)
```

If the service fails to stabilize, do NOT delete the RDS stack. Inspect the distinct logs:

```bash
MSYS_NO_PATHCONV=1 aws logs tail '/ecs/shortener-node-demo-sdlc' --since 1h
aws cloudformation describe-stack-events --stack-name shortener-node-demo-sdlc   --query "StackEvents[?ResourceStatus=='CREATE_FAILED'].[LogicalResourceId,ResourceStatusReason]" --output table
```

## 6. Update existing React frontend (CloudFront)

After SDLC stack `CREATE_COMPLETE`, from the project root:

```bash
bash Frontend/aws/deploy-frontend.sh node
```

The frontend script now reads `SdlcApiUrl` from the new stack and writes the public (non-secret) setting into `Frontend/.env.production.local`:

```env
VITE_SDLC_API_BASE_URL=https://<separate-id>.execute-api.us-east-1.amazonaws.com
```

It recompiles React, uploads to the same private S3 bucket, and invalidates CloudFront. `VITE_SDLC_API_BASE_URL` must never contain an AWS secret. After Cognito sign-in, **only the allowlisted administrator** should see the Agentic SDLC navigation. Other logged-in users retain the normal link dashboard.

For local Vite against hosted SDLC:

```bash
bash Frontend/aws/configure-local.sh node
cd Frontend
npm install
npm run dev
```

## 7. Git commands (if this is a Git repository)

```bash
git switch -c feature/aws-hosted-sdlc
# Ensure secrets and local .env files are NOT staged; inspect before committing.
git status --short
git add aws/cli/sdlc-service.json aws/cli/deploy-sdlc.sh aws/cli/status-sdlc.sh aws/cli/destroy-sdlc.sh
git add NodeJS/sdlc/api.mjs NodeJS/sdlc/engine.mjs NodeJS/sdlc/Dockerfile.aws
git add NodeJS/test/sdlc-aws.test.mjs
git add Frontend/src/App.jsx Frontend/src/lib/sdlc.js Frontend/src/components/WorkflowDashboard.jsx
git add Frontend/aws/deploy-frontend.sh Frontend/aws/configure-local.sh Frontend/.env.example
git add AWS_HOSTED_SDLC_ARCHITECTURE.md AWS_HOSTED_SDLC_DEPLOYMENT_COMMANDS.md AWS_HOSTED_SDLC_VALIDATION.md
git diff --cached --check
git diff --cached --stat
git commit -m "feat: deploy isolated Cognito-protected SDLC control plane on AWS"
git push -u origin feature/aws-hosted-sdlc
```

Merge after review. To update the **public URL Shortener** only when changes to its actual backend are separately approved and tested: `bash ./aws/cli/deploy-ecs.sh node --build`. To republish frontend only: `bash Frontend/aws/deploy-frontend.sh node`. To redeploy SDLC service changes: `bash ./aws/cli/deploy-sdlc.sh node "$SDLC_ADMIN_SUB"`.

## 8. Optional teardown (DANGEROUS for run history)

```bash
# The EFS data in the SDLC stack will be deleted. Back up audit + run data first!
bash ./aws/cli/destroy-sdlc.sh node DELETE-SDLC-DATA
```

ECR repository remains and can be deleted separately when confirmed no longer needed. The original RDS/VPC/Cognito and public URL shortener are **not** deleted by this command.

## 9. Before calling it production-grade

The service is suitable for a *restricted, single-worker interview demonstration*, not an unrestricted public autonomous coding platform. Before wider production use add immutable off-host audit, multi-party approvals, a proper transactional workflow store/queue, stronger worker sandboxing, CI release evidence, quotas, alerts, monitoring and documented disaster recovery tests.
