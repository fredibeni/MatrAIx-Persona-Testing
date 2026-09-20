#!/usr/bin/env python3
"""Collect first-pass and blinded retest Choiceprint answers without a model.

First-pass collection reads only evaluator-format questions. Retest collection
also reads a complete first-pass answer file, but uses it only to bind case IDs,
check timing, preserve metadata, and publish a new answer file. Prior selections
are never shown or used to choose the retest subset. All new answers stay in
memory until the session is complete, then a private JSONL file is published
atomically without replacing an existing path.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import math
import os
import sys
import tempfile
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable, Iterable, Mapping, Sequence


EVALUATOR_PATH = Path(__file__).with_name("evaluate_choiceprint.py")
DEFAULT_SEED = 20260919


class CollectionError(ValueError):
    """The local collection request is unsafe or invalid."""


def _load_evaluator() -> Any:
    spec = importlib.util.spec_from_file_location(
        "choiceprint_answer_collector_evaluator", EVALUATOR_PATH
    )
    if spec is None or spec.loader is None:
        raise CollectionError(f"could not load evaluator from {EVALUATOR_PATH}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    try:
        spec.loader.exec_module(module)
    except Exception:
        sys.modules.pop(spec.name, None)
        raise
    return module


EVALUATOR = _load_evaluator()


def _deterministic_order(
    values: Iterable[Mapping[str, Any]],
    *,
    seed: int,
    scope: str,
    identity: Callable[[Mapping[str, Any]], str],
) -> list[Mapping[str, Any]]:
    """Return a stable pseudorandom order without changing record contents."""

    def key(value: Mapping[str, Any]) -> tuple[str, str]:
        identifier = identity(value)
        digest = hashlib.sha256(
            f"choiceprint-collector-v1\0{seed}\0{scope}\0{identifier}".encode(
                "utf-8"
            )
        ).hexdigest()
        return digest, identifier

    return sorted(values, key=key)


def _load_canonical_questions(path: Path) -> tuple[Path, list[dict[str, Any]]]:
    private_path = EVALUATOR._assert_private_evaluation_path(path)
    private_path = EVALUATOR._assert_regular_file(private_path, "questions")
    EVALUATOR._assert_private_permissions(private_path, "questions")
    records = EVALUATOR._validate_questions(EVALUATOR._read_jsonl(private_path))
    canonical = [record for record in records if record["variant_id"] == "canonical"]
    if not canonical:  # Defensive: the evaluator already requires one per case.
        raise CollectionError("questions must contain at least one canonical case")
    return private_path, canonical


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _load_first_pass_answers(
    path: Path,
    questions: Sequence[dict[str, Any]],
) -> tuple[Path, list[dict[str, Any]], str]:
    private_path = EVALUATOR._assert_private_evaluation_path(path)
    private_path = EVALUATOR._assert_regular_file(private_path, "first-pass answers")
    EVALUATOR._assert_private_permissions(private_path, "first-pass answers")
    source_hash = _sha256_file(private_path)
    records = EVALUATOR._read_jsonl(private_path)
    if _sha256_file(private_path) != source_hash:
        raise CollectionError("first-pass answers changed while they were loaded")
    if any(
        "retest_selected_option_id" in record or "retest_answered_at" in record
        for record in records
    ):
        raise CollectionError(
            "first-pass answers must not already contain retest fields"
        )
    EVALUATOR._validate_answers(records, questions)
    return private_path, [dict(record) for record in records], source_hash


def _prepare_private_parent(path: Path) -> None:
    """Create missing output directories with owner-only permissions."""

    missing: list[Path] = []
    current = path
    while not current.exists() and not current.is_symlink():
        missing.append(current)
        current = current.parent
    EVALUATOR._reject_symlink_chain(current)
    if not current.is_dir():
        raise CollectionError(f"answer output parent is not a directory: {current}")
    for directory in reversed(missing):
        try:
            os.mkdir(directory, 0o700)
        except FileExistsError:
            pass
        EVALUATOR._reject_symlink_chain(directory)
        if not directory.is_dir():
            raise CollectionError(
                f"answer output parent is not a directory: {directory}"
            )
        os.chmod(directory, 0o700)


def _private_new_output(path: Path) -> Path:
    output = EVALUATOR._assert_private_evaluation_path(path, may_not_exist=True)
    if output.exists() or output.is_symlink():
        raise CollectionError(f"refusing to overwrite existing answer output: {output}")
    _prepare_private_parent(output.parent)
    output = EVALUATOR._assert_private_evaluation_path(
        output, may_not_exist=True
    )
    if output.exists() or output.is_symlink():
        raise CollectionError(f"refusing to overwrite existing answer output: {output}")
    return output


def _timestamp(now_fn: Callable[[], datetime]) -> str:
    answered_at = now_fn()
    if answered_at.tzinfo is None or answered_at.utcoffset() is None:
        raise CollectionError("answer timestamp must include a timezone")
    return answered_at.astimezone(timezone.utc).isoformat(timespec="seconds")


def _utc_datetime(now_fn: Callable[[], datetime]) -> datetime:
    value = now_fn()
    if value.tzinfo is None or value.utcoffset() is None:
        raise CollectionError("answer timestamp must include a timezone")
    return value.astimezone(timezone.utc)


def _ask_choice(
    option_count: int,
    *,
    input_fn: Callable[[str], str],
    output_fn: Callable[[str], Any],
) -> int:
    while True:
        raw = input_fn(f"Choose 1-{option_count}: ").strip()
        try:
            selected = int(raw)
        except ValueError:
            selected = 0
        if 1 <= selected <= option_count:
            return selected - 1
        output_fn(f"Enter a whole number from 1 to {option_count}.")


def _ask_optional_confidence(
    *,
    input_fn: Callable[[str], str],
    output_fn: Callable[[str], Any],
) -> float | None:
    while True:
        raw = input_fn("Confidence 0-1 (optional, Enter to skip): ").strip()
        if not raw:
            return None
        try:
            confidence = float(raw)
        except ValueError:
            confidence = math.nan
        if math.isfinite(confidence) and 0 <= confidence <= 1:
            return confidence
        output_fn("Enter a number from 0 to 1, or press Enter to skip.")


def _atomic_write_jsonl(
    path: Path, records: Iterable[Mapping[str, Any]]
) -> None:
    """Publish a complete owner-only file without any overwrite window."""

    EVALUATOR._reject_symlink_chain(path)
    if path.exists() or path.is_symlink():
        raise CollectionError(f"refusing to overwrite existing answer output: {path}")

    descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{path.name}.tmp-", dir=path.parent
    )
    temporary = Path(temporary_name)
    try:
        os.fchmod(descriptor, 0o600)
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            descriptor = -1
            for record in records:
                handle.write(
                    json.dumps(
                        record,
                        ensure_ascii=False,
                        sort_keys=True,
                        allow_nan=False,
                    )
                    + "\n"
                )
            handle.flush()
            os.fsync(handle.fileno())

        EVALUATOR._reject_symlink_chain(path)
        try:
            os.link(temporary, path, follow_symlinks=False)
        except FileExistsError as exc:
            raise CollectionError(
                f"refusing to overwrite existing answer output: {path}"
            ) from exc
        try:
            directory_descriptor = os.open(
                path.parent,
                os.O_RDONLY | getattr(os, "O_DIRECTORY", 0),
            )
            try:
                os.fsync(directory_descriptor)
            finally:
                os.close(directory_descriptor)
        except OSError:
            # Some filesystems do not support syncing a directory. The file
            # itself has already been synced and linked without replacement.
            pass
    finally:
        if descriptor >= 0:
            os.close(descriptor)
        try:
            temporary.unlink()
        except FileNotFoundError:
            pass


def collect_answers(
    *,
    questions_path: Path,
    output_path: Path,
    seed: int = DEFAULT_SEED,
    ask_confidence: bool = False,
    input_fn: Callable[[str], str] = input,
    output_fn: Callable[[str], Any] = print,
    now_fn: Callable[[], datetime] | None = None,
) -> list[dict[str, Any]]:
    """Collect and atomically save one first-pass answer per canonical case."""

    _, canonical = _load_canonical_questions(questions_path)
    output = _private_new_output(output_path)
    clock = now_fn or (lambda: datetime.now(timezone.utc))
    ordered_cases = _deterministic_order(
        canonical,
        seed=seed,
        scope="cases",
        identity=lambda case: str(case["case_id"]),
    )

    output_fn(
        f"First-pass Choiceprint holdout - {len(ordered_cases)} questions "
        f"(presentation seed {seed})"
    )
    output_fn("No persona context, predictions, or earlier answers are shown.")

    answers: list[dict[str, Any]] = []
    for index, case in enumerate(ordered_cases, start=1):
        output_fn("")
        output_fn(f"Question {index} of {len(ordered_cases)}")
        output_fn(str(case["prompt"]))
        ordered_options = _deterministic_order(
            case["options"],
            seed=seed,
            scope=f"options:{case['case_id']}",
            identity=lambda option: str(option["id"]),
        )
        for option_index, option in enumerate(ordered_options, start=1):
            output_fn(f"  {option_index}. {option['text']}")
        selected_index = _ask_choice(
            len(ordered_options), input_fn=input_fn, output_fn=output_fn
        )
        selected_option = ordered_options[selected_index]
        confidence = None
        if ask_confidence:
            confidence = _ask_optional_confidence(
                input_fn=input_fn, output_fn=output_fn
            )
        answer: dict[str, Any] = {
            "schema_version": EVALUATOR.SCHEMA_VERSION,
            "case_id": case["case_id"],
            "selected_option_id": selected_option["id"],
            "answered_at": _timestamp(clock),
        }
        if confidence is not None:
            answer["answer_confidence"] = confidence
        answers.append(answer)

    _atomic_write_jsonl(output, answers)
    output_fn("")
    output_fn(f"Saved {len(answers)} first-pass answers to {output}")
    return answers


def _balanced_retest_subset(
    canonical: Sequence[Mapping[str, Any]],
    *,
    count: int,
    seed: int,
) -> list[Mapping[str, Any]]:
    """Select a deterministic round-robin subset across scenario families."""

    if isinstance(count, bool) or not isinstance(count, int) or count < 1:
        raise CollectionError("retest count must be a positive integer")
    if count > len(canonical):
        raise CollectionError(
            f"retest count {count} exceeds the {len(canonical)} canonical cases"
        )

    by_family: dict[str, list[Mapping[str, Any]]] = defaultdict(list)
    for case in canonical:
        family = case.get("family")
        if not isinstance(family, str) or not family.strip():
            raise CollectionError(
                f"canonical case {case.get('case_id')} has no scenario family"
            )
        by_family[family].append(case)

    family_records = [{"family": family} for family in by_family]
    ordered_families = [
        str(item["family"])
        for item in _deterministic_order(
            family_records,
            seed=seed,
            scope="retest-families",
            identity=lambda item: str(item["family"]),
        )
    ]
    ordered_cases = {
        family: list(
            _deterministic_order(
                by_family[family],
                seed=seed,
                scope=f"retest-family:{family}",
                identity=lambda case: str(case["case_id"]),
            )
        )
        for family in ordered_families
    }

    selected: list[Mapping[str, Any]] = []
    round_index = 0
    while len(selected) < count:
        added = False
        for family in ordered_families:
            cases = ordered_cases[family]
            if round_index < len(cases):
                selected.append(cases[round_index])
                added = True
                if len(selected) == count:
                    break
        if not added:  # Defensive: count was already checked against total cases.
            raise CollectionError("could not construct the requested retest subset")
        round_index += 1
    return selected


def collect_retest(
    *,
    questions_path: Path,
    answers_path: Path,
    output_path: Path,
    seed: int,
    count: int,
    input_fn: Callable[[str], str] = input,
    output_fn: Callable[[str], Any] = print,
    now_fn: Callable[[], datetime] | None = None,
) -> list[dict[str, Any]]:
    """Collect a blinded, family-balanced retest into a new answer file."""

    questions_file, _ = _load_canonical_questions(questions_path)
    questions_hash = _sha256_file(questions_file)
    question_records = EVALUATOR._validate_questions(
        EVALUATOR._read_jsonl(questions_file)
    )
    if _sha256_file(questions_file) != questions_hash:
        raise CollectionError("questions changed while they were loaded")
    canonical = [
        record for record in question_records if record["variant_id"] == "canonical"
    ]
    first_pass_file, first_pass, first_pass_hash = _load_first_pass_answers(
        answers_path, question_records
    )
    output = _private_new_output(output_path)
    if output == first_pass_file:
        raise CollectionError("retest output must be separate from first-pass answers")

    selected_cases = _balanced_retest_subset(canonical, count=count, seed=seed)
    selected_ids = {str(case["case_id"]) for case in selected_cases}
    first_pass_by_id = {str(record["case_id"]): record for record in first_pass}

    clock = now_fn or (lambda: datetime.now(timezone.utc))
    retest_at = _utc_datetime(clock)
    for case_id in selected_ids:
        answered_at = EVALUATOR._parse_timestamp(
            first_pass_by_id[case_id]["answered_at"],
            f"{case_id} first-pass answered_at",
        )
        elapsed = retest_at - answered_at
        if not timedelta(days=7) <= elapsed <= timedelta(days=14):
            raise CollectionError(
                "retest must be completed 7-14 days after every selected "
                f"first-pass answer; {case_id} is outside that window"
            )
    retest_timestamp = retest_at.isoformat(timespec="seconds")

    ordered_cases = list(
        _deterministic_order(
            selected_cases,
            seed=seed,
            scope="retest-presentation",
            identity=lambda case: str(case["case_id"]),
        )
    )
    output_fn(
        f"Choiceprint retest - {len(ordered_cases)} questions "
        f"(presentation seed {seed})"
    )
    output_fn("Earlier answers are not shown. Answer each question independently.")

    retest_selections: dict[str, str] = {}
    for index, case in enumerate(ordered_cases, start=1):
        output_fn("")
        output_fn(f"Question {index} of {len(ordered_cases)}")
        output_fn(str(case["prompt"]))
        ordered_options = _deterministic_order(
            case["options"],
            seed=seed,
            scope=f"retest-options:{case['case_id']}",
            identity=lambda option: str(option["id"]),
        )
        for option_index, option in enumerate(ordered_options, start=1):
            output_fn(f"  {option_index}. {option['text']}")
        selected_index = _ask_choice(
            len(ordered_options), input_fn=input_fn, output_fn=output_fn
        )
        retest_selections[str(case["case_id"])] = str(
            ordered_options[selected_index]["id"]
        )

    if _sha256_file(questions_file) != questions_hash:
        raise CollectionError("questions changed during retest collection")
    if _sha256_file(first_pass_file) != first_pass_hash:
        raise CollectionError("first-pass answers changed during retest collection")

    completed: list[dict[str, Any]] = []
    for original in first_pass:
        record = dict(original)
        case_id = str(record["case_id"])
        if case_id in selected_ids:
            record["retest_selected_option_id"] = retest_selections[case_id]
            record["retest_answered_at"] = retest_timestamp
        completed.append(record)

    validated = EVALUATOR._validate_answers(completed, question_records)
    if sum(
        value.get("retest_selected_option_id") is not None
        for value in validated.values()
    ) != count:
        raise CollectionError("completed retest count does not match the request")
    _atomic_write_jsonl(output, completed)
    output_fn("")
    output_fn(f"Saved {count} retest answers to {output}")
    return completed


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Collect first-pass Choiceprint holdout answers locally without "
            "persona context, predictions, or a model."
        )
    )
    parser.add_argument("--questions", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED)
    parser.add_argument(
        "--ask-confidence",
        action="store_true",
        help="Optionally ask for a 0-1 confidence after each choice.",
    )
    return parser


def _build_retest_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="collect_choiceprint_answers.py retest",
        description=(
            "Collect a blinded Choiceprint retest locally without displaying "
            "first-pass selections or invoking a model."
        ),
    )
    parser.add_argument("--questions", type=Path, required=True)
    parser.add_argument("--answers", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--seed", type=int, required=True)
    parser.add_argument("--count", type=int, required=True)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    arguments = list(sys.argv[1:] if argv is None else argv)
    retest_mode = bool(arguments and arguments[0] == "retest")
    args = (
        _build_retest_parser().parse_args(arguments[1:])
        if retest_mode
        else _build_parser().parse_args(arguments)
    )
    try:
        if retest_mode:
            collect_retest(
                questions_path=args.questions,
                answers_path=args.answers,
                output_path=args.out,
                seed=args.seed,
                count=args.count,
            )
        else:
            collect_answers(
                questions_path=args.questions,
                output_path=args.out,
                seed=args.seed,
                ask_confidence=args.ask_confidence,
            )
    except (CollectionError, EVALUATOR.EvaluationError, OSError) as exc:
        print(f"Answer collection error: {exc}", file=sys.stderr)
        return 2
    except (EOFError, KeyboardInterrupt):
        print("\nAnswer collection cancelled; no answer file was written.", file=sys.stderr)
        return 130
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
