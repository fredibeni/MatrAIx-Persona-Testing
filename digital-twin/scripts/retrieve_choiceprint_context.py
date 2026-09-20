#!/usr/bin/env python3
"""Select a deterministic, runtime-safe context view from a Choiceprint pack."""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import math
import os
import re
import stat
import sys
import tempfile
from collections import Counter, deque
from copy import deepcopy
from dataclasses import dataclass
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence

import yaml


SCRIPT_DIR = Path(__file__).resolve().parent
VALIDATOR_PATH = SCRIPT_DIR / "validate_twin_pack.py"

SUPPORTED_MODES = frozenset(
    {"predict-choice", "advise-person", "write-in-style", "draft-action"}
)
RUNTIME_SAFE_SENSITIVITIES = frozenset({"public", "private"})
MAX_SCENARIO_BYTES = 65_536
SOURCE_REFERENCE_KEYS = frozenset(
    {"evidence_refs", "source_refs", "counterevidence_refs"}
)
SCENARIO_KEYS = frozenset(
    {
        "domain",
        "summary",
        "prompt",
        "stakes",
        "reversibility",
        "time_horizon",
        "social_context",
        "actors",
        "options",
        "constraints",
        "conditions",
    }
)
PACK_PATHS = {
    "manifest": "manifest.json",
    "profile": "profile/overview.yaml",
    "claims": "profile/claims.jsonl",
    "policies": "profile/decision-policies.yaml",
    "cases": "profile/decision-cases.jsonl",
    "counterexamples": "profile/counterexamples.jsonl",
    "current_state": "profile/current-state.yaml",
    "sources": "evidence/sources.jsonl",
    "conflicts": "evidence/conflicts.jsonl",
    "consent": "evidence/consent.yaml",
    "boundaries": "safety/boundaries.yaml",
}
OUTPUT_KEYS = {
    "claim": "claims",
    "decision_policy": "decision_policies",
    "decision_case": "decision_cases",
    "counterexample": "counterexamples",
    "conflict": "conflicts",
    "source": "sources",
}
TYPE_PRIORITY = {
    "decision_case": 50,
    "decision_policy": 40,
    "conflict": 35,
    "claim": 30,
    "current_state": 20,
    "profile": 10,
}
STOPWORDS = frozenset(
    {
        "and",
        "are",
        "but",
        "for",
        "from",
        "has",
        "have",
        "into",
        "not",
        "that",
        "the",
        "their",
        "then",
        "this",
        "was",
        "were",
        "what",
        "when",
        "where",
        "which",
        "with",
        "would",
    }
)


class RetrievalError(ValueError):
    """Raised when a pack or retrieval request is unsafe or invalid."""


@dataclass(frozen=True)
class Candidate:
    kind: str
    identifier: str
    record: dict[str, Any]
    domain_match: int
    structured_matches: int
    lexical_overlap: int

    @property
    def sort_key(self) -> tuple[int, int, int, int, str]:
        return (
            -TYPE_PRIORITY[self.kind],
            -self.domain_match,
            -self.structured_matches,
            -self.lexical_overlap,
            self.identifier,
        )


def _reject_constant(value: str) -> None:
    raise ValueError(f"non-finite JSON constant: {value}")


def _unique_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    value: dict[str, Any] = {}
    for key, item in pairs:
        if key in value:
            raise ValueError(f"duplicate JSON key: {key}")
        value[key] = item
    return value


def _loads_json(raw: str | bytes, label: str) -> Any:
    try:
        return json.loads(
            raw,
            object_pairs_hook=_unique_object,
            parse_constant=_reject_constant,
        )
    except (UnicodeError, json.JSONDecodeError, ValueError) as exc:
        raise RetrievalError(f"invalid JSON in {label}: {exc}") from exc


