#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../backend"

# Retry only the distribution bootstrap. Never repeat verify/tests or accept a
# failed checksum: mvnw keeps the pinned wrapper/distribution validation.
for attempt in 1 2 3; do
  echo "Preparando Maven Wrapper (tentativa $attempt/3)."
  if ./mvnw -B -ntp --version; then
    exit 0
  else
    result=$?
  fi
  if [[ "$attempt" -eq 3 ]]; then
    echo "Falha ao preparar Maven Wrapper após 3 tentativas." >&2
    exit "$result"
  fi
  delay=$((attempt * 2))
  echo "Bootstrap falhou (código $result); nova tentativa em ${delay}s." >&2
  sleep "$delay"
done
