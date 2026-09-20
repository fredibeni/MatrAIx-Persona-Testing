#!/usr/bin/env python3
"""Prepare, complete, and apply owner coverage reviews for Choiceprint packs.

Evaluation and release are intentionally separate. A passing score can create a
candidate domain, but only an explicit owner review can append a sanitized
validation event to a new pack. This tool never mutates the evaluated pack and
never copies questions, answers, predictions, prompts, item results, or score
metrics into a deployable pack.
"""

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
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Mapping, Sequence


REVIEW_FORMAT = "choiceprint-coverage-review/0.1"
PROTOCOL_SCOPE = "forced_choice_prediction/1"
OWNER_ATTESTATION = (
    "I reviewed the private evaluation evidence and explicitly made each "
    "coverage decision recorded here."
)
SHA256_PATTERN = re.compile(r"^[0-9a-f]{64}$")
COVERAGE_DOMAIN_PATTERN = re.compile(r"^[a-z0-9]+(?:[_-][a-z0-9]+)*$")
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
REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
PRIVATE_REVIEW_FALLBACK = (
    REPOSITORY_ROOT
    / "matraix"
    / "personal-persona"
    / "source-material"
    / "coverage-reviews"
)
TOP_LEVEL_FIELDS = frozenset(
    {
        "review_format",
        "review_kind",
        "review_status",
        "scope",
        "pack_binding",
        "evaluation_binding",
        "prepared_at",
        "reviewed_at",
        "reviewer",
        "owner_attestation",
        "domains",
    }
)
PACK_BINDING_FIELDS = frozenset(
    {
        "bundle_format",
        "schema_version",
        "persona_id",
        "content_version",
        "manifest_sha256",
        "build_metadata_sha256",
    }
)
EVALUATION_BINDING_FIELDS = frozenset(
    {
        "run_id",
        "run_manifest_sha256",
        "prediction_finalization_sha256",
        "score_evidence_sha256",
        "choiceprint_build_metadata_sha256",
    }
)
DOMAIN_FIELDS = frozenset(
    {
        "domain",
        "decision",
        "reason",
        "public_reason_code",
        "review_context",
    }
)


class CoverageReviewError(ValueError):
    """Raised when a coverage review or its evidence is unsafe or inconsistent."""


class ReviewCancelled(Exception):
    """Raised when the owner cancels without publishing a completed receipt."""


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace(
        "+00:00", "Z"
    )


def _sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _reject_json_constant(value: str) -> Any:
    raise CoverageReviewError(f"non-finite JSON number is not allowed: {value}")


def _unique_json_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise CoverageReviewError(f"duplicate JSON object key: {key!r}")
        result[key] = value
    return result


def _assert_finite(value: Any, context: str) -> None:
    if isinstance(value, float) and not math.isfinite(value):
        raise CoverageReviewError(f"{context} contains a non-finite number")
    if isinstance(value, dict):
        for child in value.values():
            _assert_finite(child, context)
    elif isinstance(value, list):
        for child in value:
            _assert_finite(child, context)


def _read_json(path: Path, label: str) -> dict[str, Any]:
    _require_regular_file(path, label)
    try:
        value = json.loads(
            path.read_text(encoding="utf-8"),
            object_pairs_hook=_unique_json_object,
            parse_constant=_reject_json_constant,
        )
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise CoverageReviewError(f"cannot read {label}: {exc}") from exc
    if not isinstance(value, dict):
        raise CoverageReviewError(f"{label} must contain one JSON object")
    _assert_finite(value, label)
    return value


def _read_jsonl(path: Path, label: str) -> list[dict[str, Any]]:
    _require_regular_file(path, label)
    records: list[dict[str, Any]] = []
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
        for line_number, line in enumerate(lines, start=1):
            if not line.strip():
                continue
            value = json.loads(
                line,
                object_pairs_hook=_unique_json_object,
                parse_constant=_reject_json_constant,
            )
            if not isinstance(value, dict):
                raise CoverageReviewError(
                    f"{label} line {line_number} must contain a JSON object"
                )
            _assert_finite(value, f"{label} line {line_number}")
            records.append(value)
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise CoverageReviewError(f"cannot read {label}: {exc}") from exc
    return records


def _require_no_symlink_chain(path: Path) -> None:
    absolute = Path(os.path.abspath(path))
    current = Path(absolute.anchor)
    for part in absolute.parts[1:]:
        current /= part
        if not os.path.lexists(current):
            break
        if current.is_symlink():
            raise CoverageReviewError(f"path must not contain a symlink: {path}")


