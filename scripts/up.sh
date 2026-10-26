#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ "${CHAT_MODE:-local}" == tailscale ]]; then
  # Somente depois do login inicial. Recria consumidores do namespace em conjunto.
  ./scripts/tailscale-init.sh preflight
  ./scripts/compose.sh stop web livekit backend
  ./scripts/tailscale-init.sh configure
  ./scripts/compose.sh up -d --build --force-recreate --wait --wait-timeout 240 backend web livekit
else
  ./scripts/configure.sh "${CHAT_MODE:-local}"
  ./scripts/compose.sh up -d --build --wait --wait-timeout 240
fi
./scripts/compose.sh ps
