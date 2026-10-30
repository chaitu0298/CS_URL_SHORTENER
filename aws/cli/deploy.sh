#!/usr/bin/env bash
# Usage: AWS_PROFILE=shortener AWS_REGION=us-east-1 ./aws/cli/deploy.sh node|spring
set -euo pipefail
kind="${1:-node}"
export STACK_PREFIX="${STACK_PREFIX:-shortener-${kind}-demo}"
source "$(dirname "$0")/common.sh"
# All template paths below are relative so Windows aws.exe can open them.
cd "$ROOT"
[[ "$kind" == node || "$kind" == spring ]] || { echo 'Choose node or spring' >&2; exit 2; }
require docker
check_config
# Preflight checks before committing to chargeable AWS resource creation.
docker info >/dev/null
aws_cli cloudformation validate-template --template-body "file://aws/cli/infra.json" >/dev/null
aws_cli cloudformation validate-template --template-body "file://aws/cli/service.json" >/dev/null
if [[ "$kind" == node ]]; then project="NodeJS"; repo_key='NodeRepositoryUri';
else project="SpringBoot"; repo_key='SpringRepositoryUri'; fi
service_stack="${STACK_PREFIX}-${kind}-api"
other_kind=spring; [[ "$kind" == spring ]] && other_kind=node
if stack_exists "${STACK_PREFIX}-${other_kind}-api"; then
  echo "ERROR: This stack already runs $other_kind. Their current database migration schemas differ. Use a distinct STACK_PREFIX for $kind." >&2
  exit 2
fi
DB_CLASS="${DB_CLASS:-db.t4g.micro}"
CALLBACK_URL="${CALLBACK_URL:-http://localhost:5173/}"
CORS_ORIGINS="${CORS_ORIGINS:-http://localhost:5173}"
[[ "$CALLBACK_URL" == http://localhost:* || "$CALLBACK_URL" == http://127.0.0.1:* || "$CALLBACK_URL" == https://* ]] || { echo 'Callback URL must use HTTPS, except localhost development' >&2; exit 2; }

echo "Deploying to AWS region $AWS_REGION, infrastructure stack $INFRA_STACK"
if stack_exists "$INFRA_STACK"; then
  echo 'Infrastructure exists: reusing current network, RDS, Cognito and ECR.'
else
  echo 'Creating VPC, NAT Gateway, RDS PostgreSQL, Cognito and ECR. AWS usage charges start here.'
  aws_cli cloudformation deploy --stack-name "$INFRA_STACK" --template-file "aws/cli/infra.json" \
    --capabilities CAPABILITY_IAM --parameter-overrides "DbClass=$DB_CLASS" "CallbackUrl=$CALLBACK_URL" \
    --tags Project=URLShortener Environment=interview --no-fail-on-empty-changeset
fi
repo="$(stack_output "$INFRA_STACK" "$repo_key")"
[[ "$repo" == *amazonaws.com/* ]] || { echo 'Cannot retrieve ECR repository' >&2; exit 1; }
account="$(aws_cli sts get-caller-identity --query Account --output text)"
aws_cli ecr get-login-password | docker login --username AWS --password-stdin "${account}.dkr.ecr.${AWS_REGION}.amazonaws.com"
TAG="$(date -u +%Y%m%d%H%M%S)-$$"
image="${repo}:${TAG}"
echo "Building $kind Docker image: $image"
docker build --platform linux/amd64 --pull --tag "$image" "$project"
docker push "$image"
# On the initial deployment AWS hasn't assigned an App Runner URL yet.
# On updates, keep the existing URL from the first deployment.
base_url='https://example.invalid'
if stack_exists "$service_stack"; then
  old_url="$(stack_output "$service_stack" ApiUrl)"
  if [[ "$old_url" == https://* ]]; then base_url="$old_url"; fi
fi

echo "Deploying public HTTPS App Runner service: $service_stack"
aws_cli cloudformation deploy --stack-name "$service_stack" --template-file "aws/cli/service.json" \
  --parameter-overrides "InfraStack=$INFRA_STACK" "AppKind=$kind" "ImageUri=$image" \
  "ApiBaseUrl=$base_url" "CorsOrigins=$CORS_ORIGINS" --no-fail-on-empty-changeset
url="$(stack_output "$service_stack" ApiUrl)"
[[ "$url" == https://* ]] || { echo 'App Runner URL missing after deployment' >&2; exit 1; }
# Set BASE_URL to the actual App Runner HTTPS address so every generated short URL works.
if [[ "$base_url" != "$url" ]]; then
  echo "Configuring the generated public URL: $url"
  aws_cli cloudformation deploy --stack-name "$service_stack" --template-file "aws/cli/service.json" \
    --parameter-overrides "InfraStack=$INFRA_STACK" "AppKind=$kind" "ImageUri=$image" \
    "ApiBaseUrl=$url" "CorsOrigins=$CORS_ORIGINS" --no-fail-on-empty-changeset
fi
printf '\nDEPLOYED %s\nAPI_BASE_URL=%s\nHEALTH=%s/health\nREADY=%s/ready\nCOGNITO_USER_POOL_ID=%s\nCOGNITO_APP_CLIENT_ID=%s\n\n' \
  "$kind" "$url" "$url" "$url" \
  "$(stack_output "$INFRA_STACK" CognitoPoolId)" "$(stack_output "$INFRA_STACK" CognitoClientId)"
echo 'Check ./aws/cli/smoke.sh node|spring; use auth-demo.sh to register a user and create a link.'
