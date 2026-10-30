#!/usr/bin/env bash
set -euo pipefail
kind="${1:-node}"
export STACK_PREFIX="${STACK_PREFIX:-shortener-${kind}-demo}"
source "$(dirname "$0")/common.sh"
[[ "$kind" == node || "$kind" == spring ]] || exit 2
check_config
url="$(stack_output "${STACK_PREFIX}-${kind}-api" ApiUrl)"
echo "Testing $url"
curl -fsS "$url/health"; echo
curl -fsS "$url/ready"; echo
status="$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$url/api/v1/links" -H 'Content-Type: application/json' -d '{"url":"https://example.org"}')"
[[ "$status" == '401' ]] || { echo "Expected 401 for unauthenticated link creation; got $status" >&2; exit 1; }
echo 'PASS: health, database readiness, and unauthenticated create blocked (401)'
