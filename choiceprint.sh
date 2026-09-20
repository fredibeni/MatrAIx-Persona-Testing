#!/bin/zsh
set -euo pipefail

# Owner-facing commands for the private Choiceprint workflow. All generated
# owner data is private by default, and consent requires explicit owner review.
umask 077

root_dir="$(cd -- "$(dirname -- "$0")" && pwd -P)"
python_bin="$root_dir/matraix/.venv/bin/python"
persona_root="$root_dir/matraix/personal-persona"
active_persona="$persona_root/persona.yaml"
registry_path="$persona_root/survey/data/persona-registry.json"
validation_surveys_default="$persona_root/survey/validation-surveys.json"
private_source_root="$persona_root/source-material"
curation_default="$private_source_root/choiceprint-curation.yaml"
curation_template="$root_dir/digital-twin/templates/curation.example.yaml"
private_pack_root="$persona_root/digital-twin"
builder="$root_dir/digital-twin/scripts/build_choiceprint.py"
validator="$root_dir/digital-twin/scripts/validate_twin_pack.py"
pack_upgrade_checker="$root_dir/digital-twin/scripts/check_choiceprint_pack_upgrade.py"
claim_reviewer="$root_dir/digital-twin/scripts/review_choiceprint_claims.py"
coverage_reviewer="$root_dir/digital-twin/scripts/review_choiceprint_coverage.py"
holdout_reviewer="$root_dir/digital-twin/scripts/review_choiceprint_holdout.py"
answer_collector="$root_dir/digital-twin/scripts/collect_choiceprint_answers.py"
interview_collector="$root_dir/digital-twin/scripts/collect_choiceprint_interview.py"
interview_bank="$root_dir/digital-twin/interview/decision-interview.v1.json"
consent_preparer="$root_dir/digital-twin/scripts/prepare_choiceprint_consent.py"
upload_verifier="$root_dir/digital-twin/scripts/verify_choiceprint_upload.py"
context_retriever="$root_dir/digital-twin/scripts/retrieve_choiceprint_context.py"
mcp_server="$root_dir/digital-twin/scripts/serve_choiceprint_mcp.py"
mcp_requirements="$root_dir/digital-twin/requirements-mcp.txt"
upload_readme_template="$root_dir/digital-twin/templates/chatgpt-upload-readme.md"
claim_review_root="$private_source_root/claim-reviews"

usage() {
  cat <<'EOF'
Usage: ./choiceprint.sh <command> [options]

Commands:
  doctor    Check the local Choiceprint runtime and private owner paths.
  init      Create the private curation file without granting consent.
  build     Build a canonical Choiceprint Twin Pack.
  validate  Validate an existing canonical Twin Pack.
  pack-upgrade check  Diagnose a current or supported legacy owner pack.
  review-prepare  Create a private, pack-bound owner claim worksheet.
  review-claims   Review pending claims locally in resumable batches.
  review-apply    Apply a completed worksheet to a new curation file.
  coverage-review Prepare or complete a private domain coverage review.
  coverage-apply  Apply an owner-completed review to a new Twin Pack.
  coverage-revoke Prepare an explicit domain revocation review.
  holdout-review  Complete a private semantic-overlap review interactively.
  collect-interview  Collect private candidate decision evidence locally.
  collect-retest  Collect a blinded, family-balanced private retest.
  prepare-chatgpt  Authorize, build, package, and verify a new ChatGPT release.
  package   Create a private, adapter-only ChatGPT upload directory.
  verify-package  Verify an upload directory against its canonical pack.
  get-context  Retrieve bounded, read-only scenario context from a canonical pack.
  serve-mcp  Serve one private pack through a read-only local MCP stdio process.

Run ./choiceprint.sh <command> --help for command-specific options.
EOF
}

die() {
  print -u2 -- "Choiceprint: $*"
  exit 1
}

note() {
  print -- "Choiceprint: $*"
}

require_python() {
  [[ -x "$python_bin" ]] || \
    die "the installed Python runtime is missing; run ./install.sh first"
}

require_no_symlink_chain() {
  local label="$1"
  local path="$2"
  PYTHONDONTWRITEBYTECODE=1 "$python_bin" -c '
import os
import pathlib
import sys

path = pathlib.Path(os.path.abspath(sys.argv[1]))
current = pathlib.Path(path.anchor)
for part in path.parts[1:]:
    current = current / part
    if not os.path.lexists(current):
        break
    if current.is_symlink():
        raise SystemExit(1)
' "$path" || die "$label must not contain a symlink in its path: $path"
}

require_regular_file() {
  local label="$1"
  local path="$2"
  require_no_symlink_chain "$label" "$path"
  [[ -f "$path" && ! -L "$path" ]] || \
    die "$label must be a regular, non-symlink file: $path"
}

require_regular_directory() {
  local label="$1"
  local path="$2"
  require_no_symlink_chain "$label" "$path"
  [[ -d "$path" && ! -L "$path" ]] || \
    die "$label must be a regular, non-symlink directory: $path"
}

require_private_mode() {
  local label="$1"
  local path="$2"
  local wanted="$3"
  local actual
  actual="$(PYTHONDONTWRITEBYTECODE=1 "$python_bin" -c \
    'import os, stat, sys; print(format(stat.S_IMODE(os.lstat(sys.argv[1]).st_mode), "03o"))' \
    "$path")" || die "could not inspect permissions for $label: $path"
  [[ "$actual" == "$wanted" ]] || \
    die "$label must have mode $wanted, not $actual: $path"
}

persona_id_for() {
  local persona="$1"
  PYTHONDONTWRITEBYTECODE=1 "$python_bin" -c '
import re
import sys
import yaml

path = sys.argv[1]
with open(path, "r", encoding="utf-8") as handle:
    value = yaml.safe_load(handle)
if not isinstance(value, dict):
    raise SystemExit("active persona must contain a YAML mapping")
raw = str(value.get("persona_id") or value.get("display_name") or "person")
slug = re.sub(r"[^a-z0-9]+", "-", raw.casefold()).strip("-")[:48]
print(slug or "person")
' "$persona"
}

find_active_validation_results() {
  [[ -f "$registry_path" && ! -L "$registry_path" ]] || return 1
  [[ -f "$active_persona" && ! -L "$active_persona" ]] || return 1

  local result
  result="$(PYTHONDONTWRITEBYTECODE=1 "$python_bin" -c '
import hashlib
import json
import os
import re
import sys
import yaml

def reject_constant(value):
    raise ValueError(f"non-finite JSON constant: {value}")


def unique_object(pairs):
    value = {}
    for key, item in pairs:
        if key in value:
            raise ValueError(f"duplicate JSON key: {key}")
        value[key] = item
    return value


def load_json(path):
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(
            handle,
            object_pairs_hook=unique_object,
            parse_constant=reject_constant,
        )


def unsafe():
    raise SystemExit(2)


try:
    persona_path, registry_path, store_path = sys.argv[1:]
    registry = load_json(registry_path)
    if not isinstance(registry, dict) or not isinstance(registry.get("contexts"), dict):
        unsafe()
    context_id = registry.get("active_context_id")
    if not isinstance(context_id, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]*", context_id):
        unsafe()
    if context_id in {".", ".."}:
        unsafe()
    entry = registry["contexts"].get(context_id)
    if not isinstance(entry, dict):
        unsafe()
    with open(persona_path, "rb") as handle:
        persona_bytes = handle.read()
    persona_hash = hashlib.sha256(persona_bytes).hexdigest()
    if entry.get("output_sha256") != persona_hash:
        unsafe()
    persona = yaml.safe_load(persona_bytes)
    persona_id = persona.get("persona_id") if isinstance(persona, dict) else None
    display_name = persona.get("display_name") if isinstance(persona, dict) else None
    dimensions = persona.get("dimensions") if isinstance(persona, dict) else None
    if not isinstance(persona_id, str) or entry.get("persona_id") != persona_id:
        unsafe()
    if isinstance(display_name, str) and entry.get("display_name") != display_name:
        unsafe()
    if not isinstance(dimensions, dict):
        unsafe()
    store = os.path.realpath(store_path)
    context_directory = os.path.join(store_path, context_id)
    if os.path.islink(context_directory) or not os.path.isdir(context_directory):
        unsafe()
    real_context = os.path.realpath(context_directory)
    if os.path.commonpath([store, real_context]) != store:
        unsafe()
    baseline_path = os.path.join(context_directory, "baseline.yaml")
    if os.path.islink(baseline_path) or not os.path.isfile(baseline_path):
        unsafe()
    with open(baseline_path, "rb") as handle:
        baseline_hash = hashlib.sha256(handle.read()).hexdigest()
    if baseline_hash != entry.get("baseline_sha256"):
        unsafe()
    candidate = os.path.join(context_directory, "validation-results.json")
    if not os.path.lexists(candidate):
        raise SystemExit(1)
    if os.path.islink(candidate) or not os.path.isfile(candidate):
        unsafe()
    real_candidate = os.path.realpath(candidate)
    if os.path.commonpath([store, real_candidate]) != store:
        unsafe()
    results = load_json(real_candidate)
    if not isinstance(results, dict):
        unsafe()
    if results.get("context_id") != context_id:
        unsafe()
    if results.get("persona_id") != persona_id:
        unsafe()
    if results.get("baseline_sha256") != baseline_hash:
        unsafe()
    if results.get("persona_revision") != persona_hash:
        unsafe()
    if results.get("persona_dimension_count") != sum(
        item is not None for item in dimensions.values()
    ):
        unsafe()
    print(real_candidate)
except SystemExit:
    raise
except Exception:
    unsafe()
' "$active_persona" "$registry_path" "$persona_root/survey/data/personas")" || return $?

  [[ -n "$result" && -f "$result" && ! -L "$result" ]] || return 1
  print -- "$result"
}

