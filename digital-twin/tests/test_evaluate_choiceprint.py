from __future__ import annotations

import importlib.util
import io
import json
import os
import shutil
import sys
import tempfile
import unittest
from contextlib import redirect_stderr
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any
from unittest import mock


EVALUATOR_PATH = (
    Path(__file__).resolve().parents[1] / "scripts" / "evaluate_choiceprint.py"
)
SPEC = importlib.util.spec_from_file_location("evaluate_choiceprint", EVALUATOR_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"cannot import evaluator from {EVALUATOR_PATH}")
EVALUATOR = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = EVALUATOR
SPEC.loader.exec_module(EVALUATOR)

EXAMPLE_PACK = (
    Path(__file__).resolve().parents[1] / "templates" / "example.choiceprint"
)


def write_json(path: Path, value: object, *, mode: int = 0o600) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    path.chmod(mode)


def write_jsonl(
    path: Path, records: list[dict[str, object]], *, mode: int = 0o600
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        "".join(
            json.dumps(record, ensure_ascii=False, sort_keys=True) + "\n"
            for record in records
        ),
        encoding="utf-8",
    )
    path.chmod(mode)


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
        "prompt": prompt or f"What would the person choose in {case_id}?",
        "options": [
            {"id": "a", "text": "Choose the first option"},
            {"id": "b", "text": "Choose the second option"},
            {"id": "c", "text": "Choose the third option"},
        ],
    }


class EvaluateChoiceprintTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary_directory.name).resolve()
        self.persona = self.root / "persona.yaml"
        self.persona.write_text("name: Test Person\n", encoding="utf-8")
        self.persona.chmod(0o600)
        self.narrative = self.root / "narrative.md"
        self.narrative.write_text(
            "The person normally plans carefully and prefers a quiet evening.\n",
            encoding="utf-8",
        )
        self.narrative.chmod(0o600)
        self.pack = self.root / "test.choiceprint"
        shutil.copytree(EXAMPLE_PACK, self.pack)

    def tearDown(self) -> None:
        self.temporary_directory.cleanup()

    def completed_semantic_review(
        self,
        records: list[dict[str, object]],
        *,
        name: str,
        choiceprint_path: Path | None = None,
        mode: int = 0o600,
    ) -> tuple[Path, dict[str, Any]]:
        review = EVALUATOR._semantic_review_template(
            EVALUATOR._validate_questions(records), choiceprint_path or self.pack
        )
        review["reviewed_at"] = EVALUATOR._utc_now()
        for checklist_item in review["checklist"]:
            review["checklist"][checklist_item] = True
        for case_review in review["case_reviews"]:
            case_review["decision"] = "approve"
        path = self.root / f"{name}-semantic-review.json"
        write_json(path, review, mode=mode)
        return path, review

    def freeze(
        self,
        records: list[dict[str, object]] | None = None,
        *,
        samples: int = 1,
        name: str = "blind-run",
        context_cutoff: str = "2026-09-19T00:00:00+00:00",
        choiceprint_path: Path | None = None,
        semantic_review_path: Path | None = None,
        retrospective: bool = False,
        minimum_domain_items: int = 30,
        minimum_scenario_families: int = 6,
        required_retest_items: int = 15,
        minimum_choiceprint_accuracy: float = 0.70,
        minimum_choiceprint_coverage: float = 0.80,
        minimum_delta_over_strongest_baseline: float = 0.05,
        minimum_delta_ci95_lower_bound: float = 0.0,
        maximum_high_stability_wrong_rate: float = 0.10,
        minimum_human_retest_agreement: float = 0.80,
    ) -> Path:
        questions = self.root / f"{name}-questions.jsonl"
        question_records = records or [question("holdout-001")]
        write_jsonl(questions, question_records)
        selected_pack = choiceprint_path or self.pack
        if semantic_review_path is None:
            semantic_review_path, _ = self.completed_semantic_review(
                question_records,
                name=name,
                choiceprint_path=selected_pack,
            )
        output = self.root / name
        with (
            mock.patch.object(EVALUATOR, "_validate_choiceprint"),
            mock.patch.object(
                EVALUATOR,
                "_load_yaml_identity",
                return_value="The person prefers planning and calm settings.",
            ),
            mock.patch.object(
                EVALUATOR,
                "_codex_runtime_fingerprint",
                return_value={
                    "codex_executable_path": "/test/codex",
                    "codex_executable_sha256": "0" * 64,
                    "codex_cli_version": "codex-test",
                },
            ),
        ):
            return EVALUATOR.freeze_evaluation(
                questions_path=questions,
                persona_path=self.persona,
                narrative_path=self.narrative,
                choiceprint_path=selected_pack,
                output_path=output,
                model="test-model",
                reasoning_effort="low",
                samples=samples,
                seed=417,
                timeout=30,
                context_cutoff=context_cutoff,
                retrospective=retrospective,
                semantic_review_path=semantic_review_path,
                cloud_processing_consent=True,
                max_context_chars=500_000,
                bootstrap_iterations=200,
                minimum_domain_items=minimum_domain_items,
                minimum_scenario_families=minimum_scenario_families,
                required_retest_items=required_retest_items,
                minimum_choiceprint_accuracy=minimum_choiceprint_accuracy,
                minimum_choiceprint_coverage=minimum_choiceprint_coverage,
                minimum_delta_over_strongest_baseline=(
                    minimum_delta_over_strongest_baseline
                ),
                minimum_delta_ci95_lower_bound=(
                    minimum_delta_ci95_lower_bound
                ),
                maximum_high_stability_wrong_rate=(
                    maximum_high_stability_wrong_rate
                ),
                minimum_human_retest_agreement=minimum_human_retest_agreement,
            )

    def run_all(
        self, run_root: Path, selected: str = "a", *, finalize: bool = True
    ) -> int:
        produced = EVALUATOR.run_evaluation(
            run_root,
            invoke=lambda **_: json.dumps({"selected_option_id": selected}),
        )
        if finalize:
            EVALUATOR.finalize_evaluation(run_root)
        return produced

    def time_after_freeze(self, run_root: Path, *, days: int = 1) -> str:
        manifest = json.loads(
            (run_root / "run-manifest.json").read_text(encoding="utf-8")
        )
        frozen_at = datetime.fromisoformat(manifest["frozen_at"])
        return (frozen_at + timedelta(days=days)).isoformat()

    def score_promotion_candidate(
        self, *, name: str, retrospective: bool = False
    ) -> tuple[Path, Path, Path, dict[str, Any]]:
        run_root = self.freeze(
            [question(f"{name}-case")],
            name=f"{name}-run",
            retrospective=retrospective,
            minimum_domain_items=1,
            minimum_scenario_families=1,
            required_retest_items=1,
        )

        def invoke(**kwargs: object) -> str:
            prompt = str(kwargs["prompt"])
            selected = "a" if "03-DECISION-CASES.md" in prompt else "b"
            return json.dumps({"selected_option_id": selected})

        self.assertEqual(EVALUATOR.run_evaluation(run_root, invoke=invoke), 5)
        EVALUATOR.finalize_evaluation(run_root)
        first_answered_at = datetime.fromisoformat(
            self.time_after_freeze(run_root)
        )
        answers = self.root / f"{name}-answers.jsonl"
        write_jsonl(
            answers,
            [
                {
                    "schema_version": 1,
                    "case_id": f"{name}-case",
                    "selected_option_id": "a",
                    "answered_at": first_answered_at.isoformat(),
                    "retest_selected_option_id": "a",
                    "retest_answered_at": (
                        first_answered_at + timedelta(days=8)
                    ).isoformat(),
                }
            ],
        )
        output = self.root / f"{name}-score"
        summary = EVALUATOR.score_evaluation(
            run_root=run_root,
            answers_path=answers,
            output_path=output,
        )
        return run_root, answers, output, summary

    def test_choiceprint_validator_module_loads_during_freeze(self) -> None:
        EVALUATOR._validate_choiceprint(self.pack)

    def test_preflight_creates_private_answer_free_human_review_packet(self) -> None:
        questions = self.root / "preflight-questions.jsonl"
        write_jsonl(
            questions,
            [
                question("holdout-review-001", family="planning"),
                question(
                    "holdout-review-001",
                    variant_id="paraphrase-01",
                    prompt=(
                        "For holdout-review-001, what choice would the person make?"
                    ),
                    family="planning",
                ),
                question(
                    "holdout-review-002",
                    prompt="Which new low-stakes choice would the person make?",
                    family="routine",
                ),
            ],
        )
        output = self.root / "review-packet"
        with (
            mock.patch.object(EVALUATOR, "_validate_choiceprint"),
            mock.patch.object(
                EVALUATOR,
                "_load_yaml_identity",
                return_value="The person prefers planning and calm settings.",
            ),
            mock.patch.object(
                EVALUATOR,
                "_codex_runtime_fingerprint",
                side_effect=AssertionError("preflight must not inspect or run Codex"),
            ),
        ):
            result = EVALUATOR.prepare_review_packet(
                questions_path=questions,
                persona_path=self.persona,
                narrative_path=self.narrative,
                choiceprint_path=self.pack,
                output_path=output,
                samples=5,
                max_context_chars=500_000,
            )

        self.assertEqual(result["independent_cases"], 2)
        self.assertEqual(result["question_variants"], 3)
        self.assertEqual(result["paraphrase_variants"], 1)
        self.assertEqual(result["estimated_model_calls"], 75)
        self.assertLess(
            result["context_characters"]["choiceprint_without_cases"],
            result["context_characters"]["choiceprint"],
        )
        self.assertEqual(
            result["automated_exact_development_overlap_check"], "passed"
        )
        self.assertFalse(result["human_semantic_overlap_reviewed"])
        self.assertFalse(result["cloud_processing_authorized"])
        self.assertFalse(result["ready_to_freeze"])
        semantic_review = json.loads(
            (output / "semantic-overlap-review.json").read_text(encoding="utf-8")
        )
        self.assertEqual(set(semantic_review), EVALUATOR.SEMANTIC_REVIEW_KEYS)
        self.assertEqual(semantic_review["reviewer"], "owner")
        self.assertIsNone(semantic_review["reviewed_at"])
        self.assertEqual(
            [review["case_id"] for review in semantic_review["case_reviews"]],
            ["holdout-review-001", "holdout-review-002"],
        )
        self.assertTrue(
            all(
                review["decision"] == "pending"
                for review in semantic_review["case_reviews"]
            )
        )
        self.assertTrue(
            all(value is False for value in semantic_review["checklist"].values())
        )
        self.assertEqual(semantic_review["questions_sha256"], result["questions_sha256"])
        self.assertEqual(
            semantic_review["choiceprint_build_metadata_sha256"],
            result["choiceprint_build_metadata_sha256"],
        )
        report = (output / "human-overlap-review.md").read_text(encoding="utf-8")
        self.assertIn("holdout-review-001 - canonical", report)
        self.assertIn("holdout-review-001 - paraphrase-01", report)
        self.assertIn(
            "For holdout-review-001, what choice would the person make?", report
        )
        self.assertIn("case_sample_validation", report)
        development_section = report.split(
            "## Development scenarios for comparison", maxsplit=1
        )[1]
        self.assertIn('"options"', development_section)
        self.assertIn("publish_now", development_section)
        self.assertIn("verify_first", development_section)
        for answer_field in (
            '"choice":',
            '"selected_option_id":',
            '"ranking":',
            '"user_rationale":',
            '"rationale":',
            '"outcome":',
            '"source_refs":',
        ):
            self.assertNotIn(answer_field, development_section)
        self.assertNotIn(
            "The result will be shared, so the calculation should be checked first.",
            report,
        )
        if os.name != "nt":
            self.assertEqual(output.stat().st_mode & 0o777, 0o700)
            self.assertEqual(
                (output / "preflight.json").stat().st_mode & 0o777, 0o600
            )
            self.assertEqual(
                (output / "human-overlap-review.md").stat().st_mode & 0o777,
                0o600,
            )
            self.assertEqual(
                (output / "semantic-overlap-review.json").stat().st_mode & 0o777,
                0o600,
            )

    def test_preflight_refuses_existing_output_and_exact_development_overlap(
        self,
    ) -> None:
        development_case = EVALUATOR._read_jsonl(
            self.pack / "profile" / "decision-cases.jsonl"
        )[0]
        questions = self.root / "overlap-review-questions.jsonl"
        write_jsonl(questions, [question(str(development_case["id"]))])
        output = self.root / "overlap-review"
        with (
            mock.patch.object(EVALUATOR, "_validate_choiceprint"),
            mock.patch.object(
                EVALUATOR, "_load_yaml_identity", return_value="Local context"
            ),
        ):
            with self.assertRaisesRegex(
                EVALUATOR.EvaluationError,
                "case_id already exists in Choiceprint development data",
            ):
                EVALUATOR.prepare_review_packet(
                    questions_path=questions,
                    persona_path=self.persona,
                    narrative_path=self.narrative,
                    choiceprint_path=self.pack,
                    output_path=output,
                    samples=1,
                    max_context_chars=500_000,
                )

        output.mkdir()
        safe_questions = self.root / "safe-review-questions.jsonl"
        write_jsonl(safe_questions, [question("holdout-review-safe")])
        with self.assertRaisesRegex(EVALUATOR.EvaluationError, "already exists"):
            EVALUATOR.prepare_review_packet(
                questions_path=safe_questions,
                persona_path=self.persona,
                narrative_path=self.narrative,
                choiceprint_path=self.pack,
                output_path=output,
                samples=1,
                max_context_chars=500_000,
            )

    def test_freeze_parser_requires_semantic_review_path_and_rejects_old_flag(
        self,
    ) -> None:
        parser = EVALUATOR._build_parser()
        common = [
            "freeze",
            "--questions",
            str(self.root / "questions.jsonl"),
            "--persona",
            str(self.persona),
            "--narrative",
            str(self.narrative),
            "--choiceprint",
            str(self.pack),
            "--model",
            "test-model",
            "--context-cutoff",
            "2026-09-19T00:00:00+00:00",
            "--authorize-cloud-processing",
            "--out",
            str(self.root / "run"),
        ]
        with redirect_stderr(io.StringIO()):
            with self.assertRaises(SystemExit):
                parser.parse_args(common)
            with self.assertRaises(SystemExit):
                parser.parse_args([*common, "--human-overlap-reviewed"])

    def test_freeze_rejects_stale_semantic_review(self) -> None:
        original = [question("holdout-stale")]
        review_path, _ = self.completed_semantic_review(
            original, name="stale"
        )
        changed = [
            question(
                "holdout-stale",
                prompt="A materially changed question after owner review",
            )
        ]

        with self.assertRaisesRegex(
            EVALUATOR.EvaluationError,
            "does not match the current questions",
        ):
            self.freeze(
                changed,
                name="stale-run",
                semantic_review_path=review_path,
            )

    def test_freeze_rejects_semantic_review_for_stale_choiceprint_build(
        self,
    ) -> None:
        records = [question("holdout-stale-build")]
        stale_pack = self.root / "stale-build.choiceprint"
        shutil.copytree(self.pack, stale_pack)
        review_path, _ = self.completed_semantic_review(
            records,
            name="stale-build",
            choiceprint_path=stale_pack,
        )
        build_metadata = stale_pack / "build-metadata.json"
        build_metadata.write_text(
            build_metadata.read_text(encoding="utf-8") + "\n",
            encoding="utf-8",
        )

        with self.assertRaisesRegex(
            EVALUATOR.EvaluationError,
            "does not match the current Choiceprint build",
        ):
            self.freeze(
                records,
                name="stale-build-run",
                choiceprint_path=stale_pack,
                semantic_review_path=review_path,
            )

    @unittest.skipUnless(hasattr(os, "symlink"), "symlinks are unavailable")
    def test_freeze_rejects_symlinked_semantic_review(self) -> None:
        records = [question("holdout-review-symlink")]
        review_path, _ = self.completed_semantic_review(
            records, name="review-symlink-target"
        )
        linked_review = self.root / "linked-semantic-review.json"
        linked_review.symlink_to(review_path)

        with self.assertRaisesRegex(
            EVALUATOR.EvaluationError,
            "symlinked evaluation path is not allowed",
        ):
            self.freeze(
                records,
                name="review-symlink-run",
                semantic_review_path=linked_review,
            )

    def test_freeze_rejects_semantic_review_schema_extension(self) -> None:
        records = [question("holdout-review-schema")]
        review_path, review = self.completed_semantic_review(
            records, name="review-schema"
        )
        review["unreviewed_extension"] = True
        write_json(review_path, review)

        with self.assertRaisesRegex(
            EVALUATOR.EvaluationError,
            "fields do not match the closed schema",
        ):
            self.freeze(
                records,
                name="review-schema-run",
                semantic_review_path=review_path,
            )

    @unittest.skipIf(os.name == "nt", "POSIX permission bits are unavailable")
    def test_freeze_rejects_semantic_review_without_mode_0600(self) -> None:
        records = [question("holdout-permissions")]
        review_path, _ = self.completed_semantic_review(
            records, name="bad-permissions", mode=0o640
        )

        with self.assertRaisesRegex(EVALUATOR.EvaluationError, "mode 0600"):
            self.freeze(
                records,
                name="bad-permissions-run",
                semantic_review_path=review_path,
            )

    def test_freeze_rejects_incomplete_semantic_review(self) -> None:
        records = [question("holdout-incomplete")]
        review_path, review = self.completed_semantic_review(
            records, name="incomplete"
        )
        review["checklist"]["no_answer_leakage"] = False
        write_json(review_path, review)

        with self.assertRaisesRegex(
            EVALUATOR.EvaluationError,
            "checklist must be fully approved",
        ):
            self.freeze(
                records,
                name="incomplete-run",
                semantic_review_path=review_path,
            )

    def test_freeze_rejects_semantic_review_with_rejected_case(self) -> None:
        records = [question("holdout-rejected")]
        review_path, review = self.completed_semantic_review(
            records, name="rejected"
        )
        review["case_reviews"][0]["decision"] = "reject"
        write_json(review_path, review)

        with self.assertRaisesRegex(
            EVALUATOR.EvaluationError,
            "rejected holdout cases: holdout-rejected",
        ):
            self.freeze(
                records,
                name="rejected-run",
                semantic_review_path=review_path,
            )

    def test_freeze_rejects_future_or_duplicate_semantic_review(self) -> None:
        records = [question("holdout-duplicate-review")]
        review_path, review = self.completed_semantic_review(
            records, name="future"
        )
        review["reviewed_at"] = "2999-01-01T00:00:00+00:00"
        write_json(review_path, review)
        with self.assertRaisesRegex(EVALUATOR.EvaluationError, "cannot be in the future"):
            self.freeze(
                records,
                name="future-review-run",
                semantic_review_path=review_path,
            )

        review["reviewed_at"] = EVALUATOR._utc_now()
        review["case_reviews"].append(dict(review["case_reviews"][0]))
        write_json(review_path, review)
        with self.assertRaisesRegex(EVALUATOR.EvaluationError, "duplicate case IDs"):
            self.freeze(
                records,
                name="duplicate-review-run",
                semantic_review_path=review_path,
            )

    def test_freeze_seals_completed_semantic_review_and_attestation(self) -> None:
        records = [question("holdout-sealed-review")]
        review_path, review = self.completed_semantic_review(
            records, name="sealed"
        )
        run_root = self.freeze(
            records,
            name="sealed-review-run",
            semantic_review_path=review_path,
        )

        frozen_review = run_root / "semantic-overlap-review.json"
        manifest = json.loads(
            (run_root / "run-manifest.json").read_text(encoding="utf-8")
        )
        attestation = manifest["source_attestation"]
        self.assertTrue(attestation["human_semantic_overlap_reviewed"])
        self.assertEqual(
            attestation["semantic_overlap_review_sha256"],
            EVALUATOR._sha256_file(frozen_review),
        )
        self.assertEqual(
            attestation["semantic_overlap_reviewed_at"], review["reviewed_at"]
        )
        self.assertEqual(
            manifest["file_sha256"]["semantic-overlap-review.json"],
            EVALUATOR._sha256_file(frozen_review),
        )
        self.assertEqual(
            manifest["scoring"]["minimum_delta_ci95_lower_bound"], 0.0
        )
        if os.name != "nt":
            self.assertEqual(frozen_review.stat().st_mode & 0o777, 0o600)
        EVALUATOR._verify_frozen_run(run_root)

    def test_freeze_rejects_invalid_delta_interval_gate(self) -> None:
        with self.assertRaisesRegex(
            EVALUATOR.EvaluationError,
            "minimum_delta_ci95_lower_bound must be between 0 and 1",
        ):
            self.freeze(
                name="invalid-delta-ci-run",
                minimum_delta_ci95_lower_bound=-0.01,
            )

    def test_paired_delta_interval_can_clear_positive_gate(self) -> None:
        identifiers = [f"case-{index}" for index in range(30)]
        choiceprint = {case_id: 1.0 for case_id in identifiers}
        baseline = {case_id: 0.0 for case_id in identifiers}
        domains = {case_id: "everyday_choices" for case_id in identifiers}

        point, interval = EVALUATOR._paired_delta_ci(
            choiceprint,
            baseline,
            domains,
            iterations=200,
            seed=417,
        )

        self.assertEqual(point, 1.0)
        self.assertEqual(interval, [1.0, 1.0])
        self.assertGreater(interval[0], 0.0)

    def test_freeze_rejects_future_context_cutoff(self) -> None:
        with self.assertRaisesRegex(
            EVALUATOR.EvaluationError,
            "context_cutoff cannot be after the freeze time",
        ):
            self.freeze(
                name="future-cutoff-run",
                context_cutoff="2999-01-01T00:00:00+00:00",
            )

    @unittest.skipUnless(hasattr(os, "symlink"), "symlinks are unavailable")
    def test_freeze_rejects_symlinked_choiceprint_pack(self) -> None:
        linked_pack = self.root / "linked.choiceprint"
        linked_pack.symlink_to(self.pack, target_is_directory=True)

        with self.assertRaises(EVALUATOR.EvaluationError):
            self.freeze(
                name="symlinked-pack-run", choiceprint_path=linked_pack
            )

    def test_private_path_boundary_rejects_repository_and_pack_paths(self) -> None:
        with self.assertRaisesRegex(
            EVALUATOR.EvaluationError,
            "must be outside the repository or under the ignored fallback",
        ):
            EVALUATOR._assert_private_evaluation_path(
                EVALUATOR.REPO_ROOT / "digital-twin" / "questions.jsonl",
                may_not_exist=True,
            )

        nested_pack_path = self.root / "unsafe.choiceprint" / "answers.jsonl"
        with self.assertRaisesRegex(
            EVALUATOR.EvaluationError, "cannot be stored inside a Choiceprint pack"
        ):
            EVALUATOR._assert_private_evaluation_path(
                nested_pack_path, may_not_exist=True
            )

        accepted = EVALUATOR._assert_private_evaluation_path(
            self.root / "private-eval", may_not_exist=True
        )
        self.assertEqual(accepted, self.root / "private-eval")

    @unittest.skipUnless(hasattr(os, "symlink"), "symlinks are unavailable")
    def test_private_path_boundary_rejects_symlink_chain(self) -> None:
        real_root = self.root / "real"
        real_root.mkdir()
        linked_root = self.root / "linked"
        linked_root.symlink_to(real_root, target_is_directory=True)

        with self.assertRaisesRegex(
            EVALUATOR.EvaluationError, "symlinked evaluation path is not allowed"
        ):
            EVALUATOR._assert_private_evaluation_path(
                linked_root / "run", may_not_exist=True
            )

    def test_question_schema_rejects_answer_like_fields(self) -> None:
        unsafe = question("holdout-unsafe")
        unsafe["selected_option_id"] = "a"

        with self.assertRaises(EVALUATOR.EvaluationError):
            EVALUATOR._validate_questions([unsafe])

        unsafe_option = question("holdout-unsafe-option")
        unsafe_option["options"][0]["rationale"] = "This gives the answer away"
        with self.assertRaises(EVALUATOR.EvaluationError):
            EVALUATOR._validate_questions([unsafe_option])

    def test_question_schema_rejects_swapped_option_meanings_across_variants(
        self,
    ) -> None:
        canonical = question("holdout-swapped")
        paraphrase = question(
            "holdout-swapped",
            variant_id="paraphrase-1",
            prompt="A paraphrase of the same choice",
        )
        first_text = paraphrase["options"][0]["text"]
        paraphrase["options"][0]["text"] = paraphrase["options"][1]["text"]
        paraphrase["options"][1]["text"] = first_text

        with self.assertRaises(EVALUATOR.EvaluationError):
            EVALUATOR._validate_questions([canonical, paraphrase])

    def test_question_schema_rejects_duplicate_holdout_content_across_cases(
        self,
    ) -> None:
        first = question(
            "holdout-duplicate-one", prompt="Which identical option is preferred?"
        )
        second = question(
            "holdout-duplicate-two", prompt="Which identical option is preferred?"
        )

        with self.assertRaises(EVALUATOR.EvaluationError):
            EVALUATOR._validate_questions([first, second])

    def test_freeze_seals_only_questions_and_persona_contexts(self) -> None:
        answer_marker = "PRIVATE-HUMAN-ANSWER-MUST-NOT-BE-READ"
        answers = self.root / "answers.jsonl"
        write_jsonl(
            answers,
            [
                {
                    "schema_version": 1,
                    "case_id": "holdout-001",
                    "selected_option_id": "b",
                    "answered_at": "2026-09-20T00:00:00+00:00",
                    "rationale": answer_marker,
                }
            ],
        )
        original_read_jsonl = EVALUATOR._read_jsonl
        read_paths: list[Path] = []

        def recording_read_jsonl(path: Path) -> list[dict[str, object]]:
            read_paths.append(Path(path).resolve())
            return original_read_jsonl(path)

        with mock.patch.object(
            EVALUATOR, "_read_jsonl", side_effect=recording_read_jsonl
        ):
            run_root = self.freeze(samples=2)

        manifest = json.loads(
            (run_root / "run-manifest.json").read_text(encoding="utf-8")
        )
        self.assertFalse(manifest["answer_data_accessed_by_freeze"])
        self.assertFalse(manifest["answer_data_accessed_by_runner"])
        self.assertEqual(
            manifest["prompt_policy_mapping_sha256"],
            EVALUATOR._prompt_policy_mapping_sha256(),
        )
        self.assertEqual(len(manifest["schedule"]), 10)
        self.assertNotIn(answers.resolve(), read_paths)
        frozen_text = "\n".join(
            path.read_text(encoding="utf-8")
            for path in run_root.rglob("*")
            if path.is_file()
        )
        self.assertNotIn(answer_marker, frozen_text)
        EVALUATOR._verify_frozen_run(run_root)

    def test_freeze_rejects_development_case_id_overlap(self) -> None:
        development_cases = EVALUATOR._read_jsonl(
            self.pack / "profile" / "decision-cases.jsonl"
        )
        development_id = development_cases[0]["id"]

        with self.assertRaisesRegex(
            EVALUATOR.EvaluationError,
            "case_id already exists in Choiceprint development data",
        ):
            self.freeze([question(str(development_id))], name="overlap-run")

    def test_prediction_prompt_applies_policy_for_every_condition(self) -> None:
        self.assertEqual(
            set(EVALUATOR.CONDITION_PROMPT_POLICIES), set(EVALUATOR.CONDITIONS)
        )
        question_record = question("holdout-policy")

        for condition in EVALUATOR.CONDITIONS:
            with self.subTest(condition=condition):
                context = (
                    "" if condition == "generic" else "Synthetic profile evidence."
                )
                prompt, _ = EVALUATOR._prediction_prompt(
                    question_record,
                    condition,
                    context,
                )
                expected_policy = EVALUATOR.CONDITION_PROMPT_POLICIES[condition]
                normalized_policy = " ".join(expected_policy.split())
                self.assertIn(
                    f"<prediction_policy>\n{expected_policy}\n</prediction_policy>",
                    prompt,
                )
                if condition == "generic":
                    self.assertEqual(
                        expected_policy, EVALUATOR.GENERIC_PROMPT_POLICY
                    )
                    self.assertIn("general human priors", normalized_policy)
                    self.assertNotIn(
                        EVALUATOR.PERSONALIZED_PROMPT_POLICY, prompt
                    )
                else:
                    self.assertEqual(
                        expected_policy, EVALUATOR.PERSONALIZED_PROMPT_POLICY
                    )
                    self.assertIn(
                        "do not fill missing personal facts", normalized_policy
                    )
                    self.assertIn(
                        "substitute generic human priors", normalized_policy
                    )
                    self.assertIn(
                        "cannot support a responsible ranking", normalized_policy
                    )
                    self.assertNotIn(EVALUATOR.GENERIC_PROMPT_POLICY, prompt)

    def test_prompt_policy_mapping_hash_is_order_independent(self) -> None:
        expected_hash = EVALUATOR._prompt_policy_mapping_sha256()
        reversed_policies = dict(
            reversed(tuple(EVALUATOR.CONDITION_PROMPT_POLICIES.items()))
        )

        with mock.patch.object(
            EVALUATOR,
            "CONDITION_PROMPT_POLICIES",
            reversed_policies,
        ):
            self.assertEqual(
                EVALUATOR._prompt_policy_mapping_sha256(), expected_hash
            )

    def test_run_is_resumable_and_never_reads_or_prompts_with_answers(self) -> None:
        run_root = self.freeze(samples=2)
        answer_marker = "PRIVATE-HUMAN-ANSWER-MUST-NOT-ENTER-RUNNER"
        answers = run_root / "answers.jsonl"
        write_jsonl(
            answers,
            [
                {
                    "schema_version": 1,
                    "case_id": "holdout-001",
                    "selected_option_id": "c",
                    "answered_at": "2026-09-20T00:00:00+00:00",
                    "rationale": answer_marker,
                }
            ],
        )
        prompts: list[str] = []
        original_read_jsonl = EVALUATOR._read_jsonl
        read_paths: list[Path] = []

        def recording_read_jsonl(path: Path) -> list[dict[str, object]]:
            read_paths.append(Path(path).resolve())
            return original_read_jsonl(path)

        def invoke(**kwargs: object) -> str:
            prompt = str(kwargs["prompt"])
            prompts.append(prompt)
            self.assertNotIn(answer_marker, prompt)
            schema = kwargs["output_schema"]
            self.assertEqual(
                set(schema["properties"]["selected_option_id"]["enum"]),
                {"a", "b", "c", EVALUATOR.ABSTAIN},
            )
            return json.dumps({"selected_option_id": "a"})

        with mock.patch.object(
            EVALUATOR, "_read_jsonl", side_effect=recording_read_jsonl
        ):
            self.assertEqual(
                EVALUATOR.run_evaluation(run_root, limit=3, invoke=invoke), 3
            )
            self.assertEqual(EVALUATOR.run_evaluation(run_root, invoke=invoke), 7)
            self.assertEqual(EVALUATOR.run_evaluation(run_root, invoke=invoke), 0)

        self.assertNotIn(answers.resolve(), read_paths)
        self.assertEqual(len(prompts), 10)
        predictions = EVALUATOR._read_jsonl(
            run_root / "predictions" / "predictions.jsonl"
        )
        self.assertEqual(len(predictions), 10)
        self.assertEqual(len({item["schedule_id"] for item in predictions}), 10)
        self.assertTrue(all(item["selected_option_id"] == "a" for item in predictions))

    def test_run_rejects_tampered_frozen_question_file(self) -> None:
        run_root = self.freeze()
        with (run_root / "questions.jsonl").open("a", encoding="utf-8") as handle:
            handle.write("{}\n")

        with self.assertRaisesRegex(
            EVALUATOR.EvaluationError, "frozen run file changed after freeze"
        ):
            EVALUATOR.run_evaluation(
                run_root,
                invoke=lambda **_: json.dumps({"selected_option_id": "a"}),
            )

    def test_run_rejects_tampered_manifest(self) -> None:
        run_root = self.freeze()
        manifest_path = run_root / "run-manifest.json"
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        manifest["runner"]["model"] = "different-model"
        write_json(manifest_path, manifest)

        with self.assertRaisesRegex(
            EVALUATOR.EvaluationError, "run manifest changed after freeze"
        ):
            EVALUATOR.run_evaluation(
                run_root,
                invoke=lambda **_: json.dumps({"selected_option_id": "a"}),
            )

    @unittest.skipIf(os.name == "nt", "POSIX permission bits are unavailable")
    def test_run_rejects_group_readable_frozen_context(self) -> None:
        run_root = self.freeze(name="context-permission-run")
        context_path = run_root / "contexts" / "narrative.txt"
        context_path.chmod(0o644)

        with self.assertRaises(EVALUATOR.EvaluationError):
            EVALUATOR.run_evaluation(
                run_root,
                invoke=lambda **_: json.dumps({"selected_option_id": "a"}),
            )

    def test_run_rejects_prompt_template_change_after_freeze(self) -> None:
        run_root = self.freeze(name="template-change-run")
        invoke = mock.Mock(return_value=json.dumps({"selected_option_id": "a"}))

        with (
            mock.patch.object(
                EVALUATOR,
                "PROMPT_TEMPLATE",
                EVALUATOR.PROMPT_TEMPLATE + "\nChanged after freeze.\n",
            ),
            self.assertRaises(EVALUATOR.EvaluationError),
        ):
            EVALUATOR.run_evaluation(run_root, invoke=invoke)

        invoke.assert_not_called()

    def test_run_rejects_prompt_policy_mapping_change_after_freeze(self) -> None:
        run_root = self.freeze(name="policy-change-run")
        invoke = mock.Mock(return_value=json.dumps({"selected_option_id": "a"}))
        changed_policies = dict(EVALUATOR.CONDITION_PROMPT_POLICIES)
        changed_policies["choiceprint"] += " Changed after freeze."

        with (
            mock.patch.object(
                EVALUATOR,
                "CONDITION_PROMPT_POLICIES",
                changed_policies,
            ),
            self.assertRaisesRegex(
                EVALUATOR.EvaluationError,
                "condition prompt policy mapping changed after freeze",
            ),
        ):
            EVALUATOR.run_evaluation(run_root, invoke=invoke)

        invoke.assert_not_called()

    @unittest.skipUnless(hasattr(os, "symlink"), "symlinks are unavailable")
    def test_run_rejects_symlinked_prediction_file_without_touching_target(self) -> None:
        run_root = self.freeze(name="prediction-symlink-run")
        external_target = self.root / "external-predictions.jsonl"
        external_target.write_text("", encoding="utf-8")
        external_target.chmod(0o600)
        prediction_path = run_root / "predictions" / "predictions.jsonl"
        prediction_path.symlink_to(external_target)

        with self.assertRaises(EVALUATOR.EvaluationError):
            EVALUATOR.run_evaluation(
                run_root,
                invoke=lambda **_: json.dumps({"selected_option_id": "a"}),
            )

        self.assertEqual(external_target.read_text(encoding="utf-8"), "")

    @unittest.skipUnless(hasattr(os, "symlink"), "symlinks are unavailable")
    def test_finalize_rejects_dangling_symlink_without_creating_target(self) -> None:
        run_root = self.freeze(name="finalization-symlink-run")
        self.run_all(run_root, finalize=False)
        external_target = self.root / "external-finalization.json"
        finalization_path = run_root / "prediction-finalization.json"
        finalization_path.symlink_to(external_target)

        with self.assertRaises(EVALUATOR.EvaluationError):
            EVALUATOR.finalize_evaluation(run_root)

        self.assertFalse(external_target.exists())

    def test_finalize_rejects_prediction_timestamps_outside_run_window(self) -> None:
        for label, started_at, completed_at in (
            (
                "before-freeze",
                "2000-01-01T00:00:00+00:00",
                "2000-01-01T00:00:01+00:00",
            ),
            (
                "future",
                "2999-01-01T00:00:00+00:00",
                "2999-01-01T00:00:01+00:00",
            ),
        ):
            with self.subTest(label=label):
                run_root = self.freeze(name=f"timestamp-{label}-run")
                self.run_all(run_root, finalize=False)
                prediction_path = run_root / "predictions" / "predictions.jsonl"
                predictions = EVALUATOR._read_jsonl(prediction_path)
                predictions[0]["started_at"] = started_at
                predictions[0]["completed_at"] = completed_at
                write_jsonl(prediction_path, predictions)

                with self.assertRaises(EVALUATOR.EvaluationError):
                    EVALUATOR.finalize_evaluation(run_root)

    def test_finalize_rejects_incomplete_prediction_schedule(self) -> None:
        run_root = self.freeze(name="incomplete-finalization-run")
        EVALUATOR.run_evaluation(
            run_root,
            limit=1,
            invoke=lambda **_: json.dumps({"selected_option_id": "a"}),
        )

        with self.assertRaisesRegex(
            EVALUATOR.EvaluationError,
            "prediction schedule is incomplete",
        ):
            EVALUATOR.finalize_evaluation(run_root)

    def test_run_rejects_changes_after_prediction_finalization(self) -> None:
        run_root = self.freeze(name="run-after-finalization")
        self.run_all(run_root)
        invoke = mock.Mock(return_value=json.dumps({"selected_option_id": "a"}))

        with self.assertRaisesRegex(
            EVALUATOR.EvaluationError,
            "predictions are finalized and cannot be changed",
        ):
            EVALUATOR.run_evaluation(run_root, invoke=invoke)

        invoke.assert_not_called()

    def test_default_run_rejects_codex_runtime_fingerprint_drift(self) -> None:
        run_root = self.freeze(name="runtime-drift-run")
        changed_runtime = {
            "codex_executable_path": "/different/codex",
            "codex_executable_sha256": "1" * 64,
            "codex_cli_version": "different-version",
        }

        with (
            mock.patch.object(
                EVALUATOR,
                "_codex_runtime_fingerprint",
                return_value=changed_runtime,
            ),
            self.assertRaisesRegex(
                EVALUATOR.EvaluationError,
                "Codex runtime changed after freeze",
            ),
        ):
            EVALUATOR.run_evaluation(run_root)

    def test_run_rejects_existing_prediction_outside_frozen_schedule(self) -> None:
        run_root = self.freeze()
        manifest = json.loads(
            (run_root / "run-manifest.json").read_text(encoding="utf-8")
        )
        question_record = EVALUATOR._read_jsonl(run_root / "questions.jsonl")[0]
        prompt, _ = EVALUATOR._prediction_prompt(
            question_record,
            "generic",
            "",
            schedule_id="ffffffffffffffffffffffff",
        )
        raw_response = json.dumps({"selected_option_id": "a"})
        alien = {
            "schema_version": 1,
            "run_id": manifest["run_id"],
            "schedule_id": "ffffffffffffffffffffffff",
            "case_id": question_record["case_id"],
            "variant_id": question_record["variant_id"],
            "condition": "generic",
            "sample_index": 0,
            "selected_option_id": "a",
            "started_at": manifest["frozen_at"],
            "completed_at": manifest["frozen_at"],
            "model": manifest["runner"]["model"],
            "reasoning_effort": manifest["runner"]["reasoning_effort"],
            "prompt_sha256": EVALUATOR._sha256_text(prompt),
            "context_sha256": EVALUATOR._sha256_text(""),
            "raw_response": raw_response,
            "raw_response_sha256": EVALUATOR._sha256_text(raw_response),
        }
        write_jsonl(
            run_root / "predictions" / "predictions.jsonl", [alien]
        )

        with self.assertRaisesRegex(
            EVALUATOR.EvaluationError, "prediction is not in frozen schedule"
        ):
            EVALUATOR.run_evaluation(
                run_root,
                invoke=lambda **_: json.dumps({"selected_option_id": "a"}),
            )

    def test_score_evidence_binds_sources_outputs_and_pack_stays_unchanged(
        self,
    ) -> None:
        pack_manifest_path = self.pack / "manifest.json"
        original_pack_manifest = pack_manifest_path.read_bytes()
        run_root, answers, output, summary = self.score_promotion_candidate(
            name="eligible-evidence"
        )

        evidence = EVALUATOR.verify_score_evidence(
            output,
            run_root=run_root,
            answers_path=answers,
        )
        manifest = json.loads(
            (run_root / "run-manifest.json").read_text(encoding="utf-8")
        )
        self.assertEqual(set(evidence), EVALUATOR.SCORE_EVIDENCE_KEYS)
        self.assertEqual(evidence["artifact_type"], "choiceprint_score_evidence")
        self.assertEqual(evidence["run_id"], manifest["run_id"])
        self.assertEqual(evidence["scored_at"], summary["scored_at"])
        self.assertRegex(evidence["nonce"], r"^[0-9a-f]{64}$")
        self.assertEqual(
            evidence["choiceprint_build_metadata_sha256"],
            manifest["choiceprint_build_metadata_sha256"],
        )
        self.assertEqual(
            evidence["run_manifest_sha256"],
            EVALUATOR._sha256_file(run_root / "run-manifest.json"),
        )
        self.assertEqual(
            evidence["prediction_finalization_sha256"],
            EVALUATOR._sha256_file(
                run_root / "prediction-finalization.json"
            ),
        )
        self.assertEqual(
            evidence["answers_sha256"], EVALUATOR._sha256_file(answers)
        )
        for digest_key, filename in (
            ("summary_sha256", "summary.json"),
            ("items_sha256", "items.jsonl"),
            ("report_sha256", "report.md"),
        ):
            self.assertEqual(
                evidence[digest_key], EVALUATOR._sha256_file(output / filename)
            )
        self.assertTrue(summary["all_domain_pilot_gates_met"])
        self.assertTrue(summary["prediction_finalized"])
        self.assertFalse(summary["retrospective"])
        self.assertTrue(evidence["promotion_eligible"])
        self.assertEqual(pack_manifest_path.read_bytes(), original_pack_manifest)

        evidence_path = output / "score-evidence.json"
        seal_path = output / "score-evidence.sha256"
        self.assertEqual(
            seal_path.read_text(encoding="utf-8"),
            f"{EVALUATOR._sha256_file(evidence_path)}  score-evidence.json\n",
        )
        if os.name != "nt":
            for filename in (
                "summary.json",
                "items.jsonl",
                "report.md",
                "score-evidence.json",
                "score-evidence.sha256",
            ):
                self.assertEqual(
                    (output / filename).stat().st_mode & 0o777, 0o600
                )

        report_path = output / "report.md"
        original_report = report_path.read_text(encoding="utf-8")
        report_path.write_text(original_report + "tampered\n", encoding="utf-8")
        with self.assertRaisesRegex(
            EVALUATOR.EvaluationError, "report.md"
        ):
            EVALUATOR.verify_score_evidence(
                output, run_root=run_root, answers_path=answers
            )
        report_path.write_text(original_report, encoding="utf-8")
        report_path.chmod(0o600)

        tampered_evidence = dict(evidence)
        tampered_evidence["promotion_eligible"] = False
        write_json(evidence_path, tampered_evidence)
        seal_path.write_text(
            f"{EVALUATOR._sha256_file(evidence_path)}  score-evidence.json\n",
            encoding="utf-8",
        )
        seal_path.chmod(0o600)
        with self.assertRaisesRegex(
            EVALUATOR.EvaluationError, "promotion eligibility conflicts"
        ):
            EVALUATOR.verify_score_evidence(
                output, run_root=run_root, answers_path=answers
            )

    def test_retrospective_score_is_not_promotion_eligible(self) -> None:
        run_root, answers, output, summary = self.score_promotion_candidate(
            name="retrospective-evidence",
            retrospective=True,
        )

        evidence = EVALUATOR.verify_score_evidence(
            output,
            run_root=run_root,
            answers_path=answers,
        )

        self.assertTrue(summary["all_domain_pilot_gates_met"])
        self.assertTrue(summary["retrospective"])
        self.assertTrue(summary["prediction_finalized"])
        self.assertFalse(evidence["promotion_eligible"])

    def test_forged_passing_domain_with_rehashed_bundle_cannot_verify(
        self,
    ) -> None:
        run_root = self.freeze(
            [question("forged-gate-case")],
            name="forged-gate-run",
            minimum_domain_items=2,
            minimum_scenario_families=2,
            required_retest_items=2,
        )
        self.run_all(run_root, selected="a")
        answered_at = datetime.fromisoformat(self.time_after_freeze(run_root))
        answers = self.root / "forged-gate-answers.jsonl"
        write_jsonl(
            answers,
            [
                {
                    "schema_version": 1,
                    "case_id": "forged-gate-case",
                    "selected_option_id": "a",
                    "answered_at": answered_at.isoformat(),
                    "retest_selected_option_id": "a",
                    "retest_answered_at": (
                        answered_at + timedelta(days=8)
                    ).isoformat(),
                }
            ],
        )
        output = self.root / "forged-gate-score"
        original_summary = EVALUATOR.score_evaluation(
            run_root=run_root,
            answers_path=answers,
            output_path=output,
        )
        self.assertFalse(original_summary["all_domain_pilot_gates_met"])

        summary_path = output / "summary.json"
        summary = json.loads(summary_path.read_text(encoding="utf-8"))
        forged_gate = summary["pilot_gate_by_domain"].pop(
            "everyday_choices"
        )
        forged_gate["pilot_gate_met"] = True
        summary["pilot_gate_by_domain"]["forged_domain"] = forged_gate
        summary["all_domain_pilot_gates_met"] = True
        write_json(summary_path, summary)

        items_path = output / "items.jsonl"
        items = EVALUATOR._read_jsonl(items_path)
        items[0]["domain"] = "forged_domain"
        write_jsonl(items_path, items)

        report_path = output / "report.md"
        report = report_path.read_text(encoding="utf-8")
        report_path.write_text(
            report.replace("everyday_choices", "forged_domain").replace(
                "| no |", "| yes |"
            ),
            encoding="utf-8",
        )
        report_path.chmod(0o600)

        evidence_path = output / "score-evidence.json"
        evidence = json.loads(evidence_path.read_text(encoding="utf-8"))
        evidence["summary_sha256"] = EVALUATOR._sha256_file(summary_path)
        evidence["items_sha256"] = EVALUATOR._sha256_file(items_path)
        evidence["report_sha256"] = EVALUATOR._sha256_file(report_path)
        evidence["promotion_eligible"] = True
        write_json(evidence_path, evidence)
        seal_path = output / "score-evidence.sha256"
        seal_path.write_text(
            f"{EVALUATOR._sha256_file(evidence_path)}  score-evidence.json\n",
            encoding="utf-8",
        )
        seal_path.chmod(0o600)

        with self.assertRaisesRegex(
            EVALUATOR.EvaluationError,
            "deterministic recomputation: summary.json",
        ):
            EVALUATOR.verify_score_evidence(
                output,
                run_root=run_root,
                answers_path=answers,
            )

    def test_one_passing_domain_makes_prospective_score_promotion_eligible(
        self,
    ) -> None:
        records = [
            question(
                "partial-pass-case",
                prompt="Which option applies to the passing domain case?",
                domain="passing_domain",
            ),
            question(
                "partial-fail-case",
                prompt="Which option applies to the failing domain case?",
                domain="failing_domain",
            ),
        ]
        run_root = self.freeze(
            records,
            name="partial-promotion-run",
            minimum_domain_items=1,
            minimum_scenario_families=1,
            required_retest_items=1,
        )

        def invoke(**kwargs: object) -> str:
            prompt = str(kwargs["prompt"])
            choiceprint_condition = "03-DECISION-CASES.md" in prompt
            selected = (
                "a"
                if choiceprint_condition and "failing domain case" not in prompt
                else "b"
            )
            return json.dumps({"selected_option_id": selected})

        self.assertEqual(EVALUATOR.run_evaluation(run_root, invoke=invoke), 10)
        EVALUATOR.finalize_evaluation(run_root)
        first_answered_at = datetime.fromisoformat(
            self.time_after_freeze(run_root)
        )
        answers = self.root / "partial-promotion-answers.jsonl"
        write_jsonl(
            answers,
            [
                {
                    "schema_version": 1,
                    "case_id": record["case_id"],
                    "selected_option_id": "a",
                    "answered_at": first_answered_at.isoformat(),
                    "retest_selected_option_id": "a",
                    "retest_answered_at": (
                        first_answered_at + timedelta(days=8)
                    ).isoformat(),
                }
                for record in records
            ],
        )
        output = self.root / "partial-promotion-score"
        summary = EVALUATOR.score_evaluation(
            run_root=run_root,
            answers_path=answers,
            output_path=output,
        )
        evidence = EVALUATOR.verify_score_evidence(
            output,
            run_root=run_root,
            answers_path=answers,
        )

        self.assertFalse(summary["all_domain_pilot_gates_met"])
        self.assertTrue(
            summary["pilot_gate_by_domain"]["passing_domain"]["pilot_gate_met"]
        )
        self.assertFalse(
            summary["pilot_gate_by_domain"]["failing_domain"]["pilot_gate_met"]
        )
        self.assertTrue(evidence["promotion_eligible"])

    def test_unfinalized_run_cannot_produce_score_evidence(self) -> None:
        run_root = self.freeze(name="unfinalized-score-run")
        self.run_all(run_root, finalize=False)
        answers = self.root / "unfinalized-score-answers.jsonl"
        write_jsonl(
            answers,
            [
                {
                    "schema_version": 1,
                    "case_id": "holdout-001",
                    "selected_option_id": "a",
                    "answered_at": self.time_after_freeze(run_root),
                }
            ],
        )
        output = self.root / "unfinalized-score-output"

        with self.assertRaisesRegex(
            EVALUATOR.EvaluationError,
            "predictions must be finalized before human answers are scored",
        ):
            EVALUATOR.score_evaluation(
                run_root=run_root,
                answers_path=answers,
                output_path=output,
            )

        self.assertFalse(output.exists())

    @unittest.skipIf(os.name == "nt", "POSIX permission bits are unavailable")
    def test_score_rejects_group_readable_answer_file(self) -> None:
        run_root = self.freeze(name="permission-run")
        self.run_all(run_root)
        answers = self.root / "group-readable-answers.jsonl"
        write_jsonl(
            answers,
            [
                {
                    "schema_version": 1,
                    "case_id": "holdout-001",
                    "selected_option_id": "a",
                    "answered_at": self.time_after_freeze(run_root),
                }
            ],
            mode=0o644,
        )

        with self.assertRaisesRegex(
            EVALUATOR.EvaluationError,
            "must not be accessible by group or other users",
        ):
            EVALUATOR.score_evaluation(
                run_root=run_root,
                answers_path=answers,
                output_path=self.root / "permission-score",
            )

    def test_score_rejects_nonretrospective_answer_that_predates_freeze(self) -> None:
        run_root = self.freeze(name="predating-answer-run")
        self.run_all(run_root)
        answers = self.root / "predating-answers.jsonl"
        write_jsonl(
            answers,
            [
                {
                    "schema_version": 1,
                    "case_id": "holdout-001",
                    "selected_option_id": "a",
                    "answered_at": "2000-01-01T00:00:00+00:00",
                }
            ],
        )

        with self.assertRaisesRegex(
            EVALUATOR.EvaluationError,
            "non-retrospective answer predates prediction finalization",
        ):
            EVALUATOR.score_evaluation(
                run_root=run_root,
                answers_path=answers,
                output_path=self.root / "predating-score",
            )

    def test_score_rejects_retest_outside_seven_to_fourteen_days(self) -> None:
        run_root = self.freeze(name="bad-retest-run")
        self.run_all(run_root)
        answered_at = datetime.fromisoformat(self.time_after_freeze(run_root))
        answers = self.root / "bad-retest-answers.jsonl"
        write_jsonl(
            answers,
            [
                {
                    "schema_version": 1,
                    "case_id": "holdout-001",
                    "selected_option_id": "a",
                    "answered_at": answered_at.isoformat(),
                    "retest_selected_option_id": "a",
                    "retest_answered_at": (
                        answered_at + timedelta(days=15)
                    ).isoformat(),
                }
            ],
        )

        with self.assertRaisesRegex(
            EVALUATOR.EvaluationError,
            "retest must be completed 7-14 days after the first answer",
        ):
            EVALUATOR.score_evaluation(
                run_root=run_root,
                answers_path=answers,
                output_path=self.root / "bad-retest-score",
            )

    def test_score_rejects_answers_and_output_inside_frozen_run(self) -> None:
        run_root = self.freeze(name="separation-run")
        self.run_all(run_root)
        answer_record = {
            "schema_version": 1,
            "case_id": "holdout-001",
            "selected_option_id": "a",
            "answered_at": self.time_after_freeze(run_root),
        }
        inside_answers = run_root / "answers.jsonl"
        write_jsonl(inside_answers, [answer_record])
        outside_answers = self.root / "separation-answers.jsonl"
        write_jsonl(outside_answers, [answer_record])

        with self.assertRaisesRegex(
            EVALUATOR.EvaluationError,
            "answers must be stored outside the frozen run directory",
        ):
            EVALUATOR.score_evaluation(
                run_root=run_root,
                answers_path=inside_answers,
                output_path=self.root / "separation-score-one",
            )

        with self.assertRaisesRegex(
            EVALUATOR.EvaluationError,
            "score output must be stored outside the frozen run directory",
        ):
            EVALUATOR.score_evaluation(
                run_root=run_root,
                answers_path=outside_answers,
                output_path=run_root / "score",
            )

    def test_score_rejects_prediction_context_and_prompt_hash_tampering(self) -> None:
        for field, expected_message in (
            ("context_sha256", "prediction context hash mismatch"),
            ("prompt_sha256", "prediction prompt hash mismatch"),
        ):
            with self.subTest(field=field):
                run_root = self.freeze(name=f"tampered-{field}-run")
                self.run_all(run_root, finalize=False)
                prediction_path = run_root / "predictions" / "predictions.jsonl"
                predictions = EVALUATOR._read_jsonl(prediction_path)
                predictions[0][field] = "0" * 64
                write_jsonl(prediction_path, predictions)

                with self.assertRaisesRegex(
                    EVALUATOR.EvaluationError, expected_message
                ):
                    EVALUATOR.finalize_evaluation(run_root)

    def test_score_rejects_tampered_allowed_prediction_selection(self) -> None:
        run_root = self.freeze(name="tampered-selection-run")
        self.run_all(run_root, selected="a", finalize=False)
        prediction_path = run_root / "predictions" / "predictions.jsonl"
        predictions = EVALUATOR._read_jsonl(prediction_path)
        predictions[0]["selected_option_id"] = "b"
        write_jsonl(prediction_path, predictions)

        with self.assertRaisesRegex(
            EVALUATOR.EvaluationError,
            "selected_option_id disagrees with raw_response",
        ):
            EVALUATOR.finalize_evaluation(run_root)

    def test_score_rejects_prediction_file_change_after_finalization(self) -> None:
        run_root = self.freeze(name="post-finalization-tamper-run")
        self.run_all(run_root)
        prediction_path = run_root / "predictions" / "predictions.jsonl"
        with prediction_path.open("a", encoding="utf-8") as handle:
            handle.write("\n")
        answers = self.root / "post-finalization-tamper-answers.jsonl"
        write_jsonl(
            answers,
            [
                {
                    "schema_version": 1,
                    "case_id": "holdout-001",
                    "selected_option_id": "a",
                    "answered_at": self.time_after_freeze(run_root),
                }
            ],
        )

        with self.assertRaisesRegex(
            EVALUATOR.EvaluationError,
            "predictions changed after finalization",
        ):
            EVALUATOR.score_evaluation(
                run_root=run_root,
                answers_path=answers,
                output_path=self.root / "post-finalization-tamper-score",
            )

    def test_score_joins_answers_offline_and_computes_expected_metrics(self) -> None:
        records = [
            question(
                "holdout-001",
                prompt="For case one, which option would the person choose?",
            ),
            question(
                "holdout-001",
                variant_id="paraphrase-1",
                prompt="Restated case one: what would the person select?",
            ),
            question(
                "holdout-002",
                prompt="For case two, which option would the person choose?",
                family="social_planning",
            ),
        ]
        run_root = self.freeze(
            records,
            samples=2,
            name="scored-run",
            minimum_delta_ci95_lower_bound=0.05,
        )
        answers = self.root / "human-answers.jsonl"
        first_answered_at = datetime.fromisoformat(
            self.time_after_freeze(run_root)
        )
        retest_answered_at = first_answered_at + timedelta(days=8)
        write_jsonl(
            answers,
            [
                {
                    "schema_version": 1,
                    "case_id": "holdout-001",
                    "selected_option_id": "a",
                    "answered_at": first_answered_at.isoformat(),
                    "retest_selected_option_id": "a",
                    "retest_answered_at": retest_answered_at.isoformat(),
                },
                {
                    "schema_version": 1,
                    "case_id": "holdout-002",
                    "selected_option_id": "b",
                    "answered_at": first_answered_at.isoformat(),
                    "retest_selected_option_id": "a",
                    "retest_answered_at": retest_answered_at.isoformat(),
                },
            ],
        )

        def invoke(**kwargs: object) -> str:
            prompt = str(kwargs["prompt"])
            if EVALUATOR.GENERIC_PROMPT_POLICY in prompt:
                selected = "c"
            else:
                self.assertIn(EVALUATOR.PERSONALIZED_PROMPT_POLICY, prompt)
                if "03-DECISION-CASES.md" in prompt:
                    selected = "b" if "case two" in prompt else "a"
                elif "PROJECT-INSTRUCTIONS.md" in prompt:
                    selected = "a"
                elif "The person prefers planning and calm settings." in prompt:
                    selected = "a"
                else:
                    selected = "b"
            return json.dumps({"selected_option_id": selected})

        self.assertEqual(EVALUATOR.run_evaluation(run_root, invoke=invoke), 30)
        EVALUATOR.finalize_evaluation(run_root)
        output = self.root / "score-output"
        summary = EVALUATOR.score_evaluation(
            run_root=run_root,
            answers_path=answers,
            output_path=output,
        )

        conditions = summary["conditions"]
        self.assertEqual(conditions["generic"]["coverage"], 1.0)
        self.assertEqual(conditions["generic"]["selective_accuracy"], 0.0)
        self.assertEqual(conditions["narrative"]["case_mean_accuracy"], 0.5)
        self.assertEqual(
            conditions["narrative"]["sample_accuracy_abstention_wrong"], 0.5
        )
        self.assertEqual(conditions["narrative"]["prediction_count"], 4)
        self.assertEqual(conditions["choiceprint"]["case_mean_accuracy"], 1.0)
        self.assertEqual(conditions["choiceprint"]["modal_accuracy"], 1.0)
        self.assertEqual(
            summary["paired_differences"]["choiceprint_minus_generic"][
                "case_mean_accuracy_delta"
            ],
            1.0,
        )
        self.assertEqual(
            summary["human_retest"]["human_retest_agreement"], 0.5
        )
        pilot_gate = summary["pilot_gate_by_domain"]["everyday_choices"]
        self.assertFalse(pilot_gate["pilot_gate_met"])
        self.assertFalse(pilot_gate["criteria"]["minimum_independent_cases"])
        self.assertTrue(pilot_gate["criteria"]["minimum_choiceprint_accuracy"])
        self.assertTrue(
            pilot_gate["criteria"]["minimum_delta_over_strongest_baseline"]
        )
        self.assertEqual(
            pilot_gate["choiceprint_delta_over_strongest_baseline_ci95"],
            [0.0, 1.0],
        )
        self.assertFalse(
            pilot_gate["criteria"]["minimum_delta_ci95_lower_bound"]
        )
        self.assertEqual(
            pilot_gate["thresholds"]["minimum_delta_ci95_lower_bound"],
            0.05,
        )
        self.assertFalse(summary["all_domain_pilot_gates_met"])
        self.assertFalse(summary["validated_domains_updated"])
        self.assertEqual(
            len(EVALUATOR._read_jsonl(output / "items.jsonl")), 2
        )
        report = (output / "report.md").read_text(encoding="utf-8")
        self.assertIn(
            "| generic | 0.000 | [0.000, 0.000] | 1.000 | 0.000 |",
            report,
        )
        self.assertIn("| narrative | 0.500 | [0.000, 1.000] |", report)
        self.assertIn("| choiceprint | 1.000 | [1.000, 1.000] |", report)
        self.assertIn("## Paired Choiceprint differences", report)
        self.assertIn("## Human retest", report)
        self.assertIn("## Pre-registered pilot gates", report)


if __name__ == "__main__":
    unittest.main()
