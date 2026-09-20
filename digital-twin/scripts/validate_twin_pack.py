#!/usr/bin/env python3
"""Validate a Choiceprint Twin Pack before it is used or shared."""

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
from dataclasses import dataclass, field
from datetime import date, datetime
from pathlib import Path
from typing import Any, Iterable, Sequence

import yaml
from jsonschema import Draft202012Validator


REQUIRED_PATHS = (
    "manifest.json",
    "build-metadata.json",
    "profile/overview.yaml",
    "profile/claims.jsonl",
    "profile/decision-policies.yaml",
    "profile/decision-cases.jsonl",
    "profile/counterexamples.jsonl",
    "profile/current-state.yaml",
    "profile/legacy-dimensions.yaml",
    "evidence/sources.jsonl",
    "evidence/conflicts.jsonl",
    "evidence/consent.yaml",
    "safety/boundaries.yaml",
    "evals/development.jsonl",
    "evals/holdout-private.jsonl",
)

ADAPTER_REQUIRED_PATHS = (
    "adapters/chatgpt-project/PROJECT-INSTRUCTIONS.md",
    "adapters/chatgpt-project/00-READ-FIRST.md",
    "adapters/chatgpt-project/01-CORE-PROFILE.md",
    "adapters/chatgpt-project/02-DECISION-RULES.md",
    "adapters/chatgpt-project/03-DECISION-CASES.md",
    "adapters/chatgpt-project/04-COUNTEREXAMPLES.md",
    "adapters/chatgpt-project/05-CURRENT-CONTEXT.md",
    "adapters/chatgpt-project/06-BOUNDARIES.md",
    "adapters/chatgpt-project/07-EVIDENCE-INDEX.md",
    "adapters/chatgpt-project/08-CONFLICTS.md",
    "adapters/chatgpt-project/09-CONSENT.md",
)

# A deployable pack is deliberately closed to arbitrary files. The canonical
# records are always required, while the ChatGPT Project adapter is optional
# and, when present, is limited to its exact generated file set.
CANONICAL_FILE_PATHS = frozenset(REQUIRED_PATHS)
CHATGPT_PROJECT_ADAPTER_FILE_PATHS = frozenset(ADAPTER_REQUIRED_PATHS)
ALLOWED_FILE_PATHS = CANONICAL_FILE_PATHS | CHATGPT_PROJECT_ADAPTER_FILE_PATHS


def _registry_dimension_id(value: Any) -> str:
    """Normalize a dimension key for comparison with the sensitive registry."""

    return re.sub(r"[^a-z0-9]+", "_", str(value).strip().casefold()).strip("_")


SCHEMA_PATH = Path(__file__).resolve().parents[1] / "schema" / "choiceprint.schema.json"
SCHEMA = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
SCHEMA_VALIDATOR = Draft202012Validator(SCHEMA)
SENSITIVE_DIMENSIONS_PATH = (
    Path(__file__).resolve().parents[2]
    / "matraix/personal-persona/sensitive-dimensions.json"
)
SENSITIVE_DIMENSION_IDS = frozenset(
    json.loads(SENSITIVE_DIMENSIONS_PATH.read_text(encoding="utf-8"))["dimension_ids"]
)
CANONICAL_SENSITIVE_DIMENSION_IDS = frozenset(
    _registry_dimension_id(identifier) for identifier in SENSITIVE_DIMENSION_IDS
)
SCHEMA_KEYS_BY_PATH = {
    "manifest.json": "manifest",
    "build-metadata.json": "build_metadata",
    "profile/overview.yaml": "profile_overview",
    "profile/claims.jsonl": "claim",
    "profile/decision-policies.yaml": "decision_policy",
    "profile/decision-cases.jsonl": "decision_case",
    "profile/counterexamples.jsonl": "counterexample",
    "profile/current-state.yaml": "current_state",
    "profile/legacy-dimensions.yaml": "legacy_dimensions",
    "evidence/sources.jsonl": "source",
    "evidence/conflicts.jsonl": "conflict",
    "evidence/consent.yaml": "consent",
    "safety/boundaries.yaml": "boundaries",
}

JSONL_COLLECTIONS = {
    "profile/claims.jsonl": ("claims", ("id",)),
    "profile/decision-cases.jsonl": ("cases", ("id",)),
    "evidence/sources.jsonl": ("sources", ("id",)),
}

YAML_PATHS = (
    "profile/overview.yaml",
    "profile/decision-policies.yaml",
    "profile/current-state.yaml",
    "profile/legacy-dimensions.yaml",
    "evidence/consent.yaml",
    "safety/boundaries.yaml",
)

SOURCE_REFERENCE_KEYS = {
    "source_id",
    "source_ids",
    "source_ref",
    "source_refs",
    "evidence_id",
    "evidence_ids",
    "evidence_ref",
    "evidence_refs",
    "counterevidence_ref",
    "counterevidence_refs",
    "parent_source_ref",
}
CLAIM_REFERENCE_KEYS = {"claim_id", "claim_ids", "claim_ref", "claim_refs"}
POLICY_REFERENCE_KEYS = {"policy_id", "policy_ids", "policy_ref", "policy_refs"}
CASE_REFERENCE_KEYS = {"case_id", "case_ids", "case_ref", "case_refs"}
STRICT_SOURCE_REFERENCE_KEYS = {
    "source_id",
    "source_ids",
    "source_ref",
    "source_refs",
    "parent_source_ref",
}

EVALUATION_PATH_MARKERS = {
    "answer-key",
    "answers",
    "eval-answers",
    "evaluation-answers",
    "gold-answers",
    "ground-truth",
    "held-out",
    "heldout",
    "holdout",
    "reference-answers",
}
EVALUATION_ANSWER_KEYS = {
    "answer_key",
    "correct_answer",
    "expected_answer",
    "gold_answer",
    "ground_truth",
    "reference_answer",
}

OPTIONAL_JSONL_COLLECTIONS = {
    "profile/counterexamples.jsonl": ("counterexample", ("id",)),
    "evidence/conflicts.jsonl": ("conflict", ("id",)),
}

SECRET_PATTERNS = (
    (
        "private key",
        re.compile(
            r"-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----"
        ),
    ),
    ("OpenAI API key", re.compile(r"\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b")),
    ("AWS access key", re.compile(r"\bAKIA[0-9A-Z]{16}\b")),
    ("GitHub token", re.compile(r"\bgh[pousr]_[A-Za-z0-9]{30,}\b")),
    ("GitHub token", re.compile(r"\bgithub_pat_[A-Za-z0-9_]{20,}\b")),
    ("Slack token", re.compile(r"\bxox[baprs]-[A-Za-z0-9-]{20,}\b")),
    ("Google API key", re.compile(r"\bAIza[0-9A-Za-z_-]{30,}\b")),
)

GENERIC_SECRET_ASSIGNMENT = re.compile(
    r'''(?ix)
    ["']?
    (api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|
       secret[_-]?key|password)
    ["']?\s*[:=]\s*["']?
    ([^\s,"'}`]{16,})
    ''',
)

TEMPORAL_KEYS = {
    "as_of",
    "authorized_at",
    "built_at",
    "captured_at",
    "created_at",
    "effective_from",
    "effective_to",
    "expires_at",
    "observed_at",
    "prepared_at",
    "recorded_at",
    "reviewed_at",
    "updated_at",
}

SENSITIVITY_VALUES = frozenset({"public", "private", "sensitive"})
SUPPORTED_MODES = frozenset(
    {"predict-choice", "advise-person", "write-in-style", "draft-action"}
)
VALIDATION_EVENT_SCOPE = "forced_choice_prediction/1"
SHA256_HEX = re.compile(r"^[a-f0-9]{64}$")
COVERAGE_DOMAIN_ID = re.compile(r"^[a-z0-9]+(?:[_-][a-z0-9]+)*$")
COVERAGE_DOMAIN_MAX_LENGTH = 64
REVOCATION_REASON_CODES = frozenset(
    {
        "evidence_no_longer_reliable",
        "evaluation_invalidated",
        "owner_withdrew_validation",
        "safety_or_privacy_restriction",
        "scope_definition_changed",
    }
)
PERSON_GROUNDED_EVIDENCE_TYPES = frozenset(
    {
        "direct_self_report",
        "direct_statement",
        "observed_behavior",
        "derived_summary",
    }
)


class _StrictSafeLoader(yaml.SafeLoader):
    """Safe YAML loader that rejects duplicate mapping keys."""


def _construct_unique_mapping(
    loader: _StrictSafeLoader,
    node: yaml.nodes.MappingNode,
    deep: bool = False,
) -> dict[Any, Any]:
    loader.flatten_mapping(node)
    mapping: dict[Any, Any] = {}
    for key_node, value_node in node.value:
        key = loader.construct_object(key_node, deep=deep)
        try:
            duplicate = key in mapping
        except TypeError as exc:
            raise yaml.constructor.ConstructorError(
                None,
                None,
                "YAML mapping keys must be scalar values",
                key_node.start_mark,
            ) from exc
        if duplicate:
            raise yaml.constructor.ConstructorError(
                None,
                None,
                f"duplicate YAML mapping key: {key!r}",
                key_node.start_mark,
            )
        mapping[key] = loader.construct_object(value_node, deep=deep)
    return mapping


_StrictSafeLoader.add_constructor(
    yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG,
    _construct_unique_mapping,
)


