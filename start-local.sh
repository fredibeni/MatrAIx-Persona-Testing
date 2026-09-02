#!/bin/zsh
set -euo pipefail
umask 077

root_dir="$(cd "$(dirname "$0")" && pwd)"
venv_dir="$root_dir/matraix/.venv"
install_complete_marker="$venv_dir/.matraix-install-complete"
persona_path="$root_dir/matraix/personal-persona/persona.yaml"

if [[ ! -x "$venv_dir/bin/python" || ! -f "$install_complete_marker" ]]; then
  "$root_dir/install.sh"
elif [[ ! -f "$persona_path" || -L "$persona_path" ]]; then
  "$root_dir/onboard.sh"
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
