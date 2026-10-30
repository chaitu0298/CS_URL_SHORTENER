#!/usr/bin/env bash
# Generate .env.local for Vite with ECS + Cognito + optional hosted SDLC API.
set -euo pipefail
kind="${1:-node}"; [[ "$kind" == node || "$kind" == spring ]] || { echo 'Usage: configure-local.sh node|spring' >&2; exit 2; }
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
region="${AWS_REGION:-us-east-1}"; prefix="${STACK_PREFIX:-shortener-${kind}-demo}"; infra="${prefix}-infra"; service="${prefix}-${kind}-api"
aws_cli(){ MSYS_NO_PATHCONV=1 aws --region "$region" "$@"; }
output(){ aws_cli cloudformation describe-stacks --stack-name "$1" --query "Stacks[0].Outputs[?OutputKey=='$2'].OutputValue | [0]" --output text; }
url="$(output "$service" ApiUrl)"
domain="$(output "$infra" CognitoDomain)"
client="$(output "$infra" CognitoClientId)"
[[ "$url" == https://* && "$domain" == https://* && "$client" != None ]] || { echo 'Backend not deployed or stack names incorrect' >&2; exit 1; }
cat > "$ROOT/.env.local" <<ENV
VITE_API_BASE_URL=$url
VITE_COGNITO_DOMAIN=$domain
VITE_COGNITO_CLIENT_ID=$client
VITE_COGNITO_REDIRECT_URI=http://localhost:5173/
ENV
sdlc_stack="${prefix}-sdlc"
if aws_cli cloudformation describe-stacks --stack-name "$sdlc_stack" >/dev/null 2>&1; then
  sdlc_url="$(output "$sdlc_stack" SdlcApiUrl)"
  [[ "$sdlc_url" == https://* ]] && echo "VITE_SDLC_API_BASE_URL=$sdlc_url" >> "$ROOT/.env.local"
fi
pool="$(output "$infra" CognitoPoolId)"
callbacks="$(aws_cli cognito-idp describe-user-pool-client --user-pool-id "$pool" --client-id "$client" --query 'UserPoolClient.CallbackURLs' --output text || true)"
echo "Created $ROOT/.env.local (public settings only)."
if [[ "$callbacks" != *'http://localhost:5173/'* ]]; then
  echo 'WARNING: Cognito no longer allows http://localhost:5173/ as a callback.'
  echo 'You may have deployed the CloudFront frontend already. For local sign-in, add localhost to the Cognito app client callback/logout URIs and backend CORS.'
fi
echo 'Run: cd Frontend && npm install && npm run dev'
