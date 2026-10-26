#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export CHAT_MODE=tailscale
[[ "${CHAT_TURN:-false}" != true ]] || { echo 'Tailscale não aceita TURN público' >&2; exit 1; }
action=${1:-configure}
case "$action" in preflight|start|login|configure) ;; *) echo 'Uso: tailscale-init.sh [preflight|start|login|configure]' >&2; exit 1;; esac
# Verifica o dispositivo no daemon Docker (que pode estar em outra VM).
image=tailscale/tailscale:v1.104.2@sha256:b11583ad2e93e4671128538c88cf11f460444a5d7e449311dd1933a400ab849d
if ! docker run --rm --cap-add NET_ADMIN --device /dev/net/tun --entrypoint sh "$image" -c 'test -c /dev/net/tun' >/dev/null 2>&1; then
  echo 'TUN indisponível no Docker. Use Linux/OrbStack com /dev/net/tun; não há fallback userspace para a SFU.' >&2
  exit 1
fi
if [[ "$action" == preflight ]]; then exit 0; fi
if [[ ! -f .env ]]; then ./scripts/configure.sh local; fi
# Mudar namespace/configuração com serviços ativos interromperia chamadas.
for service in backend livekit web; do
  if [[ -n "$(docker ps -q --filter label=com.docker.compose.project=chat-friends --filter "label=com.docker.compose.service=$service")" ]]; then
    echo 'Pare backend, livekit e web antes do bootstrap; consulte docs/TAILSCALE_SETUP.md.' >&2
    exit 1
  fi
done
./scripts/compose.sh up -d tailscale
if [[ "$action" == start ]]; then
  echo 'Nó iniciado. Execute ./scripts/tailscale-init.sh login no terminal privado.'
  exit 0
fi
if [[ "$action" == login ]]; then
  # A URL de autenticação é exibida somente no terminal privado do proprietário.
  ./scripts/compose.sh exec tailscale tailscale login
  exit 0
fi
# Obtém apenas o IP da interface Docker. Não imprimir inspect/env/status completos.
docker_ip=$(./scripts/compose.sh exec -T tailscale sh -c "ip -4 -o addr show dev eth0 | awk '{print \$4}' | cut -d/ -f1")
./scripts/compose.sh exec -T tailscale tailscale status --json | docker run --rm -i \
  --user "$(id -u):$(id -g)" -v "$PWD:/work" -w /work node:24.14.0-alpine \
  node scripts/tailscale-config.mjs "$docker_ip"
