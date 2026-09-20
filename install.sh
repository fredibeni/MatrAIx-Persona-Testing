#!/bin/zsh
set -euo pipefail
umask 077

root_dir="$(cd "$(dirname "$0")" && pwd)"
runtime_dir="$root_dir/matraix"
venv_dir="$runtime_dir/.venv"
install_complete_marker="$venv_dir/.matraix-install-complete"

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

choiceprint_files=(
  "$root_dir/choiceprint.sh"
  "$root_dir/scripts/initialize_choiceprint.sh"
  "$root_dir/digital-twin/scripts/build_choiceprint.py"
  "$root_dir/digital-twin/scripts/validate_twin_pack.py"
  "$root_dir/digital-twin/scripts/check_choiceprint_pack_upgrade.py"
  "$root_dir/digital-twin/scripts/review_choiceprint_claims.py"
  "$root_dir/digital-twin/scripts/review_choiceprint_coverage.py"
  "$root_dir/digital-twin/scripts/review_choiceprint_holdout.py"
  "$root_dir/digital-twin/scripts/collect_choiceprint_answers.py"
  "$root_dir/digital-twin/scripts/collect_choiceprint_interview.py"
  "$root_dir/digital-twin/scripts/prepare_choiceprint_consent.py"
  "$root_dir/digital-twin/scripts/verify_choiceprint_upload.py"
  "$root_dir/digital-twin/scripts/retrieve_choiceprint_context.py"
  "$root_dir/digital-twin/scripts/serve_choiceprint_mcp.py"
  "$root_dir/digital-twin/requirements-mcp.txt"
  "$root_dir/digital-twin/interview/decision-interview.v1.json"
  "$root_dir/digital-twin/templates/curation.example.yaml"
  "$root_dir/digital-twin/templates/chatgpt-upload-readme.md"
)
for required_file in "${choiceprint_files[@]}"; do
  if [[ ! -f "$required_file" || -L "$required_file" ]]; then
    echo "A bundled Choiceprint file is missing or unsafe: $required_file" >&2
    echo "Restore this checkout from GitHub, then run ./install.sh again." >&2
    exit 1
  fi
done

if [[ ! -x "$venv_dir/bin/python" ]]; then
  python_bin="$(find_python || true)"
  if [[ -z "$python_bin" ]]; then
    echo "Python 3.11 or newer is required." >&2
    echo "On macOS with Homebrew, run: brew install python@3.12" >&2
    exit 1
  fi
  "$python_bin" -m venv "$venv_dir"
fi

rm -f -- "$install_complete_marker"
"$venv_dir/bin/python" -m pip install \
  --disable-pip-version-check \
  --no-cache-dir \
  -r "$runtime_dir/requirements.txt"

echo "MatrAIx runtime: installed"
"$root_dir/onboard.sh"
"/bin/zsh" "$root_dir/scripts/initialize_choiceprint.sh"
touch "$install_complete_marker"
chmod 600 "$install_complete_marker"
echo "MatrAIx installation, onboarding, and Choiceprint initialization: complete"
echo "Start the app by double-clicking Start MatrAIx.command."
