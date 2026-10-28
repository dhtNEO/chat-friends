#!/usr/bin/env bash
# Somente dev/prd são aceitos como entrada. Migração dos marcadores persistidos é interna.
chat_mode() {
  case "$1" in
    dev|prd) printf '%s\n' "$1" ;;
    *) echo 'CHAT_MODE inválido: use dev ou prd.' >&2; return 1 ;;
  esac
}
chat_saved_mode() {
  local file=infra/compose/generated/mode
  [[ -f "$file" ]] || file=infra/compose/generated/network/mode
  [[ -f "$file" ]] || return 0
  case "$(cat "$file")" in
    dev|local) printf 'dev\n' ;;
    prd|internet) printf 'prd\n' ;;
    *) echo 'Marcador de modo não suportado; restaure a configuração dev ou prd em manutenção.' >&2; return 1 ;;
  esac
}
