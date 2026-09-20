#!/usr/bin/env python3
"""Compile a MatrAIx persona and reviewed evidence into a Choiceprint Twin Pack."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import re
import shutil
import stat
import sys
import tempfile
from copy import deepcopy
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence

import yaml


AUDIT_BLOCKS = (
    "evidenced",
    "best_guess",
    "sensitive_evidenced",
    "sensitive_best_guess",
)
SENSITIVITY_VALUES = frozenset({"public", "private", "sensitive"})
RUNTIME_SAFE_SENSITIVITIES = frozenset({"public", "private"})
SUPPORTED_MODES = frozenset(
    {"predict-choice", "advise-person", "write-in-style", "draft-action"}
)
VALIDATION_EVENT_SCOPE = "forced_choice_prediction/1"
VALIDATION_EVENT_ID = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$")
RECORD_ID = VALIDATION_EVENT_ID
COVERAGE_DOMAIN_ID = re.compile(r"^[a-z0-9]+(?:[_-][a-z0-9]+)*$")
COVERAGE_DOMAIN_MAX_LENGTH = 64
SHA256_HEX = re.compile(r"^[a-f0-9]{64}$")
REVOCATION_REASON_CODES = frozenset(
    {
        "evidence_no_longer_reliable",
        "evaluation_invalidated",
        "owner_withdrew_validation",
        "safety_or_privacy_restriction",
        "scope_definition_changed",
    }
)
VALIDATION_EVENT_COMMON_FIELDS = frozenset(
    {
        "event_id",
        "domain",
        "action",
        "scope",
        "prepared_at",
        "reviewed_at",
        "recorded_at",
        "review_receipt_sha256",
        "source_build_metadata_sha256",
        "supersedes_event_id",
    }
)
APPLIED_CLAIM_REVIEW_FORMAT = "choiceprint-claim-review-applied/0.1"
SUPPORTED_CLAIM_REVIEW_DECISIONS = frozenset(
    {"confirm", "dispute", "withhold", "unconfirmed"}
)
CLAIM_REVIEW_SNAPSHOT_FIELDS = (
    "id",
    "predicate",
    "label",
    "category",
    "value",
    "sensitivity",
    "source_selection",
    "evidence_refs",
)
PERSON_GROUNDED_EVIDENCE_TYPES = frozenset(
    {
        "direct_self_report",
        "direct_statement",
        "observed_behavior",
        "derived_summary",
    }
)
RUNTIME_CLAIM_REFERENCE_KEYS = frozenset(
    {"claim_id", "claim_ids", "claim_ref", "claim_refs"}
)
RUNTIME_POLICY_REFERENCE_KEYS = frozenset(
    {"policy_id", "policy_ids", "policy_ref", "policy_refs"}
)
RUNTIME_CASE_REFERENCE_KEYS = frozenset(
    {"case_id", "case_ids", "case_ref", "case_refs"}
)
CURATED_CLAIM_FIELDS = frozenset(
    {
        "id",
        "subject",
        "predicate",
        "label",
        "category",
        "value",
        "scope",
        "status",
        "confidence",
        "evidence_refs",
        "counterevidence_refs",
        "sensitivity",
        "observed_at",
        "effective_from",
        "effective_to",
        "runtime_included",
        "source_selection",
        "needs_review",
        "user_confirmed",
    }
)
CURATED_CLAIM_REQUIRED_FIELDS = frozenset(
    {
        "id",
        "predicate",
        "value",
        "confidence",
        "evidence_refs",
        "sensitivity",
        "runtime_included",
    }
)

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
SENSITIVE_DIMENSIONS_PATH = (
    REPOSITORY_ROOT / "matraix/personal-persona/sensitive-dimensions.json"
)

DEFAULT_BOUNDARIES = {
    "allowed": [
        "predict likely choices",
        "explain evidence and uncertainty",
        "draft text in documented style",
    ],
    "ask_before": [
        "send messages",
        "make purchases",
        "alter calendars",
        "publish content",
        "make commitments",
    ],
    "never": [
        "claim literal identity",
        "authenticate as the person",
        "sign legal documents",
        "make high-stakes decisions on the person's behalf",
        "infer unsupported sensitive attributes",
    ],
}

DEFAULT_CONSENT = {
    "owner_authorized": False,
    "authorized_at": None,
    "allowed_sources": [],
    "allowed_modes": [],
    "allowed_uses": [
        "predict likely choices",
        "draft in documented communication style",
    ],
    "prohibited_uses": [
        "execute external actions",
        "claim literal identity",
    ],
    "publication_requires_fresh_approval": True,
    "withdrawal": {
        "method": "delete the pack and connected ChatGPT Project sources",
        "effect": "stop future use and remove local derived artifacts",
    },
}

PROJECT_INSTRUCTIONS = (
    Path(__file__).resolve().parents[1]
    / "adapters/chatgpt-project/PROJECT-INSTRUCTIONS.md"
).read_text(encoding="utf-8")

COMPILER_OWNED_REQUIRED_PATHS = (
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

COMPILER_OWNED_ADAPTER_PATHS = tuple(
    f"adapters/chatgpt-project/{filename}"
    for filename in (
        "PROJECT-INSTRUCTIONS.md",
        "00-READ-FIRST.md",
        "01-CORE-PROFILE.md",
        "02-DECISION-RULES.md",
        "03-DECISION-CASES.md",
        "04-COUNTEREXAMPLES.md",
        "05-CURRENT-CONTEXT.md",
        "06-BOUNDARIES.md",
        "07-EVIDENCE-INDEX.md",
        "08-CONFLICTS.md",
        "09-CONSENT.md",
    )
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


def _now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace(
        "+00:00", "Z"
    )


def _date(value: Any, fallback: str) -> str:
    if isinstance(value, str) and len(value.strip()) >= 10:
        return value.strip()[:10]
    return fallback[:10]


def _validate_date_or_datetime(value: Any, field: str, *, nullable: bool = False) -> None:
    if nullable and value is None:
        return
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{field} must be a valid ISO date or date-time")
    text = value.strip()
    try:
        if "T" in text:
            parsed_datetime = datetime.fromisoformat(text.replace("Z", "+00:00"))
            if (
                parsed_datetime.tzinfo is None
                or parsed_datetime.utcoffset() is None
            ):
                raise ValueError("date-time must include a UTC offset or Z")
        else:
            date.fromisoformat(text)
    except ValueError as exc:
        raise ValueError(f"{field} must be a valid ISO date or date-time") from exc


def _coverage_timestamp(value: Any, field: str) -> datetime:
    if not isinstance(value, str) or "T" not in value:
        raise ValueError(f"{field} must be an ISO date-time with a UTC offset or Z")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError(
            f"{field} must be an ISO date-time with a UTC offset or Z"
        ) from exc
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise ValueError(f"{field} must be an ISO date-time with a UTC offset or Z")
    return parsed


def _declared_coverage_domains(value: Any, field: str) -> list[str]:
    if not isinstance(value, list):
        raise ValueError(f"{field} must be a list of coverage-domain slugs")
    domains: list[str] = []
    for index, domain in enumerate(value, start=1):
        if (
            not isinstance(domain, str)
            or len(domain) > COVERAGE_DOMAIN_MAX_LENGTH
            or not COVERAGE_DOMAIN_ID.fullmatch(domain)
        ):
            raise ValueError(
                f"{field} item {index} must be a lowercase coverage-domain slug "
                f"of at most {COVERAGE_DOMAIN_MAX_LENGTH} characters"
            )
        if domain in domains:
            raise ValueError(f"{field} contains duplicate domain '{domain}'")
        domains.append(domain)
    return sorted(domains)


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


def _validate_not_future(value: Any, reference: str, field: str) -> None:
    if value is None:
        return
    _validate_date_or_datetime(value, field)
    if _temporal_value_is_after(value, reference):
        raise ValueError(f"{field} must not be later than the pack build time")


def _sensitive_dimension_ids() -> frozenset[str]:
    try:
        document = _load_json(SENSITIVE_DIMENSIONS_PATH)
    except (OSError, ValueError) as exc:
        raise ValueError(
            "cannot load the canonical sensitive-dimension registry"
        ) from exc
    values = document.get("dimension_ids") if isinstance(document, dict) else None
    if not isinstance(values, list) or any(
        not isinstance(item, str) or not item.strip() for item in values
    ):
        raise ValueError(
            "canonical sensitive-dimension registry has an invalid dimension_ids list"
        )
    return frozenset(item.strip() for item in values)


def _boolean_field(
    record: Mapping[str, Any],
    field: str,
    *,
    default: bool,
    context: str,
) -> bool:
    value = record.get(field, default)
    if type(value) is not bool:
        raise ValueError(f"{context}.{field} must be a boolean")
    return value


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


def _reject_policy_overlaps(
    consent: Mapping[str, Any], boundaries: Mapping[str, Any]
) -> None:
    consent_overlap = _normalized_string_set(consent.get("allowed_uses")) & (
        _normalized_string_set(consent.get("prohibited_uses"))
    )
    if consent_overlap:
        raise ValueError(
            "consent allowed_uses and prohibited_uses overlap: "
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
            raise ValueError(
                f"boundaries {left} and {right} overlap: "
                + ", ".join(sorted(overlap))
            )


def _is_expired(expires_at: str, generated_at: str) -> bool:
    if "T" in expires_at:
        expires = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
        generated = datetime.fromisoformat(generated_at.replace("Z", "+00:00"))
        return expires <= generated
    return date.fromisoformat(expires_at) < datetime.fromisoformat(
        generated_at.replace("Z", "+00:00")
    ).date()


def _stable_id(value: Any) -> str:
    normalized = re.sub(r"[^A-Za-z0-9._:-]+", "_", str(value).strip())
    normalized = normalized.strip("_.:-")
    if not normalized:
        raise ValueError(f"cannot create a stable ID from {value!r}")
    return normalized


def _registry_dimension_id(value: Any) -> str:
    """Normalize a dimension key for comparison with the sensitive registry."""

    return re.sub(r"[^a-z0-9]+", "_", str(value).strip().casefold()).strip("_")


def _assert_legacy_dimensions_projection(
    claims: Sequence[Mapping[str, Any]],
    legacy_dimensions: Mapping[str, Any],
    sensitive_dimension_ids: Iterable[str],
) -> None:
    """Keep the legacy layer as an exact projection of runtime-safe claims."""

    registry_ids = {
        _registry_dimension_id(identifier) for identifier in sensitive_dimension_ids
    }
    expected: dict[str, Any] = {}
    for claim in claims:
        predicate = claim.get("predicate")
        if not isinstance(predicate, str) or not predicate.startswith(
            "legacy_dimension."
        ):
            continue
        dimension_id = predicate.removeprefix("legacy_dimension.")
        eligible = (
            claim.get("status") in {"active", "provisional"}
            and claim.get("sensitivity") in RUNTIME_SAFE_SENSITIVITIES
            and claim.get("runtime_included") is True
            and claim.get("value") is not None
        )
        if not eligible:
            continue
        if _registry_dimension_id(dimension_id) in registry_ids:
            raise ValueError(
                f"registry-sensitive legacy dimension '{dimension_id}' cannot be "
                "included in the compatibility layer"
            )
        if dimension_id in expected:
            raise ValueError(
                f"multiple eligible claims map to legacy dimension '{dimension_id}'"
            )
        expected[dimension_id] = claim.get("value")

    actual: dict[str, Any] = {}
    for raw_identifier, value in legacy_dimensions.items():
        dimension_id = _stable_id(raw_identifier)
        if _registry_dimension_id(dimension_id) in registry_ids:
            raise ValueError(
                f"registry-sensitive legacy dimension '{raw_identifier}' cannot be "
                "included in the compatibility layer"
            )
        if dimension_id in actual:
            raise ValueError(
                f"duplicate normalized legacy dimension ID '{dimension_id}'"
            )
        actual[dimension_id] = value

    if set(actual) != set(expected):
        missing = sorted(set(expected) - set(actual))
        unexpected = sorted(set(actual) - set(expected))
        details = []
        if missing:
            details.append(f"missing {missing!r}")
        if unexpected:
            details.append(f"unexpected {unexpected!r}")
        raise ValueError(
            "legacy dimensions do not match eligible canonical claims: "
            + "; ".join(details)
        )
    for dimension_id, expected_value in expected.items():
        actual_value = actual[dimension_id]
        if (
            type(actual_value) is not type(expected_value)
            or actual_value != expected_value
        ):
            raise ValueError(
                f"legacy dimension '{dimension_id}' does not match its canonical claim"
            )


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


def _reject_json_constant(value: str) -> Any:
    raise ValueError(f"non-finite JSON number is not allowed: {value}")


def _load_yaml(path: Path) -> dict[str, Any]:
    try:
        value = yaml.load(
            path.read_text(encoding="utf-8"),
            Loader=_StrictSafeLoader,
        )
    except (OSError, UnicodeError, yaml.YAMLError) as exc:
        raise ValueError(f"cannot read YAML from {path}: {exc}") from exc
    if not isinstance(value, dict):
        raise ValueError(f"{path} must contain a YAML mapping")
    _assert_acyclic_finite(value, context=str(path))
    return value


def _unique_json_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"duplicate JSON object key: {key!r}")
        result[key] = value
    return result


def _load_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(
            path.read_text(encoding="utf-8"),
            object_pairs_hook=_unique_json_object,
            parse_constant=_reject_json_constant,
        )
    except (OSError, UnicodeError, json.JSONDecodeError, ValueError) as exc:
        raise ValueError(f"cannot read JSON from {path}: {exc}") from exc
    if not isinstance(value, dict):
        raise ValueError(f"{path} must contain a JSON object")
    return value


def _load_yaml_document(path: Path) -> Any:
    try:
        value = yaml.load(
            path.read_text(encoding="utf-8"),
            Loader=_StrictSafeLoader,
        )
    except (OSError, UnicodeError, yaml.YAMLError) as exc:
        raise ValueError(f"cannot read YAML from {path}: {exc}") from exc
    _assert_acyclic_finite(value, context=str(path))
    return value


def _load_jsonl_objects(path: Path) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except (OSError, UnicodeError) as exc:
        raise ValueError(f"cannot read JSONL from {path}: {exc}") from exc
    for line_number, raw_line in enumerate(lines, start=1):
        if not raw_line.strip():
            continue
        try:
            value = json.loads(
                raw_line,
                object_pairs_hook=_unique_json_object,
                parse_constant=_reject_json_constant,
            )
        except (json.JSONDecodeError, ValueError) as exc:
            raise ValueError(
                f"cannot read JSONL from {path} at line {line_number}: {exc}"
            ) from exc
        if not isinstance(value, dict):
            raise ValueError(
                f"{path} line {line_number} must contain a JSON object"
            )
        records.append(value)
    return records


def _load_curation(path: Path | None) -> dict[str, Any]:
    if path is None:
        return {}
    if path.suffix.lower() == ".json":
        return _load_json(path)
    return _load_yaml(path)


def _write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(value, indent=2, ensure_ascii=False, allow_nan=False) + "\n",
        encoding="utf-8",
    )


def _write_jsonl(path: Path, records: Iterable[Mapping[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    text = "".join(
        json.dumps(
            record,
            ensure_ascii=False,
            separators=(",", ":"),
            allow_nan=False,
        )
        + "\n"
        for record in records
    )
    path.write_text(text, encoding="utf-8")


def _write_yaml(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        yaml.safe_dump(value, sort_keys=False, allow_unicode=True),
        encoding="utf-8",
    )


def _pack_file_hashes(root: Path) -> dict[str, str]:
    hashes: dict[str, str] = {}
    for path in sorted(root.rglob("*")):
        if not path.is_file() or path.is_symlink():
            continue
        relative = path.relative_to(root).as_posix()
        if relative == "build-metadata.json":
            continue
        hashes[relative] = hashlib.sha256(path.read_bytes()).hexdigest()
    return hashes


def _secure_pack_permissions(root: Path) -> None:
    """Restrict a generated private pack to its owner on POSIX systems."""

    if os.name != "posix":
        return

    paths = [root, *sorted(root.rglob("*"))]
    for path in paths:
        mode = path.lstat().st_mode
        if stat.S_ISLNK(mode):
            raise ValueError(
                "cannot secure a Choiceprint pack containing a symlink: "
                + path.relative_to(root).as_posix()
            )
        if stat.S_ISDIR(mode):
            path.chmod(0o700)
        elif stat.S_ISREG(mode):
            path.chmod(0o600)
        else:
            raise ValueError(
                "cannot secure a Choiceprint pack containing a special entry: "
                + path.relative_to(root).as_posix()
            )


def _validated_domains_from_events(
    events: Sequence[Mapping[str, Any]],
    *,
    declared_domains: Sequence[str],
) -> list[str]:
    """Validate the append-only event chain and return its exact projection."""

    allowed_domains = set(
        _declared_coverage_domains(
            list(declared_domains), "coverage.declared_domains"
        )
    )
    seen_ids: set[str] = set()
    latest_by_domain: dict[str, Mapping[str, Any]] = {}
    for index, event in enumerate(events, start=1):
        if not isinstance(event, Mapping):
            raise ValueError(f"coverage validation event {index} must be a mapping")
        action = event.get("action")
        required_fields = set(VALIDATION_EVENT_COMMON_FIELDS)
        if action == "validate":
            required_fields.add("evaluation_evidence_sha256")
        elif action == "revoke":
            required_fields.add("reason_code")
        else:
            raise ValueError(
                f"coverage validation event {index} action must be validate or revoke"
            )
        actual_fields = set(event)
        if actual_fields != required_fields:
            missing = sorted(required_fields - actual_fields)
            unexpected = sorted(actual_fields - required_fields)
            details: list[str] = []
            if missing:
                details.append("missing " + ", ".join(missing))
            if unexpected:
                details.append("unexpected " + ", ".join(unexpected))
            raise ValueError(
                f"coverage validation event {index} has invalid fields: "
                + "; ".join(details)
            )

        event_id = event.get("event_id")
        if not isinstance(event_id, str) or not VALIDATION_EVENT_ID.fullmatch(
            event_id
        ):
            raise ValueError(
                f"coverage validation event {index} has an invalid event_id"
            )
        if event_id in seen_ids:
            raise ValueError(f"duplicate coverage validation event_id '{event_id}'")
        seen_ids.add(event_id)

        domain = event.get("domain")
        if (
            not isinstance(domain, str)
            or len(domain) > COVERAGE_DOMAIN_MAX_LENGTH
            or not COVERAGE_DOMAIN_ID.fullmatch(domain)
        ):
            raise ValueError(
                f"coverage validation event '{event_id}' has an invalid domain slug"
            )
        if domain not in allowed_domains:
            raise ValueError(
                f"coverage validation event '{event_id}' domain '{domain}' is not "
                "declared by the source pack"
            )
        if event.get("scope") != VALIDATION_EVENT_SCOPE:
            raise ValueError(
                f"coverage validation event '{event_id}' scope must be "
                f"{VALIDATION_EVENT_SCOPE}"
            )
        prepared_at = _coverage_timestamp(
            event.get("prepared_at"),
            f"coverage validation event '{event_id}'.prepared_at",
        )
        reviewed_at = _coverage_timestamp(
            event.get("reviewed_at"),
            f"coverage validation event '{event_id}'.reviewed_at",
        )
        recorded_at = _coverage_timestamp(
            event.get("recorded_at"),
            f"coverage validation event '{event_id}'.recorded_at",
        )
        if prepared_at > reviewed_at or reviewed_at > recorded_at:
            raise ValueError(
                f"coverage validation event '{event_id}' timestamps must satisfy "
                "prepared_at <= reviewed_at <= recorded_at"
            )
        for field in (
            "review_receipt_sha256",
            "source_build_metadata_sha256",
        ):
            value = event.get(field)
            if not isinstance(value, str) or not SHA256_HEX.fullmatch(value):
                raise ValueError(
                    f"coverage validation event '{event_id}'.{field} must be a "
                    "complete lowercase SHA-256 digest"
                )
        if action == "validate":
            evidence_hash = event.get("evaluation_evidence_sha256")
            if not isinstance(evidence_hash, str) or not SHA256_HEX.fullmatch(
                evidence_hash
            ):
                raise ValueError(
                    f"coverage validation event '{event_id}'."
                    "evaluation_evidence_sha256 must be a complete lowercase "
                    "SHA-256 digest"
                )
        elif event.get("reason_code") not in REVOCATION_REASON_CODES:
            raise ValueError(
                f"coverage validation event '{event_id}' revocation reason_code "
                "is invalid"
            )

        previous = latest_by_domain.get(domain)
        if previous is not None:
            previous_recorded_at = _coverage_timestamp(
                previous.get("recorded_at"),
                f"coverage validation event '{previous.get('event_id')}'.recorded_at",
            )
            if prepared_at < previous_recorded_at:
                raise ValueError(
                    f"coverage validation event '{event_id}' timestamps must not "
                    f"predate the prior event for domain '{domain}'"
                )
        expected_supersedes = previous.get("event_id") if previous else None
        if event.get("supersedes_event_id") != expected_supersedes:
            raise ValueError(
                f"coverage validation event '{event_id}' must immediately supersede "
                f"{expected_supersedes!r} for domain '{domain}'"
            )
        latest_by_domain[domain] = event

    return sorted(
        domain
        for domain, event in latest_by_domain.items()
        if event.get("action") == "validate"
    )


def _as_records(value: Any, label: str) -> list[dict[str, Any]]:
    if value is None:
        return []
    if not isinstance(value, list):
        raise ValueError(f"curation field '{label}' must be a list")
    records: list[dict[str, Any]] = []
    for index, item in enumerate(value, start=1):
        if not isinstance(item, dict):
            raise ValueError(f"curation field '{label}' item {index} must be a mapping")
        records.append(deepcopy(item))
    return records


def _ensure_unique(records: Sequence[Mapping[str, Any]], label: str) -> None:
    seen: set[str] = set()
    for index, record in enumerate(records, start=1):
        identifier = record.get("id")
        if not isinstance(identifier, str) or not identifier.strip():
            raise ValueError(f"{label} record {index} needs a non-empty id")
        if identifier in seen:
            raise ValueError(f"duplicate {label} ID '{identifier}'")
        seen.add(identifier)


def _merge_unique(
    generated: list[dict[str, Any]], curated: list[dict[str, Any]], label: str
) -> list[dict[str, Any]]:
    combined = [*generated, *curated]
    _ensure_unique(combined, label)
    return combined


def _confidence_label(value: Any) -> str:
    normalized = str(value or "unknown").strip().lower().replace("-", "_")
    if normalized in {
        "stated",
        "self_report",
        "self_report_unknown",
        "self_report_private",
        "scale_complete",
        "derived_self_report",
    }:
        return "high"
    if normalized == "strong_inference":
        return "medium"
    if normalized in {"best_guess", "scale_partial"}:
        return "low"
    return "unknown"


def _audit_rows(persona: Mapping[str, Any]) -> list[tuple[str, dict[str, Any]]]:
    rows: list[tuple[str, dict[str, Any]]] = []
    for block in AUDIT_BLOCKS:
        value = persona.get(block, [])
        if isinstance(value, dict):
            entries = []
            for identifier, entry in value.items():
                if isinstance(entry, dict):
                    entries.append({"id": identifier, **entry})
        elif isinstance(value, list):
            entries = value
        else:
            raise ValueError(f"persona field '{block}' must be a list or mapping")
        for entry in entries:
            if not isinstance(entry, dict):
                raise ValueError(f"persona field '{block}' contains a non-mapping row")
            rows.append((block, deepcopy(entry)))

    if rows:
        return rows

    dimensions = persona.get("dimensions", {})
    if not isinstance(dimensions, dict):
        raise ValueError("persona dimensions must be a mapping")
    sensitive_ids = {
        _registry_dimension_id(identifier) for identifier in _sensitive_dimension_ids()
    }
    return [
        (
            "sensitive_best_guess"
            if _registry_dimension_id(identifier) in sensitive_ids
            else "evidenced",
            {
                "id": identifier,
                "label": str(identifier).replace("_", " ").title(),
                "value": value,
                "selected_confidence": "unknown",
                "sensitive": _registry_dimension_id(identifier) in sensitive_ids,
                "runtime_included": _registry_dimension_id(identifier)
                not in sensitive_ids,
                "selected_from": "dimensions",
            },
        )
        for identifier, value in dimensions.items()
        if value is not None
    ]


def _selected_evidence(row: Mapping[str, Any]) -> str:
    selected = str(row.get("selected_from") or "").strip().lower()
    candidates: list[Any] = []
    if selected in {"claude", "chatgpt"}:
        candidates.append(row.get(f"evidence_{selected}"))
    candidates.extend(
        [
            row.get("evidence"),
            row.get("evidence_chatgpt"),
            row.get("evidence_claude"),
            row.get("selection_reason"),
        ]
    )
    fragments: list[str] = []
    for candidate in candidates:
        if isinstance(candidate, str):
            text = " ".join(candidate.split())
            if text and text not in fragments:
                fragments.append(text)
    return " ".join(fragments) or "No evidence note was retained in the audit row."


def _compile_claims(
    persona: Mapping[str, Any], generated_at: str
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
    meta = persona.get("meta", {})
    if not isinstance(meta, dict):
        meta = {}
    survey_meta = meta.get("survey", {})
    saved_at = survey_meta.get("saved_at") if isinstance(survey_meta, dict) else None
    reviewed_at = _date(saved_at, generated_at) if saved_at else None
    dimensions = persona.get("dimensions", {})
    if not isinstance(dimensions, dict):
        dimensions = {}

    claims: list[dict[str, Any]] = []
    sources: list[dict[str, Any]] = []
    legacy_dimensions: dict[str, Any] = {}
    seen_dimensions: set[str] = set()
    sensitive_dimension_ids = _sensitive_dimension_ids()
    registry_sensitive_dimension_ids = {
        _registry_dimension_id(identifier) for identifier in sensitive_dimension_ids
    }

    for block, row in _audit_rows(persona):
        raw_identifier = row.get("id")
        if not isinstance(raw_identifier, str) or not raw_identifier.strip():
            raise ValueError(f"persona audit block '{block}' has a row without an id")
        dimension_id = _stable_id(raw_identifier)
        if dimension_id in seen_dimensions:
            raise ValueError(f"duplicate audited dimension ID '{dimension_id}'")
        seen_dimensions.add(dimension_id)

        row_context = f"persona audit row '{raw_identifier}'"
        block_sensitive = block.startswith("sensitive_")
        explicit_sensitive = _boolean_field(
            row,
            "sensitive",
            default=block_sensitive,
            context=row_context,
        )
        sensitivity_label = row.get("sensitivity")
        if sensitivity_label is not None:
            if sensitivity_label not in SENSITIVITY_VALUES:
                raise ValueError(
                    f"{row_context}.sensitivity must be public, private, or sensitive"
                )
            label_sensitive = sensitivity_label == "sensitive"
            if "sensitive" in row and explicit_sensitive != label_sensitive:
                raise ValueError(
                    f"{row_context}.sensitive conflicts with sensitivity"
                )
            if block_sensitive and not label_sensitive:
                raise ValueError(
                    f"{row_context}.sensitivity conflicts with its sensitive audit block"
                )
        else:
            label_sensitive = False
        if block_sensitive and not explicit_sensitive:
            raise ValueError(
                f"{row_context}.sensitive conflicts with its sensitive audit block"
            )
        registry_sensitive = (
            _registry_dimension_id(raw_identifier) in registry_sensitive_dimension_ids
        )
        sensitive = (
            block_sensitive
            or explicit_sensitive
            or label_sensitive
            or registry_sensitive
        )
        runtime_included = _boolean_field(
            row,
            "runtime_included",
            default=not sensitive,
            context=row_context,
        )
        confidence_basis = str(row.get("selected_confidence") or "unknown")
        value = row.get("value", dimensions.get(raw_identifier))
        provisional = confidence_basis.strip().lower() in {
            "best_guess",
            "scale_partial",
            "unknown",
        }
        if sensitive or not runtime_included or value is None:
            status = "withheld"
        elif provisional:
            status = "provisional"
        else:
            status = "active"

        claim_id = f"clm_dimension_{dimension_id}"
        source_id = f"src_dimension_{dimension_id}"
        claim = {
            "id": claim_id,
            "subject": "self",
            "predicate": f"legacy_dimension.{dimension_id}",
            "label": row.get("label") or raw_identifier.replace("_", " ").title(),
            "category": row.get("category"),
            "value": value,
            "scope": {"domains": [], "conditions": []},
            "status": status,
            "confidence": {
                "label": _confidence_label(confidence_basis),
                "basis": confidence_basis,
            },
            "evidence_refs": [source_id],
            "counterevidence_refs": [],
            "sensitivity": "sensitive" if sensitive else "private",
            "runtime_included": runtime_included and not sensitive,
            "source_selection": row.get("selected_from"),
            "needs_review": _boolean_field(
                row,
                "needs_review",
                default=provisional or sensitive,
                context=row_context,
            ),
            "user_confirmed": confidence_basis.strip().lower()
            in {
                "self_report",
                "self_report_unknown",
                "self_report_private",
                "scale_complete",
            },
        }
        row_observed_at = row.get("observed_at") or row.get("captured_at")
        if row_observed_at:
            claim["observed_at"] = _date(row_observed_at, generated_at)
            claim["effective_from"] = _date(row_observed_at, generated_at)
        if reviewed_at:
            claim["reviewed_at"] = reviewed_at
        claims.append(claim)

        authorship = (
            "person"
            if confidence_basis.strip().lower() in {
                "self_report",
                "self_report_unknown",
                "self_report_private",
                "scale_complete",
            }
            else "mixed"
        )
        source = {
                "id": source_id,
                "source_type": "persona_audit",
                "authorship": authorship,
                "locator": f"persona audit row {raw_identifier}",
                "summary": _selected_evidence(row),
                "sensitivity": "sensitive" if sensitive else "private",
                "runtime_excerpt_allowed": not sensitive,
            }
        if saved_at:
            source["captured_at"] = saved_at
        sources.append(source)

        if status in {"active", "provisional"}:
            legacy_dimensions[raw_identifier] = value

    _assert_legacy_dimensions_projection(
        claims, legacy_dimensions, sensitive_dimension_ids
    )
    return claims, sources, legacy_dimensions


def _claim_review_snapshot_hash(claims: Sequence[Mapping[str, Any]]) -> str:
    """Hash stable source facets so a review cannot follow changed source claims."""

    payload = [
        {
            field: deepcopy(claim.get(field))
            for field in CLAIM_REVIEW_SNAPSHOT_FIELDS
        }
        for claim in claims
    ]
    encoded = json.dumps(
        payload,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _claim_review_string_list(value: Any, field: str) -> list[str]:
    if not isinstance(value, list):
        raise ValueError(f"{field} must be a list")
    result: list[str] = []
    for index, item in enumerate(value, start=1):
        if not isinstance(item, str) or not item.strip():
            raise ValueError(f"{field} item {index} must be a non-empty string")
        normalized = " ".join(item.split())
        if normalized in result:
            raise ValueError(f"{field} contains duplicate value '{normalized}'")
        result.append(normalized)
    return result


def _apply_claim_reviews(
    claims: list[dict[str, Any]],
    curation: Mapping[str, Any],
    generated_at: str,
    persona_id: str,
) -> None:
    """Apply exhaustive, explicitly owner-completed review decisions in place."""

    review = curation.get("claim_reviews")
    if review is None:
        return
    if not isinstance(review, dict):
        raise ValueError("curation field 'claim_reviews' must be a mapping")
    allowed_review_fields = {
        "format",
        "reviewer",
        "reviewed_at",
        "review_sha256",
        "base_curation_sha256",
        "source_pack_binding",
        "decisions",
    }
    unsupported = sorted(set(review) - allowed_review_fields)
    if unsupported:
        raise ValueError(
            "claim_reviews contains unsupported fields: " + ", ".join(unsupported)
        )
    missing = sorted(allowed_review_fields - set(review))
    if missing:
        raise ValueError(
            "claim_reviews is missing fields: " + ", ".join(missing)
        )
    if review.get("format") != APPLIED_CLAIM_REVIEW_FORMAT:
        raise ValueError(
            f"claim_reviews.format must be {APPLIED_CLAIM_REVIEW_FORMAT}"
        )
    if review.get("reviewer") != "owner":
        raise ValueError("claim_reviews.reviewer must be 'owner'")
    reviewed_at = review.get("reviewed_at")
    _validate_date_or_datetime(reviewed_at, "claim_reviews.reviewed_at")
    _validate_not_future(reviewed_at, generated_at, "claim_reviews.reviewed_at")
    for hash_field in ("review_sha256", "base_curation_sha256"):
        value = review.get(hash_field)
        if not isinstance(value, str) or not re.fullmatch(r"[a-f0-9]{64}", value):
            raise ValueError(f"claim_reviews.{hash_field} must be a SHA-256 digest")

    binding = review.get("source_pack_binding")
    if not isinstance(binding, dict):
        raise ValueError("claim_reviews.source_pack_binding must be a mapping")
    required_binding_fields = {
        "bundle_format",
        "schema_version",
        "persona_id",
        "content_version",
        "manifest_sha256",
        "build_metadata_sha256",
        "claims_sha256",
        "claim_snapshot_sha256",
        "claim_count",
    }
    if set(binding) != required_binding_fields:
        missing_binding = sorted(required_binding_fields - set(binding))
        unsupported_binding = sorted(set(binding) - required_binding_fields)
        details: list[str] = []
        if missing_binding:
            details.append("missing " + ", ".join(missing_binding))
        if unsupported_binding:
            details.append("unsupported " + ", ".join(unsupported_binding))
        raise ValueError(
            "claim_reviews.source_pack_binding fields are invalid: "
            + "; ".join(details)
        )
    if binding.get("persona_id") != persona_id:
        raise ValueError(
            "claim review persona ID does not match the persona being compiled"
        )
    if binding.get("bundle_format") != "choiceprint/0.1" or binding.get(
        "schema_version"
    ) != "0.1":
        raise ValueError("claim review uses an unsupported source pack format")
    if binding.get("claim_count") != len(claims):
        raise ValueError("claim review count does not match the source persona claims")
    snapshot_hash = binding.get("claim_snapshot_sha256")
    if snapshot_hash != _claim_review_snapshot_hash(claims):
        raise ValueError(
            "claim review source snapshot is stale for the persona being compiled"
        )
    for hash_field in ("manifest_sha256", "build_metadata_sha256", "claims_sha256"):
        value = binding.get(hash_field)
        if not isinstance(value, str) or not re.fullmatch(r"[a-f0-9]{64}", value):
            raise ValueError(
                f"claim_reviews.source_pack_binding.{hash_field} must be a SHA-256 digest"
            )

    decisions = review.get("decisions")
    if not isinstance(decisions, list):
        raise ValueError("claim_reviews.decisions must be a list")
    claim_by_id = {str(claim["id"]): claim for claim in claims}
    seen: set[str] = set()
    allowed_decision_fields = {
        "claim_id",
        "decision",
        "domains",
        "conditions",
        "notes",
    }
    for index, row in enumerate(decisions, start=1):
        if not isinstance(row, dict):
            raise ValueError(f"claim review decision {index} must be a mapping")
        unsupported_row = sorted(set(row) - allowed_decision_fields)
        missing_row = sorted(allowed_decision_fields - set(row))
        if unsupported_row or missing_row:
            details = []
            if missing_row:
                details.append("missing " + ", ".join(missing_row))
            if unsupported_row:
                details.append("unsupported " + ", ".join(unsupported_row))
            raise ValueError(
                f"claim review decision {index} fields are invalid: "
                + "; ".join(details)
            )
        claim_id = row.get("claim_id")
        if not isinstance(claim_id, str) or not claim_id:
            raise ValueError(f"claim review decision {index} needs a claim_id")
        if claim_id in seen:
            raise ValueError(f"duplicate reviewed claim ID '{claim_id}'")
        seen.add(claim_id)
        claim = claim_by_id.get(claim_id)
        if claim is None:
            raise ValueError(f"unknown reviewed claim ID '{claim_id}'")
        decision = row.get("decision")
        if decision not in SUPPORTED_CLAIM_REVIEW_DECISIONS:
            raise ValueError(
                f"claim '{claim_id}' has unsupported review decision {decision!r}"
            )
        domains = _claim_review_string_list(
            row.get("domains"), f"claim_reviews '{claim_id}'.domains"
        )
        conditions = _claim_review_string_list(
            row.get("conditions"), f"claim_reviews '{claim_id}'.conditions"
        )
        notes = row.get("notes")
        if notes is not None and not isinstance(notes, str):
            raise ValueError(
                f"claim_reviews '{claim_id}'.notes must be a string or null"
            )

        existing_scope = claim.get("scope")
        stakes = (
            deepcopy(existing_scope.get("stakes"))
            if isinstance(existing_scope, dict) and "stakes" in existing_scope
            else None
        )
        scope: dict[str, Any] = {"domains": domains, "conditions": conditions}
        if stakes is not None:
            scope["stakes"] = stakes
        claim["scope"] = scope
        claim["reviewed_at"] = reviewed_at
        claim["owner_review"] = {
            "decision": decision,
            "reviewer": "owner",
            "reviewed_at": reviewed_at,
            "review_sha256": review["review_sha256"],
            "source_pack": {
                "persona_id": binding["persona_id"],
                "content_version": binding["content_version"],
                "manifest_sha256": binding["manifest_sha256"],
                "claims_sha256": binding["claims_sha256"],
                "claim_snapshot_sha256": binding["claim_snapshot_sha256"],
            },
        }
        if isinstance(notes, str) and notes.strip():
            claim["owner_review"]["notes"] = notes.strip()

        if decision == "confirm":
            claim["user_confirmed"] = True
            claim["needs_review"] = False
            claim["confidence"] = {"label": "high", "basis": "owner_confirmed"}
            if (
                claim.get("sensitivity") in RUNTIME_SAFE_SENSITIVITIES
                and claim.get("runtime_included") is True
                and claim.get("value") is not None
            ):
                claim["status"] = "active"
        elif decision == "dispute":
            claim["status"] = "disputed"
            claim["runtime_included"] = False
            claim["user_confirmed"] = False
            claim["needs_review"] = False
        elif decision == "withhold":
            claim["status"] = "withheld"
            claim["runtime_included"] = False
            claim["user_confirmed"] = False
            claim["needs_review"] = False
        else:
            claim["status"] = "withheld"
            claim["runtime_included"] = False
            claim["user_confirmed"] = False
            claim["needs_review"] = True

        if claim.get("sensitivity") == "sensitive":
            claim["status"] = "withheld"
            claim["runtime_included"] = False

    missing_claims = sorted(set(claim_by_id) - seen)
    if missing_claims:
        raise ValueError(
            "claim review decisions are incomplete; missing claim IDs: "
            + ", ".join(missing_claims)
        )


def _reviewed_legacy_dimensions(
    claims: Sequence[Mapping[str, Any]], legacy_dimensions: Mapping[str, Any]
) -> dict[str, Any]:
    eligible_dimension_ids = {
        str(claim.get("predicate")).removeprefix("legacy_dimension.")
        for claim in claims
        if isinstance(claim.get("predicate"), str)
        and str(claim.get("predicate")).startswith("legacy_dimension.")
        and claim.get("status") in {"active", "provisional"}
        and claim.get("sensitivity") in RUNTIME_SAFE_SENSITIVITIES
        and claim.get("runtime_included") is True
        and claim.get("value") is not None
    }
    return {
        raw_identifier: value
        for raw_identifier, value in legacy_dimensions.items()
        if _stable_id(raw_identifier) in eligible_dimension_ids
    }


def _survey_definitions(document: Mapping[str, Any]) -> dict[str, dict[str, Any]]:
    surveys = document.get("surveys", {})
    if isinstance(surveys, dict):
        return {
            str(identifier): value
            for identifier, value in surveys.items()
            if isinstance(value, dict)
        }
    if isinstance(surveys, list):
        return {
            str(value.get("id")): value
            for value in surveys
            if isinstance(value, dict) and value.get("id")
        }
    return {}


def _questions_by_id(survey: Mapping[str, Any]) -> dict[str, dict[str, Any]]:
    questions = survey.get("questions", [])
    if not isinstance(questions, list):
        return {}
    return {
        str(question.get("id")): question
        for question in questions
        if isinstance(question, dict) and question.get("id")
    }


def _option_records(question: Mapping[str, Any]) -> list[dict[str, Any]]:
    options = question.get("options", [])
    if not isinstance(options, list):
        return []
    records: list[dict[str, Any]] = []
    for option in options:
        if isinstance(option, dict) and option.get("id") is not None:
            records.append(
                {
                    "id": str(option["id"]),
                    "label": str(option.get("label", option["id"])),
                }
            )
        elif isinstance(option, str):
            records.append({"id": option, "label": option})
    return records


def _compile_human_validation(
    results: Mapping[str, Any] | None,
    definitions: Mapping[str, Any] | None,
    generated_at: str,
    validation_source_refs: Mapping[str, str] | None = None,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    if not results:
        return [], []
    surveys = results.get("store", {}).get("surveys", {})
    if not isinstance(surveys, dict):
        return [], []
    definition_surveys = _survey_definitions(definitions or {})
    cases: list[dict[str, Any]] = []
    sources: list[dict[str, Any]] = []

    reviewed_source_refs = validation_source_refs or {}
    for survey_id, survey_result in surveys.items():
        if not isinstance(survey_result, dict):
            continue
        human = survey_result.get("human")
        if not isinstance(human, dict) or not human.get("completedAt"):
            continue
        answers = human.get("answers")
        if not isinstance(answers, dict) or not answers:
            continue

        source_id = reviewed_source_refs.get(str(survey_id))
        if source_id is None:
            source_id = f"src_validation_{_stable_id(human.get('id') or survey_id)}"
            sources.append(
                {
                    "id": source_id,
                    "source_type": "human_validation_survey",
                    "authorship": "person",
                    "captured_at": human.get("completedAt") or generated_at,
                    "locator": f"completed human validation survey {survey_id}",
                    "summary": (
                        "Direct human answers to the completed "
                        f"{survey_id} validation survey."
                    ),
                    "sensitivity": "private",
                    "runtime_excerpt_allowed": True,
                    "validation_survey_id": str(survey_id),
                }
            )

        definition = definition_surveys.get(str(survey_id), {})
        questions = _questions_by_id(definition)
        for question_id, answer_id_value in answers.items():
            answer_id = str(answer_id_value)
            question = questions.get(str(question_id), {})
            options = _option_records(question)
            selected = next(
                (option for option in options if option["id"] == answer_id),
                {"id": answer_id, "label": answer_id},
            )
            scenario = {
                "domain": str(survey_id),
                "summary": str(question.get("prompt") or question_id),
                "survey_title": definition.get("title"),
                "stakes": "low",
                "reversibility": "high",
                "time_horizon": "immediate",
                "social_context": "self_report",
            }
            cases.append(
                {
                    "id": (
                        f"case_validation_{_stable_id(survey_id)}_"
                        f"{_stable_id(question_id)}"
                    ),
                    "observed_at": _date(human.get("completedAt"), generated_at),
                    "scenario": scenario,
                    "options": options,
                    "choice": selected,
                    "selected_option_id": answer_id,
                    "ranking": [],
                    "user_rationale": None,
                    "outcome": None,
                    "evidence_type": "direct_self_report",
                    "source_refs": [source_id],
                    "sensitivity": "private",
                    "dataset_role": "development",
                }
            )

    return cases, sources


def _curation_records(
    curation: Mapping[str, Any], primary: str, alias: str | None = None
) -> list[dict[str, Any]]:
    value = curation.get(primary)
    if value is None and alias is not None:
        value = curation.get(alias)
    return _as_records(value, primary)


def _curated_claim_reference_list(
    value: Any, field: str, *, require_nonempty: bool = False
) -> list[str]:
    if not isinstance(value, list):
        raise ValueError(f"{field} must be a list")
    references: list[str] = []
    for index, item in enumerate(value, start=1):
        if not isinstance(item, str) or not RECORD_ID.fullmatch(item):
            raise ValueError(
                f"{field} item {index} must be a valid source ID"
            )
        if item in references:
            raise ValueError(f"{field} contains duplicate source ID '{item}'")
        references.append(item)
    if require_nonempty and not references:
        raise ValueError(f"{field} must contain at least one source ID")
    return references


def _curated_claims(
    curation: Mapping[str, Any], generated_at: str
) -> list[dict[str, Any]]:
    """Normalize untrusted curated claims without granting owner confirmation."""

    records = _curation_records(curation, "claims")
    claims: list[dict[str, Any]] = []
    confidence_fields = {
        "label",
        "basis",
        "score",
        "directness",
        "repetition",
        "consistency",
        "recency",
        "context_match",
    }
    scope_fields = {"domains", "conditions", "stakes"}

    for index, record in enumerate(records, start=1):
        context = f"curated claim {index}"
        unsupported = sorted(set(record) - CURATED_CLAIM_FIELDS)
        if unsupported:
            raise ValueError(
                f"{context} contains unsupported fields: " + ", ".join(unsupported)
            )
        missing = sorted(CURATED_CLAIM_REQUIRED_FIELDS - set(record))
        if missing:
            raise ValueError(
                f"{context} is missing fields: " + ", ".join(missing)
            )

        claim_id = record.get("id")
        if not isinstance(claim_id, str) or not RECORD_ID.fullmatch(claim_id):
            raise ValueError(f"{context}.id must be a valid record ID")

        predicate = record.get("predicate")
        if not isinstance(predicate, str) or not predicate.strip():
            raise ValueError(f"curated claim '{claim_id}'.predicate must be non-empty")
        predicate = predicate.strip()
        if predicate.casefold().startswith("legacy_dimension."):
            raise ValueError(
                f"curated claim '{claim_id}' cannot use reserved predicate "
                f"'{predicate}'"
            )

        subject = record.get("subject", "self")
        if not isinstance(subject, str) or not subject.strip():
            raise ValueError(f"curated claim '{claim_id}'.subject must be non-empty")

        for field in ("label", "category"):
            value = record.get(field)
            if value is not None and not isinstance(value, str):
                raise ValueError(
                    f"curated claim '{claim_id}'.{field} must be a string or null"
                )

        scope = record.get("scope", {})
        if not isinstance(scope, dict):
            raise ValueError(f"curated claim '{claim_id}'.scope must be a mapping")
        unsupported_scope = sorted(set(scope) - scope_fields)
        if unsupported_scope:
            raise ValueError(
                f"curated claim '{claim_id}'.scope contains unsupported fields: "
                + ", ".join(unsupported_scope)
            )
        normalized_scope = {
            field: _claim_review_string_list(
                scope.get(field, []), f"curated claim '{claim_id}'.scope.{field}"
            )
            for field in ("domains", "conditions")
        }
        if "stakes" in scope:
            normalized_scope["stakes"] = _claim_review_string_list(
                scope.get("stakes"), f"curated claim '{claim_id}'.scope.stakes"
            )

        confidence = record.get("confidence")
        if not isinstance(confidence, dict):
            raise ValueError(
                f"curated claim '{claim_id}'.confidence must be a mapping"
            )
        unsupported_confidence = sorted(set(confidence) - confidence_fields)
        if unsupported_confidence:
            raise ValueError(
                f"curated claim '{claim_id}'.confidence contains unsupported fields: "
                + ", ".join(unsupported_confidence)
            )
        confidence_label = confidence.get("label")
        if confidence_label not in {"high", "medium", "low", "unknown"}:
            raise ValueError(
                f"curated claim '{claim_id}'.confidence.label is invalid"
            )
        confidence_basis = confidence.get("basis")
        if not isinstance(confidence_basis, str) or not confidence_basis.strip():
            raise ValueError(
                f"curated claim '{claim_id}'.confidence.basis must be non-empty"
            )
        normalized_confidence = deepcopy(confidence)
        normalized_confidence["basis"] = confidence_basis.strip()
        score = normalized_confidence.get("score")
        if score is not None and (
            isinstance(score, bool)
            or not isinstance(score, (int, float))
            or not 0 <= score <= 1
        ):
            raise ValueError(
                f"curated claim '{claim_id}'.confidence.score must be between 0 and 1"
            )
        for field in confidence_fields - {"label", "basis", "score"}:
            value = normalized_confidence.get(field)
            if value is not None and (
                isinstance(value, bool) or not isinstance(value, (str, int, float))
            ):
                raise ValueError(
                    f"curated claim '{claim_id}'.confidence.{field} must be a "
                    "string or number"
                )

        evidence_refs = _curated_claim_reference_list(
            record.get("evidence_refs"),
            f"curated claim '{claim_id}'.evidence_refs",
            require_nonempty=True,
        )
        counterevidence_refs = _curated_claim_reference_list(
            record.get("counterevidence_refs", []),
            f"curated claim '{claim_id}'.counterevidence_refs",
        )

        sensitivity = record.get("sensitivity")
        if sensitivity not in SENSITIVITY_VALUES:
            raise ValueError(
                f"curated claim '{claim_id}'.sensitivity must be public, private, "
                "or sensitive"
            )
        runtime_included = _boolean_field(
            record,
            "runtime_included",
            default=False,
            context=f"curated claim '{claim_id}'",
        )
        status = record.get("status", "provisional")
        if status not in {"provisional", "withheld"}:
            raise ValueError(
                f"curated claim '{claim_id}'.status must be provisional or withheld "
                "before owner review"
            )
        if record.get("user_confirmed", False) is not False:
            raise ValueError(
                f"curated claim '{claim_id}'.user_confirmed must be false before "
                "owner review"
            )
        if record.get("needs_review", True) is not True:
            raise ValueError(
                f"curated claim '{claim_id}'.needs_review must be true before owner "
                "review"
            )
        if sensitivity == "sensitive" or record.get("value") is None:
            if runtime_included or status != "withheld":
                raise ValueError(
                    f"curated claim '{claim_id}' with sensitive or null value must "
                    "be withheld from runtime"
                )
        elif status == "withheld" or not runtime_included:
            if status != "withheld" or runtime_included:
                raise ValueError(
                    f"curated claim '{claim_id}' must pair provisional status with "
                    "runtime inclusion or withheld status with runtime exclusion"
                )

        source_selection = record.get("source_selection", "curation")
        if source_selection is not None and not isinstance(source_selection, str):
            raise ValueError(
                f"curated claim '{claim_id}'.source_selection must be a string or null"
            )

        normalized: dict[str, Any] = {
            "id": claim_id,
            "subject": subject.strip(),
            "predicate": predicate,
            "label": record.get("label"),
            "category": record.get("category"),
            "value": deepcopy(record.get("value")),
            "scope": normalized_scope,
            "status": status,
            "confidence": normalized_confidence,
            "evidence_refs": evidence_refs,
            "counterevidence_refs": counterevidence_refs,
            "sensitivity": sensitivity,
            "runtime_included": runtime_included,
            "source_selection": source_selection,
            "needs_review": True,
            "user_confirmed": False,
        }
        for field in ("observed_at", "effective_from", "effective_to"):
            if field not in record:
                continue
            value = record.get(field)
            _validate_date_or_datetime(
                value,
                f"curated claim '{claim_id}'.{field}",
                nullable=field in {"effective_from", "effective_to"},
            )
            normalized[field] = value
        _validate_not_future(
            normalized.get("observed_at"),
            generated_at,
            f"curated claim '{claim_id}'.observed_at",
        )
        if (
            isinstance(normalized.get("effective_from"), str)
            and isinstance(normalized.get("effective_to"), str)
            and _temporal_value_is_after(
                normalized["effective_from"], normalized["effective_to"]
            )
        ):
            raise ValueError(
                f"curated claim '{claim_id}'.effective_to must not predate "
                "effective_from"
            )
        claims.append(normalized)

    _ensure_unique(claims, "curated claim")
    return claims


def _validate_claim_source_references(
    claims: Sequence[Mapping[str, Any]], sources: Sequence[Mapping[str, Any]]
) -> None:
    source_ids = {
        str(source.get("id"))
        for source in sources
        if isinstance(source.get("id"), str)
    }
    for claim in claims:
        claim_id = claim.get("id")
        for field in ("evidence_refs", "counterevidence_refs"):
            references = claim.get(field, [])
            if not isinstance(references, list):
                raise ValueError(f"claim '{claim_id}'.{field} must be a list")
            for reference in references:
                if reference not in source_ids:
                    raise ValueError(
                        f"claim '{claim_id}' has unknown source reference "
                        f"'{reference}' in {field}"
                    )


def _validation_source_refs(
    curated_sources: Sequence[Mapping[str, Any]],
) -> dict[str, str]:
    """Map completed survey IDs to their explicitly reviewed source records."""

    references: dict[str, str] = {}
    for source in curated_sources:
        raw_survey_id = source.get("validation_survey_id")
        if raw_survey_id is None:
            continue
        if not isinstance(raw_survey_id, str) or not raw_survey_id.strip():
            raise ValueError("source.validation_survey_id must be a non-empty string")
        survey_id = raw_survey_id.strip()
        source_id = source.get("id")
        if not isinstance(source_id, str) or not source_id.strip():
            raise ValueError(
                f"validation source for survey '{survey_id}' must have a stable ID"
            )
        if source.get("authorship") != "person":
            raise ValueError(
                f"validation source '{source_id}' must have person authorship"
            )
        existing = references.get(survey_id)
        if existing is not None and existing != source_id:
            raise ValueError(
                f"multiple reviewed sources map to validation survey '{survey_id}'"
            )
        references[survey_id] = source_id
    return references


def _profile_data(curation: Mapping[str, Any], persona: Mapping[str, Any]) -> dict[str, Any]:
    profile = curation.get("profile", {})
    if not isinstance(profile, dict):
        raise ValueError("curation field 'profile' must be a mapping")
    summary = (
        profile.get("summary")
        or curation.get("profile_summary")
        or persona.get("summary")
        or "No reviewed profile summary is available."
    )
    style = profile.get("communication_style") or curation.get("communication_style") or []

    def flatten_style(value: Any, prefix: str = "") -> list[str]:
        if value in (None, "", [], {}):
            return []
        if isinstance(value, str):
            return [f"{prefix}: {value}" if prefix else value]
        if isinstance(value, list):
            flattened: list[str] = []
            for item in value:
                flattened.extend(flatten_style(item, prefix))
            return flattened
        if isinstance(value, dict):
            flattened = []
            for key, child in value.items():
                label = str(key).replace("_", " ").strip().title()
                child_prefix = f"{prefix} - {label}" if prefix else label
                flattened.extend(flatten_style(child, child_prefix))
            return flattened
        raise ValueError("communication_style values must be strings, lists, or mappings")

    gaps = (
        profile.get("known_gaps")
        or profile.get("gaps")
        or curation.get("known_gaps")
        or curation.get("gaps")
        or []
    )
    if isinstance(gaps, str):
        gaps = [gaps]
    if not isinstance(gaps, list):
        raise ValueError("known_gaps must be a string or list")
    sensitivity = profile.get("sensitivity") or "private"
    if not isinstance(sensitivity, str) or sensitivity not in SENSITIVITY_VALUES:
        raise ValueError(
            "curation field 'profile.sensitivity' must be one of: "
            + ", ".join(sorted(SENSITIVITY_VALUES))
        )
    return {
        "summary": str(summary),
        "communication_style": flatten_style(style),
        "system_prompt": profile.get("system_prompt") or persona.get("system_prompt"),
        "gaps": [str(item) for item in gaps],
        "sensitivity": sensitivity,
        "source_refs": [str(item) for item in profile.get("source_refs", [])],
        "runtime_included": profile.get("runtime_included") is True,
    }


def _current_state(curation: Mapping[str, Any], generated_at: str) -> dict[str, Any]:
    value = curation.get("current_state", {})
    if not isinstance(value, dict):
        raise ValueError("curation field 'current_state' must be a mapping")
    state = {
        "as_of": generated_at[:10],
        "expires_at": None,
        "active_goals": [],
        "current_projects": [],
        "temporary_constraints": [],
        "capacity": "unknown",
        "sensitivity": "private",
        "runtime_included": False,
    }
    state.update(deepcopy(value))
    _validate_date_or_datetime(state.get("as_of"), "current_state.as_of")
    _validate_not_future(state.get("as_of"), generated_at, "current_state.as_of")
    sensitivity = state.get("sensitivity")
    if sensitivity not in SENSITIVITY_VALUES:
        raise ValueError(
            "current_state.sensitivity must be public, private, or sensitive"
        )
    if sensitivity == "sensitive":
        state["runtime_included"] = False
    if state.get("runtime_included") is True and state.get("expires_at") is None:
        raise ValueError(
            "current_state.expires_at must be set when runtime_included is true"
        )
    _validate_date_or_datetime(
        state.get("expires_at"),
        "current_state.expires_at",
        nullable=True,
    )
    return state


def _mapping_or_default(
    curation: Mapping[str, Any], field: str, default: Mapping[str, Any]
) -> dict[str, Any]:
    value = curation.get(field)
    if value is None:
        return deepcopy(dict(default))
    if not isinstance(value, dict):
        raise ValueError(f"curation field '{field}' must be a mapping")
    merged = deepcopy(dict(default))
    merged.update(deepcopy(value))
    return merged


def _choice_text(choice: Any) -> str:
    if isinstance(choice, dict):
        return str(choice.get("label") or choice.get("id") or choice)
    return str(choice)


def _render_value(value: Any) -> str:
    if isinstance(value, bool):
        return "yes" if value else "no"
    if value is None:
        return "unknown"
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False, sort_keys=True)
    return str(value)


def _policy_text(policy: Mapping[str, Any]) -> str:
    when = policy.get("when")
    prefer = policy.get("prefer")
    over = policy.get("over")
    parts: list[str] = []
    if isinstance(policy.get("summary"), str):
        parts.append(str(policy["summary"]))
    if when:
        parts.append(f"When {_render_value(when)}")
    if prefer:
        parts.append(f"prefer {_render_value(prefer)}")
    if over:
        parts.append(f"over {_render_value(over)}")
    exceptions = policy.get("exceptions")
    if exceptions:
        parts.append(f"exceptions: {_render_value(exceptions)}")
    if policy.get("strength"):
        parts.append(f"strength: {_render_value(policy.get('strength'))}")
    if policy.get("case_refs"):
        parts.append(f"behavioral cases: {_render_value(policy.get('case_refs'))}")
    if policy.get("source_refs"):
        parts.append(f"sources: {_render_value(policy.get('source_refs'))}")
    return ", ".join(parts) or "No policy summary was provided."


def _markdown_list(items: Iterable[str], empty: str) -> str:
    values = [str(item).strip() for item in items if str(item).strip()]
    if not values:
        return empty
    return "\n".join(f"- {value}" for value in values)


def _runtime_reference_ids(
    value: Any,
    reference_keys: frozenset[str],
) -> set[str] | None:
    """Collect typed references, returning None for malformed reference fields."""
    references: set[str] = set()
    valid = True

    def visit(child: Any) -> None:
        nonlocal valid
        if isinstance(child, Mapping):
            for key, nested in child.items():
                if key in reference_keys:
                    if isinstance(nested, str) and nested.strip():
                        references.add(nested.strip())
                    elif isinstance(nested, list) and all(
                        isinstance(item, str) and item.strip() for item in nested
                    ):
                        references.update(item.strip() for item in nested)
                    elif nested not in (None, []):
                        valid = False
                else:
                    visit(nested)
        elif isinstance(child, list):
            for nested in child:
                visit(nested)

    visit(value)
    return references if valid else None


def _runtime_references_resolve(
    record: Mapping[str, Any],
    *,
    claim_ids: set[str],
    policy_ids: set[str],
    case_ids: set[str],
) -> bool:
    """Fail closed unless every typed reference resolves to a runtime-safe target."""
    for keys, allowed_ids in (
        (RUNTIME_CLAIM_REFERENCE_KEYS, claim_ids),
        (RUNTIME_POLICY_REFERENCE_KEYS, policy_ids),
        (RUNTIME_CASE_REFERENCE_KEYS, case_ids),
    ):
        references = _runtime_reference_ids(record, keys)
        if references is None or not references.issubset(allowed_ids):
            return False
    return True


def _filter_runtime_reference_graph(
    runtime_claims: Sequence[Mapping[str, Any]],
    runtime_cases: Sequence[Mapping[str, Any]],
    runtime_policies: Sequence[Mapping[str, Any]],
    runtime_counterexamples: Sequence[Mapping[str, Any]],
    runtime_conflicts: Sequence[Mapping[str, Any]],
) -> tuple[
    list[Mapping[str, Any]],
    list[Mapping[str, Any]],
    list[Mapping[str, Any]],
    list[Mapping[str, Any]],
]:
    """Prune runtime records until all cross-record references are safe."""
    runtime_claim_ids = {
        str(claim.get("id"))
        for claim in runtime_claims
        if isinstance(claim.get("id"), str)
    }
    cases_by_id = {
        str(case.get("id")): case
        for case in runtime_cases
        if isinstance(case.get("id"), str)
    }
    policies_by_id = {
        str(policy.get("id")): policy
        for policy in runtime_policies
        if isinstance(policy.get("id"), str)
    }

    while True:
        case_ids = set(cases_by_id)
        policy_ids = set(policies_by_id)
        next_cases = {
            identifier: case
            for identifier, case in cases_by_id.items()
            if _runtime_references_resolve(
                case,
                claim_ids=runtime_claim_ids,
                policy_ids=policy_ids,
                case_ids=case_ids,
            )
        }
        next_policies = {
            identifier: policy
            for identifier, policy in policies_by_id.items()
            if _runtime_references_resolve(
                policy,
                claim_ids=runtime_claim_ids,
                policy_ids=policy_ids,
                case_ids=case_ids,
            )
        }
        if set(next_cases) == case_ids and set(next_policies) == policy_ids:
            break
        cases_by_id = next_cases
        policies_by_id = next_policies

    runtime_case_ids = set(cases_by_id)
    runtime_policy_ids = set(policies_by_id)
    allowed_target_ids = runtime_claim_ids | runtime_policy_ids
    safe_counterexamples = [
        record
        for record in runtime_counterexamples
        if isinstance(record.get("claim_or_policy_id"), str)
        and str(record.get("claim_or_policy_id")) in allowed_target_ids
        and _runtime_references_resolve(
            record,
            claim_ids=runtime_claim_ids,
            policy_ids=runtime_policy_ids,
            case_ids=runtime_case_ids,
        )
    ]
    safe_conflicts = [
        record
        for record in runtime_conflicts
        if _runtime_references_resolve(
            record,
            claim_ids=runtime_claim_ids,
            policy_ids=runtime_policy_ids,
            case_ids=runtime_case_ids,
        )
    ]
    return (
        list(cases_by_id.values()),
        list(policies_by_id.values()),
        safe_counterexamples,
        safe_conflicts,
    )


def _adapter_files(
    display_name: str,
    content_version: str,
    profile: Mapping[str, Any],
    claims: Sequence[Mapping[str, Any]],
    policies: Sequence[Mapping[str, Any]],
    cases: Sequence[Mapping[str, Any]],
    counterexamples: Sequence[Mapping[str, Any]],
    conflicts: Sequence[Mapping[str, Any]],
    current_state: Mapping[str, Any],
    boundaries: Mapping[str, Any],
    sources: Sequence[Mapping[str, Any]],
    consent: Mapping[str, Any],
    coverage: Mapping[str, Any],
    generated_at: str,
    *,
    included_case_ids: set[str] | None = None,
) -> dict[str, str]:
    source_by_id = {
        str(source.get("id")): source for source in sources if source.get("id")
    }
    allowed_source_ids = {
        str(item) for item in consent.get("allowed_sources", []) or []
    }

    def source_authorized(reference: str, seen: set[str] | None = None) -> bool:
        seen = set() if seen is None else set(seen)
        if reference in seen:
            return False
        seen.add(reference)
        source = source_by_id.get(reference, {})
        if source.get("sensitivity") == "sensitive":
            return False
        authorship = source.get("authorship")
        parent = source.get("parent_source_ref")
        parent_authorized = isinstance(parent, str) and source_authorized(parent, seen)
        if authorship == "assistant":
            return parent_authorized
        if authorship in {"person", "mixed"}:
            return reference in allowed_source_ids
        return False

    def source_refs(value: Any) -> set[str]:
        refs: set[str] = set()
        if isinstance(value, dict):
            for key, child in value.items():
                if key in {"evidence_refs", "source_refs", "counterevidence_refs"}:
                    if isinstance(child, str):
                        refs.add(child)
                    elif isinstance(child, list):
                        refs.update(str(item) for item in child)
                else:
                    refs.update(source_refs(child))
        elif isinstance(value, list):
            for child in value:
                refs.update(source_refs(child))
        return refs

    def runtime_safe(record: Mapping[str, Any]) -> bool:
        if record.get("sensitivity") not in RUNTIME_SAFE_SENSITIVITIES:
            return False
        if record.get("runtime_included") is False:
            return False
        effective_from = record.get("effective_from")
        if isinstance(effective_from, str) and _temporal_value_is_after(
            effective_from, generated_at
        ):
            return False
        effective_to = record.get("effective_to")
        if isinstance(effective_to, str) and _is_expired(effective_to, generated_at):
            return False
        record_source_refs = source_refs(record)
        if not record_source_refs:
            return False
        return all(
            source_by_id.get(reference, {}).get("sensitivity") != "sensitive"
            and source_authorized(reference)
            for reference in record_source_refs
        )

    runtime_claims = [
        claim
        for claim in claims
        if claim.get("status") == "active"
        and claim.get("user_confirmed") is True
        and claim.get("runtime_included") is True
        and runtime_safe(claim)
    ]
    runtime_cases = [
        case
        for case in cases
        if str(case.get("dataset_role")) != "holdout" and runtime_safe(case)
    ]
    runtime_policies = [
        policy
        for policy in policies
        if runtime_safe(policy)
    ]
    (
        runtime_cases,
        runtime_policies,
        runtime_counterexamples,
        runtime_conflicts,
    ) = _filter_runtime_reference_graph(
        runtime_claims,
        runtime_cases,
        runtime_policies,
        [record for record in counterexamples if runtime_safe(record)],
        [record for record in conflicts if runtime_safe(record)],
    )
    if included_case_ids is not None:
        included_case_ids.clear()
        included_case_ids.update(
            str(case.get("id"))
            for case in runtime_cases
            if isinstance(case.get("id"), str)
        )

    claim_lines = []
    for claim in runtime_claims:
        confidence = claim.get("confidence", {})
        confidence_label = (
            confidence.get("label") if isinstance(confidence, dict) else "unknown"
        )
        claim_lines.append(
            f"`{claim['id']}` - {claim.get('label') or claim.get('predicate')}: "
            f"{_render_value(claim.get('value'))} ({confidence_label} confidence; "
            f"scope: {_render_value(claim.get('scope') or 'general')})"
        )

    policy_lines = [
        f"`{policy.get('id')}` - {_policy_text(policy)}"
        for policy in runtime_policies
    ]
    case_sections: list[str] = []
    for case in runtime_cases:
        scenario = case.get("scenario", {})
        if isinstance(scenario, dict):
            summary = scenario.get("summary") or scenario.get("prompt") or "Unknown scenario"
        else:
            summary = str(scenario)
        rationale = case.get("user_rationale")
        body = [
            f"## `{case.get('id')}`",
            "",
            f"Scenario: {summary}",
            "",
            f"Observed choice: {_choice_text(case.get('choice'))}",
        ]
        if isinstance(scenario, dict):
            context = {
                key: scenario.get(key)
                for key in (
                    "domain",
                    "stakes",
                    "reversibility",
                    "time_horizon",
                    "social_context",
                    "actors",
                    "constraints",
                )
                if scenario.get(key) not in (None, "", [], {})
            }
            if context:
                body.extend(["", f"Scenario context: {_render_value(context)}"])
        options = case.get("options")
        if isinstance(options, list) and options:
            body.extend(
                ["", "Options considered: " + "; ".join(_choice_text(item) for item in options)]
            )
        ranking = case.get("ranking")
        if isinstance(ranking, list) and ranking:
            body.extend(
                ["", "Observed ranking: " + " > ".join(_choice_text(item) for item in ranking)]
            )
        if rationale:
            body.extend(["", f"Person's rationale: {rationale}"])
        outcome = case.get("outcome")
        if outcome not in (None, "", [], {}):
            body.extend(["", f"Observed outcome: {_render_value(outcome)}"])
        case_sections.append("\n".join(body))

    counter_lines = []
    for record in runtime_counterexamples:
        context = record.get("context") or record.get("summary") or "Unspecified context"
        behavior = record.get("behavior") or record.get("exception") or "Unspecified behavior"
        counter_lines.append(f"`{record.get('id')}` - {context}: {behavior}")

    conflict_lines = []
    for record in runtime_conflicts:
        conflict_lines.append(
            f"`{record.get('id')}` - {record.get('summary')}. "
            f"Handling: {record.get('handling')}. "
            f"Runtime effect: {record.get('runtime_effect')}"
        )

    expires_at = current_state.get("expires_at")
    state_expired = bool(
        isinstance(expires_at, str) and _is_expired(expires_at, generated_at)
    )
    state_runtime_safe = (
        current_state.get("runtime_included") is True
        and not state_expired
        and runtime_safe(current_state)
    )
    if current_state.get("runtime_included") is not True or not runtime_safe(current_state):
        state_lines = ["- No runtime-safe current context is available."]
    elif state_expired:
        state_lines = [
            f"- Stored current context expired on {expires_at[:10]} and must not be "
            "used without fresh confirmation."
        ]
    else:
        state_lines = [f"- As of: {_render_value(current_state.get('as_of'))}"]
        state_lines.append(f"- Expires at: {_render_value(expires_at)}")
        for key in ("active_goals", "current_projects", "temporary_constraints", "capacity"):
            value = current_state.get(key)
            if value not in (None, [], {}, ""):
                state_lines.append(
                    f"- {key.replace('_', ' ').title()}: {_render_value(value)}"
                )

    boundary_sections = []
    for key in ("allowed", "ask_before", "never"):
        value = boundaries.get(key, [])
        items = value if isinstance(value, list) else [value]
        boundary_sections.extend(
            [
                f"## {key.replace('_', ' ').title()}",
                "",
                _markdown_list(items, "- None recorded."),
                "",
            ]
        )

    referenced_sources: set[str] = set()
    profile_runtime_safe = profile.get("runtime_included") is True and runtime_safe(profile)
    runtime_records: list[Mapping[str, Any]] = [
        *runtime_claims,
        *runtime_policies,
        *runtime_cases,
        *runtime_counterexamples,
        *runtime_conflicts,
    ]
    if state_runtime_safe:
        runtime_records.append(current_state)
    if profile_runtime_safe:
        runtime_records.append(profile)
    for record in runtime_records:
        referenced_sources.update(source_refs(record))
    source_lines = []
    for source in sources:
        if source.get("id") not in referenced_sources:
            continue
        if source.get("sensitivity") == "sensitive":
            continue
        if not source_authorized(str(source.get("id"))):
            continue
        if source.get("runtime_excerpt_allowed") is True:
            summary = source.get("summary") or source.get("source_type") or "source"
        else:
            summary = "source detail withheld from the runtime adapter"
        source_lines.append(f"`{source.get('id')}` - {summary}")

    style = profile.get("communication_style", []) if profile_runtime_safe else []
    if not isinstance(style, list):
        style = [style]
    gaps = profile.get("gaps", []) if profile_runtime_safe else []
    if not isinstance(gaps, list):
        gaps = [gaps]

    coverage_status = str(coverage.get("status") or "unvalidated")
    validated_domains = coverage.get("validated_domains")
    domain_text = (
        ", ".join(str(item) for item in validated_domains)
        if isinstance(validated_domains, list) and validated_domains
        else "none"
    )
    coverage_lines = [
        f"- Status: {coverage_status}",
        f"- Validated domains: {domain_text}",
    ]
    baseline = coverage.get("baseline_only")
    if isinstance(baseline, dict):
        baseline_fields = (
            ("experiments", "experiments"),
            ("agent_runs", "agent runs"),
            ("questions", "questions"),
            ("benchmarked_surveys", "benchmarked surveys"),
            ("agent_consistency_percent", "agent consistency percent"),
            ("benchmark_similarity_percent", "benchmark similarity percent"),
            ("exact_match_percent", "exact match percent"),
            ("comparisons", "comparisons"),
        )
        safe_metrics = [
            f"{label}: {baseline[key]}"
            for key, label in baseline_fields
            if isinstance(baseline.get(key), (int, float))
            and type(baseline.get(key)) is not bool
        ]
        if safe_metrics:
            coverage_lines.append(
                "- Legacy baseline only, not Choiceprint validation: "
                + "; ".join(safe_metrics)
            )
    next_gate = coverage.get("next_gate")
    if isinstance(next_gate, dict):
        minimum_cases = next_gate.get(
            "minimum_private_holdout_cases_per_claimed_domain"
        )
        if isinstance(minimum_cases, int) and type(minimum_cases) is not bool:
            coverage_lines.append(
                "- Next evaluation gate: at least "
                f"{minimum_cases} private holdout cases per claimed domain"
            )
        if next_gate.get("human_retest_required") is True:
            coverage_lines.append("- Human retest required before a validation claim")
    coverage_text = "\n".join(coverage_lines)
    read_first = f"""# Read first

