#!/bin/sh
set -eu

# The only non-internal network is media_net, which owns the default route and
# receives Docker's published media ports. Never depend on its ethN name.
# Advertising the same node_ip for every NIC lets ICE deduplicate candidates
# onto a control/signaling NIC, where incoming UDP cannot reach the agent.
if [ "$#" -eq 2 ] && [ "$1" = --config ]; then
  interface=$(awk '$2 == "00000000" && $3 != "00000000" {print $1; exit}' /proc/net/route)
  case "$interface" in
    ''|*[!a-zA-Z0-9_.-]*) echo 'Interface IPv4 de mídia indisponível' >&2; exit 1 ;;
  esac
  umask 077
  config=$(mktemp /tmp/chat-livekit.XXXXXX)
  # Keep the mounted operator configuration immutable and never log its keys.
  awk -v interface="$interface" '
    /^rtc:$/ {
      print
      print "  interfaces:"
      print "    includes: [\"" interface "\"]"
      found++
      next
    }
    {print}
    END {if (found != 1) exit 1}
  ' "$2" > "$config"
  exec /livekit-server --config "$config"
fi
exec /livekit-server "$@"
