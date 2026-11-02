#!/bin/sh
set -eu
# Runtime environment only: never store token in Compose environment or image.
DUCKDNS_API_TOKEN=$(cat /run/secrets/duckdns_token)
if ! printf '%s' "$DUCKDNS_API_TOKEN" | grep -Eq '^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$'; then
  echo 'DuckDNS token must be a UUID in the mounted private file.' >&2
  exit 1
fi
export DUCKDNS_API_TOKEN
exec "$@"
