#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
umask 077
file=${1:?Uso: scripts/open-backup.sh arquivo.cfbackup}
[[ -f "$file" ]] || exit 1
mkdir -p backups
work=$(mktemp -d "$PWD/backups/recovery.XXXXXX")
password=$(mktemp "$PWD/backups/.password.XXXXXX")
trap 'rm -f "$password"' EXIT
read -r -s -p 'Frase do backup: ' phrase
printf '\n'
printf '%s' "$phrase" > "$password"
unset phrase
# Only decrypt; never extract untrusted tar entries or overwrite configuration automatically.
docker run --rm --network none --read-only --cap-drop ALL --security-opt no-new-privileges:true --memory 256m --cpus 1 \
 --user "$(id -u):$(id -g)" -v "$PWD/scripts:/scripts:ro" -v "$(cd "$(dirname "$file")" && pwd)/$(basename "$file"):/input.cfbackup:ro" \
 -v "$password:/password:ro" -v "$work:/output" node:24.22.1-alpine node /scripts/backup-crypto.mjs decrypt /input.cfbackup /output/bundle.tar /password
echo "Backup autenticado em $work/bundle.tar. Leia docs/BACKUP_RESTORE.md antes de extrair/restaurar."