@dataclass
class ValidationResult:
    """The complete result of validating one pack."""

    errors: list[str] = field(default_factory=list)
    counts: dict[str, int] = field(
        default_factory=lambda: {
            "claims": 0,
            "policies": 0,
            "cases": 0,
            "sources": 0,
            "files": 0,
        }
    )

    @property
    def ok(self) -> bool:
        return not self.errors

    def add_error(self, message: str) -> None:
        if message not in self.errors:
            self.errors.append(message)


def _validate_schema_value(
    value: Any,
    schema_key: str,
    path: str,
    result: ValidationResult,
    *,
    record_number: int | None = None,
) -> None:
    label = path if record_number is None else f"{path} record {record_number}"
    errors = sorted(
        SCHEMA_VALIDATOR.iter_errors({schema_key: value}),
        key=lambda error: [str(part) for part in error.absolute_path],
    )
    for error in errors:
        location = ".".join(str(part) for part in list(error.absolute_path)[1:])
        suffix = f" at {location}" if location else ""
        result.add_error(f"schema violation in {label}{suffix}: {error.message}")


def _relative(path: Path, root: Path) -> str:
    try:
        return path.relative_to(root).as_posix()
    except ValueError:
        return path.as_posix()


def _load_text(path: Path, root: Path, result: ValidationResult) -> str | None:
    try:
        return path.read_text(encoding="utf-8")
    except (OSError, UnicodeError) as exc:
        result.add_error(f"cannot read {_relative(path, root)} as UTF-8: {exc}")
        return None


def _unique_json_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    document: dict[str, Any] = {}
    for key, value in pairs:
        if key in document:
            raise ValueError(f"duplicate JSON object key: {key!r}")
        document[key] = value
    return document


def _reject_json_constant(value: str) -> Any:
    raise ValueError(f"non-finite JSON number is not allowed: {value}")


def _assert_acyclic_finite(
    value: Any,
    *,
    context: str,
    ancestors: set[int] | None = None,
) -> None:
    if isinstance(value, float) and not math.isfinite(value):
        raise ValueError(f"{context} contains a non-finite number")
    if not isinstance(value, (dict, list)):
        return
    active = set() if ancestors is None else set(ancestors)
    identity = id(value)
    if identity in active:
        raise ValueError(f"{context} contains a recursive alias")
    active.add(identity)
    children = value.values() if isinstance(value, dict) else value
    for child in children:
        _assert_acyclic_finite(child, context=context, ancestors=active)


def _load_json(path: Path, root: Path, result: ValidationResult) -> Any | None:
    text = _load_text(path, root, result)
    if text is None:
        return None
    try:
        return json.loads(
            text,
            object_pairs_hook=_unique_json_object,
            parse_constant=_reject_json_constant,
        )
    except (json.JSONDecodeError, ValueError) as exc:
        line = getattr(exc, "lineno", 1)
        column = getattr(exc, "colno", 1)
        message = getattr(exc, "msg", str(exc))
        result.add_error(
            f"invalid JSON in {_relative(path, root)} at line {line}, "
            f"column {column}: {message}"
        )
        return None


def _load_yaml(path: Path, root: Path, result: ValidationResult) -> Any | None:
    text = _load_text(path, root, result)
    if text is None:
        return None
    try:
        document = yaml.load(text, Loader=_StrictSafeLoader)
        _assert_acyclic_finite(
            document,
            context=_relative(path, root),
        )
        return document
    except (yaml.YAMLError, ValueError) as exc:
        result.add_error(f"invalid YAML in {_relative(path, root)}: {exc}")
        return None


def _validate_temporal_fields(
    value: Any,
    path: str,
    result: ValidationResult,
    prefix: str = "",
) -> None:
    if isinstance(value, dict):
        for key, child in value.items():
            location = f"{prefix}.{key}" if prefix else str(key)
            if key in TEMPORAL_KEYS and child is not None:
                if not isinstance(child, str) or not child.strip():
                    result.add_error(
                        f"invalid ISO date or date-time in {path} at {location}"
                    )
                else:
                    text = child.strip()
                    try:
                        if "T" in text:
                            parsed_datetime = datetime.fromisoformat(
                                text.replace("Z", "+00:00")
                            )
                            if (
                                parsed_datetime.tzinfo is None
                                or parsed_datetime.utcoffset() is None
                            ):
                                raise ValueError(
                                    "date-time must include a UTC offset or Z"
                                )
                        else:
                            date.fromisoformat(text)
                    except ValueError:
                        result.add_error(
                            f"invalid ISO date or date-time in {path} at {location}"
                        )
            _validate_temporal_fields(child, path, result, location)
    elif isinstance(value, list):
        for index, child in enumerate(value):
            location = f"{prefix}[{index}]"
            _validate_temporal_fields(child, path, result, location)


def _validate_coverage_events(
    manifest: dict[str, Any],
    build_metadata: dict[str, Any],
    result: ValidationResult,
) -> None:
    """Validate the append-only validation chain and its domain projection."""

    coverage = manifest.get("coverage")
    if not isinstance(coverage, dict):
        return
    events = coverage.get("validation_events")
    if not isinstance(events, list):
        return
    declared_value = coverage.get("declared_domains", [])
    declared_domains = (
        declared_value if isinstance(declared_value, list) else []
    )
    safe_declared_domains = {
        domain
        for domain in declared_domains
        if isinstance(domain, str)
        and len(domain) <= COVERAGE_DOMAIN_MAX_LENGTH
        and COVERAGE_DOMAIN_ID.fullmatch(domain)
    }
    if declared_domains != sorted(safe_declared_domains):
        result.add_error(
            "manifest coverage.declared_domains must be a sorted, unique list "
            "of safe coverage-domain slugs"
        )
    if events and coverage.get("status") != "development_only":
        result.add_error(
            "manifest coverage.status must remain development_only when "
            "validation_events are recorded"
        )

    seen_ids: set[str] = set()
    latest_by_domain: dict[str, dict[str, Any]] = {}
    for index, event in enumerate(events, start=1):
        label = f"manifest coverage.validation_events[{index - 1}]"
        if not isinstance(event, dict):
            continue
        event_id = event.get("event_id")
        if isinstance(event_id, str):
            if event_id in seen_ids:
                result.add_error(f"duplicate coverage validation event_id '{event_id}'")
            seen_ids.add(event_id)
        else:
            event_id = f"record-{index}"

        if event.get("scope") != VALIDATION_EVENT_SCOPE:
            result.add_error(
                f"{label} scope must be {VALIDATION_EVENT_SCOPE}"
            )
        for field in (
            "review_receipt_sha256",
            "source_build_metadata_sha256",
        ):
            digest = event.get(field)
            if not isinstance(digest, str) or not SHA256_HEX.fullmatch(digest):
                result.add_error(
                    f"{label} {field} must be a complete lowercase SHA-256 digest"
                )

        action = event.get("action")
        if action == "validate":
            digest = event.get("evaluation_evidence_sha256")
            if not isinstance(digest, str) or not SHA256_HEX.fullmatch(digest):
                result.add_error(
                    f"{label} evaluation_evidence_sha256 must be a complete "
                    "lowercase SHA-256 digest"
                )
            if "reason" in event:
                result.add_error(f"{label} validate action must not include reason")
        elif action == "revoke":
            reason_code = event.get("reason_code")
            if reason_code not in REVOCATION_REASON_CODES:
                result.add_error(f"{label} revocation reason_code is invalid")
            if "evaluation_evidence_sha256" in event:
                result.add_error(
                    f"{label} revoke action must not include "
                    "evaluation_evidence_sha256"
                )
        else:
            result.add_error(f"{label} action must be validate or revoke")

        timestamps: dict[str, datetime] = {}
        for field in ("prepared_at", "reviewed_at", "recorded_at"):
            value = event.get(field)
            try:
                if not isinstance(value, str) or "T" not in value:
                    raise ValueError
                parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
                if parsed.tzinfo is None or parsed.utcoffset() is None:
                    raise ValueError
                timestamps[field] = parsed
            except (TypeError, ValueError):
                result.add_error(
                    f"{label} {field} must be an ISO date-time with a UTC offset or Z"
                )
        if len(timestamps) == 3 and not (
            timestamps["prepared_at"]
            <= timestamps["reviewed_at"]
            <= timestamps["recorded_at"]
        ):
            result.add_error(
                f"{label} timestamps must satisfy prepared_at <= reviewed_at "
                "<= recorded_at"
            )
        _validate_not_after(
            event.get("recorded_at"),
            build_metadata.get("built_at"),
            f"{label} recorded_at",
            result,
        )
        domain = event.get("domain")
        if (
            not isinstance(domain, str)
            or len(domain) > COVERAGE_DOMAIN_MAX_LENGTH
            or not COVERAGE_DOMAIN_ID.fullmatch(domain)
        ):
            result.add_error(f"{label} domain must be a safe coverage-domain slug")
            continue
        if domain not in safe_declared_domains:
            result.add_error(
                f"{label} domain '{domain}' is not in coverage.declared_domains"
            )
        previous = latest_by_domain.get(domain)
        if previous is not None and "prepared_at" in timestamps:
            previous_recorded_at = previous.get("recorded_at")
            try:
                previous_recorded = datetime.fromisoformat(
                    str(previous_recorded_at).replace("Z", "+00:00")
                )
                if (
                    previous_recorded.tzinfo is None
                    or previous_recorded.utcoffset() is None
                ):
                    previous_recorded = None
            except (TypeError, ValueError):
                previous_recorded = None
            if (
                previous_recorded is not None
                and timestamps["prepared_at"] < previous_recorded
            ):
                result.add_error(
                    f"{label} timestamps must not predate the prior event for "
                    f"domain '{domain}'"
                )
        expected_supersedes = previous.get("event_id") if previous else None
        if event.get("supersedes_event_id") != expected_supersedes:
            result.add_error(
                f"{label} must immediately supersede {expected_supersedes!r} "
                f"for domain '{domain}'"
            )
        latest_by_domain[domain] = event

    expected_domains = sorted(
        domain
        for domain, event in latest_by_domain.items()
        if event.get("action") == "validate"
    )
    if coverage.get("validated_domains") != expected_domains:
        result.add_error(
            "manifest coverage.validated_domains must be the exact sorted "
            "projection of the latest validation event for each domain"
        )