default_pack_for() {
  local persona="$1"
  local persona_id
  persona_id="$(persona_id_for "$persona")" || return 1
  print -- "$private_pack_root/$persona_id.choiceprint"
}

default_claim_review_for() {
  local persona="$1"
  local persona_id
  persona_id="$(persona_id_for "$persona")" || return 1
  print -- "$claim_review_root/$persona_id.claim-review.yaml"
}

print_doctor_help() {
  cat <<'EOF'
Usage: ./choiceprint.sh doctor

Checks the installed runtime, active persona, safely matched validation results,
private curation file, and current canonical pack. It does not change files.
EOF
}

command_doctor() {
  if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
    print_doctor_help
    return 0
  fi
  (( $# == 0 )) || die "doctor does not accept arguments"

  local failed=0
  local validation_results=""
  local default_pack=""

  if [[ -x "$python_bin" ]]; then
    note "Python runtime: ready"
    if ! PYTHONDONTWRITEBYTECODE=1 "$python_bin" -c \
      'import jsonschema, yaml' >/dev/null 2>&1; then
      print -u2 -- "Choiceprint: Python dependencies: missing"
      failed=1
    else
      note "Python dependencies: ready"
    fi
  else
    print -u2 -- "Choiceprint: Python runtime: missing or unsafe; run ./install.sh"
    failed=1
  fi

  for required_script in \
    "$builder" "$validator" "$pack_upgrade_checker" "$claim_reviewer" \
    "$coverage_reviewer" \
    "$holdout_reviewer" \
    "$answer_collector" "$interview_collector" "$interview_bank" \
    "$consent_preparer" \
    "$upload_verifier" "$context_retriever" "$curation_template" \
    "$upload_readme_template"; do
    if [[ ! -f "$required_script" || -L "$required_script" ]]; then
      print -u2 -- "Choiceprint: required product file: missing or unsafe: $required_script"
      failed=1
    fi
  done

  if [[ -f "$active_persona" && ! -L "$active_persona" ]]; then
    note "Active persona: $active_persona"
    if [[ -x "$python_bin" ]]; then
      if ! require_private_mode "active persona" "$active_persona" 600; then
        failed=1
      fi
      if ! persona_id_for "$active_persona" >/dev/null; then
        print -u2 -- "Choiceprint: active persona YAML could not be read"
        failed=1
      fi
    fi
  else
    print -u2 -- "Choiceprint: active persona: missing or unsafe; run ./onboard.sh"
    failed=1
  fi

  if [[ -x "$python_bin" ]]; then
    local validation_status=0
    validation_results="$(find_active_validation_results)" || validation_status=$?
    if (( validation_status == 2 )); then
      print -u2 -- "Choiceprint: validation results: active context binding is unsafe or stale"
      failed=1
      validation_results=""
    fi
  fi
  if [[ -n "$validation_results" ]]; then
    note "Validation results: $validation_results"
  else
    note "Validation results: no safely matched file; build will omit this optional source"
  fi

  if [[ -f "$curation_default" && ! -L "$curation_default" ]]; then
    note "Private curation: $curation_default"
    if [[ -x "$python_bin" ]]; then
      if ! require_private_mode "private curation" "$curation_default" 600; then
        failed=1
      fi
    fi
  else
    note "Private curation: not initialized; run ./choiceprint.sh init"
  fi

  if [[ -f "$active_persona" && ! -L "$active_persona" && \
        -x "$python_bin" ]]; then
    default_pack="$(default_pack_for "$active_persona" || true)"
  fi
  if [[ -n "$default_pack" && -d "$default_pack" && ! -L "$default_pack" ]]; then
    note "Canonical pack: $default_pack"
    if ! PYTHONDONTWRITEBYTECODE=1 "$python_bin" "$validator" "$default_pack"; then
      failed=1
    fi
  else
    note "Canonical pack: not built"
  fi

  (( failed == 0 )) || return 1
  note "Doctor checks passed"
}

print_init_help() {
  cat <<'EOF'
Usage: ./choiceprint.sh init [--curation PATH]

Copies the tracked curation template to a private owner-only path. The template
keeps consent.owner_authorized false. Existing files are never replaced.
EOF
}

command_init() {
  local curation="$curation_default"
  while (( $# > 0 )); do
    case "$1" in
      --curation)
        (( $# >= 2 )) || die "--curation requires a path"
        curation="$2"
        shift 2
        ;;
      --help|-h)
        print_init_help
        return 0
        ;;
      *) die "unknown init option: $1" ;;
    esac
  done

  require_python
  require_regular_file "curation template" "$curation_template"
  [[ ! -e "$curation" && ! -L "$curation" ]] || \
    die "refusing to replace the existing curation file: $curation"

  local parent="${curation:h}"
  [[ "$parent" != "/" && -n "$parent" ]] || die "unsafe curation destination"
  if [[ "$curation" == "$curation_default" ]]; then
    [[ ! -L "$private_source_root" ]] || \
      die "private source directory must not be a symlink: $private_source_root"
    mkdir -p -m 700 -- "$parent"
  else
    require_regular_directory "curation parent" "$parent"
  fi
  require_regular_directory "curation parent" "$parent"
  chmod 700 "$parent"

  local temporary
  temporary="$(mktemp "$parent/.choiceprint-curation.tmp.XXXXXX")" || \
    die "could not create a private temporary curation file"
  cleanup_init_temporary() {
    local exit_code=$?
    rm -f -- "$temporary"
    return $exit_code
  }
  trap cleanup_init_temporary EXIT HUP INT TERM
  cp -- "$curation_template" "$temporary"
  chmod 600 "$temporary"

  if ! PYTHONDONTWRITEBYTECODE=1 "$python_bin" -c '
import sys
import yaml
with open(sys.argv[1], "r", encoding="utf-8") as handle:
    value = yaml.safe_load(handle)
consent = value.get("consent") if isinstance(value, dict) else None
if not isinstance(consent, dict) or consent.get("owner_authorized") is not False:
    raise SystemExit(1)
' "$temporary"; then
    die "the copied template did not preserve owner_authorized: false"
  fi

  ln "$temporary" "$curation" || \
    die "refusing to replace a curation path created concurrently: $curation"
  rm -f -- "$temporary"
  trap - EXIT HUP INT TERM

  note "Created private curation file: $curation"
  note "No sources or runtime uses were authorized. Review the file before build."
}

print_build_help() {
  cat <<'EOF'
Usage: ./choiceprint.sh build [options]

Options:
  --persona PATH              Active persona YAML (auto-located by default).
  --validation-results PATH   Validation results JSON.
  --validation-surveys PATH   Validation survey definitions JSON.
  --no-validation             Do not include validation data.
  --curation PATH             Reviewed curation YAML or JSON.
  --no-curation               Build without a curation file.
  --output PATH               Canonical .choiceprint directory.
  --force                     Atomically replace a compatible existing pack.
  --help                      Show this help.

The CLI never edits consent. When safe matching is possible, it pairs the active
persona with its own validation results. Existing output is not replaced unless
--force is supplied.
EOF
}

command_build() {
  local persona="$active_persona"
  local validation_results=""
  local validation_surveys=""
  local curation=""
  local output=""
  local validation_mode="auto"
  local curation_mode="auto"
  local force=0

  while (( $# > 0 )); do
    case "$1" in
      --persona)
        (( $# >= 2 )) || die "--persona requires a path"
        persona="$2"
        shift 2
        ;;
      --validation-results)
        (( $# >= 2 )) || die "--validation-results requires a path"
        validation_results="$2"
        validation_mode="explicit"
        shift 2
        ;;
      --validation-surveys)
        (( $# >= 2 )) || die "--validation-surveys requires a path"
        validation_surveys="$2"
        shift 2
        ;;
      --no-validation)
        validation_mode="none"
        validation_results=""
        validation_surveys=""
        shift
        ;;
      --curation)
        (( $# >= 2 )) || die "--curation requires a path"
        curation="$2"
        curation_mode="explicit"
        shift 2
        ;;
      --no-curation)
        curation_mode="none"
        curation=""
        shift
        ;;
      --output)
        (( $# >= 2 )) || die "--output requires a path"
        output="$2"
        shift 2
        ;;
      --force)
        force=1
        shift
        ;;
      --help|-h)
        print_build_help
        return 0
        ;;
      *) die "unknown build option: $1" ;;
    esac
  done

  require_python
  require_regular_file "active persona" "$persona"
  require_regular_file "Choiceprint builder" "$builder"
  require_regular_file "Choiceprint validator" "$validator"
  if [[ "$persona" == "$active_persona" ]]; then
    require_private_mode "active persona" "$persona" 600
  fi

  if [[ "$validation_mode" == "auto" && "$persona" == "$active_persona" ]]; then
    local validation_status=0
    validation_results="$(find_active_validation_results)" || validation_status=$?
    (( validation_status != 2 )) || \
      die "active validation results are stale, mismatched, malformed, or unsafe"
    if [[ -n "$validation_results" ]]; then
      validation_surveys="$validation_surveys_default"
    fi
  elif [[ "$validation_mode" == "auto" ]]; then
    validation_mode="none"
  elif [[ "$validation_mode" == "explicit" && -z "$validation_surveys" ]]; then
    validation_surveys="$validation_surveys_default"
  fi
  if [[ -n "$validation_results" || -n "$validation_surveys" ]]; then
    [[ -n "$validation_results" && -n "$validation_surveys" ]] || \
      die "validation results and survey definitions must be supplied together"
    require_regular_file "validation results" "$validation_results"
    require_regular_file "validation surveys" "$validation_surveys"
  fi

  if [[ "$curation_mode" == "auto" && -f "$curation_default" && ! -L "$curation_default" ]]; then
    curation="$curation_default"
  fi
  if [[ -n "$curation" ]]; then
    require_regular_file "reviewed curation" "$curation"
    if [[ "$curation" == "$curation_default" ]]; then
      require_private_mode "private curation" "$curation" 600
    fi
  fi

  if [[ -z "$output" ]]; then
    output="$(default_pack_for "$persona")" || die "could not derive the default pack path"
  fi
  local output_parent="${output:h}"
  if [[ "$output" == "$private_pack_root/"* || "$output" == "$private_pack_root" ]]; then
    [[ ! -L "$private_pack_root" ]] || \
      die "private pack directory must not be a symlink: $private_pack_root"
    mkdir -p -m 700 -- "$private_pack_root"
  else
    require_regular_directory "output parent" "$output_parent"
  fi
  require_no_symlink_chain "canonical output" "$output"
  if [[ -e "$output" || -L "$output" ]]; then
    (( force == 1 )) || die "output already exists; pass --force to replace it: $output"
  fi

  local -a args
  args=("$builder" --persona "$persona" --output "$output")
  if [[ -n "$validation_results" ]]; then
    args+=(--validation-results "$validation_results")
    args+=(--validation-surveys "$validation_surveys")
  else
    note "Validation source: omitted because no safely matched pair was selected"
  fi
  if [[ -n "$curation" ]]; then
    args+=(--curation "$curation")
    note "Curation source: $curation"
    note "Consent is used exactly as reviewed; this command does not authorize it."
  else
    note "Curation source: omitted; the build cannot generate a ChatGPT adapter"
  fi
  (( force == 0 )) || args+=(--force)

  note "Persona source: $persona"
  [[ -z "$validation_results" ]] || note "Validation source: $validation_results"
  note "Canonical output: $output"
  PYTHONDONTWRITEBYTECODE=1 "$python_bin" "${args[@]}"
  require_regular_directory "built canonical pack" "$output"
  PYTHONDONTWRITEBYTECODE=1 "$python_bin" "$validator" "$output"
  if find "$output" -type l -print -quit | grep -q .; then
    die "built canonical pack contains a symlink"
  fi
  find "$output" -type d -exec chmod 700 {} +
  find "$output" -type f -exec chmod 600 {} +
  require_private_mode "built canonical pack" "$output" 700
  PYTHONDONTWRITEBYTECODE=1 "$python_bin" "$validator" "$output"
}

print_validate_help() {
  cat <<'EOF'
Usage: ./choiceprint.sh validate [--pack PATH]

Validates the current persona's canonical pack by default, or an explicitly
selected pack. The pack directory itself must not be a symlink.
EOF
}

command_validate() {
  local pack=""
  while (( $# > 0 )); do
    case "$1" in
      --pack)
        (( $# >= 2 )) || die "--pack requires a path"
        pack="$2"
        shift 2
        ;;
      --help|-h)
        print_validate_help
        return 0
        ;;
      *) die "unknown validate option: $1" ;;
    esac
  done

  require_python
  require_regular_file "Choiceprint validator" "$validator"
  if [[ -z "$pack" ]]; then
    require_regular_file "active persona" "$active_persona"
    pack="$(default_pack_for "$active_persona")" || \
      die "could not derive the default pack path"
  fi
  require_regular_directory "canonical pack" "$pack"
  PYTHONDONTWRITEBYTECODE=1 "$python_bin" "$validator" "$pack"
}

print_pack_upgrade_help() {
  cat <<'EOF'
Usage: ./choiceprint.sh pack-upgrade check [--pack PATH]

Runs a read-only, sanitized diagnostic against the current persona's canonical
pack by default, or an explicitly selected pack. It reports whether the pack is
current, matches the one supported legacy coverage delta, or is invalid or
unsupported. It never prepares, activates, repairs, or changes a pack.
Descriptor snapshots are compared before and after validation. This is a
stable local diagnostic, not a cryptographic lock against privileged concurrent
filesystem changes.
EOF
}

command_pack_upgrade() {
  local action="${1:-}"
  if [[ -z "$action" || "$action" == "--help" || "$action" == "-h" ]]; then
    print_pack_upgrade_help
    return 0
  fi
  [[ "$action" == "check" ]] || \
    die "pack-upgrade supports only the read-only check action"
  shift

  local pack=""
  while (( $# > 0 )); do
    case "$1" in
      --pack)
        (( $# >= 2 )) || die "--pack requires a path"
        [[ "$2" != --* ]] || die "--pack requires a path"
        [[ -z "$pack" ]] || die "pack-upgrade check accepts --pack only once"
        pack="$2"
        shift 2
        ;;
      --help|-h)
        print_pack_upgrade_help
        return 0
        ;;
      --force|--output|--write|--repair|--apply|--activate|--prepare|--replace|--update)
        die "pack-upgrade check is read-only and does not support mutation options"
        ;;
      *) die "unknown pack-upgrade check option" ;;
    esac
  done

  require_python
  require_regular_file "Choiceprint pack-upgrade checker" "$pack_upgrade_checker"
  if [[ -z "$pack" ]]; then
    require_regular_file "active persona" "$active_persona"
    pack="$(default_pack_for "$active_persona" 2>/dev/null)" || \
      die "could not derive the default pack path"
  fi
  PYTHONDONTWRITEBYTECODE=1 "$python_bin" "$pack_upgrade_checker" "$pack"
}

print_review_prepare_help() {
  cat <<'EOF'
Usage: ./choiceprint.sh review-prepare [--pack PATH] [--output PATH]

Creates a new private owner worksheet containing every canonical claim. The
worksheet is cryptographically bound to the selected pack, starts with every
decision set to pending, and is never replaced automatically. This command is
local and makes no network or model calls.
EOF
}

command_review_prepare() {
  local pack=""
  local output=""
  while (( $# > 0 )); do
    case "$1" in
      --pack)
        (( $# >= 2 )) || die "--pack requires a path"
        pack="$2"
        shift 2
        ;;
      --output)
        (( $# >= 2 )) || die "--output requires a path"
        output="$2"
        shift 2
        ;;
      --help|-h)
        print_review_prepare_help
        return 0
        ;;
      *) die "unknown review-prepare option: $1" ;;
    esac
  done

  require_python
  require_regular_file "claim review tool" "$claim_reviewer"
  if [[ -z "$pack" ]]; then
    require_regular_file "active persona" "$active_persona"
    pack="$(default_pack_for "$active_persona")" || \
      die "could not derive the default pack path"
  fi
  require_regular_directory "canonical pack" "$pack"
  require_private_mode "canonical pack" "$pack" 700

  if [[ -z "$output" ]]; then
    output="$(default_claim_review_for "$active_persona")" || \
      die "could not derive the default claim review path"
    [[ ! -L "$private_source_root" ]] || \
      die "private source directory must not be a symlink: $private_source_root"
    mkdir -p -m 700 -- "$claim_review_root"
    chmod 700 "$claim_review_root"
  else
    require_regular_directory "claim review output parent" "${output:h}"
  fi
  [[ ! -e "$output" && ! -L "$output" ]] || \
    die "refusing to replace the existing claim review: $output"

  PYTHONDONTWRITEBYTECODE=1 "$python_bin" "$claim_reviewer" prepare \
    --pack "$pack" \
    --output "$output"
  require_private_mode "private claim review" "$output" 600
  note "Every row is pending. No claim was confirmed or authorized."
}

print_review_claims_help() {
  cat <<'EOF'
Usage: ./choiceprint.sh review-claims --output PATH [options]

Options:
  --pack PATH        Canonical pack used to prepare the review.
  --input PATH       Prepared or in-progress private review worksheet.
  --output PATH      New private progress worksheet. Required.
  --max-claims N     Review at most N pending claims in this batch.
  --help             Show this help.

Only pending claims are shown. The input is never changed and the output is
never replaced. A partial batch remains resumable; reviewed_at is set only when
every claim has an explicit owner decision. This command is local and makes no
model or network calls. If --input is omitted, the active persona's default
prepared worksheet is used.
EOF
}

command_review_claims() {
  local pack=""
  local input=""
  local output=""
  local max_claims=""
  while (( $# > 0 )); do
    case "$1" in
      --pack)
        (( $# >= 2 )) || die "--pack requires a path"
        pack="$2"
        shift 2
        ;;
      --input)
        (( $# >= 2 )) || die "--input requires a path"
        input="$2"
        shift 2
        ;;
      --output)
        (( $# >= 2 )) || die "--output requires a path"
        output="$2"
        shift 2
        ;;
      --max-claims)
        (( $# >= 2 )) || die "--max-claims requires a positive integer"
        max_claims="$2"
        shift 2
        ;;
      --help|-h)
        print_review_claims_help
        return 0
        ;;
      --force|--approve-all|--confirm-all)
        die "review-claims does not support automatic approval or replacement"
        ;;
      *) die "unknown review-claims option: $1" ;;
    esac
  done

  [[ -n "$output" ]] || die "review-claims requires --output"
  require_python
  require_regular_file "claim review tool" "$claim_reviewer"
  if [[ -z "$pack" ]]; then
    require_regular_file "active persona" "$active_persona"
    pack="$(default_pack_for "$active_persona")" || \
      die "could not derive the default pack path"
  fi
  if [[ -z "$input" ]]; then
    require_regular_file "active persona" "$active_persona"
    input="$(default_claim_review_for "$active_persona")" || \
      die "could not derive the default claim review path"
  fi
  require_regular_directory "canonical pack" "$pack"
  require_private_mode "canonical pack" "$pack" 700
  require_regular_file "private claim review" "$input"
  require_private_mode "private claim review" "$input" 600
  require_regular_directory "claim review output parent" "${output:h}"
  [[ ! -e "$output" && ! -L "$output" ]] || \
    die "refusing to replace the existing claim review: $output"

  local -a args
  args=("$claim_reviewer" interactive --pack "$pack" --input "$input")
  args+=(--output "$output")
  [[ -z "$max_claims" ]] || args+=(--max-claims "$max_claims")
  PYTHONDONTWRITEBYTECODE=1 "$python_bin" "${args[@]}"
  require_private_mode "private claim review progress" "$output" 600
}

print_review_apply_help() {
  cat <<'EOF'
Usage: ./choiceprint.sh review-apply [options]

Options:
  --pack PATH                   Same canonical pack used to prepare the review.
  --review PATH                 Completed private claim review worksheet.
  --curation PATH               Base private curation YAML.
  --output PATH                 New reviewed curation YAML.
  --replace-existing-review     Intentionally replace claim_reviews in the base.
  --help                        Show this help.

Every claim must have an explicit supported decision and reviewed_at must be
completed. The selected pack must match the worksheet exactly. The base
curation and output are separate files, and existing output is never replaced.
EOF
}

command_review_apply() {
  local pack=""
  local review=""
  local curation="$curation_default"
  local output="$private_source_root/choiceprint-curation.reviewed.yaml"
  local replace_existing=0
  while (( $# > 0 )); do
    case "$1" in
      --pack)
        (( $# >= 2 )) || die "--pack requires a path"
        pack="$2"
        shift 2
        ;;
      --review)
        (( $# >= 2 )) || die "--review requires a path"
        review="$2"
        shift 2
        ;;
      --curation)
        (( $# >= 2 )) || die "--curation requires a path"
        curation="$2"
        shift 2
        ;;
      --output)
        (( $# >= 2 )) || die "--output requires a path"
        output="$2"
        shift 2
        ;;
      --replace-existing-review)
        replace_existing=1
        shift
        ;;
      --help|-h)
        print_review_apply_help
        return 0
        ;;
      *) die "unknown review-apply option: $1" ;;
    esac
  done

  require_python
  require_regular_file "claim review tool" "$claim_reviewer"
  if [[ -z "$pack" ]]; then
    require_regular_file "active persona" "$active_persona"
    pack="$(default_pack_for "$active_persona")" || \
      die "could not derive the default pack path"
  fi
  if [[ -z "$review" ]]; then
    require_regular_file "active persona" "$active_persona"
    review="$(default_claim_review_for "$active_persona")" || \
      die "could not derive the default claim review path"
  fi
  require_regular_directory "canonical pack" "$pack"
  require_private_mode "canonical pack" "$pack" 700
  require_regular_file "private claim review" "$review"
  require_private_mode "private claim review" "$review" 600
  require_regular_file "private curation" "$curation"
  require_private_mode "private curation" "$curation" 600
  require_regular_directory "reviewed curation output parent" "${output:h}"
  [[ ! -e "$output" && ! -L "$output" ]] || \
    die "refusing to replace the existing reviewed curation: $output"

  local -a args
  args=("$claim_reviewer" apply --pack "$pack" --review "$review")
  args+=(--curation "$curation" --output "$output")
  (( replace_existing == 0 )) || args+=(--replace-existing-review)
  PYTHONDONTWRITEBYTECODE=1 "$python_bin" "${args[@]}"
  require_private_mode "reviewed private curation" "$output" 600
  note "No consent was added. Rebuild explicitly with:"
  note "./choiceprint.sh build --curation $output --force"
}

print_coverage_review_help() {
  cat <<'EOF'
Usage:
  ./choiceprint.sh coverage-review prepare --run PATH --answers PATH \
    --score PATH --output PATH [--pack PATH]
  ./choiceprint.sh coverage-review interactive --input PATH --output PATH \
    [--pack PATH] [--run PATH --answers PATH --score PATH]

The prepare step verifies a prospective, finalized, integrity-bound evaluation
of the exact pack and includes only domains which passed every pre-registered gate.
The interactive step re-verifies those three private evaluation artifacts for
a validation review, then requires an explicit approve, reject, or cancel
decision for each candidate. A revocation review omits them. It writes a new
private receipt and never changes the pending input. Automatic approval and
replacement are not supported.
EOF
}

command_coverage_review() {
  local action="${1:-}"
  if [[ -z "$action" || "$action" == "--help" || "$action" == "-h" ]]; then
    print_coverage_review_help
    return 0
  fi
  shift
  [[ "$action" == "prepare" || "$action" == "interactive" ]] || \
    die "coverage-review action must be prepare or interactive"

  local pack=""
  local run=""
  local answers=""
  local score=""
  local input=""
  local output=""
  while (( $# > 0 )); do
    case "$1" in
      --pack)
        (( $# >= 2 )) || die "--pack requires a path"
        pack="$2"
        shift 2
        ;;
      --run)
        (( $# >= 2 )) || die "--run requires a path"
        run="$2"
        shift 2
        ;;
      --answers)
        (( $# >= 2 )) || die "--answers requires a path"
        answers="$2"
        shift 2
        ;;
      --score)
        (( $# >= 2 )) || die "--score requires a path"
        score="$2"
        shift 2
        ;;
      --input)
        (( $# >= 2 )) || die "--input requires a path"
        input="$2"
        shift 2
        ;;
      --output)
        (( $# >= 2 )) || die "--output requires a path"
        output="$2"
        shift 2
        ;;
      --help|-h)
        print_coverage_review_help
        return 0
        ;;
      --approve|--approve-all|--yes|--force|--replace|--update)
        die "coverage-review requires explicit interactive decisions and does not support $1"
        ;;
      *) die "unknown coverage-review option: $1" ;;
    esac
  done

  require_python
  require_regular_file "coverage review tool" "$coverage_reviewer"
  if [[ -z "$pack" ]]; then
    require_regular_file "active persona" "$active_persona"
    pack="$(default_pack_for "$active_persona")" || \
      die "could not derive the default pack path"
  fi
  require_regular_directory "canonical pack" "$pack"
  require_private_mode "canonical pack" "$pack" 700
  [[ -n "$output" ]] || die "coverage-review requires --output"
  require_regular_directory "coverage review output parent" "${output:h}"
  require_private_mode "coverage review output parent" "${output:h}" 700
  [[ ! -e "$output" && ! -L "$output" ]] || \
    die "refusing to replace the existing coverage review: $output"

  if [[ "$action" == "prepare" ]]; then
    [[ -n "$run" && -n "$answers" && -n "$score" ]] || \
      die "coverage-review prepare requires --run, --answers, and --score"
    [[ -z "$input" ]] || die "coverage-review prepare does not accept --input"
    require_regular_directory "private evaluation run" "$run"
    require_private_mode "private evaluation run" "$run" 700
    require_regular_file "private evaluation answers" "$answers"
    require_private_mode "private evaluation answers" "$answers" 600
    require_regular_directory "private score output" "$score"
    require_private_mode "private score output" "$score" 700
    PYTHONDONTWRITEBYTECODE=1 "$python_bin" "$coverage_reviewer" prepare \
      --pack "$pack" --run "$run" --answers "$answers" \
      --score "$score" --output "$output"
  else
    [[ -n "$input" ]] || die "coverage-review interactive requires --input"
    if [[ -n "$run" || -n "$answers" || -n "$score" ]]; then
      [[ -n "$run" && -n "$answers" && -n "$score" ]] || \
        die "coverage-review interactive requires all of --run, --answers, and --score together"
    fi
    require_regular_file "pending coverage review" "$input"
    require_private_mode "pending coverage review" "$input" 600
    local -a args
    args=("$coverage_reviewer" interactive --pack "$pack" --input "$input")
    args+=(--output "$output")
    if [[ -n "$run" ]]; then
      require_regular_directory "private evaluation run" "$run"
      require_private_mode "private evaluation run" "$run" 700
      require_regular_file "private evaluation answers" "$answers"
      require_private_mode "private evaluation answers" "$answers" 600
      require_regular_directory "private score output" "$score"
      require_private_mode "private score output" "$score" 700
      args+=(--run "$run" --answers "$answers" --score "$score")
    fi
    PYTHONDONTWRITEBYTECODE=1 "$python_bin" "${args[@]}"
  fi
  require_private_mode "private coverage review" "$output" 600
}

print_coverage_apply_help() {
  cat <<'EOF'
Usage: ./choiceprint.sh coverage-apply --review PATH --output PATH [options]

Options:
  --pack PATH       Exact canonical pack bound to the review.
  --review PATH     Completed owner coverage review.
  --output PATH     New .choiceprint release. Existing output is refused.
  --run PATH        Required for validation reviews only.
  --answers PATH    Required for validation reviews only.
  --score PATH      Required for validation reviews only.

This re-verifies every pack and evaluation binding before creating a new pack.
It never mutates the evaluated source pack. Revocation reviews must omit the
three evaluation artifact options.
EOF
}

command_coverage_apply() {
  local pack=""
  local review=""
  local output=""
  local run=""
  local answers=""
  local score=""
  while (( $# > 0 )); do
    case "$1" in
      --pack)
        (( $# >= 2 )) || die "--pack requires a path"
        pack="$2"
        shift 2
        ;;
      --review)
        (( $# >= 2 )) || die "--review requires a path"
        review="$2"
        shift 2
        ;;
      --output)
        (( $# >= 2 )) || die "--output requires a path"
        output="$2"
        shift 2
        ;;
      --run)
        (( $# >= 2 )) || die "--run requires a path"
        run="$2"
        shift 2
        ;;
      --answers)
        (( $# >= 2 )) || die "--answers requires a path"
        answers="$2"
        shift 2
        ;;
      --score)
        (( $# >= 2 )) || die "--score requires a path"
        score="$2"
        shift 2
        ;;
      --help|-h)
        print_coverage_apply_help
        return 0
        ;;
      --force|--replace|--update|--approve|--approve-all|--yes)
        die "coverage-apply does not support replacement or automatic approval: $1"
        ;;
      *) die "unknown coverage-apply option: $1" ;;
    esac
  done

  [[ -n "$review" ]] || die "coverage-apply requires --review"
  [[ -n "$output" ]] || die "coverage-apply requires --output"
  if [[ -n "$run" || -n "$answers" || -n "$score" ]]; then
    [[ -n "$run" && -n "$answers" && -n "$score" ]] || \
      die "coverage-apply requires all of --run, --answers, and --score together"
  fi
  require_python
  require_regular_file "coverage review tool" "$coverage_reviewer"
  if [[ -z "$pack" ]]; then
    require_regular_file "active persona" "$active_persona"
    pack="$(default_pack_for "$active_persona")" || \
      die "could not derive the default pack path"
  fi
  require_regular_directory "canonical pack" "$pack"
  require_private_mode "canonical pack" "$pack" 700
  require_regular_file "completed coverage review" "$review"
  require_private_mode "completed coverage review" "$review" 600
  require_regular_directory "coverage release output parent" "${output:h}"
  require_private_mode "coverage release output parent" "${output:h}" 700
  [[ ! -e "$output" && ! -L "$output" ]] || \
    die "refusing to replace an existing coverage release: $output"

  local -a args
  args=("$coverage_reviewer" apply --pack "$pack" --review "$review" --output "$output")
  if [[ -n "$run" ]]; then
    require_regular_directory "private evaluation run" "$run"
    require_private_mode "private evaluation run" "$run" 700
    require_regular_file "private evaluation answers" "$answers"
    require_private_mode "private evaluation answers" "$answers" 600
    require_regular_directory "private score output" "$score"
    require_private_mode "private score output" "$score" 700
    args+=(--run "$run" --answers "$answers" --score "$score")
  fi
  PYTHONDONTWRITEBYTECODE=1 "$python_bin" "${args[@]}"
  require_regular_directory "coverage release" "$output"
  require_private_mode "coverage release" "$output" 700
}

print_coverage_revoke_help() {
  cat <<'EOF'
Usage: ./choiceprint.sh coverage-revoke --domain DOMAIN --output PATH \
  [--domain DOMAIN ...] [--pack PATH]

Creates a private pending review for one or more currently validated domains.
Complete it with `coverage-review interactive`, then apply it with
`coverage-apply` without evaluation artifact options. Every approved revocation
requires a private owner note and a closed, non-sensitive public reason code.
EOF
}

command_coverage_revoke() {
  local pack=""
  local output=""
  local -a domains
  domains=()
  while (( $# > 0 )); do
    case "$1" in
      --pack)
        (( $# >= 2 )) || die "--pack requires a path"
        pack="$2"
        shift 2
        ;;
      --domain)
        (( $# >= 2 )) || die "--domain requires a value"
        domains+=("$2")
        shift 2
        ;;
      --output)
        (( $# >= 2 )) || die "--output requires a path"
        output="$2"
        shift 2
        ;;
      --help|-h)
        print_coverage_revoke_help
        return 0
        ;;
      --approve|--approve-all|--yes|--force|--replace|--update)
        die "coverage-revoke requires a separate interactive owner decision and does not support $1"
        ;;
      *) die "unknown coverage-revoke option: $1" ;;
    esac
  done
  (( ${#domains[@]} > 0 )) || die "coverage-revoke requires at least one --domain"
  [[ -n "$output" ]] || die "coverage-revoke requires --output"
  require_python
  require_regular_file "coverage review tool" "$coverage_reviewer"
  if [[ -z "$pack" ]]; then
    require_regular_file "active persona" "$active_persona"
    pack="$(default_pack_for "$active_persona")" || \
      die "could not derive the default pack path"
  fi
  require_regular_directory "canonical pack" "$pack"
  require_private_mode "canonical pack" "$pack" 700
  require_regular_directory "coverage review output parent" "${output:h}"
  require_private_mode "coverage review output parent" "${output:h}" 700
  [[ ! -e "$output" && ! -L "$output" ]] || \
    die "refusing to replace the existing coverage review: $output"
  local -a args
  args=("$coverage_reviewer" prepare-revoke --pack "$pack" --output "$output")
  local domain
  for domain in "${domains[@]}"; do
    args+=(--domain "$domain")
  done
  PYTHONDONTWRITEBYTECODE=1 "$python_bin" "${args[@]}"
  require_private_mode "private coverage revocation review" "$output" 600
}

print_holdout_review_help() {
  cat <<'EOF'
Usage: ./choiceprint.sh holdout-review --questions PATH --template PATH \
  --output PATH [--pack PATH]

Interactively records the owner's semantic-overlap decisions in a new private,
hash-bound receipt. The pending preflight template is never edited. The command
does not invoke a model, access answers or predictions, or authorize cloud
processing. If --pack is omitted, the active persona's canonical pack is used.
EOF
}

command_holdout_review() {
  local questions=""
  local template=""
  local output=""
  local pack=""
  while (( $# > 0 )); do
    case "$1" in
      --questions)
        (( $# >= 2 )) || die "--questions requires a path"
        questions="$2"
        shift 2
        ;;
      --template)
        (( $# >= 2 )) || die "--template requires a path"
        template="$2"
        shift 2
        ;;
      --output|--out)
        (( $# >= 2 )) || die "$1 requires a path"
        output="$2"
        shift 2
        ;;
      --pack)
        (( $# >= 2 )) || die "--pack requires a path"
        pack="$2"
        shift 2
        ;;
      --help|-h)
        print_holdout_review_help
        return 0
        ;;
      --force|--approve|--authorize-cloud-processing)
        die "holdout-review does not support automatic approval or replacement"
        ;;
      *) die "unknown holdout-review option: $1" ;;
    esac
  done

  [[ -n "$questions" ]] || die "holdout-review requires --questions"
  [[ -n "$template" ]] || die "holdout-review requires --template"
  [[ -n "$output" ]] || die "holdout-review requires --output"
  require_python
  require_regular_file "holdout reviewer" "$holdout_reviewer"
  if [[ -z "$pack" ]]; then
    require_regular_file "active persona" "$active_persona"
    pack="$(default_pack_for "$active_persona")" || \
      die "could not derive the default pack path"
  fi

  PYTHONDONTWRITEBYTECODE=1 "$python_bin" "$holdout_reviewer" \
    --questions "$questions" \
    --choiceprint "$pack" \
    --template "$template" \
    --out "$output"
}

print_collect_interview_help() {
  cat <<'EOF'
Usage: ./choiceprint.sh collect-interview --output PATH [--bank PATH]

Runs the structured low-stakes decision interview locally and writes one new,
owner-private, hash-bound response artifact outside the repository. The artifact
remains candidate-only and is never added to a Twin Pack automatically. Enter
"cancel" at any prompt to stop without writing an artifact. This command makes
no model or network call and never replaces an existing output.
EOF
}

command_collect_interview() {
  local bank="$interview_bank"
  local output=""
  while (( $# > 0 )); do
    case "$1" in
      --bank)
        (( $# >= 2 )) || die "--bank requires a path"
        bank="$2"
        shift 2
        ;;
      --output|--out)
        (( $# >= 2 )) || die "$1 requires a path"
        output="$2"
        shift 2
        ;;
      --help|-h)
        print_collect_interview_help
        return 0
        ;;
      --force|--replace|--overwrite|--publish|--promote|--network|--model)
        die "collect-interview is local, candidate-only, and never replaces or promotes outputs"
        ;;
      *) die "unknown collect-interview option: $1" ;;
    esac
  done

  [[ -n "$output" ]] || die "collect-interview requires --output"
  require_python
  require_regular_file "interview collector" "$interview_collector"
  require_regular_file "interview question bank" "$bank"

  PYTHONDONTWRITEBYTECODE=1 "$python_bin" "$interview_collector" \
    --bank "$bank" \
    --out "$output"
}

print_collect_retest_help() {
  cat <<'EOF'
Usage: ./choiceprint.sh collect-retest --questions PATH --answers PATH \
  --output PATH --seed INTEGER --count INTEGER

Collects a deterministic, family-balanced retest from a complete first-pass
answer file. Prior selections are never displayed or used to select the subset.
The retest must occur 7-14 days after every selected first-pass answer. A new
private answer file is written atomically; inputs and existing outputs are never
changed. This command makes no model or network call.
EOF
}

command_collect_retest() {
  local questions=""
  local answers=""
  local output=""
  local seed=""
  local count=""
  while (( $# > 0 )); do
    case "$1" in
      --questions)
        (( $# >= 2 )) || die "--questions requires a path"
        questions="$2"
        shift 2
        ;;
      --answers)
        (( $# >= 2 )) || die "--answers requires a path"
        answers="$2"
        shift 2
        ;;
      --output|--out)
        (( $# >= 2 )) || die "$1 requires a path"
        output="$2"
        shift 2
        ;;
      --seed)
        (( $# >= 2 )) || die "--seed requires an integer"
        seed="$2"
        shift 2
        ;;
      --count)
        (( $# >= 2 )) || die "--count requires an integer"
        count="$2"
        shift 2
        ;;
      --help|-h)
        print_collect_retest_help
        return 0
        ;;
      --force|--replace|--show-first-pass)
        die "collect-retest never replaces outputs or reveals prior selections"
        ;;
      *) die "unknown collect-retest option: $1" ;;
    esac
  done

  [[ -n "$questions" ]] || die "collect-retest requires --questions"
  [[ -n "$answers" ]] || die "collect-retest requires --answers"
  [[ -n "$output" ]] || die "collect-retest requires --output"
  [[ -n "$seed" ]] || die "collect-retest requires --seed"
  [[ -n "$count" ]] || die "collect-retest requires --count"
  require_python
  require_regular_file "answer collector" "$answer_collector"
  require_regular_file "private questions" "$questions"
  require_private_mode "private questions" "$questions" 600
  require_regular_file "private first-pass answers" "$answers"
  require_private_mode "private first-pass answers" "$answers" 600

  PYTHONDONTWRITEBYTECODE=1 "$python_bin" "$answer_collector" retest \
    --questions "$questions" \
    --answers "$answers" \
    --out "$output" \
    --seed "$seed" \
    --count "$count"
}

print_prepare_chatgpt_help() {
  cat <<'EOF'
Usage: ./choiceprint.sh prepare-chatgpt --curation PATH \
  --authorized-curation PATH --pack PATH --package PATH

Runs one local, owner-controlled release flow in this order:
  1. Review sources and modes and create a new authorized curation file.
  2. Build and validate a new canonical Choiceprint Twin Pack.
  3. Create and verify a new private ChatGPT Project upload package.

All four paths are required and each output must be new. The input curation is
never edited. The command has no force, overwrite, upload, network, or model
option. Consent cancellation or failure stops the flow before build begins.
EOF
}

command_prepare_chatgpt() {
  local curation=""
  local authorized_curation=""
  local pack=""
  local package=""

  while (( $# > 0 )); do
    case "$1" in
      --curation)
        (( $# >= 2 )) || die "--curation requires a path"
        [[ "$2" != --* ]] || die "--curation requires a path"
        [[ -z "$curation" ]] || die "prepare-chatgpt accepts --curation only once"
        curation="$2"
        shift 2
        ;;
      --authorized-curation)
        (( $# >= 2 )) || die "--authorized-curation requires a path"
        [[ "$2" != --* ]] || die "--authorized-curation requires a path"
        [[ -z "$authorized_curation" ]] || \
          die "prepare-chatgpt accepts --authorized-curation only once"
        authorized_curation="$2"
        shift 2
        ;;
      --pack)
        (( $# >= 2 )) || die "--pack requires a path"
        [[ "$2" != --* ]] || die "--pack requires a path"
        [[ -z "$pack" ]] || die "prepare-chatgpt accepts --pack only once"
        pack="$2"
        shift 2
        ;;
      --package)
        (( $# >= 2 )) || die "--package requires a path"
        [[ "$2" != --* ]] || die "--package requires a path"
        [[ -z "$package" ]] || die "prepare-chatgpt accepts --package only once"
        package="$2"
        shift 2
        ;;
      --help|-h)
        print_prepare_chatgpt_help
        return 0
        ;;
      --force|--overwrite|--replace|--publish|--upload|--network|--model)
        die "prepare-chatgpt is local, owner-controlled, and never replaces or uploads outputs"
        ;;
      *) die "unknown prepare-chatgpt option: $1" ;;
    esac
  done

  [[ -n "$curation" ]] || die "prepare-chatgpt requires --curation"
  [[ -n "$authorized_curation" ]] || \
    die "prepare-chatgpt requires --authorized-curation"
  [[ -n "$pack" ]] || die "prepare-chatgpt requires --pack"
  [[ -n "$package" ]] || die "prepare-chatgpt requires --package"

  require_python
  require_regular_file "private curation input" "$curation"
  require_private_mode "private curation input" "$curation" 600
  require_regular_file "consent preparer" "$consent_preparer"
  require_regular_file "active persona" "$active_persona"
  require_private_mode "active persona" "$active_persona" 600
  require_regular_file "Choiceprint builder" "$builder"
  require_regular_file "Choiceprint validator" "$validator"
  require_regular_file "upload verifier" "$upload_verifier"
  require_regular_file "upload README template" "$upload_readme_template"

  if ! PYTHONDONTWRITEBYTECODE=1 "$python_bin" -c '
import os
import sys
paths = [os.path.abspath(os.path.expanduser(value)) for value in sys.argv[1:]]
raise SystemExit(0 if len(paths) == len(set(paths)) else 1)
' "$curation" "$authorized_curation" "$pack" "$package"; then
    die "curation, authorized curation, pack, and package paths must be distinct"
  fi

  local -a new_outputs
  new_outputs=(
    "authorized curation" "$authorized_curation"
    "canonical pack" "$pack"
    "ChatGPT upload package" "$package"
  )
  local index label output
  for (( index = 1; index <= ${#new_outputs}; index += 2 )); do
    label="${new_outputs[$index]}"
    output="${new_outputs[$(( index + 1 ))]}"
    require_no_symlink_chain "$label output" "$output"
    [[ ! -e "$output" && ! -L "$output" ]] || \
      die "refusing to replace the existing $label output: $output"
  done

  local pack_parent="${pack:h}"
  local package_parent="${package:h}"
  require_regular_directory "canonical pack output parent" "$pack_parent"
  require_private_mode "canonical pack output parent" "$pack_parent" 700
  require_regular_directory "package output parent" "$package_parent"
  require_private_mode "package output parent" "$package_parent" 700

  note "Starting local owner consent review. No pack or package exists yet."
  PYTHONDONTWRITEBYTECODE=1 "$python_bin" "$consent_preparer" \
    --curation "$curation" \
    --output "$authorized_curation"
  require_regular_file "authorized private curation" "$authorized_curation"
  require_private_mode "authorized private curation" "$authorized_curation" 600

  command_build \
    --curation "$authorized_curation" \
    --output "$pack"
  command_package \
    --pack "$pack" \
    --output "$package"
  command_verify_package \
    --pack "$pack" \
    --package "$package"

  note "Verified private ChatGPT Project package: $package"
  print -- "Next steps:"
  print -- "1. Open $package/UPLOAD-README.md and follow it exactly."
  print -- "2. Create a dedicated private ChatGPT Project."
  print -- "3. Copy PROJECT-INSTRUCTIONS.md into the Project instructions."
  print -- "4. Upload all ten numbered files, 00-READ-FIRST.md through 09-CONSENT.md."
  print -- "5. Keep the canonical pack and authorized curation private and local."
}

print_package_help() {
  cat <<'EOF'
Usage: ./choiceprint.sh package [--pack PATH] [--output PATH]

Validates a canonical pack and creates a private ChatGPT upload directory with
only the generated adapter files, setup README, and integrity manifest.
Canonical source records, evidence, evaluation data, and holdout files are
never copied. Existing output is never replaced; choose a new path or move the
old directory yourself.
EOF
}

write_upload_readme() {
  local output="$1"
  cp -- "$upload_readme_template" "$output/UPLOAD-README.md"
  chmod 600 "$output/UPLOAD-README.md"
  cmp -s "$upload_readme_template" "$output/UPLOAD-README.md" || \
    die "packaged README did not match its tracked source"
}

command_package() {
  local pack=""
  local output=""
  while (( $# > 0 )); do
    case "$1" in
      --pack)
        (( $# >= 2 )) || die "--pack requires a path"
        pack="$2"
        shift 2
        ;;
      --output)
        (( $# >= 2 )) || die "--output requires a path"
        output="$2"
        shift 2
        ;;
      --help|-h)
        print_package_help
        return 0
        ;;
      --force)
        die "package intentionally has no --force option; choose a new output path"
        ;;
      *) die "unknown package option: $1" ;;
    esac
  done

  require_python
  require_regular_file "Choiceprint validator" "$validator"
  require_regular_file "upload verifier" "$upload_verifier"
  require_regular_file "upload README template" "$upload_readme_template"
  if [[ -z "$pack" ]]; then
    require_regular_file "active persona" "$active_persona"
    pack="$(default_pack_for "$active_persona")" || \
      die "could not derive the default pack path"
  fi
  require_regular_directory "canonical pack" "$pack"
  require_private_mode "canonical pack" "$pack" 700

  local adapter="$pack/adapters/chatgpt-project"
  require_regular_directory "ChatGPT adapter" "$adapter"
  local -a adapter_files
  adapter_files=("${(@f)$(PYTHONDONTWRITEBYTECODE=1 "$python_bin" \
    "$upload_verifier" list-files)}")
  (( ${#adapter_files} > 0 )) || die "upload verifier returned no adapter files"
  for filename in "${adapter_files[@]}"; do
    require_regular_file "adapter file" "$adapter/$filename"
  done

  PYTHONDONTWRITEBYTECODE=1 "$python_bin" "$validator" "$pack"

  if [[ -z "$output" ]]; then
    local pack_name="${pack:t}"
    output="$private_pack_root/${pack_name%.choiceprint}.chatgpt-upload"
  fi
  [[ ! -e "$output" && ! -L "$output" ]] || \
    die "refusing to replace the existing package: $output"

  local parent="${output:h}"
  require_regular_directory "package parent" "$parent"
  if PYTHONDONTWRITEBYTECODE=1 "$python_bin" -c '
import os
import sys
pack = os.path.realpath(sys.argv[1])
output = os.path.join(os.path.realpath(sys.argv[2]), os.path.basename(sys.argv[3]))
raise SystemExit(0 if os.path.commonpath([pack, output]) == pack else 1)
' "$pack" "$parent" "$output"; then
    die "package output must not be inside the canonical pack"
  fi
  mkdir -m 700 -- "$output" || die "could not create package: $output"
  local package_created=1
  cleanup_incomplete_package() {
    local exit_code=$?
    if (( exit_code != 0 && package_created == 1 )); then
      rm -rf -- "$output"
    fi
    return $exit_code
  }
  trap cleanup_incomplete_package EXIT HUP INT TERM

  for filename in "${adapter_files[@]}"; do
    cp -- "$adapter/$filename" "$output/$filename"
    chmod 600 "$output/$filename"
    cmp -s "$adapter/$filename" "$output/$filename" || \
      die "packaged adapter file did not match its validated source: $filename"
  done
  write_upload_readme "$output"
  PYTHONDONTWRITEBYTECODE=1 "$python_bin" "$upload_verifier" create \
    --package "$output" \
    --pack "$pack"

  package_created=0
  trap - EXIT HUP INT TERM
  require_private_mode "ChatGPT upload package" "$output" 700
  note "Created private ChatGPT upload package: $output"
  note "It contains only 11 adapter files, UPLOAD-README.md, and UPLOAD-MANIFEST.json."
}

print_verify_package_help() {
  cat <<'EOF'
Usage: ./choiceprint.sh verify-package [--pack PATH] [--package PATH]

Revalidates the canonical Choiceprint pack, then verifies the private upload
directory's exact file set, permissions, manifest, setup README, and adapter
bytes. This command is read-only and makes no model or network call.
EOF
}

command_verify_package() {
  local pack=""
  local package=""
  while (( $# > 0 )); do
    case "$1" in
      --pack)
        (( $# >= 2 )) || die "--pack requires a path"
        pack="$2"
        shift 2
        ;;
      --package)
        (( $# >= 2 )) || die "--package requires a path"
        package="$2"
        shift 2
        ;;
      --help|-h)
        print_verify_package_help
        return 0
        ;;
      --force|--repair|--update)
        die "verify-package is read-only and does not support $1"
        ;;
      *) die "unknown verify-package option: $1" ;;
    esac
  done

  require_python
  require_regular_file "upload verifier" "$upload_verifier"
  require_regular_file "upload README template" "$upload_readme_template"
  if [[ -z "$pack" ]]; then
    require_regular_file "active persona" "$active_persona"
    pack="$(default_pack_for "$active_persona")" || \
      die "could not derive the default pack path"
  fi
  if [[ -z "$package" ]]; then
    local pack_name="${pack:t}"
    package="$private_pack_root/${pack_name%.choiceprint}.chatgpt-upload"
  fi

  PYTHONDONTWRITEBYTECODE=1 "$python_bin" "$upload_verifier" verify \
    --package "$package" \
    --pack "$pack"
}

print_get_context_help() {
  cat <<'EOF'
Usage: ./choiceprint.sh get-context --mode MODE \
  (--scenario-file PATH | --scenario-json JSON) [options]

Options:
  --pack PATH             Canonical pack to retrieve from.
  --mode MODE             Exact consented runtime mode.
  --scenario-file PATH    Owner-only JSON scenario file.
  --scenario-json JSON    Inline JSON scenario. Avoid for sensitive scenarios.
  --max-context-bytes N   Maximum serialized context bytes (default: 12000).
  --help                  Show this help.

Validates the canonical pack and applies consent, sensitivity, runtime,
provenance, and expiry rules before returning deterministic JSON context. It is
read-only, makes no model or network call, and never predicts a choice. Prefer
--scenario-file so private scenario text is not stored in shell history.
EOF
}

command_get_context() {
  local pack=""
  local mode=""
  local scenario_file=""
  local scenario_json=""
  local max_context_bytes="12000"
  while (( $# > 0 )); do
    case "$1" in
      --pack)
        (( $# >= 2 )) || die "--pack requires a path"
        pack="$2"
        shift 2
        ;;
      --mode)
        (( $# >= 2 )) || die "--mode requires a value"
        mode="$2"
        shift 2
        ;;
      --scenario-file)
        (( $# >= 2 )) || die "--scenario-file requires a path"
        scenario_file="$2"
        shift 2
        ;;
      --scenario-json)
        (( $# >= 2 )) || die "--scenario-json requires JSON"
        scenario_json="$2"
        shift 2
        ;;
      --max-context-bytes)
        (( $# >= 2 )) || die "--max-context-bytes requires a positive integer"
        max_context_bytes="$2"
        shift 2
        ;;
      --help|-h)
        print_get_context_help
        return 0
        ;;
      --force|--write|--update|--replace)
        die "get-context is read-only and does not support $1"
        ;;
      *) die "unknown get-context option: $1" ;;
    esac
  done

  [[ -n "$mode" ]] || die "get-context requires --mode"
  if [[ -n "$scenario_file" && -n "$scenario_json" ]]; then
    die "get-context accepts exactly one of --scenario-file or --scenario-json"
  fi
  if [[ -z "$scenario_file" && -z "$scenario_json" ]]; then
    die "get-context requires --scenario-file or --scenario-json"
  fi

  require_python
  require_regular_file "Choiceprint context retriever" "$context_retriever"
  if [[ -z "$pack" ]]; then
    require_regular_file "active persona" "$active_persona"
    pack="$(default_pack_for "$active_persona")" || \
      die "could not derive the default pack path"
  fi
  require_regular_directory "canonical pack" "$pack"
  require_private_mode "canonical pack" "$pack" 700

  local -a args
  args=(--pack "$pack" --mode "$mode")
  args+=(--max-context-bytes "$max_context_bytes")
  if [[ -n "$scenario_file" ]]; then
    require_regular_file "private scenario" "$scenario_file"
    require_private_mode "private scenario" "$scenario_file" 600
    args+=(--scenario-file "$scenario_file")
  else
    args+=(--scenario-json "$scenario_json")
  fi
  PYTHONDONTWRITEBYTECODE=1 "$python_bin" "$context_retriever" "${args[@]}"
}

print_serve_mcp_help() {
  cat <<'EOF'
Usage: ./choiceprint.sh serve-mcp --pack PATH \
  --allow-private-chatgpt-access [--acknowledge-development-only]

Starts a private local MCP stdio process exposing exactly one read-only context
tool for the configured owner-only pack. The pack path and request time are not
tool inputs. No port is opened, no external action tool is exposed, and the
server is never started automatically.

Options:
  --pack PATH                     Owner-only canonical pack to serve.
  --allow-private-chatgpt-access  Confirm this process may serve the pack.
  --acknowledge-development-only  Required unless coverage is validated.
  --help                          Show this help.

Install the optional pinned MCP runtime first:
  matraix/.venv/bin/python -m pip install -r digital-twin/requirements-mcp.txt

Connecting this stdio process to ChatGPT still requires a separately configured
Secure MCP Tunnel and explicit owner approval for that connection.
EOF
}

require_mcp_runtime() {
  require_regular_file "Choiceprint MCP requirements" "$mcp_requirements"
  PYTHONDONTWRITEBYTECODE=1 "$python_bin" -c '
import importlib.metadata
raise SystemExit(0 if importlib.metadata.version("mcp") == "2.2.0" else 1)
' || die "the optional MCP runtime is missing or has the wrong version; install it with: matraix/.venv/bin/python -m pip install -r digital-twin/requirements-mcp.txt"
}

command_serve_mcp() {
  local pack=""
  local acknowledge_development_only=0
  local allow_private_chatgpt_access=0
  while (( $# > 0 )); do
    case "$1" in
      --pack)
        (( $# >= 2 )) || die "--pack requires a path"
        pack="$2"
        shift 2
        ;;
      --acknowledge-development-only)
        acknowledge_development_only=1
        shift
        ;;
      --allow-private-chatgpt-access)
        allow_private_chatgpt_access=1
        shift
        ;;
      --help|-h)
        print_serve_mcp_help
        return 0
        ;;
      --transport|--host|--port|--http|--write|--force|--update|--replace)
        die "serve-mcp is private, local, read-only, and does not support $1"
        ;;
      *) die "unknown serve-mcp option: $1" ;;
    esac
  done

  [[ -n "$pack" ]] || die "serve-mcp requires --pack"
  (( allow_private_chatgpt_access == 1 )) || \
    die "serve-mcp requires --allow-private-chatgpt-access"
  require_python
  require_regular_file "Choiceprint MCP server" "$mcp_server"
  require_regular_directory "canonical pack" "$pack"
  require_private_mode "canonical pack" "$pack" 700
  require_mcp_runtime

  local -a args
  args=(--pack "$pack" --allow-private-chatgpt-access)
  if (( acknowledge_development_only == 1 )); then
    args+=(--acknowledge-development-only)
  fi
  PYTHONDONTWRITEBYTECODE=1 exec "$python_bin" "$mcp_server" "${args[@]}"
}

main() {
  local command="${1:-}"
  if [[ -z "$command" || "$command" == "help" || \
        "$command" == "--help" || "$command" == "-h" ]]; then
    usage
    return 0
  fi
  shift
  case "$command" in
    doctor) command_doctor "$@" ;;
    init) command_init "$@" ;;
    build) command_build "$@" ;;
    validate) command_validate "$@" ;;
    pack-upgrade) command_pack_upgrade "$@" ;;
    review-prepare) command_review_prepare "$@" ;;
    review-claims) command_review_claims "$@" ;;
    review-apply) command_review_apply "$@" ;;
    coverage-review) command_coverage_review "$@" ;;
    coverage-apply) command_coverage_apply "$@" ;;
    coverage-revoke) command_coverage_revoke "$@" ;;
    holdout-review) command_holdout_review "$@" ;;
    collect-interview) command_collect_interview "$@" ;;
    collect-retest) command_collect_retest "$@" ;;
    prepare-chatgpt) command_prepare_chatgpt "$@" ;;
    package) command_package "$@" ;;
    verify-package) command_verify_package "$@" ;;
    get-context) command_get_context "$@" ;;
    serve-mcp) command_serve_mcp "$@" ;;
    *)
      usage >&2
      die "unknown command: $command"
      ;;
  esac
}

main "$@"
