#!/bin/zsh
set -euo pipefail
umask 077

root_dir="$(cd "$(dirname "$0")" && pwd)"
venv_python="$root_dir/matraix/.venv/bin/python"

if [[ ! -x "$venv_python" ]]; then
  echo "MatrAIx is not installed yet. Run ./install.sh first." >&2
  exit 1
fi

export PYTHONDONTWRITEBYTECODE=1
export PYTHONPATH="$root_dir/matraix:$root_dir/matraix/src:$root_dir/matraix/environment/agents${PYTHONPATH:+:$PYTHONPATH}"
exec "$venv_python" -m matraix.onboarding "$@"
