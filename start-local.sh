#!/bin/zsh
set -euo pipefail
umask 077

root_dir="$(cd "$(dirname "$0")" && pwd)"
persona_path="$root_dir/matraix/personal-persona/persona.yaml"
persona_template="$root_dir/matraix/personal-persona/persona.example.yaml"

if [[ ! -x "$root_dir/matraix/.venv/bin/python" ]]; then
  "$root_dir/install.sh"
fi
if [[ ! -e "$persona_path" && ! -L "$persona_path" ]]; then
  cp "$persona_template" "$persona_path"
  chmod 600 "$persona_path"
fi
"$root_dir/build-persona.sh" migrate \
  --persona "$persona_path" \
  --dry-run >/dev/null
if command -v lsof >/dev/null 2>&1; then
  if lsof -nP -iTCP:8766 -sTCP:LISTEN >/dev/null 2>&1; then
    echo "Local port 8766 is already in use. Stop that process and try again." >&2
    exit 1
  fi
fi

exec "$root_dir/matraix/personal-persona/start-survey.sh" "$@"
