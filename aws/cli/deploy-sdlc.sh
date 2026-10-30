#!/usr/bin/env bash
# Deploy isolated, Cognito-protected SDLC runner; do not change public short-link ECS service.
# bash aws/cli/deploy-sdlc.sh node <ADMIN_COGNITO_SUB> [--build]
set -euo pipefail
kind="${1:-node}"; admins="${2:-}"
[[ "$kind" == node || "$kind" == spring ]] || { echo 'Usage: deploy-sdlc.sh node|spring ADMIN_SUB [--build]' >&2; exit 2; }
[[ "$admins" =~ ^[0-9a-fA-F-]{36}(,[0-9a-fA-F-]{36})*$ ]] || { echo 'Specify Cognito subject UUID(s) from your signed-in dashboard, NOT email or access key.' >&2; exit 2; }
[[ "${3:-}" == '' || "${3:-}" == '--build' ]] || exit 2
export STACK_PREFIX="${STACK_PREFIX:-shortener-${kind}-demo}"
source "$(dirname "$0")/common.sh"
cd "$ROOT"
check_config
require docker
require node
[[ "$(stack_output "$INFRA_STACK" CognitoPoolId)" != None ]] || { echo 'Missing Cognito infrastructure'; exit 1; }
service_stack="${STACK_PREFIX}-sdlc"
existing=''
if stack_exists "$service_stack"; then
  existing="$(aws_cli cloudformation describe-stacks --stack-name "$service_stack" --query 'Stacks[0].StackStatus' --output text)"
  [[ "$existing" == CREATE_COMPLETE || "$existing" == UPDATE_COMPLETE ]] || { echo "SDLC stack is $existing. Inspect failures before retry. Do not delete persistent EFS casually." >&2; exit 1; }
fi
repo_name="${STACK_PREFIX}-sdlc"
repo_uri="$(aws_cli ecr describe-repositories --repository-names "$repo_name" --query 'repositories[0].repositoryUri' --output text 2>/dev/null || true)"
if [[ -z "$repo_uri" || "$repo_uri" == None ]]; then
  repo_uri="$(aws_cli ecr create-repository --repository-name "$repo_name" --image-scanning-configuration scanOnPush=true --query 'repository.repositoryUri' --output text)"
fi
# Use the repository root as Docker context but avoid uploading secrets, .git, build outputs, and local state.
# Dockerfile uses only the explicitly listed NodeJS paths.
[[ -f .dockerignore ]] && { echo 'An existing repository-root .dockerignore controls build context; verify that secrets are excluded.' >&2; } || true
# Prefer a filtered, temporary build context to avoid accidentally sending credentials or state to Docker.
context="$(mktemp -d)"
trap 'rm -rf "$context"' EXIT
mkdir -p "$context/NodeJS/sdlc" "$context/NodeJS/src"
cp NodeJS/package.json "$context/NodeJS/"
[[ -f NodeJS/package-lock.json ]] && cp NodeJS/package-lock.json "$context/NodeJS/"
cp NodeJS/src/*.mjs "$context/NodeJS/src/"
cp NodeJS/sdlc/*.mjs "$context/NodeJS/sdlc/"
cp NodeJS/sdlc/Dockerfile.aws "$context/Dockerfile"
account="$(aws_cli sts get-caller-identity --query Account --output text)"
aws_cli ecr get-login-password | docker login --username AWS --password-stdin "${account}.dkr.ecr.${AWS_REGION}.amazonaws.com"
# Every deployment gets an immutable tag. An existing stack is updated in place (EFS retained).
image="${repo_uri}:$(date -u +%Y%m%d%H%M%S)-$$"
echo "Building bounded SDLC runner (not public URL shortener): $image"
docker build --platform linux/amd64 -t "$image" "$context"
docker push "$image"
physical_id() { aws_cli cloudformation describe-stack-resource --stack-name "$INFRA_STACK" --logical-resource-id "$1" --query 'StackResourceDetail.PhysicalResourceId' --output text; }
vpc="$(physical_id Vpc)"; private_a="$(physical_id PrivateA)"; private_b="$(physical_id PrivateB)"
# Preserve CloudFront origin from existing frontend if already deployed.
origins="http://localhost:5173"
frontend_stack="${STACK_PREFIX}-frontend"
if stack_exists "$frontend_stack"; then
  site="$(stack_output "$frontend_stack" SiteUrl)"
  [[ "$site" == https://* ]] && origins="${origins},${site%/}"
fi
aws_cli cloudformation validate-template --template-body file://aws/cli/sdlc-service.json >/dev/null
echo 'Creating restricted control plane (billable ECS/ALB/EFS/API Gateway resources). Existing URL shortener and RDS remain untouched.'
aws_cli cloudformation deploy --stack-name "$service_stack" --template-file aws/cli/sdlc-service.json \
  --capabilities CAPABILITY_IAM --no-fail-on-empty-changeset \
  --parameter-overrides "InfraStack=$INFRA_STACK" "VpcId=$vpc" "PrivateSubnetA=$private_a" \
  "PrivateSubnetB=$private_b" "ImageUri=$image" "CorsOrigins=$origins" "AdminSubs=$admins" \
  --tags Project=URLShortener Role=SDLCControlPlane Environment=interview
url="$(stack_output "$service_stack" SdlcApiUrl)"
echo "SDLC_API_URL=$url"
echo "GET $url/sdlc/health (unprotected health probe)"
echo 'All other /sdlc/ routes require Cognito access token AND admin-sub allowlisting.'
echo 'Redeploy frontend: bash Frontend/aws/deploy-frontend.sh node'
