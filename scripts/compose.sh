#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/modes.sh
mode=$(chat_mode "${CHAT_MODE-dev}")
saved=$(chat_saved_mode)
if [[ -n "$saved" && "$saved" != "$mode" ]]; then
  case "${1:-}" in
    config|ps|logs|top|images|version|down|stop|kill) ;;
    *) echo "Modo ativo: $saved. Pare a stack e use configure.sh na troca de modo antes deste comando." >&2; exit 1 ;;
  esac
fi
args=(--env-file .env)
[[ ! -f infra/compose/generated/runtime.env ]] || args+=(--env-file infra/compose/generated/runtime.env)
chat_network_snapshot=""
if [[ -f infra/compose/generated/network/network.env ]]; then
  umask 077
  chat_network_snapshot=$(mktemp "$PWD/infra/compose/generated/.network.XXXXXX")
  trap 'rm -f "$chat_network_snapshot"' EXIT
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ -z "$line" || "$line" == \#* ]] && continue
    [[ "$line" == *=* ]] || { echo 'Arquivo de rede inválido.' >&2; exit 1; }
    key=${line%%=*}; value=${line#*=}
    case "$key" in
      APP_DOMAIN|MEDIA_DOMAIN|ACME_EMAIL|PUBLIC_HTTPS_PORT|APP_ORIGIN|LIVEKIT_PUBLIC_URL|COOKIE_SECURE|LIVEKIT_NODE_IP|LIVEKIT_INTERNAL_URL) ;;
      *) echo 'Parâmetro de rede não permitido; configuração privada preservada.' >&2; exit 1 ;;
    esac
    [[ "$value" =~ ^[a-zA-Z0-9:/@._+-]+$ ]] || { echo 'Valor de rede inválido; expansões não são permitidas.' >&2; exit 1; }
    case "$key" in
      COOKIE_SECURE) [[ "$value" == true ]] || exit 1 ;;
      LIVEKIT_INTERNAL_URL) [[ "$value" == http://livekit:7880 ]] || exit 1 ;;
      APP_ORIGIN) [[ "$value" == https://* ]] || exit 1 ;;
      LIVEKIT_PUBLIC_URL) [[ "$value" == wss://* ]] || exit 1 ;;
    esac
    printf '%s=%s\n' "$key" "$value" >> "$chat_network_snapshot"
  done < infra/compose/generated/network/network.env
  args+=(--env-file "$chat_network_snapshot")
fi
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
if [[ -n "$chat_network_snapshot" ]]; then
  "${DUCKDNS_DOCKER_BIN:-docker}" compose "${args[@]}" "$@"
else
  exec "${DUCKDNS_DOCKER_BIN:-docker}" compose "${args[@]}" "$@"
fi