def _load_module(name: str, path: Path) -> Any:
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RetrievalError(f"could not load Python module: {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    try:
        spec.loader.exec_module(module)
    except Exception:
        sys.modules.pop(name, None)
        raise
    return module


def _directory_open_flags() -> int:
    flags = os.O_RDONLY
    for name in ("O_CLOEXEC", "O_DIRECTORY", "O_NOFOLLOW"):
        flags |= int(getattr(os, name, 0))
    return flags


def _file_open_flags() -> int:
    flags = os.O_RDONLY
    for name in ("O_CLOEXEC", "O_NOFOLLOW", "O_NONBLOCK"):
        flags |= int(getattr(os, name, 0))
    return flags


def _open_directory_chain(path: Path, label: str) -> int:
    absolute = Path(os.path.abspath(path))
    flags = _directory_open_flags()
    descriptor: int | None = None
    try:
        descriptor = os.open(absolute.anchor, flags)
        for part in absolute.parts[1:]:
            child = os.open(part, flags, dir_fd=descriptor)
            child_stat = os.fstat(child)
            if not stat.S_ISDIR(child_stat.st_mode):
                os.close(child)
                raise RetrievalError(f"{label} path component is not a directory: {path}")
            os.close(descriptor)
            descriptor = child
        return descriptor
    except OSError as exc:
        if descriptor is not None:
            os.close(descriptor)
        raise RetrievalError(
            f"{label} must not contain a symlink or unsafe directory: {path}: {exc}"
        ) from exc
    except Exception:
        if descriptor is not None:
            os.close(descriptor)
        raise


def _read_regular_file_at(
    directory_descriptor: int,
    name: str,
    *,
    label: str,
    maximum_bytes: int | None = None,
) -> tuple[bytes, int]:
    try:
        descriptor = os.open(name, _file_open_flags(), dir_fd=directory_descriptor)
    except OSError as exc:
        raise RetrievalError(
            f"{label} must be a regular, non-symlink file: {name}: {exc}"
        ) from exc
    try:
        before = os.fstat(descriptor)
        if not stat.S_ISREG(before.st_mode):
            raise RetrievalError(f"{label} must be a regular, non-symlink file: {name}")
        if maximum_bytes is not None and before.st_size > maximum_bytes:
            raise RetrievalError(f"{label} exceeds the {maximum_bytes}-byte local limit")
        chunks: list[bytes] = []
        total = 0
        while True:
            chunk = os.read(descriptor, 1024 * 1024)
            if not chunk:
                break
            total += len(chunk)
            if maximum_bytes is not None and total > maximum_bytes:
                raise RetrievalError(
                    f"{label} exceeds the {maximum_bytes}-byte local limit"
                )
            chunks.append(chunk)
        after = os.fstat(descriptor)
        stable_fields = ("st_dev", "st_ino", "st_size", "st_mtime_ns", "st_ctime_ns")
        if any(getattr(before, field) != getattr(after, field) for field in stable_fields):
            raise RetrievalError(f"{label} changed while it was being read: {name}")
        return b"".join(chunks), stat.S_IMODE(after.st_mode)
    finally:
        os.close(descriptor)


def _descriptor_snapshot(
    root: Path,
) -> tuple[dict[str, bytes], dict[str, int], dict[str, int]]:
    root_descriptor = _open_directory_chain(root, "Choiceprint pack")
    files: dict[str, bytes] = {}
    directory_modes: dict[str, int] = {}
    file_modes: dict[str, int] = {}
    try:
        try:
            walker = os.fwalk(
                ".",
                topdown=True,
                follow_symlinks=False,
                dir_fd=root_descriptor,
            )
            for directory, child_directories, child_files, descriptor in walker:
                relative_directory = "" if directory == "." else directory.removeprefix("./")
                directory_modes[relative_directory] = stat.S_IMODE(
                    os.fstat(descriptor).st_mode
                )
                for name in sorted(child_directories):
                    entry = os.stat(name, dir_fd=descriptor, follow_symlinks=False)
                    if not stat.S_ISDIR(entry.st_mode):
                        relative = "/".join(
                            item for item in (relative_directory, name) if item
                        )
                        raise RetrievalError(
                            f"Choiceprint pack contains an unsafe directory: {relative}"
                        )
                for name in sorted(child_files):
                    relative = "/".join(
                        item for item in (relative_directory, name) if item
                    )
                    raw, mode = _read_regular_file_at(
                        descriptor,
                        name,
                        label=f"Choiceprint pack file {relative}",
                    )
                    files[relative] = raw
                    file_modes[relative] = mode
        except OSError as exc:
            raise RetrievalError(f"could not snapshot Choiceprint pack: {exc}") from exc
    finally:
        os.close(root_descriptor)
    return files, directory_modes, file_modes


def _materialize_snapshot(
    root: Path,
    files: Mapping[str, bytes],
    directory_modes: Mapping[str, int],
    file_modes: Mapping[str, int],
) -> None:
    root.mkdir(mode=0o700)
    for relative in sorted(
        (item for item in directory_modes if item), key=lambda item: (item.count("/"), item)
    ):
        destination = root / relative
        destination.mkdir(mode=0o700)
    for relative in sorted(files):
        destination = root / relative
        destination.write_bytes(files[relative])
        destination.chmod(file_modes[relative])
    for relative in sorted(
        (item for item in directory_modes if item),
        key=lambda item: (item.count("/"), item),
        reverse=True,
    ):
        (root / relative).chmod(directory_modes[relative])
    root.chmod(directory_modes[""])


def _sha256(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def _validated_snapshot(pack_path: Path | str) -> dict[str, bytes]:
    raw_path = Path(pack_path).expanduser()
    pack = Path(os.path.abspath(raw_path))
    files, directory_modes, file_modes = _descriptor_snapshot(pack)
    validator = _load_module("choiceprint_context_validator", VALIDATOR_PATH)
    with tempfile.TemporaryDirectory(prefix="choiceprint-retrieval-") as temporary:
        snapshot_root = Path(temporary).resolve() / "snapshot.choiceprint"
        _materialize_snapshot(
            snapshot_root,
            files,
            directory_modes,
            file_modes,
        )
        validation = validator.validate_bundle(snapshot_root)
        if not validation.ok:
            raise RetrievalError(
                "Choiceprint validation failed before retrieval:\n- "
                + "\n- ".join(validation.errors)
            )
        verified_files, verified_directories, verified_modes = _descriptor_snapshot(
            snapshot_root
        )
        if (
            verified_files != files
            or verified_directories != directory_modes
            or verified_modes != file_modes
        ):
            raise RetrievalError("validated Choiceprint snapshot changed during validation")

    metadata_bytes = files.get("build-metadata.json")
    if metadata_bytes is None:
        raise RetrievalError("build-metadata.json is missing from the pack snapshot")
    metadata = _loads_json(metadata_bytes, "build-metadata.json")
    expected = metadata.get("file_sha256") if isinstance(metadata, dict) else None
    if not isinstance(expected, dict):
        raise RetrievalError("build-metadata.json has no file_sha256 mapping")

    snapshot: dict[str, bytes] = {"build-metadata.json": metadata_bytes}
    for relative in PACK_PATHS.values():
        raw = files.get(relative)
        if raw is None:
            raise RetrievalError(f"unsafe canonical pack path: {relative}")
        expected_digest = expected.get(relative)
        if not isinstance(expected_digest, str) or _sha256(raw) != expected_digest:
            raise RetrievalError(f"canonical pack changed during retrieval: {relative}")
        snapshot[relative] = raw
    return snapshot


def _yaml_document(snapshot: Mapping[str, bytes], relative: str) -> Any:
    try:
        return yaml.safe_load(snapshot[relative].decode("utf-8"))
    except (UnicodeError, yaml.YAMLError) as exc:
        raise RetrievalError(f"invalid YAML in {relative}: {exc}") from exc


def _json_document(snapshot: Mapping[str, bytes], relative: str) -> Any:
    return _loads_json(snapshot[relative], relative)


def _jsonl_document(snapshot: Mapping[str, bytes], relative: str) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for index, line in enumerate(snapshot[relative].decode("utf-8").splitlines(), start=1):
        if not line.strip():
            continue
        value = _loads_json(line, f"{relative} line {index}")
        if not isinstance(value, dict):
            raise RetrievalError(f"{relative} line {index} must contain an object")
        records.append(value)
    return records


def _load_pack(pack_path: Path | str) -> dict[str, Any]:
    snapshot = _validated_snapshot(pack_path)
    value = {
        "build_metadata": _json_document(snapshot, "build-metadata.json"),
        "manifest": _json_document(snapshot, PACK_PATHS["manifest"]),
        "profile": _yaml_document(snapshot, PACK_PATHS["profile"]),
        "claims": _jsonl_document(snapshot, PACK_PATHS["claims"]),
        "policies": _yaml_document(snapshot, PACK_PATHS["policies"]),
        "cases": _jsonl_document(snapshot, PACK_PATHS["cases"]),
        "counterexamples": _jsonl_document(snapshot, PACK_PATHS["counterexamples"]),
        "current_state": _yaml_document(snapshot, PACK_PATHS["current_state"]),
        "sources": _jsonl_document(snapshot, PACK_PATHS["sources"]),
        "conflicts": _jsonl_document(snapshot, PACK_PATHS["conflicts"]),
        "consent": _yaml_document(snapshot, PACK_PATHS["consent"]),
        "boundaries": _yaml_document(snapshot, PACK_PATHS["boundaries"]),
    }
    if not isinstance(value["policies"], list):
        raise RetrievalError("profile/decision-policies.yaml must contain a list")
    for key in (
        "build_metadata",
        "manifest",
        "profile",
        "current_state",
        "consent",
        "boundaries",
    ):
        if not isinstance(value[key], dict):
            raise RetrievalError(f"canonical {key} document must contain a mapping")
    return value


def _parse_timestamp(value: str | datetime | None, label: str) -> datetime:
    if value is None:
        return datetime.now(timezone.utc)
    if isinstance(value, datetime):
        parsed = value
    elif isinstance(value, str):
        text = value.strip()
        if not text:
            raise RetrievalError(f"{label} must not be blank")
        try:
            parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
        except ValueError as exc:
            raise RetrievalError(f"{label} must be an ISO-8601 timestamp") from exc
    else:
        raise RetrievalError(f"{label} must be a timestamp string or datetime")
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise RetrievalError(f"{label} must include a timezone")
    return parsed.astimezone(timezone.utc)


def _timestamp_text(value: datetime) -> str:
    return value.replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _temporal_value(value: Any, label: str) -> date | datetime | None:
    if value in (None, ""):
        return None
    if not isinstance(value, str):
        raise RetrievalError(f"{label} must be an ISO-8601 date or timestamp")
    try:
        if "T" not in value:
            return date.fromisoformat(value)
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise RetrievalError(f"{label} must be an ISO-8601 date or timestamp") from exc
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise RetrievalError(f"{label} timestamp must include a timezone")
    return parsed.astimezone(timezone.utc)


def _is_future(value: Any, request_at: datetime, label: str) -> bool:
    parsed = _temporal_value(value, label)
    if parsed is None:
        return False
    if isinstance(parsed, datetime):
        return parsed > request_at
    return parsed > request_at.date()


def _is_expired(value: Any, request_at: datetime, label: str) -> bool:
    parsed = _temporal_value(value, label)
    if parsed is None:
        return False
    if isinstance(parsed, datetime):
        return parsed <= request_at
    return parsed < request_at.date()


def _assert_finite(value: Any, ancestors: set[int] | None = None) -> None:
    active = set() if ancestors is None else set(ancestors)
    if isinstance(value, float) and not math.isfinite(value):
        raise RetrievalError("scenario contains a non-finite number")
    if not isinstance(value, (dict, list)):
        return
    identity = id(value)
    if identity in active:
        raise RetrievalError("scenario must not contain a recursive value")
    active.add(identity)
    children = value.values() if isinstance(value, dict) else value
    for child in children:
        _assert_finite(child, active)


def _validate_scenario(scenario: Mapping[str, Any]) -> dict[str, Any]:
    if not isinstance(scenario, Mapping):
        raise RetrievalError("scenario must be a JSON object")
    normalized = {str(key): deepcopy(value) for key, value in scenario.items()}
    unsupported = sorted(set(normalized) - SCENARIO_KEYS)
    if unsupported:
        raise RetrievalError("unsupported scenario fields: " + ", ".join(unsupported))
    _assert_finite(normalized)
    serialized = json.dumps(
        normalized, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    ).encode("utf-8")
    if len(serialized) > MAX_SCENARIO_BYTES:
        raise RetrievalError("scenario exceeds the 65536-byte local limit")
    if not any(value not in (None, "", [], {}) for value in normalized.values()):
        raise RetrievalError("scenario must contain at least one non-empty field")
    return normalized


def _normalize(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value).strip().casefold())


def _as_values(value: Any) -> set[str]:
    if value in (None, "", [], {}):
        return set()
    values = value if isinstance(value, list) else [value]
    return {_normalize(item) for item in values if item not in (None, "")}


def _tokens(value: Any, *, skip_keys: frozenset[str] = frozenset()) -> set[str]:
    fragments: list[str] = []

    def visit(item: Any, key: str | None = None) -> None:
        if key in skip_keys:
            return
        if isinstance(item, Mapping):
            for child_key, child in item.items():
                visit(child, str(child_key))
        elif isinstance(item, list):
            for child in item:
                visit(child, key)
        elif item not in (None, ""):
            fragments.append(str(item))

    visit(value)
    return {
        token
        for token in re.findall(r"[a-z0-9]+", " ".join(fragments).casefold())
        if len(token) >= 3 and token not in STOPWORDS
    }


def _features(kind: str, record: Mapping[str, Any]) -> Mapping[str, Any]:
    if kind == "decision_case":
        scenario = record.get("scenario")
        return scenario if isinstance(scenario, Mapping) else {}
    if kind == "decision_policy":
        when = record.get("when")
        return when if isinstance(when, Mapping) else {}
    if kind == "claim":
        scope = record.get("scope")
        return scope if isinstance(scope, Mapping) else {}
    if kind == "conflict":
        return {"domain": record.get("domain")}
    return {}


def _match_scores(
    kind: str, record: Mapping[str, Any], scenario: Mapping[str, Any]
) -> tuple[int, int, int]:
    record_features = _features(kind, record)
    domain_match = int(
        bool(_as_values(scenario.get("domain")) & _as_values(record_features.get("domain")))
        or bool(
            _as_values(scenario.get("domain"))
            & _as_values(record_features.get("domains"))
        )
    )
    structured_matches = domain_match
    for singular, plural in (
        ("stakes", "stakes"),
        ("reversibility", "reversibility"),
        ("time_horizon", "time_horizon"),
        ("social_context", "social_context"),
        ("conditions", "conditions"),
        ("actors", "actors"),
        ("constraints", "constraints"),
    ):
        requested = _as_values(scenario.get(singular))
        available = _as_values(record_features.get(plural))
        structured_matches += len(requested & available)
    skipped = frozenset(
        {
            "id",
            "source_refs",
            "evidence_refs",
            "counterevidence_refs",
            "claim_refs",
            "policy_refs",
            "case_refs",
            "sensitivity",
            "runtime_included",
        }
    )
    lexical_overlap = len(_tokens(scenario) & _tokens(record, skip_keys=skipped))
    return domain_match, structured_matches, lexical_overlap


def _source_references(value: Any) -> set[str]:
    references: set[str] = set()
    if isinstance(value, Mapping):
        for key, child in value.items():
            if key in SOURCE_REFERENCE_KEYS:
                children = child if isinstance(child, list) else [child]
                references.update(str(item) for item in children if item not in (None, ""))
            else:
                references.update(_source_references(child))
    elif isinstance(value, list):
        for child in value:
            references.update(_source_references(child))
    return references


def _record_id(kind: str, record: Mapping[str, Any]) -> str:
    if kind == "profile":
        return "profile_overview"
    if kind == "current_state":
        return "current_state"
    identifier = record.get("id")
    if not isinstance(identifier, str) or not identifier:
        raise RetrievalError(f"{kind} record has no stable id")
    return identifier


def _source_authorizer(
    sources: Sequence[Mapping[str, Any]], allowed_sources: Iterable[Any]
):
    by_id = {
        str(source.get("id")): source
        for source in sources
        if isinstance(source.get("id"), str)
    }
    allowed = {str(item) for item in allowed_sources}
    cache: dict[str, bool] = {}

    def authorized(source_id: str, active: set[str] | None = None) -> bool:
        if source_id in cache:
            return cache[source_id]
        visited = set() if active is None else set(active)
        if source_id in visited:
            cache[source_id] = False
            return False
        visited.add(source_id)
        source = by_id.get(source_id)
        if source is None or source.get("sensitivity") not in RUNTIME_SAFE_SENSITIVITIES:
            cache[source_id] = False
            return False
        authorship = source.get("authorship")
        parent = source.get("parent_source_ref")
        if authorship == "assistant":
            result = isinstance(parent, str) and authorized(parent, visited)
        elif authorship in {"person", "mixed"}:
            result = source_id in allowed
        else:
            result = False
        cache[source_id] = bool(result)
        return bool(result)

    return by_id, authorized


def _safety_reason(
    kind: str,
    record: Mapping[str, Any],
    *,
    request_at: datetime,
    source_authorized: Any,
) -> str | None:
    if record.get("sensitivity") not in RUNTIME_SAFE_SENSITIVITIES:
        return "sensitive"
    if kind in {"profile", "current_state", "claim"}:
        if record.get("runtime_included") is not True:
            return "runtime_not_included"
    elif record.get("runtime_included") is False:
        return "runtime_not_included"
    if kind == "claim":
        if record.get("status") != "active":
            return "inactive_claim"
        if record.get("user_confirmed") is not True:
            return "owner_not_confirmed"
    if kind == "decision_case" and record.get("dataset_role") == "holdout":
        return "holdout"
    if _is_future(
        record.get("effective_from"), request_at, f"{kind}.effective_from"
    ):
        return "not_yet_effective"
    if _is_expired(record.get("effective_to"), request_at, f"{kind}.effective_to"):
        return "expired"
    if kind == "current_state" and _is_expired(
        record.get("expires_at"), request_at, "current_state.expires_at"
    ):
        return "expired"
    references = _source_references(record)
    if not references:
        return "missing_source_references"
    if not all(source_authorized(reference) for reference in references):
        return "source_not_authorized"
    return None


def _state_has_context(record: Mapping[str, Any]) -> bool:
    for key in ("active_goals", "current_projects", "temporary_constraints", "mood"):
        if record.get(key) not in (None, "", [], {}):
            return True
    return _normalize(record.get("capacity") or "") not in {"", "unknown", "none"}


def _state_scenario_overlap(
    record: Mapping[str, Any], scenario: Mapping[str, Any]
) -> int:
    context = {
        key: record.get(key)
        for key in (
            "active_goals",
            "current_projects",
            "temporary_constraints",
            "mood",
            "capacity",
        )
        if record.get(key) not in (None, "", [], {})
    }
    return len(_tokens(scenario) & _tokens(context))


def _candidate_records(
    eligible: Mapping[str, Mapping[str, dict[str, Any]]],
    *,
    scenario: Mapping[str, Any],
    mode: str,
    exclusions: Counter[tuple[str, str]],
) -> list[Candidate]:
    candidates: list[Candidate] = []
    for kind in (
        "current_state",
        "decision_case",
        "decision_policy",
        "conflict",
        "claim",
        "profile",
    ):
        for identifier, record in eligible.get(kind, {}).items():
            domain_match, structured_matches, lexical_overlap = _match_scores(
                kind, record, scenario
            )
            relevant = bool(domain_match or structured_matches or lexical_overlap)
            if kind == "current_state":
                lexical_overlap = _state_scenario_overlap(record, scenario)
                relevant = _state_has_context(record) and lexical_overlap > 0
            elif kind == "profile" and mode == "write-in-style":
                relevant = True
            if not relevant:
                exclusions[(kind, "no_scenario_match")] += 1
                continue
            candidates.append(
                Candidate(
                    kind=kind,
                    identifier=identifier,
                    record=record,
                    domain_match=domain_match,
                    structured_matches=structured_matches,
                    lexical_overlap=lexical_overlap,
                )
            )
    def sort_key(candidate: Candidate) -> tuple[int, int, int, int, str]:
        priority = TYPE_PRIORITY[candidate.kind]
        if mode == "write-in-style" and candidate.kind == "profile":
            priority = max(TYPE_PRIORITY.values()) + 1
        return (
            -priority,
            -candidate.domain_match,
            -candidate.structured_matches,
            -candidate.lexical_overlap,
            candidate.identifier,
        )

    return sorted(candidates, key=sort_key)


def _safe_source_view(source: Mapping[str, Any]) -> dict[str, Any]:
    result = {
        "id": source.get("id"),
        "source_type": source.get("source_type"),
        "authorship": source.get("authorship"),
        "captured_at": source.get("captured_at"),
        "sensitivity": source.get("sensitivity"),
    }
    parent = source.get("parent_source_ref")
    if isinstance(parent, str):
        result["parent_source_ref"] = parent
    if source.get("runtime_excerpt_allowed") is True:
        result["summary"] = source.get("summary")
    else:
        result["summary"] = "source detail withheld from runtime context"
    return {key: value for key, value in result.items() if value is not None}


def _reference_list(record: Mapping[str, Any], key: str) -> list[str]:
    value = record.get(key, [])
    if not isinstance(value, list):
        return []
    return [str(item) for item in value]


def _reverse_counterevidence_targets(
    kind: str, record: Mapping[str, Any]
) -> set[str]:
    if kind == "counterexample":
        target = record.get("claim_or_policy_id")
        return {target} if isinstance(target, str) and target else set()
    if kind == "conflict":
        return set(_reference_list(record, "claim_refs")) | set(
            _reference_list(record, "policy_refs")
        )
    return set()


def _closure_for_candidate(
    candidate: Candidate,
    *,
    eligible: Mapping[str, Mapping[str, dict[str, Any]]],
    source_by_id: Mapping[str, Mapping[str, Any]],
    source_authorized: Any,
    blocked_reverse_targets: frozenset[str] = frozenset(),
) -> dict[str, dict[str, dict[str, Any]]] | None:
    group: dict[str, dict[str, dict[str, Any]]] = {}
    queue: deque[tuple[str, str]] = deque([(candidate.kind, candidate.identifier)])
    seen: set[tuple[str, str]] = set()

    def enqueue(kind: str, identifier: str) -> bool:
        if identifier not in eligible.get(kind, {}):
            return False
        queue.append((kind, identifier))
        return True

    while queue:
        kind, identifier = queue.popleft()
        key = (kind, identifier)
        if key in seen:
            continue
        seen.add(key)
        record = eligible.get(kind, {}).get(identifier)
        if record is None:
            return None
        if kind in {"claim", "decision_policy"} and identifier in blocked_reverse_targets:
            return None
        group.setdefault(kind, {})[identifier] = record
        for source_id in sorted(_source_references(record)):
            current = source_id
            lineage_seen: set[str] = set()
            while current:
                if current in lineage_seen or not source_authorized(current):
                    return None
                lineage_seen.add(current)
                source = source_by_id.get(current)
                if source is None:
                    return None
                group.setdefault("source", {})[current] = _safe_source_view(source)
                parent = source.get("parent_source_ref")
                current = parent if isinstance(parent, str) else ""

        for reference in _reference_list(record, "claim_refs"):
            if not enqueue("claim", reference):
                return None
        for reference in _reference_list(record, "policy_refs"):
            if not enqueue("decision_policy", reference):
                return None
        for reference in _reference_list(record, "case_refs"):
            if not enqueue("decision_case", reference):
                return None
        if kind == "counterexample":
            target = record.get("claim_or_policy_id")
            if isinstance(target, str):
                if target in eligible.get("claim", {}):
                    enqueue("claim", target)
                elif target in eligible.get("decision_policy", {}):
                    enqueue("decision_policy", target)
                else:
                    return None

        target_ids = set(group.get("claim", {})) | set(
            group.get("decision_policy", {})
        )
        for related_id, related in eligible.get("counterexample", {}).items():
            if related.get("claim_or_policy_id") in target_ids:
                queue.append(("counterexample", related_id))
        for related_id, related in eligible.get("conflict", {}).items():
            references = set(_reference_list(related, "claim_refs")) | set(
                _reference_list(related, "policy_refs")
            )
            if references & target_ids:
                queue.append(("conflict", related_id))
    return group


def _merge_group(
    selected: Mapping[str, Mapping[str, dict[str, Any]]],
    group: Mapping[str, Mapping[str, dict[str, Any]]],
) -> dict[str, dict[str, dict[str, Any]]]:
    merged = {
        kind: {identifier: deepcopy(record) for identifier, record in records.items()}
        for kind, records in selected.items()
    }
    for kind, records in group.items():
        destination = merged.setdefault(kind, {})
        for identifier, record in records.items():
            destination.setdefault(identifier, deepcopy(record))
    return merged


def _render_selected(
    selected: Mapping[str, Mapping[str, dict[str, Any]]]
) -> dict[str, Any]:
    rendered: dict[str, Any] = {}
    if selected.get("profile"):
        rendered["profile_overview"] = selected["profile"]["profile_overview"]
    if selected.get("current_state"):
        rendered["current_state"] = selected["current_state"]["current_state"]
    for kind, output_key in OUTPUT_KEYS.items():
        records = selected.get(kind, {})
        if records:
            rendered[output_key] = [records[key] for key in sorted(records)]
    return rendered


def _context_document(
    *,
    coverage: Mapping[str, Any],
    boundaries: Mapping[str, Any],
    selected: Mapping[str, Mapping[str, dict[str, Any]]],
) -> dict[str, Any]:
    return {
        "coverage": deepcopy(dict(coverage)),
        "boundaries": deepcopy(dict(boundaries)),
        "selected_records": _render_selected(selected),
    }


def _serialized_bytes(value: Any) -> int:
    return len(
        json.dumps(
            value, ensure_ascii=False, sort_keys=True, separators=(",", ":")
        ).encode("utf-8")
    )


def _empty_result(
    *,
    status: str,
    mode: str,
    request_at: datetime,
    max_context_bytes: int,
    reason: str,
) -> dict[str, Any]:
    context = {"selected_records": {}}
    used = _serialized_bytes(context)
    return {
        "status": status,
        "mode": mode,
        "request_at": _timestamp_text(request_at),
        "context": context,
        "evidence_ids": [],
        "unknowns": [reason],
        "exclusions": [{"record_type": "request", "reason": reason, "count": 1}],
        "selection": [],
        "budget": {
            "unit": "utf8_bytes",
            "maximum": max_context_bytes,
            "used": used,
            "remaining": max_context_bytes - used,
        },
    }


def get_twin_context(
    pack_path: Path | str,
    *,
    mode: str,
    scenario: Mapping[str, Any],
    max_context_bytes: int,
    request_at: str | datetime | None = None,
) -> dict[str, Any]:
    """Return a deterministic, runtime-safe context view without modifying the pack."""

    if isinstance(max_context_bytes, bool) or not isinstance(max_context_bytes, int):
        raise RetrievalError("max_context_bytes must be an integer")
    minimum = _serialized_bytes({"selected_records": {}})
    if max_context_bytes < minimum:
        raise RetrievalError(
            f"max_context_bytes must be at least {minimum} for an empty context"
        )
    if not isinstance(mode, str) or mode not in SUPPORTED_MODES:
        raise RetrievalError("mode must be one of: " + ", ".join(sorted(SUPPORTED_MODES)))
    normalized_scenario = _validate_scenario(scenario)
    requested_at = _parse_timestamp(request_at, "request_at")
    pack = _load_pack(pack_path)
    consent = pack["consent"]

    if _is_future(
        consent.get("authorized_at"),
        requested_at,
        "consent.authorized_at",
    ):
        raise RetrievalError(
            "request_at must not be earlier than the consent authorization time"
        )
    if _is_future(
        pack["build_metadata"].get("built_at"),
        requested_at,
        "build_metadata.built_at",
    ):
        raise RetrievalError("request_at must not be earlier than the pack build time")

    if consent.get("owner_authorized") is not True:
        return _empty_result(
            status="blocked",
            mode=mode,
            request_at=requested_at,
            max_context_bytes=max_context_bytes,
            reason="owner consent does not authorize runtime retrieval",
        )
    allowed_modes = consent.get("allowed_modes")
    if not isinstance(allowed_modes, list) or mode not in allowed_modes:
        return _empty_result(
            status="blocked",
            mode=mode,
            request_at=requested_at,
            max_context_bytes=max_context_bytes,
            reason="requested mode is not authorized by consent",
        )

    source_by_id, source_authorized = _source_authorizer(
        pack["sources"], consent.get("allowed_sources") or []
    )
    exclusions: Counter[tuple[str, str]] = Counter()
    blocked_reverse_targets: set[str] = set()
    eligible: dict[str, dict[str, dict[str, Any]]] = {
        "profile": {},
        "current_state": {},
        "claim": {},
        "decision_policy": {},
        "decision_case": {},
        "counterexample": {},
        "conflict": {},
    }
    collections = (
        ("profile", [pack["profile"]]),
        ("current_state", [pack["current_state"]]),
        ("claim", pack["claims"]),
        ("decision_policy", pack["policies"]),
        ("decision_case", pack["cases"]),
        ("counterexample", pack["counterexamples"]),
        ("conflict", pack["conflicts"]),
    )
    for kind, records in collections:
        for record in records:
            identifier = _record_id(kind, record)
            reason = _safety_reason(
                kind,
                record,
                request_at=requested_at,
                source_authorized=source_authorized,
            )
            if reason is not None:
                exclusions[(kind, reason)] += 1
                blocked_reverse_targets.update(
                    _reverse_counterevidence_targets(kind, record)
                )
                continue
            eligible[kind][identifier] = record

    candidates = _candidate_records(
        eligible,
        scenario=normalized_scenario,
        mode=mode,
        exclusions=exclusions,
    )
    coverage = pack["manifest"].get("coverage")
    coverage = coverage if isinstance(coverage, dict) else {}
    runtime_coverage = {
        "status": coverage.get("status"),
        "validated_domains": deepcopy(coverage.get("validated_domains", [])),
    }
    selected: dict[str, dict[str, dict[str, Any]]] = {}
    context = _context_document(
        coverage=runtime_coverage,
        boundaries=pack["boundaries"],
        selected=selected,
    )
    if _serialized_bytes(context) > max_context_bytes:
        exclusions[("request", "required_controls_exceed_budget")] += 1
        return _empty_result(
            status="insufficient_evidence",
            mode=mode,
            request_at=requested_at,
            max_context_bytes=max_context_bytes,
            reason="context budget is too small for required coverage and boundaries",
        )

    selection: list[dict[str, Any]] = []
    for candidate in candidates:
        group = _closure_for_candidate(
            candidate,
            eligible=eligible,
            source_by_id=source_by_id,
            source_authorized=source_authorized,
            blocked_reverse_targets=frozenset(blocked_reverse_targets),
        )
        if group is None:
            exclusions[(candidate.kind, "unsafe_reference_closure")] += 1
            continue
        merged = _merge_group(selected, group)
        if _render_selected(merged) == _render_selected(selected):
            continue
        proposed = _context_document(
            coverage=runtime_coverage,
            boundaries=pack["boundaries"],
            selected=merged,
        )
        if _serialized_bytes(proposed) > max_context_bytes:
            exclusions[(candidate.kind, "context_budget")] += 1
            continue
        selected = merged
        context = proposed
        selection.append(
            {
                "record_type": candidate.kind,
                "record_id": candidate.identifier,
                "domain_match": bool(candidate.domain_match),
                "structured_matches": candidate.structured_matches,
                "lexical_overlap": candidate.lexical_overlap,
            }
        )

    selected_records = _render_selected(selected)
    evidence_ids = sorted(selected.get("source", {}))
    unknowns: list[str] = []
    domain = normalized_scenario.get("domain")
    validated_domains = coverage.get("validated_domains")
    if isinstance(domain, str) and (
        not isinstance(validated_domains, list) or domain not in validated_domains
    ):
        unknowns.append(f"requested domain '{domain}' is not recorded as validated")
    coverage_status = coverage.get("status")
    if coverage_status not in (None, "validated"):
        unknowns.append(f"pack coverage status is {coverage_status}")
    if "decision_cases" not in selected_records:
        unknowns.append("no analogous runtime-safe decision case was selected")
    if "decision_policies" not in selected_records:
        unknowns.append("no matching runtime-safe decision policy was selected")
    if "claims" not in selected_records:
        unknowns.append("no matching runtime-safe stable claim was selected")
    if "current_state" not in selected_records:
        unknowns.append("no active runtime-safe current state was selected")
    if any(reason == "context_budget" for _, reason in exclusions):
        unknowns.append("additional matching evidence did not fit the context budget")

    if mode == "write-in-style":
        sufficient = "profile_overview" in selected_records
    else:
        primary_keys = {"decision_cases", "decision_policies", "claims"}
        sufficient = bool(primary_keys & set(selected_records))
    status = "ok" if sufficient else "insufficient_evidence"
    if status == "insufficient_evidence":
        unknowns.insert(0, "no sufficient runtime-safe personal evidence matched the request")

    used = _serialized_bytes(context)
    return {
        "status": status,
        "mode": mode,
        "request_at": _timestamp_text(requested_at),
        "context": context,
        "evidence_ids": evidence_ids,
        "unknowns": unknowns,
        "exclusions": [
            {"record_type": kind, "reason": reason, "count": count}
            for (kind, reason), count in sorted(exclusions.items())
        ],
        "selection": selection,
        "budget": {
            "unit": "utf8_bytes",
            "maximum": max_context_bytes,
            "used": used,
            "remaining": max_context_bytes - used,
        },
    }


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pack", required=True, type=Path)
    parser.add_argument("--mode", required=True, choices=sorted(SUPPORTED_MODES))
    scenario_input = parser.add_mutually_exclusive_group(required=True)
    scenario_input.add_argument(
        "--scenario-json",
        help="JSON object describing the current decision scenario",
    )
    scenario_input.add_argument(
        "--scenario-file",
        type=Path,
        help="private mode-0600 JSON file describing the current decision scenario",
    )
    parser.add_argument("--max-context-bytes", required=True, type=int)
    parser.add_argument("--at", help="timezone-aware request timestamp; defaults to now")
    return parser


def _read_private_scenario_file(path: Path) -> Any:
    expanded = path.expanduser()
    absolute = Path(os.path.abspath(expanded))
    parent_descriptor = _open_directory_chain(absolute.parent, "scenario file")
    try:
        raw, permissions = _read_regular_file_at(
            parent_descriptor,
            absolute.name,
            label="scenario file",
            maximum_bytes=MAX_SCENARIO_BYTES,
        )
    finally:
        os.close(parent_descriptor)
    if os.name == "posix" and permissions != 0o600:
        raise RetrievalError(
            f"scenario file must have mode 0600: {absolute} "
            f"(mode {permissions:04o})"
        )
    return _loads_json(raw, str(absolute))


def main(argv: Sequence[str] | None = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)
    try:
        scenario = (
            _read_private_scenario_file(args.scenario_file)
            if args.scenario_file is not None
            else _loads_json(args.scenario_json, "--scenario-json")
        )
        result = get_twin_context(
            args.pack,
            mode=args.mode,
            scenario=scenario,
            max_context_bytes=args.max_context_bytes,
            request_at=args.at,
        )
    except (OSError, RetrievalError, ValueError) as exc:
        print(f"Choiceprint retrieval: {exc}", file=sys.stderr)
        return 2
    print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
