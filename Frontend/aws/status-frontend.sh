#!/usr/bin/env bash
set -euo pipefail
kind="${1:-node}"; prefix="${STACK_PREFIX:-shortener-${kind}-demo}"
region="${AWS_REGION:-us-east-1}"
MSYS_NO_PATHCONV=1 aws --region "$region" cloudformation describe-stacks --stack-name "${prefix}-frontend" --query 'Stacks[0].Outputs[].[OutputKey,OutputValue]' --output table
