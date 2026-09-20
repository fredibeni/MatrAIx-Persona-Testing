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

import yaml


SCRIPTS_DIRECTORY = Path(__file__).resolve().parents[1] / "scripts"


def load_module(name: str, filename: str):
    path = SCRIPTS_DIRECTORY / filename
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot import {name} from {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


COMPILER = load_module("build_choiceprint_for_claim_review", "build_choiceprint.py")
REVIEW = load_module("review_choiceprint_claims", "review_choiceprint_claims.py")
VALIDATOR = load_module(
    "validate_twin_pack_for_claim_review", "validate_twin_pack.py"
)


def write_yaml(path: Path, value: object) -> None:
    path.write_text(yaml.safe_dump(value, sort_keys=False), encoding="utf-8")
    path.chmod(0o600)


def read_jsonl(path: Path) -> list[dict[str, object]]:
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]


def persona_fixture() -> dict[str, object]:
    return {
        "persona_id": "review-person",
        "version": "1.0",
        "display_name": "Review Person",
        "dimensions": {
            "accuracy": "High",
            "novelty": "Moderate",
            "tempo": "Measured",
            "private_fact": "sensitive-literal-never-runtime",
        },
        "meta": {
            "schema_version": "1.0",
            "survey": {"saved_at": "2026-09-01T10:00:00Z"},
        },
        "evidenced": [
            {
                "id": "accuracy",
                "label": "Accuracy preference",
                "value": "High",
                "selected_confidence": "stated",
                "selected_from": "chatgpt",
                "evidence_chatgpt": "Asked for verification.",
                "sensitive": False,
                "runtime_included": True,
            },
            {
                "id": "tempo",
                "label": "Working tempo",
                "value": "Measured",
                "selected_confidence": "stated",
                "selected_from": "chatgpt",
                "evidence_chatgpt": "Asked for careful work.",
                "sensitive": False,
                "runtime_included": True,
            },
        ],
        "best_guess": [
            {
                "id": "novelty",
                "label": "Novelty preference",
                "value": "Moderate",
                "selected_confidence": "best_guess",
                "selected_from": "chatgpt",
                "evidence_chatgpt": "Weak inference.",
                "sensitive": False,
                "runtime_included": True,
            }
        ],
        "sensitive_evidenced": [
            {
                "id": "private_fact",
                "label": "Private fact",
                "value": "sensitive-literal-never-runtime",
                "selected_confidence": "stated",
                "selected_from": "chatgpt",
                "evidence_chatgpt": "Sensitive evidence.",
                "sensitive": True,
                "runtime_included": False,
            }
        ],
        "sensitive_best_guess": [],
    }


def curation_fixture() -> dict[str, object]:
    return {
        "content_version": "1.0.0",
        "profile": {
            "summary": "Review fixture.",
            "runtime_included": False,
            "sensitivity": "private",
            "source_refs": [],
        },
        "sources": [],
        "decision_cases": [],
        "decision_policies": [],
        "counterexamples": [],
        "conflicts": [],
        "current_state": {},
        "consent": {
            "owner_authorized": False,
            "authorized_at": None,
            "allowed_sources": [],
            "allowed_modes": [],
            "allowed_uses": ["predict likely choices"],
            "prohibited_uses": ["claim literal identity"],
            "publication_requires_fresh_approval": True,
        },
        "boundaries": {"ask_before": ["send any external message"]},
        "coverage": {"status": "development_only", "validated_domains": []},
    }


class ClaimReviewWorkflowTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name).resolve()
        self.root.chmod(0o700)
        self.persona = self.root / "persona.yaml"
        self.curation = self.root / "curation.yaml"
        self.pack = self.root / "person.choiceprint"
        self.review = self.root / "claim-review.yaml"
        write_yaml(self.persona, persona_fixture())
        write_yaml(self.curation, curation_fixture())
        COMPILER.build_choiceprint(
            self.persona, self.pack, curation_path=self.curation
        )

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def prepare(self) -> dict[str, object]:
        REVIEW.prepare_review(self.pack, self.review)
        return yaml.safe_load(self.review.read_text(encoding="utf-8"))

    def interactive(
        self,
        answers: list[str],
        output: Path,
        *,
        input_path: Path | None = None,
        max_claims: int | None = None,
        now_fn=None,
    ):
        prompts: list[str] = []
        supplied = iter(answers)

        def input_fn(prompt: str) -> str:
            prompts.append(prompt)
            return next(supplied)

        result = REVIEW.interactive_review(
            self.pack,
            input_path or self.review,
            output,
            max_claims=max_claims,
            input_fn=input_fn,
            output_fn=lambda _message: None,
            now_fn=now_fn,
        )
        return result, prompts

    def complete_review(self) -> dict[str, object]:
        value = self.prepare()
        value["reviewed_at"] = "2026-09-18"
        choices = {
            "clm_dimension_accuracy": (
                "confirm",
                ["product decisions"],
                ["material accuracy risk"],
            ),
            "clm_dimension_novelty": ("dispute", [], []),
            "clm_dimension_tempo": ("unconfirmed", [], []),
            "clm_dimension_private_fact": ("confirm", ["private context"], []),
        }
        for row in value["claims"]:
            decision, domains, conditions = choices[row["claim_id"]]
            row["decision"] = decision
            row["domains"] = domains
            row["conditions"] = conditions
        write_yaml(self.review, value)
        return value

    @unittest.skipUnless(os.name == "posix", "POSIX modes are required")
    def test_prepare_is_private_bound_pending_and_never_overwrites(self) -> None:
        value = self.prepare()

        self.assertEqual(stat.S_IMODE(self.review.stat().st_mode), 0o600)
        self.assertEqual(stat.S_IMODE(self.review.parent.stat().st_mode), 0o700)
        self.assertEqual(value["review_format"], REVIEW.REVIEW_FORMAT)
        self.assertEqual(value["pack_binding"]["persona_id"], "review-person")
        self.assertEqual(value["pack_binding"]["claim_count"], 4)
        self.assertEqual(len(value["pack_binding"]["claims_sha256"]), 64)
        self.assertTrue(
            all(row["decision"] == "pending" for row in value["claims"])
        )
        with self.assertRaisesRegex(ValueError, "refusing to replace"):
            REVIEW.prepare_review(self.pack, self.review)

    def test_apply_is_deterministic_and_rebuilds_only_explicit_decisions(self) -> None:
        self.complete_review()
        first = self.root / "reviewed-one.yaml"
        second = self.root / "reviewed-two.yaml"
        REVIEW.apply_review(self.pack, self.review, self.curation, first)
        REVIEW.apply_review(self.pack, self.review, self.curation, second)

        self.assertEqual(first.read_bytes(), second.read_bytes())
        applied = yaml.safe_load(first.read_text(encoding="utf-8"))["claim_reviews"]
        self.assertEqual(applied["format"], REVIEW.APPLIED_REVIEW_FORMAT)
        self.assertEqual(len(applied["decisions"]), 4)
        self.assertEqual(len(applied["review_sha256"]), 64)

        rebuilt = self.root / "reviewed.choiceprint"
        COMPILER.build_choiceprint(self.persona, rebuilt, curation_path=first)
        claims = {
            claim["id"]: claim
            for claim in read_jsonl(rebuilt / "profile/claims.jsonl")
        }
        accuracy = claims["clm_dimension_accuracy"]
        self.assertIs(accuracy["user_confirmed"], True)
        self.assertEqual(accuracy["status"], "active")
        self.assertEqual(accuracy["scope"]["domains"], ["product decisions"])
        self.assertEqual(accuracy["owner_review"]["decision"], "confirm")

        novelty = claims["clm_dimension_novelty"]
        self.assertEqual(novelty["status"], "disputed")
        self.assertIs(novelty["runtime_included"], False)
        tempo = claims["clm_dimension_tempo"]
        self.assertEqual(tempo["status"], "withheld")
        self.assertIs(tempo["needs_review"], True)
        self.assertIs(tempo["runtime_included"], False)

        sensitive = claims["clm_dimension_private_fact"]
        self.assertIs(sensitive["user_confirmed"], True)
        self.assertEqual(sensitive["status"], "withheld")
        self.assertIs(sensitive["runtime_included"], False)

        legacy = yaml.safe_load(
            (rebuilt / "profile/legacy-dimensions.yaml").read_text(encoding="utf-8")
        )
        self.assertEqual(legacy["dimensions"], {"accuracy": "High"})
        validation = VALIDATOR.validate_bundle(rebuilt)
        self.assertTrue(validation.ok, validation.errors)

    @unittest.skipUnless(os.name == "posix", "POSIX modes are required")
    def test_interactive_resumes_pending_only_and_writes_private_partial_batch(
        self,
    ) -> None:
        progress = self.prepare()
        decided_before = progress["claims"][0].copy()
        decided_before["decision"] = "dispute"
        decided_before["domains"] = ["existing domain"]
        decided_before["conditions"] = ["existing condition"]
        decided_before["notes"] = "Existing owner note."
        progress["claims"][0] = decided_before
        write_yaml(self.review, progress)
        input_bytes = self.review.read_bytes()
        output = self.root / "partial-review.yaml"

        def unexpected_now():
            self.fail("partial review must not create a reviewed_at timestamp")

        result, prompts = self.interactive(
            ["confirm", "withhold"],
            output,
            max_claims=2,
            now_fn=unexpected_now,
        )

        saved = yaml.safe_load(output.read_text(encoding="utf-8"))
        self.assertEqual(saved, result)
        self.assertEqual(stat.S_IMODE(output.stat().st_mode), 0o600)
        self.assertEqual(self.review.read_bytes(), input_bytes)
        self.assertEqual(result["claims"][0], decided_before)
        self.assertEqual(
            [row["decision"] for row in result["claims"]],
            ["dispute", "confirm", "withhold", "pending"],
        )
        self.assertIsNone(result["reviewed_at"])
        self.assertEqual(len(prompts), 2)

    def test_interactive_completes_review_and_sets_current_utc_timestamp(self) -> None:
        self.prepare()
        output = self.root / "completed-review.yaml"
        instant = datetime(
            2026,
            9,
            19,
            12,
            34,
            56,
            tzinfo=timezone(timedelta(hours=1)),
        )

        result, prompts = self.interactive(
            ["CONFIRM ", "dispute", "withhold", "unconfirmed"],
            output,
            now_fn=lambda: instant,
        )

        self.assertEqual(
            [row["decision"] for row in result["claims"]],
            ["confirm", "dispute", "withhold", "unconfirmed"],
        )
        self.assertEqual(result["reviewed_at"], "2026-09-19T11:34:56Z")
        self.assertEqual(len(prompts), 4)

    def test_interactive_cancel_preserves_input_and_writes_nothing(self) -> None:
        self.prepare()
        input_bytes = self.review.read_bytes()
        output = self.root / "cancelled-review.yaml"

        with self.assertRaises(REVIEW.ReviewCancelled):
            self.interactive(["cancel"], output)

        self.assertFalse(output.exists())
        self.assertEqual(self.review.read_bytes(), input_bytes)

    def test_interactive_rejects_stale_or_changed_review_before_prompting(self) -> None:
        base = self.prepare()
        cases: list[tuple[str, dict[str, object], str]] = []

        stale = yaml.safe_load(yaml.safe_dump(base))
        stale["pack_binding"]["claims_sha256"] = "0" * 64
        cases.append(("stale", stale, "stale review"))

        changed = yaml.safe_load(yaml.safe_dump(base))
        changed["claims"][0]["label"] = "Changed snapshot"
        cases.append(("snapshot", changed, "snapshot.*changed"))

        prematurely_complete = yaml.safe_load(yaml.safe_dump(base))
        prematurely_complete["reviewed_at"] = "2026-09-18"
        cases.append(
            (
                "premature-timestamp",
                prematurely_complete,
                "reviewed_at must remain null",
            )
        )

        for name, value, message in cases:
            with self.subTest(name=name):
                review = self.root / f"{name}-review.yaml"
                output = self.root / f"{name}-output.yaml"
                write_yaml(review, value)

                def fail_prompt(_prompt: str) -> str:
                    self.fail("invalid inputs must be rejected before prompting")

                with self.assertRaisesRegex(ValueError, message):
                    REVIEW.interactive_review(
                        self.pack,
                        review,
                        output,
                        input_fn=fail_prompt,
                        output_fn=lambda _message: None,
                    )
                self.assertFalse(output.exists())

    @unittest.skipUnless(os.name == "posix", "POSIX modes are required")
    def test_interactive_requires_private_input_and_never_overwrites_output(
        self,
    ) -> None:
        self.prepare()

        def fail_prompt(_prompt: str) -> str:
            self.fail("unsafe paths must be rejected before prompting")

        self.review.chmod(0o644)
        with self.assertRaisesRegex(ValueError, "mode 0600"):
            REVIEW.interactive_review(
                self.pack,
                self.review,
                self.root / "unsafe-output.yaml",
                input_fn=fail_prompt,
                output_fn=lambda _message: None,
            )
        self.review.chmod(0o600)

        output = self.root / "existing-output.yaml"
        output.write_text("do not replace\n", encoding="utf-8")
        output.chmod(0o600)
        original = output.read_bytes()
        with self.assertRaisesRegex(ValueError, "refusing to replace"):
            REVIEW.interactive_review(
                self.pack,
                self.review,
                output,
                input_fn=fail_prompt,
                output_fn=lambda _message: None,
            )
        self.assertEqual(output.read_bytes(), original)

    def test_interactive_rejects_non_positive_max_claims(self) -> None:
        self.prepare()
        for value in (0, -1, True):
            with self.subTest(value=value):
                with self.assertRaisesRegex(ValueError, "positive integer"):
                    REVIEW.interactive_review(
                        self.pack,
                        self.review,
                        self.root / f"invalid-max-{value}.yaml",
                        max_claims=value,
                        input_fn=lambda _prompt: self.fail(
                            "invalid max_claims must be rejected before prompting"
                        ),
                        output_fn=lambda _message: None,
                    )

    def test_interactive_refuses_already_completed_review(self) -> None:
        completed = self.complete_review()
        input_bytes = self.review.read_bytes()
        output = self.root / "unnecessary-copy.yaml"

        with self.assertRaisesRegex(ValueError, "already complete"):
            REVIEW.interactive_review(
                self.pack,
                self.review,
                output,
                input_fn=lambda _prompt: self.fail(
                    "completed review must not prompt"
                ),
                output_fn=lambda _message: None,
            )

        self.assertIsNotNone(completed["reviewed_at"])
        self.assertEqual(self.review.read_bytes(), input_bytes)
        self.assertFalse(output.exists())

    def test_apply_rejects_pending_stale_unknown_duplicate_and_unsupported(self) -> None:
        base = self.prepare()
        cases: list[tuple[str, dict[str, object], str]] = []

        pending = yaml.safe_load(yaml.safe_dump(base))
        pending["reviewed_at"] = "2026-09-18"
        cases.append(("pending", pending, "pending decision"))

        stale = yaml.safe_load(yaml.safe_dump(base))
        stale["reviewed_at"] = "2026-09-18"
        stale["pack_binding"]["claims_sha256"] = "0" * 64
        for row in stale["claims"]:
            row["decision"] = "withhold"
        cases.append(("stale", stale, "stale review"))

        unknown = yaml.safe_load(yaml.safe_dump(base))
        unknown["reviewed_at"] = "2026-09-18"
        for row in unknown["claims"]:
            row["decision"] = "withhold"
        unknown["claims"][0]["claim_id"] = "clm_unknown"
        cases.append(("unknown", unknown, "unknown reviewed claim ID"))

        duplicate = yaml.safe_load(yaml.safe_dump(base))
        duplicate["reviewed_at"] = "2026-09-18"
        for row in duplicate["claims"]:
            row["decision"] = "withhold"
        duplicate["claims"][1]["claim_id"] = duplicate["claims"][0]["claim_id"]
        cases.append(("duplicate", duplicate, "duplicate reviewed claim ID"))

        unsupported = yaml.safe_load(yaml.safe_dump(base))
        unsupported["reviewed_at"] = "2026-09-18"
        for row in unsupported["claims"]:
            row["decision"] = "withhold"
        unsupported["claims"][0]["decision"] = "trust-me"
        cases.append(("unsupported", unsupported, "unsupported decision"))

        for name, value, message in cases:
            with self.subTest(name=name):
                review = self.root / f"{name}.yaml"
                output = self.root / f"{name}-output.yaml"
                write_yaml(review, value)
                with self.assertRaisesRegex(ValueError, message):
                    REVIEW.apply_review(
                        self.pack, review, self.curation, output
                    )
                self.assertFalse(output.exists())

    def test_apply_refuses_output_overwrite_and_existing_review_by_default(self) -> None:
        self.complete_review()
        first = self.root / "reviewed.yaml"
        REVIEW.apply_review(self.pack, self.review, self.curation, first)
        original = first.read_bytes()

        with self.assertRaisesRegex(ValueError, "refusing to replace"):
            REVIEW.apply_review(self.pack, self.review, self.curation, first)
        self.assertEqual(first.read_bytes(), original)

        with self.assertRaisesRegex(ValueError, "already contains claim_reviews"):
            REVIEW.apply_review(
                self.pack,
                self.review,
                first,
                self.root / "replacement.yaml",
            )

    def test_builder_rejects_review_after_source_claim_changes(self) -> None:
        self.complete_review()
        reviewed_curation = self.root / "reviewed.yaml"
        REVIEW.apply_review(
            self.pack, self.review, self.curation, reviewed_curation
        )
        changed = persona_fixture()
        changed["evidenced"][0]["value"] = "Changed"
        changed["dimensions"]["accuracy"] = "Changed"
        changed_persona = self.root / "changed-persona.yaml"
        write_yaml(changed_persona, changed)

        with self.assertRaisesRegex(ValueError, "source snapshot is stale"):
            COMPILER.build_choiceprint(
                changed_persona,
                self.root / "stale.choiceprint",
                curation_path=reviewed_curation,
            )


if __name__ == "__main__":
    unittest.main()
