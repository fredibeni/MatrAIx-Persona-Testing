from __future__ import annotations

import hashlib
import importlib.util
import json
import os
import stat
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock


SCRIPT_PATH = (
    Path(__file__).resolve().parents[1]
    / "scripts"
    / "review_choiceprint_coverage.py"
)
SPEC = importlib.util.spec_from_file_location(
    "review_choiceprint_coverage", SCRIPT_PATH
)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"cannot import coverage reviewer from {SCRIPT_PATH}")
REVIEWER = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = REVIEWER
SPEC.loader.exec_module(REVIEWER)


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
        "".join(json.dumps(record, sort_keys=True) + "\n" for record in records),
        encoding="utf-8",
    )
    path.chmod(0o600)


class CoverageReviewTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name).resolve()
        self.root.chmod(0o700)
        self.pack = self.root / "person.choiceprint"
        self.pack.mkdir(mode=0o700)
        self.manifest = {
            "bundle_format": "choiceprint/0.1",
            "schema_version": "0.1",
            "persona_id": "person",
            "content_version": "1.0.0",
            "coverage": {
                "status": "development_only",
                "declared_domains": ["everyday_choices", "work_choices"],
                "validated_domains": [],
                "validation_events": [],
            },
        }
        self.metadata = {
            "persona_id": "person",
            "built_at": "2026-09-19T00:00:00Z",
            "file_sha256": {},
        }
        write_json(self.pack / "manifest.json", self.manifest)
        write_json(self.pack / "build-metadata.json", self.metadata)
        self.run = self.root / "run"
        self.run.mkdir(mode=0o700)
        self.answers = self.root / "answers.jsonl"
        self.answers.write_text("{}\n", encoding="utf-8")
        self.answers.chmod(0o600)
        self.score = self.root / "score"
        self.score.mkdir(mode=0o700)
        self.private_marker = "private-question-answer-marker"
        self.summary = {
            "schema_version": 1,
            "run_id": "eval-0123456789abcdef",
            "validated_domains_updated": False,
            "pilot_gate_by_domain": {
                "everyday_choices": {
                    "pilot_gate_met": True,
                    "case_count": 30,
                    "scenario_family_count": 6,
                    "retest_case_count": 15,
                    "choiceprint_case_mean_accuracy": 0.82,
                },
                "work_choices": {
                    "pilot_gate_met": False,
                    "case_count": 30,
                    "scenario_family_count": 6,
                    "retest_case_count": 15,
                },
            },
        }
        write_json(self.score / "summary.json", self.summary)
        write_jsonl(
            self.score / "items.jsonl",
            [
                {
                    "case_id": "case-private-1",
                    "domain": "everyday_choices",
                    "human_answer": self.private_marker,
                    "conditions": {
                        "choiceprint": {
                            "modal_correct": False,
                            "coverage": 1.0,
                        }
                    },
                },
                {
                    "case_id": "case-private-2",
                    "domain": "work_choices",
                    "human_answer": "private-work-answer",
                    "conditions": {
                        "choiceprint": {
                            "modal_correct": True,
                            "coverage": 1.0,
                        }
                    },
                },
            ],
        )
        write_json(self.score / "score-evidence.json", {"sealed": True})
        self.evidence = {
            "run_id": self.summary["run_id"],
            "promotion_eligible": True,
            "choiceprint_build_metadata_sha256": self.digest(
                self.pack / "build-metadata.json"
            ),
            "run_manifest_sha256": "1" * 64,
            "prediction_finalization_sha256": "2" * 64,
        }

    def tearDown(self) -> None:
        self.temporary.cleanup()

    @staticmethod
    def digest(path: Path) -> str:
        return hashlib.sha256(path.read_bytes()).hexdigest()

    def fake_loader(self, _module_name: str, filename: str):
        if filename == "evaluate_choiceprint.py":
            return SimpleNamespace(
                verify_score_evidence=lambda **_kwargs: dict(self.evidence)
            )
        if filename == "validate_twin_pack.py":
            return SimpleNamespace(
                validate_bundle=lambda _pack: SimpleNamespace(ok=True, errors=[])
            )
        raise AssertionError(f"unexpected module load: {filename}")

    def prepare(self, name: str = "pending.json") -> Path:
        output = self.root / name
        with mock.patch.object(REVIEWER, "_load_script_module", self.fake_loader):
            REVIEWER.prepare_validation_review(
                pack=self.pack,
                run_root=self.run,
                answers_path=self.answers,
                score_output_path=self.score,
                output_path=output,
                prepared_at="2026-09-19T10:00:00Z",
            )
        return output

    def complete(self, pending: Path, name: str = "completed.json") -> Path:
        output = self.root / name
        replies = iter(["approve", "reviewed failures and uncertainty"])
        with mock.patch.object(REVIEWER, "_load_script_module", self.fake_loader):
            REVIEWER.interactive_review(
                pack=self.pack,
                input_path=pending,
                output_path=output,
                run_root=self.run,
                answers_path=self.answers,
                score_output_path=self.score,
                input_fn=lambda _prompt: next(replies),
                reviewed_at="2026-09-19T10:30:00Z",
            )
        return output

    def test_prepare_includes_only_gate_passing_domains_and_is_private(self) -> None:
        pending = self.prepare()
        document = json.loads(pending.read_text(encoding="utf-8"))

        self.assertEqual(
            [row["domain"] for row in document["domains"]],
            ["everyday_choices"],
        )
        self.assertEqual(
            document["domains"][0]["review_context"][
                "choiceprint_incorrect_case_ids"
            ],
            ["case-private-1"],
        )
        if os.name == "posix":
            self.assertEqual(stat.S_IMODE(pending.stat().st_mode), 0o600)

    def test_prepare_rejects_domain_injection_and_undeclared_domains(self) -> None:
        for index, domain in enumerate(("unsafe\n# heading", "undeclared_domain")):
            self.summary["pilot_gate_by_domain"] = {
                domain: {
                    "pilot_gate_met": True,
                    "case_count": 30,
                    "scenario_family_count": 6,
                    "retest_case_count": 15,
                }
            }
            self.summary_path = self.score / "summary.json"
            write_json(self.summary_path, self.summary)
            self.score.joinpath("items.jsonl").write_text(
                json.dumps(
                    {
                        "case_id": f"case-{index}",
                        "domain": domain,
                        "conditions": {
                            "choiceprint": {
                                "modal_correct": True,
                                "coverage": 1.0,
                            }
                        },
                    }
                )
                + "\n",
                encoding="utf-8",
            )
            self.score.joinpath("items.jsonl").chmod(0o600)
            with (
                mock.patch.object(REVIEWER, "_load_script_module", self.fake_loader),
                self.assertRaises(REVIEWER.CoverageReviewError),
            ):
                REVIEWER.prepare_validation_review(
                    pack=self.pack,
                    run_root=self.run,
                    answers_path=self.answers,
                    score_output_path=self.score,
                    output_path=self.root / f"unsafe-{index}.json",
                )

    def test_private_review_paths_reject_repository_and_pack_locations(self) -> None:
        repository_output = SCRIPT_PATH.parent / "must-not-write-review.json"
        with self.assertRaisesRegex(
            REVIEWER.CoverageReviewError, "outside the repository"
        ):
            REVIEWER._assert_private_review_path(
                repository_output, may_not_exist=True
            )
        pack_output = self.root / "unsafe.choiceprint" / "review.json"
        with self.assertRaisesRegex(
            REVIEWER.CoverageReviewError, "inside a Choiceprint pack"
        ):
            REVIEWER._assert_private_review_path(
                pack_output, may_not_exist=True
            )

    def test_cancel_and_eof_do_not_publish_completed_receipt(self) -> None:
        pending = self.prepare()
        for index, input_fn in enumerate(
            (lambda _prompt: "cancel", lambda _prompt: (_ for _ in ()).throw(EOFError()))
        ):
            output = self.root / f"cancelled-{index}.json"
            with (
                mock.patch.object(REVIEWER, "_load_script_module", self.fake_loader),
                self.assertRaises(REVIEWER.ReviewCancelled),
            ):
                REVIEWER.interactive_review(
                    pack=self.pack,
                    input_path=pending,
                    output_path=output,
                    run_root=self.run,
                    answers_path=self.answers,
                    score_output_path=self.score,
                    input_fn=input_fn,
                )
            self.assertFalse(output.exists())

    def test_forged_reviewer_is_rejected(self) -> None:
        completed = self.complete(self.prepare())
        document = json.loads(completed.read_text(encoding="utf-8"))
        document["reviewer"] = "not-the-owner"
        forged = self.root / "forged.json"
        write_json(forged, document)
        with self.assertRaisesRegex(REVIEWER.CoverageReviewError, "owner"):
            REVIEWER._load_review(forged, require_complete=True)

    def test_interactive_rejects_tampered_failure_context(self) -> None:
        pending = self.prepare()
        document = json.loads(pending.read_text(encoding="utf-8"))
        document["domains"][0]["review_context"][
            "choiceprint_incorrect_case_ids"
        ] = []
        tampered = self.root / "tampered-pending.json"
        write_json(tampered, document)
        with (
            mock.patch.object(REVIEWER, "_load_script_module", self.fake_loader),
            self.assertRaisesRegex(
                REVIEWER.CoverageReviewError,
                "does not match integrity-bound score evidence",
            ),
        ):
            REVIEWER.interactive_review(
                pack=self.pack,
                input_path=tampered,
                output_path=self.root / "must-not-exist.json",
                run_root=self.run,
                answers_path=self.answers,
                score_output_path=self.score,
                input_fn=lambda _prompt: "approve",
            )

    def test_stale_pack_binding_is_rejected(self) -> None:
        pending = self.prepare()
        self.metadata["built_at"] = "2026-09-19T11:00:00Z"
        write_json(self.pack / "build-metadata.json", self.metadata)
        with (
            mock.patch.object(REVIEWER, "_load_script_module", self.fake_loader),
            self.assertRaisesRegex(REVIEWER.CoverageReviewError, "does not match"),
        ):
            REVIEWER.interactive_review(
                pack=self.pack,
                input_path=pending,
                output_path=self.root / "stale.json",
                run_root=self.run,
                answers_path=self.answers,
                score_output_path=self.score,
                input_fn=lambda _prompt: "cancel",
            )

    def test_apply_releases_only_sanitized_event_and_preserves_source(self) -> None:
        pending = self.prepare()
        completed = self.complete(pending)
        source_bytes = {
            path.relative_to(self.pack).as_posix(): path.read_bytes()
            for path in self.pack.rglob("*")
            if path.is_file()
        }
        captured: dict[str, object] = {}

        def release_builder(source: Path, output: Path, events: list[dict[str, object]]):
            captured["source"] = source
            captured["events"] = events
            output.mkdir(mode=0o700)
            write_json(output / "events.json", events)

        def loader(_module_name: str, filename: str):
            if filename == "evaluate_choiceprint.py":
                return SimpleNamespace(
                    verify_score_evidence=lambda **_kwargs: dict(self.evidence)
                )
            if filename == "validate_twin_pack.py":
                return SimpleNamespace(
                    validate_bundle=lambda _pack: SimpleNamespace(ok=True, errors=[])
                )
            if filename == "build_choiceprint.py":
                return SimpleNamespace(build_coverage_release=release_builder)
            raise AssertionError(filename)

        output = self.root / "released.choiceprint"
        with mock.patch.object(REVIEWER, "_load_script_module", loader):
            selected = REVIEWER.apply_review(
                pack=self.pack,
                review_path=completed,
                output_pack=output,
                run_root=self.run,
                answers_path=self.answers,
                score_output_path=self.score,
                recorded_at="2026-09-19T11:00:00Z",
            )

        self.assertEqual(selected, ["everyday_choices"])
        event_text = json.dumps(captured["events"], sort_keys=True)
        self.assertNotIn(self.private_marker, event_text)
        self.assertNotIn("case-private", event_text)
        self.assertNotIn("case_mean_accuracy", event_text)
        self.assertEqual(
            set(captured["events"][0]),
            {
                "event_id",
                "domain",
                "action",
                "scope",
                "prepared_at",
                "reviewed_at",
                "recorded_at",
                "review_receipt_sha256",
                "source_build_metadata_sha256",
                "supersedes_event_id",
                "evaluation_evidence_sha256",
            },
        )
        self.assertEqual(
            source_bytes,
            {
                path.relative_to(self.pack).as_posix(): path.read_bytes()
                for path in self.pack.rglob("*")
                if path.is_file()
            },
        )

    def test_revocation_requires_reason_and_never_accepts_evaluation_data(self) -> None:
        self.manifest["coverage"] = {
            "status": "development_only",
            "declared_domains": ["everyday_choices", "work_choices"],
            "validated_domains": ["everyday_choices"],
            "validation_events": [
                {
                    "event_id": "coverage-prior",
                    "domain": "everyday_choices",
                    "action": "validate",
                }
            ],
        }
        write_json(self.pack / "manifest.json", self.manifest)
        pending = self.root / "revoke-pending.json"
        with mock.patch.object(REVIEWER, "_load_script_module", self.fake_loader):
            REVIEWER.prepare_revocation_review(
                pack=self.pack,
                domains=["everyday_choices"],
                output_path=pending,
                prepared_at="2026-09-19T10:00:00Z",
            )
        with (
            mock.patch.object(REVIEWER, "_load_script_module", self.fake_loader),
            self.assertRaisesRegex(REVIEWER.CoverageReviewError, "reason"),
        ):
            replies = iter(["approve", ""])
            REVIEWER.interactive_review(
                pack=self.pack,
                input_path=pending,
                output_path=self.root / "invalid-revoke.json",
                input_fn=lambda _prompt: next(replies),
            )

    def test_revocation_exports_only_closed_reason_code(self) -> None:
        self.manifest["coverage"] = {
            "status": "development_only",
            "declared_domains": ["everyday_choices", "work_choices"],
            "validated_domains": ["everyday_choices"],
            "validation_events": [
                {
                    "event_id": "coverage-prior",
                    "domain": "everyday_choices",
                    "action": "validate",
                    "recorded_at": "2026-09-19T09:00:00Z",
                }
            ],
        }
        write_json(self.pack / "manifest.json", self.manifest)
        pending = self.root / "revoke-pending-success.json"
        completed = self.root / "revoke-completed-success.json"
        private_note = "Private owner details must remain only in this receipt."
        with mock.patch.object(REVIEWER, "_load_script_module", self.fake_loader):
            REVIEWER.prepare_revocation_review(
                pack=self.pack,
                domains=["everyday_choices"],
                output_path=pending,
                prepared_at="2026-09-19T10:00:00Z",
            )
            replies = iter(
                ["approve", private_note, "evidence_no_longer_reliable"]
            )
            REVIEWER.interactive_review(
                pack=self.pack,
                input_path=pending,
                output_path=completed,
                input_fn=lambda _prompt: next(replies),
                reviewed_at="2026-09-19T10:30:00Z",
            )

        captured: dict[str, object] = {}

        def release_builder(source: Path, output: Path, events: list[dict[str, object]]):
            captured["events"] = events

        def loader(_module_name: str, filename: str):
            if filename == "validate_twin_pack.py":
                return SimpleNamespace(
                    validate_bundle=lambda _pack: SimpleNamespace(ok=True, errors=[])
                )
            if filename == "build_choiceprint.py":
                return SimpleNamespace(build_coverage_release=release_builder)
            raise AssertionError(filename)

        with mock.patch.object(REVIEWER, "_load_script_module", loader):
            REVIEWER.apply_review(
                pack=self.pack,
                review_path=completed,
                output_pack=self.root / "revoked.choiceprint",
                recorded_at="2026-09-19T11:00:00Z",
            )

        receipt_text = completed.read_text(encoding="utf-8")
        event_text = json.dumps(captured["events"], sort_keys=True)
        self.assertIn(private_note, receipt_text)
        self.assertNotIn(private_note, event_text)
        self.assertNotIn('"reason"', event_text)
        self.assertIn('"reason_code": "evidence_no_longer_reliable"', event_text)


if __name__ == "__main__":
    unittest.main()
