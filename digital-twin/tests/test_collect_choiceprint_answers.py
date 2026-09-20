from __future__ import annotations

import importlib.util
import json
import os
import stat
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest import mock


COLLECTOR_PATH = (
    Path(__file__).resolve().parents[1]
    / "scripts"
    / "collect_choiceprint_answers.py"
)
SPEC = importlib.util.spec_from_file_location(
    "collect_choiceprint_answers", COLLECTOR_PATH
)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"cannot import answer collector from {COLLECTOR_PATH}")
COLLECTOR = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = COLLECTOR
SPEC.loader.exec_module(COLLECTOR)


def question(
    case_id: str,
    *,
    variant_id: str = "canonical",
    prompt: str | None = None,
    domain: str = "everyday_choices",
    family: str = "planning",
) -> dict[str, object]:
    return {
        "schema_version": 1,
        "case_id": case_id,
        "variant_id": variant_id,
        "domain": domain,
        "family": family,
        "prompt": prompt or f"What would you choose for {case_id}?",
        "options": [
            {"id": "alpha", "text": "Choose the familiar option"},
            {"id": "beta", "text": "Try the novel option"},
            {"id": "gamma", "text": "Wait and decide later"},
        ],
    }


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


class CollectChoiceprintAnswersTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary_directory.name).resolve()
        self.root.chmod(0o700)
        self.questions = self.root / "questions.jsonl"
        write_jsonl(self.questions, [question("case-001")])

    def tearDown(self) -> None:
        self.temporary_directory.cleanup()

    @staticmethod
    def fixed_time() -> datetime:
        return datetime(2026, 9, 20, 12, 34, 56, tzinfo=timezone.utc)

    def collect(
        self,
        *,
        output: Path | None = None,
        inputs: list[str] | None = None,
        seed: int = 17,
        ask_confidence: bool = False,
        now_fn=None,
    ) -> tuple[list[dict[str, object]], list[str], Path]:
        answers_path = output or self.root / "answers.jsonl"
        responses = iter(inputs or ["1"])
        displayed: list[str] = []
        answers = COLLECTOR.collect_answers(
            questions_path=self.questions,
            output_path=answers_path,
            seed=seed,
            ask_confidence=ask_confidence,
            input_fn=lambda _: next(responses),
            output_fn=displayed.append,
            now_fn=now_fn or self.fixed_time,
        )
        return answers, displayed, answers_path

    def prepare_retest(
        self,
        *,
        families: int = 3,
        cases_per_family: int = 3,
        answered_at: datetime | None = None,
    ) -> tuple[list[dict[str, object]], Path]:
        questions = [
            question(
                f"case-{family_index:02d}-{case_index:02d}",
                prompt=f"Retest prompt {family_index}-{case_index}",
                family=f"family-{family_index:02d}",
            )
            for family_index in range(families)
            for case_index in range(cases_per_family)
        ]
        write_jsonl(self.questions, questions)
        first_time = answered_at or (self.fixed_time() - timedelta(days=8))
        answers = [
            {
                "schema_version": 1,
                "case_id": record["case_id"],
                "selected_option_id": "gamma",
                "answered_at": first_time.isoformat(),
                "answer_confidence": 0.625,
            }
            for record in questions
        ]
        answers_path = self.root / "first-pass.jsonl"
        write_jsonl(answers_path, answers)
        return answers, answers_path

    def retest(
        self,
        *,
        answers_path: Path,
        output: Path | None = None,
        inputs: list[str] | None = None,
        seed: int = 23,
        count: int = 3,
        now_fn=None,
    ) -> tuple[list[dict[str, object]], list[str], Path]:
        output_path = output or self.root / "retest-answers.jsonl"
        responses = iter(inputs or ["1"] * count)
        displayed: list[str] = []
        answers = COLLECTOR.collect_retest(
            questions_path=self.questions,
            answers_path=answers_path,
            output_path=output_path,
            seed=seed,
            count=count,
            input_fn=lambda _: next(responses),
            output_fn=displayed.append,
            now_fn=now_fn or self.fixed_time,
        )
        return answers, displayed, output_path

    def test_collects_canonical_cases_only_without_persona_or_prior_answers(self) -> None:
        write_jsonl(
            self.questions,
            [
                question(
                    "case-001",
                    prompt="Which first plan would you choose?",
                    domain="PERSONA-CONTEXT-MUST-NOT-BE-SHOWN",
                    family="PRIOR-ANSWER-MUST-NOT-BE-SHOWN",
                ),
                question(
                    "case-001",
                    variant_id="paraphrase-1",
                    prompt="PARAPHRASE-MUST-NOT-BE-SHOWN",
                    domain="PERSONA-CONTEXT-MUST-NOT-BE-SHOWN",
                    family="PRIOR-ANSWER-MUST-NOT-BE-SHOWN",
                ),
                question("case-002", prompt="Which second plan would you choose?"),
            ],
        )
        with mock.patch.object(
            COLLECTOR.EVALUATOR,
            "_load_module",
            side_effect=AssertionError("collector attempted to load model-related code"),
        ):
            answers, displayed, output = self.collect(inputs=["1", "1"])

        rendered = "\n".join(displayed)
        self.assertNotIn("PERSONA-CONTEXT-MUST-NOT-BE-SHOWN", rendered)
        self.assertNotIn("PRIOR-ANSWER-MUST-NOT-BE-SHOWN", rendered)
        self.assertNotIn("PARAPHRASE-MUST-NOT-BE-SHOWN", rendered)
        self.assertNotIn("case-001", rendered)
        self.assertEqual(
            {answer["case_id"] for answer in answers}, {"case-001", "case-002"}
        )
        expected_keys = {
            "answered_at",
            "case_id",
            "schema_version",
            "selected_option_id",
        }
        self.assertTrue(all(set(answer) == expected_keys for answer in answers))
        self.assertEqual(
            answers,
            [
                json.loads(line)
                for line in output.read_text(encoding="utf-8").splitlines()
            ],
        )

    def test_order_is_deterministic_and_selected_ids_survive_option_shuffle(self) -> None:
        write_jsonl(
            self.questions,
            [question("case-001"), question("case-002"), question("case-003")],
        )
        first, _, _ = self.collect(
            output=self.root / "first.jsonl", inputs=["1", "1", "1"], seed=991
        )
        second, _, _ = self.collect(
            output=self.root / "second.jsonl", inputs=["1", "1", "1"], seed=991
        )
        self.assertEqual(
            [(item["case_id"], item["selected_option_id"]) for item in first],
            [(item["case_id"], item["selected_option_id"]) for item in second],
        )
        expected = [
            (
                item["case_id"],
                COLLECTOR._deterministic_order(
                    question(str(item["case_id"]))["options"],
                    seed=991,
                    scope=f"options:{item['case_id']}",
                    identity=lambda option: str(option["id"]),
                )[0]["id"],
            )
            for item in first
        ]
        self.assertEqual(
            [(item["case_id"], item["selected_option_id"]) for item in first],
            expected,
        )

    def test_optional_confidence_reprompts_and_timestamp_is_timezone_aware(self) -> None:
        local_time = datetime(
            2026,
            9,
            20,
            14,
            34,
            56,
            tzinfo=timezone(timedelta(hours=2)),
        )
        answers, displayed, _ = self.collect(
            inputs=["not-a-choice", "1", "2", "nan", "1.1", "0.75"],
            ask_confidence=True,
            now_fn=lambda: local_time,
        )
        self.assertEqual(answers[0]["answer_confidence"], 0.75)
        self.assertEqual(answers[0]["answered_at"], "2026-09-20T12:34:56+00:00")
        rendered = "\n".join(displayed)
        self.assertIn("Enter a whole number", rendered)
        self.assertEqual(rendered.count("Enter a number from 0 to 1"), 3)

    def test_blank_confidence_is_omitted_and_no_rationale_or_retest_is_written(self) -> None:
        answers, _, _ = self.collect(inputs=["1", ""], ask_confidence=True)
        self.assertNotIn("answer_confidence", answers[0])
        self.assertNotIn("rationale", answers[0])
        self.assertNotIn("retest_selected_option_id", answers[0])
        self.assertNotIn("retest_answered_at", answers[0])

    def test_output_is_private_and_accepted_by_evaluator_answer_validation(self) -> None:
        answers, _, output = self.collect()
        self.assertEqual(stat.S_IMODE(output.stat().st_mode), 0o600)
        questions = COLLECTOR.EVALUATOR._validate_questions(
            COLLECTOR.EVALUATOR._read_jsonl(self.questions)
        )
        validated = COLLECTOR.EVALUATOR._validate_answers(answers, questions)
        self.assertEqual(set(validated), {"case-001"})

    def test_missing_output_directories_are_created_owner_only(self) -> None:
        output = self.root / "new-private" / "nested" / "answers.jsonl"
        self.collect(output=output)
        self.assertEqual(stat.S_IMODE(output.parent.stat().st_mode), 0o700)
        self.assertEqual(stat.S_IMODE(output.parent.parent.stat().st_mode), 0o700)

    def test_refuses_overwrite_without_prompting(self) -> None:
        output = self.root / "answers.jsonl"
        output.write_text("keep me\n", encoding="utf-8")
        output.chmod(0o600)
        with self.assertRaisesRegex(COLLECTOR.CollectionError, "refusing to overwrite"):
            COLLECTOR.collect_answers(
                questions_path=self.questions,
                output_path=output,
                input_fn=lambda _: self.fail("collector prompted before refusing overwrite"),
            )
        self.assertEqual(output.read_text(encoding="utf-8"), "keep me\n")

    def test_refuses_symlink_output(self) -> None:
        target = self.root / "target.jsonl"
        target.write_text("keep me\n", encoding="utf-8")
        target.chmod(0o600)
        output = self.root / "answers.jsonl"
        output.symlink_to(target)
        with self.assertRaisesRegex(
            COLLECTOR.EVALUATOR.EvaluationError,
            "symlinked evaluation path is not allowed",
        ):
            self.collect(output=output)
        self.assertEqual(target.read_text(encoding="utf-8"), "keep me\n")

    def test_atomic_publish_failure_leaves_no_answer_or_temporary_file(self) -> None:
        output = self.root / "answers.jsonl"
        with mock.patch.object(
            COLLECTOR.os, "link", side_effect=OSError("simulated link failure")
        ):
            with self.assertRaisesRegex(OSError, "simulated link failure"):
                self.collect(output=output)
        self.assertFalse(output.exists())
        self.assertEqual(list(self.root.glob(".answers.jsonl.tmp-*")), [])

    def test_cancelled_session_leaves_no_output(self) -> None:
        output = self.root / "answers.jsonl"
        with self.assertRaises(EOFError):
            COLLECTOR.collect_answers(
                questions_path=self.questions,
                output_path=output,
                input_fn=lambda _: (_ for _ in ()).throw(EOFError()),
                output_fn=lambda _: None,
            )
        self.assertFalse(output.exists())

    def test_naive_clock_is_rejected_without_writing_output(self) -> None:
        output = self.root / "answers.jsonl"
        with self.assertRaisesRegex(
            COLLECTOR.CollectionError, "timestamp must include a timezone"
        ):
            self.collect(
                output=output,
                now_fn=lambda: datetime(2026, 9, 20, 12, 34, 56),
            )
        self.assertFalse(output.exists())

    def test_rejects_question_file_with_answer_like_data(self) -> None:
        unsafe = question("case-001")
        unsafe["selected_option_id"] = "alpha"
        write_jsonl(self.questions, [unsafe])
        with self.assertRaisesRegex(
            COLLECTOR.EVALUATOR.EvaluationError, "unexpected.*selected_option_id"
        ):
            self.collect()

    def test_rejects_output_in_repository_or_choiceprint_pack(self) -> None:
        with self.assertRaisesRegex(
            COLLECTOR.EVALUATOR.EvaluationError,
            "must be outside the repository",
        ):
            self.collect(
                output=COLLECTOR.EVALUATOR.REPO_ROOT
                / "digital-twin"
                / "unsafe-answers.jsonl"
            )
        with self.assertRaisesRegex(
            COLLECTOR.EVALUATOR.EvaluationError,
            "cannot be stored inside a Choiceprint pack",
        ):
            self.collect(output=self.root / "unsafe.choiceprint" / "answers.jsonl")

    def test_retest_is_deterministic_family_balanced_and_preserves_first_pass(self) -> None:
        original, first_pass = self.prepare_retest(families=6, cases_per_family=5)
        completed, displayed, output = self.retest(
            answers_path=first_pass,
            output=self.root / "retest-a.jsonl",
            inputs=["1"] * 15,
            seed=7001,
            count=15,
        )
        repeated, _, _ = self.retest(
            answers_path=first_pass,
            output=self.root / "retest-b.jsonl",
            inputs=["1"] * 15,
            seed=7001,
            count=15,
        )

        selected = {
            str(record["case_id"])
            for record in completed
            if "retest_selected_option_id" in record
        }
        repeated_selected = {
            str(record["case_id"])
            for record in repeated
            if "retest_selected_option_id" in record
        }
        self.assertEqual(selected, repeated_selected)
        family_counts: dict[str, int] = {}
        for case_id in selected:
            family = case_id.split("-")[1]
            family_counts[family] = family_counts.get(family, 0) + 1
        self.assertEqual(len(family_counts), 6)
        self.assertLessEqual(max(family_counts.values()) - min(family_counts.values()), 1)

        by_id = {str(record["case_id"]): record for record in completed}
        for before in original:
            after = by_id[str(before["case_id"])]
            for key, value in before.items():
                self.assertEqual(after[key], value)
            if str(before["case_id"]) in selected:
                self.assertEqual(after["retest_answered_at"], "2026-09-20T12:34:56+00:00")
            else:
                self.assertEqual(after, before)
        self.assertEqual(
            [record["case_id"] for record in completed],
            [record["case_id"] for record in original],
        )
        self.assertEqual(stat.S_IMODE(output.stat().st_mode), 0o600)
        self.assertIn("Earlier answers are not shown", "\n".join(displayed))

    def test_retest_never_displays_prior_selected_option_ids(self) -> None:
        _, first_pass = self.prepare_retest()
        completed, displayed, _ = self.retest(
            answers_path=first_pass,
            inputs=["2"] * 3,
            count=3,
        )
        rendered = "\n".join(displayed)
        self.assertNotIn("gamma", rendered)
        self.assertNotIn("selected_option_id", rendered)
        self.assertNotIn("0.625", rendered)
        self.assertTrue(
            all(
                record["selected_option_id"] == "gamma"
                for record in completed
            )
        )

    def test_retest_enforces_seven_to_fourteen_day_window_before_prompting(self) -> None:
        for label, elapsed in (
            ("early", timedelta(days=6, hours=23, minutes=59)),
            ("late", timedelta(days=14, seconds=1)),
        ):
            with self.subTest(label=label):
                _, first_pass = self.prepare_retest(
                    answered_at=self.fixed_time() - elapsed
                )
                output = self.root / f"{label}-retest.jsonl"
                with self.assertRaisesRegex(
                    COLLECTOR.CollectionError, "7-14 days"
                ):
                    COLLECTOR.collect_retest(
                        questions_path=self.questions,
                        answers_path=first_pass,
                        output_path=output,
                        seed=1,
                        count=3,
                        input_fn=lambda _: self.fail(
                            "retest prompted outside the allowed window"
                        ),
                        now_fn=self.fixed_time,
                    )
                self.assertFalse(output.exists())
                first_pass.unlink()

    def test_retest_accepts_exact_window_boundaries(self) -> None:
        for days in (7, 14):
            with self.subTest(days=days):
                _, first_pass = self.prepare_retest(
                    answered_at=self.fixed_time() - timedelta(days=days)
                )
                completed, _, output = self.retest(
                    answers_path=first_pass,
                    output=self.root / f"boundary-{days}.jsonl",
                    inputs=["1"],
                    count=1,
                )
                self.assertEqual(
                    sum("retest_selected_option_id" in item for item in completed),
                    1,
                )
                self.assertTrue(output.exists())
                first_pass.unlink()

    def test_retest_rejects_invalid_count_existing_retest_and_overwrite(self) -> None:
        original, first_pass = self.prepare_retest()
        for count in (0, 10):
            with self.subTest(count=count):
                with self.assertRaisesRegex(COLLECTOR.CollectionError, "retest count"):
                    COLLECTOR.collect_retest(
                        questions_path=self.questions,
                        answers_path=first_pass,
                        output_path=self.root / f"invalid-{count}.jsonl",
                        seed=1,
                        count=count,
                        input_fn=lambda _: self.fail("invalid count prompted"),
                        now_fn=self.fixed_time,
                    )

        existing_output = self.root / "existing.jsonl"
        existing_output.write_text("keep me\n", encoding="utf-8")
        existing_output.chmod(0o600)
        with self.assertRaisesRegex(COLLECTOR.CollectionError, "refusing to overwrite"):
            self.retest(answers_path=first_pass, output=existing_output)
        self.assertEqual(existing_output.read_text(encoding="utf-8"), "keep me\n")

        original[0]["retest_selected_option_id"] = "alpha"
        original[0]["retest_answered_at"] = self.fixed_time().isoformat()
        with_retest = self.root / "already-retested.jsonl"
        write_jsonl(with_retest, original)
        with self.assertRaisesRegex(COLLECTOR.CollectionError, "must not already"):
            self.retest(
                answers_path=with_retest,
                output=self.root / "should-not-exist.jsonl",
            )

    def test_retest_cancellation_and_source_changes_publish_nothing(self) -> None:
        _, first_pass = self.prepare_retest()
        cancelled = self.root / "cancelled.jsonl"
        with self.assertRaises(EOFError):
            COLLECTOR.collect_retest(
                questions_path=self.questions,
                answers_path=first_pass,
                output_path=cancelled,
                seed=2,
                count=2,
                input_fn=lambda _: (_ for _ in ()).throw(EOFError()),
                output_fn=lambda _: None,
                now_fn=self.fixed_time,
            )
        self.assertFalse(cancelled.exists())

        changed = self.root / "changed.jsonl"
        responses = iter(["1", "1"])

        def mutate_then_answer(_: str) -> str:
            if not changed.exists():
                self.questions.write_text(
                    self.questions.read_text(encoding="utf-8") + "\n",
                    encoding="utf-8",
                )
                self.questions.chmod(0o600)
                changed.touch()
            return next(responses)

        output = self.root / "source-changed.jsonl"
        with self.assertRaisesRegex(COLLECTOR.CollectionError, "questions changed"):
            COLLECTOR.collect_retest(
                questions_path=self.questions,
                answers_path=first_pass,
                output_path=output,
                seed=2,
                count=2,
                input_fn=mutate_then_answer,
                output_fn=lambda _: None,
                now_fn=self.fixed_time,
            )
        self.assertFalse(output.exists())

        # Restore valid questions, then prove the independently protected
        # first-pass source cannot change during collection either.
        self.prepare_retest()
        responses = iter(["1", "1"])
        mutated = False

        def mutate_answers_then_answer(_: str) -> str:
            nonlocal mutated
            if not mutated:
                first_pass.write_text(
                    first_pass.read_text(encoding="utf-8") + "\n",
                    encoding="utf-8",
                )
                first_pass.chmod(0o600)
                mutated = True
            return next(responses)

        output = self.root / "answers-changed.jsonl"
        with self.assertRaisesRegex(
            COLLECTOR.CollectionError, "first-pass answers changed"
        ):
            COLLECTOR.collect_retest(
                questions_path=self.questions,
                answers_path=first_pass,
                output_path=output,
                seed=2,
                count=2,
                input_fn=mutate_answers_then_answer,
                output_fn=lambda _: None,
                now_fn=self.fixed_time,
            )
        self.assertFalse(output.exists())

    def test_retest_requires_private_regular_first_pass_file(self) -> None:
        _, first_pass = self.prepare_retest()
        first_pass.chmod(0o644)
        with self.assertRaisesRegex(
            COLLECTOR.EVALUATOR.EvaluationError, "must not be accessible"
        ):
            self.retest(
                answers_path=first_pass,
                output=self.root / "unsafe-permissions.jsonl",
            )

        target = self.root / "private-target.jsonl"
        first_pass.rename(target)
        target.chmod(0o600)
        first_pass.symlink_to(target)
        with self.assertRaisesRegex(
            COLLECTOR.EVALUATOR.EvaluationError, "symlinked evaluation path"
        ):
            self.retest(
                answers_path=first_pass,
                output=self.root / "unsafe-symlink.jsonl",
            )

    def test_retest_output_is_accepted_by_evaluator(self) -> None:
        _, first_pass = self.prepare_retest(families=3, cases_per_family=2)
        completed, _, _ = self.retest(
            answers_path=first_pass,
            inputs=["1", "1", "1"],
            count=3,
        )
        questions = COLLECTOR.EVALUATOR._validate_questions(
            COLLECTOR.EVALUATOR._read_jsonl(self.questions)
        )
        validated = COLLECTOR.EVALUATOR._validate_answers(completed, questions)
        self.assertEqual(len(validated), 6)
        self.assertEqual(
            sum("retest_selected_option_id" in item for item in validated.values()),
            3,
        )

    def test_retest_cli_requires_explicit_seed_and_count_and_preserves_first_pass_cli(self) -> None:
        first_pass = COLLECTOR._build_parser().parse_args(
            ["--questions", str(self.questions), "--out", str(self.root / "a.jsonl")]
        )
        self.assertEqual(first_pass.seed, COLLECTOR.DEFAULT_SEED)

        with self.assertRaises(SystemExit):
            COLLECTOR._build_retest_parser().parse_args(
                [
                    "--questions",
                    str(self.questions),
                    "--answers",
                    str(self.root / "answers.jsonl"),
                    "--out",
                    str(self.root / "retest.jsonl"),
                    "--count",
                    "1",
                ]
            )
        parsed = COLLECTOR._build_retest_parser().parse_args(
            [
                "--questions",
                str(self.questions),
                "--answers",
                str(self.root / "answers.jsonl"),
                "--out",
                str(self.root / "retest.jsonl"),
                "--seed",
                "99",
                "--count",
                "1",
            ]
        )
        self.assertEqual((parsed.seed, parsed.count), (99, 1))


if __name__ == "__main__":
    unittest.main()
