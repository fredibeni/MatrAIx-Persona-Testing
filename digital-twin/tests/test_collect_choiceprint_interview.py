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


SCRIPT_PATH = (
    Path(__file__).resolve().parents[1]
    / "scripts"
    / "collect_choiceprint_interview.py"
)
SPEC = importlib.util.spec_from_file_location(
    "collect_choiceprint_interview", SCRIPT_PATH
)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"cannot import interview collector from {SCRIPT_PATH}")
COLLECTOR = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = COLLECTOR
SPEC.loader.exec_module(COLLECTOR)


def fixture_bank() -> dict[str, object]:
    return {
        "format": COLLECTOR.BANK_FORMAT,
        "bank_id": "fictional-interview-fixture",
        "version": "1.0.0",
        "description": "Fictional choices used only to test the local collector.",
        "questions": [
            {
                "id": "planning-fiction-001",
                "domain": "personal_planning",
                "family": "free_time_structure",
                "prompt": "A fictional free afternoon appears. What would you do?",
                "context": {
                    "stakes": "low",
                    "reversibility": "high",
                    "time_horizon": "one_day",
                    "social_context": "individual",
                },
                "options": [
                    {"id": "alpha", "label": "Make a short plan"},
                    {"id": "beta", "label": "Choose an activity immediately"},
                    {"id": "gamma", "label": "Keep the time unstructured"},
                ],
            },
            {
                "id": "purchase-fiction-001",
                "domain": "everyday_purchases",
                "family": "research_depth",
                "prompt": "A fictional household item is needed. What would you do?",
                "context": {
                    "stakes": "low",
                    "reversibility": "medium",
                    "time_horizon": "one_week",
                    "social_context": "individual",
                },
                "options": [
                    {"id": "alpha", "label": "Buy the familiar option"},
                    {"id": "beta", "label": "Compare a short list"},
                    {"id": "gamma", "label": "Research the category broadly"},
                ],
            },
        ],
    }


class SequenceClock:
    def __init__(self, count: int) -> None:
        start = datetime(2026, 9, 19, 9, 0, tzinfo=timezone.utc)
        self.values = iter(start + timedelta(minutes=index) for index in range(count))

    def __call__(self) -> datetime:
        return next(self.values)


class CollectChoiceprintInterviewTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name).resolve()
        self.root.chmod(0o700)
        self.bank_path = self.root / "fixture-bank.json"
        self.bank_path.write_text(
            json.dumps(fixture_bank(), indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        self.output = self.root / "private" / "responses.json"

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def collect(self) -> dict[str, object]:
        supplied = iter(
            [
                "beta",
                "It preserves flexibility while starting promptly.",
                "When rest is overdue; when a friend has already made a plan",
                "Available energy matters.",
                "yes",
                "A similar free afternoon was enjoyable.",
                "beta",
                "A short comparison is proportionate to the decision.",
                "none",
                "none",
                "no",
            ]
        )
        return COLLECTOR.collect_interview(
            self.bank_path,
            self.output,
            input_fn=lambda _prompt: next(supplied),
            output_fn=lambda _message: None,
            now_fn=SequenceClock(4),
            session_id_fn=lambda: "session-fictional-fixture",
        )

    def test_bundled_bank_spans_distinct_domains_and_families(self) -> None:
        bank, digest = COLLECTOR.load_question_bank(COLLECTOR.DEFAULT_BANK)
        questions = bank["questions"]
        domains: dict[str, set[str]] = {}
        for question in questions:
            domains.setdefault(question["domain"], set()).add(question["family"])
            self.assertIn(question["context"]["stakes"], {"low", "medium"})
            self.assertGreaterEqual(len(question["options"]), 3)
            self.assertLessEqual(len(question["options"]), 5)

        self.assertEqual(len(questions), 12)
        self.assertEqual(len(domains), 6)
        self.assertTrue(all(len(families) == 2 for families in domains.values()))
        self.assertRegex(digest, r"^[0-9a-f]{64}$")

    @unittest.skipUnless(os.name == "posix", "POSIX modes are required")
    def test_collects_complete_private_hash_bound_candidate_artifact(self) -> None:
        bank_before = self.bank_path.read_bytes()
        artifact = self.collect()

        self.assertEqual(self.bank_path.read_bytes(), bank_before)
        self.assertEqual(stat.S_IMODE(self.output.parent.stat().st_mode), 0o700)
        self.assertEqual(stat.S_IMODE(self.output.stat().st_mode), 0o600)
        self.assertEqual(artifact["status"], "candidate_only")
        self.assertEqual(artifact["response_count"], 2)
        self.assertEqual(
            artifact["promotion"],
            {"performed": False, "review_required": True},
        )
        self.assertEqual(
            artifact["collector"],
            {
                "version": COLLECTOR.COLLECTOR_VERSION,
                "model_calls": False,
                "network_calls": False,
            },
        )
        self.assertEqual(
            artifact["question_bank"]["sha256"],
            COLLECTOR._sha256(bank_before),
        )

        first = artifact["responses"][0]
        self.assertEqual(first["selected_option"]["id"], "beta")
        self.assertEqual(
            [option["id"] for option in first["rejected_options"]],
            ["alpha", "gamma"],
        )
        self.assertEqual(
            first["rationale"],
            "It preserves flexibility while starting promptly.",
        )
        self.assertEqual(
            first["exceptions"],
            [
                "When rest is overdue",
                "when a friend has already made a plan",
            ],
        )
        self.assertEqual(first["context_note"], "Available energy matters.")
        self.assertEqual(
            first["outcome"],
            {
                "known": True,
                "description": "A similar free afternoon was enjoyable.",
            },
        )
        self.assertEqual(first["answered_at"], "2026-09-19T09:01:00Z")
        self.assertEqual(first["evidence_type"], "direct_self_report")

        second = artifact["responses"][1]
        self.assertEqual(second["exceptions"], [])
        self.assertIsNone(second["context_note"])
        self.assertEqual(second["outcome"], {"known": False, "description": None})
        self.assertEqual(
            COLLECTOR.verify_interview_artifact(self.output, self.bank_path),
            artifact,
        )

    def test_cancel_and_interrupt_leave_no_file_or_output_directory(self) -> None:
        failures = {
            "word": iter(["beta", "cancel"]),
            "eof": iter([EOFError()]),
            "interrupt": iter([KeyboardInterrupt()]),
        }
        for label, supplied in failures.items():
            with self.subTest(label=label):
                output = self.root / label / "responses.json"

                def input_fn(_prompt: str) -> str:
                    value = next(supplied)
                    if isinstance(value, BaseException):
                        raise value
                    return value

                with self.assertRaises(COLLECTOR.InterviewCancelled):
                    COLLECTOR.collect_interview(
                        self.bank_path,
                        output,
                        input_fn=input_fn,
                        output_fn=lambda _message: None,
                        now_fn=SequenceClock(1),
                        session_id_fn=lambda: "session-cancel-fixture",
                    )
                self.assertFalse(os.path.lexists(output))
                self.assertFalse(output.parent.exists())

    @unittest.skipUnless(os.name == "posix", "POSIX modes and symlinks are required")
    def test_refuses_overwrite_symlinks_and_public_output_modes_before_prompting(self) -> None:
        prompt = lambda _message: self.fail("unsafe output prompted for answers")

        existing = self.root / "existing.json"
        existing.write_text("keep me\n", encoding="utf-8")
        existing.chmod(0o600)
        with self.assertRaisesRegex(COLLECTOR.InterviewError, "already exists"):
            COLLECTOR.collect_interview(
                self.bank_path,
                existing,
                input_fn=prompt,
            )
        self.assertEqual(existing.read_text(encoding="utf-8"), "keep me\n")

        dangling = self.root / "dangling.json"
        dangling.symlink_to(self.root / "missing-target.json")
        with self.assertRaisesRegex(COLLECTOR.InterviewError, "already exists"):
            COLLECTOR.collect_interview(
                self.bank_path,
                dangling,
                input_fn=prompt,
            )

        public = self.root / "public"
        public.mkdir(mode=0o755)
        public.chmod(0o755)
        with self.assertRaisesRegex(COLLECTOR.InterviewError, "mode 0700"):
            COLLECTOR.collect_interview(
                self.bank_path,
                public / "responses.json",
                input_fn=prompt,
            )

        private = self.root / "real-private"
        private.mkdir(mode=0o700)
        alias = self.root / "private-alias"
        alias.symlink_to(private, target_is_directory=True)
        with self.assertRaisesRegex(COLLECTOR.InterviewError, "symlink"):
            COLLECTOR.collect_interview(
                self.bank_path,
                alias / "responses.json",
                input_fn=prompt,
            )

        bank_alias = self.root / "bank-alias.json"
        bank_alias.symlink_to(self.bank_path)
        with self.assertRaisesRegex(COLLECTOR.InterviewError, "regular file"):
            COLLECTOR.load_question_bank(bank_alias)

    @unittest.skipUnless(os.name == "posix", "POSIX modes are required")
    def test_verifier_rejects_public_mode_and_tampering(self) -> None:
        self.collect()
        self.output.chmod(0o644)
        with self.assertRaisesRegex(COLLECTOR.InterviewError, "mode 0600"):
            COLLECTOR.verify_interview_artifact(self.output, self.bank_path)

        self.output.chmod(0o600)
        artifact = json.loads(self.output.read_text(encoding="utf-8"))
        artifact["responses"][0]["rationale"] = "Tampered rationale"
        self.output.write_text(
            json.dumps(artifact, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        self.output.chmod(0o600)
        with self.assertRaisesRegex(COLLECTOR.InterviewError, "digest"):
            COLLECTOR.verify_interview_artifact(self.output, self.bank_path)

    def test_strict_bank_parser_rejects_duplicate_and_unsupported_fields(self) -> None:
        duplicate = self.root / "duplicate.json"
        duplicate.write_text(
            '{"format":"one","format":"two"}\n', encoding="utf-8"
        )
        with self.assertRaisesRegex(COLLECTOR.InterviewError, "duplicate JSON key"):
            COLLECTOR.load_question_bank(duplicate)

        unsupported = fixture_bank()
        unsupported["unexpected"] = True
        self.bank_path.write_text(json.dumps(unsupported), encoding="utf-8")
        with self.assertRaisesRegex(COLLECTOR.InterviewError, "unsupported fields"):
            COLLECTOR.load_question_bank(self.bank_path)


if __name__ == "__main__":
    unittest.main()
