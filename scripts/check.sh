#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
./scripts/configure.sh local
./scripts/compose.sh config -q
./scripts/compose.sh up -d --wait db livekit
network=chat-friends_default
# Banco de teste separado: nenhum teste apaga dados do aplicativo.
./scripts/compose.sh exec -T db sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres' <<'SQL'
SELECT 'CREATE DATABASE friends_test' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname='friends_test')\gexec
SQL
docker run --rm --network "$network" --env-file .env -e DATABASE_URL=jdbc:postgresql://db:5432/friends_test -v "$PWD/backend:/src" -v friends-maven:/root/.m2 -w /src maven:3.9.11-eclipse-temurin-25 ./mvnw -B -ntp verify
docker run --rm -v "$PWD/frontend:/src" -w /src node:24.14.0-alpine sh -c 'npm ci && npm run lint && npm run build'
