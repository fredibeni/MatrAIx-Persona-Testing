#!/bin/zsh
set -euo pipefail
umask 077

root_dir="$(cd "$(dirname "$0")" && pwd)"

if [[ ! -x "$root_dir/matraix/.venv/bin/python" ]]; then
  "$root_dir/install.sh"
fi
if [[ ! -f "$root_dir/matraix/personal-persona/persona.yaml" ]]; then
  echo "No active persona found. Follow BOOTSTRAP.md to build one first." >&2
  exit 1
fi
"$root_dir/build-persona.sh" validate >/dev/null
if command -v lsof >/dev/null 2>&1; then
  if lsof -nP -iTCP:8766 -sTCP:LISTEN >/dev/null 2>&1; then
    echo "Local port 8766 is already in use. Stop that process and try again." >&2
    exit 1
  fi
fi

exec "$root_dir/matraix/personal-persona/start-survey.sh" "$@"
