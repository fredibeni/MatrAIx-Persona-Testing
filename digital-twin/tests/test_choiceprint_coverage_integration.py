from __future__ import annotations

import hashlib
import importlib.util
import io
import json
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from datetime import datetime, timedelta
from pathlib import Path
from unittest import mock

import yaml


REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPTS_DIRECTORY = REPO_ROOT / "digital-twin" / "scripts"


def load_module(name: str, filename: str):
    path = SCRIPTS_DIRECTORY / filename
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot import {name} from {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


COMPILER = load_module(
    "choiceprint_coverage_integration_compiler", "build_choiceprint.py"
)
EVALUATOR = load_module(
    "choiceprint_coverage_integration_evaluator", "evaluate_choiceprint.py"
)
REVIEWER = load_module(
    "choiceprint_coverage_integration_reviewer", "review_choiceprint_coverage.py"
)
VALIDATOR = load_module(
    "choiceprint_coverage_integration_validator", "validate_twin_pack.py"
)
RETRIEVER = load_module(
    "choiceprint_coverage_integration_retriever",
    "retrieve_choiceprint_context.py",
)


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    path.chmod(0o600)


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


def write_yaml(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        yaml.safe_dump(value, sort_keys=False, allow_unicode=True),
        encoding="utf-8",
    )
    path.chmod(0o600)


def pack_snapshot(root: Path) -> dict[str, bytes]:
    return {
        path.relative_to(root).as_posix(): path.read_bytes()
        for path in sorted(root.rglob("*"))
        if path.is_file()
    }


def pack_text(root: Path) -> str:
    return "\n".join(
        path.read_text(encoding="utf-8")
        for path in sorted(root.rglob("*"))
        if path.is_file()
    )


class ChoiceprintCoverageIntegrationTests(unittest.TestCase):
    def test_integrity_bound_promotion_and_revocation_workflow(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory).resolve()
            root.chmod(0o700)
            persona_path = root / "persona.yaml"
            curation_path = root / "curation.yaml"
            source_pack = root / "source.choiceprint"
            write_yaml(
                persona_path,
                {
                    "persona_id": "coverage-integration-person",
                    "version": "1.0.0",
                    "display_name": "Coverage Integration Person",
                    "summary": "A careful fixture persona.",
                    "system_prompt": "Prefer checked, reversible choices.",
                    "dimensions": {"accuracy": "High"},
                    "meta": {
                        "schema_version": "1.0",
                        "survey": {"saved_at": "2026-01-02T00:00:00Z"},
                    },
                    "evidenced": [
                        {
                            "id": "accuracy",
                            "label": "Accuracy preference",
                            "category": "Decision style",
                            "value": "High",
                            "selected_confidence": "self_report",
                            "selected_from": "person",
                            "evidence_chatgpt": "The person asked for verification.",
                            "sensitive": False,
                            "runtime_included": True,
                        }
                    ],
                },
            )
            write_yaml(
                curation_path,
                {
                    "content_version": "1.0.0",
                    "profile": {
                        "summary": "A reviewed fixture profile.",
                        "runtime_included": True,
                        "sensitivity": "private",
                        "source_refs": ["src_dimension_accuracy"],
                        "known_gaps": ["Only a narrow product domain is evaluated."],
                    },
                    "consent": {
                        "owner_authorized": True,
                        "authorized_at": "2026-01-03T00:00:00Z",
                        "allowed_sources": ["src_dimension_accuracy"],
                        "allowed_modes": ["predict-choice"],
                        "allowed_uses": ["predict likely choices"],
                    },
                    "coverage": {
                        "status": "development_only",
                        "declared_domains": ["product"],
                        "validated_domains": [],
                    },
                },
            )
            COMPILER.build_choiceprint(
                persona_path,
                source_pack,
                curation_path=curation_path,
            )
            source_validation = VALIDATOR.validate_bundle(source_pack)
            self.assertTrue(source_validation.ok, source_validation.errors)
            source_before = pack_snapshot(source_pack)

            case_id = "private-coverage-case-7f91"
            prompt_marker = (
                "PRIVATE HOLDOUT PROMPT 7f91: choose the safer launch path."
            )
            correct_answer_id = "private-correct-answer-7f91"
            baseline_answer_id = "private-baseline-answer-7f91"
            distractor_answer_id = "private-distractor-answer-7f91"
            questions = [
                {
                    "schema_version": 1,
                    "case_id": case_id,
                    "variant_id": "canonical",
                    "domain": "product",
                    "family": "launch_planning",
                    "prompt": prompt_marker,
                    "options": [
                        {
                            "id": correct_answer_id,
                            "text": "Run the private reversible test 7f91",
                        },
                        {
                            "id": baseline_answer_id,
                            "text": "Launch the private permanent change 7f91",
                        },
                        {
                            "id": distractor_answer_id,
                            "text": "Defer the private decision indefinitely 7f91",
                        },
                    ],
                }
            ]
            questions_path = root / "private-questions.jsonl"
            write_jsonl(questions_path, questions)

            semantic_review = EVALUATOR._semantic_review_template(
                EVALUATOR._validate_questions(questions), source_pack
            )
            semantic_review["reviewed_at"] = "2026-09-19T00:00:00Z"
            semantic_review["checklist"] = {
                key: True for key in semantic_review["checklist"]
            }
            for case_review in semantic_review["case_reviews"]:
                case_review["decision"] = "approve"
            semantic_review_path = root / "private-semantic-review.json"
            write_json(semantic_review_path, semantic_review)

            narrative_path = root / "private-narrative.md"
            narrative_path.write_text(
                "This private fixture narrative favors checking before launch.\n",
                encoding="utf-8",
            )
            narrative_path.chmod(0o600)
            run_root = root / "frozen-run"
            with mock.patch.object(
                EVALUATOR,
                "_codex_runtime_fingerprint",
                return_value={
                    "codex_executable_path": "/test/codex",
                    "codex_executable_sha256": "0" * 64,
                    "codex_cli_version": "codex-integration-test",
                },
            ):
                EVALUATOR.freeze_evaluation(
                    questions_path=questions_path,
                    persona_path=persona_path,
                    narrative_path=narrative_path,
                    choiceprint_path=source_pack,
                    output_path=run_root,
                    model="test-model",
                    reasoning_effort="low",
                    samples=1,
                    seed=417,
                    timeout=30,
                    context_cutoff="2026-09-19T00:00:00Z",
                    retrospective=False,
                    semantic_review_path=semantic_review_path,
                    cloud_processing_consent=True,
                    max_context_chars=500_000,
                    bootstrap_iterations=200,
                    minimum_domain_items=1,
                    minimum_scenario_families=1,
                    required_retest_items=1,
                    minimum_choiceprint_accuracy=0.731,
                    minimum_choiceprint_coverage=0.8,
                    minimum_delta_over_strongest_baseline=0.173,
                    minimum_delta_ci95_lower_bound=0.173,
                    maximum_high_stability_wrong_rate=0.1,
                    minimum_human_retest_agreement=0.8,
                )

            def invoke(**arguments: object) -> str:
                prompt = str(arguments["prompt"])
                selected = (
                    correct_answer_id
                    if "03-DECISION-CASES.md" in prompt
                    else baseline_answer_id
                )
                return json.dumps({"selected_option_id": selected})

            self.assertEqual(
                EVALUATOR.run_evaluation(run_root, invoke=invoke),
                len(EVALUATOR.CONDITIONS),
            )
            finalization = EVALUATOR.finalize_evaluation(run_root)
            self.assertEqual(
                finalization["prediction_count"], len(EVALUATOR.CONDITIONS)
            )
            manifest = json.loads(
                (run_root / "run-manifest.json").read_text(encoding="utf-8")
            )
            answered_at = datetime.fromisoformat(manifest["frozen_at"]) + timedelta(
                days=1
            )
            answers_path = root / "private-answers.jsonl"
            write_jsonl(
                answers_path,
                [
                    {
                        "schema_version": 1,
                        "case_id": case_id,
                        "selected_option_id": correct_answer_id,
                        "answered_at": answered_at.isoformat(),
                        "retest_selected_option_id": correct_answer_id,
                        "retest_answered_at": (
                            answered_at + timedelta(days=8)
                        ).isoformat(),
                    }
                ],
            )
            score_root = root / "private-score"
            summary = EVALUATOR.score_evaluation(
                run_root=run_root,
                answers_path=answers_path,
                output_path=score_root,
            )
            evidence = EVALUATOR.verify_score_evidence(
                score_root,
                run_root=run_root,
                answers_path=answers_path,
            )
            self.assertTrue(evidence["promotion_eligible"])
            self.assertTrue(
                summary["pilot_gate_by_domain"]["product"]["pilot_gate_met"]
            )

            validation_pending = root / "reviews" / "validation-pending.json"
            validation_receipt = root / "reviews" / "validation-completed.json"
            REVIEWER.prepare_validation_review(
                pack=source_pack,
                run_root=run_root,
                answers_path=answers_path,
                score_output_path=score_root,
                output_path=validation_pending,
            )
            validation_reason = "private owner validation note 7f91"
            validation_replies = iter(["approve", validation_reason])
            with redirect_stdout(io.StringIO()):
                REVIEWER.interactive_review(
                    pack=source_pack,
                    input_path=validation_pending,
                    output_path=validation_receipt,
                    run_root=run_root,
                    answers_path=answers_path,
                    score_output_path=score_root,
                    input_fn=lambda _prompt: next(validation_replies),
                )
            validated_pack = root / "validated.choiceprint"
            self.assertEqual(
                REVIEWER.apply_review(
                    pack=source_pack,
                    review_path=validation_receipt,
                    output_pack=validated_pack,
                    run_root=run_root,
                    answers_path=answers_path,
                    score_output_path=score_root,
                ),
                ["product"],
            )
            validation_result = VALIDATOR.validate_bundle(validated_pack)
            self.assertTrue(validation_result.ok, validation_result.errors)
            validated_manifest = json.loads(
                (validated_pack / "manifest.json").read_text(encoding="utf-8")
            )
            validated_coverage = validated_manifest["coverage"]
            self.assertEqual(validated_coverage["validated_domains"], ["product"])
            self.assertEqual(len(validated_coverage["validation_events"]), 1)
            validation_event = validated_coverage["validation_events"][0]
            self.assertEqual(validation_event["action"], "validate")
            self.assertIsNone(validation_event["supersedes_event_id"])
            self.assertEqual(
                validation_event["source_build_metadata_sha256"],
                hashlib.sha256(
                    (source_pack / "build-metadata.json").read_bytes()
                ).hexdigest(),
            )

            scenario = {
                "domain": "product",
                "stakes": "medium",
                "summary": "Choose a reversible product launch path",
            }
            retrieved_validated = RETRIEVER.get_twin_context(
                validated_pack,
                mode="predict-choice",
                scenario=scenario,
                max_context_bytes=12_000,
            )
            self.assertEqual(
                retrieved_validated["context"]["coverage"]["validated_domains"],
                ["product"],
            )
            self.assertNotIn(
                "validation_events", retrieved_validated["context"]["coverage"]
            )
            self.assertFalse(
                any(
                    "requested domain 'product' is not recorded as validated"
                    in item
                    for item in retrieved_validated["unknowns"]
                )
            )

            validated_before_revocation = pack_snapshot(validated_pack)
            revocation_pending = root / "reviews" / "revocation-pending.json"
            revocation_receipt = root / "reviews" / "revocation-completed.json"
            REVIEWER.prepare_revocation_review(
                pack=validated_pack,
                domains=["product"],
                output_path=revocation_pending,
            )
            revocation_reason = "private owner revocation detail 7f91"
            revocation_replies = iter(
                [
                    "approve",
                    revocation_reason,
                    "evidence_no_longer_reliable",
                ]
            )
            with redirect_stdout(io.StringIO()):
                REVIEWER.interactive_review(
                    pack=validated_pack,
                    input_path=revocation_pending,
                    output_path=revocation_receipt,
                    input_fn=lambda _prompt: next(revocation_replies),
                )
            revoked_pack = root / "revoked.choiceprint"
            self.assertEqual(
                REVIEWER.apply_review(
                    pack=validated_pack,
                    review_path=revocation_receipt,
                    output_pack=revoked_pack,
                ),
                ["product"],
            )
            revocation_result = VALIDATOR.validate_bundle(revoked_pack)
            self.assertTrue(revocation_result.ok, revocation_result.errors)
            revoked_manifest = json.loads(
                (revoked_pack / "manifest.json").read_text(encoding="utf-8")
            )
            revoked_coverage = revoked_manifest["coverage"]
            self.assertEqual(revoked_coverage["validated_domains"], [])
            self.assertEqual(len(revoked_coverage["validation_events"]), 2)
            revocation_event = revoked_coverage["validation_events"][1]
            self.assertEqual(revocation_event["action"], "revoke")
            self.assertEqual(
                revocation_event["supersedes_event_id"],
                validation_event["event_id"],
            )
            self.assertNotEqual(
                revocation_event["event_id"], validation_event["event_id"]
            )
            self.assertEqual(
                revocation_event["reason_code"],
                "evidence_no_longer_reliable",
            )
            retrieved_revoked = RETRIEVER.get_twin_context(
                revoked_pack,
                mode="predict-choice",
                scenario=scenario,
                max_context_bytes=12_000,
            )
            self.assertEqual(
                retrieved_revoked["context"]["coverage"]["validated_domains"],
                [],
            )
            self.assertTrue(
                any(
                    "requested domain 'product' is not recorded as validated"
                    in item
                    for item in retrieved_revoked["unknowns"]
                )
            )

            self.assertEqual(pack_snapshot(source_pack), source_before)
            self.assertEqual(pack_snapshot(validated_pack), validated_before_revocation)
            private_markers = (
                prompt_marker,
                correct_answer_id,
                baseline_answer_id,
                distractor_answer_id,
                case_id,
                validation_reason,
                revocation_reason,
                manifest["run_id"],
                "0.731",
                "0.173",
                "choiceprint_case_mean_accuracy",
                "pilot_gate_met",
                "review_context",
                "choiceprint_incorrect_case_ids",
            )
            for release_pack in (validated_pack, revoked_pack):
                released_text = pack_text(release_pack)
                for marker in private_markers:
                    self.assertNotIn(marker, released_text)


if __name__ == "__main__":
    unittest.main()
