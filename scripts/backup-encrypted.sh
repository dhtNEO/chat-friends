#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
umask 077
mkdir -p backups
work=$(mktemp -d "$PWD/backups/.bundle.XXXXXX")
trap 'rm -rf "$work"' EXIT
read -r -s -p 'Frase de backup (mínimo 16 caracteres, guarde fora do Mac): ' phrase
printf '\n'
read -r -s -p 'Repita a frase: ' repeat
printf '\n'
[[ "$phrase" == "$repeat" && ${#phrase} -ge 16 ]] || { echo 'Frases diferentes ou curtas.' >&2;exit 1; }
printf '%s' "$phrase" > "$work/password"
unset phrase repeat
./scripts/compose.sh exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d friends -Fc' > "$work/database.dump"
mkdir "$work/config"
cp .env "$work/config/env"
cp infra/compose/generated/runtime.env "$work/config/runtime.env"
for dir in network duckdns turn-certs; do
 if [[ -d infra/compose/generated/$dir ]]; then cp -R "infra/compose/generated/$dir" "$work/config/$dir"; fi
done
if [[ -n "$(./scripts/compose.sh ps -q edge 2>/dev/null || true)" ]]; then
 ./scripts/compose.sh exec -T edge tar -cf - -C /data . > "$work/config/certificates.tar"
fi
git rev-parse HEAD > "$work/config/commit"
tar -cf "$work/bundle.tar" -C "$work" database.dump config
file="backups/friends-$(date -u +%Y%m%dT%H%M%SZ)-$RANDOM.cfbackup"
docker run --rm --network none --read-only --cap-drop ALL --security-opt no-new-privileges:true --memory 256m --cpus 1 \
 --user "$(id -u):$(id -g)" -v "$PWD/scripts:/scripts:ro" -v "$work:/input:ro" -v "$PWD/backups:/output" \
 node:24.22.1-alpine node /scripts/backup-crypto.mjs encrypt /input/bundle.tar "/output/$(basename "$file")" /input/password
echo "$file"