def _load_jsonl(path: Path, root: Path, result: ValidationResult) -> list[dict[str, Any]]:
    text = _load_text(path, root, result)
    if text is None:
        return []

    records: list[dict[str, Any]] = []
    for line_number, raw_line in enumerate(text.splitlines(), start=1):
        line = raw_line.strip()
        if not line:
            continue
        try:
            record = json.loads(
                line,
                object_pairs_hook=_unique_json_object,
                parse_constant=_reject_json_constant,
            )
        except (json.JSONDecodeError, ValueError) as exc:
            column = getattr(exc, "colno", 1)
            message = getattr(exc, "msg", str(exc))
            result.add_error(
                f"invalid JSONL in {_relative(path, root)} at line {line_number}, "
                f"column {column}: {message}"
            )
            continue
        if not isinstance(record, dict):
            result.add_error(
                f"{_relative(path, root)} line {line_number} must be a JSON object"
            )
            continue
        records.append(record)
    return records


def _identifier(record: dict[str, Any], keys: Sequence[str]) -> str | None:
    for key in keys:
        value = record.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def _source_lineage_authorship(
    source_id: str,
    source_by_id: dict[str, dict[str, Any]],
    seen: set[str] | None = None,
) -> str | None:
    visited = set() if seen is None else set(seen)
    if source_id in visited:
        return None
    visited.add(source_id)
    source = source_by_id.get(source_id)
    if source is None:
        return None
    authorship = source.get("authorship")
    if authorship in {"person", "mixed"}:
        return str(authorship)
    if authorship != "assistant":
        return None
    parent = source.get("parent_source_ref")
    if not isinstance(parent, str) or not parent:
        return None
    return _source_lineage_authorship(parent, source_by_id, visited)


def _case_person_provenance(
    case: dict[str, Any],
    source_by_id: dict[str, dict[str, Any]],
) -> str | None:
    references = case.get("source_refs")
    if not isinstance(references, list):
        return None
    provenances = {
        provenance
        for reference in references
        if isinstance(reference, str)
        for provenance in [_source_lineage_authorship(reference, source_by_id)]
        if provenance is not None
    }
    if "person" in provenances:
        return "person"
    if "mixed" in provenances:
        return "mixed"
    return None


def _normalized_string_set(value: Any) -> set[str]:
    if not isinstance(value, list):
        return set()
    return {
        " ".join(item.split()).casefold()
        for item in value
        if isinstance(item, str) and item.strip()
    }


def _maximum_sensitivity(values: Iterable[Any]) -> str:
    rank = {"public": 0, "private": 1, "sensitive": 2}
    maximum = "public"

    def visit(value: Any) -> None:
        nonlocal maximum
        if isinstance(value, dict):
            sensitivity = value.get("sensitivity")
            if sensitivity in rank and rank[str(sensitivity)] > rank[maximum]:
                maximum = str(sensitivity)
            for child in value.values():
                visit(child)
        elif isinstance(value, list):
            for child in value:
                visit(child)

    for value in values:
        visit(value)
    return maximum


