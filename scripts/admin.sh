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
# Root somente neste comando efêmero, para ler arquivo 0600 do proprietário.
./scripts/compose.sh run --rm --no-deps --user 0:0 -v "$secret:/run/admin-password:ro" -e ADMIN_PASSWORD_FILE=/run/admin-password backend --server.port=0 --bootstrap-admin="$username"
