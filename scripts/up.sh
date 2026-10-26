#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/modes.sh
CHAT_MODE=$(chat_mode "${CHAT_MODE-dev}")
export CHAT_MODE
./scripts/configure.sh "$CHAT_MODE"
if [[ "$CHAT_MODE" == prd && -f infra/compose/generated/duckdns/settings.json ]]; then
  exec ./scripts/duckdns-update.sh --start
fi
./scripts/compose.sh build
./scripts/provision-db.sh
./scripts/compose.sh up -d --no-build --wait --wait-timeout 240
./scripts/compose.sh ps
