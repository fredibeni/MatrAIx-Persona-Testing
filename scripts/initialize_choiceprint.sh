#!/bin/zsh
set -euo pipefail
umask 077

# Complete the private Choiceprint portion of first-run setup. This script is
# deliberately conservative: it never passes --force, never edits consent, and
# treats an existing valid pack as authoritative.

root_dir="$(cd -- "$(dirname -- "$0")/.." && pwd -P)"
choiceprint_cli="$root_dir/choiceprint.sh"
persona_path="$root_dir/matraix/personal-persona/persona.yaml"
curation_path="$root_dir/matraix/personal-persona/source-material/choiceprint-curation.yaml"

fail() {
  print -u2 -- "Choiceprint setup: $*"
  exit 1
}

[[ -f "$choiceprint_cli" && ! -L "$choiceprint_cli" ]] || \
  fail "the bundled owner CLI is missing or unsafe: $choiceprint_cli"
[[ -f "$persona_path" && ! -L "$persona_path" ]] || \
  fail "onboarding did not produce a safe active persona; rerun ./onboard.sh"

if [[ -L "$curation_path" ]]; then
  fail "refusing the symlinked private curation path: $curation_path"
elif [[ -e "$curation_path" && ! -f "$curation_path" ]]; then
  fail "refusing the non-file private curation path: $curation_path"
elif [[ -f "$curation_path" ]]; then
  print -- "Choiceprint setup: preserving existing private curation: $curation_path"
else
  if ! /bin/zsh "$choiceprint_cli" init; then
    fail "curation initialization failed; no existing private data was replaced"
  fi
  [[ -f "$curation_path" && ! -L "$curation_path" ]] || \
    fail "curation initialization reported success without creating a safe file"
fi

validation_log="$(mktemp "${TMPDIR:-/tmp}/choiceprint-validation.XXXXXX")" || \
  fail "could not create a private validation log"
build_log="$(mktemp "${TMPDIR:-/tmp}/choiceprint-build.XXXXXX")" || {
  rm -f -- "$validation_log"
  fail "could not create a private build log"
}
cleanup_logs() {
  local exit_code=$?
  rm -f -- "$validation_log" "$build_log"
  return $exit_code
}
trap cleanup_logs EXIT HUP INT TERM

if /bin/zsh "$choiceprint_cli" validate >"$validation_log" 2>&1; then
  cat -- "$validation_log"
  print -- "Choiceprint setup: preserving the existing validated canonical pack"
  exit 0
fi

print -- "Choiceprint setup: creating the first canonical pack"
if ! /bin/zsh "$choiceprint_cli" build --no-curation >"$build_log" 2>&1; then
  cat -- "$validation_log" >&2
  cat -- "$build_log" >&2
  fail "automatic build stopped without replacing private data. Inspect the messages above, then run ./choiceprint.sh validate and ./choiceprint.sh build manually. Do not use --force until you have reviewed and backed up any existing pack."
fi
cat -- "$build_log"

if ! /bin/zsh "$choiceprint_cli" validate; then
  fail "the newly created canonical pack did not validate. It was left in place for inspection and was not replaced."
fi

print -- "Choiceprint setup: private curation and canonical pack are ready"
