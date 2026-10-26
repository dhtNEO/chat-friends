#!/usr/bin/env bash
# Lock atômico no daemon Docker; não depende de flock/Python no macOS.
umask 077
duck_dir=infra/compose/generated/duckdns
duck_docker=${DUCKDNS_DOCKER_BIN:-docker}
mkdir -p "$duck_dir"
chmod 700 "$duck_dir"
duck_operation=chat-friends-duckdns-operation
duck_signature() { ps -p "$1" -o lstart= 2>/dev/null | cksum | awk '{print $1}'; }
duck_remove_operation() {
  local row id owner
  row=$("$duck_docker" inspect --format '{{.Id}} {{index .Config.Labels "chatfriends.duckdns.lock"}}' "$duck_operation" 2>/dev/null || true)
  read -r id owner <<< "$row"
  if [[ -n "$id" && "$owner" == "$1" ]]; then "$duck_docker" rm -f "$id" >/dev/null 2>&1 || true; fi
}
duck_node() {
  local network=${DUCKDNS_NETWORK:-bridge}
  "$duck_docker" run --rm -i --name "$duck_operation" --label "chatfriends.duckdns.lock=$duck_lock_id" --network "$network" \
    -e NO_PROXY=localhost,127.0.0.1,backend,db,livekit,web,edge -e no_proxy=localhost,127.0.0.1,backend,db,livekit,web,edge \
    --user "$(id -u):$(id -g)" -v "$PWD:/work" -v "$PWD/$duck_dir/token:/work/$duck_dir/token:ro" -w /work \
    node:24.14.0-alpine node scripts/duckdns-update.mjs "$@"
}
duck_release() {
  duck_remove_operation "$duck_lock_id"
  "$duck_docker" rm -f "$duck_lock_id" >/dev/null 2>&1 || true
}
duck_lock() {
  local row id owner signature directory current
  row=$("$duck_docker" inspect --format '{{.Id}} {{index .Config.Labels "chatfriends.duckdns.pid"}} {{index .Config.Labels "chatfriends.duckdns.start"}} {{index .Config.Labels "chatfriends.duckdns.root"}}' chat-friends-duckdns-lock 2>/dev/null || true)
  if [[ -n "$row" ]]; then
    read -r id owner signature directory <<< "$row"
    [[ "$directory" == "$(printf '%s' "$PWD" | cksum | awk '{print $1}')" ]] || { echo 'Lock pertence a outro checkout; não será removido.' >&2; return 1; }
    current=$(duck_signature "${owner:-0}" || true)
    if kill -0 "${owner:-0}" 2>/dev/null && [[ "$current" == "$signature" ]]; then echo 'Atualização DuckDNS já em andamento.' >&2; return 1; fi
    duck_remove_operation "$id"
    "$duck_docker" rm -f "$id" >/dev/null 2>&1 || true
  fi
  # Docker garante exclusividade do nome mesmo se duas execuções chegarem aqui juntas.
  duck_lock_id=$("$duck_docker" create --name chat-friends-duckdns-lock \
    --label "chatfriends.duckdns.pid=$$" --label "chatfriends.duckdns.start=$(duck_signature $$)" \
    --label "chatfriends.duckdns.root=$(printf '%s' "$PWD" | cksum | awk '{print $1}')" \
    node:24.14.0-alpine true) || return 1
  trap duck_release EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM
}
