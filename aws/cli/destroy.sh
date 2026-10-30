#!/usr/bin/env bash
# Destructive: removes public services, user pool and DB; CFN retains a final RDS snapshot.
set -euo pipefail
kind="${1:-node}"
export STACK_PREFIX="${STACK_PREFIX:-shortener-${kind}-demo}"
source "$(dirname "$0")/common.sh"
check_config
read -r -p "Type DELETE ${STACK_PREFIX} to remove deployed resources (Cognito users/links will be lost): " confirmation
[[ "$confirmation" == "DELETE ${STACK_PREFIX}" ]] || { echo 'Cancelled';exit 1; }
for kind in node spring; do
  s="${STACK_PREFIX}-${kind}-api"
  if stack_exists "$s"; then
    echo "Deleting service: $s"
    aws_cli cloudformation delete-stack --stack-name "$s"
    aws_cli cloudformation wait stack-delete-complete --stack-name "$s"
  fi
done
if stack_exists "$INFRA_STACK"; then
  echo "Deleting shared infrastructure: $INFRA_STACK"
  aws_cli cloudformation delete-stack --stack-name "$INFRA_STACK"
  aws_cli cloudformation wait stack-delete-complete --stack-name "$INFRA_STACK"
fi
cat <<'MSG'
Deleted CloudFormation stacks. Database final snapshots may remain and incur storage charges.
Review RDS snapshots, CloudWatch logs and AWS billing before assuming all costs stopped.
MSG
