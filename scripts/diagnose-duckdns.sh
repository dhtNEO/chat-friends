#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/duckdns-common.sh
duck_lock
DUCKDNS_NETWORK=chat-friends_default duck_node diagnose
DUCKDNS_NETWORK=chat-friends_default duck_node health
CHAT_MODE=prd ./scripts/compose.sh ps
