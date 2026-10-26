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
docker run --rm --network none --read-only --cap-drop ALL --security-opt no-new-privileges:true --pids-limit 128 --memory 256m -e CHAT_TURN="${CHAT_TURN:-false}" --user "$(id -u):$(id -g)" -v "$PWD:/work" -w /work node:24.22.1-alpine node scripts/render-config.mjs "$mode"
