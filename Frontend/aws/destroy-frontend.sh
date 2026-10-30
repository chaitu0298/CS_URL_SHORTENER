#!/usr/bin/env bash
# Cleanup ONLY the frontend (private S3 objects, CloudFront, CloudFormation).
set -euo pipefail
kind="${1:-node}"; confirm="${2:-}"
[[ "$confirm" == '--yes-delete' ]] || { echo 'Destructive operation. Usage: bash Frontend/aws/destroy-frontend.sh node --yes-delete' >&2; exit 2; }
prefix="${STACK_PREFIX:-shortener-${kind}-demo}"; stack="${prefix}-frontend"; region="${AWS_REGION:-us-east-1}"
aws_cli() { MSYS_NO_PATHCONV=1 aws --region "$region" "$@"; }
bucket="$(aws_cli cloudformation describe-stacks --stack-name "$stack" --query 'Stacks[0].Outputs[?OutputKey==`BucketName`].OutputValue | [0]' --output text)"
[[ "$bucket" != None && -n "$bucket" ]] || { echo 'Cannot find frontend bucket'; exit 1; }
# S3 bucket may have been retained because of CFN Retain: explicitly empty then remove.
aws_cli s3 rm "s3://$bucket/" --recursive
aws_cli cloudformation delete-stack --stack-name "$stack"
aws_cli cloudformation wait stack-delete-complete --stack-name "$stack"
# Retained bucket remains and can be deleted now it is empty.
aws_cli s3api delete-bucket --bucket "$bucket"
echo 'Frontend distribution, bucket and stack deleted. Backend stack is untouched.'
