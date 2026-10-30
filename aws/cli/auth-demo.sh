#!/usr/bin/env bash
# Interactive first-user setup and authenticated create/redirect tests.
set -euo pipefail
kind="${1:-node}"
export STACK_PREFIX="${STACK_PREFIX:-shortener-${kind}-demo}"
source "$(dirname "$0")/common.sh"
[[ "$kind" == node || "$kind" == spring ]] || exit 2
check_config
require python3
pool="$(stack_output "$INFRA_STACK" CognitoPoolId)"
client="$(stack_output "$INFRA_STACK" CognitoClientId)"
url="$(stack_output "${STACK_PREFIX}-${kind}-api" ApiUrl)"
read -r -p 'Email (new or existing Cognito user): ' email
read -r -s -p 'Password (12+ chars, mixed case, number, symbol): ' password
echo
read -r -p 'New user? Type yes to register, or press Enter to sign in: ' is_new
if [[ "$is_new" == yes ]]; then
  aws_cli cognito-idp sign-up --client-id "$client" --username "$email" --password "$password" --user-attributes "Name=email,Value=$email" >/dev/null
  echo "Cognito sent a verification code to $email"
  read -r -p 'Email verification code: ' code
  aws_cli cognito-idp confirm-sign-up --client-id "$client" --username "$email" --confirmation-code "$code"
fi
# Avoid printing tokens or passwords in terminal output; a CLI caller can still inspect its own process.
token="$(aws_cli cognito-idp initiate-auth --client-id "$client" --auth-flow USER_PASSWORD_AUTH \
  --auth-parameters "USERNAME=$email,PASSWORD=$password" --query 'AuthenticationResult.AccessToken' --output text)"
unset password
[[ "$token" != None && -n "$token" ]] || { echo 'No access token; finish verification or password challenge' >&2; exit 1; }
echo 'Creating link with JWT authentication...'
create="$(curl -fsS -X POST "$url/api/v1/links" -H "Authorization: Bearer $token" -H 'Content-Type: application/json' -d '{"url":"https://example.org","ttlHours":24}')"
echo "$create" | python3 -m json.tool
short="$(printf '%s' "$create" | python3 -c 'import sys,json;print(json.load(sys.stdin)["shortUrl"])')"
echo "Public redirect: $short"
echo "Redirect status (should be 302):"
curl -s -o /dev/null -w '%{http_code}\n' "$short"
