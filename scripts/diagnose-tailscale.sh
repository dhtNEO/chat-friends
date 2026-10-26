#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export CHAT_MODE=tailscale
./scripts/compose.sh ps
./scripts/compose.sh exec -T tailscale tailscale status --json | docker run --rm -i node:24.14.0-alpine node -e '
let s="";for await(const chunk of process.stdin)s+=chunk;
const v=JSON.parse(s);let direct=0,relay=0,offline=0;
for(const p of Object.values(v.Peer||{})){if(!p.Online)offline++;else if(p.CurAddr)direct++;else if(p.Relay)relay++;}
console.log(JSON.stringify({state:v.BackendState,peers:{direct,relay,offline}}));
if(v.BackendState!=="Running")process.exit(1);'
./scripts/compose.sh exec -T web wget -Y off -qO- http://127.0.0.1:8080/api/health