def _stable_legacy_dimension_id(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = re.sub(r"[^A-Za-z0-9._:-]+", "_", value.strip())
    normalized = normalized.strip("_.:-")
    return normalized or None


def _validate_legacy_dimensions_projection(
    document: Any,
    claims: Sequence[dict[str, Any]],
    result: ValidationResult,
) -> None:
    """Require the compatibility layer to match runtime-safe legacy claims."""

    if not isinstance(document, dict):
        return
    dimensions = document.get("dimensions")
    if not isinstance(dimensions, dict):
        return

    expected: dict[str, Any] = {}
    for index, claim in enumerate(claims, start=1):
        predicate = claim.get("predicate")
        if not isinstance(predicate, str) or not predicate.startswith(
            "legacy_dimension."
        ):
            continue
        dimension_id = predicate.removeprefix("legacy_dimension.")
        if not dimension_id:
            continue
        eligible = (
            claim.get("status") in {"active", "provisional"}
            and claim.get("sensitivity") in {"public", "private"}
            and claim.get("runtime_included") is True
            and claim.get("value") is not None
        )
        if not eligible:
            continue
        if _registry_dimension_id(dimension_id) in CANONICAL_SENSITIVE_DIMENSION_IDS:
            result.add_error(
                "registry-sensitive legacy claim cannot populate the compatibility "
                f"layer in profile/claims.jsonl record {index}"
            )
            continue
        if dimension_id in expected:
            result.add_error(
                "multiple eligible canonical claims map to legacy dimension "
                f"'{dimension_id}'"
            )
            continue
        expected[dimension_id] = claim.get("value")

    actual: dict[str, tuple[str, Any]] = {}
    for raw_identifier, value in dimensions.items():
        dimension_id = _stable_legacy_dimension_id(raw_identifier)
        if dimension_id is None:
            result.add_error(
                "profile/legacy-dimensions.yaml contains an invalid dimension ID"
            )
            continue
        if _registry_dimension_id(dimension_id) in CANONICAL_SENSITIVE_DIMENSION_IDS:
            result.add_error(
                "profile/legacy-dimensions.yaml contains registry-sensitive "
                f"dimension '{raw_identifier}'"
            )
        if dimension_id in actual:
            result.add_error(
                "profile/legacy-dimensions.yaml contains duplicate normalized "
                f"dimension ID '{dimension_id}'"
            )
            continue
        actual[dimension_id] = (raw_identifier, value)

    for dimension_id in sorted(set(actual) - set(expected)):
        result.add_error(
            "profile/legacy-dimensions.yaml contains dimension "
            f"'{actual[dimension_id][0]}' without an eligible canonical claim"
        )
    for dimension_id in sorted(set(expected) - set(actual)):
        result.add_error(
            "profile/legacy-dimensions.yaml is missing eligible canonical dimension "
            f"'{dimension_id}'"
        )
    for dimension_id in sorted(set(actual) & set(expected)):
        actual_value = actual[dimension_id][1]
        expected_value = expected[dimension_id]
        if (
            type(actual_value) is not type(expected_value)
            or actual_value != expected_value
        ):
            result.add_error(
                "profile/legacy-dimensions.yaml value does not match the eligible "
                f"canonical claim for dimension '{dimension_id}'"
            )


def _validate_policy_overlaps(
    consent: dict[str, Any],
    boundaries: dict[str, Any],
    result: ValidationResult,
) -> None:
    consent_overlap = _normalized_string_set(consent.get("allowed_uses")) & (
        _normalized_string_set(consent.get("prohibited_uses"))
    )
    if consent_overlap:
        result.add_error(
            "evidence/consent.yaml allowed_uses and prohibited_uses overlap: "
            + ", ".join(sorted(consent_overlap))
        )

    boundary_sets = {
        key: _normalized_string_set(boundaries.get(key))
        for key in ("allowed", "ask_before", "never")
    }
    for left, right in (
        ("allowed", "ask_before"),
        ("allowed", "never"),
        ("ask_before", "never"),
    ):
        overlap = boundary_sets[left] & boundary_sets[right]
        if overlap:
            result.add_error(
                f"safety/boundaries.yaml {left} and {right} overlap: "
                + ", ".join(sorted(overlap))
            )


def _temporal_value_is_after(value: Any, reference: Any) -> bool:
    if not isinstance(value, str) or not isinstance(reference, str):
        return False
    if "T" in value:
        candidate = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if "T" in reference:
            boundary = datetime.fromisoformat(reference.replace("Z", "+00:00"))
        else:
            boundary = datetime.fromisoformat(reference + "T23:59:59.999999+00:00")
        return candidate > boundary
    candidate_date = date.fromisoformat(value)
    boundary_date = (
        datetime.fromisoformat(reference.replace("Z", "+00:00")).date()
        if "T" in reference
        else date.fromisoformat(reference)
    )
    return candidate_date > boundary_date


def _validate_not_after(
    value: Any,
    reference: Any,
    label: str,
    result: ValidationResult,
) -> None:
    if value is None or reference is None:
        return
    try:
        is_after = _temporal_value_is_after(value, reference)
    except (TypeError, ValueError):
        return
    if is_after:
        result.add_error(f"{label} must not be later than the pack build time")


def _validate_record_ids(
    records: Sequence[dict[str, Any]],
    keys: Sequence[str],
    path: str,
    label: str,
    result: ValidationResult,
) -> set[str]:
    identifiers: set[str] = set()
    for index, record in enumerate(records, start=1):
        identifier = _identifier(record, keys)
        if identifier is None:
            result.add_error(
                f"{path} record {index} is missing a non-empty identifier "
                f"({', '.join(keys)})"
            )
            continue
        if identifier in identifiers:
            result.add_error(f"duplicate {label} ID '{identifier}' in {path}")
        identifiers.add(identifier)
    return identifiers


def _policy_records(document: Any) -> list[dict[str, Any]]:
    if isinstance(document, list):
        return [item for item in document if isinstance(item, dict)]
    if not isinstance(document, dict):
        return []
    for key in ("policies", "decision_policies", "decision-policies"):
        value = document.get(key)
        if isinstance(value, list):
            return [item for item in value if isinstance(item, dict)]
    return []


def _reference_values(value: Any) -> Iterable[str]:
    if isinstance(value, str):
        if value.strip():
            yield value.strip()
    elif isinstance(value, list):
        for item in value:
            yield from _reference_values(item)
    elif isinstance(value, dict):
        for key in ("id", "ref", "source_id", "claim_id", "policy_id"):
            if key in value:
                yield from _reference_values(value[key])


def _collect_references(value: Any, keys: set[str]) -> set[str]:
    references: set[str] = set()
    if isinstance(value, dict):
        for key, child in value.items():
            if key in keys:
                references.update(_reference_values(child))
            else:
                references.update(_collect_references(child, keys))
    elif isinstance(value, list):
        for child in value:
            references.update(_collect_references(child, keys))
    return references


def _validate_references(
    records: Sequence[dict[str, Any]],
    reference_keys: set[str],
    known_ids: set[str],
    reference_label: str,
    path: str,
    result: ValidationResult,
) -> None:
    for index, record in enumerate(records, start=1):
        for reference in sorted(_collect_references(record, reference_keys)):
            if reference not in known_ids:
                result.add_error(
                    f"unknown {reference_label} reference '{reference}' in "
                    f"{path} record {index}"
                )


def _validate_runtime_adapter_references(
    root: Path,
    *,
    claims: Sequence[dict[str, Any]],
    policies: Sequence[dict[str, Any]],
    cases: Sequence[dict[str, Any]],
    counterexamples: Sequence[dict[str, Any]],
    conflicts: Sequence[dict[str, Any]],
    result: ValidationResult,
) -> None:
    """Ensure every rendered cross-record reference stays inside the safe adapter."""
    collections = {
        "claim": (
            claims,
            "adapters/chatgpt-project/01-CORE-PROFILE.md",
            "line",
        ),
        "policy": (
            policies,
            "adapters/chatgpt-project/02-DECISION-RULES.md",
            "line",
        ),
        "case": (
            cases,
            "adapters/chatgpt-project/03-DECISION-CASES.md",
            "heading",
        ),
        "counterexample": (
            counterexamples,
            "adapters/chatgpt-project/04-COUNTEREXAMPLES.md",
            "line",
        ),
        "conflict": (
            conflicts,
            "adapters/chatgpt-project/08-CONFLICTS.md",
            "line",
        ),
    }
    exported: dict[str, dict[str, dict[str, Any]]] = {}
    for label, (records, relative_path, marker_kind) in collections.items():
        text = _load_text(root / relative_path, root, result)
        if text is None:
            exported[label] = {}
            continue
        selected: dict[str, dict[str, Any]] = {}
        for record in records:
            identifier = record.get("id")
            if not isinstance(identifier, str):
                continue
            marker = (
                f"## `{identifier}`"
                if marker_kind == "heading"
                else f"`{identifier}` -"
            )
            if marker in text:
                selected[identifier] = record
                if record.get("sensitivity") not in {"public", "private"} or record.get(
                    "runtime_included"
                ) is False:
                    result.add_error(
                        f"runtime adapter exports non-runtime-safe {label} "
                        f"'{identifier}'"
                    )
                if label == "claim" and (
                    record.get("status") not in {"active", "provisional"}
                    or record.get("runtime_included") is not True
                ):
                    result.add_error(
                        f"runtime adapter exports non-runtime-safe claim '{identifier}'"
                    )
        exported[label] = selected

    safe_claim_ids = {
        identifier
        for identifier, record in exported["claim"].items()
        if record.get("sensitivity") in {"public", "private"}
        and record.get("status") in {"active", "provisional"}
        and record.get("runtime_included") is True
    }
    safe_policies = {
        identifier: record
        for identifier, record in exported["policy"].items()
        if record.get("sensitivity") in {"public", "private"}
        and record.get("runtime_included") is not False
    }
    safe_cases = {
        identifier: record
        for identifier, record in exported["case"].items()
        if record.get("sensitivity") in {"public", "private"}
        and record.get("runtime_included") is not False
    }

    def references_resolve(
        record: dict[str, Any], policy_ids: set[str], case_ids: set[str]
    ) -> bool:
        return (
            _collect_references(record, CLAIM_REFERENCE_KEYS).issubset(
                safe_claim_ids
            )
            and _collect_references(record, POLICY_REFERENCE_KEYS).issubset(
                policy_ids
            )
            and _collect_references(record, CASE_REFERENCE_KEYS).issubset(case_ids)
        )

    while True:
        policy_ids = set(safe_policies)
        case_ids = set(safe_cases)
        next_policies = {
            identifier: record
            for identifier, record in safe_policies.items()
            if references_resolve(record, policy_ids, case_ids)
        }
        next_cases = {
            identifier: record
            for identifier, record in safe_cases.items()
            if references_resolve(record, policy_ids, case_ids)
        }
        if set(next_policies) == policy_ids and set(next_cases) == case_ids:
            break
        safe_policies = next_policies
        safe_cases = next_cases

    safe_policy_ids = set(safe_policies)
    safe_case_ids = set(safe_cases)
    allowed_by_type = (
        (CLAIM_REFERENCE_KEYS, safe_claim_ids, "claim"),
        (POLICY_REFERENCE_KEYS, safe_policy_ids, "policy"),
        (CASE_REFERENCE_KEYS, safe_case_ids, "case"),
    )
    for label in ("policy", "case", "counterexample", "conflict"):
        for identifier, record in exported[label].items():
            for reference_keys, allowed_ids, reference_label in allowed_by_type:
                for reference in sorted(_collect_references(record, reference_keys)):
                    if reference not in allowed_ids:
                        result.add_error(
                            f"runtime adapter {label} '{identifier}' references "
                            f"non-runtime-safe {reference_label} '{reference}'"
                        )
            if label == "counterexample":
                target = record.get("claim_or_policy_id")
                if target not in safe_claim_ids | safe_policy_ids:
                    result.add_error(
                        f"runtime adapter counterexample '{identifier}' targets "
                        f"non-runtime-safe claim or policy '{target}'"
                    )


def _validate_global_ids(
    collections: Sequence[tuple[str, set[str]]], result: ValidationResult
) -> None:
    owners: dict[str, str] = {}
    for path, identifiers in collections:
        for identifier in sorted(identifiers):
            previous_path = owners.get(identifier)
            if previous_path is not None and previous_path != path:
                result.add_error(
                    f"ID '{identifier}' is used in both {previous_path} and {path}"
                )
            else:
                owners[identifier] = path


def _choice_tokens(value: Any) -> set[str]:
    if isinstance(value, dict):
        return {
            str(value[key])
            for key in ("id", "label")
            if value.get(key) not in (None, "")
        }
    if value not in (None, ""):
        return {str(value)}
    return set()


def _option_matches_choice(option: Any, choice: Any) -> bool:
    if isinstance(choice, dict):
        supplied = {
            key: str(choice[key])
            for key in ("id", "label")
            if choice.get(key) not in (None, "")
        }
        if not supplied:
            return False
        if isinstance(option, dict):
            return all(
                option.get(key) not in (None, "")
                and str(option.get(key)) == expected
                for key, expected in supplied.items()
            )
        return len(supplied) == 1 and str(option) in supplied.values()
    if choice in (None, ""):
        return False
    token = str(choice)
    if isinstance(option, dict):
        return token in {
            str(option[key])
            for key in ("id", "label")
            if option.get(key) not in (None, "")
        }
    return token == str(option)


def _resolve_option_indices(options: Sequence[Any], choice: Any) -> set[int]:
    return {
        index
        for index, option in enumerate(options)
        if _option_matches_choice(option, choice)
    }


def _validate_case_options(
    cases: Sequence[dict[str, Any]], result: ValidationResult
) -> None:
    for index, case in enumerate(cases, start=1):
        options = case.get("options")
        if not isinstance(options, list) or not options:
            continue
        token_owner: dict[str, int] = {}
        for option_index, option in enumerate(options):
            for token in _choice_tokens(option):
                previous = token_owner.get(token)
                if previous is not None and previous != option_index:
                    result.add_error(
                        "options contain a duplicate or ambiguous ID or label for "
                        f"profile/decision-cases.jsonl record {index}: {token!r}"
                    )
                token_owner[token] = option_index
        selected_option_id = case.get("selected_option_id")
        selected_matches = (
            _resolve_option_indices(options, selected_option_id)
            if selected_option_id not in (None, "")
            else set()
        )
        if selected_option_id not in (None, "") and len(selected_matches) != 1:
            result.add_error(
                f"selected_option_id '{selected_option_id}' does not resolve to "
                "exactly one option for profile/decision-cases.jsonl record "
                f"{index}"
            )
        choice_matches = _resolve_option_indices(options, case.get("choice"))
        if len(choice_matches) != 1:
            result.add_error(
                "choice does not resolve to exactly one option for "
                f"profile/decision-cases.jsonl record {index}"
            )
        if selected_matches and choice_matches and selected_matches != choice_matches:
            result.add_error(
                "selected_option_id and choice resolve to different options for "
                f"profile/decision-cases.jsonl record {index}"
            )
        ranking = case.get("ranking")
        if isinstance(ranking, list):
            ranked_indices: list[int] = []
            for ranked_choice in ranking:
                matches = _resolve_option_indices(options, ranked_choice)
                if len(matches) != 1:
                    result.add_error(
                        "ranking contains a value that does not resolve to exactly "
                        "one option for "
                        f"profile/decision-cases.jsonl record {index}"
                    )
                else:
                    ranked_indices.append(next(iter(matches)))
            if len(ranked_indices) != len(set(ranked_indices)):
                result.add_error(
                    "ranking contains duplicate options for "
                    f"profile/decision-cases.jsonl record {index}"
                )


def _looks_like_placeholder(value: str) -> bool:
    normalized = value.strip().lower()
    return (
        normalized.startswith(("${", "{{", "<"))
        or any(
            marker in normalized
            for marker in (
                "changeme",
                "dummy",
                "example",
                "placeholder",
                "redacted",
                "replace-me",
                "replace_me",
                "test-only",
            )
        )
    )


def _scan_for_secrets(root: Path, result: ValidationResult) -> None:
    for path in sorted(root.rglob("*")):
        if ".git" in path.parts:
            continue
        if path.is_symlink():
            result.add_error(
                f"symlink is not allowed in a Choiceprint pack: {_relative(path, root)}"
            )
            continue
        if not path.is_file():
            continue
        try:
            if path.stat().st_size > 2_000_000:
                result.add_error(
                    f"file is too large to inspect safely: {_relative(path, root)}"
                )
                continue
            data = path.read_bytes()
        except OSError as exc:
            result.add_error(f"cannot inspect {_relative(path, root)}: {exc}")
            continue
        relative_path = _relative(path, root)
        if b"\x00" in data:
            result.add_error(
                f"binary file cannot be inspected safely: {relative_path}"
            )
            continue
        try:
            text = data.decode("utf-8")
        except UnicodeDecodeError:
            result.add_error(
                f"non-UTF-8 file cannot be inspected safely: {relative_path}"
            )
            continue

        for secret_name, pattern in SECRET_PATTERNS:
            if pattern.search(text):
                result.add_error(f"possible {secret_name} found in {relative_path}")

        for match in GENERIC_SECRET_ASSIGNMENT.finditer(text):
            value = match.group(2).rstrip("'\"")
            if not _looks_like_placeholder(value):
                result.add_error(
                    f"possible secret value for '{match.group(1)}' found in {relative_path}"
                )


def _reject_git_metadata(root: Path, result: ValidationResult) -> None:
    for path in sorted(root.rglob("*")):
        relative_parts = path.relative_to(root).parts
        if ".git" in relative_parts:
            result.add_error(
                "Git metadata is not allowed in a Choiceprint pack: "
                f"{_relative(path, root)}"
            )


def _reject_special_files(root: Path, result: ValidationResult) -> None:
    for path in sorted(root.rglob("*")):
        try:
            mode = path.lstat().st_mode
        except OSError as exc:
            result.add_error(f"cannot inspect {_relative(path, root)}: {exc}")
            continue
        if stat.S_ISDIR(mode) or stat.S_ISREG(mode) or stat.S_ISLNK(mode):
            continue
        result.add_error(
            "special filesystem entry is not allowed in a Choiceprint pack: "
            f"{_relative(path, root)}"
        )


def _validate_private_permissions(
    root: Path,
    manifest: dict[str, Any],
    result: ValidationResult,
) -> None:
    """Reject group or other access to a non-example pack on POSIX systems."""

    coverage = manifest.get("coverage")
    if (
        os.name != "posix"
        or isinstance(coverage, dict)
        and coverage.get("status") == "example_only"
    ):
        return

    for path in [root, *sorted(root.rglob("*"))]:
        try:
            mode = path.lstat().st_mode
        except OSError as exc:
            result.add_error(f"cannot inspect {_relative(path, root)}: {exc}")
            continue
        if not (stat.S_ISDIR(mode) or stat.S_ISREG(mode)):
            continue
        permissions = stat.S_IMODE(mode)
        if permissions & (stat.S_IRWXG | stat.S_IRWXO):
            relative_path = "." if path == root else _relative(path, root)
            result.add_error(
                "non-example Choiceprint path grants group or other permissions: "
                f"{relative_path} has mode {permissions:04o}"
            )


def _reject_unexpected_files(root: Path, result: ValidationResult) -> None:
    """Reject files outside the closed canonical and optional adapter sets."""

    for path in sorted(root.rglob("*")):
        try:
            mode = path.lstat().st_mode
        except OSError:
            # The filesystem inspection pass reports the underlying error.
            continue
        if not (stat.S_ISREG(mode) or stat.S_ISLNK(mode)):
            continue
        relative_path = path.relative_to(root).as_posix()
        if relative_path not in ALLOWED_FILE_PATHS:
            result.add_error(
                "unexpected file is not allowed in a Choiceprint pack: "
                f"{relative_path}"
            )


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _verify_file_integrity(
    root: Path, build_metadata: dict[str, Any], result: ValidationResult
) -> None:
    expected = build_metadata.get("file_sha256")
    if not isinstance(expected, dict):
        return
    actual_paths = {
        path.relative_to(root).as_posix(): path
        for path in root.rglob("*")
        if path.is_file()
        and not path.is_symlink()
        and path.relative_to(root).as_posix() != "build-metadata.json"
        and ".git" not in path.parts
    }
    expected_paths = {str(path) for path in expected}
    for relative_path in sorted(expected_paths - set(actual_paths)):
        result.add_error(f"integrity record points to a missing file: {relative_path}")
    for relative_path in sorted(set(actual_paths) - expected_paths):
        result.add_error(f"file is not covered by integrity metadata: {relative_path}")
    for relative_path in sorted(expected_paths & set(actual_paths)):
        expected_digest = expected.get(relative_path)
        if not isinstance(expected_digest, str):
            continue
        try:
            actual_digest = _sha256(actual_paths[relative_path])
        except OSError as exc:
            result.add_error(f"cannot hash {relative_path}: {exc}")
            continue
        if actual_digest != expected_digest:
            result.add_error(f"file digest mismatch: {relative_path}")


def _check_forbidden_evaluation_paths(root: Path, result: ValidationResult) -> None:
    allowed_placeholder = "evals/holdout-private.jsonl"
    for path in sorted(root.rglob("*")):
        if not path.is_file() or path.is_symlink():
            continue
        relative_path = path.relative_to(root).as_posix()
        if relative_path == allowed_placeholder:
            continue
        normalized = relative_path.lower().replace("_", "-")
        if "holdout" in normalized or "held-out" in normalized or "heldout" in normalized:
            result.add_error(
                f"holdout material must stay outside the deployable pack: {relative_path}"
            )


def _load_adapter_renderer():
    existing = sys.modules.get("build_choiceprint")
    if existing is not None and hasattr(existing, "_adapter_files"):
        return existing._adapter_files
    module_name = "_choiceprint_builder_for_validation"
    existing = sys.modules.get(module_name)
    if existing is not None and hasattr(existing, "_adapter_files"):
        return existing._adapter_files
    builder_path = Path(__file__).resolve().parent / "build_choiceprint.py"
    spec = importlib.util.spec_from_file_location(module_name, builder_path)
    if spec is None or spec.loader is None:
        raise RuntimeError("cannot load the canonical ChatGPT adapter renderer")
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module._adapter_files


def _validate_adapter_matches_canonical(
    root: Path,
    *,
    manifest: dict[str, Any],
    build_metadata: dict[str, Any],
    profile: dict[str, Any],
    claims: Sequence[dict[str, Any]],
    policies: Sequence[dict[str, Any]],
    cases: Sequence[dict[str, Any]],
    counterexamples: Sequence[dict[str, Any]],
    conflicts: Sequence[dict[str, Any]],
    current_state: dict[str, Any],
    boundaries: dict[str, Any],
    sources: Sequence[dict[str, Any]],
    consent: dict[str, Any],
    result: ValidationResult,
) -> set[str] | None:
    adapter_root = root / "adapters/chatgpt-project"
    if not adapter_root.is_dir():
        return set()
    runtime_case_ids: set[str] = set()
    try:
        renderer = _load_adapter_renderer()
        expected_files = renderer(
            str(manifest.get("display_name") or manifest.get("persona_id")),
            str(manifest.get("content_version") or "unknown"),
            profile,
            claims,
            policies,
            cases,
            counterexamples,
            conflicts,
            current_state,
            boundaries,
            sources,
            consent,
            manifest.get("coverage") or {},
            str(build_metadata.get("built_at") or manifest.get("updated_at")),
            included_case_ids=runtime_case_ids,
        )
    except Exception as exc:
        result.add_error(f"cannot regenerate ChatGPT adapter for validation: {exc}")
        return None
    for filename, expected_text in expected_files.items():
        path = adapter_root / filename
        actual_text = _load_text(path, root, result)
        if actual_text is None:
            continue
        normalized_expected = expected_text.rstrip() + "\n"
        if actual_text != normalized_expected:
            result.add_error(
                "ChatGPT adapter does not match canonical pack data: "
                f"adapters/chatgpt-project/{filename}"
            )
    return runtime_case_ids


def _contains_forbidden_answer_key(value: Any) -> bool:
    if isinstance(value, dict):
        for key, child in value.items():
            if str(key).lower().replace("-", "_") in EVALUATION_ANSWER_KEYS:
                return True
            if _contains_forbidden_answer_key(child):
                return True
    elif isinstance(value, list):
        return any(_contains_forbidden_answer_key(child) for child in value)
    return False


def _contains_holdout_role(value: Any) -> bool:
    if isinstance(value, dict):
        for key, child in value.items():
            if str(key).lower().replace("-", "_") == "dataset_role":
                if isinstance(child, str):
                    normalized_role = child.lower().replace("-", "").replace("_", "")
                    if "holdout" in normalized_role or "heldout" in normalized_role:
                        return True
            if _contains_holdout_role(child):
                return True
    elif isinstance(value, list):
        return any(_contains_holdout_role(child) for child in value)
    return False


def _check_adapter_for_evaluation_answers(root: Path, result: ValidationResult) -> None:
    adapter = root / "adapters" / "chatgpt-project"
    if not adapter.exists():
        return
    if not adapter.is_dir():
        result.add_error("adapter must be a directory when present")
        return

    for path in sorted(adapter.rglob("*")):
        if not path.is_file():
            continue
        relative_path = _relative(path, root)
        relative_to_adapter = path.relative_to(adapter)
        normalized_parts = {
            part.lower().replace("_", "-").removesuffix(path.suffix.lower())
            for part in relative_to_adapter.parts
        }
        normalized_relative_path = relative_to_adapter.as_posix().lower().replace("_", "-")
        if normalized_parts & EVALUATION_PATH_MARKERS or "holdout" in normalized_relative_path:
            result.add_error(
                f"evaluation answers must not be included in the runtime adapter: {relative_path}"
            )
            continue

        suffix = path.suffix.lower()
        document: Any | None = None
        if suffix == ".json":
            document = _load_json(path, root, result)
        elif suffix == ".jsonl":
            document = _load_jsonl(path, root, result)
        elif suffix in {".yaml", ".yml"}:
            document = _load_yaml(path, root, result)
        if document is not None and _contains_forbidden_answer_key(document):
            result.add_error(
                f"evaluation answer field found in runtime adapter file {relative_path}"
            )
        if document is not None and _contains_holdout_role(document):
            result.add_error(
                f"holdout record found in runtime adapter file {relative_path}"
            )


def validate_bundle(root: Path | str) -> ValidationResult:
    """Validate a pack directory and return all detected errors."""

    root = Path(root).expanduser().resolve()
    result = ValidationResult()
    if not root.is_dir():
        result.add_error(f"bundle path is not a directory: {root}")
        return result

    _reject_git_metadata(root, result)
    _reject_special_files(root, result)
    _reject_unexpected_files(root, result)

    missing: set[str] = set()
    for relative_path in REQUIRED_PATHS:
        path = root / relative_path
        if not path.is_file():
            result.add_error(f"missing required path: {relative_path}")
            missing.add(relative_path)
        else:
            result.counts["files"] += 1

    manifest: Any | None = None
    if "manifest.json" not in missing:
        manifest = _load_json(root / "manifest.json", root, result)
        if manifest is not None and not isinstance(manifest, dict):
            result.add_error("manifest.json must contain a JSON object")
        elif isinstance(manifest, dict):
            _validate_schema_value(manifest, "manifest", "manifest.json", result)
            _validate_temporal_fields(manifest, "manifest.json", result)
            _validate_private_permissions(root, manifest, result)
            if _contains_holdout_role(manifest):
                result.add_error("holdout record is not allowed in manifest.json")
            if _contains_forbidden_answer_key(manifest):
                result.add_error("holdout answer field is not allowed in manifest.json")

    build_metadata: Any | None = None
    if "build-metadata.json" not in missing:
        build_metadata = _load_json(root / "build-metadata.json", root, result)
        if build_metadata is not None and not isinstance(build_metadata, dict):
            result.add_error("build-metadata.json must contain a JSON object")
        elif isinstance(build_metadata, dict):
            _validate_schema_value(
                build_metadata,
                "build_metadata",
                "build-metadata.json",
                result,
            )
            _validate_temporal_fields(
                build_metadata,
                "build-metadata.json",
                result,
            )
            if _contains_holdout_role(build_metadata):
                result.add_error(
                    "holdout record is not allowed in build-metadata.json"
                )
            if _contains_forbidden_answer_key(build_metadata):
                result.add_error(
                    "holdout answer field is not allowed in build-metadata.json"
                )
            _verify_file_integrity(root, build_metadata, result)

    if isinstance(manifest, dict) and isinstance(build_metadata, dict):
        if build_metadata.get("persona_id") != manifest.get("persona_id"):
            result.add_error(
                "build-metadata.json persona_id does not match manifest.json persona_id"
            )
        _validate_coverage_events(manifest, build_metadata, result)

    records_by_path: dict[str, list[dict[str, Any]]] = {}
    ids_by_collection: dict[str, set[str]] = {}
    for relative_path, (collection, id_keys) in JSONL_COLLECTIONS.items():
        if relative_path in missing:
            continue
        records = _load_jsonl(root / relative_path, root, result)
        records_by_path[relative_path] = records
        schema_key = SCHEMA_KEYS_BY_PATH[relative_path]
        for index, record in enumerate(records, start=1):
            _validate_schema_value(
                record,
                schema_key,
                relative_path,
                result,
                record_number=index,
            )
            _validate_temporal_fields(
                record,
                f"{relative_path} record {index}",
                result,
            )
            if _contains_holdout_role(record):
                result.add_error(
                    f"holdout record is not allowed in {relative_path} record {index}"
                )
            if _contains_forbidden_answer_key(record):
                result.add_error(
                    f"holdout answer field is not allowed in {relative_path} record {index}"
                )
        result.counts[collection] = len(records)
        ids_by_collection[collection] = _validate_record_ids(
            records, id_keys, relative_path, collection[:-1], result
        )

    optional_records_by_path: dict[str, list[dict[str, Any]]] = {}
    optional_ids_by_path: dict[str, set[str]] = {}
    for relative_path, (label, id_keys) in OPTIONAL_JSONL_COLLECTIONS.items():
        path = root / relative_path
        if not path.exists():
            continue
        if not path.is_file():
            result.add_error(f"optional path must be a file: {relative_path}")
            continue
        records = _load_jsonl(path, root, result)
        optional_records_by_path[relative_path] = records
        schema_key = SCHEMA_KEYS_BY_PATH[relative_path]
        for index, record in enumerate(records, start=1):
            _validate_schema_value(
                record,
                schema_key,
                relative_path,
                result,
                record_number=index,
            )
            _validate_temporal_fields(
                record,
                f"{relative_path} record {index}",
                result,
            )
            if _contains_holdout_role(record):
                result.add_error(
                    f"holdout record is not allowed in {relative_path} record {index}"
                )
            if _contains_forbidden_answer_key(record):
                result.add_error(
                    f"holdout answer field is not allowed in {relative_path} record {index}"
                )
        optional_ids_by_path[relative_path] = _validate_record_ids(
            records, id_keys, relative_path, label, result
        )

    yaml_documents: dict[str, Any] = {}
    for relative_path in YAML_PATHS:
        if relative_path in missing:
            continue
        document = _load_yaml(root / relative_path, root, result)
        if document is None:
            continue
        if not isinstance(document, (dict, list)):
            result.add_error(f"{relative_path} must contain a YAML mapping or list")
            continue
        yaml_documents[relative_path] = document
        _validate_temporal_fields(document, relative_path, result)
        if _contains_holdout_role(document):
            result.add_error(f"holdout record is not allowed in {relative_path}")
        if _contains_forbidden_answer_key(document):
            result.add_error(f"holdout answer field is not allowed in {relative_path}")
        if relative_path != "profile/decision-policies.yaml":
            _validate_schema_value(
                document,
                SCHEMA_KEYS_BY_PATH[relative_path],
                relative_path,
                result,
            )

    policy_document = yaml_documents.get("profile/decision-policies.yaml")
    policy_records = _policy_records(policy_document)
    if policy_document is not None and not isinstance(policy_document, list):
        result.add_error("profile/decision-policies.yaml must contain a YAML list")
    elif isinstance(policy_document, list):
        for index, policy in enumerate(policy_document, start=1):
            if not isinstance(policy, dict):
                result.add_error(
                    "profile/decision-policies.yaml record "
                    f"{index} must be a YAML mapping"
                )
    result.counts["policies"] = len(policy_records)
    for index, policy in enumerate(policy_records, start=1):
        _validate_schema_value(
            policy,
            "decision_policy",
            "profile/decision-policies.yaml",
            result,
            record_number=index,
        )
    policy_ids = _validate_record_ids(
        policy_records,
        ("id", "policy_id"),
        "profile/decision-policies.yaml",
        "policy",
        result,
    )

    global_id_collections = [
        ("profile/claims.jsonl", ids_by_collection.get("claims", set())),
        ("profile/decision-cases.jsonl", ids_by_collection.get("cases", set())),
        ("evidence/sources.jsonl", ids_by_collection.get("sources", set())),
        ("profile/decision-policies.yaml", policy_ids),
    ]
    global_id_collections.extend(optional_ids_by_path.items())
    _validate_global_ids(global_id_collections, result)

    source_ids = ids_by_collection.get("sources", set())
    claim_ids = ids_by_collection.get("claims", set())
    records_to_check = (
        (
            "profile/claims.jsonl",
            records_by_path.get("profile/claims.jsonl", []),
        ),
        (
            "profile/decision-cases.jsonl",
            records_by_path.get("profile/decision-cases.jsonl", []),
        ),
        (
            "evidence/sources.jsonl",
            records_by_path.get("evidence/sources.jsonl", []),
        ),
    )
    for path, records in records_to_check:
        _validate_references(
            records,
            SOURCE_REFERENCE_KEYS,
            source_ids,
            "source",
            path,
            result,
        )
        _validate_references(
            records,
            CLAIM_REFERENCE_KEYS,
            claim_ids,
            "claim",
            path,
            result,
        )
        _validate_references(
            records,
            POLICY_REFERENCE_KEYS,
            policy_ids,
            "policy",
            path,
            result,
        )

    for path, records in optional_records_by_path.items():
        _validate_references(
            records,
            SOURCE_REFERENCE_KEYS,
            source_ids,
            "source",
            path,
            result,
        )
        _validate_references(
            records,
            CLAIM_REFERENCE_KEYS,
            claim_ids,
            "claim",
            path,
            result,
        )
        _validate_references(
            records,
            POLICY_REFERENCE_KEYS,
            policy_ids,
            "policy",
            path,
            result,
        )

    case_ids = ids_by_collection.get("cases", set())
    for index, policy in enumerate(policy_records, start=1):
        _validate_references(
            [policy],
            STRICT_SOURCE_REFERENCE_KEYS,
            source_ids,
            "source",
            "profile/decision-policies.yaml",
            result,
        )
        _validate_references(
            [policy],
            CASE_REFERENCE_KEYS,
            case_ids,
            "case",
            "profile/decision-policies.yaml",
            result,
        )
        _validate_references(
            [policy],
            CLAIM_REFERENCE_KEYS,
            claim_ids,
            "claim",
            "profile/decision-policies.yaml",
            result,
        )
        _validate_references(
            [policy],
            POLICY_REFERENCE_KEYS,
            policy_ids,
            "policy",
            "profile/decision-policies.yaml",
            result,
        )

    counterexamples = optional_records_by_path.get(
        "profile/counterexamples.jsonl", []
    )
    valid_counterexample_targets = claim_ids | policy_ids
    for index, counterexample in enumerate(counterexamples, start=1):
        target = counterexample.get("claim_or_policy_id")
        if isinstance(target, str) and target not in valid_counterexample_targets:
            result.add_error(
                f"unknown claim or policy target '{target}' in "
                f"profile/counterexamples.jsonl record {index}"
            )

    profile = yaml_documents.get("profile/overview.yaml")
    if isinstance(profile, dict):
        _validate_references(
            [profile],
            STRICT_SOURCE_REFERENCE_KEYS,
            source_ids,
            "source",
            "profile/overview.yaml",
            result,
        )
        if profile.get("sensitivity") == "sensitive" and profile.get(
            "runtime_included"
        ) is True:
            result.add_error(
                "profile/overview.yaml cannot include sensitive data in the runtime"
            )
        if isinstance(manifest, dict) and manifest.get("profile_summary") != profile.get(
            "summary"
        ):
            result.add_error(
                "manifest.json profile_summary does not match profile/overview.yaml summary"
            )

    claims = records_by_path.get("profile/claims.jsonl", [])
    for index, claim in enumerate(claims, start=1):
        predicate = claim.get("predicate")
        legacy_dimension_id = (
            predicate.removeprefix("legacy_dimension.")
            if isinstance(predicate, str)
            and predicate.startswith("legacy_dimension.")
            else None
        )
        if (
            legacy_dimension_id is not None
            and _registry_dimension_id(legacy_dimension_id)
            in CANONICAL_SENSITIVE_DIMENSION_IDS
        ) and (
            claim.get("sensitivity") != "sensitive"
            or claim.get("status") != "withheld"
            or claim.get("runtime_included") is not False
        ):
            result.add_error(
                "known sensitive legacy dimension must be withheld from runtime in "
                f"profile/claims.jsonl record {index}"
            )
        if claim.get("sensitivity") == "sensitive" and (
            claim.get("status") != "withheld"
            or claim.get("runtime_included") is not False
        ):
            result.add_error(
                "sensitive claim must be withheld from runtime in "
                f"profile/claims.jsonl record {index}"
            )
        if isinstance(build_metadata, dict):
            for field in ("observed_at", "reviewed_at"):
                _validate_not_after(
                    claim.get(field),
                    build_metadata.get("built_at"),
                    f"profile/claims.jsonl record {index} {field}",
                    result,
                )
    _validate_legacy_dimensions_projection(
        yaml_documents.get("profile/legacy-dimensions.yaml"), claims, result
    )
    if isinstance(build_metadata, dict):
        for index, policy in enumerate(policy_records, start=1):
            _validate_not_after(
                policy.get("reviewed_at"),
                build_metadata.get("built_at"),
                f"profile/decision-policies.yaml record {index} reviewed_at",
                result,
            )
        for path, records in optional_records_by_path.items():
            for index, record in enumerate(records, start=1):
                _validate_not_after(
                    record.get("observed_at"),
                    build_metadata.get("built_at"),
                    f"{path} record {index} observed_at",
                    result,
                )

    current_state = yaml_documents.get("profile/current-state.yaml")
    if isinstance(current_state, dict):
        _validate_references(
            [current_state],
            STRICT_SOURCE_REFERENCE_KEYS,
            source_ids,
            "source",
            "profile/current-state.yaml",
            result,
        )
        if (
            current_state.get("runtime_included") is True
            and current_state.get("expires_at") is None
        ):
            result.add_error(
                "profile/current-state.yaml expires_at is required when "
                "runtime_included is true"
            )
        if current_state.get("sensitivity") == "sensitive" and current_state.get(
            "runtime_included"
        ) is True:
            result.add_error(
                "profile/current-state.yaml cannot include sensitive data in the runtime"
            )
        if isinstance(build_metadata, dict):
            _validate_not_after(
                current_state.get("as_of"),
                build_metadata.get("built_at"),
                "profile/current-state.yaml as_of",
                result,
            )

    consent = yaml_documents.get("evidence/consent.yaml")
    if isinstance(consent, dict):
        _validate_references(
            [consent],
            {"allowed_sources", "authorization_source_ref"},
            source_ids,
            "source",
            "evidence/consent.yaml",
            result,
        )
        allowed_uses = consent.get("allowed_uses")
        if consent.get("owner_authorized") is True and (
            not isinstance(allowed_uses, list)
            or not any(isinstance(item, str) and item.strip() for item in allowed_uses)
        ):
            result.add_error(
                "evidence/consent.yaml must include at least one allowed use when "
                "owner_authorized is true"
            )
        allowed_sources = consent.get("allowed_sources")
        if consent.get("owner_authorized") is True and (
            not isinstance(allowed_sources, list)
            or not any(
                isinstance(item, str) and item.strip() for item in allowed_sources
            )
        ):
            result.add_error(
                "evidence/consent.yaml must include at least one allowed source "
                "when owner_authorized is true"
            )
        allowed_modes = consent.get("allowed_modes")
        if not isinstance(allowed_modes, list) or any(
            mode not in SUPPORTED_MODES for mode in allowed_modes
        ):
            result.add_error(
                "evidence/consent.yaml allowed_modes must contain only supported mode IDs"
            )
        if consent.get("owner_authorized") is True and not allowed_modes:
            result.add_error(
                "evidence/consent.yaml must include at least one allowed mode when "
                "owner_authorized is true"
            )
        if consent.get("owner_authorized") is False and consent.get(
            "authorized_at"
        ) is not None:
            result.add_error(
                "evidence/consent.yaml authorized_at must be null when "
                "owner_authorized is false"
            )
        if isinstance(build_metadata, dict):
            _validate_not_after(
                consent.get("authorized_at"),
                build_metadata.get("built_at"),
                "evidence/consent.yaml authorized_at",
                result,
            )

    boundaries = yaml_documents.get("safety/boundaries.yaml")
    if isinstance(consent, dict) and isinstance(boundaries, dict):
        _validate_policy_overlaps(consent, boundaries, result)

    cases = records_by_path.get("profile/decision-cases.jsonl", [])
    _validate_case_options(cases, result)
    sources = records_by_path.get("evidence/sources.jsonl", [])
    source_by_id = {
        str(source.get("id")): source
        for source in sources
        if isinstance(source.get("id"), str)
    }
    for index, source in enumerate(sources, start=1):
        if source.get("sensitivity") == "sensitive" and source.get(
            "runtime_excerpt_allowed"
        ) is True:
            result.add_error(
                "sensitive source cannot allow runtime excerpts in "
                f"evidence/sources.jsonl record {index}"
            )
        if isinstance(build_metadata, dict):
            _validate_not_after(
                source.get("captured_at"),
                build_metadata.get("built_at"),
                f"evidence/sources.jsonl record {index} captured_at",
                result,
            )
    provenance_by_case_id: dict[str, str] = {}
    for index, case in enumerate(cases, start=1):
        evidence_type = case.get("evidence_type")
        if (
            evidence_type is not None
            and evidence_type not in PERSON_GROUNDED_EVIDENCE_TYPES
        ):
            result.add_error(
                f"unsupported evidence_type '{evidence_type}' in "
                f"profile/decision-cases.jsonl record {index}"
            )
        if isinstance(build_metadata, dict):
            _validate_not_after(
                case.get("observed_at"),
                build_metadata.get("built_at"),
                f"profile/decision-cases.jsonl record {index} observed_at",
                result,
            )
        provenance = _case_person_provenance(case, source_by_id)
        if provenance is None:
            result.add_error(
                "decision case lacks person-grounded source provenance in "
                f"profile/decision-cases.jsonl record {index}"
            )
            continue
        case_id = case.get("id")
        if isinstance(case_id, str):
            provenance_by_case_id[case_id] = provenance

    development_evals: list[dict[str, Any]] = []
    development_path = root / "evals/development.jsonl"
    if development_path.is_file():
        development_evals = _load_jsonl(development_path, root, result)
        for index, record in enumerate(development_evals, start=1):
            _validate_schema_value(
                record,
                "development_eval",
                "evals/development.jsonl",
                result,
                record_number=index,
            )
            _validate_temporal_fields(
                record,
                f"evals/development.jsonl record {index}",
                result,
            )
            if _contains_holdout_role(record):
                result.add_error(
                    "holdout record is not allowed in evals/development.jsonl "
                    f"record {index}"
                )
            if _contains_forbidden_answer_key(record):
                result.add_error(
                    "holdout answer field is not allowed in evals/development.jsonl "
                    f"record {index}"
                )
        eval_ids = _validate_record_ids(
            development_evals,
            ("id",),
            "evals/development.jsonl",
            "development evaluation",
            result,
        )
        _validate_global_ids(
            [("evals/development.jsonl", eval_ids)],
            result,
        )
        for index, record in enumerate(development_evals, start=1):
            case_id = record.get("case_id")
            if not isinstance(case_id, str) or case_id not in case_ids:
                result.add_error(
                    f"unknown case reference '{case_id}' in "
                    f"evals/development.jsonl record {index}"
                )
                continue
            referenced_case = next(
                (
                    case
                    for case in cases
                    if str(case.get("id")) == case_id
                ),
                None,
            )
            options = referenced_case.get("options") if referenced_case else None
            expected_matches = (
                _resolve_option_indices(options, record.get("expected"))
                if isinstance(options, list)
                else set()
            )
            choice_matches = (
                _resolve_option_indices(options, referenced_case.get("choice"))
                if isinstance(options, list) and referenced_case
                else set()
            )
            if (
                len(expected_matches) != 1
                or len(choice_matches) != 1
                or expected_matches != choice_matches
            ):
                result.add_error(
                    "development evaluation expected value does not match the "
                    f"referenced case choice in evals/development.jsonl record {index}"
                )
            provenance = provenance_by_case_id.get(case_id)
            expected_source = (
                "person_answered"
                if provenance == "person"
                and referenced_case
                and referenced_case.get("evidence_type")
                in {"direct_self_report", "direct_statement"}
                else "person_observed"
            )
            if provenance is not None and record.get("source") != expected_source:
                result.add_error(
                    "development evaluation source label does not match case "
                    f"provenance in evals/development.jsonl record {index}"
                )

    holdout_path = root / "evals/holdout-private.jsonl"
    if holdout_path.is_file():
        holdout_text = _load_text(holdout_path, root, result)
        if holdout_text is not None and holdout_text.strip():
            result.add_error(
                "evals/holdout-private.jsonl must stay an empty placeholder; "
                "store real holdout answers outside the deployable pack"
            )

    if isinstance(manifest, dict):
        expected_counts = manifest.get("counts")
        if isinstance(expected_counts, dict):
            actual_counts = {
                "claims": result.counts["claims"],
                "active_claims": sum(
                    claim.get("status") == "active"
                    for claim in records_by_path.get("profile/claims.jsonl", [])
                ),
                "provisional_claims": sum(
                    claim.get("status") == "provisional"
                    for claim in records_by_path.get("profile/claims.jsonl", [])
                ),
                "withheld_claims": sum(
                    claim.get("status") == "withheld"
                    for claim in records_by_path.get("profile/claims.jsonl", [])
                ),
                "policies": result.counts["policies"],
                "decision_cases": result.counts["cases"],
                "sources": result.counts["sources"],
                "conflicts": len(
                    optional_records_by_path.get("evidence/conflicts.jsonl", [])
                ),
            }
            for key, actual in actual_counts.items():
                if expected_counts.get(key) != actual:
                    result.add_error(
                        f"manifest count '{key}' is {expected_counts.get(key)!r}, "
                        f"but the pack contains {actual}"
                    )
        calculated_privacy = _maximum_sensitivity(
            [
                profile if isinstance(profile, dict) else {},
                claims,
                policy_records,
                cases,
                counterexamples,
                current_state if isinstance(current_state, dict) else {},
                sources,
                optional_records_by_path.get("evidence/conflicts.jsonl", []),
            ]
        )
        if manifest.get("privacy_class") != calculated_privacy:
            result.add_error(
                "manifest.json privacy_class does not match the most sensitive "
                "canonical record"
            )

    adapter_root = root / "adapters/chatgpt-project"
    owner_authorized = isinstance(consent, dict) and consent.get("owner_authorized") is True
    adapter_present = adapter_root.is_dir() and not adapter_root.is_symlink()
    allowed_modes = consent.get("allowed_modes", []) if isinstance(consent, dict) else []
    default_mode = manifest.get("default_mode") if isinstance(manifest, dict) else None
    if owner_authorized:
        if default_mode not in allowed_modes:
            result.add_error(
                "manifest.json default_mode must be one of the consented allowed_modes"
            )
    elif default_mode is not None:
        result.add_error(
            "manifest.json default_mode must be null without owner authorization"
        )
    if isinstance(build_metadata, dict):
        recorded_adapter = build_metadata.get("chatgpt_adapter_generated")
        if isinstance(recorded_adapter, bool) and recorded_adapter != adapter_present:
            result.add_error(
                "build-metadata.json chatgpt_adapter_generated does not match "
                "the actual adapter presence"
            )
        if recorded_adapter is True and (
            not owner_authorized or not isinstance(allowed_modes, list) or not allowed_modes
        ):
            result.add_error(
                "build-metadata.json records a ChatGPT adapter without owner consented modes"
            )
    if owner_authorized:
        if consent.get("authorized_at") in (None, ""):
            result.add_error(
                "evidence/consent.yaml must record authorized_at when owner_authorized is true"
            )
        for relative_path in ADAPTER_REQUIRED_PATHS:
            path = root / relative_path
            if not path.is_file() or path.is_symlink():
                result.add_error(f"missing authorized adapter path: {relative_path}")
    elif adapter_root.exists() or adapter_root.is_symlink():
        result.add_error(
            "ChatGPT adapter exists without explicit owner authorization in consent"
        )

    if (
        isinstance(manifest, dict)
        and isinstance(build_metadata, dict)
        and isinstance(profile, dict)
        and isinstance(current_state, dict)
        and isinstance(boundaries, dict)
        and isinstance(consent, dict)
    ):
        runtime_case_ids = _validate_adapter_matches_canonical(
            root,
            manifest=manifest,
            build_metadata=build_metadata,
            profile=profile,
            claims=claims,
            policies=policy_records,
            cases=cases,
            counterexamples=counterexamples,
            conflicts=optional_records_by_path.get("evidence/conflicts.jsonl", []),
            current_state=current_state,
            boundaries=boundaries,
            sources=sources,
            consent=consent,
            result=result,
        )
        if runtime_case_ids is not None:
            for index, record in enumerate(development_evals, start=1):
                case_id = record.get("case_id")
                expected_exposure = (
                    isinstance(case_id, str) and case_id in runtime_case_ids
                )
                if record.get("exposed_to_runtime") is not expected_exposure:
                    result.add_error(
                        "development evaluation exposed_to_runtime does not match "
                        "the generated ChatGPT adapter in "
                        f"evals/development.jsonl record {index}"
                    )
        if adapter_present:
            _validate_runtime_adapter_references(
                root,
                claims=claims,
                policies=policy_records,
                cases=cases,
                counterexamples=counterexamples,
                conflicts=optional_records_by_path.get(
                    "evidence/conflicts.jsonl", []
                ),
                result=result,
            )

    _check_forbidden_evaluation_paths(root, result)
    _check_adapter_for_evaluation_answers(root, result)
    _scan_for_secrets(root, result)
    return result


def _summary(result: ValidationResult) -> str:
    return (
        f"{result.counts['claims']} claims, {result.counts['policies']} policies, "
        f"{result.counts['cases']} cases, {result.counts['sources']} sources, "
        f"{result.counts['files']} required files checked"
    )


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "bundle",
        nargs="?",
        default=".",
        help="path to the Choiceprint Twin Pack directory (default: current directory)",
    )
    args = parser.parse_args(argv)
    result = validate_bundle(args.bundle)

    if result.ok:
        print(f"Choiceprint Twin Pack valid: {_summary(result)}")
        return 0

    print(
        f"Choiceprint Twin Pack invalid: {len(result.errors)} error(s); {_summary(result)}",
        file=sys.stderr,
    )
    for error in result.errors:
        print(f"- {error}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
