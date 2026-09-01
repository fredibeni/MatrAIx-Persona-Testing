#!/bin/zsh
set -euo pipefail
umask 077

root_dir="$(cd "$(dirname "$0")" && pwd)"
venv_python="$root_dir/matraix/.venv/bin/python"

if [[ ! -x "$venv_python" ]]; then
  "$root_dir/install.sh"
fi

export PYTHONDONTWRITEBYTECODE=1
export PYTHONPATH="$root_dir/matraix:$root_dir/matraix/src:$root_dir/matraix/environment/agents${PYTHONPATH:+:$PYTHONPATH}"
exec "$venv_python" -m matraix.persona_builder "$@"
