from __future__ import annotations

import importlib.util
import io
import json
import os
import shutil
import stat
import sys
import tempfile
import unittest
from contextlib import redirect_stderr
from datetime import datetime, timezone
from pathlib import Path
from unittest import mock


REVIEWER_PATH = (
    Path(__file__).resolve().parents[1]
    / "scripts"
    / "review_choiceprint_holdout.py"
)
SPEC = importlib.util.spec_from_file_location(
    "review_choiceprint_holdout", REVIEWER_PATH
)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"cannot import holdout reviewer from {REVIEWER_PATH}")
REVIEWER = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = REVIEWER
SPEC.loader.exec_module(REVIEWER)

EXAMPLE_PACK = (
    Path(__file__).resolve().parents[1] / "templates" / "example.choiceprint"
)


def question(
    case_id: str,
    *,
    variant_id: str = "canonical",
    prompt: str | None = None,
) -> dict[str, object]:
    return {
        "schema_version": 1,
        "case_id": case_id,
        "variant_id": variant_id,
        "domain": "everyday_choices",
        "family": "planning",
        "prompt": prompt or f"What would you choose for {case_id}?",
        "options": [
            {"id": "alpha", "text": "Choose the familiar option"},
            {"id": "beta", "text": "Try the novel option"},
            {"id": "gamma", "text": "Wait and decide later"},
        ],
    }


def write_json(path: Path, value: object, *, mode: int = 0o600) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    path.chmod(mode)


