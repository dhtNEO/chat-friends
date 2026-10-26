#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
./scripts/configure.sh "${CHAT_MODE:-local}"
./scripts/compose.sh up -d --build --wait --wait-timeout 240
./scripts/compose.sh ps
