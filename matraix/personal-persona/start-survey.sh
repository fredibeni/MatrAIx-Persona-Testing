#!/bin/zsh
set -euo pipefail
umask 077
export PYTHONDONTWRITEBYTECODE=1

project_dir="$(cd "$(dirname "$0")" && pwd)"
matraix_dir="$(cd "$project_dir/.." && pwd)"
python_bin="$matraix_dir/.venv/bin/python"

if [[ ! -x "$python_bin" ]]; then
  echo "MatrAIx Python environment not found: $python_bin" >&2
  echo "Run ./install.sh from the MatrAIx folder." >&2
  exit 1
fi

export PYTHONPATH="$matraix_dir:$matraix_dir/src:$matraix_dir/environment/agents${PYTHONPATH:+:$PYTHONPATH}"

exec "$python_bin" "$project_dir/survey/server.py" "$@"
