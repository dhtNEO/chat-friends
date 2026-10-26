#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
file=${1:?Uso: scripts/restore.sh arquivo.dump}
[[ -f "$file" ]] || exit 1
[[ "${CONFIRM_RESTORE:-}" == REPLACE_DATABASE ]] || { echo 'Pare as escritas e defina CONFIRM_RESTORE=REPLACE_DATABASE. Leia docs/BACKUP_RESTORE.md.' >&2; exit 1; }
./scripts/compose.sh stop web backend livekit
./scripts/compose.sh exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d friends --clean --if-exists --single-transaction --exit-on-error' < "$file"
./scripts/compose.sh exec -T db sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d friends' <<'SQL'
DELETE FROM spring_session;
DELETE FROM media_connections;
UPDATE screen_lease SET identity=NULL,lease_id=NULL,expires_at=NULL;
SQL
./scripts/compose.sh up -d --wait
