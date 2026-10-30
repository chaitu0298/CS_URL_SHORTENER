#!/usr/bin/env bash
# Usage: bash aws/cli/configure-frontend.sh node https://dxxxxxxxxxxxx.cloudfront.net/
set -euo pipefail
kind="${1:-node}"
[[ "$kind" == node || "$kind" == spring ]] || exit 2
export STACK_PREFIX="${STACK_PREFIX:-shortener-${kind}-demo}"
source "$(dirname "$0")/common.sh"
cd "$ROOT"
callback="${2:-}"
[[ "$callback" == https://* || "$callback" == http://localhost:* || "$callback" == http://127.0.0.1:* ]] || { echo 'HTTPS callback required (except localhost)' >&2; exit 2; }
check_config
# Standardized URI parsing without a mandatory python3 dependency.
origin="$(printf '%s\n' "$callback" | sed -E 's#^(https?://[^/]+).*#\1#')"
class="$(aws_cli cloudformation describe-stacks --stack-name "$INFRA_STACK" --query 'Stacks[0].Parameters[?ParameterKey==`DbClass`].ParameterValue | [0]' --output text)"
echo "Updating Cognito callback to $callback"
aws_cli cloudformation deploy --stack-name "$INFRA_STACK" --template-file aws/cli/infra.json --capabilities CAPABILITY_IAM \
  --parameter-overrides "DbClass=$class" "CallbackUrl=$callback" --no-fail-on-empty-changeset
stack="${STACK_PREFIX}-${kind}-api"
[[ "$(stack_output "$stack" HostingMode)" == ecs-fargate-api-gateway ]] || { echo 'ECS stack not deployed. Use deploy-ecs.sh first.' >&2; exit 1; }
# CloudFormation automatically uses previous stack parameters not included in the override.
aws_cli cloudformation deploy --stack-name "$stack" --template-file aws/cli/ecs-service.json \
  --capabilities CAPABILITY_IAM --parameter-overrides "CorsOrigins=http://localhost:5173,$origin" --no-fail-on-empty-changeset
echo "Frontend origin allowed: $origin"
