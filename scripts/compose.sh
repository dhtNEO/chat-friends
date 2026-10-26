#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/modes.sh
mode=$(chat_mode "${CHAT_MODE-dev}")
args=(--env-file .env)
for file in infra/compose/generated/runtime.env infra/compose/generated/network/network.env; do
  if [[ -f "$file" ]]; then args+=(--env-file "$file"); fi
done
args+=(-f infra/compose/compose.yml)
if [[ "$mode" == prd ]]; then args+=(-f infra/compose/prd.yml); fi
if [[ "$mode" == prd ]] && { [[ -f infra/compose/generated/duckdns/settings.json ]] || [[ "${CHAT_DUCKDNS_DNS01:-false}" == true ]]; }; then
  args+=(-f infra/compose/duckdns-dns01.yml)
fi
if [[ "${CHAT_ACME_STAGING:-false}" == true ]]; then
  [[ "$mode" == prd ]] || { echo 'ACME staging exige prd.' >&2; exit 1; }
  args+=(-f infra/compose/acme-staging.yml)
fi
if [[ "${CHAT_TURN:-false}" == true ]]; then
  [[ "$mode" == prd ]] || { echo 'TURN exige prd.' >&2; exit 1; }
  args+=(-f infra/compose/turn.yml)
fi
exec "${DUCKDNS_DOCKER_BIN:-docker}" compose "${args[@]}" "$@"
