#!/usr/bin/env bash
# Deletes only SDLC stack. DOES NOT delete shortener RDS / Cognito / frontend.
# EFS run history is permanently lost when the stack is deleted; back up first.
set -euo pipefail
kind="${1:-node}"; export STACK_PREFIX="${STACK_PREFIX:-shortener-${kind}-demo}"
source "$(dirname "$0")/common.sh"
check_config
stack="${STACK_PREFIX}-sdlc"
echo "WARNING: deleting $stack destroys its EFS-backed run history."
[[ "${2:-}" == 'DELETE-SDLC-DATA' ]] || { echo "To confirm: bash aws/cli/destroy-sdlc.sh $kind DELETE-SDLC-DATA"; exit 2; }
aws_cli cloudformation delete-stack --stack-name "$stack"
aws_cli cloudformation wait stack-delete-complete --stack-name "$stack"
echo 'SDLC stack removed. Separate ECR repository/images still exist; delete manually if unneeded.'
