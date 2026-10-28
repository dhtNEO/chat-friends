#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/modes.sh
export CHAT_MODE=prd
[[ "${CHAT_TURN:-false}" != true ]] || { echo 'DuckDNS inicial não aceita TURN.' >&2; exit 1; }
action=${1:-update}
[[ "$action" == update || "$action" == --start ]] || { echo 'Uso: duckdns-update.sh [--start]' >&2; exit 1; }
[[ "$(chat_saved_mode)" == prd ]] || { echo 'Execute bootstrap DuckDNS em manutenção antes de atualizar.' >&2; exit 1; }
source scripts/duckdns-common.sh
duck_lock
[[ -f "$duck_dir/token" && -f "$duck_dir/settings.json" ]] || { echo 'Configuração DuckDNS ausente.' >&2; exit 1; }
if [[ "$action" == update && -z "$(./scripts/compose.sh ps -q livekit)" ]]; then echo 'SFU parada; o agendador não inicia a stack automaticamente.' >&2; exit 1; fi
if [[ "$action" == --start ]]; then decision=$(duck_node start); else decision=$(duck_node update); fi
[[ "$decision" == restart || "$decision" == unchanged ]] || exit 1
# Rebuild the active YAML from trusted code and private operator credentials.
# The worker only proposes network values; it cannot write active config/mode.
docker run --rm --network none --read-only --cap-drop ALL --security-opt no-new-privileges:true --user "$(id -u):$(id -g)" -v "$PWD:/work" -w /work node:24.22.1-alpine node scripts/render-config.mjs prd
if [[ "$action" == --start ]]; then ./scripts/compose.sh build; ./scripts/provision-db.sh; ./scripts/compose.sh up -d --no-build --wait --wait-timeout 240; fi
if [[ "$decision" == restart ]]; then
  ./scripts/compose.sh up -d --no-deps --force-recreate livekit
elif DUCKDNS_NETWORK=chat-friends_control_net duck_node commit; then
  exit 0
else
  echo 'SFU não saudável; tentando recriação.' >&2
  ./scripts/compose.sh up -d --no-deps --force-recreate livekit
fi
DUCKDNS_NETWORK=chat-friends_control_net duck_node commit
