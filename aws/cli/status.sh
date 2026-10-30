#!/usr/bin/env bash
set -euo pipefail
kind="${1:-node}"
export STACK_PREFIX="${STACK_PREFIX:-shortener-${kind}-demo}"
source "$(dirname "$0")/common.sh"
check_config
service_stack="${STACK_PREFIX}-${kind}-api"
if stack_exists "$service_stack"; then
  state="$(aws_cli cloudformation describe-stacks --stack-name "$service_stack" --query 'Stacks[0].StackStatus' --output text)"
  echo "CloudFormation: $state"
  if [[ "$state" == *COMPLETE && "$state" != ROLLBACK_COMPLETE ]]; then
    echo "Public HTTPS URL: $(stack_output "$service_stack" ApiUrl)"
    if [[ "$(stack_output "$service_stack" HostingMode)" == ecs-fargate-api-gateway ]]; then
      aws_cli ecs describe-services --cluster "$(stack_output "$service_stack" ClusterName)" --services "$(stack_output "$service_stack" ServiceName)" --query 'services[0].[status,runningCount,desiredCount]' --output table
    fi
  fi
else echo "$kind: No API stack"; fi
if stack_exists "$INFRA_STACK"; then
  echo "Cognito User Pool: $(stack_output "$INFRA_STACK" CognitoPoolId)"
  echo "Cognito Client: $(stack_output "$INFRA_STACK" CognitoClientId)"
  echo "Cognito Domain: $(stack_output "$INFRA_STACK" CognitoDomain)"
fi
