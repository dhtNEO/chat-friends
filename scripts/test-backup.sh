#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
file=$(./scripts/backup.sh)
# Nome exclusivo; não substitui nenhum banco existente.
database="restore_check_$(date +%s)_$RANDOM"
./scripts/compose.sh exec -T db sh -c 'createdb -U "$POSTGRES_USER" "$1"' sh "$database"
cleanup() { ./scripts/compose.sh exec -T db sh -c 'dropdb -U "$POSTGRES_USER" "$1"' sh "$database"; }
trap cleanup EXIT
./scripts/compose.sh exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$1" --exit-on-error --single-transaction' sh "$database" < "$file"
source_count=$(./scripts/compose.sh exec -T db sh -c 'psql -U "$POSTGRES_USER" -d friends -tAc "SELECT count(*) FROM messages"')
restored_count=$(./scripts/compose.sh exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$1" -tAc "SELECT count(*) FROM messages"' sh "$database")
[[ "$source_count" == "$restored_count" ]]
echo "Restauração isolada validada: $restored_count mensagens. Execute sem novas escritas durante comparação."
