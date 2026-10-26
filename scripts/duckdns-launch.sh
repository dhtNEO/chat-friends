#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
umask 077
log=infra/compose/generated/duckdns/launchagent.log
mkdir -p "$(dirname "$log")"
if [[ -f "$log" && $(wc -c < "$log") -ge 1048576 ]]; then
 rm -f "$log.3"
 for n in 2 1; do [[ ! -f "$log.$n" ]] || mv "$log.$n" "$log.$((n+1))"; done
 mv "$log" "$log.1"
fi
exec ./scripts/duckdns-update.sh >> "$log" 2>&1