def _is_relative_to(path: Path, parent: Path) -> bool:
    try:
        path.relative_to(parent)
        return True
    except ValueError:
        return False


def _assert_private_review_path(
    path: Path, *, may_not_exist: bool = False
) -> Path:
    expanded = path.expanduser()
    _require_no_symlink_chain(expanded)
    if not may_not_exist and not expanded.exists():
        raise CoverageReviewError(f"private review path does not exist: {expanded}")
    resolved = expanded.resolve(strict=not may_not_exist)
    if any(part.casefold().endswith(".choiceprint") for part in resolved.parts):
        raise CoverageReviewError(
            "private coverage reviews cannot be stored inside a Choiceprint pack"
        )
    if _is_relative_to(resolved, REPOSITORY_ROOT) and not _is_relative_to(
        resolved, PRIVATE_REVIEW_FALLBACK
    ):
        raise CoverageReviewError(
            "private coverage reviews must be outside the repository or under "
            f"the ignored fallback {PRIVATE_REVIEW_FALLBACK}"
        )
    return resolved


def _require_regular_file(path: Path, label: str) -> None:
    _require_no_symlink_chain(path)
    if not path.is_file() or path.is_symlink():
        raise CoverageReviewError(
            f"{label} must be a regular, non-symlink file: {path}"
        )


def _require_private_file(path: Path, label: str) -> None:
    _require_regular_file(path, label)
    if os.name == "posix" and stat.S_IMODE(path.stat().st_mode) != 0o600:
        raise CoverageReviewError(f"{label} must have mode 0600: {path}")


def _require_private_directory(path: Path, label: str) -> None:
    _require_no_symlink_chain(path)
    if not path.is_dir() or path.is_symlink():
        raise CoverageReviewError(
            f"{label} must be a regular, non-symlink directory: {path}"
        )
    if os.name == "posix" and stat.S_IMODE(path.stat().st_mode) != 0o700:
        raise CoverageReviewError(f"{label} must have mode 0700: {path}")


def _prepare_private_parent(path: Path) -> None:
    _assert_private_review_path(path, may_not_exist=True)
    _require_no_symlink_chain(path)
    path.parent.mkdir(parents=True, mode=0o700, exist_ok=True)
    if os.name == "posix":
        path.parent.chmod(0o700)
    _require_private_directory(path.parent, "review output parent")
    if path.exists() or path.is_symlink():
        raise CoverageReviewError(f"refusing to replace existing output: {path}")


def _write_private_json(path: Path, value: Mapping[str, Any]) -> None:
    _prepare_private_parent(path)
    encoded = json.dumps(
        value,
        ensure_ascii=False,
        indent=2,
        sort_keys=True,
        allow_nan=False,
    ) + "\n"
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            handle.write(encoded)
            handle.flush()
            os.fsync(handle.fileno())
    except Exception:
        try:
            path.unlink()
        except FileNotFoundError:
            pass
        raise


def _parse_timestamp(value: Any, field: str) -> datetime:
    if not isinstance(value, str) or not value.strip():
        raise CoverageReviewError(f"{field} must be an ISO date-time")
    try:
        parsed = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
    except ValueError as exc:
        raise CoverageReviewError(f"{field} must be an ISO date-time") from exc
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise CoverageReviewError(f"{field} must include a UTC offset or Z")
    return parsed


def _validate_domain_id(value: Any, field: str) -> str:
    if (
        not isinstance(value, str)
        or len(value) > COVERAGE_DOMAIN_MAX_LENGTH
        or not COVERAGE_DOMAIN_PATTERN.fullmatch(value)
    ):
        raise CoverageReviewError(
            f"{field} must be a lowercase coverage-domain slug of at most "
            f"{COVERAGE_DOMAIN_MAX_LENGTH} characters"
        )
    return value


def _pack_declared_domains(pack: Path) -> frozenset[str]:
    manifest = _read_json(pack / "manifest.json", "pack manifest")
    coverage = manifest.get("coverage")
    declared = coverage.get("declared_domains") if isinstance(coverage, dict) else None
    if not isinstance(declared, list):
        raise CoverageReviewError(
            "pack must declare coverage.declared_domains before evaluation"
        )
    normalized: list[str] = []
    for index, domain in enumerate(declared, start=1):
        normalized.append(
            _validate_domain_id(
                domain, f"coverage.declared_domains item {index}"
            )
        )
    if len(set(normalized)) != len(normalized) or normalized != sorted(normalized):
        raise CoverageReviewError(
            "coverage.declared_domains must be sorted and unique"
        )
    return frozenset(normalized)


