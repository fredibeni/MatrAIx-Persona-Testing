#!/usr/bin/env python3
"""Complete a Choiceprint semantic-overlap receipt through owner review.

The reviewer reads answer-free development scenarios and both variants of every
holdout case. The command never invokes a model, accesses human answers, edits
the generated template, or replaces an existing output file.
"""

from __future__ import annotations

import argparse
import copy
import importlib.util
import json
import os
import sys
import tempfile
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Mapping, Sequence


EVALUATOR_PATH = Path(__file__).with_name("evaluate_choiceprint.py")


class ReviewError(ValueError):
    """The owner review request or artifact is unsafe or invalid."""


class ReviewCancelled(Exception):
    """The owner cancelled before an output receipt was published."""


def _load_evaluator() -> Any:
    spec = importlib.util.spec_from_file_location(
        "choiceprint_holdout_review_evaluator", EVALUATOR_PATH
    )
    if spec is None or spec.loader is None:
        raise ReviewError(f"could not load evaluator from {EVALUATOR_PATH}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    try:
        spec.loader.exec_module(module)
    except Exception:
        sys.modules.pop(spec.name, None)
        raise
    return module


EVALUATOR = _load_evaluator()

CHECKLIST_PROMPTS = (
    (
        "each_case_is_materially_new",
        "Every holdout case is materially different from the development cases",
    ),
    (
        "no_answer_leakage",
        "No wording, option, or metadata reveals the person's answer",
    ),
    (
        "options_are_plausible_and_stable_across_variants",
        "Every option is plausible and retains its meaning across variants",
    ),
    (
        "domain_and_family_labels_are_appropriate",
        "Every domain and family label is appropriate",
    ),
)


@dataclass(frozen=True)
class ReviewInputs:
    """Validated source material bound to one owner-review session."""

    questions_path: Path
    choiceprint_path: Path
    template_path: Path
    questions: list[dict[str, Any]]
    template: dict[str, Any]
    development_cases: list[dict[str, Any]]
    choiceprint_build_metadata_sha256: str


def _load_inputs(
    *,
    questions_path: Path,
    choiceprint_path: Path,
    template_path: Path,
) -> ReviewInputs:
    questions_path = EVALUATOR._assert_private_evaluation_path(questions_path)
    questions_path = EVALUATOR._assert_regular_file(questions_path, "questions")
    EVALUATOR._assert_private_permissions(questions_path, "questions")
    questions = EVALUATOR._validate_questions(
        EVALUATOR._read_jsonl(questions_path)
    )

    choiceprint_input = choiceprint_path.expanduser()
    EVALUATOR._reject_symlink_chain(choiceprint_input)
    choiceprint_path = choiceprint_input.resolve()
    if not choiceprint_path.is_dir():
        raise ReviewError(
            f"Choiceprint path must be a real directory: {choiceprint_path}"
        )
    EVALUATOR._validate_choiceprint(choiceprint_path)
    EVALUATOR._validate_no_development_overlap(questions, choiceprint_path)
    expected_build_hash = EVALUATOR._sha256_file(
        choiceprint_path / "build-metadata.json"
    )

    template_path = EVALUATOR._assert_private_evaluation_path(template_path)
    template_path = EVALUATOR._assert_regular_file(
        template_path, "semantic-overlap review template"
    )
    EVALUATOR._assert_mode_0600(
        template_path, "semantic-overlap review template"
    )
    template = EVALUATOR._validate_semantic_review_document(
        EVALUATOR._read_json(template_path),
        questions=questions,
        expected_build_metadata_sha256=expected_build_hash,
        require_complete=False,
    )
    expected_template = EVALUATOR._semantic_review_template(
        questions, choiceprint_path
    )
    if template != expected_template:
        raise ReviewError(
            "semantic-overlap review template is not the unchanged pending "
            "template for these sources; regenerate the preflight packet"
        )

    development_cases = EVALUATOR._review_development_cases(choiceprint_path)
    return ReviewInputs(
        questions_path=questions_path,
        choiceprint_path=choiceprint_path,
        template_path=template_path,
        questions=questions,
        template=template,
        development_cases=development_cases,
        choiceprint_build_metadata_sha256=expected_build_hash,
    )


def _candidate_output(path: Path) -> Path:
    output = EVALUATOR._assert_private_evaluation_path(path, may_not_exist=True)
    if output.exists() or output.is_symlink():
        raise ReviewError(f"refusing to overwrite existing review output: {output}")
    return output


def _prepare_private_parent(path: Path) -> None:
    missing: list[Path] = []
    current = path
    while not current.exists() and not current.is_symlink():
        missing.append(current)
        current = current.parent
    EVALUATOR._reject_symlink_chain(current)
    if not current.is_dir():
        raise ReviewError(f"review output parent is not a directory: {current}")
    for directory in reversed(missing):
        try:
            os.mkdir(directory, 0o700)
        except FileExistsError:
            pass
        EVALUATOR._reject_symlink_chain(directory)
        if not directory.is_dir():
            raise ReviewError(
                f"review output parent is not a directory: {directory}"
            )
        if os.name != "nt":
            os.chmod(directory, 0o700)


def _private_new_output(path: Path) -> Path:
    output = _candidate_output(path)
    _prepare_private_parent(output.parent)
    output = EVALUATOR._assert_private_evaluation_path(
        output, may_not_exist=True
    )
    if output.exists() or output.is_symlink():
        raise ReviewError(f"refusing to overwrite existing review output: {output}")
    return output


def _atomic_write_json(path: Path, value: Mapping[str, Any]) -> None:
    EVALUATOR._reject_symlink_chain(path)
    if path.exists() or path.is_symlink():
        raise ReviewError(f"refusing to overwrite existing review output: {path}")
    descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{path.name}.tmp-", dir=path.parent
    )
    temporary = Path(temporary_name)
    try:
        os.fchmod(descriptor, 0o600)
        payload = (
            json.dumps(
                value,
                ensure_ascii=False,
                indent=2,
                sort_keys=True,
                allow_nan=False,
            )
            + "\n"
        )
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            descriptor = -1
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
        EVALUATOR._reject_symlink_chain(path)
        try:
            os.link(temporary, path, follow_symlinks=False)
        except FileExistsError as exc:
            raise ReviewError(
                f"refusing to overwrite existing review output: {path}"
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
            pass
    finally:
        if descriptor >= 0:
            os.close(descriptor)
        try:
            temporary.unlink()
        except FileNotFoundError:
            pass


def _timestamp(now_fn: Callable[[], datetime]) -> str:
    reviewed_at = now_fn()
    if reviewed_at.tzinfo is None or reviewed_at.utcoffset() is None:
        raise ReviewError("review timestamp must include a timezone")
    return reviewed_at.astimezone(timezone.utc).isoformat(timespec="seconds")


def _ask_decision(
    *,
    input_fn: Callable[[str], str],
    output_fn: Callable[[str], Any],
) -> str:
    while True:
        raw = input_fn(
            "Decision - type approve, reject, or cancel: "
        ).strip().casefold()
        if raw == "approve":
            return "approve"
        if raw == "reject":
            return "reject"
        if raw == "cancel":
            raise ReviewCancelled
        output_fn("Enter approve, reject, or cancel.")


def _ask_notes(
    decision: str,
    *,
    input_fn: Callable[[str], str],
    output_fn: Callable[[str], Any],
) -> str | None:
    while True:
        label = "Notes (required for rejection): " if decision == "reject" else (
            "Notes (optional, Enter to skip): "
        )
        notes = input_fn(label).strip()
        if notes:
            return notes
        if decision == "approve":
            return None
        output_fn("Explain why the case is rejected.")


def _ask_yes_no(
    prompt: str,
    *,
    input_fn: Callable[[str], str],
    output_fn: Callable[[str], Any],
) -> bool:
    while True:
        raw = input_fn(f"{prompt} - type yes, no, or cancel: ")
        answer = raw.strip().casefold()
        if answer == "yes":
            return True
        if answer == "no":
            return False
        if answer == "cancel":
            raise ReviewCancelled
        output_fn("Enter yes, no, or cancel.")


def _display_development_cases(
    cases: Sequence[Mapping[str, Any]],
    *,
    output_fn: Callable[[str], Any],
) -> None:
    output_fn("")
    output_fn("Answer-free development cases for comparison")
    for case in cases:
        output_fn("")
        output_fn(f"Development case: {case['case_id']}")
        output_fn(str(case["scenario"]))
        for index, option in enumerate(case["options"], start=1):
            output_fn(f"  {index}. {option}")


def _display_holdout_case(
    case_id: str,
    variants: Sequence[Mapping[str, Any]],
    *,
    index: int,
    total: int,
    output_fn: Callable[[str], Any],
) -> None:
    by_variant = {str(item["variant_id"]): item for item in variants}
    canonical = by_variant["canonical"]
    output_fn("")
    output_fn(f"Holdout case {index} of {total}: {case_id}")
    output_fn(f"Domain: {canonical['domain']} | Family: {canonical['family']}")
    ordered_variant_ids = sorted(
        by_variant, key=lambda value: (value != "canonical", value)
    )
    for variant_id in ordered_variant_ids:
        variant = by_variant[variant_id]
        output_fn(f"{variant_id}: {variant['prompt']}")
    output_fn("Options shared by every variant:")
    for option_index, option in enumerate(canonical["options"], start=1):
        output_fn(f"  {option_index}. {option['id']}: {option['text']}")


def review_holdout(
    *,
    questions_path: Path,
    choiceprint_path: Path,
    template_path: Path,
    output_path: Path,
    input_fn: Callable[[str], str] = input,
    output_fn: Callable[[str], Any] = print,
    now_fn: Callable[[], datetime] | None = None,
) -> tuple[dict[str, Any], bool]:
    """Collect explicit owner decisions and publish one private review receipt."""

    sources = _load_inputs(
        questions_path=questions_path,
        choiceprint_path=choiceprint_path,
        template_path=template_path,
    )
    output_candidate = _candidate_output(output_path)
    variants_by_case: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for question in sources.questions:
        variants_by_case[question["case_id"]].append(question)
    case_ids = sorted(variants_by_case)

    output_fn(
        f"Choiceprint owner semantic-overlap review - {len(case_ids)} holdout cases"
    )
    output_fn("No model, cloud service, human answer, or prediction is accessed.")
    output_fn("The generated template will not be edited.")
    _display_development_cases(sources.development_cases, output_fn=output_fn)

    decisions: dict[str, dict[str, Any]] = {}
    for index, case_id in enumerate(case_ids, start=1):
        _display_holdout_case(
            case_id,
            variants_by_case[case_id],
            index=index,
            total=len(case_ids),
            output_fn=output_fn,
        )
        decision = _ask_decision(input_fn=input_fn, output_fn=output_fn)
        notes = _ask_notes(
            decision, input_fn=input_fn, output_fn=output_fn
        )
        decisions[case_id] = {
            "case_id": case_id,
            "decision": decision,
            "notes": notes,
        }

    output_fn("")
    output_fn("Final owner attestations")
    checklist: dict[str, bool] = {}
    for key, prompt in CHECKLIST_PROMPTS:
        checklist[key] = _ask_yes_no(
            prompt, input_fn=input_fn, output_fn=output_fn
        )

    receipt = copy.deepcopy(sources.template)
    receipt["reviewed_at"] = _timestamp(
        now_fn or (lambda: datetime.now(timezone.utc))
    )
    receipt["checklist"] = checklist
    receipt["case_reviews"] = [decisions[case_id] for case_id in case_ids]
    receipt = EVALUATOR._validate_semantic_review_document(
        receipt,
        questions=sources.questions,
        expected_build_metadata_sha256=(
            sources.choiceprint_build_metadata_sha256
        ),
        require_complete=False,
    )
    eligible = all(checklist.values()) and all(
        review["decision"] == "approve" for review in receipt["case_reviews"]
    )
    if eligible:
        EVALUATOR._validate_semantic_review_document(
            receipt,
            questions=sources.questions,
            expected_build_metadata_sha256=(
                sources.choiceprint_build_metadata_sha256
            ),
            require_complete=True,
        )

    output_fn("")
    output_fn(
        "Freeze eligibility after this review: " + ("yes" if eligible else "no")
    )
    if not _ask_yes_no(
        f"Write the review receipt to {output_candidate}",
        input_fn=input_fn,
        output_fn=output_fn,
    ):
        raise ReviewCancelled

    current_sources = _load_inputs(
        questions_path=sources.questions_path,
        choiceprint_path=sources.choiceprint_path,
        template_path=sources.template_path,
    )
    if current_sources != sources:
        raise ReviewError(
            "review sources changed during owner review; regenerate the "
            "preflight packet and review again"
        )
    EVALUATOR._validate_semantic_review_document(
        receipt,
        questions=current_sources.questions,
        expected_build_metadata_sha256=(
            current_sources.choiceprint_build_metadata_sha256
        ),
        require_complete=eligible,
    )

    output = _private_new_output(output_candidate)
    _atomic_write_json(output, receipt)
    output_fn(f"Saved private owner review receipt to {output}")
    return receipt, eligible


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Complete a private Choiceprint semantic-overlap review without "
            "using a model or cloud service."
        )
    )
    parser.add_argument("--questions", type=Path, required=True)
    parser.add_argument("--choiceprint", type=Path, required=True)
    parser.add_argument("--template", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _build_parser().parse_args(argv)
    try:
        review_holdout(
            questions_path=args.questions,
            choiceprint_path=args.choiceprint,
            template_path=args.template,
            output_path=args.out,
        )
    except ReviewCancelled:
        print("\nOwner review cancelled; no receipt was written.", file=sys.stderr)
        return 130
    except (ReviewError, EVALUATOR.EvaluationError, OSError) as exc:
        print(f"Owner review error: {exc}", file=sys.stderr)
        return 2
    except (EOFError, KeyboardInterrupt):
        print("\nOwner review cancelled; no receipt was written.", file=sys.stderr)
        return 130
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
