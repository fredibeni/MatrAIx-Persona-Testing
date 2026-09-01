#!/bin/zsh
set -euo pipefail
umask 077

root_dir="$(cd "$(dirname "$0")" && pwd)"
runtime_dir="$root_dir/matraix"
venv_dir="$runtime_dir/.venv"

find_python() {
  local candidate version_ok
  for candidate in python3.13 python3.12 python3.11 python3; do
    if ! command -v "$candidate" >/dev/null 2>&1; then
      continue
    fi
    version_ok="$("$candidate" -c 'import sys; print(int(sys.version_info >= (3, 11)))')"
    if [[ "$version_ok" == "1" ]]; then
      command -v "$candidate"
      return 0
    fi
  done
  return 1
}

if [[ ! -f "$root_dir/matraix/personal-persona/survey/assets/validation.js" || \
      ! -f "$root_dir/matraix/personal-persona/survey/assets/validation.css" ]]; then
  echo "The bundled app assets are missing. Restore this checkout from GitHub." >&2
  exit 1
fi

if [[ ! -x "$venv_dir/bin/python" ]]; then
  python_bin="$(find_python || true)"
  if [[ -z "$python_bin" ]]; then
    echo "Python 3.11 or newer is required." >&2
    echo "On macOS with Homebrew, run: brew install python@3.12" >&2
    exit 1
  fi
  "$python_bin" -m venv "$venv_dir"
fi

"$venv_dir/bin/python" -m pip install \
  --disable-pip-version-check \
  --no-cache-dir \
  -r "$runtime_dir/requirements.txt"

echo "MatrAIx is installed."
if [[ -f "$runtime_dir/personal-persona/persona.yaml" ]]; then
  "$root_dir/build-persona.sh" validate --persona "$runtime_dir/personal-persona/persona.yaml" >/dev/null
  echo "Persona: valid"
else
  echo "Persona: not built yet - follow BOOTSTRAP.md"
fi
echo "Start the app by double-clicking Start MatrAIx.command."
