#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
[[ "$(uname -s)" == Darwin ]] || { echo 'LaunchAgent requer macOS.' >&2; exit 1; }
label=org.chatfriends.duckdns
file="$HOME/Library/LaunchAgents/$label.plist"
if [[ "${1:-install}" == remove ]]; then
  launchctl bootout "gui/$(id -u)/$label" 2>/dev/null || true
  rm -f "$file"
  echo 'Agendamento removido; dados e token preservados.'
  exit 0
fi
[[ "${1:-install}" == install ]] || { echo 'Uso: install-duckdns-launchagent.sh [install|remove]' >&2; exit 1; }
[[ -f infra/compose/generated/duckdns/applied.json ]] || { echo 'Aplique e teste a stack antes de agendar.' >&2; exit 1; }
./scripts/diagnose-duckdns.sh
docker_path=$(command -v docker)
[[ "$docker_path" == /* ]] || exit 1
umask 077
mkdir -p "$HOME/Library/LaunchAgents"
mkdir -p infra/compose/generated/duckdns-logs
chmod 700 infra/compose/generated/duckdns-logs
touch infra/compose/generated/duckdns-logs/launchagent.log
chmod 600 infra/compose/generated/duckdns-logs/launchagent.log
"$docker_path" run --rm --network none --read-only --cap-drop ALL --security-opt no-new-privileges:true --user "$(id -u):$(id -g)" -v "$PWD:/work:ro" -w /work node:24.22.1-alpine node scripts/duckdns-launchagent.mjs "$PWD" "$docker_path" > "$file.tmp"
plutil -lint "$file.tmp" >/dev/null
launchctl bootout "gui/$(id -u)/$label" 2>/dev/null || true
mv "$file.tmp" "$file"
launchctl bootstrap "gui/$(id -u)" "$file"
echo 'Atualização agendada a cada cinco minutos após login do usuário.'
