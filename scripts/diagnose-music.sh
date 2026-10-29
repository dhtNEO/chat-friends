#!/usr/bin/env bash
# Operator-only diagnostics. Never print keys, response bodies or expanded Compose config.
set -euo pipefail
cd "$(dirname "$0")/.."
./scripts/compose.sh ps -a music backend
./scripts/compose.sh exec -T backend timeout 10 bash -s <<'PROBE'
set -euo pipefail
key_file=${MUSIC_SECRET_FILE:-/run/secrets/music}
if [[ ! -f "$key_file" || ! -r "$key_file" ]]; then
  echo 'Música: backend não consegue ler a chave interna.'; exit 1
fi
IFS= read -r control_key < "$key_file" || [[ -n "${control_key:-}" ]]
if [[ ${#control_key} -lt 32 ]]; then echo 'Música: chave interna inválida.'; exit 1; fi
if [[ "${MUSIC_INTERNAL_URL:-http://music:8090}" != http://music:8090 ]]; then
  echo 'Música: endereço interno personalizado; este diagnóstico verifica o serviço padrão music:8090.'
fi
if ! { exec 3<>/dev/tcp/music/8090; } 2>/dev/null; then
  echo 'Música: falha de DNS/conexão do backend para music:8090.'; exit 1
fi
printf 'GET /state HTTP/1.1\r\nHost: music\r\nAuthorization: Bearer %s\r\nConnection: close\r\n\r\n' "$control_key" >&3
unset control_key
if ! IFS= read -r status <&3; then echo 'Música: serviço não retornou status HTTP.'; exit 1; fi
status=${status%$'\r'}
case "$status" in
  'HTTP/1.1 200 '*|'HTTP/1.0 200 '*) echo 'Música: backend alcança o bot e autentica com sucesso (HTTP 200).' ;;
  'HTTP/1.1 401 '*|'HTTP/1.0 401 '*|'HTTP/1.1 403 '*|'HTTP/1.0 403 '*) echo 'Música: chave divergente entre backend e bot (HTTP 401/403). Reconfigure e recrie os dois serviços juntos.'; exit 1 ;;
  *) echo 'Música: o bot retornou erro HTTP. Confira os logs do serviço music.'; exit 1 ;;
esac
exec 3>&-
PROBE
