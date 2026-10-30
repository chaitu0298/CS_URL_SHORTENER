#!/usr/bin/env bash
# Deploy React frontend to private S3 + CloudFront; configure existing backend CORS and Cognito callback.
# Run from ANY directory: bash ./Frontend/aws/deploy-frontend.sh node
set -euo pipefail
KIND="${1:-node}"
[[ "$KIND" == node || "$KIND" == spring ]] || { echo 'Usage: deploy-frontend.sh node|spring' >&2; exit 2; }
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKEND_ROOT="${BACKEND_ROOT:-$(cd "$FRONTEND_ROOT/.." && pwd)}"
[[ -f "$BACKEND_ROOT/aws/cli/configure-frontend.sh" ]] || { echo "Expected backend project at $BACKEND_ROOT. Put Frontend/ inside AWS_Ready_URL_Shortener/, or set BACKEND_ROOT to that folder." >&2; exit 2; }
for cmd in aws npm node; do command -v "$cmd" >/dev/null || { echo "Missing command: $cmd" >&2; exit 2; }; done
export AWS_REGION="${AWS_REGION:-us-east-1}" AWS_DEFAULT_REGION="${AWS_REGION:-us-east-1}" AWS_PAGER=""
STACK_PREFIX="${STACK_PREFIX:-shortener-${KIND}-demo}"
INFRA_STACK="${STACK_PREFIX}-infra"
SERVICE_STACK="${STACK_PREFIX}-${KIND}-api"
FRONTEND_STACK="${STACK_PREFIX}-frontend"
aws_cli() { MSYS_NO_PATHCONV=1 aws --region "$AWS_REGION" "$@"; }
stack_output() { aws_cli cloudformation describe-stacks --stack-name "$1" --query "Stacks[0].Outputs[?OutputKey=='$2'].OutputValue | [0]" --output text; }

echo "Using AWS account $(aws_cli sts get-caller-identity --query Account --output text), region $AWS_REGION"
if ! aws_cli cloudformation describe-stacks --stack-name "$INFRA_STACK" >/dev/null 2>&1; then
  echo "Missing backend infrastructure stack '$INFRA_STACK'. Deploy the backend first: bash ./aws/cli/deploy.sh $KIND" >&2; exit 2
fi
if ! aws_cli cloudformation describe-stacks --stack-name "$SERVICE_STACK" >/dev/null 2>&1; then
  echo "Missing backend service stack '$SERVICE_STACK'. Deploy the backend first." >&2; exit 2
fi
API_BASE_URL="$(stack_output "$SERVICE_STACK" ApiUrl)"
COGNITO_DOMAIN="$(stack_output "$INFRA_STACK" CognitoDomain)"
CLIENT_ID="$(stack_output "$INFRA_STACK" CognitoClientId)"
[[ "$API_BASE_URL" == https://* && "$COGNITO_DOMAIN" == https://* && -n "$CLIENT_ID" && "$CLIENT_ID" != None ]] || {
  echo 'Backend stack outputs are incomplete. Run bash ./aws/cli/status.sh node|spring.' >&2; exit 2
}
cd "$FRONTEND_ROOT"
# Windows AWS CLI can open this relative file path in Git Bash.
aws_cli cloudformation validate-template --template-body file://aws/frontend-stack.yaml >/dev/null
printf '\nCreating/updating private S3 + CloudFront (billable)...\n'
aws_cli cloudformation deploy --stack-name "$FRONTEND_STACK" --template-file aws/frontend-stack.yaml --no-fail-on-empty-changeset --tags Project=URLShortener Environment=interview
SITE_URL="$(stack_output "$FRONTEND_STACK" SiteUrl)"
BUCKET="$(stack_output "$FRONTEND_STACK" BucketName)"
DISTRIBUTION="$(stack_output "$FRONTEND_STACK" DistributionId)"
SDLC_STACK="${STACK_PREFIX}-sdlc"
SDLC_URL=""
if aws_cli cloudformation describe-stacks --stack-name "$SDLC_STACK" >/dev/null 2>&1; then
  SDLC_URL="$(stack_output "$SDLC_STACK" SdlcApiUrl)"
  [[ "$SDLC_URL" == https://* ]] || { echo 'SDLC stack exists but URL output missing' >&2; exit 1; }
fi
[[ "$SITE_URL" == https://* && "$BUCKET" != None && "$DISTRIBUTION" != None ]] || { echo 'CloudFront stack outputs missing'; exit 1; }

printf '\nConfiguring backend CORS and Cognito callback: %s\n' "$SITE_URL"
# This updates the Cognito app client and the App Runner service's allowed browser origins.
# It does NOT modify database schema or reset the API.
( cd "$BACKEND_ROOT" && STACK_PREFIX="$STACK_PREFIX" AWS_REGION="$AWS_REGION" AWS_DEFAULT_REGION="$AWS_REGION" bash ./aws/cli/configure-frontend.sh "$KIND" "$SITE_URL" )

# Only PUBLIC configuration is compiled into the Vite bundle.
cat > "$FRONTEND_ROOT/.env.production.local" <<ENV
VITE_API_BASE_URL=$API_BASE_URL
VITE_COGNITO_DOMAIN=$COGNITO_DOMAIN
VITE_COGNITO_CLIENT_ID=$CLIENT_ID
VITE_COGNITO_REDIRECT_URI=$SITE_URL
VITE_SDLC_API_BASE_URL=$SDLC_URL
ENV
printf '\nInstalling frontend dependencies and building production site...\n'
npm install --no-audit --no-fund
npm run test
npm run build
printf '\nUploading assets to private S3 bucket: %s\n' "$BUCKET"
# Cache hashed Vite JS/CSS for one year. Publish index.html with immediate revalidation.
aws_cli s3 sync dist/ "s3://$BUCKET/" --exclude 'index.html' --delete --cache-control 'public,max-age=31536000,immutable'
aws_cli s3 cp dist/index.html "s3://$BUCKET/index.html" --content-type text/html --cache-control 'public,max-age=0,must-revalidate'
aws_cli cloudfront create-invalidation --distribution-id "$DISTRIBUTION" --paths '/*' >/dev/null
printf '\nFRONTEND DEPLOYED\nSITE_URL=%s\nAPI_BASE_URL=%s\nCOGNITO_DOMAIN=%s\n' "$SITE_URL" "$API_BASE_URL" "$COGNITO_DOMAIN"
echo 'CloudFront and ECS CORS changes can take time to become active. SDLC_URL:' "${SDLC_URL:-not configured}"
