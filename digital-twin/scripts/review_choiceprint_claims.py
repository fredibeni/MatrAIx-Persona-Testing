#!/usr/bin/env python3
"""Prepare and apply private, owner-completed Choiceprint claim reviews.

This workflow is deliberately local. It never calls a model or network service,
and it never treats an unanswered review row as confirmation.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import stat
import sys
import tempfile
from copy import deepcopy
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Callable, Mapping, Sequence

import yaml


REVIEW_FORMAT = "choiceprint-claim-review/0.1"
APPLIED_REVIEW_FORMAT = "choiceprint-claim-review-applied/0.1"
SUPPORTED_DECISIONS = frozenset(
    {"confirm", "dispute", "withhold", "unconfirmed"}
)
INTERACTIVE_DECISIONS = (
    "confirm",
    "dispute",
    "withhold",
    "unconfirmed",
)
REVIEW_TOP_LEVEL_FIELDS = frozenset(
    {
        "review_format",
        "pack_binding",
        "prepared_at",
        "reviewed_at",
        "reviewer",
        "instructions",
        "claims",
    }
)
REVIEW_CLAIM_FIELDS = frozenset(
    {
        "claim_id",
        "predicate",
        "label",
        "value",
        "sensitivity",
        "current_status",
        "current_runtime_included",
        "decision",
        "domains",
        "conditions",
        "notes",
    }
)
BINDING_FIELDS = (
    "bundle_format",
    "schema_version",
    "persona_id",
    "content_version",
    "manifest_sha256",
    "build_metadata_sha256",
    "claims_sha256",
    "claim_snapshot_sha256",
    "claim_count",
)
SNAPSHOT_FIELDS = (
    "id",
    "predicate",
    "label",
    "category",
    "value",
    "sensitivity",
    "source_selection",
    "evidence_refs",
)


class ReviewCancelled(Exception):
    """The owner cancelled before a new review artifact was published."""


class StrictSafeLoader(yaml.SafeLoader):
    """Safe YAML loader which rejects duplicate mapping keys."""


def _construct_mapping(
    loader: StrictSafeLoader, node: yaml.nodes.MappingNode, deep: bool = False
) -> dict[Any, Any]:
    loader.flatten_mapping(node)
    result: dict[Any, Any] = {}
    for key_node, value_node in node.value:
        key = loader.construct_object(key_node, deep=deep)
        try:
            duplicate = key in result
        except TypeError as exc:
            raise yaml.constructor.ConstructorError(
                "while constructing a mapping",
                node.start_mark,
                "found an unhashable mapping key",
                key_node.start_mark,
            ) from exc
        if duplicate:
            raise yaml.constructor.ConstructorError(
                "while constructing a mapping",
                node.start_mark,
                f"found duplicate key {key!r}",
                key_node.start_mark,
            )
        result[key] = loader.construct_object(value_node, deep=deep)
    return result


StrictSafeLoader.add_constructor(
    yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, _construct_mapping
)


def _assert_finite(value: Any, context: str) -> None:
    if isinstance(value, float) and not math.isfinite(value):
        raise ValueError(f"{context} contains a non-finite number")
    if isinstance(value, dict):
        for child in value.values():
            _assert_finite(child, context)
    elif isinstance(value, list):
        for child in value:
            _assert_finite(child, context)


def _load_yaml_mapping(path: Path) -> dict[str, Any]:
    _require_private_regular_file(path, "private YAML input")
    try:
        value = yaml.load(path.read_text(encoding="utf-8"), Loader=StrictSafeLoader)
    except (OSError, UnicodeError, yaml.YAMLError) as exc:
        raise ValueError(f"cannot read YAML from {path}: {exc}") from exc
    if not isinstance(value, dict):
        raise ValueError(f"{path} must contain a YAML mapping")
    _assert_finite(value, str(path))
    return value


def _reject_json_constant(value: str) -> Any:
    raise ValueError(f"non-finite JSON number is not allowed: {value}")


def _unique_json_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"duplicate JSON object key: {key!r}")
        result[key] = value
    return result


def _load_json_mapping(path: Path) -> dict[str, Any]:
    _require_regular_file(path, "pack JSON file")
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


def _load_jsonl(path: Path) -> list[dict[str, Any]]:
    _require_regular_file(path, "pack claim file")
    records: list[dict[str, Any]] = []
    try:
        for line_number, line in enumerate(
            path.read_text(encoding="utf-8").splitlines(), start=1
        ):
            if not line.strip():
                continue
            value = json.loads(
                line,
                object_pairs_hook=_unique_json_object,
                parse_constant=_reject_json_constant,
            )
            if not isinstance(value, dict):
                raise ValueError(f"line {line_number} is not a JSON object")
            records.append(value)
    except (OSError, UnicodeError, json.JSONDecodeError, ValueError) as exc:
        raise ValueError(f"cannot read JSONL from {path}: {exc}") from exc
    return records


def _sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _claim_source_snapshot(claim: Mapping[str, Any]) -> dict[str, Any]:
    """Return the stable, pre-review claim facets used for rebuild binding."""

    return {field: deepcopy(claim.get(field)) for field in SNAPSHOT_FIELDS}


def claim_snapshot_sha256(claims: Sequence[Mapping[str, Any]]) -> str:
    payload = [_claim_source_snapshot(claim) for claim in claims]
    encoded = json.dumps(
        payload,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _require_no_symlink_chain(path: Path) -> None:
    absolute = Path(os.path.abspath(path))
    current = Path(absolute.anchor)
    for part in absolute.parts[1:]:
        current /= part
        if not os.path.lexists(current):
            break
        if current.is_symlink():
            raise ValueError(f"path must not contain a symlink: {path}")


def _require_regular_file(path: Path, label: str) -> None:
    _require_no_symlink_chain(path)
    if not path.is_file() or path.is_symlink():
        raise ValueError(f"{label} must be a regular, non-symlink file: {path}")


def _require_private_regular_file(path: Path, label: str) -> None:
    _require_regular_file(path, label)
    if os.name == "posix" and stat.S_IMODE(path.stat().st_mode) != 0o600:
        raise ValueError(f"{label} must have mode 0600: {path}")


def _require_private_directory(path: Path, label: str) -> None:
    _require_no_symlink_chain(path)
    if not path.is_dir() or path.is_symlink():
        raise ValueError(f"{label} must be a regular, non-symlink directory: {path}")
    if os.name == "posix" and stat.S_IMODE(path.stat().st_mode) != 0o700:
        raise ValueError(f"{label} must have mode 0700: {path}")


def _validate_pack(pack: Path) -> None:
    _require_private_directory(pack, "canonical pack")
    scripts_directory = str(Path(__file__).resolve().parent)
    added = scripts_directory not in sys.path
    if added:
        sys.path.insert(0, scripts_directory)
    try:
        from validate_twin_pack import validate_bundle

        result = validate_bundle(pack)
    finally:
        if added:
            sys.path.remove(scripts_directory)
    if not result.ok:
        raise ValueError("canonical pack is invalid: " + "; ".join(result.errors))


def _pack_state(pack: Path) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    pack = Path(os.path.abspath(pack))
    _validate_pack(pack)
    manifest_path = pack / "manifest.json"
    metadata_path = pack / "build-metadata.json"
    claims_path = pack / "profile/claims.jsonl"
    manifest = _load_json_mapping(manifest_path)
    metadata = _load_json_mapping(metadata_path)
    claims = _load_jsonl(claims_path)
    seen: set[str] = set()
    for index, claim in enumerate(claims, start=1):
        claim_id = claim.get("id")
        if not isinstance(claim_id, str) or not claim_id:
            raise ValueError(f"claim {index} has no non-empty ID")
        if claim_id in seen:
            raise ValueError(f"pack contains duplicate claim ID '{claim_id}'")
        seen.add(claim_id)
    if metadata.get("persona_id") != manifest.get("persona_id"):
        raise ValueError("pack metadata persona ID does not match the manifest")
    binding = {
        "bundle_format": manifest.get("bundle_format"),
        "schema_version": manifest.get("schema_version"),
        "persona_id": manifest.get("persona_id"),
        "content_version": manifest.get("content_version"),
        "manifest_sha256": _sha256_file(manifest_path),
        "build_metadata_sha256": _sha256_file(metadata_path),
        "claims_sha256": _sha256_file(claims_path),
        "claim_snapshot_sha256": claim_snapshot_sha256(claims),
        "claim_count": len(claims),
    }
    return binding, claims


def _now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace(
        "+00:00", "Z"
    )


def _validate_reviewed_at(value: Any) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError("reviewed_at must be completed before applying the review")
    text = value.strip()
    try:
        if "T" in text:
            parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
            if parsed.tzinfo is None:
                raise ValueError
            point = parsed.astimezone(timezone.utc)
        else:
            point = datetime.combine(
                date.fromisoformat(text), datetime.min.time(), tzinfo=timezone.utc
            )
    except ValueError as exc:
        raise ValueError(
            "reviewed_at must be an ISO 8601 date or timezone-aware datetime"
        ) from exc
    if point > datetime.now(timezone.utc):
        raise ValueError("reviewed_at must not be in the future")
    return text


def _private_atomic_yaml(path: Path, value: Mapping[str, Any]) -> None:
    path = Path(os.path.abspath(path))
    _require_no_symlink_chain(path)
    _require_private_directory(path.parent, "output parent")
    if os.path.lexists(path):
        raise ValueError(f"refusing to replace existing output: {path}")
    text = yaml.safe_dump(
        dict(value),
        sort_keys=False,
        allow_unicode=True,
        width=100,
    )
    descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{path.name}.tmp-", dir=str(path.parent)
    )
    temporary = Path(temporary_name)
    try:
        if os.name == "posix":
            os.fchmod(descriptor, 0o600)
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            handle.write(text)
            handle.flush()
            os.fsync(handle.fileno())
        try:
            os.link(temporary, path)
        except FileExistsError as exc:
            raise ValueError(f"refusing to replace existing output: {path}") from exc
        if os.name == "posix":
            path.chmod(0o600)
        try:
            parent_fd = os.open(path.parent, os.O_RDONLY)
        except OSError:
            parent_fd = -1
        if parent_fd >= 0:
            try:
                os.fsync(parent_fd)
            finally:
                os.close(parent_fd)
    finally:
        try:
            temporary.unlink()
        except FileNotFoundError:
            pass


def prepare_review(pack_path: Path | str, output_path: Path | str) -> dict[str, Any]:
    pack = Path(pack_path).expanduser()
    output = Path(output_path).expanduser()
    binding, claims = _pack_state(pack)
    review_rows: list[dict[str, Any]] = []
    for claim in claims:
        scope = claim.get("scope") if isinstance(claim.get("scope"), dict) else {}
        review_rows.append(
            {
                "claim_id": claim["id"],
                "predicate": claim.get("predicate"),
                "label": claim.get("label"),
                "value": deepcopy(claim.get("value")),
                "sensitivity": claim.get("sensitivity"),
                "current_status": claim.get("status"),
                "current_runtime_included": claim.get("runtime_included"),
                "decision": "pending",
                "domains": deepcopy(scope.get("domains") or []),
                "conditions": deepcopy(scope.get("conditions") or []),
                "notes": None,
            }
        )
    review = {
        "review_format": REVIEW_FORMAT,
        "pack_binding": binding,
        "prepared_at": _now(),
        "reviewed_at": None,
        "reviewer": "owner",
        "instructions": [
            "Review every claim locally and replace pending with confirm, dispute, withhold, or unconfirmed.",
            "confirm records accuracy only; it does not grant consent or make a sensitive claim runtime-visible.",
            "Use domains and conditions to narrow where a confirmed claim applies. Empty lists mean no added scope restriction.",
            "Set reviewed_at to an ISO 8601 date or timezone-aware datetime only after every decision is complete.",
        ],
        "claims": review_rows,
    }
    _private_atomic_yaml(output, review)
    return review


def _check_exact_fields(value: Mapping[str, Any], allowed: frozenset[str], label: str) -> None:
    unsupported = sorted(set(value) - allowed)
    if unsupported:
        raise ValueError(f"{label} contains unsupported fields: {', '.join(unsupported)}")


def _review_string_list(value: Any, label: str) -> list[str]:
    if not isinstance(value, list):
        raise ValueError(f"{label} must be a list")
    result: list[str] = []
    for index, item in enumerate(value, start=1):
        if not isinstance(item, str) or not item.strip():
            raise ValueError(f"{label} item {index} must be a non-empty string")
        normalized = " ".join(item.split())
        if normalized in result:
            raise ValueError(f"{label} contains duplicate value '{normalized}'")
        result.append(normalized)
    return result


def _validate_binding(review_binding: Any, expected: Mapping[str, Any]) -> dict[str, Any]:
    if not isinstance(review_binding, dict):
        raise ValueError("pack_binding must be a mapping")
    unsupported = sorted(set(review_binding) - set(BINDING_FIELDS))
    missing = sorted(set(BINDING_FIELDS) - set(review_binding))
    if unsupported:
        raise ValueError(
            "pack_binding contains unsupported fields: " + ", ".join(unsupported)
        )
    if missing:
        raise ValueError("pack_binding is missing fields: " + ", ".join(missing))
    for field in BINDING_FIELDS:
        if review_binding.get(field) != expected.get(field):
            raise ValueError(
                f"stale review: pack_binding.{field} does not match the selected pack"
            )
    return deepcopy(review_binding)


def _validated_review_rows(
    review: Mapping[str, Any],
    current_claims: Sequence[Mapping[str, Any]],
    *,
    allow_pending: bool,
) -> list[dict[str, Any]]:
    rows = review.get("claims")
    if not isinstance(rows, list):
        raise ValueError("claims must be a list")
    current_by_id = {str(claim["id"]): claim for claim in current_claims}
    seen: set[str] = set()
    validated: list[dict[str, Any]] = []
    for index, row in enumerate(rows, start=1):
        if not isinstance(row, dict):
            raise ValueError(f"claim review row {index} must be a mapping")
        _check_exact_fields(row, REVIEW_CLAIM_FIELDS, f"claim review row {index}")
        missing_fields = sorted(REVIEW_CLAIM_FIELDS - set(row))
        if missing_fields:
            raise ValueError(
                f"claim review row {index} is missing fields: {', '.join(missing_fields)}"
            )
        claim_id = row.get("claim_id")
        if not isinstance(claim_id, str) or not claim_id:
            raise ValueError(f"claim review row {index} needs a non-empty claim_id")
        if claim_id in seen:
            raise ValueError(f"duplicate reviewed claim ID '{claim_id}'")
        seen.add(claim_id)
        current = current_by_id.get(claim_id)
        if current is None:
            raise ValueError(f"unknown reviewed claim ID '{claim_id}'")
        snapshot_pairs = {
            "predicate": current.get("predicate"),
            "label": current.get("label"),
            "value": current.get("value"),
            "sensitivity": current.get("sensitivity"),
            "current_status": current.get("status"),
            "current_runtime_included": current.get("runtime_included"),
        }
        for field, expected in snapshot_pairs.items():
            actual = row.get(field)
            if type(actual) is not type(expected) or actual != expected:
                raise ValueError(
                    f"claim review snapshot for '{claim_id}' changed at field '{field}'"
                )
        decision = row.get("decision")
        if decision == "pending":
            if not allow_pending:
                raise ValueError(f"claim '{claim_id}' still has a pending decision")
        elif decision not in SUPPORTED_DECISIONS:
            raise ValueError(
                f"claim '{claim_id}' has unsupported decision {decision!r}"
            )
        notes = row.get("notes")
        if notes is not None and not isinstance(notes, str):
            raise ValueError(f"claim '{claim_id}'.notes must be a string or null")
        _review_string_list(row.get("domains"), f"claim '{claim_id}'.domains")
        _review_string_list(
            row.get("conditions"), f"claim '{claim_id}'.conditions"
        )
        validated.append(row)
    missing = sorted(set(current_by_id) - seen)
    if missing:
        raise ValueError(
            "claim review is incomplete; missing claim IDs: " + ", ".join(missing)
        )
    return validated


def _validated_progress_review(
    review: Mapping[str, Any],
    expected_binding: Mapping[str, Any],
    current_claims: Sequence[Mapping[str, Any]],
) -> list[dict[str, Any]]:
    _check_exact_fields(review, REVIEW_TOP_LEVEL_FIELDS, "claim review")
    missing = sorted(REVIEW_TOP_LEVEL_FIELDS - set(review))
    if missing:
        raise ValueError("claim review is missing fields: " + ", ".join(missing))
    if review.get("review_format") != REVIEW_FORMAT:
        raise ValueError(f"review_format must be {REVIEW_FORMAT}")
    _validate_binding(review.get("pack_binding"), expected_binding)
    if review.get("reviewer") != "owner":
        raise ValueError("reviewer must remain 'owner' for an owner claim review")
    prepared_at = review.get("prepared_at")
    if not isinstance(prepared_at, str) or not prepared_at.strip():
        raise ValueError("prepared_at must be a non-empty string")
    instructions = review.get("instructions")
    if not isinstance(instructions, list) or any(
        not isinstance(item, str) or not item.strip() for item in instructions
    ):
        raise ValueError("instructions must be a list of non-empty strings")
    rows = _validated_review_rows(
        review, current_claims, allow_pending=True
    )
    has_pending = any(row["decision"] == "pending" for row in rows)
    reviewed_at = review.get("reviewed_at")
    if has_pending and reviewed_at is not None:
        raise ValueError("reviewed_at must remain null while claims are pending")
    if not has_pending and reviewed_at is not None:
        _validate_reviewed_at(reviewed_at)
    return rows


def _validated_review_decisions(
    review: Mapping[str, Any], current_claims: Sequence[Mapping[str, Any]]
) -> list[dict[str, Any]]:
    rows = _validated_review_rows(
        review, current_claims, allow_pending=False
    )
    decisions: list[dict[str, Any]] = []
    for row in rows:
        claim_id = str(row["claim_id"])
        notes = row.get("notes")
        decisions.append(
            {
                "claim_id": claim_id,
                "decision": row["decision"],
                "domains": _review_string_list(
                    row.get("domains"), f"claim '{claim_id}'.domains"
                ),
                "conditions": _review_string_list(
                    row.get("conditions"), f"claim '{claim_id}'.conditions"
                ),
                "notes": notes.strip()
                if isinstance(notes, str) and notes.strip()
                else None,
            }
        )
    return decisions


def _new_private_output_path(path: Path | str) -> Path:
    output = Path(os.path.abspath(Path(path).expanduser()))
    _require_no_symlink_chain(output)
    _require_private_directory(output.parent, "output parent")
    if os.path.lexists(output):
        raise ValueError(f"refusing to replace existing output: {output}")
    return output


def _display_claim_for_review(
    row: Mapping[str, Any],
    *,
    index: int,
    total: int,
    output_fn: Callable[[str], Any],
) -> None:
    value = json.dumps(
        row.get("value"),
        ensure_ascii=False,
        sort_keys=True,
        allow_nan=False,
    )
    output_fn("")
    output_fn(f"Pending claim {index} of {total}: {row['claim_id']}")
    output_fn(f"Predicate: {row.get('predicate')}")
    output_fn(f"Label: {row.get('label')}")
    output_fn(f"Value: {value}")
    output_fn(
        "Sensitivity: "
        f"{row.get('sensitivity')} | Current status: {row.get('current_status')} "
        "| Currently runtime-included: "
        f"{row.get('current_runtime_included')}"
    )


def _ask_claim_decision(
    *,
    input_fn: Callable[[str], str],
    output_fn: Callable[[str], Any],
) -> str:
    choices = ", ".join(INTERACTIVE_DECISIONS)
    while True:
        raw = input_fn(
            f"Decision - type {choices}, or cancel: "
        ).strip().casefold()
        if raw in SUPPORTED_DECISIONS:
            return raw
        if raw == "cancel":
            raise ReviewCancelled
        output_fn(f"Enter {choices}, or cancel.")


def _interactive_review_timestamp(
    now_fn: Callable[[], datetime] | None,
) -> str:
    point = (now_fn or (lambda: datetime.now(timezone.utc)))()
    if point.tzinfo is None or point.utcoffset() is None:
        raise ValueError("review timestamp must include a timezone")
    return (
        point.astimezone(timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z")
    )


def interactive_review(
    pack_path: Path | str,
    input_path: Path | str,
    output_path: Path | str,
    *,
    max_claims: int | None = None,
    input_fn: Callable[[str], str] = input,
    output_fn: Callable[[str], Any] = print,
    now_fn: Callable[[], datetime] | None = None,
) -> dict[str, Any]:
    """Review pending claims locally and publish a new private progress file."""

    if max_claims is not None and (
        isinstance(max_claims, bool)
        or not isinstance(max_claims, int)
        or max_claims < 1
    ):
        raise ValueError("max_claims must be a positive integer")

    pack = Path(pack_path).expanduser()
    input_file = Path(input_path).expanduser()
    binding, claims = _pack_state(pack)
    review = _load_yaml_mapping(input_file)
    _validated_progress_review(review, binding, claims)
    input_sha256 = _sha256_file(input_file)
    output = _new_private_output_path(output_path)

    result = deepcopy(review)
    pending_indexes = [
        index
        for index, row in enumerate(result["claims"])
        if row["decision"] == "pending"
    ]
    if not pending_indexes:
        raise ValueError("claim review is already complete; there are no pending claims")
    selected_indexes = pending_indexes[
        : max_claims if max_claims is not None else None
    ]

    output_fn(
        "Choiceprint owner claim review - "
        f"{len(pending_indexes)} pending of {len(result['claims'])} claims"
    )
    output_fn("No model or network service is used.")
    output_fn("The input review is read-only; progress is written to a new file.")
    for position, row_index in enumerate(selected_indexes, start=1):
        row = result["claims"][row_index]
        _display_claim_for_review(
            row,
            index=position,
            total=len(selected_indexes),
            output_fn=output_fn,
        )
        row["decision"] = _ask_claim_decision(
            input_fn=input_fn, output_fn=output_fn
        )

    complete = all(
        row["decision"] != "pending" for row in result["claims"]
    )
    result["reviewed_at"] = (
        _interactive_review_timestamp(now_fn) if complete else None
    )

    current_binding, current_claims = _pack_state(pack)
    if current_binding != binding or current_claims != claims:
        raise ValueError("canonical pack changed during owner review")
    current_input = _load_yaml_mapping(input_file)
    if (
        _sha256_file(input_file) != input_sha256
        or current_input != review
    ):
        raise ValueError("input review changed during owner review")
    _validated_progress_review(result, current_binding, current_claims)
    _private_atomic_yaml(output, result)
    remaining = sum(
        row["decision"] == "pending" for row in result["claims"]
    )
    output_fn(
        f"Saved private claim review to {output} - {remaining} pending claim"
        + ("" if remaining == 1 else "s")
    )
    return result


def apply_review(
    pack_path: Path | str,
    review_path: Path | str,
    curation_path: Path | str,
    output_path: Path | str,
    *,
    replace_existing_review: bool = False,
) -> dict[str, Any]:
    pack = Path(pack_path).expanduser()
    review_file = Path(review_path).expanduser()
    curation_file = Path(curation_path).expanduser()
    output = Path(output_path).expanduser()
    binding, claims = _pack_state(pack)
    review = _load_yaml_mapping(review_file)
    _check_exact_fields(review, REVIEW_TOP_LEVEL_FIELDS, "claim review")
    missing = sorted(REVIEW_TOP_LEVEL_FIELDS - set(review))
    if missing:
        raise ValueError("claim review is missing fields: " + ", ".join(missing))
    if review.get("review_format") != REVIEW_FORMAT:
        raise ValueError(f"review_format must be {REVIEW_FORMAT}")
    selected_binding = _validate_binding(review.get("pack_binding"), binding)
    reviewed_at = _validate_reviewed_at(review.get("reviewed_at"))
    reviewer = review.get("reviewer")
    if reviewer != "owner":
        raise ValueError("reviewer must remain 'owner' for an owner claim review")
    decisions = _validated_review_decisions(review, claims)
    curation = _load_yaml_mapping(curation_file)
    if "claim_reviews" in curation and not replace_existing_review:
        raise ValueError(
            "curation already contains claim_reviews; pass --replace-existing-review "
            "only after intentionally completing a replacement review"
        )
    review_sha256 = _sha256_file(review_file)
    applied = {
        "format": APPLIED_REVIEW_FORMAT,
        "reviewer": reviewer,
        "reviewed_at": reviewed_at,
        "review_sha256": review_sha256,
        "base_curation_sha256": _sha256_file(curation_file),
        "source_pack_binding": selected_binding,
        "decisions": decisions,
    }
    result = deepcopy(curation)
    result["claim_reviews"] = applied
    _private_atomic_yaml(output, result)
    return result


def _positive_int(value: str) -> int:
    try:
        parsed = int(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError("must be a positive integer") from exc
    if parsed < 1:
        raise argparse.ArgumentTypeError("must be a positive integer")
    return parsed


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)
    prepare = subparsers.add_parser(
        "prepare", help="create a bound private review worksheet"
    )
    prepare.add_argument("--pack", required=True, help="canonical .choiceprint pack")
    prepare.add_argument("--output", required=True, help="new private review YAML")
    interactive = subparsers.add_parser(
        "interactive",
        help="review pending claims and write a new private progress YAML",
    )
    interactive.add_argument("--pack", required=True, help="same canonical pack")
    interactive.add_argument(
        "--input",
        required=True,
        help="prepared or in-progress private review YAML",
    )
    interactive.add_argument(
        "--output", required=True, help="new private review progress YAML"
    )
    interactive.add_argument(
        "--max-claims",
        type=_positive_int,
        help="review at most this many pending claims",
    )
    apply = subparsers.add_parser(
        "apply", help="apply a completed review to a new curation file"
    )
    apply.add_argument("--pack", required=True, help="same canonical pack")
    apply.add_argument("--review", required=True, help="completed private review YAML")
    apply.add_argument("--curation", required=True, help="base private curation YAML")
    apply.add_argument("--output", required=True, help="new reviewed curation YAML")
    apply.add_argument(
        "--replace-existing-review",
        action="store_true",
        help="replace claim_reviews already present in the base curation",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        if args.command == "prepare":
            review = prepare_review(args.pack, args.output)
            print(
                f"Prepared {len(review['claims'])} private claim review rows: "
                f"{Path(args.output).expanduser()}"
            )
        elif args.command == "interactive":
            interactive_review(
                args.pack,
                args.input,
                args.output,
                max_claims=args.max_claims,
            )
        else:
            result = apply_review(
                args.pack,
                args.review,
                args.curation,
                args.output,
                replace_existing_review=args.replace_existing_review,
            )
            print(
                f"Applied {len(result['claim_reviews']['decisions'])} explicit "
                f"claim decisions: {Path(args.output).expanduser()}"
            )
    except ReviewCancelled:
        print("\nOwner review cancelled; no output was written.", file=sys.stderr)
        return 130
    except (EOFError, KeyboardInterrupt):
        print("\nOwner review cancelled; no output was written.", file=sys.stderr)
        return 130
    except (OSError, ValueError) as exc:
        print(f"Claim review failed: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
