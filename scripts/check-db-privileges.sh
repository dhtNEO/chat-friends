#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
docker run --rm --network none --read-only --cap-drop ALL --security-opt no-new-privileges:true --user "$(id -u):$(id -g)" \
 -v "$PWD/scripts:/work/scripts:ro" -v "$PWD/infra/compose/generated/runtime.env:/work/infra/compose/generated/runtime.env:ro" -w /work node:24.22.1-alpine node scripts/database-check.mjs | \
 ./scripts/compose.sh exec -T db sh -c 'psql -Xq -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d friends'
echo 'Banco: runtime sem privilégios administrativos/DDL; DML permitido e metadados de migração privados.'
