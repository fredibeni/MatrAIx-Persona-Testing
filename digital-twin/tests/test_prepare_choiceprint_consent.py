from __future__ import annotations

import copy
import importlib.util
import stat
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

import yaml


SCRIPT_PATH = (
    Path(__file__).resolve().parents[1]
    / "scripts"
    / "prepare_choiceprint_consent.py"
)
SPEC = importlib.util.spec_from_file_location(
    "prepare_choiceprint_consent", SCRIPT_PATH
)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"cannot import consent preparer from {SCRIPT_PATH}")
PREPARER = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = PREPARER
SPEC.loader.exec_module(PREPARER)

FIXTURE_PATH = (
    Path(__file__).resolve().parent
    / "fixtures"
    / "consent-curation.fictional.yaml"
)


class PrepareChoiceprintConsentTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory(
            prefix="choiceprint-consent-test-"
        )
        self.root = Path(self.temporary.name).resolve()
        self.root.chmod(0o700)
        self.curation = self.root / "curation.yaml"
        self.curation.write_bytes(FIXTURE_PATH.read_bytes())
        self.curation.chmod(0o600)
        self.original_bytes = self.curation.read_bytes()
        self.output = self.root / "authorized.yaml"

    def tearDown(self) -> None:
        self.temporary.cleanup()

    @staticmethod
    def fixed_time() -> datetime:
        return datetime(
            2026,
            9,
            19,
            14,
            15,
            16,
            tzinfo=timezone(timedelta(hours=2)),
        )

    def prepare(
        self,
        responses: list[str],
        *,
        output: Path | None = None,
        input_fn=None,
        now_fn=None,
    ):
        answers = iter(responses)
        displayed: list[str] = []
        result = PREPARER.prepare_consent(
            self.curation,
            output or self.output,
            input_fn=input_fn or (lambda _: next(answers)),
            output_fn=displayed.append,
            now_fn=now_fn or self.fixed_time,
        )
        return result, displayed

    def test_writes_new_private_file_with_exact_derived_permissions(self) -> None:
        result, displayed = self.prepare(
            [
                "yes",
                "no",
                "no",
                "yes",
                PREPARER.FINAL_CONFIRMATION_PHRASE,
            ]
        )

        self.assertEqual(self.curation.read_bytes(), self.original_bytes)
        self.assertEqual(stat.S_IMODE(self.output.stat().st_mode), 0o600)
        written = yaml.safe_load(self.output.read_text(encoding="utf-8"))
        self.assertEqual(written, result)
        self.assertIs(written["consent"]["owner_authorized"], True)
        self.assertEqual(
            written["consent"]["authorized_at"], "2026-09-19T12:15:16Z"
        )
        self.assertEqual(
            written["consent"]["allowed_sources"],
            ["src_fictional_interview"],
        )
        self.assertEqual(
            written["consent"]["allowed_modes"], ["write-in-style"]
        )
        self.assertEqual(
            written["consent"]["allowed_uses"],
            ["draft in documented communication style"],
        )

        original = yaml.safe_load(self.original_bytes)
        self.assertEqual(
            written["consent"]["prohibited_uses"],
            original["consent"]["prohibited_uses"],
        )
        self.assertEqual(written["boundaries"], original["boundaries"])
        self.assertEqual(
            written["fictional_extension"], original["fictional_extension"]
        )
        self.assertEqual(
            written["profile"]["communication_style"]["custom_detail"],
            "Keep this unknown legitimate profile field.",
        )
        self.assertEqual(
            written["sources"][0]["source_extension"],
            {"keep": "source metadata"},
        )
        self.assertEqual(
            written["consent"]["consent_extension"],
            {"keep": "consent metadata"},
        )

        screen = "\n".join(displayed)
        self.assertIn("Fictional answers from a reviewed local interview.", screen)
        self.assertIn("Fictional notes about communication preferences.", screen)
        self.assertIn("Sensitivity: private", screen)
        self.assertIn("Sensitivity: sensitive", screen)
        self.assertIn("Mode: predict-choice", screen)
        self.assertIn("Mode: write-in-style", screen)

    def test_requires_at_least_one_source_and_one_mode(self) -> None:
        scenarios = (
            (
                "source",
                ["no", "no", "yes", "no"],
                "at least one declared source",
            ),
            (
                "mode",
                ["yes", "no", "no", "no"],
                "at least one supported mode",
            ),
        )
        for label, responses, message in scenarios:
            candidate = self.root / f"{label}.yaml"
            with self.subTest(label=label):
                with self.assertRaisesRegex(
                    PREPARER.ConsentPreparationError, message
                ):
                    self.prepare(responses, output=candidate)
                self.assertFalse(candidate.exists())
                self.assertEqual(self.curation.read_bytes(), self.original_bytes)

    def test_refuses_selected_use_that_is_already_prohibited(self) -> None:
        document = yaml.safe_load(self.original_bytes)
        document["consent"]["prohibited_uses"].append(
            "PREDICT   likely choices."
        )
        self.curation.write_text(
            yaml.safe_dump(document, sort_keys=False), encoding="utf-8"
        )
        self.curation.chmod(0o600)

        with self.assertRaisesRegex(
            PREPARER.ConsentPreparationError,
            "conflict with preserved prohibited uses",
        ):
            self.prepare(["yes", "no", "yes", "no"])
        self.assertFalse(self.output.exists())

    def test_cancel_or_inexact_final_phrase_leaves_no_output_or_parent(self) -> None:
        scenarios = (
            ("source-cancel", ["cancel"]),
            (
                "final-cancel",
                ["yes", "no", "yes", "no", "cancel"],
            ),
            (
                "inexact",
                [
                    "yes",
                    "no",
                    "yes",
                    "no",
                    PREPARER.FINAL_CONFIRMATION_PHRASE + " ",
                ],
            ),
        )
        for label, responses in scenarios:
            parent = self.root / label / "nested"
            candidate = parent / "authorized.yaml"
            with self.subTest(label=label):
                with self.assertRaises(PREPARER.ConsentPreparationCancelled):
                    self.prepare(responses, output=candidate)
                self.assertFalse(candidate.exists())
                self.assertFalse(parent.exists())
                self.assertEqual(self.curation.read_bytes(), self.original_bytes)

    def test_refuses_placeholder_and_already_authorized_inputs_before_prompting(self) -> None:
        base = yaml.safe_load(self.original_bytes)
        scenarios: list[tuple[str, dict[str, object], str]] = []
        placeholder = copy.deepcopy(base)
        placeholder["profile"]["summary"] = (
            "No reviewed profile summary is available."
        )
        scenarios.append(("placeholder", placeholder, "placeholder profile"))
        authorized = copy.deepcopy(base)
        authorized["consent"]["owner_authorized"] = True
        authorized["consent"]["authorized_at"] = "2026-09-18T10:00:00Z"
        scenarios.append(("authorized", authorized, "already-authorized"))

        for label, document, message in scenarios:
            with self.subTest(label=label):
                self.curation.write_text(
                    yaml.safe_dump(document, sort_keys=False), encoding="utf-8"
                )
                self.curation.chmod(0o600)
                with self.assertRaisesRegex(
                    PREPARER.ConsentPreparationError, message
                ):
                    PREPARER.prepare_consent(
                        self.curation,
                        self.root / f"{label}.yaml",
                        input_fn=lambda _: self.fail(
                            "unsafe input prompted for authorization"
                        ),
                    )
                self.assertFalse((self.root / f"{label}.yaml").exists())

    def test_strict_yaml_rejects_duplicates_tags_and_invalid_source_shape(self) -> None:
        cases = (
            (
                "duplicate",
                "profile:\n  summary: Reviewed.\n  summary: Duplicate.\n",
                "duplicate YAML mapping key",
            ),
            (
                "tag",
                "profile: !!python/object:builtins.object {}\n",
                "cannot parse strict safe YAML",
            ),
            (
                "source",
                """profile:
  summary: Reviewed fictional profile.
sources:
  - id: source-one
    summary: Fictional source.
    sensitivity: secret
consent:
  owner_authorized: false
  authorized_at: null
  prohibited_uses: []
boundaries: {}
""",
                "sensitivity must be public, private, or sensitive",
            ),
        )
        for label, payload, message in cases:
            with self.subTest(label=label):
                self.curation.write_text(payload, encoding="utf-8")
                self.curation.chmod(0o600)
                with self.assertRaisesRegex(
                    PREPARER.ConsentPreparationError, message
                ):
                    PREPARER.prepare_consent(
                        self.curation,
                        self.root / f"{label}.yaml",
                        input_fn=lambda _: self.fail(
                            "invalid YAML prompted for authorization"
                        ),
                    )

    def test_refuses_nonprivate_input_and_existing_symlink_or_tracked_output(self) -> None:
        self.curation.chmod(0o644)
        with self.assertRaisesRegex(
            PREPARER.ConsentPreparationError, "group or other users"
        ):
            self.prepare([])
        self.curation.chmod(0o600)

        existing = self.root / "existing.yaml"
        existing.write_text("keep: true\n", encoding="utf-8")
        linked = self.root / "linked.yaml"
        linked.symlink_to(existing)
        for output in (existing, linked):
            with self.subTest(output=output):
                with self.assertRaisesRegex(
                    PREPARER.ConsentPreparationError,
                    "refusing to overwrite|symlinked private path",
                ):
                    self.prepare([], output=output)
        self.assertEqual(existing.read_text(encoding="utf-8"), "keep: true\n")

        tracked = (
            PREPARER.REPOSITORY_ROOT
            / "digital-twin/tests/fictional-consent-leak.yaml"
        )
        self.assertFalse(tracked.exists())
        with self.assertRaisesRegex(
            PREPARER.ConsentPreparationError, "tracked source control"
        ):
            self.prepare([], output=tracked)

        public = self.root / "public" / "authorized.yaml"
        with self.assertRaisesRegex(
            PREPARER.ConsentPreparationError, "public directory"
        ):
            self.prepare([], output=public)

    def test_detects_input_change_before_atomic_publish(self) -> None:
        responses = iter(
            [
                "yes",
                "no",
                "yes",
                "no",
                PREPARER.FINAL_CONFIRMATION_PHRASE,
            ]
        )

        def changing_input(_: str) -> str:
            response = next(responses)
            if response == PREPARER.FINAL_CONFIRMATION_PHRASE:
                changed = yaml.safe_load(self.curation.read_text(encoding="utf-8"))
                changed["profile"]["summary"] = "A changed fictional profile."
                self.curation.write_text(
                    yaml.safe_dump(changed, sort_keys=False), encoding="utf-8"
                )
                self.curation.chmod(0o600)
            return response

        with self.assertRaisesRegex(
            PREPARER.ConsentPreparationError, "changed during consent review"
        ):
            self.prepare([], input_fn=changing_input)
        self.assertFalse(self.output.exists())

    def test_naive_clock_and_eof_leave_no_output(self) -> None:
        with self.assertRaisesRegex(
            PREPARER.ConsentPreparationError, "must include a timezone"
        ):
            self.prepare(
                [
                    "yes",
                    "no",
                    "yes",
                    "no",
                    PREPARER.FINAL_CONFIRMATION_PHRASE,
                ],
                now_fn=lambda: datetime(2026, 9, 19, 12, 0, 0),
            )
        self.assertFalse(self.output.exists())

        with self.assertRaises(EOFError):
            PREPARER.prepare_consent(
                self.curation,
                self.output,
                input_fn=lambda _: (_ for _ in ()).throw(EOFError),
                output_fn=lambda _: None,
            )
        self.assertFalse(self.output.exists())


if __name__ == "__main__":
    unittest.main()
