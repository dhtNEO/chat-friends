#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mode=${CHAT_MODE:-local}
args=(--env-file .env -f infra/compose/compose.yml)
case "$mode" in
  local) ;;
  internet) args+=(-f infra/compose/internet.yml) ;;
  tailscale)
    [[ "${CHAT_TURN:-false}" != true ]] || { echo 'Tailscale não aceita CHAT_TURN=true' >&2; exit 1; }
    args+=(-f infra/compose/tailscale.yml) ;;
  *) echo 'CHAT_MODE inválido' >&2; exit 1 ;;
esac
if [[ "${CHAT_TURN:-false}" == true ]]; then args+=(-f infra/compose/turn.yml); fi
exec docker compose "${args[@]}" "$@"
