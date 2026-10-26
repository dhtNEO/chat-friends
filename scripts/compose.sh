#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mode=${CHAT_MODE:-local}
args=(--env-file .env -f infra/compose/compose.yml)
if [[ "$mode" == internet ]]; then args+=(-f infra/compose/internet.yml); elif [[ "$mode" != local ]]; then echo 'CHAT_MODE inválido' >&2; exit 1; fi
if [[ "${CHAT_TURN:-false}" == true ]]; then args+=(-f infra/compose/turn.yml); fi
exec docker compose "${args[@]}" "$@"
