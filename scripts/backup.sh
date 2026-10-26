#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
umask 077
mkdir -p backups
file="backups/friends-$(date -u +%Y%m%dT%H%M%SZ).dump"
./scripts/compose.sh exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d friends -Fc' > "$file.partial"
mv "$file.partial" "$file"
# Sem exclusão automática: aplique retenção após verificar cópia externa.
echo "$file"