This private Choiceprint Project Pack describes {display_name}. It was compiled as
content version {content_version}. It supports evidence-backed prediction within
documented coverage, not literal identity or reliable prediction in every scenario.

## Coverage

{coverage_text}

Do not upload `evals/holdout-private.jsonl` into this ChatGPT Project.
"""
    core_profile = f"""# Core profile

## Reviewed summary

{profile.get('summary') if profile_runtime_safe else 'Reviewed profile summary withheld from this adapter.'}

## Communication style

{_markdown_list(style, 'No separately reviewed communication rules are available.')}

## Active and provisional claims

{_markdown_list(claim_lines, 'No runtime claims are available.')}

## Known evidence gaps

{_markdown_list(gaps, 'No additional gaps were recorded.')}
"""
    decision_rules = f"""# Decision rules

{_markdown_list(policy_lines, 'No reviewed decision policies are available.')}
"""
    decision_cases = "# Decision cases\n\n" + (
        "\n\n".join(case_sections)
        if case_sections
        else "No observed development cases are available."
    ) + "\n"
    counterexample_text = f"""# Counterexamples

{_markdown_list(counter_lines, 'No reviewed counterexamples are available.')}
"""
    conflict_text = f"""# Conflicts

{_markdown_list(conflict_lines, 'No reviewed conflicts are available.')}
"""
    current_context = "# Current context\n\n" + "\n".join(state_lines) + "\n"
    boundary_text = "# Boundaries\n\n" + "\n".join(boundary_sections).rstrip() + "\n"
    evidence_index = f"""# Evidence index

