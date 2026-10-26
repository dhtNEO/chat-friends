#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
./scripts/compose.sh ps
./scripts/compose.sh exec -T db sh -c 'pg_isready -U "$POSTGRES_USER" -d friends'
./scripts/compose.sh exec -T web wget -Y off -qO- http://127.0.0.1:8080/api/health
printf '
'
docker stats --no-stream --format 'table {{.Name}}	{{.CPUPerc}}	{{.MemUsage}}	{{.NetIO}}' $(./scripts/compose.sh ps -q)
# Não executa `compose config` sem -q, pois isso pode revelar segredos.
