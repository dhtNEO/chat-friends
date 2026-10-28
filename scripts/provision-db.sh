#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
umask 077
./scripts/compose.sh up -d --wait db
# Operator credentials stay in db; runtime.env is read only by this ephemeral generator.
# Keep any database diagnostic private: SQL errors can contain a statement with a password.
log=infra/compose/generated/database-provision.log
if ! docker run --rm --network none --read-only --cap-drop ALL --security-opt no-new-privileges:true \
  --user "$(id -u):$(id -g)" -v "$PWD/scripts:/work/scripts:ro" \
  -v "$PWD/infra/compose/generated/runtime.env:/work/infra/compose/generated/runtime.env:ro" -w /work \
  node:24.22.1-alpine node scripts/database-roles.mjs | \
  ./scripts/compose.sh exec -T db sh -c 'psql -Xq -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d friends' > "$log" 2>&1; then
  echo 'Provisionamento do banco falhou. Diagnóstico privado em generated/database-provision.log.' >&2;exit 1
fi
rm -f "$log"
./scripts/compose.sh run --rm --no-deps migrate
# Migration metadata is deliberately unavailable to the permanent backend.
docker run --rm --network none --read-only --cap-drop ALL --security-opt no-new-privileges:true \
  --user "$(id -u):$(id -g)" -v "$PWD/scripts:/work/scripts:ro" \
  -v "$PWD/infra/compose/generated/runtime.env:/work/infra/compose/generated/runtime.env:ro" -w /work \
  node:24.22.1-alpine node scripts/database-roles.mjs --finalize | \
  ./scripts/compose.sh exec -T db sh -c 'psql -Xq -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d friends'
