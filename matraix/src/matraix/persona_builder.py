"""Compile and validate local evidence-backed MatrAIx personas.

The builder is deterministic. It never calls a model, reads account history, or
adds facts that are absent from the candidate input. Candidate files and output
personas are local-only artifacts managed by the surrounding bootstrap flow.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import stat
import subprocess
import sys
import tempfile
from collections import Counter
from copy import deepcopy
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

from .persona_dimension_catalog import collect_dimension_items


BASE_CONFIDENCES = (
    "unknown",
    "best_guess",
    "strong_inference",
    "stated",
)
SURVEY_CONFIDENCES = (
    "scale_partial",
    "scale_complete",
    "derived_self_report",
    "self_report",
    "self_report_unknown",
    "self_report_private",
)
ALL_CONFIDENCES = frozenset((*BASE_CONFIDENCES, *SURVEY_CONFIDENCES))
EVIDENCE_BLOCKS = (
    "evidenced",
    "best_guess",
    "sensitive_evidenced",
    "sensitive_best_guess",
    "unresolved",
)
SOURCE_TYPES = frozenset(
    {
        "current_task",
        "memory",
        "chatgpt_history",
        "codex_history",
        "chatgpt_export",
        "user_file",
        "user_statement",
        "other",
    }
)

MODULE_PATH = Path(__file__).resolve()
MATRAIX_ROOT = MODULE_PATH.parents[2]
REPO_ROOT = MODULE_PATH.parents[3]
PERSONA_DIR = MATRAIX_ROOT / "personal-persona"
DEFAULT_SCHEMA_PATH = MATRAIX_ROOT / "persona" / "schema" / "dimensions.json"
DEFAULT_SENSITIVITY_PATH = PERSONA_DIR / "sensitive-dimensions.json"
DEFAULT_CANDIDATES_PATH = PERSONA_DIR / "survey" / "data" / "persona-candidates.json"
DEFAULT_PERSONA_PATH = PERSONA_DIR / "persona.yaml"
DEFAULT_REPORT_PATH = PERSONA_DIR / "survey" / "data" / "persona-build-report.json"

PERSONA_ID_PATTERN = re.compile(r"^[a-z0-9][a-z0-9_-]{0,63}$")
SOURCE_ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")
ABSOLUTE_PATH_PATTERN = re.compile(
    r"/(?:Users|home)/[^/\s]+/|[A-Za-z]:\\Users\\[^\\\s]+\\"
)
SECRET_PATTERNS = (
    re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----"),
    re.compile(r"(?:sk-(?:proj|svcacct)-[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9]{40,})"),
    re.compile(r"(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})"),
)


class PersonaBuildError(ValueError):
    """Candidate or persona data failed a deterministic validation rule."""


@dataclass(frozen=True)
class Catalog:
    """Validated MatrAIx dimension catalog."""

    rows: tuple[dict[str, Any], ...]
    by_id: dict[str, dict[str, Any]]
    order: dict[str, int]
    categories: tuple[str, ...]
    schema_version: str
    sha256: str


@dataclass(frozen=True)
class SensitivityPolicy:
    """Validated set of dimensions withheld pending direct confirmation."""

    dimension_ids: frozenset[str]
    sha256: str
    source: str


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise PersonaBuildError(message)


class _StrictSafeLoader(yaml.SafeLoader):
    """YAML safe loader that rejects duplicate mapping keys."""


def _construct_unique_mapping(
    loader: _StrictSafeLoader,
    node: yaml.nodes.MappingNode,
    deep: bool = False,
) -> dict[Any, Any]:
    mapping: dict[Any, Any] = {}
    for key_node, value_node in node.value:
        key = loader.construct_object(key_node, deep=deep)
        try:
            duplicate = key in mapping
        except TypeError as exc:
            raise PersonaBuildError("YAML mapping keys must be scalar values") from exc
        _require(not duplicate, f"Duplicate YAML mapping key: {key!r}")
        mapping[key] = loader.construct_object(value_node, deep=deep)
    return mapping


_StrictSafeLoader.add_constructor(
    yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG,
    _construct_unique_mapping,
)


def _sha256_path(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _load_json_mapping(path: Path) -> dict[str, Any]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise PersonaBuildError(f"Required file not found: {path}") from exc
    except json.JSONDecodeError as exc:
        raise PersonaBuildError(f"Invalid JSON in {path}: {exc}") from exc
    _require(isinstance(data, dict), f"Expected a JSON object: {path}")
    return data


def _load_yaml_mapping(path: Path) -> dict[str, Any]:
    try:
        data = yaml.load(
            path.read_text(encoding="utf-8"),
            Loader=_StrictSafeLoader,
        )
    except FileNotFoundError as exc:
        raise PersonaBuildError(f"Required file not found: {path}") from exc
    except yaml.YAMLError as exc:
        raise PersonaBuildError(f"Invalid YAML in {path}: {exc}") from exc
    _require(isinstance(data, dict), f"Expected a YAML mapping: {path}")
    return data


def _clean_text(value: str) -> str:
    replacements = {
        "\u2013": "-",
        "\u2014": "-",
        "\u2018": "'",
        "\u2019": "'",
        "\u201c": '"',
        "\u201d": '"',
        "\u00a0": " ",
    }
    for old, new in replacements.items():
        value = value.replace(old, new)
    return " ".join(value.split())


def _safe_note(value: str, field: str, *, max_chars: int) -> str:
    """Normalize a short note while blocking credentials and private paths."""
    cleaned = _clean_text(value)
    _require(bool(cleaned), f"{field} must not be empty")
    _require(len(cleaned) <= max_chars, f"{field} must be at most {max_chars} characters")
    _require(
        ABSOLUTE_PATH_PATTERN.search(cleaned) is None,
        f"{field} must not contain a personal absolute path",
    )
    _require(
        not any(pattern.search(cleaned) for pattern in SECRET_PATTERNS),
        f"{field} appears to contain a credential or private key",
    )
    return cleaned


def _clean_string_list(value: Any, field: str) -> list[str]:
    _require(isinstance(value, list), f"{field} must be a list")
    cleaned: list[str] = []
    for index, item in enumerate(value):
        _require(isinstance(item, str), f"{field}[{index}] must be a string")
        text = _safe_note(item, f"{field}[{index}]", max_chars=500)
        cleaned.append(text)
    _require(len(cleaned) == len(set(cleaned)), f"{field} must not contain duplicates")
    return cleaned


def load_catalog(path: Path = DEFAULT_SCHEMA_PATH) -> Catalog:
    """Load the exact enum catalog used by the persona runtime."""
    data = _load_json_mapping(path)
    rows = data.get("dimensions")
    _require(isinstance(rows, list) and rows, "Dimension catalog has no dimensions list")

    by_id: dict[str, dict[str, Any]] = {}
    order: dict[str, int] = {}
    categories: set[str] = set()
    for position, row in enumerate(rows):
        _require(isinstance(row, dict), f"Dimension row {position} must be an object")
        dim_id = row.get("id")
        _require(isinstance(dim_id, str) and bool(dim_id), f"Dimension row {position} has no ID")
        _require(dim_id not in by_id, f"Duplicate schema dimension ID: {dim_id}")
        values = row.get("values")
        _require(isinstance(values, list) and values, f"Dimension {dim_id} has no values")
        _require(all(isinstance(value, str) for value in values), f"Dimension {dim_id} has a non-string value")
        _require(len(values) == len(set(values)), f"Dimension {dim_id} has duplicate values")
        category = row.get("category")
        _require(isinstance(category, str) and bool(category), f"Dimension {dim_id} has no category")
        by_id[dim_id] = row
        order[dim_id] = position
        categories.add(category)

    return Catalog(
        rows=tuple(rows),
        by_id=by_id,
        order=order,
        categories=tuple(sorted(categories)),
        schema_version=str(data.get("schemaVersion") or "unknown"),
        sha256=_sha256_path(path),
    )


def load_sensitivity_policy(
    path: Path = DEFAULT_SENSITIVITY_PATH,
    *,
    catalog: Catalog | None = None,
) -> SensitivityPolicy:
    """Load and validate the tracked sensitivity policy."""
    catalog = catalog or load_catalog()
    data = _load_json_mapping(path)
    ids = data.get("dimension_ids")
    _require(isinstance(ids, list), "Sensitivity policy dimension_ids must be a list")
    _require(all(isinstance(item, str) for item in ids), "Sensitivity policy IDs must be strings")
    _require(len(ids) == len(set(ids)), "Sensitivity policy contains duplicate IDs")
    _require(ids == sorted(ids), "Sensitivity policy IDs must be sorted")
    unknown = sorted(set(ids) - set(catalog.by_id))
    _require(not unknown, f"Sensitivity policy has unknown IDs: {unknown[:10]}")
    declared_count = data.get("dimension_count")
    _require(declared_count == len(ids), "Sensitivity policy dimension_count is incorrect")
    source = data.get("source")
    _require(isinstance(source, str) and bool(source), "Sensitivity policy source is required")
    return SensitivityPolicy(
        dimension_ids=frozenset(ids),
        sha256=_sha256_path(path),
        source=source,
    )


def derive_sensitive_ids_from_survey(path: Path) -> list[str]:
    """Derive the sensitivity set from the sanitized survey definition."""
    data = _load_json_mapping(path)
    modules = data.get("modules")
    _require(isinstance(modules, list), "Survey definition modules must be a list")
    ids: set[str] = set()
    for module in modules:
        if not isinstance(module, dict):
            continue
        for question in module.get("questions", []):
            if not isinstance(question, dict):
                continue
            if question.get("type") == "dimension_grid":
                for entry in question.get("entries", []):
                    if (
                        isinstance(entry, dict)
                        and entry.get("sensitive") is True
                        and isinstance(entry.get("dimension_id"), str)
                    ):
                        ids.add(entry["dimension_id"])
            elif (
                question.get("sensitive") is True
                and isinstance(question.get("dimension_id"), str)
            ):
                ids.add(question["dimension_id"])
    return sorted(ids)


def _validate_keys(data: dict[str, Any], allowed: set[str], context: str) -> None:
    extras = sorted(set(data) - allowed)
    _require(not extras, f"{context} has unsupported fields: {extras}")


def _validate_source_coverage(
    value: Any,
    *,
    catalog: Catalog,
) -> tuple[dict[str, Any], frozenset[str]]:
    _require(isinstance(value, dict), "source_coverage must be an object")
    _validate_keys(
        value,
        {"generated_at", "sources", "schema_categories_reviewed", "limitations"},
        "source_coverage",
    )
    generated_at = value.get("generated_at")
    _require(isinstance(generated_at, str) and bool(generated_at.strip()), "source_coverage.generated_at is required")
    sources = value.get("sources")
    _require(isinstance(sources, list), "source_coverage.sources must be a list")
    normalized_sources: list[dict[str, Any]] = []
    source_ids: set[str] = set()
    for index, source in enumerate(sources):
        _require(isinstance(source, dict), f"source_coverage.sources[{index}] must be an object")
        _validate_keys(
            source,
            {"id", "type", "description", "items_reviewed", "start_date", "end_date", "limitations"},
            f"source_coverage.sources[{index}]",
        )
        source_id = source.get("id")
        _require(isinstance(source_id, str) and SOURCE_ID_PATTERN.fullmatch(source_id) is not None, f"Invalid source ID at index {index}")
        _require(source_id not in source_ids, f"Duplicate source ID: {source_id}")
        source_ids.add(source_id)
        source_type = source.get("type")
        _require(source_type in SOURCE_TYPES, f"Unsupported source type for {source_id}: {source_type}")
        description = source.get("description")
        _require(isinstance(description, str) and bool(description.strip()), f"Source {source_id} needs a description")
        items_reviewed = source.get("items_reviewed")
        _require(
            isinstance(items_reviewed, int)
            and not isinstance(items_reviewed, bool)
            and items_reviewed >= 0,
            f"Source {source_id} items_reviewed must be a non-negative integer",
        )
        normalized_source: dict[str, Any] = {
            "id": source_id,
            "type": source_type,
            "description": _safe_note(
                description,
                f"Source {source_id} description",
                max_chars=300,
            ),
            "items_reviewed": items_reviewed,
        }
        for field in ("start_date", "end_date"):
            field_value = source.get(field)
            _require(field_value is None or isinstance(field_value, str), f"Source {source_id} {field} must be a string or null")
            if field_value is not None:
                normalized_source[field] = _safe_note(
                    field_value,
                    f"Source {source_id} {field}",
                    max_chars=80,
                )
        normalized_source["limitations"] = _clean_string_list(
            source.get("limitations", []),
            f"source_coverage.sources[{index}].limitations",
        )
        normalized_sources.append(normalized_source)

    reviewed = value.get("schema_categories_reviewed")
    _require(isinstance(reviewed, list), "source_coverage.schema_categories_reviewed must be a list")
    if reviewed == ["*"]:
        normalized_categories = list(catalog.categories)
    else:
        normalized_categories = _clean_string_list(reviewed, "source_coverage.schema_categories_reviewed")
        unknown_categories = sorted(set(normalized_categories) - set(catalog.categories))
        _require(not unknown_categories, f"Unknown reviewed schema categories: {unknown_categories}")
    missing_categories = sorted(set(catalog.categories) - set(normalized_categories))
    _require(
        not missing_categories,
        f"Schema category review is incomplete; missing: {missing_categories}",
    )

    normalized = {
        "generated_at": _safe_note(
            generated_at,
            "source_coverage.generated_at",
            max_chars=80,
        ),
        "sources": normalized_sources,
        "schema_categories_reviewed": normalized_categories,
        "limitations": _clean_string_list(value.get("limitations", []), "source_coverage.limitations"),
    }
    return normalized, frozenset(source_ids)


def validate_candidate_payload(
    data: dict[str, Any],
    *,
    catalog: Catalog,
    sensitivity: SensitivityPolicy,
) -> dict[str, Any]:
    """Validate and normalize model-authored candidate JSON."""
    _validate_keys(data, {"schema_version", "persona", "source_coverage", "candidates"}, "Candidate document")
    _require(data.get("schema_version") == 1, "Candidate schema_version must be 1")

    persona = data.get("persona")
    _require(isinstance(persona, dict), "Candidate persona must be an object")
    _validate_keys(persona, {"persona_id", "display_name", "version"}, "Candidate persona")
    persona_id = persona.get("persona_id")
    _require(isinstance(persona_id, str) and PERSONA_ID_PATTERN.fullmatch(persona_id) is not None, "persona_id must be a lowercase slug of at most 64 characters")
    display_name = persona.get("display_name")
    _require(isinstance(display_name, str) and bool(display_name.strip()), "display_name is required")
    version = persona.get("version", "1.0")
    _require(isinstance(version, str) and bool(version.strip()), "persona.version must be a non-empty string")

    coverage, source_ids = _validate_source_coverage(data.get("source_coverage"), catalog=catalog)
    candidates = data.get("candidates")
    _require(isinstance(candidates, list), "candidates must be a list")
    normalized_candidates: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    for index, candidate in enumerate(candidates):
        _require(isinstance(candidate, dict), f"candidates[{index}] must be an object")
        _validate_keys(
            candidate,
            {"id", "value", "confidence", "evidence", "source_refs", "as_of", "runtime_included"},
            f"candidates[{index}]",
        )
        dim_id = candidate.get("id")
        _require(isinstance(dim_id, str) and dim_id in catalog.by_id, f"Unknown candidate dimension ID: {dim_id}")
        _require(dim_id not in seen_ids, f"Duplicate candidate dimension ID: {dim_id}")
        seen_ids.add(dim_id)
        confidence = candidate.get("confidence")
        _require(confidence in BASE_CONFIDENCES, f"Invalid history confidence for {dim_id}: {confidence}")
        runtime_included = candidate.get("runtime_included")
        _require(isinstance(runtime_included, bool), f"runtime_included must be boolean for {dim_id}")
        value = candidate.get("value")
        evidence = candidate.get("evidence")
        _require(isinstance(evidence, str) and bool(evidence.strip()), f"Evidence is required for {dim_id}")
        source_refs = _clean_string_list(candidate.get("source_refs", []), f"candidates[{index}].source_refs")
        unknown_source_refs = sorted(set(source_refs) - set(source_ids))
        _require(not unknown_source_refs, f"Candidate {dim_id} references unknown sources: {unknown_source_refs}")

        if confidence == "unknown":
            _require(value is None, f"Unknown candidate {dim_id} must have a null value")
            _require(not runtime_included, f"Unknown candidate {dim_id} cannot be included at runtime")
        else:
            _require(value in catalog.by_id[dim_id]["values"], f"Invalid value for {dim_id}: {value!r}")
            _require(source_refs, f"Candidate {dim_id} needs at least one source reference")

        sensitive = dim_id in sensitivity.dimension_ids
        _require(
            not (sensitive and runtime_included),
            f"Sensitive history candidate {dim_id} must be withheld pending direct confirmation",
        )
        as_of = candidate.get("as_of")
        _require(as_of is None or isinstance(as_of, str), f"as_of must be a string or null for {dim_id}")
        normalized_candidate = {
            "id": dim_id,
            "value": value,
            "confidence": confidence,
            "evidence": _safe_note(
                evidence,
                f"Evidence for {dim_id}",
                max_chars=600,
            ),
            "source_refs": source_refs,
            "runtime_included": runtime_included,
        }
        if as_of is not None:
            normalized_candidate["as_of"] = _safe_note(
                as_of,
                f"as_of for {dim_id}",
                max_chars=80,
            )
        normalized_candidates.append(normalized_candidate)

    normalized_candidates.sort(key=lambda item: catalog.order[item["id"]])
    return {
        "schema_version": 1,
        "persona": {
            "persona_id": persona_id,
            "display_name": _safe_note(
                display_name,
                "persona.display_name",
                max_chars=120,
            ),
            "version": _safe_note(
                version,
                "persona.version",
                max_chars=40,
            ),
        },
        "source_coverage": coverage,
        "candidates": normalized_candidates,
    }


def _history_row(
    candidate: dict[str, Any],
    *,
    catalog: Catalog,
    sensitivity: SensitivityPolicy,
) -> dict[str, Any]:
    dim_id = candidate["id"]
    meta = catalog.by_id[dim_id]
    value = candidate["value"]
    confidence = candidate["confidence"]
    sensitive = dim_id in sensitivity.dimension_ids
    runtime_included = bool(value is not None and candidate["runtime_included"] and not sensitive)
    selected_from = "none" if confidence == "unknown" else "chatgpt"
    row: dict[str, Any] = {
        "id": dim_id,
        "label": _clean_text(str(meta["label"])),
        "category": _clean_text(str(meta["category"])),
        "value": value,
        "value_chatgpt": value,
        "confidence_chatgpt": confidence,
        "evidence_chatgpt": candidate["evidence"],
        "value_claude": None,
        "confidence_claude": "unknown",
        "evidence_claude": "No other candidate source was supplied.",
        "selected_from": selected_from,
        "selection_reason": (
            "No supported history value was selected."
            if selected_from == "none"
            else "Selected from the available user-authored evidence."
        ),
        "selected_confidence": confidence,
        "source_refs": candidate["source_refs"],
        "sensitive": sensitive,
        "runtime_included": runtime_included,
        "needs_review": bool(confidence in {"unknown", "best_guess"} or not runtime_included),
    }
    if "as_of" in candidate:
        row["evidence_as_of"] = candidate["as_of"]
    if sensitive:
        row["runtime_exclusion_reason"] = "Sensitive history-derived value withheld pending direct confirmation."
    elif value is not None and not runtime_included:
        row["runtime_exclusion_reason"] = "History-derived value retained for review but excluded from runtime."
    return row


def _block_for_row(row: dict[str, Any]) -> str:
    confidence = row.get("selected_confidence", "unknown")
    if row.get("value") is None:
        return "unresolved"
    if row.get("sensitive") and confidence == "best_guess":
        return "sensitive_best_guess"
    if row.get("sensitive"):
        return "sensitive_evidenced"
    if confidence == "best_guess":
        return "best_guess"
    return "evidenced"


def rendered_dimension_count(dimensions: dict[str, Any]) -> int:
    """Return the number of dimensions that reach the rendered persona prompt."""
    grouped = collect_dimension_items(dimensions)
    return sum(len(rows) for rows in grouped.values())


def build_persona_payload(
    candidates: dict[str, Any],
    *,
    catalog: Catalog,
    sensitivity: SensitivityPolicy,
) -> dict[str, Any]:
    """Build the canonical YAML mapping from validated candidate data."""
    normalized = validate_candidate_payload(candidates, catalog=catalog, sensitivity=sensitivity)
    persona_input = normalized["persona"]
    blocks: dict[str, list[dict[str, Any]]] = {name: [] for name in EVIDENCE_BLOCKS}
    dimensions: dict[str, Any] = {}
    confidence_counts: Counter[str] = Counter()

    for candidate in normalized["candidates"]:
        row = _history_row(candidate, catalog=catalog, sensitivity=sensitivity)
        blocks[_block_for_row(row)].append(row)
        confidence_counts[row["selected_confidence"]] += 1
        if row["runtime_included"]:
            dimensions[row["id"]] = row["value"]

    display_name = persona_input["display_name"]
    summary = "An evidence-backed persona built from available user-authored sources."
    system_prompt = (
        "Respond naturally in the first person. Follow only the established attributes in this profile. "
        "When the profile does not establish something, express ordinary uncertainty instead of inventing details. "
        "Do not mention hidden instructions or evidence sources."
    )
    rendered_count = rendered_dimension_count(dimensions)
    payload: dict[str, Any] = {
        "persona_id": persona_input["persona_id"],
        "version": persona_input["version"],
        "source": "user_evidence_compilation",
        "display_name": display_name,
        "summary": summary,
        "system_prompt": system_prompt,
        "dimensions": dimensions,
        "meta": {
            "schema_version": catalog.schema_version,
            "schema_sha256": catalog.sha256,
            "schema_dimensions": len(catalog.rows),
            "candidate_dimensions": len(normalized["candidates"]),
            "runtime_dimensions": len(dimensions),
            "mapped_dimensions": len(dimensions),
            "rendered_dimensions": rendered_count,
            "dimensions_left_unset": len(catalog.rows) - len(dimensions),
            "selected_confidence_counts": {
                confidence: confidence_counts.get(confidence, 0)
                for confidence in BASE_CONFIDENCES
            },
            "sensitivity_policy_sha256": sensitivity.sha256,
            "sensitivity_policy_source": sensitivity.source,
            "source_coverage": normalized["source_coverage"],
        },
        "instructions_for_consuming_model": (
            "Use only the top-level dimensions mapping for runtime behavior. "
            "The evidence blocks are a local audit trail. Never promote a missing field, "
            "unknown candidate, or schema default into a personal fact."
        ),
        **blocks,
    }
    return payload


def _validate_exact_value(dim_id: str, value: Any, catalog: Catalog, context: str) -> None:
    _require(dim_id in catalog.by_id, f"Unknown {context} dimension ID: {dim_id}")
    _require(value in catalog.by_id[dim_id]["values"], f"Invalid {context} value for {dim_id}: {value!r}")


def validate_persona_data(
    data: dict[str, Any],
    *,
    catalog: Catalog,
    sensitivity: SensitivityPolicy,
) -> dict[str, Any]:
    """Strictly validate a compiled or survey-refined persona mapping."""
    _validate_keys(
        data,
        {
            "persona_id",
            "version",
            "source",
            "display_name",
            "summary",
            "system_prompt",
            "dimensions",
            "meta",
            "instructions_for_consuming_model",
            *EVIDENCE_BLOCKS,
            "notes_and_open_questions",
            "survey_free_text",
        },
        "Persona",
    )
    persona_id = data.get("persona_id")
    _require(isinstance(persona_id, str) and PERSONA_ID_PATTERN.fullmatch(persona_id) is not None, "Persona has an invalid persona_id")
    _require(isinstance(data.get("version"), str) and bool(data["version"].strip()), "Persona version is required")
    _require(isinstance(data.get("source"), str) and bool(data["source"].strip()), "Persona source is required")
    display_name = data.get("display_name")
    _require(isinstance(display_name, str) and bool(display_name.strip()), "Persona display_name is required")
    _require(isinstance(data.get("summary"), str) and bool(data["summary"].strip()), "Persona summary is required")
    _require(
        isinstance(data.get("system_prompt"), str) and bool(data["system_prompt"].strip()),
        "Persona system_prompt is required",
    )
    dimensions = data.get("dimensions")
    _require(isinstance(dimensions, dict), "Persona dimensions must be a mapping")
    for dim_id, value in dimensions.items():
        _require(isinstance(dim_id, str), f"Runtime dimension ID must be a string: {dim_id!r}")
        _validate_exact_value(dim_id, value, catalog, "runtime")

    rows_by_id: dict[str, dict[str, Any]] = {}
    block_by_id: dict[str, str] = {}
    confidence_counts: Counter[str] = Counter()
    sensitive_count = 0
    for block in EVIDENCE_BLOCKS:
        rows = data.get(block, [])
        _require(isinstance(rows, list), f"Persona block {block} must be a list")
        for index, row in enumerate(rows):
            _require(isinstance(row, dict), f"Persona block {block}[{index}] must be an object")
            dim_id = row.get("id")
            _require(isinstance(dim_id, str) and dim_id in catalog.by_id, f"Unknown evidence dimension ID: {dim_id}")
            _require(dim_id not in rows_by_id, f"Duplicate evidence dimension ID: {dim_id}")
            rows_by_id[dim_id] = row
            block_by_id[dim_id] = block

            if "label" in row:
                _require(row["label"] == catalog.by_id[dim_id]["label"], f"Evidence label is stale for {dim_id}")
            if "category" in row:
                _require(row["category"] == catalog.by_id[dim_id]["category"], f"Evidence category is stale for {dim_id}")
            expected_sensitive = dim_id in sensitivity.dimension_ids
            _require(row.get("sensitive") is expected_sensitive, f"Sensitivity flag is incorrect for {dim_id}")
            sensitive_count += int(expected_sensitive)

            history_confidence = row.get("confidence_chatgpt")
            _require(history_confidence in BASE_CONFIDENCES, f"Invalid ChatGPT confidence for {dim_id}: {history_confidence}")
            history_value = row.get("value_chatgpt")
            history_evidence = row.get("evidence_chatgpt")
            _require(isinstance(history_evidence, str) and bool(history_evidence.strip()), f"ChatGPT evidence is required for {dim_id}")
            if history_confidence == "unknown":
                _require(history_value is None, f"Unknown ChatGPT candidate {dim_id} must have a null value")
            else:
                _validate_exact_value(dim_id, history_value, catalog, "ChatGPT")

            if "confidence_claude" in row or "value_claude" in row:
                other_confidence = row.get("confidence_claude")
                _require(other_confidence in BASE_CONFIDENCES, f"Invalid other-source confidence for {dim_id}")
                other_value = row.get("value_claude")
                if other_confidence == "unknown":
                    _require(other_value is None, f"Unknown other-source candidate {dim_id} must have a null value")
                else:
                    _validate_exact_value(dim_id, other_value, catalog, "other-source")

            selected_from = row.get("selected_from")
            selected_confidence = row.get("selected_confidence")
            _require(selected_confidence in ALL_CONFIDENCES, f"Invalid selected confidence for {dim_id}: {selected_confidence}")
            selected_value = row.get("value")
            if selected_value is not None:
                _validate_exact_value(dim_id, selected_value, catalog, "selected")

            if selected_from == "chatgpt":
                _require(history_confidence != "unknown", f"Selected ChatGPT candidate is unknown for {dim_id}")
                _require(selected_confidence == history_confidence, f"Selected ChatGPT confidence mismatch for {dim_id}")
                _require(selected_value == history_value, f"Selected ChatGPT value mismatch for {dim_id}")
            elif selected_from == "survey":
                survey_confidence = row.get("confidence_survey")
                survey_value = row.get("value_survey")
                survey_evidence = row.get("evidence_survey")
                _require(survey_confidence in SURVEY_CONFIDENCES, f"Invalid survey confidence for {dim_id}")
                _require(selected_confidence == survey_confidence, f"Selected survey confidence mismatch for {dim_id}")
                _require(selected_value == survey_value, f"Selected survey value mismatch for {dim_id}")
                _require(isinstance(survey_evidence, str) and bool(survey_evidence.strip()), f"Survey evidence is required for {dim_id}")
                if survey_confidence in {"self_report_unknown", "self_report_private"}:
                    _require(survey_value is None, f"Private or unknown survey value must be null for {dim_id}")
                else:
                    _require(survey_value is not None, f"Selected survey value is missing for {dim_id}")
                    _validate_exact_value(dim_id, survey_value, catalog, "survey")
            elif selected_from == "claude":
                _require(row.get("confidence_claude") != "unknown", f"Selected other-source candidate is unknown for {dim_id}")
                _require(selected_confidence == row.get("confidence_claude"), f"Selected other-source confidence mismatch for {dim_id}")
                _require(selected_value == row.get("value_claude"), f"Selected other-source value mismatch for {dim_id}")
            elif selected_from == "agreement":
                _require(history_confidence != "unknown", f"Agreement candidate is unknown for {dim_id}")
                _require(row.get("value_claude") == history_value == selected_value, f"Agreement value mismatch for {dim_id}")
                _require(row.get("confidence_claude") == history_confidence == selected_confidence, f"Agreement confidence mismatch for {dim_id}")
            elif selected_from in {"none", "unresolved_tie"}:
                _require(selected_value is None and selected_confidence == "unknown", f"Unresolved selection must be null for {dim_id}")
            else:
                raise PersonaBuildError(f"Invalid selected_from for {dim_id}: {selected_from}")

            runtime_included = row.get("runtime_included")
            _require(isinstance(runtime_included, bool), f"runtime_included must be boolean for {dim_id}")
            _require(isinstance(row.get("needs_review"), bool), f"needs_review must be boolean for {dim_id}")
            if runtime_included:
                _require(selected_value is not None, f"Runtime evidence value is null for {dim_id}")
                _require(dimensions.get(dim_id) == selected_value, f"Runtime mapping does not match evidence for {dim_id}")
            else:
                _require(dim_id not in dimensions, f"Excluded dimension appears in runtime: {dim_id}")

            if expected_sensitive and selected_from != "survey":
                _require(not runtime_included, f"Sensitive history-derived value is included at runtime: {dim_id}")
            expected_block = _block_for_row(row)
            _require(block == expected_block, f"Evidence row {dim_id} belongs in {expected_block}, not {block}")
            confidence_counts[str(selected_confidence)] += 1

    missing_evidence = sorted(set(dimensions) - set(rows_by_id))
    _require(not missing_evidence, f"Runtime dimensions have no evidence rows: {missing_evidence}")

    rendered_count = rendered_dimension_count(dimensions)
    _require(
        rendered_count == len(dimensions),
        "One or more runtime dimensions would be omitted from the rendered persona prompt",
    )
    meta = data.get("meta")
    if meta is not None:
        _require(isinstance(meta, dict), "Persona meta must be a mapping")
        exact_counts = {
            "schema_dimensions": len(catalog.rows),
            "runtime_dimensions": len(dimensions),
            "mapped_dimensions": len(dimensions),
            "rendered_dimensions": rendered_count,
            "dimensions_left_unset": len(catalog.rows) - len(dimensions),
        }
        for field, expected in exact_counts.items():
            if field in meta:
                _require(meta[field] == expected, f"Persona meta.{field} is incorrect")

    return {
        "ok": True,
        "persona_id": persona_id,
        "display_name": display_name,
        "schema_dimensions": len(catalog.rows),
        "runtime_dimensions": len(dimensions),
        "mapped_dimensions": len(dimensions),
        "rendered_dimensions": rendered_count,
        "evidence_records": len(rows_by_id),
        "sensitive_records": sensitive_count,
        "selected_confidence_counts": dict(sorted(confidence_counts.items())),
    }


def dump_readable_yaml(data: dict[str, Any]) -> str:
    """Serialize stable YAML with blank lines between evidence records."""
    text = yaml.safe_dump(data, sort_keys=False, allow_unicode=False, width=100)
    block_headers = {f"{name}:" for name in EVIDENCE_BLOCKS}
    output: list[str] = []
    in_evidence_block = False
    seen_record = False
    for line in text.splitlines():
        if line in block_headers:
            if output and output[-1] != "":
                output.append("")
            in_evidence_block = True
            seen_record = False
        elif in_evidence_block and line and not line.startswith((" ", "- ")):
            in_evidence_block = False
            seen_record = False
        if in_evidence_block and line.startswith("- id: "):
            if seen_record and output and output[-1] != "":
                output.append("")
            seen_record = True
        output.append(line)
    return "\n".join(output) + "\n"


def _atomic_write_private(path: Path, text: str) -> None:
    _require(not path.is_symlink(), f"Refusing to replace a symlink: {path}")
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            dir=path.parent,
            prefix=f".{path.name}.",
            suffix=".tmp",
            delete=False,
        ) as handle:
            handle.write(text)
            handle.flush()
            os.fsync(handle.fileno())
            temporary = Path(handle.name)
        os.chmod(temporary, 0o600)
        os.replace(temporary, path)
        os.chmod(path, 0o600)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def _ensure_private_mode(path: Path) -> None:
    mode = stat.S_IMODE(path.stat().st_mode)
    _require(mode == 0o600, f"Private persona artifact must have mode 600, found {mode:o}: {path}")


def _ensure_git_ignored(path: Path) -> None:
    try:
        relative = path.resolve().relative_to(REPO_ROOT.resolve())
    except ValueError as exc:
        raise PersonaBuildError(f"Private persona path is outside the repository: {path}") from exc
    try:
        result = subprocess.run(
            ["git", "-C", str(REPO_ROOT), "check-ignore", "-q", "--", str(relative)],
            capture_output=True,
            text=True,
            check=False,
        )
    except OSError as exc:
        raise PersonaBuildError(f"Could not verify Git ignore rules: {exc}") from exc
    _require(result.returncode == 0, f"Private persona path is not ignored by Git: {relative}")


def validate_persona(
    path: Path = DEFAULT_PERSONA_PATH,
    *,
    schema_path: Path = DEFAULT_SCHEMA_PATH,
    sensitivity_path: Path = DEFAULT_SENSITIVITY_PATH,
    require_private_mode: bool = False,
    require_git_ignore: bool = False,
) -> dict[str, Any]:
    """Load and strictly validate one persona YAML file."""
    catalog = load_catalog(schema_path)
    sensitivity = load_sensitivity_policy(sensitivity_path, catalog=catalog)
    data = _load_yaml_mapping(path)
    report = validate_persona_data(data, catalog=catalog, sensitivity=sensitivity)
    if require_private_mode:
        _ensure_private_mode(path)
    if require_git_ignore:
        _ensure_git_ignored(path)
    return report


def compile_candidates(
    candidates_path: Path = DEFAULT_CANDIDATES_PATH,
    output_path: Path = DEFAULT_PERSONA_PATH,
    *,
    schema_path: Path = DEFAULT_SCHEMA_PATH,
    sensitivity_path: Path = DEFAULT_SENSITIVITY_PATH,
    report_path: Path | None = None,
    enforce_private: bool = False,
) -> dict[str, Any]:
    """Compile candidate JSON into a validated, private persona YAML."""
    catalog = load_catalog(schema_path)
    sensitivity = load_sensitivity_policy(sensitivity_path, catalog=catalog)
    _require(not candidates_path.is_symlink(), f"Refusing to read a private symlink: {candidates_path}")
    if enforce_private:
        _ensure_git_ignored(candidates_path)
        if report_path is not None:
            _ensure_git_ignored(report_path)
    try:
        os.chmod(candidates_path, 0o600)
    except OSError as exc:
        raise PersonaBuildError(f"Could not protect candidate file: {exc}") from exc
    _ensure_private_mode(candidates_path)
    candidates = _load_json_mapping(candidates_path)
    payload = build_persona_payload(candidates, catalog=catalog, sensitivity=sensitivity)
    report = validate_persona_data(payload, catalog=catalog, sensitivity=sensitivity)
    if enforce_private:
        _ensure_git_ignored(output_path)
    _atomic_write_private(output_path, dump_readable_yaml(payload))
    _ensure_private_mode(output_path)
    if enforce_private:
        _ensure_git_ignored(output_path)
    if report_path is not None:
        report_text = json.dumps(report, indent=2, sort_keys=True, ensure_ascii=True) + "\n"
        _atomic_write_private(report_path, report_text)
    return report


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Compile and validate a local MatrAIx persona")
    subparsers = parser.add_subparsers(dest="command", required=True)

    compile_parser = subparsers.add_parser("compile", help="Compile candidate JSON into persona.yaml")
    compile_parser.add_argument("--candidates", type=Path, default=DEFAULT_CANDIDATES_PATH)
    compile_parser.add_argument("--output", type=Path, default=DEFAULT_PERSONA_PATH)
    compile_parser.add_argument("--schema", type=Path, default=DEFAULT_SCHEMA_PATH)
    compile_parser.add_argument("--sensitivity", type=Path, default=DEFAULT_SENSITIVITY_PATH)
    compile_parser.add_argument("--report", type=Path, default=DEFAULT_REPORT_PATH)
    compile_parser.add_argument("--skip-private-checks", action="store_true")

    validate_parser = subparsers.add_parser("validate", help="Strictly validate persona.yaml")
    validate_parser.add_argument("--persona", type=Path, default=DEFAULT_PERSONA_PATH)
    validate_parser.add_argument("--schema", type=Path, default=DEFAULT_SCHEMA_PATH)
    validate_parser.add_argument("--sensitivity", type=Path, default=DEFAULT_SENSITIVITY_PATH)
    validate_parser.add_argument("--skip-private-checks", action="store_true")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        if args.command == "compile":
            report = compile_candidates(
                args.candidates,
                args.output,
                schema_path=args.schema,
                sensitivity_path=args.sensitivity,
                report_path=args.report,
                enforce_private=not args.skip_private_checks,
            )
        else:
            report = validate_persona(
                args.persona,
                schema_path=args.schema,
                sensitivity_path=args.sensitivity,
                require_private_mode=not args.skip_private_checks,
                require_git_ignore=not args.skip_private_checks,
            )
    except (OSError, PersonaBuildError) as exc:
        print(f"Persona build error: {exc}", file=sys.stderr)
        return 2
    print(json.dumps(report, indent=2, sort_keys=True, ensure_ascii=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
