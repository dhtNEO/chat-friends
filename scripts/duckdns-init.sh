#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
[[ "${1:-init}" == init || "${1:-init}" == --retry ]] || { echo 'Uso: duckdns-init.sh [--retry]' >&2; exit 1; }
source scripts/duckdns-common.sh
duck_lock
for service in backend web livekit edge; do
  if [[ -n "$("$duck_docker" ps -q --filter label=com.docker.compose.project=chat-friends --filter "label=com.docker.compose.service=$service")" ]]; then
    echo 'Pare a stack anterior (sem apagar volumes) antes do bootstrap DuckDNS.' >&2; exit 1
  fi
done
if [[ "${1:-init}" != --retry ]]; then
read -r -p 'Nome APP registrado (nome.duckdns.org): ' app
read -r -p 'Nome MIDIA registrado (outro.duckdns.org): ' media
read -r -p 'Email para certificado ACME: ' email
read -r -p 'IPv4 WAN atual do roteador: ' wan
read -r -p 'Porta HTTPS pública [18443]: ' https_port
https_port=${https_port:-18443}
read -r -s -p 'Token DuckDNS (não será exibido): ' token
printf '\n'
printf '%s' "$token" > "$duck_dir/token"
chmod 600 "$duck_dir/token"
unset token
printf '%s\n' "$app" "$media" "$email" "$wan" "$https_port" | duck_node init
fi
if [[ ! -f .env ]]; then ./scripts/configure.sh dev; fi
duck_node prepare >/dev/null
echo 'DNS confirmado e configuração preparada. Abra as portas previstas no guia e inicie CHAT_MODE=prd ./scripts/up.sh.'
