#!/usr/bin/env bash
set -euo pipefail
kind="${1:-node}"; export STACK_PREFIX="${STACK_PREFIX:-shortener-${kind}-demo}"
source "$(dirname "$0")/common.sh"
check_config
stack="${STACK_PREFIX}-sdlc"
url="$(stack_output "$stack" SdlcApiUrl)"
echo "SDLC_API_URL=$url"
aws_cli ecs describe-services --cluster "${stack}-cluster" --services "${stack}-service" --query 'services[0].{status:status,running:runningCount,desired:desiredCount,events:events[0:3].[createdAt,message]}' --output json
echo 'Health test:'
curl --fail --show-error "$url/sdlc/health"
