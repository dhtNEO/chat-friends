#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/modes.sh
mode=$(chat_mode "${1-${CHAT_MODE-dev}}")
saved=$(chat_saved_mode)
if [[ -n "$saved" && "$saved" != "$mode" && "${CHAT_ALLOW_MODE_CHANGE:-false}" != true ]]; then
  echo 'Troca entre dev e prd exige parada, backup e CHAT_ALLOW_MODE_CHANGE=true.' >&2
  exit 1
fi
docker run --rm -e CHAT_TURN="${CHAT_TURN:-false}" --user "$(id -u):$(id -g)" -v "$PWD:/work" -w /work node:24.14.0-alpine node scripts/render-config.mjs "$mode"
