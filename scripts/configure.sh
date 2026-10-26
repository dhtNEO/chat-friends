#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ -f infra/compose/generated/mode ]] && [[ "$(cat infra/compose/generated/mode)" != "${1:-local}" ]] && [[ "${CHAT_ALLOW_MODE_CHANGE:-false}" != true ]]; then
  echo 'Troca de perfil exige parada, backup e CHAT_ALLOW_MODE_CHANGE=true; consulte o guia de operação.' >&2
  exit 1
fi
docker run --rm -e CHAT_TURN="${CHAT_TURN:-false}" --user "$(id -u):$(id -g)" -v "$PWD:/work" -w /work node:24.14.0-alpine node scripts/render-config.mjs "${1:-local}"
