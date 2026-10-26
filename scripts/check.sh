#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/modes.sh
mode=$(chat_mode "${CHAT_MODE-dev}")
saved=$(chat_saved_mode)
if [[ "$mode" != dev || ( -n "$saved" && "$saved" != dev ) ]]; then
  echo 'check.sh exige stack dev separada; não altera configuração prd.' >&2
  exit 1
fi
./scripts/configure.sh dev
./scripts/compose.sh config -q
./scripts/compose.sh up -d --wait db livekit
network=chat-friends_database_net
# Test credentials never receive the application's DBA/runtime passwords.
umask 077
node_args=(run --rm --network none --read-only --cap-drop ALL --user "$(id -u):$(id -g)" -v "$PWD/scripts:/work/scripts:ro" -v "$PWD/infra/compose/generated/runtime.env:/work/infra/compose/generated/runtime.env:ro" -w /work node:24.22.1-alpine node scripts/database-test.mjs)
if ! docker "${node_args[@]}" | ./scripts/compose.sh exec -T db sh -c 'psql -Xq -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres' > infra/compose/generated/test-provision.log 2>&1; then
 echo 'Falha ao provisionar banco de testes; diagnóstico privado em generated/test-provision.log.' >&2;exit 1
fi
rm -f infra/compose/generated/test-provision.log
docker "${node_args[@]}" --env > infra/compose/generated/test.env
docker run --rm --network "$network" --network chat-friends_ingress_net --env-file infra/compose/generated/test.env -v "$PWD/backend:/src" -v friends-maven:/root/.m2 -w /src maven:3.9.11-eclipse-temurin-25 ./mvnw -B -ntp verify
docker run --rm -v "$PWD/frontend:/src" -w /src node:24.22.1-alpine sh -c 'npm ci && npm run lint && npm run build'