def _load_script_module(module_name: str, filename: str) -> Any:
    path = Path(__file__).resolve().with_name(filename)
    spec = importlib.util.spec_from_file_location(module_name, path)
    if spec is None or spec.loader is None:
        raise CoverageReviewError(f"cannot load required Choiceprint tool: {filename}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def _validate_pack(pack: Path) -> None:
    _require_private_directory(pack, "canonical pack")
    validator = _load_script_module(
        "choiceprint_coverage_validator", "validate_twin_pack.py"
    )
    result = validator.validate_bundle(pack)
    if not result.ok:
        raise CoverageReviewError(
            "canonical pack failed validation: " + "; ".join(result.errors)
        )


def _pack_binding(pack: Path) -> dict[str, Any]:
    manifest_path = pack / "manifest.json"
    metadata_path = pack / "build-metadata.json"
    manifest = _read_json(manifest_path, "pack manifest")
    _read_json(metadata_path, "pack build metadata")
    binding = {
        "bundle_format": manifest.get("bundle_format"),
        "schema_version": manifest.get("schema_version"),
        "persona_id": manifest.get("persona_id"),
        "content_version": manifest.get("content_version"),
        "manifest_sha256": _sha256_file(manifest_path),
        "build_metadata_sha256": _sha256_file(metadata_path),
    }
    if any(value in (None, "") for value in binding.values()):
        raise CoverageReviewError("pack binding fields are incomplete")
    return binding


def _score_candidates(
    *,
    pack: Path,
    run_root: Path,
    answers_path: Path,
    score_output_path: Path,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    declared_domains = _pack_declared_domains(pack)
    if not declared_domains:
        raise CoverageReviewError(
            "pack coverage.declared_domains is empty; declare the evaluation "
            "taxonomy and rebuild before freezing a holdout"
        )
    evaluator = _load_script_module(
        "choiceprint_coverage_evaluator", "evaluate_choiceprint.py"
    )
    verifier = getattr(evaluator, "verify_score_evidence", None)
    if not callable(verifier):
        raise CoverageReviewError(
            "evaluation tool does not support integrity-bound score evidence"
        )
    evidence = verifier(
        score_root=score_output_path,
        run_root=run_root,
        answers_path=answers_path,
    )
    if not isinstance(evidence, dict):
        raise CoverageReviewError("score evidence verifier returned an invalid result")
    if evidence.get("promotion_eligible") is not True:
        raise CoverageReviewError(
            "evaluation is not eligible for coverage review"
        )
    build_digest = _sha256_file(pack / "build-metadata.json")
    if evidence.get("choiceprint_build_metadata_sha256") != build_digest:
        raise CoverageReviewError(
            "evaluation is not bound to the selected Choiceprint pack"
        )
    summary = _read_json(score_output_path / "summary.json", "score summary")
    if summary.get("run_id") != evidence.get("run_id"):
        raise CoverageReviewError(
            "score summary run_id does not match integrity-bound evidence"
        )
    if summary.get("validated_domains_updated") is not False:
        raise CoverageReviewError("evaluator must not update validated domains")
    gates = summary.get("pilot_gate_by_domain")
    if not isinstance(gates, dict) or not gates:
        raise CoverageReviewError("score summary contains no domain pilot gates")
    items = _read_jsonl(score_output_path / "items.jsonl", "score items")
    item_ids: set[str] = set()
    failures_by_domain: dict[str, list[str]] = {}
    abstentions_by_domain: dict[str, list[str]] = {}
    for item in items:
        case_id = item.get("case_id")
        domain = item.get("domain")
        if not isinstance(case_id, str):
            raise CoverageReviewError("score items contain invalid identifiers")
        domain = _validate_domain_id(domain, f"score item {case_id} domain")
        if domain not in declared_domains:
            raise CoverageReviewError(
                f"score item {case_id} domain '{domain}' is not declared by the pack"
            )
        if case_id in item_ids:
            raise CoverageReviewError(f"duplicate score item case_id: {case_id}")
        item_ids.add(case_id)
        conditions = item.get("conditions")
        choiceprint = conditions.get("choiceprint") if isinstance(conditions, dict) else None
        if not isinstance(choiceprint, dict):
            raise CoverageReviewError(
                f"score item {case_id} lacks Choiceprint condition details"
            )
        if choiceprint.get("modal_correct") is False:
            failures_by_domain.setdefault(domain, []).append(case_id)
        if choiceprint.get("coverage") == 0:
            abstentions_by_domain.setdefault(domain, []).append(case_id)

    candidates: list[dict[str, Any]] = []
    for domain in sorted(gates):
        gate = gates[domain]
        domain = _validate_domain_id(domain, "score summary domain")
        if domain not in declared_domains:
            raise CoverageReviewError(
                f"score summary domain '{domain}' is not declared by the pack"
            )
        if not isinstance(gate, dict):
            raise CoverageReviewError("score summary contains an invalid domain gate")
        if gate.get("pilot_gate_met") is not True:
            continue
        candidates.append(
            {
                "domain": domain,
                "decision": "pending",
                "reason": "",
                "public_reason_code": None,
                "review_context": {
                    "gate": deepcopy(gate),
                    "choiceprint_incorrect_case_ids": sorted(
                        failures_by_domain.get(domain, [])
                    ),
                    "choiceprint_abstained_case_ids": sorted(
                        abstentions_by_domain.get(domain, [])
                    ),
                },
            }
        )
    if not candidates:
        raise CoverageReviewError("no domain passed every pre-registered pilot gate")

    evidence_path = score_output_path / "score-evidence.json"
    _require_private_file(evidence_path, "score evidence")
    evaluation_binding = {
        "run_id": evidence.get("run_id"),
        "run_manifest_sha256": evidence.get("run_manifest_sha256"),
        "prediction_finalization_sha256": evidence.get(
            "prediction_finalization_sha256"
        ),
        "score_evidence_sha256": _sha256_file(evidence_path),
        "choiceprint_build_metadata_sha256": evidence.get(
            "choiceprint_build_metadata_sha256"
        ),
    }
    for field, value in evaluation_binding.items():
        if field == "run_id":
            if not isinstance(value, str) or not value:
                raise CoverageReviewError("score evidence run_id is invalid")
        elif not isinstance(value, str) or not SHA256_PATTERN.fullmatch(value):
            raise CoverageReviewError(f"score evidence {field} is invalid")
    return evaluation_binding, candidates


def prepare_validation_review(
    *,
    pack: Path | str,
    run_root: Path | str,
    answers_path: Path | str,
    score_output_path: Path | str,
    output_path: Path | str,
    prepared_at: str | None = None,
) -> dict[str, Any]:
    pack_path = Path(pack).expanduser().resolve()
    run_path = Path(run_root).expanduser().resolve()
    answers = Path(answers_path).expanduser().resolve()
    score_path = Path(score_output_path).expanduser().resolve()
    output = Path(output_path).expanduser()
    _validate_pack(pack_path)
    evaluation_binding, candidates = _score_candidates(
        pack=pack_path,
        run_root=run_path,
        answers_path=answers,
        score_output_path=score_path,
    )
    timestamp = prepared_at or _utc_now()
    _parse_timestamp(timestamp, "prepared_at")
    review = {
        "review_format": REVIEW_FORMAT,
        "review_kind": "validation",
        "review_status": "pending",
        "scope": PROTOCOL_SCOPE,
        "pack_binding": _pack_binding(pack_path),
        "evaluation_binding": evaluation_binding,
        "prepared_at": timestamp,
        "reviewed_at": None,
        "reviewer": None,
        "owner_attestation": None,
        "domains": candidates,
    }
    _write_private_json(output, review)
    return review


def prepare_revocation_review(
    *,
    pack: Path | str,
    domains: Sequence[str],
    output_path: Path | str,
    prepared_at: str | None = None,
) -> dict[str, Any]:
    pack_path = Path(pack).expanduser().resolve()
    output = Path(output_path).expanduser()
    _validate_pack(pack_path)
    manifest = _read_json(pack_path / "manifest.json", "pack manifest")
    declared_domains = _pack_declared_domains(pack_path)
    coverage = manifest.get("coverage")
    validated = coverage.get("validated_domains") if isinstance(coverage, dict) else None
    if not isinstance(validated, list):
        raise CoverageReviewError("pack coverage projection is invalid")
    requested = [
        _validate_domain_id(domain, "revocation domain") for domain in domains
    ]
    if not requested:
        raise CoverageReviewError("at least one domain is required")
    if len(set(requested)) != len(requested):
        raise CoverageReviewError("revocation domains must be unique")
    undeclared = sorted(set(requested) - declared_domains)
    if undeclared:
        raise CoverageReviewError(
            "cannot revoke a domain outside the pack taxonomy: "
            + ", ".join(undeclared)
        )
    unavailable = sorted(set(requested) - set(map(str, validated)))
    if unavailable:
        raise CoverageReviewError(
            "cannot revoke a domain that is not currently validated: "
            + ", ".join(unavailable)
        )
    events = coverage.get("validation_events", []) if isinstance(coverage, dict) else []
    latest_by_domain: dict[str, str] = {}
    if isinstance(events, list):
        for event in events:
            if isinstance(event, dict) and isinstance(event.get("domain"), str):
                latest_by_domain[event["domain"]] = str(event.get("event_id") or "")
    timestamp = prepared_at or _utc_now()
    _parse_timestamp(timestamp, "prepared_at")
    review = {
        "review_format": REVIEW_FORMAT,
        "review_kind": "revocation",
        "review_status": "pending",
        "scope": PROTOCOL_SCOPE,
        "pack_binding": _pack_binding(pack_path),
        "evaluation_binding": None,
        "prepared_at": timestamp,
        "reviewed_at": None,
        "reviewer": None,
        "owner_attestation": None,
        "domains": [
            {
                "domain": domain,
                "decision": "pending",
                "reason": "",
                "public_reason_code": None,
                "review_context": {
                    "latest_validation_event_id": latest_by_domain.get(domain)
                },
            }
            for domain in sorted(requested)
        ],
    }
    _write_private_json(output, review)
    return review


def _validate_review_document(
    review: Mapping[str, Any], *, require_complete: bool
) -> dict[str, Any]:
    if set(review) != TOP_LEVEL_FIELDS:
        raise CoverageReviewError("coverage review fields do not match the closed schema")
    if review.get("review_format") != REVIEW_FORMAT:
        raise CoverageReviewError("unsupported coverage review format")
    kind = review.get("review_kind")
    if kind not in {"validation", "revocation"}:
        raise CoverageReviewError("coverage review kind is invalid")
    expected_status = "completed" if require_complete else "pending"
    if review.get("review_status") != expected_status:
        raise CoverageReviewError(
            f"coverage review status must be {expected_status}"
        )
    if review.get("scope") != PROTOCOL_SCOPE:
        raise CoverageReviewError("coverage review scope is invalid")
    pack_binding = review.get("pack_binding")
    if not isinstance(pack_binding, dict) or set(pack_binding) != PACK_BINDING_FIELDS:
        raise CoverageReviewError("coverage review pack binding is invalid")
    for digest_field in ("manifest_sha256", "build_metadata_sha256"):
        digest = pack_binding.get(digest_field)
        if not isinstance(digest, str) or not SHA256_PATTERN.fullmatch(digest):
            raise CoverageReviewError(f"coverage review {digest_field} is invalid")
    evaluation_binding = review.get("evaluation_binding")
    if kind == "validation":
        if (
            not isinstance(evaluation_binding, dict)
            or set(evaluation_binding) != EVALUATION_BINDING_FIELDS
        ):
            raise CoverageReviewError("validation review evaluation binding is invalid")
        for field, value in evaluation_binding.items():
            if field == "run_id":
                if not isinstance(value, str) or not value:
                    raise CoverageReviewError("validation review run_id is invalid")
            elif not isinstance(value, str) or not SHA256_PATTERN.fullmatch(value):
                raise CoverageReviewError(f"validation review {field} is invalid")
    elif evaluation_binding is not None:
        raise CoverageReviewError("revocation review must not include evaluation data")
    prepared = _parse_timestamp(review.get("prepared_at"), "prepared_at")
    domains = review.get("domains")
    if not isinstance(domains, list) or not domains:
        raise CoverageReviewError("coverage review must contain at least one domain")
    seen: set[str] = set()
    for row in domains:
        if not isinstance(row, dict) or set(row) != DOMAIN_FIELDS:
            raise CoverageReviewError("coverage review domain row is invalid")
        domain = _validate_domain_id(row.get("domain"), "coverage review domain")
        if domain in seen:
            raise CoverageReviewError("coverage review domains must be unique strings")
        seen.add(domain)
        decision = row.get("decision")
        allowed = {"approve", "reject"} if require_complete else {"pending"}
        if decision not in allowed:
            raise CoverageReviewError("coverage review decision is invalid")
        reason = row.get("reason")
        if not isinstance(reason, str):
            raise CoverageReviewError("coverage review reason must be text")
        if require_complete and kind == "revocation" and decision == "approve" and not reason.strip():
            raise CoverageReviewError("an approved revocation requires a reason")
        public_reason_code = row.get("public_reason_code")
        if kind == "validation":
            if public_reason_code is not None:
                raise CoverageReviewError(
                    "validation review must not include a revocation reason code"
                )
        elif require_complete and decision == "approve":
            if public_reason_code not in REVOCATION_REASON_CODES:
                raise CoverageReviewError(
                    "an approved revocation requires a valid public reason code"
                )
        elif public_reason_code is not None:
            raise CoverageReviewError(
                "a pending or rejected revocation must not include a public reason code"
            )
        if not isinstance(row.get("review_context"), dict):
            raise CoverageReviewError("coverage review context must be an object")
    if require_complete:
        reviewed = _parse_timestamp(review.get("reviewed_at"), "reviewed_at")
        if reviewed < prepared:
            raise CoverageReviewError("reviewed_at cannot predate prepared_at")
        if review.get("reviewer") != "owner":
            raise CoverageReviewError("completed coverage review must name the owner")
        if review.get("owner_attestation") != OWNER_ATTESTATION:
            raise CoverageReviewError("completed coverage review owner attestation is invalid")
    elif any(
        review.get(field) is not None
        for field in ("reviewed_at", "reviewer", "owner_attestation")
    ):
        raise CoverageReviewError("pending coverage review cannot claim completion")
    return deepcopy(dict(review))


def _load_review(path: Path, *, require_complete: bool) -> dict[str, Any]:
    path = _assert_private_review_path(path)
    _require_private_file(path, "private coverage review")
    return _validate_review_document(
        _read_json(path, "private coverage review"),
        require_complete=require_complete,
    )


def _assert_review_matches_pack(review: Mapping[str, Any], pack: Path) -> None:
    if review.get("pack_binding") != _pack_binding(pack):
        raise CoverageReviewError("coverage review does not match the selected pack")


def interactive_review(
    *,
    pack: Path | str,
    input_path: Path | str,
    output_path: Path | str,
    run_root: Path | str | None = None,
    answers_path: Path | str | None = None,
    score_output_path: Path | str | None = None,
    input_fn: Callable[[str], str] = input,
    reviewed_at: str | None = None,
) -> dict[str, Any]:
    pack_path = Path(pack).expanduser().resolve()
    source = Path(input_path).expanduser().resolve()
    output = Path(output_path).expanduser()
    _validate_pack(pack_path)
    review = _load_review(source, require_complete=False)
    _assert_review_matches_pack(review, pack_path)
    if review["review_kind"] == "validation":
        if run_root is None or answers_path is None or score_output_path is None:
            raise CoverageReviewError(
                "validation review requires run root, answers, and score output"
            )
        binding, candidates = _score_candidates(
            pack=pack_path,
            run_root=Path(run_root).expanduser().resolve(),
            answers_path=Path(answers_path).expanduser().resolve(),
            score_output_path=Path(score_output_path).expanduser().resolve(),
        )
        if binding != review.get("evaluation_binding"):
            raise CoverageReviewError("pending review evaluation binding is stale")
        if candidates != review.get("domains"):
            raise CoverageReviewError(
                "pending review context does not match integrity-bound score evidence"
            )
    else:
        if any(
            value is not None
            for value in (run_root, answers_path, score_output_path)
        ):
            raise CoverageReviewError(
                "revocation review must not accept evaluation artifacts"
            )
        manifest = _read_json(pack_path / "manifest.json", "pack manifest")
        coverage = manifest.get("coverage")
        validated = (
            coverage.get("validated_domains")
            if isinstance(coverage, dict)
            else None
        )
        if not isinstance(validated, list):
            raise CoverageReviewError("pack coverage projection is invalid")
        latest = _latest_event_ids(manifest)
        for row in review["domains"]:
            domain = row["domain"]
            expected_context = {
                "latest_validation_event_id": latest.get(domain)
            }
            if domain not in validated or row["review_context"] != expected_context:
                raise CoverageReviewError(
                    "pending revocation review no longer matches pack coverage"
                )
    completed = deepcopy(review)
    kind = str(completed["review_kind"])
    action_label = "validate" if kind == "validation" else "revoke"
    for row in completed["domains"]:
        domain = row["domain"]
        context = row["review_context"]
        print(f"\nDomain: {domain}")
        if kind == "validation":
            gate = context.get("gate", {})
            print(
                "Pilot gate: passed; cases: "
                f"{gate.get('case_count', 'unknown')}; families: "
                f"{gate.get('scenario_family_count', 'unknown')}; retests: "
                f"{gate.get('retest_case_count', 'unknown')}"
            )
            failures = context.get("choiceprint_incorrect_case_ids", [])
            abstentions = context.get("choiceprint_abstained_case_ids", [])
            print("Incorrect cases: " + (", ".join(failures) if failures else "none"))
            print("Abstained cases: " + (", ".join(abstentions) if abstentions else "none"))
        else:
            print(
                "Current validation event: "
                + str(context.get("latest_validation_event_id") or "unknown")
            )
        try:
            decision = input_fn(
                f"Explicitly {action_label} this domain? [approve/reject/cancel]: "
            ).strip().casefold()
        except EOFError as exc:
            raise ReviewCancelled("coverage review cancelled at end of input") from exc
        if decision == "cancel":
            raise ReviewCancelled("coverage review cancelled by owner")
        if decision not in {"approve", "reject"}:
            raise CoverageReviewError(
                "decision must be exactly approve, reject, or cancel"
            )
        row["decision"] = decision
        try:
            reason = input_fn(
                "Reason or notes"
                + (" (required)" if kind == "revocation" and decision == "approve" else " (optional)")
                + ": "
            ).strip()
        except EOFError as exc:
            raise ReviewCancelled("coverage review cancelled at end of input") from exc
        if kind == "revocation" and decision == "approve" and not reason:
            raise CoverageReviewError("approved revocation requires a non-empty reason")
        if kind == "revocation" and decision == "approve":
            try:
                reason_code = input_fn(
                    "Public reason code ["
                    + "/".join(sorted(REVOCATION_REASON_CODES))
                    + "]: "
                ).strip()
            except EOFError as exc:
                raise ReviewCancelled(
                    "coverage review cancelled at end of input"
                ) from exc
            if reason_code not in REVOCATION_REASON_CODES:
                raise CoverageReviewError(
                    "public revocation reason code is invalid"
                )
            row["public_reason_code"] = reason_code
        row["reason"] = reason
    timestamp = reviewed_at or _utc_now()
    completed["review_status"] = "completed"
    completed["reviewed_at"] = timestamp
    completed["reviewer"] = "owner"
    completed["owner_attestation"] = OWNER_ATTESTATION
    completed = _validate_review_document(completed, require_complete=True)
    _write_private_json(output, completed)
    return completed


def _latest_event_ids(manifest: Mapping[str, Any]) -> dict[str, str]:
    coverage = manifest.get("coverage")
    events = coverage.get("validation_events", []) if isinstance(coverage, dict) else []
    latest: dict[str, str] = {}
    if isinstance(events, list):
        for event in events:
            if isinstance(event, dict):
                domain = event.get("domain")
                event_id = event.get("event_id")
                if isinstance(domain, str) and isinstance(event_id, str):
                    latest[domain] = event_id
    return latest


def apply_review(
    *,
    pack: Path | str,
    review_path: Path | str,
    output_pack: Path | str,
    run_root: Path | str | None = None,
    answers_path: Path | str | None = None,
    score_output_path: Path | str | None = None,
    recorded_at: str | None = None,
) -> list[str]:
    pack_path = Path(pack).expanduser().resolve()
    receipt_path = Path(review_path).expanduser().resolve()
    output = Path(output_pack).expanduser()
    _validate_pack(pack_path)
    review = _load_review(receipt_path, require_complete=True)
    _assert_review_matches_pack(review, pack_path)
    kind = review["review_kind"]
    if kind == "validation":
        if run_root is None or answers_path is None or score_output_path is None:
            raise CoverageReviewError(
                "validation apply requires run root, answers, and score output"
            )
        binding, candidates = _score_candidates(
            pack=pack_path,
            run_root=Path(run_root).expanduser().resolve(),
            answers_path=Path(answers_path).expanduser().resolve(),
            score_output_path=Path(score_output_path).expanduser().resolve(),
        )
        if binding != review.get("evaluation_binding"):
            raise CoverageReviewError("completed review evaluation binding is stale")
        if [row["domain"] for row in candidates] != [
            row["domain"] for row in review["domains"]
        ] or any(
            review_row["review_context"] != candidate["review_context"]
            for review_row, candidate in zip(review["domains"], candidates)
        ):
            raise CoverageReviewError("completed review candidates are stale")
    else:
        if any(value is not None for value in (run_root, answers_path, score_output_path)):
            raise CoverageReviewError(
                "revocation apply must not accept evaluation artifacts"
            )
    approved = [row for row in review["domains"] if row["decision"] == "approve"]
    if not approved:
        raise CoverageReviewError("completed review approved no coverage changes")
    timestamp = recorded_at or _utc_now()
    recorded = _parse_timestamp(timestamp, "recorded_at")
    reviewed = _parse_timestamp(review.get("reviewed_at"), "reviewed_at")
    if recorded < reviewed:
        raise CoverageReviewError("recorded_at cannot predate reviewed_at")
    receipt_sha256 = _sha256_file(receipt_path)
    source_metadata_sha256 = _sha256_file(pack_path / "build-metadata.json")
    manifest = _read_json(pack_path / "manifest.json", "pack manifest")
    latest = _latest_event_ids(manifest)
    events: list[dict[str, Any]] = []
    for row in approved:
        domain = row["domain"]
        action = "validate" if kind == "validation" else "revoke"
        event_id = "coverage-" + hashlib.sha256(
            f"{receipt_sha256}|{domain}|{action}".encode("utf-8")
        ).hexdigest()[:24]
        event = {
            "event_id": event_id,
            "domain": domain,
            "action": action,
            "scope": PROTOCOL_SCOPE,
            "prepared_at": review["prepared_at"],
            "reviewed_at": review["reviewed_at"],
            "recorded_at": timestamp,
            "review_receipt_sha256": receipt_sha256,
            "source_build_metadata_sha256": source_metadata_sha256,
            "supersedes_event_id": latest.get(domain),
        }
        if kind == "validation":
            event["evaluation_evidence_sha256"] = review["evaluation_binding"][
                "score_evidence_sha256"
            ]
        else:
            event["reason_code"] = row["public_reason_code"]
        events.append(event)
    compiler = _load_script_module(
        "choiceprint_coverage_compiler", "build_choiceprint.py"
    )
    release_builder = getattr(compiler, "build_coverage_release", None)
    if not callable(release_builder):
        raise CoverageReviewError("Choiceprint builder lacks coverage release support")
    release_builder(pack_path, output, events)
    return [str(row["domain"]) for row in approved]


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    prepare = subparsers.add_parser(
        "prepare",
        help="prepare a private validation review from integrity-bound evidence",
    )
    prepare.add_argument("--pack", required=True)
    prepare.add_argument("--run", required=True)
    prepare.add_argument("--answers", required=True)
    prepare.add_argument("--score", required=True)
    prepare.add_argument("--output", required=True)

    revoke = subparsers.add_parser(
        "prepare-revoke", help="prepare a private revocation review"
    )
    revoke.add_argument("--pack", required=True)
    revoke.add_argument("--domain", action="append", required=True)
    revoke.add_argument("--output", required=True)

    interactive = subparsers.add_parser(
        "interactive", help="complete a pending review with explicit owner decisions"
    )
    interactive.add_argument("--pack", required=True)
    interactive.add_argument("--input", required=True)
    interactive.add_argument("--output", required=True)
    interactive.add_argument("--run")
    interactive.add_argument("--answers")
    interactive.add_argument("--score")

    apply = subparsers.add_parser(
        "apply", help="apply a completed review to a new Choiceprint pack"
    )
    apply.add_argument("--pack", required=True)
    apply.add_argument("--review", required=True)
    apply.add_argument("--output", required=True)
    apply.add_argument("--run")
    apply.add_argument("--answers")
    apply.add_argument("--score")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _build_parser().parse_args(argv)
    if args.command == "prepare":
        review = prepare_validation_review(
            pack=args.pack,
            run_root=args.run,
            answers_path=args.answers,
            score_output_path=args.score,
            output_path=args.output,
        )
        print(
            "Prepared private coverage review for "
            f"{len(review['domains'])} gate-passing domain(s): {args.output}"
        )
    elif args.command == "prepare-revoke":
        review = prepare_revocation_review(
            pack=args.pack,
            domains=args.domain,
            output_path=args.output,
        )
        print(
            "Prepared private coverage revocation review for "
            f"{len(review['domains'])} domain(s): {args.output}"
        )
    elif args.command == "interactive":
        completed = interactive_review(
            pack=args.pack,
            input_path=args.input,
            output_path=args.output,
            run_root=args.run,
            answers_path=args.answers,
            score_output_path=args.score,
        )
        print(
            "Completed private coverage review for "
            f"{len(completed['domains'])} domain(s): {args.output}"
        )
    else:
        selected = apply_review(
            pack=args.pack,
            review_path=args.review,
            output_pack=args.output,
            run_root=args.run,
            answers_path=args.answers,
            score_output_path=args.score,
        )
        print(
            "Created coverage release for: " + ", ".join(selected)
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