{_markdown_list(source_lines, 'No runtime evidence summaries are available.')}
"""
    consent_text = f"""# Consent

## Allowed modes

{_markdown_list(consent.get('allowed_modes', []), '- None recorded.')}

## Allowed uses

{_markdown_list(consent.get('allowed_uses', []), '- None recorded.')}

## Prohibited uses

{_markdown_list(consent.get('prohibited_uses', []), '- None recorded.')}

Publication requires fresh approval: {_render_value(consent.get('publication_requires_fresh_approval'))}
"""
    return {
        "PROJECT-INSTRUCTIONS.md": PROJECT_INSTRUCTIONS,
        "00-READ-FIRST.md": read_first,
        "01-CORE-PROFILE.md": core_profile,
        "02-DECISION-RULES.md": decision_rules,
        "03-DECISION-CASES.md": decision_cases,
        "04-COUNTEREXAMPLES.md": counterexample_text,
        "05-CURRENT-CONTEXT.md": current_context,
        "06-BOUNDARIES.md": boundary_text,
        "07-EVIDENCE-INDEX.md": evidence_index,
        "08-CONFLICTS.md": conflict_text,
        "09-CONSENT.md": consent_text,
    }


def _source_lineage_authorship(
    source_id: str,
    source_by_id: Mapping[str, Mapping[str, Any]],
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
    case: Mapping[str, Any],
    source_by_id: Mapping[str, Mapping[str, Any]],
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


def _development_evals(
    cases: Sequence[Mapping[str, Any]],
    sources: Sequence[Mapping[str, Any]],
    runtime_case_ids: set[str],
) -> list[dict[str, Any]]:
    source_by_id = {
        str(source.get("id")): source
        for source in sources
        if isinstance(source.get("id"), str)
    }
    records: list[dict[str, Any]] = []
    for case in cases:
        if case.get("dataset_role") != "development":
            continue
        provenance = _case_person_provenance(case, source_by_id)
        if provenance is None:
            raise ValueError(
                f"development case '{case.get('id')}' lacks person-grounded source provenance"
            )
        source_label = (
            "person_answered"
            if provenance == "person"
            and case.get("evidence_type")
            in {"direct_self_report", "direct_statement"}
            else "person_observed"
        )
        records.append(
            {
                "id": f"eval_dev_{_stable_id(case.get('id'))}",
                "case_id": case.get("id"),
                "target_type": "choice",
                "expected": case.get("choice"),
                "source": source_label,
                "exposed_to_runtime": str(case.get("id")) in runtime_case_ids,
            }
        )
    return records


def _build_in_directory(
    root: Path,
    persona: Mapping[str, Any],
    validation_results: Mapping[str, Any] | None,
    validation_surveys: Mapping[str, Any] | None,
    curation: Mapping[str, Any],
) -> dict[str, int]:
    generated_at = _now()
    claims, dimension_sources, legacy_dimensions = _compile_claims(
        persona, generated_at
    )
    claims = _merge_unique(
        claims, _curated_claims(curation, generated_at), "claim"
    )
    persona_id = str(persona.get("persona_id") or "person")
    curated_sources = _curation_records(curation, "sources")
    human_cases, validation_sources = _compile_human_validation(
        validation_results,
        validation_surveys,
        generated_at,
        _validation_source_refs(curated_sources),
    )

    sources = _merge_unique(
        [*dimension_sources, *validation_sources], curated_sources, "source"
    )
    if any(source.get("id") == "src_persona_yaml_current" for source in sources):
        for source in sources:
            if source.get("source_type") == "persona_audit":
                source["authorship"] = "assistant"
                source["parent_source_ref"] = "src_persona_yaml_current"
    _validate_claim_source_references(claims, sources)
    _apply_claim_reviews(claims, curation, generated_at, persona_id)
    legacy_dimensions = _reviewed_legacy_dimensions(claims, legacy_dimensions)
    _assert_legacy_dimensions_projection(
        claims, legacy_dimensions, _sensitive_dimension_ids()
    )
    policies = _curation_records(curation, "decision_policies", "policies")
    for policy in policies:
        policy.setdefault("sensitivity", "private")
    curated_cases = _curation_records(curation, "decision_cases", "cases")
    for case in curated_cases:
        if case.get("dataset_role") == "holdout":
            raise ValueError(
                "curated holdout cases must stay outside the compiler input and runtime pack"
            )
        case.setdefault("dataset_role", "development")
        case.setdefault("source_refs", [])
        case.setdefault("sensitivity", "private")
        evidence_type = case.get("evidence_type")
        if (
            evidence_type is not None
            and evidence_type not in PERSON_GROUNDED_EVIDENCE_TYPES
        ):
            raise ValueError(
                f"decision case '{case.get('id')}' has unsupported evidence_type "
                f"'{evidence_type}'"
            )
    cases = _merge_unique(human_cases, curated_cases, "case")
    source_by_id = {
        str(source.get("id")): source
        for source in sources
        if isinstance(source.get("id"), str)
    }
    for case in cases:
        if _case_person_provenance(case, source_by_id) is None:
            raise ValueError(
                f"decision case '{case.get('id')}' lacks person-grounded source provenance"
            )
    source_ids = {str(source.get("id")) for source in sources if source.get("id")}
    case_ids = {str(case.get("id")) for case in cases if case.get("id")}
    for policy in policies:
        case_refs = list(policy.get("case_refs") or [])
        source_refs = list(policy.get("source_refs") or [])
        for reference in policy.pop("evidence_refs", []) or []:
            if reference in case_ids:
                case_refs.append(reference)
            elif reference in source_ids:
                source_refs.append(reference)
            else:
                raise ValueError(
                    f"policy '{policy.get('id')}' has unknown legacy evidence "
                    f"reference '{reference}'"
                )
        policy["case_refs"] = list(dict.fromkeys(case_refs))
        policy["source_refs"] = list(dict.fromkeys(source_refs))
    counterexamples = _curation_records(curation, "counterexamples")
    conflicts = _curation_records(curation, "conflicts")
    for counterexample in counterexamples:
        counterexample.setdefault("sensitivity", "private")
    for conflict in conflicts:
        conflict.setdefault("sensitivity", "private")
    _ensure_unique(claims, "claim")
    _ensure_unique(policies, "policy")
    _ensure_unique(counterexamples, "counterexample")
    _ensure_unique(conflicts, "conflict")

    profile = _profile_data(curation, persona)
    current_state = _current_state(curation, generated_at)
    supplied_consent = curation.get("consent")
    if supplied_consent is not None and not isinstance(supplied_consent, dict):
        raise ValueError("curation field 'consent' must be a mapping")
    if isinstance(supplied_consent, dict) and supplied_consent.get("owner_authorized") is True:
        for field in ("allowed_sources", "allowed_uses", "allowed_modes"):
            value = supplied_consent.get(field)
            if not isinstance(value, list) or not any(
                isinstance(item, str) and item.strip() for item in value
            ):
                raise ValueError(
                    f"consent.{field} must be explicitly present and non-empty "
                    "when owner_authorized is true"
                )
    consent = _mapping_or_default(curation, "consent", DEFAULT_CONSENT)
    allowed_uses = consent.get("allowed_uses")
    if consent.get("owner_authorized") is True and (
        not isinstance(allowed_uses, list)
        or not any(isinstance(item, str) and item.strip() for item in allowed_uses)
    ):
        raise ValueError(
            "consent.allowed_uses must be explicitly present and non-empty when "
            "owner_authorized is true"
        )
    allowed_modes = consent.get("allowed_modes")
    if not isinstance(allowed_modes, list) or any(
        mode not in SUPPORTED_MODES for mode in allowed_modes
    ):
        raise ValueError(
            "consent.allowed_modes must contain only supported mode IDs"
        )
    if consent.get("owner_authorized") is True and not allowed_modes:
        raise ValueError(
            "consent.allowed_modes must explicitly contain supported mode IDs when "
            "owner_authorized is true"
        )
    authorized_at = consent.get("authorized_at")
    _validate_date_or_datetime(
        authorized_at,
        "consent.authorized_at",
        nullable=True,
    )
    if consent.get("owner_authorized") is True:
        if authorized_at is None:
            raise ValueError(
                "consent.authorized_at must be set when owner_authorized is true"
            )
        _validate_not_future(
            authorized_at,
            generated_at,
            "consent.authorized_at",
        )
    elif authorized_at is not None:
        raise ValueError(
            "consent.authorized_at must be null when owner_authorized is false"
        )
    boundaries = _mapping_or_default(curation, "boundaries", DEFAULT_BOUNDARIES)
    _reject_policy_overlaps(consent, boundaries)

    if profile.get("sensitivity") == "sensitive" and profile.get(
        "runtime_included"
    ) is True:
        raise ValueError(
            "sensitive profile overview data cannot be included in the runtime adapter"
        )
    for source in sources:
        source_id = source.get("id")
        evidence_set = source.get("evidence_set")
        if evidence_set is not None and (
            not isinstance(evidence_set, str) or not RECORD_ID.fullmatch(evidence_set)
        ):
            raise ValueError(
                f"source '{source_id}'.evidence_set must be a valid record ID"
            )
        sensitivity = source.get("sensitivity")
        if sensitivity not in SENSITIVITY_VALUES:
            raise ValueError(
                f"source '{source_id}' sensitivity must be public, private, or sensitive"
            )
        if sensitivity == "sensitive" and source.get("runtime_excerpt_allowed") is True:
            raise ValueError(
                f"sensitive source '{source_id}' cannot allow runtime excerpts"
            )
        _validate_not_future(
            source.get("captured_at"),
            generated_at,
            f"source '{source_id}'.captured_at",
        )
    for claim in claims:
        claim_id = claim.get("id")
        if claim.get("sensitivity") == "sensitive" and (
            claim.get("status") != "withheld"
            or claim.get("runtime_included") is not False
        ):
            raise ValueError(
                f"sensitive claim '{claim_id}' must be withheld from runtime"
            )
        for field in ("observed_at", "reviewed_at"):
            _validate_not_future(
                claim.get(field),
                generated_at,
                f"claim '{claim_id}'.{field}",
            )
    for case in cases:
        _validate_not_future(
            case.get("observed_at"),
            generated_at,
            f"decision case '{case.get('id')}'.observed_at",
        )
    for policy in policies:
        _validate_not_future(
            policy.get("reviewed_at"),
            generated_at,
            f"decision policy '{policy.get('id')}'.reviewed_at",
        )
    for collection_name, records in (
        ("counterexample", counterexamples),
        ("conflict", conflicts),
    ):
        for record in records:
            _validate_not_future(
                record.get("observed_at"),
                generated_at,
                f"{collection_name} '{record.get('id')}'.observed_at",
            )
    coverage = curation.get(
        "coverage",
        {
            "status": "unvalidated",
            "declared_domains": [],
            "validated_domains": [],
        },
    )
    if not isinstance(coverage, dict):
        raise ValueError("curation field 'coverage' must be a mapping")
    coverage = deepcopy(coverage)
    allowed_coverage_fields = {
        "status",
        "declared_domains",
        "validated_domains",
        "notes",
        "baseline_only",
        "next_gate",
    }
    unsupported_coverage_fields = sorted(set(coverage) - allowed_coverage_fields)
    if unsupported_coverage_fields:
        raise ValueError(
            "coverage contains unsupported fields: "
            + ", ".join(unsupported_coverage_fields)
        )
    coverage_status = coverage.get("status")
    if coverage_status not in {"unvalidated", "development_only", "example_only"}:
        raise ValueError(
            "coverage.status must be unvalidated, development_only, or example_only"
        )
    validated_domains = coverage.get("validated_domains")
    if validated_domains != []:
        raise ValueError(
            "coverage.validated_domains must stay empty until isolated calibration "
            "artifacts are represented and checked"
        )
    coverage["declared_domains"] = _declared_coverage_domains(
        coverage.get("declared_domains", []), "coverage.declared_domains"
    )
    coverage["validation_events"] = []

    display_name = str(persona.get("display_name") or persona_id)
    content_version = str(curation.get("content_version") or persona.get("version") or "0.1.0")
    counts = {
        "claims": len(claims),
        "active_claims": sum(claim.get("status") == "active" for claim in claims),
        "provisional_claims": sum(
            claim.get("status") == "provisional" for claim in claims
        ),
        "withheld_claims": sum(
            claim.get("status") == "withheld" for claim in claims
        ),
        "policies": len(policies),
        "decision_cases": len(cases),
        "sources": len(sources),
        "conflicts": len(conflicts),
    }
    privacy_class = _maximum_sensitivity(
        [
            profile,
            claims,
            policies,
            cases,
            counterexamples,
            current_state,
            sources,
            conflicts,
        ]
    )
    manifest = {
        "bundle_format": "choiceprint/0.1",
        "schema_version": "0.1",
        "persona_id": persona_id,
        "display_name": display_name,
        "content_version": content_version,
        "created_at": curation.get("created_at") or generated_at,
        "updated_at": generated_at,
        "default_mode": allowed_modes[0] if allowed_modes else None,
        "privacy_class": privacy_class,
        "compatibility": ["chatgpt-project"],
        "source_persona_version": persona.get("version"),
        "profile_summary": profile["summary"],
        "coverage": deepcopy(coverage),
        "counts": counts,
    }

    _write_json(root / "manifest.json", manifest)
    _write_yaml(root / "profile/overview.yaml", profile)
    _write_jsonl(root / "profile/claims.jsonl", claims)
    _write_yaml(root / "profile/decision-policies.yaml", policies)
    _write_jsonl(root / "profile/decision-cases.jsonl", cases)
    _write_jsonl(root / "profile/counterexamples.jsonl", counterexamples)
    _write_yaml(root / "profile/current-state.yaml", current_state)
    _write_yaml(
        root / "profile/legacy-dimensions.yaml",
        {
            "schema_version": persona.get("meta", {}).get("schema_version")
            if isinstance(persona.get("meta"), dict)
            else None,
            "source": "MatrAIx persona runtime dimensions",
            "dimensions": legacy_dimensions,
        },
    )
    _write_jsonl(root / "evidence/sources.jsonl", sources)
    _write_jsonl(root / "evidence/conflicts.jsonl", conflicts)
    _write_yaml(root / "evidence/consent.yaml", consent)
    _write_yaml(root / "safety/boundaries.yaml", boundaries)
    (root / "evals").mkdir(parents=True, exist_ok=True)
    (root / "evals/holdout-private.jsonl").write_text("", encoding="utf-8")

    adapter_generated = (
        consent.get("owner_authorized") is True
        and bool(allowed_uses)
        and bool(allowed_modes)
    )
    runtime_case_ids: set[str] = set()
    adapter_files: dict[str, str] = {}
    if adapter_generated:
        adapter_files = _adapter_files(
            display_name,
            content_version,
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
            coverage,
            generated_at,
            included_case_ids=runtime_case_ids,
        )

    _write_jsonl(
        root / "evals/development.jsonl",
        _development_evals(cases, sources, runtime_case_ids),
    )

    if adapter_generated:
        adapter = root / "adapters/chatgpt-project"
        adapter.mkdir(parents=True, exist_ok=True)
        for filename, text in adapter_files.items():
            (adapter / filename).write_text(text.rstrip() + "\n", encoding="utf-8")

    _write_json(
        root / "build-metadata.json",
        {
            "built_at": generated_at,
            "persona_id": persona_id,
            "human_validation_cases": len(human_cases),
            "curated_cases": len(curated_cases),
            "chatgpt_adapter_generated": adapter_generated,
            "file_sha256": _pack_file_hashes(root),
            "warning": (
                "The holdout placeholder must remain empty. Store real holdout "
                "answers outside every deployable pack and never upload them with "
                "the runtime adapter."
            ),
        },
    )
    if coverage_status != "example_only":
        _secure_pack_permissions(root)
    return counts


def _assert_existing_output_safe(output: Path, *, force: bool) -> None:
    if not (output.exists() or output.is_symlink()):
        return
    if not force:
        raise FileExistsError(f"output already exists: {output}")
    if not output.is_dir() or output.is_symlink():
        raise ValueError(f"refusing to replace a non-directory output: {output}")
    existing_manifest = output / "manifest.json"
    if not existing_manifest.is_file() or existing_manifest.is_symlink():
        raise ValueError(
            "refusing to replace an existing directory without a Choiceprint manifest"
        )
    try:
        existing_manifest_data = json.loads(
            existing_manifest.read_text(encoding="utf-8"),
            object_pairs_hook=_unique_json_object,
        )
    except (OSError, UnicodeError, json.JSONDecodeError, ValueError) as exc:
        raise ValueError(
            "refusing to replace an existing directory with an invalid manifest"
        ) from exc
    if (
        not isinstance(existing_manifest_data, dict)
        or existing_manifest_data.get("bundle_format") != "choiceprint/0.1"
    ):
        raise ValueError(
            "refusing to replace an existing directory that is not a Choiceprint pack"
        )
    for relative_path in COMPILER_OWNED_REQUIRED_PATHS:
        owned_path = output / relative_path
        if not owned_path.is_file() or owned_path.is_symlink():
            raise ValueError(
                "refusing to replace an incomplete or unrecognized Choiceprint pack; "
                f"missing safe compiler-owned file: {relative_path}"
            )
    metadata_path = output / "build-metadata.json"
    try:
        metadata = json.loads(
            metadata_path.read_text(encoding="utf-8"),
            object_pairs_hook=_unique_json_object,
            parse_constant=_reject_json_constant,
        )
    except (OSError, UnicodeError, json.JSONDecodeError, ValueError) as exc:
        raise ValueError(
            "refusing to replace an existing directory with invalid build metadata"
        ) from exc
    if (
        not isinstance(metadata, dict)
        or metadata.get("persona_id") != existing_manifest_data.get("persona_id")
        or not isinstance(metadata.get("file_sha256"), dict)
    ):
        raise ValueError(
            "refusing to replace an existing directory without compiler-owned metadata"
        )
    existing_holdout = output / "evals/holdout-private.jsonl"
    if existing_holdout.exists() or existing_holdout.is_symlink():
        if existing_holdout.is_symlink() or not existing_holdout.is_file():
            raise ValueError("refusing to replace an output with an unsafe holdout path")
        if existing_holdout.read_text(encoding="utf-8").strip():
            raise ValueError(
                "refusing to replace a pack with a non-empty holdout file; "
                "move real holdout data outside the generated pack first"
            )
    allowed_files = (
        set(COMPILER_OWNED_REQUIRED_PATHS) | set(COMPILER_OWNED_ADAPTER_PATHS)
    ) - {"build-metadata.json"}
    actual_files: dict[str, Path] = {}
    for path in sorted(output.rglob("*")):
        relative = path.relative_to(output).as_posix()
        if path.is_symlink():
            raise ValueError(
                f"refusing to replace a pack containing a symlink: {relative}"
            )
        mode = path.lstat().st_mode
        if stat.S_ISDIR(mode):
            continue
        if not stat.S_ISREG(mode):
            raise ValueError(
                f"refusing to replace a pack containing a special path: {relative}"
            )
        if relative != "evals/holdout-private.jsonl" and (
            "holdout" in relative.casefold().replace("_", "-")
            or "held-out" in relative.casefold().replace("_", "-")
            or "heldout" in relative.casefold().replace("_", "-")
        ):
            raise ValueError(
                "refusing to replace a pack containing private evaluation material: "
                f"{relative}"
            )
        if relative != "build-metadata.json":
            actual_files[relative] = path

    expected_hashes = metadata["file_sha256"]
    expected_paths = {str(path) for path in expected_hashes}
    actual_paths = set(actual_files)
    unsupported_paths = sorted(actual_paths - allowed_files)
    if unsupported_paths:
        raise ValueError(
            "refusing to replace a pack containing an untracked file: "
            + unsupported_paths[0]
        )
    unsupported_hash_paths = sorted(expected_paths - allowed_files)
    if unsupported_hash_paths:
        raise ValueError(
            "refusing to replace a pack whose metadata claims an unsupported file: "
            + unsupported_hash_paths[0]
        )
    if actual_paths != expected_paths:
        mismatch = sorted(actual_paths ^ expected_paths)
        raise ValueError(
            "refusing to replace a pack whose files do not match integrity metadata: "
            + (mismatch[0] if mismatch else "unknown path")
        )
    for relative, path in actual_files.items():
        expected_hash = expected_hashes.get(relative)
        if not isinstance(expected_hash, str) or not re.fullmatch(
            r"[a-f0-9]{64}", expected_hash
        ):
            raise ValueError(
                "refusing to replace a pack with invalid integrity metadata for: "
                + relative
            )
        actual_hash = hashlib.sha256(path.read_bytes()).hexdigest()
        if actual_hash != expected_hash:
            raise ValueError(
                "refusing to replace a pack with a modified compiler-owned file: "
                + relative
            )


def _assert_output_is_not_symlink(output: Path) -> None:
    if output.is_symlink():
        raise ValueError(
            f"refusing to use a symlinked Choiceprint output path: {output}"
        )


def _validate_pack_for_build(root: Path, *, label: str) -> None:
    scripts_directory = str(Path(__file__).resolve().parent)
    added_scripts_path = scripts_directory not in sys.path
    if added_scripts_path:
        sys.path.insert(0, scripts_directory)
    try:
        from validate_twin_pack import validate_bundle

        validation = validate_bundle(root)
    finally:
        if added_scripts_path:
            sys.path.remove(scripts_directory)
    if not validation.ok:
        details = "; ".join(validation.errors)
        raise ValueError(f"{label} Choiceprint pack is invalid: {details}")


def _rerender_release_adapter(
    root: Path,
    manifest: Mapping[str, Any],
    *,
    generated_at: str,
) -> None:
    adapter_root = root / "adapters/chatgpt-project"
    if not adapter_root.is_dir():
        return
    profile = _load_yaml_document(root / "profile/overview.yaml")
    policies = _load_yaml_document(root / "profile/decision-policies.yaml")
    current_state = _load_yaml_document(root / "profile/current-state.yaml")
    boundaries = _load_yaml_document(root / "safety/boundaries.yaml")
    consent = _load_yaml_document(root / "evidence/consent.yaml")
    claims = _load_jsonl_objects(root / "profile/claims.jsonl")
    cases = _load_jsonl_objects(root / "profile/decision-cases.jsonl")
    counterexamples = _load_jsonl_objects(root / "profile/counterexamples.jsonl")
    conflicts = _load_jsonl_objects(root / "evidence/conflicts.jsonl")
    sources = _load_jsonl_objects(root / "evidence/sources.jsonl")
    if not all(
        isinstance(value, Mapping)
        for value in (profile, current_state, boundaries, consent)
    ) or not isinstance(policies, list):
        raise ValueError("validated source pack has invalid canonical adapter inputs")
    runtime_case_ids: set[str] = set()
    adapter_files = _adapter_files(
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
        generated_at,
        included_case_ids=runtime_case_ids,
    )
    for filename, text in adapter_files.items():
        (adapter_root / filename).write_text(
            text.rstrip() + "\n",
            encoding="utf-8",
        )
    _write_jsonl(
        root / "evals/development.jsonl",
        _development_evals(cases, sources, runtime_case_ids),
    )


def build_coverage_release(
    source_pack_path: Path | str,
    output_path: Path | str,
    validation_events: Sequence[Mapping[str, Any]],
    *,
    force: bool = False,
) -> dict[str, Any]:
    """Copy a valid pack and append reviewed domain-validation events atomically."""

    raw_source = Path(source_pack_path).expanduser()
    if raw_source.is_symlink():
        raise ValueError("source Choiceprint pack must not be a symlink")
    source = raw_source.resolve()
    if not source.is_dir():
        raise ValueError(f"source Choiceprint pack is not a directory: {source}")

    raw_output = Path(output_path).expanduser()
    lexical_output = Path(os.path.abspath(str(raw_output)))
    _assert_output_is_not_symlink(lexical_output)
    output = lexical_output.parent.resolve() / lexical_output.name
    _assert_output_is_not_symlink(output)
    if output.name in {"", ".", ".."} or not output.name.endswith(".choiceprint"):
        raise ValueError("output must be a narrowly named .choiceprint directory")
    if output in {Path.cwd().resolve(), Path.home().resolve(), Path(output.anchor)}:
        raise ValueError("refusing to use a broad directory as Choiceprint output")
    if source == output or source in output.parents or output in source.parents:
        raise ValueError("source and output Choiceprint paths must be separate")
    if isinstance(validation_events, (str, bytes)) or not isinstance(
        validation_events, Sequence
    ):
        raise ValueError("validation_events must be a nonempty sequence")
    if not validation_events:
        raise ValueError("validation_events must contain at least one reviewed event")

    _assert_existing_output_safe(output, force=force)
    generated_at = _now()

    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = Path(
        tempfile.mkdtemp(prefix=f".{output.name}.tmp-", dir=str(output.parent))
    )
    backup: Path | None = None
    try:
        # Validate the copied snapshot, not the live source. Preserving links makes
        # the canonical validator reject a raced-in link instead of following it
        # and silently blessing the target bytes in a newly rehashed release.
        shutil.copytree(source, temporary, dirs_exist_ok=True, symlinks=True)
        _validate_pack_for_build(temporary, label="source snapshot")
        source_metadata_hash = hashlib.sha256(
            (temporary / "build-metadata.json").read_bytes()
        ).hexdigest()
        sanitized_new_events: list[dict[str, Any]] = []
        for index, raw_event in enumerate(validation_events, start=1):
            if not isinstance(raw_event, Mapping):
                raise ValueError(f"validation event {index} must be a mapping")
            event = deepcopy(dict(raw_event))
            if event.get("source_build_metadata_sha256") != source_metadata_hash:
                raise ValueError(
                    f"validation event {index} source_build_metadata_sha256 does not "
                    "match the source pack snapshot"
                )
            _validate_not_future(
                event.get("recorded_at"),
                generated_at,
                f"validation event {index}.recorded_at",
            )
            sanitized_new_events.append(event)

        manifest = _load_json(temporary / "manifest.json")
        metadata = _load_json(temporary / "build-metadata.json")
        coverage = manifest.get("coverage")
        if not isinstance(coverage, dict):
            raise ValueError("source manifest coverage must be a mapping")
        existing_events = coverage.get("validation_events")
        if not isinstance(existing_events, list):
            raise ValueError("source coverage.validation_events must be a list")
        combined_events = [
            *deepcopy(existing_events),
            *sanitized_new_events,
        ]
        declared_domains = _declared_coverage_domains(
            coverage.get("declared_domains", []),
            "source coverage.declared_domains",
        )
        validated_domains = _validated_domains_from_events(
            combined_events,
            declared_domains=declared_domains,
        )
        next_coverage = deepcopy(coverage)
        next_coverage["declared_domains"] = declared_domains
        next_coverage["status"] = "development_only"
        next_coverage["validation_events"] = combined_events
        next_coverage["validated_domains"] = validated_domains
        manifest["coverage"] = next_coverage
        manifest["updated_at"] = generated_at
        _write_json(temporary / "manifest.json", manifest)

        _rerender_release_adapter(
            temporary,
            manifest,
            generated_at=generated_at,
        )
        metadata["built_at"] = generated_at
        metadata["file_sha256"] = _pack_file_hashes(temporary)
        _write_json(temporary / "build-metadata.json", metadata)
        _secure_pack_permissions(temporary)
        _validate_pack_for_build(temporary, label="coverage release")

        if output.exists() or output.is_symlink():
            _assert_output_is_not_symlink(output)
            _assert_existing_output_safe(output, force=force)
            backup = Path(
                tempfile.mkdtemp(
                    prefix=f".{output.name}.backup-",
                    dir=str(output.parent),
                )
            )
            backup.rmdir()
            output.replace(backup)
        try:
            temporary.replace(output)
        except Exception:
            if backup is not None and backup.exists() and not output.exists():
                backup.replace(output)
            raise
        if backup is not None:
            shutil.rmtree(backup)
        return deepcopy(next_coverage)
    finally:
        if temporary.exists():
            shutil.rmtree(temporary)


def build_choiceprint(
    persona_path: Path | str,
    output_path: Path | str,
    *,
    validation_results_path: Path | str | None = None,
    validation_surveys_path: Path | str | None = None,
    curation_path: Path | str | None = None,
    force: bool = False,
) -> dict[str, int]:
    """Build one Choiceprint pack and return its record counts."""

    persona_file = Path(persona_path).expanduser().resolve()
    raw_output = Path(output_path).expanduser()
    lexical_output = Path(os.path.abspath(str(raw_output)))
    _assert_output_is_not_symlink(lexical_output)
    output = lexical_output.parent.resolve() / lexical_output.name
    _assert_output_is_not_symlink(output)
    if output.name in {"", ".", ".."} or not output.name.endswith(".choiceprint"):
        raise ValueError("output must be a narrowly named .choiceprint directory")
    if output in {Path.cwd().resolve(), Path.home().resolve(), Path(output.anchor)}:
        raise ValueError("refusing to use a broad directory as Choiceprint output")
    validation_results_file = (
        Path(validation_results_path).expanduser().resolve()
        if validation_results_path is not None
        else None
    )
    validation_surveys_file = (
        Path(validation_surveys_path).expanduser().resolve()
        if validation_surveys_path is not None
        else None
    )
    curation_file = (
        Path(curation_path).expanduser().resolve()
        if curation_path is not None
        else None
    )

    for label, input_path in (
        ("persona", persona_file),
        ("validation results", validation_results_file),
        ("validation surveys", validation_surveys_file),
        ("curation", curation_file),
    ):
        if input_path is None:
            continue
        if input_path == output or output in input_path.parents:
            raise ValueError(
                f"{label} input must stay outside the Choiceprint output directory"
            )

    _assert_existing_output_safe(output, force=force)

    persona = _load_yaml(persona_file)
    validation_results = (
        _load_json(validation_results_file) if validation_results_file else None
    )
    validation_surveys = (
        _load_json(validation_surveys_file) if validation_surveys_file else None
    )
    curation = _load_curation(curation_file)

    output.parent.mkdir(parents=True, exist_ok=True)
    _assert_output_is_not_symlink(output)
    temporary = Path(
        tempfile.mkdtemp(prefix=f".{output.name}.tmp-", dir=str(output.parent))
    )
    backup: Path | None = None
    try:
        counts = _build_in_directory(
            temporary,
            persona,
            validation_results,
            validation_surveys,
            curation,
        )
        _validate_pack_for_build(temporary, label="compiled")
        if output.exists() or output.is_symlink():
            _assert_output_is_not_symlink(output)
            _assert_existing_output_safe(output, force=force)
            backup = Path(
                tempfile.mkdtemp(prefix=f".{output.name}.backup-", dir=str(output.parent))
            )
            backup.rmdir()
            output.replace(backup)
        try:
            temporary.replace(output)
        except Exception:
            if backup is not None and backup.exists() and not output.exists():
                backup.replace(output)
            raise
        if backup is not None:
            shutil.rmtree(backup)
        return counts
    finally:
        if temporary.exists():
            shutil.rmtree(temporary)


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--persona", required=True, help="path to persona.yaml")
    parser.add_argument(
        "--validation-results", help="optional path to validation-results.json"
    )
    parser.add_argument(
        "--validation-surveys", help="optional path to validation-surveys.json"
    )
    parser.add_argument("--curation", help="optional reviewed YAML or JSON additions")
    parser.add_argument("--output", required=True, help="output .choiceprint directory")
    parser.add_argument(
        "--force", action="store_true", help="atomically replace an existing output directory"
    )
    args = parser.parse_args(argv)

    counts = build_choiceprint(
        args.persona,
        args.output,
        validation_results_path=args.validation_results,
        validation_surveys_path=args.validation_surveys,
        curation_path=args.curation,
        force=args.force,
    )
    print(
        "Built Choiceprint pack: "
        f"{counts['claims']} claims, {counts['policies']} policies, "
        f"{counts['decision_cases']} decision cases, {counts['sources']} sources"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
