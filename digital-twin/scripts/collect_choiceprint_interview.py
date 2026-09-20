#!/usr/bin/env python3
"""Collect private, candidate-only Choiceprint decision interview responses."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import re
import secrets
import stat
import sys
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Mapping, Sequence


SCRIPT_DIR = Path(__file__).resolve().parent
REPOSITORY_ROOT = SCRIPT_DIR.parents[1]
DEFAULT_BANK = SCRIPT_DIR.parent / "interview/decision-interview.v1.json"

BANK_FORMAT = "choiceprint-decision-interview-bank/0.1"
ARTIFACT_FORMAT = "choiceprint-decision-interview-responses/0.1"
COLLECTOR_VERSION = "0.1.0"
MAX_BANK_BYTES = 1_048_576
MAX_ARTIFACT_BYTES = 8_388_608
MAX_RESPONSE_BYTES = 4_096
SAFE_ID = re.compile(r"^[a-z0-9]+(?:[-_][a-z0-9]+)*$")
CANCEL_WORDS = frozenset({"cancel", "exit", "quit"})

BANK_KEYS = frozenset({"format", "bank_id", "version", "description", "questions"})
QUESTION_KEYS = frozenset({"id", "domain", "family", "prompt", "context", "options"})
CONTEXT_KEYS = frozenset(
    {"stakes", "reversibility", "time_horizon", "social_context"}
)
OPTION_KEYS = frozenset({"id", "label"})
ARTIFACT_KEYS = frozenset(
    {
        "format",
        "status",
        "session_id",
        "started_at",
        "completed_at",
        "question_bank",
        "response_count",
        "responses",
        "promotion",
        "collector",
        "integrity",
    }
)
RESPONSE_KEYS = frozenset(
    {
        "question_id",
        "domain",
        "family",
        "prompt",
        "scenario_context",
        "selected_option",
        "rejected_options",
        "rationale",
        "exceptions",
        "context_note",
        "outcome",
        "answered_at",
        "evidence_type",
    }
)


class InterviewError(ValueError):
    """Raised when an interview input, response, or output is unsafe."""


class InterviewCancelled(Exception):
    """Raised when the owner cancels before the artifact is published."""


def _reject_json_constant(value: str) -> Any:
    raise ValueError(f"non-finite JSON constant: {value}")


def _unique_json_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"duplicate JSON key: {key}")
        result[key] = value
    return result


def _load_json(raw: bytes, label: str) -> Any:
    try:
        value = json.loads(
            raw,
            object_pairs_hook=_unique_json_object,
            parse_constant=_reject_json_constant,
        )
    except (UnicodeError, json.JSONDecodeError, ValueError) as exc:
        raise InterviewError(f"{label} is not valid strict JSON: {exc}") from exc
    _assert_finite(value)
    return value


def _assert_finite(value: Any, active: set[int] | None = None) -> None:
    if isinstance(value, float) and not math.isfinite(value):
        raise InterviewError("JSON values must be finite")
    if not isinstance(value, (dict, list)):
        return
    ancestors = set() if active is None else set(active)
    identity = id(value)
    if identity in ancestors:
        raise InterviewError("JSON values must not be recursive")
    ancestors.add(identity)
    children = value.values() if isinstance(value, dict) else value
    for child in children:
        _assert_finite(child, ancestors)


def _canonical_json(value: Any) -> bytes:
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    ).encode("utf-8")


def _sha256(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def _absolute(path: Path | str) -> Path:
    return Path(os.path.abspath(Path(path).expanduser()))


def _path_exists(path: Path) -> bool:
    return os.path.lexists(path)


def _is_relative_to(path: Path, parent: Path) -> bool:
    try:
        path.relative_to(parent)
        return True
    except ValueError:
        return False


def _require_no_symlink_chain(path: Path, label: str) -> None:
    absolute = _absolute(path)
    current = Path(absolute.anchor)
    for part in absolute.parts[1:]:
        current /= part
        if not _path_exists(current):
            continue
        try:
            mode = current.lstat().st_mode
        except OSError as exc:
            raise InterviewError(f"could not inspect {label} path") from exc
        if stat.S_ISLNK(mode):
            raise InterviewError(f"{label} path must not contain a symlink")


def _read_regular_file(
    path: Path | str,
    *,
    label: str,
    maximum_bytes: int,
    require_private_mode: bool = False,
) -> tuple[bytes, int]:
    absolute = _absolute(path)
    _require_no_symlink_chain(absolute.parent, label)
    flags = os.O_RDONLY
    for name in ("O_CLOEXEC", "O_NOFOLLOW", "O_NONBLOCK"):
        flags |= int(getattr(os, name, 0))
    try:
        descriptor = os.open(absolute, flags)
    except OSError as exc:
        raise InterviewError(f"{label} must be a readable regular file") from exc
    try:
        before = os.fstat(descriptor)
        if not stat.S_ISREG(before.st_mode):
            raise InterviewError(f"{label} must be a regular file")
        if before.st_size > maximum_bytes:
            raise InterviewError(f"{label} exceeds its local size limit")
        mode = stat.S_IMODE(before.st_mode)
        if require_private_mode and os.name == "posix" and mode != 0o600:
            raise InterviewError(f"{label} must have mode 0600")
        chunks: list[bytes] = []
        total = 0
        while True:
            chunk = os.read(descriptor, 64 * 1024)
            if not chunk:
                break
            total += len(chunk)
            if total > maximum_bytes:
                raise InterviewError(f"{label} exceeds its local size limit")
            chunks.append(chunk)
        after = os.fstat(descriptor)
        stable = ("st_dev", "st_ino", "st_size", "st_mtime_ns", "st_ctime_ns")
        if any(getattr(before, name) != getattr(after, name) for name in stable):
            raise InterviewError(f"{label} changed while it was read")
        return b"".join(chunks), mode
    finally:
        os.close(descriptor)


def _closed_mapping(value: Any, expected: frozenset[str], label: str) -> Mapping[str, Any]:
    if not isinstance(value, dict):
        raise InterviewError(f"{label} must be an object")
    missing = sorted(expected - set(value))
    extra = sorted(set(value) - expected)
    if missing:
        raise InterviewError(f"{label} is missing fields: {', '.join(missing)}")
    if extra:
        raise InterviewError(f"{label} has unsupported fields: {', '.join(extra)}")
    return value


def _text(value: Any, label: str, *, maximum: int = 4_096) -> str:
    if not isinstance(value, str) or not value.strip():
        raise InterviewError(f"{label} must be a non-empty string")
    normalized = value.strip()
    if len(normalized.encode("utf-8")) > maximum:
        raise InterviewError(f"{label} exceeds its local size limit")
    return normalized


def _identifier(value: Any, label: str) -> str:
    identifier = _text(value, label, maximum=128)
    if not SAFE_ID.fullmatch(identifier):
        raise InterviewError(f"{label} must be a bounded lowercase slug")
    return identifier


def _validate_bank(document: Any) -> dict[str, Any]:
    bank = dict(_closed_mapping(document, BANK_KEYS, "question bank"))
    if bank["format"] != BANK_FORMAT:
        raise InterviewError("question bank format is not supported")
    bank["bank_id"] = _identifier(bank["bank_id"], "question bank bank_id")
    bank["version"] = _text(bank["version"], "question bank version", maximum=64)
    bank["description"] = _text(
        bank["description"], "question bank description", maximum=2_048
    )
    questions = bank["questions"]
    if not isinstance(questions, list) or not questions:
        raise InterviewError("question bank questions must be a non-empty list")
    seen_questions: set[str] = set()
    validated_questions: list[dict[str, Any]] = []
    for index, raw_question in enumerate(questions, start=1):
        question = dict(
            _closed_mapping(raw_question, QUESTION_KEYS, f"question {index}")
        )
        question_id = _identifier(question["id"], f"question {index} id")
        if question_id in seen_questions:
            raise InterviewError(f"question bank repeats question id: {question_id}")
        seen_questions.add(question_id)
        question["id"] = question_id
        question["domain"] = _identifier(
            question["domain"], f"question {question_id} domain"
        )
        question["family"] = _identifier(
            question["family"], f"question {question_id} family"
        )
        question["prompt"] = _text(
            question["prompt"], f"question {question_id} prompt", maximum=2_048
        )
        context = dict(
            _closed_mapping(
                question["context"], CONTEXT_KEYS, f"question {question_id} context"
            )
        )
        for key in sorted(CONTEXT_KEYS):
            context[key] = _identifier(
                context[key], f"question {question_id} context {key}"
            )
        question["context"] = context
        options = question["options"]
        if not isinstance(options, list) or not 3 <= len(options) <= 5:
            raise InterviewError(
                f"question {question_id} must contain three to five options"
            )
        seen_option_ids: set[str] = set()
        seen_labels: set[str] = set()
        validated_options: list[dict[str, str]] = []
        for option_index, raw_option in enumerate(options, start=1):
            option = dict(
                _closed_mapping(
                    raw_option,
                    OPTION_KEYS,
                    f"question {question_id} option {option_index}",
                )
            )
            option_id = _identifier(
                option["id"], f"question {question_id} option {option_index} id"
            )
            label = _text(
                option["label"],
                f"question {question_id} option {option_index} label",
                maximum=512,
            )
            if option_id in seen_option_ids:
                raise InterviewError(
                    f"question {question_id} repeats option id: {option_id}"
                )
            normalized_label = re.sub(r"\s+", " ", label.casefold())
            if normalized_label in seen_labels:
                raise InterviewError(f"question {question_id} repeats an option label")
            seen_option_ids.add(option_id)
            seen_labels.add(normalized_label)
            validated_options.append({"id": option_id, "label": label})
        question["options"] = validated_options
        validated_questions.append(question)
    bank["questions"] = validated_questions
    return bank


def load_question_bank(path: Path | str) -> tuple[dict[str, Any], str]:
    raw, _ = _read_regular_file(
        path,
        label="question bank",
        maximum_bytes=MAX_BANK_BYTES,
    )
    return _validate_bank(_load_json(raw, "question bank")), _sha256(raw)


def _timestamp(now_fn: Callable[[], datetime]) -> str:
    value = now_fn()
    if not isinstance(value, datetime) or value.tzinfo is None or value.utcoffset() is None:
        raise InterviewError("collector clock must return a timezone-aware datetime")
    return value.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace(
        "+00:00", "Z"
    )


def _parse_timestamp(value: Any, label: str) -> datetime:
    text = _text(value, label, maximum=64)
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError as exc:
        raise InterviewError(f"{label} must be an ISO-8601 timestamp") from exc
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise InterviewError(f"{label} must include a timezone")
    return parsed.astimezone(timezone.utc)


def _input(
    prompt: str,
    *,
    input_fn: Callable[[str], str],
    allow_none: bool = False,
) -> str | None:
    try:
        raw = input_fn(prompt)
    except (EOFError, KeyboardInterrupt) as exc:
        raise InterviewCancelled from exc
    if not isinstance(raw, str):
        raise InterviewError("collector input must be text")
    value = raw.strip()
    if value.casefold() in CANCEL_WORDS:
        raise InterviewCancelled
    if len(value.encode("utf-8")) > MAX_RESPONSE_BYTES:
        raise InterviewError("an interview response exceeds the local size limit")
    if allow_none and value.casefold() in {"none", "none known", "n/a"}:
        return None
    if not value:
        raise InterviewError("interview responses must not be blank")
    return value


def _ask_choice(
    question: Mapping[str, Any],
    *,
    input_fn: Callable[[str], str],
    output_fn: Callable[[str], None],
) -> dict[str, str]:
    options = question["options"]
    by_id = {option["id"]: option for option in options}
    while True:
        selected = _input(
            "Choice ID (or cancel): ", input_fn=input_fn
        )
        if selected in by_id:
            return deepcopy(by_id[selected])
        output_fn("Enter one of the displayed option IDs.")


def _ask_yes_no(
    prompt: str,
    *,
    input_fn: Callable[[str], str],
    output_fn: Callable[[str], None],
) -> bool:
    while True:
        answer = _input(prompt, input_fn=input_fn)
        normalized = answer.casefold()
        if normalized in {"y", "yes"}:
            return True
        if normalized in {"n", "no"}:
            return False
        output_fn("Enter yes or no.")


def _exception_list(value: str | None) -> list[str]:
    if value is None:
        return []
    items = [item.strip() for item in value.split(";") if item.strip()]
    if len(items) > 5:
        raise InterviewError("record at most five semicolon-separated exceptions")
    deduplicated: list[str] = []
    seen: set[str] = set()
    for item in items:
        normalized = re.sub(r"\s+", " ", item.casefold())
        if normalized not in seen:
            seen.add(normalized)
            deduplicated.append(item)
    return deduplicated


def _response_for_question(
    question: Mapping[str, Any],
    *,
    input_fn: Callable[[str], str],
    output_fn: Callable[[str], None],
    now_fn: Callable[[], datetime],
) -> dict[str, Any]:
    output_fn("")
    output_fn(str(question["prompt"]))
    for option in question["options"]:
        output_fn(f"  {option['id']}: {option['label']}")
    selected = _ask_choice(question, input_fn=input_fn, output_fn=output_fn)
    rejected = [
        deepcopy(option)
        for option in question["options"]
        if option["id"] != selected["id"]
    ]
    rationale = _input(
        "Why is that the most likely choice? (or cancel): ", input_fn=input_fn
    )
    raw_exceptions = _input(
        "What would make another option more likely? Use semicolons, or none: ",
        input_fn=input_fn,
        allow_none=True,
    )
    context_note = _input(
        "What personal circumstance materially affects this choice? Or none: ",
        input_fn=input_fn,
        allow_none=True,
    )
    outcome_known = _ask_yes_no(
        "Is there a known real outcome for an analogous choice? [yes/no]: ",
        input_fn=input_fn,
        output_fn=output_fn,
    )
    outcome_description = None
    if outcome_known:
        outcome_description = _input(
            "Describe the known outcome (or cancel): ", input_fn=input_fn
        )
    return {
        "question_id": question["id"],
        "domain": question["domain"],
        "family": question["family"],
        "prompt": question["prompt"],
        "scenario_context": deepcopy(question["context"]),
        "selected_option": selected,
        "rejected_options": rejected,
        "rationale": rationale,
        "exceptions": _exception_list(raw_exceptions),
        "context_note": context_note,
        "outcome": {
            "known": outcome_known,
            "description": outcome_description,
        },
        "answered_at": _timestamp(now_fn),
        "evidence_type": "direct_self_report",
    }


def _initial_output_check(path: Path | str) -> Path:
    output = _absolute(path)
    if _is_relative_to(output, REPOSITORY_ROOT):
        raise InterviewError("private interview output must be outside the repository")
    _require_no_symlink_chain(output.parent, "output")
    if _path_exists(output):
        raise InterviewError("interview output already exists")
    if output.parent.exists():
        mode = output.parent.lstat().st_mode
        if not stat.S_ISDIR(mode):
            raise InterviewError("interview output parent must be a directory")
        if os.name == "posix" and stat.S_IMODE(mode) != 0o700:
            raise InterviewError("interview output parent must have mode 0700")
    return output


def _prepare_private_parent(path: Path) -> None:
    _require_no_symlink_chain(path, "output")
    try:
        path.mkdir(parents=True, mode=0o700, exist_ok=True)
    except OSError as exc:
        raise InterviewError("could not create the private output directory") from exc
    _require_no_symlink_chain(path, "output")
    mode = path.lstat().st_mode
    if not stat.S_ISDIR(mode):
        raise InterviewError("interview output parent must be a directory")
    if os.name == "posix":
        os.chmod(path, 0o700)
        if stat.S_IMODE(path.lstat().st_mode) != 0o700:
            raise InterviewError("interview output parent must have mode 0700")


def _write_private_new_json(path: Path, document: Mapping[str, Any]) -> None:
    payload = json.dumps(
        document,
        ensure_ascii=False,
        indent=2,
        sort_keys=True,
        allow_nan=False,
    ).encode("utf-8") + b"\n"
    if len(payload) > MAX_ARTIFACT_BYTES:
        raise InterviewError("interview artifact exceeds its local size limit")
    _prepare_private_parent(path.parent)
    if _path_exists(path):
        raise InterviewError("interview output already exists")
    directory_flags = os.O_RDONLY
    for name in ("O_CLOEXEC", "O_DIRECTORY", "O_NOFOLLOW"):
        directory_flags |= int(getattr(os, name, 0))
    try:
        directory_descriptor = os.open(path.parent, directory_flags)
    except OSError as exc:
        raise InterviewError("could not safely open the private output directory") from exc
    temporary_name = f".{path.name}.{secrets.token_hex(12)}.tmp"
    temporary_created = False
    try:
        file_flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
        for name in ("O_CLOEXEC", "O_NOFOLLOW"):
            file_flags |= int(getattr(os, name, 0))
        descriptor = os.open(
            temporary_name,
            file_flags,
            0o600,
            dir_fd=directory_descriptor,
        )
        temporary_created = True
        try:
            offset = 0
            while offset < len(payload):
                offset += os.write(descriptor, payload[offset:])
            os.fchmod(descriptor, 0o600)
            os.fsync(descriptor)
        finally:
            os.close(descriptor)
        try:
            os.link(
                temporary_name,
                path.name,
                src_dir_fd=directory_descriptor,
                dst_dir_fd=directory_descriptor,
                follow_symlinks=False,
            )
        except FileExistsError as exc:
            raise InterviewError("interview output already exists") from exc
        os.unlink(temporary_name, dir_fd=directory_descriptor)
        temporary_created = False
        os.fsync(directory_descriptor)
    finally:
        if temporary_created:
            try:
                os.unlink(temporary_name, dir_fd=directory_descriptor)
            except FileNotFoundError:
                pass
        os.close(directory_descriptor)
    if os.name == "posix" and stat.S_IMODE(path.lstat().st_mode) != 0o600:
        raise InterviewError("interview output must have mode 0600")


def _artifact_content(document: Mapping[str, Any]) -> dict[str, Any]:
    return {key: deepcopy(value) for key, value in document.items() if key != "integrity"}


def _validate_artifact(document: Any, bank: Mapping[str, Any], bank_sha256: str) -> dict[str, Any]:
    artifact = dict(_closed_mapping(document, ARTIFACT_KEYS, "interview artifact"))
    if artifact["format"] != ARTIFACT_FORMAT:
        raise InterviewError("interview artifact format is not supported")
    if artifact["status"] != "candidate_only":
        raise InterviewError("interview artifact status must remain candidate_only")
    _identifier(artifact["session_id"], "interview artifact session_id")
    started = _parse_timestamp(artifact["started_at"], "interview artifact started_at")
    completed = _parse_timestamp(
        artifact["completed_at"], "interview artifact completed_at"
    )
    if completed < started:
        raise InterviewError("interview artifact completion predates its start")
    bank_binding = _closed_mapping(
        artifact["question_bank"],
        frozenset({"format", "bank_id", "version", "sha256"}),
        "interview artifact question_bank",
    )
    expected_bank = {
        "format": bank["format"],
        "bank_id": bank["bank_id"],
        "version": bank["version"],
        "sha256": bank_sha256,
    }
    if dict(bank_binding) != expected_bank:
        raise InterviewError("interview artifact is not bound to this question bank")
    promotion = _closed_mapping(
        artifact["promotion"],
        frozenset({"performed", "review_required"}),
        "interview artifact promotion",
    )
    if promotion != {"performed": False, "review_required": True}:
        raise InterviewError("interview artifact must not promote evidence into a pack")
    collector = _closed_mapping(
        artifact["collector"],
        frozenset({"version", "model_calls", "network_calls"}),
        "interview artifact collector",
    )
    if collector != {
        "version": COLLECTOR_VERSION,
        "model_calls": False,
        "network_calls": False,
    }:
        raise InterviewError("interview artifact collector metadata is invalid")
    responses = artifact["responses"]
    if not isinstance(responses, list):
        raise InterviewError("interview artifact responses must be a list")
    if artifact["response_count"] != len(responses):
        raise InterviewError("interview artifact response_count is inconsistent")
    questions = {question["id"]: question for question in bank["questions"]}
    if [response.get("question_id") for response in responses] != list(questions):
        raise InterviewError("interview artifact must cover the question bank in order")
    previous = started
    for index, raw_response in enumerate(responses, start=1):
        response = _closed_mapping(
            raw_response, RESPONSE_KEYS, f"interview response {index}"
        )
        question = questions[response["question_id"]]
        for key in ("domain", "family", "prompt"):
            if response[key] != question[key]:
                raise InterviewError(
                    f"interview response {index} does not match question {key}"
                )
        if response["scenario_context"] != question["context"]:
            raise InterviewError(
                f"interview response {index} does not match question context"
            )
        selected = _closed_mapping(
            response["selected_option"],
            OPTION_KEYS,
            f"interview response {index} selected_option",
        )
        rejected = response["rejected_options"]
        if not isinstance(rejected, list):
            raise InterviewError(
                f"interview response {index} rejected_options must be a list"
            )
        rendered_options = [dict(selected)] + [
            dict(
                _closed_mapping(
                    item,
                    OPTION_KEYS,
                    f"interview response {index} rejected option",
                )
            )
            for item in rejected
        ]
        expected_options = {item["id"]: item for item in question["options"]}
        if {item["id"]: item for item in rendered_options} != expected_options:
            raise InterviewError(
                f"interview response {index} does not partition the question options"
            )
        _text(response["rationale"], f"interview response {index} rationale")
        exceptions = response["exceptions"]
        if not isinstance(exceptions, list) or len(exceptions) > 5:
            raise InterviewError(
                f"interview response {index} exceptions must be a bounded list"
            )
        for exception in exceptions:
            _text(exception, f"interview response {index} exception")
        context_note = response["context_note"]
        if context_note is not None:
            _text(context_note, f"interview response {index} context_note")
        outcome = _closed_mapping(
            response["outcome"],
            frozenset({"known", "description"}),
            f"interview response {index} outcome",
        )
        if type(outcome["known"]) is not bool:
            raise InterviewError(f"interview response {index} outcome known is invalid")
        if outcome["known"]:
            _text(
                outcome["description"],
                f"interview response {index} outcome description",
            )
        elif outcome["description"] is not None:
            raise InterviewError(
                f"interview response {index} unknown outcome must have no description"
            )
        answered = _parse_timestamp(
            response["answered_at"], f"interview response {index} answered_at"
        )
        if answered < previous or answered > completed:
            raise InterviewError(
                f"interview response {index} timestamp is outside the session"
            )
        previous = answered
        if response["evidence_type"] != "direct_self_report":
            raise InterviewError(
                f"interview response {index} evidence_type is not supported"
            )
    integrity = _closed_mapping(
        artifact["integrity"],
        frozenset({"algorithm", "content_sha256"}),
        "interview artifact integrity",
    )
    if integrity.get("algorithm") != "sha256":
        raise InterviewError("interview artifact integrity algorithm is invalid")
    expected_digest = _sha256(_canonical_json(_artifact_content(artifact)))
    if integrity.get("content_sha256") != expected_digest:
        raise InterviewError("interview artifact content digest does not match")
    return artifact


def verify_interview_artifact(
    artifact_path: Path | str,
    bank_path: Path | str = DEFAULT_BANK,
) -> dict[str, Any]:
    bank, bank_sha256 = load_question_bank(bank_path)
    raw, _ = _read_regular_file(
        artifact_path,
        label="interview artifact",
        maximum_bytes=MAX_ARTIFACT_BYTES,
        require_private_mode=True,
    )
    artifact_path = _absolute(artifact_path)
    if os.name == "posix" and stat.S_IMODE(artifact_path.parent.lstat().st_mode) != 0o700:
        raise InterviewError("interview artifact parent must have mode 0700")
    return _validate_artifact(
        _load_json(raw, "interview artifact"), bank, bank_sha256
    )


def collect_interview(
    bank_path: Path | str,
    output_path: Path | str,
    *,
    input_fn: Callable[[str], str] = input,
    output_fn: Callable[[str], None] = print,
    now_fn: Callable[[], datetime] = lambda: datetime.now(timezone.utc),
    session_id_fn: Callable[[], str] = lambda: f"session-{secrets.token_hex(16)}",
) -> dict[str, Any]:
    """Collect all responses in memory and publish one candidate-only artifact."""

    output = _initial_output_check(output_path)
    bank, bank_sha256 = load_question_bank(bank_path)
    session_id = _identifier(session_id_fn(), "session id")
    started_at = _timestamp(now_fn)
    output_fn(
        "Choiceprint decision interview. Enter cancel at any prompt to stop without "
        "writing an artifact."
    )
    responses = [
        _response_for_question(
            question,
            input_fn=input_fn,
            output_fn=output_fn,
            now_fn=now_fn,
        )
        for question in bank["questions"]
    ]
    completed_at = _timestamp(now_fn)
    artifact: dict[str, Any] = {
        "format": ARTIFACT_FORMAT,
        "status": "candidate_only",
        "session_id": session_id,
        "started_at": started_at,
        "completed_at": completed_at,
        "question_bank": {
            "format": bank["format"],
            "bank_id": bank["bank_id"],
            "version": bank["version"],
            "sha256": bank_sha256,
        },
        "response_count": len(responses),
        "responses": responses,
        "promotion": {"performed": False, "review_required": True},
        "collector": {
            "version": COLLECTOR_VERSION,
            "model_calls": False,
            "network_calls": False,
        },
    }
    artifact["integrity"] = {
        "algorithm": "sha256",
        "content_sha256": _sha256(_canonical_json(artifact)),
    }
    _validate_artifact(artifact, bank, bank_sha256)
    _write_private_new_json(output, artifact)
    verified = verify_interview_artifact(output, bank_path)
    return verified


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--bank",
        type=Path,
        default=DEFAULT_BANK,
        help="public Choiceprint interview question bank",
    )
    parser.add_argument(
        "--out",
        type=Path,
        required=True,
        help="new owner-private response artifact outside the repository",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    parser = _build_parser()
    try:
        args = parser.parse_args(argv)
        collect_interview(args.bank, args.out)
    except InterviewCancelled:
        print("Choiceprint interview: cancelled; no artifact was written", file=sys.stderr)
        return 130
    except (InterviewError, OSError, ValueError) as exc:
        print(f"Choiceprint interview: {exc}", file=sys.stderr)
        return 2
    print("Choiceprint interview: saved private candidate-only response artifact")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
