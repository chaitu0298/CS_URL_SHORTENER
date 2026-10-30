#!/usr/bin/env bash
set -euo pipefail
AWS_REGION="${AWS_REGION:-us-east-1}"
STACK_PREFIX="${STACK_PREFIX:-shortener-demo}"
INFRA_STACK="${STACK_PREFIX}-infra"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${HERE}/../.." && pwd)"
export AWS_REGION AWS_DEFAULT_REGION="$AWS_REGION" AWS_PAGER=""
# AWS_PROFILE is optional: accepts AWS SSO/assumed role/environment credentials.
# In Git Bash, native Windows aws.exe must not receive MSYS-rewritten file:// paths.
# Relative template references are resolved after callers cd into the repo root.
aws_cli() { MSYS_NO_PATHCONV=1 aws --region "$AWS_REGION" "$@"; }
require() { command -v "$1" >/dev/null || { echo "Missing prerequisite: $1" >&2; exit 2; }; }
check_config() {
  require aws
  [[ "$STACK_PREFIX" =~ ^[a-z][a-z0-9-]{2,22}$ ]] || { echo 'STACK_PREFIX must be 3-23 lowercase letters/digits/hyphens, starting with a letter' >&2; exit 2; }
  aws_cli sts get-caller-identity --query '[Account,Arn]' --output text >&2
}
stack_output() {
  local stack="$1" key="$2"
  aws_cli cloudformation describe-stacks --stack-name "$stack" \
    --query "Stacks[0].Outputs[?OutputKey=='${key}'].OutputValue | [0]" --output text
}
stack_exists() { aws_cli cloudformation describe-stacks --stack-name "$1" >/dev/null 2>&1; }
