#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
docker run --rm -e CHAT_TURN="${CHAT_TURN:-false}" --user "$(id -u):$(id -g)" -v "$PWD:/work" -w /work node:24.14.0-alpine node scripts/render-config.mjs "${1:-local}"
