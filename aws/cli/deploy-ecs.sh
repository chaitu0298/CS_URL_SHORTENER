#!/usr/bin/env bash
# AWS CLI 2.15+ / Git Bash. Reuses VPC, RDS, Cognito and ECR from original successful infrastructure stack.
# Usage: bash ./aws/cli/deploy-ecs.sh node [--build]   (or spring)
set -euo pipefail
kind="${1:-node}"
[[ "$kind" == node || "$kind" == spring ]] || { echo 'Usage: deploy-ecs.sh node|spring [--build]' >&2; exit 2; }
[[ "${2:-}" == '' || "${2:-}" == '--build' ]] || { echo 'Unknown option. Use --build to rebuild image.' >&2; exit 2; }
export STACK_PREFIX="${STACK_PREFIX:-shortener-${kind}-demo}"
source "$(dirname "$0")/common.sh"
cd "$ROOT"
check_config
aws_cli cloudformation validate-template --template-body file://aws/cli/ecs-service.json >/dev/null
[[ "$(stack_output "$INFRA_STACK" DbEndpoint)" != None ]] || { echo "Existing infrastructure $INFRA_STACK not found" >&2; exit 2; }
other_kind=spring; [[ "$kind" == spring ]] && other_kind=node
[[ "$kind" == node ]] && repo_key=NodeRepositoryUri || repo_key=SpringRepositoryUri
[[ "$kind" == node ]] && project=NodeJS || project=SpringBoot
repo="$(stack_output "$INFRA_STACK" "$repo_key")"
[[ "$repo" == *amazonaws.com/* ]] || { echo 'Missing existing ECR repository'; exit 2; }
service_stack="${STACK_PREFIX}-${kind}-api"
# The failed App Runner stack has no usable service. Remove ONLY that stack, never the infrastructure stack.
if stack_exists "$service_stack"; then
  stack_status="$(aws_cli cloudformation describe-stacks --stack-name "$service_stack" --query 'Stacks[0].StackStatus' --output text)"
  if [[ "$stack_status" == ROLLBACK_COMPLETE ]]; then
    echo "Removing failed, empty App Runner stack $service_stack ($stack_status). Infrastructure remains untouched."
    aws_cli cloudformation delete-stack --stack-name "$service_stack"
    aws_cli cloudformation wait stack-delete-complete --stack-name "$service_stack"
  elif [[ "$stack_status" == CREATE_COMPLETE || "$stack_status" == UPDATE_COMPLETE ]]; then
    mode="$(stack_output "$service_stack" HostingMode)"
    [[ "$mode" == ecs-fargate-api-gateway ]] || { echo "Refusing to overwrite unexpected existing $service_stack ($mode)." >&2; exit 2; }
  else
    echo "Stack $service_stack is $stack_status. Inspect CloudFormation before retrying." >&2; exit 2
  fi
fi
# CloudFormation physical resource IDs for the network already in your account.
physical_id() {
  aws_cli cloudformation describe-stack-resource --stack-name "$INFRA_STACK" --logical-resource-id "$1" --query 'StackResourceDetail.PhysicalResourceId' --output text
}
vpc="$(physical_id Vpc)"
private_a="$(physical_id PrivateA)"
private_b="$(physical_id PrivateB)"
app_sg="$(physical_id AppSg)"
for item in "$vpc" "$private_a" "$private_b" "$app_sg"; do
  [[ -n "$item" && "$item" != None ]] || { echo 'Missing VPC/subnet/security group'; exit 2; }
done
if [[ "${2:-}" == '--build' ]]; then
  require docker
  docker info >/dev/null
  account="$(aws_cli sts get-caller-identity --query Account --output text)"
  aws_cli ecr get-login-password | docker login --username AWS --password-stdin "${account}.dkr.ecr.${AWS_REGION}.amazonaws.com"
  image="$repo:$(date -u +%Y%m%d%H%M%S)-$$"
  echo "Building $project and pushing $image"
  docker build --platform linux/amd64 --pull -t "$image" "$project"
  docker push "$image"
else
  repository="${repo##*/}"
  tag="$(aws_cli ecr describe-images --repository-name "$repository" --filter tagStatus=TAGGED --query 'sort_by(imageDetails,& imagePushedAt)[-1].imageTags[0]' --output text)"
  [[ "$tag" != None && -n "$tag" ]] || { echo "No tagged image found in ECR repository $repository. Retry with --build" >&2; exit 2; }
  image="$repo:$tag"
  echo "Reusing existing Docker image: $image"
fi
cors="${CORS_ORIGINS:-http://localhost:5173}"
echo 'Deploying new AWS resources: ECS Fargate + internal ALB + API Gateway HTTP API. AWS usage charges increase here.'
echo "Reusing existing RDS/Cognito/network/ECR: $INFRA_STACK"
aws_cli cloudformation deploy --stack-name "$service_stack" --template-file aws/cli/ecs-service.json \
  --capabilities CAPABILITY_IAM --no-fail-on-empty-changeset \
  --parameter-overrides "InfraStack=$INFRA_STACK" "VpcId=$vpc" "PrivateSubnetA=$private_a" \
  "PrivateSubnetB=$private_b" "AppSecurityGroup=$app_sg" "AppKind=$kind" "ImageUri=$image" "CorsOrigins=$cors" \
  --tags Project=URLShortener Environment=interview
url="$(stack_output "$service_stack" ApiUrl)"
[[ "$url" == https://* ]] || { echo 'Cannot find HTTPS API output'; exit 1; }
printf '\nECS API DEPLOYED\nAPI_BASE_URL=%s\nHEALTH=%s/health\nREADY=%s/ready\n' "$url" "$url" "$url"
printf 'COGNITO_POOL_ID=%s\nCOGNITO_CLIENT_ID=%s\n' "$(stack_output "$INFRA_STACK" CognitoPoolId)" "$(stack_output "$INFRA_STACK" CognitoClientId)"
echo 'Run bash ./aws/cli/smoke.sh node or bash ./aws/cli/auth-demo.sh node.'
