#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
username=${1:?Uso: scripts/reset-mfa.sh usuario}
[[ "$username" =~ ^[a-z0-9][a-z0-9_.-]{2,31}$ ]] || exit 1
./scripts/compose.sh run --rm --no-deps backend --server.port=0 --reset-mfa="$username"