def write_jsonl(path: Path, records: list[dict[str, object]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        "".join(
            json.dumps(record, ensure_ascii=False, sort_keys=True) + "\n"
            for record in records
        ),
        encoding="utf-8",
    )
    path.chmod(0o600)


class ReviewChoiceprintHoldoutTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary_directory.name).resolve()
        self.root.chmod(0o700)
        self.pack = self.root / "test.choiceprint"
        shutil.copytree(EXAMPLE_PACK, self.pack)
        self.questions = self.root / "questions.jsonl"
        self.records = [
            question("private-holdout-001"),
            question(
                "private-holdout-001",
                variant_id="paraphrase-1",
                prompt="Which option would you select for the first case?",
            ),
        ]
        write_jsonl(self.questions, self.records)
        self.template = self.root / "semantic-overlap-review.json"
        validated = REVIEWER.EVALUATOR._validate_questions(self.records)
        write_json(
            self.template,
            REVIEWER.EVALUATOR._semantic_review_template(validated, self.pack),
        )
        self.template_bytes = self.template.read_bytes()

    def tearDown(self) -> None:
        self.temporary_directory.cleanup()

    @staticmethod
    def fixed_time() -> datetime:
        return datetime(2025, 9, 20, 12, 34, 56, tzinfo=timezone.utc)

    @staticmethod
    def approved_inputs() -> list[str]:
        return ["approve", "", "yes", "yes", "yes", "yes", "yes"]

    def review(
        self,
        *,
        inputs: list[str] | None = None,
        output: Path | None = None,
        now_fn=None,
        input_fn=None,
    ):
        responses = iter(inputs or self.approved_inputs())
        displayed: list[str] = []
        receipt, eligible = REVIEWER.review_holdout(
            questions_path=self.questions,
            choiceprint_path=self.pack,
            template_path=self.template,
            output_path=output or self.root / "completed-review.json",
            input_fn=input_fn or (lambda _: next(responses)),
            output_fn=displayed.append,
            now_fn=now_fn or self.fixed_time,
        )
        return receipt, eligible, displayed

    def test_approved_review_writes_private_hash_bound_receipt(self) -> None:
        output = self.root / "completed-review.json"
        with mock.patch.object(
            REVIEWER.EVALUATOR,
            "_codex_runtime_fingerprint",
            side_effect=AssertionError("owner review attempted to access a model"),
        ):
            receipt, eligible, displayed = self.review(output=output)

        self.assertTrue(eligible)
        self.assertEqual(receipt["reviewed_at"], "2025-09-20T12:34:56+00:00")
        self.assertEqual(
            receipt["case_reviews"],
            [
                {
                    "case_id": "private-holdout-001",
                    "decision": "approve",
                    "notes": None,
                }
            ],
        )
        self.assertTrue(all(receipt["checklist"].values()))
        self.assertEqual(stat.S_IMODE(output.stat().st_mode), 0o600)
        self.assertEqual(json.loads(output.read_text(encoding="utf-8")), receipt)
        self.assertEqual(self.template.read_bytes(), self.template_bytes)
        validated_questions = REVIEWER.EVALUATOR._validate_questions(self.records)
        REVIEWER.EVALUATOR._validate_semantic_review_document(
            receipt,
            questions=validated_questions,
            expected_build_metadata_sha256=REVIEWER.EVALUATOR._sha256_file(
                self.pack / "build-metadata.json"
            ),
            require_complete=True,
        )
        rendered = "\n".join(displayed)
        self.assertIn("Answer-free development cases", rendered)
        self.assertIn("canonical:", rendered)
        self.assertIn("paraphrase-1:", rendered)

    def test_rejection_is_preserved_but_is_not_freeze_ready(self) -> None:
        output = self.root / "rejected-review.json"
        inputs = [
            "reject",
            "It is too close to a development case.",
            "no",
            "yes",
            "yes",
            "yes",
            "yes",
        ]
        receipt, eligible, _ = self.review(inputs=inputs, output=output)
        self.assertFalse(eligible)
        self.assertEqual(receipt["case_reviews"][0]["decision"], "reject")
        self.assertEqual(
            receipt["case_reviews"][0]["notes"],
            "It is too close to a development case.",
        )
        self.assertFalse(receipt["checklist"]["each_case_is_materially_new"])
        with self.assertRaisesRegex(
            REVIEWER.EVALUATOR.EvaluationError,
            "checklist must be fully approved",
        ):
            REVIEWER.EVALUATOR._validate_semantic_review_document(
                receipt,
                questions=REVIEWER.EVALUATOR._validate_questions(self.records),
                expected_build_metadata_sha256=(
                    REVIEWER.EVALUATOR._sha256_file(
                        self.pack / "build-metadata.json"
                    )
                ),
                require_complete=True,
            )
        self.assertEqual(self.template.read_bytes(), self.template_bytes)

    def test_abbreviations_and_blank_rejection_notes_reprompt(self) -> None:
        inputs = [
            "a",
            "reject",
            "",
            "Overlaps materially.",
            "y",
            "yes",
            "yes",
            "yes",
            "yes",
            "yes",
        ]
        receipt, eligible, displayed = self.review(inputs=inputs)
        self.assertFalse(eligible)
        self.assertEqual(receipt["case_reviews"][0]["decision"], "reject")
        rendered = "\n".join(displayed)
        self.assertIn("Enter approve, reject, or cancel.", rendered)
        self.assertIn("Explain why the case is rejected.", rendered)
        self.assertIn("Enter yes, no, or cancel.", rendered)

    def test_cancel_and_final_no_leave_no_output_or_parent(self) -> None:
        for label, inputs in (
            ("first", ["cancel"]),
            (
                "final",
                ["approve", "", "yes", "yes", "yes", "yes", "no"],
            ),
        ):
            output = self.root / label / "nested" / "review.json"
            with self.subTest(label=label):
                with self.assertRaises(REVIEWER.ReviewCancelled):
                    self.review(inputs=inputs, output=output)
                self.assertFalse(output.exists())
                self.assertFalse((self.root / label).exists())
                self.assertEqual(self.template.read_bytes(), self.template_bytes)

    def test_refuses_existing_or_symlink_output_before_prompting(self) -> None:
        target = self.root / "existing.json"
        target.write_text("keep me\n", encoding="utf-8")
        target.chmod(0o600)
        link = self.root / "linked.json"
        link.symlink_to(target)
        for output in (target, link):
            with self.subTest(output=output):
                with self.assertRaisesRegex(
                    (REVIEWER.ReviewError, REVIEWER.EVALUATOR.EvaluationError),
                    "refusing to overwrite|symlinked evaluation path",
                ):
                    REVIEWER.review_holdout(
                        questions_path=self.questions,
                        choiceprint_path=self.pack,
                        template_path=self.template,
                        output_path=output,
                        input_fn=lambda _: self.fail(
                            "review prompted before rejecting unsafe output"
                        ),
                    )
        self.assertEqual(target.read_text(encoding="utf-8"), "keep me\n")

    def test_stale_questions_and_altered_template_fail_before_prompting(self) -> None:
        changed = [question("different-holdout-002")]
        write_jsonl(self.questions, changed)
        with self.assertRaisesRegex(
            REVIEWER.EVALUATOR.EvaluationError,
            "does not match the current questions",
        ):
            REVIEWER.review_holdout(
                questions_path=self.questions,
                choiceprint_path=self.pack,
                template_path=self.template,
                output_path=self.root / "stale.json",
                input_fn=lambda _: self.fail("stale review prompted the owner"),
            )

        write_jsonl(self.questions, self.records)
        altered = json.loads(self.template.read_text(encoding="utf-8"))
        altered["case_reviews"][0]["decision"] = "approve"
        write_json(self.template, altered)
        with self.assertRaisesRegex(
            REVIEWER.ReviewError,
            "unchanged pending template",
        ):
            REVIEWER.review_holdout(
                questions_path=self.questions,
                choiceprint_path=self.pack,
                template_path=self.template,
                output_path=self.root / "altered.json",
                input_fn=lambda _: self.fail("altered review prompted the owner"),
            )

    def test_stale_choiceprint_build_fails_before_prompting(self) -> None:
        metadata_path = self.pack / "build-metadata.json"
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        metadata["built_at"] = "2026-09-20T00:00:00Z"
        write_json(metadata_path, metadata)
        with self.assertRaisesRegex(
            REVIEWER.EVALUATOR.EvaluationError,
            "does not match the current Choiceprint build",
        ):
            REVIEWER.review_holdout(
                questions_path=self.questions,
                choiceprint_path=self.pack,
                template_path=self.template,
                output_path=self.root / "stale-build.json",
                input_fn=lambda _: self.fail("stale review prompted the owner"),
            )

    def test_requires_private_template_permissions(self) -> None:
        self.template.chmod(0o644)
        with self.assertRaisesRegex(
            REVIEWER.EVALUATOR.EvaluationError, "must have mode 0600"
        ):
            self.review()

    def test_naive_clock_fails_without_output(self) -> None:
        output = self.root / "naive-clock.json"
        with self.assertRaisesRegex(REVIEWER.ReviewError, "include a timezone"):
            self.review(
                output=output,
                inputs=["approve", "", "yes", "yes", "yes", "yes"],
                now_fn=lambda: datetime(2025, 9, 20, 12, 34, 56),
            )
        self.assertFalse(output.exists())
        self.assertEqual(self.template.read_bytes(), self.template_bytes)

    def test_rejects_symlinked_question_template_and_pack_sources(self) -> None:
        linked_questions = self.root / "linked-questions.jsonl"
        linked_questions.symlink_to(self.questions)
        linked_template = self.root / "linked-template.json"
        linked_template.symlink_to(self.template)
        linked_pack = self.root / "linked.choiceprint"
        linked_pack.symlink_to(self.pack, target_is_directory=True)
        for label, questions_path, choiceprint_path, template_path in (
            (
                "questions",
                linked_questions,
                self.pack,
                self.template,
            ),
            ("template", self.questions, self.pack, linked_template),
            ("pack", self.questions, linked_pack, self.template),
        ):
            with self.subTest(label=label):
                with self.assertRaisesRegex(
                    REVIEWER.EVALUATOR.EvaluationError,
                    "symlinked evaluation path is not allowed",
                ):
                    REVIEWER.review_holdout(
                        questions_path=questions_path,
                        choiceprint_path=choiceprint_path,
                        template_path=template_path,
                        output_path=self.root / f"{label}-receipt.json",
                        input_fn=lambda _: self.fail(
                            "review prompted before rejecting a symlink"
                        ),
                    )

    def test_source_change_during_review_aborts_before_publication(self) -> None:
        output = self.root / "changed-during-review.json"
        responses = iter(self.approved_inputs())

        def mutate_before_confirmation(prompt: str) -> str:
            response = next(responses)
            if prompt.startswith("Write the review receipt"):
                changed = [question("replacement-holdout-002")]
                write_jsonl(self.questions, changed)
            return response

        with self.assertRaisesRegex(
            REVIEWER.EVALUATOR.EvaluationError,
            "does not match the current questions",
        ):
            self.review(output=output, input_fn=mutate_before_confirmation)
        self.assertFalse(output.exists())
        self.assertEqual(self.template.read_bytes(), self.template_bytes)

    def test_publish_race_preserves_winner_and_removes_temporary_file(self) -> None:
        output = self.root / "race.json"

        def win_race(_source, target, **_kwargs):
            Path(target).write_text("winner\n", encoding="utf-8")
            Path(target).chmod(0o600)
            raise FileExistsError("simulated publish race")

        with mock.patch.object(REVIEWER.os, "link", side_effect=win_race):
            with self.assertRaisesRegex(REVIEWER.ReviewError, "refusing to overwrite"):
                self.review(output=output)
        self.assertEqual(output.read_text(encoding="utf-8"), "winner\n")
        self.assertEqual(list(self.root.glob(".race.json.tmp-*")), [])
        self.assertEqual(self.template.read_bytes(), self.template_bytes)

    def test_cli_has_no_overwrite_or_automatic_approval_option(self) -> None:
        parser = REVIEWER._build_parser()
        with redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
            parser.parse_args([])
        option_strings = {
            option
            for action in parser._actions
            for option in action.option_strings
        }
        self.assertNotIn("--force", option_strings)
        self.assertNotIn("--approve", option_strings)
        self.assertNotIn("--authorize-cloud-processing", option_strings)


if __name__ == "__main__":
    unittest.main()
