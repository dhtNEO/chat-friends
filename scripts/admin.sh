#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
username=${1:-admin}
[[ "$username" =~ ^[a-z0-9][a-z0-9_.-]{2,31}$ ]] || { echo 'Usuário inválido' >&2; exit 1; }
mkdir -p infra/compose/generated
secret=$(mktemp "$PWD/infra/compose/generated/admin.XXXXXX")
trap 'rm -f "$secret"' EXIT
chmod 600 "$secret"
read -r -s -p 'Senha inicial (mínimo 12 caracteres): ' password
printf '
'
printf '%s' "$password" > "$secret"
unset password
# Comando efêmero com o UID do proprietário para ler o arquivo 0600.
./scripts/compose.sh run --rm --no-deps --user "$(id -u):$(id -g)" -v "$secret:/run/admin-password:ro" -e ADMIN_PASSWORD_FILE=/run/admin-password backend --server.port=0 --bootstrap-admin="$username"
