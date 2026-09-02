"""Regression tests for deterministic persona compilation and validation."""

from __future__ import annotations

import json
import os
import stat
import tempfile
import unittest
from contextlib import redirect_stdout
from copy import deepcopy
from io import StringIO
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import yaml
import matraix.persona_builder as persona_builder

from matraix.persona_builder import (
    DEFAULT_SCHEMA_PATH,
    DEFAULT_SENSITIVITY_PATH,
    PersonaBuildError,
    SensitivityPolicy,
    build_blank_persona_template,
    build_persona_payload,
    compile_candidates,
    derive_sensitive_ids_from_survey,
    load_catalog,
    load_sensitivity_policy,
    main as persona_builder_main,
    migrate_persona,
    migrate_persona_data,
    validate_candidate_payload,
    validate_persona,
    validate_persona_data,
)


PERSONA_DIR = Path(__file__).resolve().parents[1]
SURVEY_PATH = PERSONA_DIR / "survey" / "survey-definition.json"
CANDIDATE_SCHEMA_PATH = PERSONA_DIR / "persona-candidates.schema.json"
CANDIDATE_EXAMPLE_PATH = PERSONA_DIR / "persona-candidates.example.json"
PERSONA_EXAMPLE_PATH = PERSONA_DIR / "persona.example.yaml"


def candidate_payload() -> dict:
    return {
        "schema_version": 1,
        "persona": {
            "persona_id": "test-persona",
            "display_name": "Test Persona",
            "version": "1.0",
        },
        "source_coverage": {
            "generated_at": "2026-09-01T00:00:00Z",
            "sources": [
                {
                    "id": "current-task",
                    "type": "current_task",
                    "description": "The explicit user request in the current task.",
                    "items_reviewed": 1,
                    "start_date": "2026-09-01",
                    "end_date": "2026-09-01",
                    "limitations": [],
                }
            ],
            "schema_categories_reviewed": ["*"],
            "limitations": ["No broader account history was assumed."],
        },
        "candidates": [
            {
                "id": "cog_verbosity",
                "value": "Concise",
                "confidence": "stated",
                "evidence": "The user explicitly requested concise responses.",
                "source_refs": ["current-task"],
                "as_of": "2026-09-01",
                "runtime_included": True,
            }
        ],
    }


class PersonaBuilderTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.catalog = load_catalog(DEFAULT_SCHEMA_PATH)
        cls.sensitivity = load_sensitivity_policy(
            DEFAULT_SENSITIVITY_PATH,
            catalog=cls.catalog,
        )

    def test_tracked_schema_and_examples_parse(self) -> None:
        candidate_schema = json.loads(CANDIDATE_SCHEMA_PATH.read_text(encoding="utf-8"))
        candidate_example = json.loads(CANDIDATE_EXAMPLE_PATH.read_text(encoding="utf-8"))
        self.assertEqual(candidate_schema["$schema"], "https://json-schema.org/draft/2020-12/schema")
        normalized = validate_candidate_payload(
            candidate_example,
            catalog=self.catalog,
            sensitivity=self.sensitivity,
        )
        self.assertEqual(normalized["candidates"][0]["id"], "cog_verbosity")
        report = validate_persona(
            PERSONA_EXAMPLE_PATH,
            require_private_mode=False,
            require_git_ignore=False,
        )
        self.assertEqual(report["runtime_dimensions"], 0)
        self.assertEqual(report["rendered_dimensions"], 0)

        template = yaml.safe_load(PERSONA_EXAMPLE_PATH.read_text(encoding="utf-8"))
        expected = build_blank_persona_template(
            catalog=self.catalog,
            sensitivity=self.sensitivity,
        )
        expected_ids = [row["id"] for row in self.catalog.rows]
        self.assertEqual(template, expected)
        self.assertEqual(list(template["dimensions"]), expected_ids)
        self.assertEqual(len(template["dimensions"]), 1290)
        self.assertTrue(all(value is None for value in template["dimensions"].values()))
        for block in ("evidenced", "best_guess", "sensitive_evidenced", "sensitive_best_guess", "unresolved"):
            self.assertEqual(template[block], [])

    def test_sensitive_policy_matches_sanitized_survey(self) -> None:
        policy = json.loads(DEFAULT_SENSITIVITY_PATH.read_text(encoding="utf-8"))
        derived = derive_sensitive_ids_from_survey(SURVEY_PATH)
        self.assertEqual(policy["dimension_count"], 234)
        self.assertEqual(policy["dimension_ids"], derived)
        self.assertEqual(
            policy["source_sha256"],
            __import__("hashlib").sha256(SURVEY_PATH.read_bytes()).hexdigest(),
        )

    def test_compile_is_deterministic_and_private(self) -> None:
        with tempfile.TemporaryDirectory(prefix="matraix-persona-builder-") as name:
            directory = Path(name)
            candidates_path = directory / "candidates.json"
            first_output = directory / "first.yaml"
            second_output = directory / "second.yaml"
            report_path = directory / "report.json"
            candidates_path.write_text(
                json.dumps(candidate_payload(), indent=2) + "\n",
                encoding="utf-8",
            )
            first_report = compile_candidates(
                candidates_path,
                first_output,
                report_path=report_path,
                enforce_private=False,
            )
            second_report = compile_candidates(
                candidates_path,
                second_output,
                enforce_private=False,
            )

            self.assertEqual(first_output.read_bytes(), second_output.read_bytes())
            self.assertEqual(first_report, second_report)
            self.assertEqual(first_report["runtime_dimensions"], 1)
            self.assertEqual(first_report["rendered_dimensions"], 1)
            for path in (candidates_path, first_output, second_output, report_path):
                self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o600)
            validated = validate_persona(
                first_output,
                require_private_mode=True,
                require_git_ignore=False,
            )
            self.assertTrue(validated["ok"])

    def test_invalid_enum_value_is_rejected(self) -> None:
        payload = candidate_payload()
        payload["candidates"][0]["value"] = "Brief"
        with self.assertRaisesRegex(PersonaBuildError, "Invalid value for cog_verbosity"):
            validate_candidate_payload(
                payload,
                catalog=self.catalog,
                sensitivity=self.sensitivity,
            )

    def test_unknown_candidate_must_be_null_and_excluded(self) -> None:
        payload = candidate_payload()
        candidate = payload["candidates"][0]
        candidate["confidence"] = "unknown"
        with self.assertRaisesRegex(PersonaBuildError, "must have a null value"):
            validate_candidate_payload(
                payload,
                catalog=self.catalog,
                sensitivity=self.sensitivity,
            )

        candidate["value"] = None
        candidate["runtime_included"] = False
        normalized = validate_candidate_payload(
            payload,
            catalog=self.catalog,
            sensitivity=self.sensitivity,
        )
        built = build_persona_payload(
            normalized,
            catalog=self.catalog,
            sensitivity=self.sensitivity,
        )
        self.assertEqual(built["dimensions"], {})
        self.assertEqual(built["unresolved"][0]["value_chatgpt"], None)

    def test_sensitive_history_candidate_must_be_withheld(self) -> None:
        payload = candidate_payload()
        payload["candidates"] = [
            {
                "id": "gender_identity",
                "value": "Man",
                "confidence": "stated",
                "evidence": "The user explicitly stated this identity.",
                "source_refs": ["current-task"],
                "runtime_included": True,
            }
        ]
        with self.assertRaisesRegex(PersonaBuildError, "withheld pending direct confirmation"):
            validate_candidate_payload(
                payload,
                catalog=self.catalog,
                sensitivity=self.sensitivity,
            )

        payload["candidates"][0]["runtime_included"] = False
        built = build_persona_payload(
            payload,
            catalog=self.catalog,
            sensitivity=self.sensitivity,
        )
        self.assertNotIn("gender_identity", built["dimensions"])
        self.assertEqual(built["sensitive_evidenced"][0]["id"], "gender_identity")
        self.assertFalse(built["sensitive_evidenced"][0]["runtime_included"])

    def test_migration_applies_policy_floor_without_losing_evidence(self) -> None:
        payload = candidate_payload()
        candidate = payload["candidates"][0]
        candidate.update(
            {
                "id": "urbanicity",
                "value": self.catalog.by_id["urbanicity"]["values"][0],
                "evidence": "The available source supported this location category.",
            }
        )
        legacy_policy = SensitivityPolicy(
            dimension_ids=frozenset(),
            sha256="legacy-policy",
            source="legacy-fixture",
        )
        legacy = build_persona_payload(
            payload,
            catalog=self.catalog,
            sensitivity=legacy_policy,
        )
        legacy["meta"]["survey"] = {
            "survey_id": "legacy-survey",
            "runtime_dimensions": 1,
        }
        original = deepcopy(legacy)
        original_row = deepcopy(legacy["evidenced"][0])

        migrated, report = migrate_persona_data(
            legacy,
            catalog=self.catalog,
            sensitivity=self.sensitivity,
        )

        self.assertEqual(legacy, original)
        self.assertTrue(report["changed"])
        self.assertEqual(report["sensitivity_flags_added"], 1)
        self.assertEqual(report["legacy_sensitivity_flags_retained"], 0)
        self.assertEqual(report["runtime_dimensions_withheld"], 1)
        self.assertEqual(report["evidence_records_preserved"], 1)
        self.assertNotIn("urbanicity", migrated["dimensions"])
        migrated_row = migrated["sensitive_evidenced"][0]
        self.assertTrue(migrated_row["sensitive"])
        self.assertFalse(migrated_row["runtime_included"])
        self.assertTrue(migrated_row["needs_review"])
        mutable_fields = {
            "sensitive",
            "runtime_included",
            "needs_review",
            "runtime_exclusion_reason",
        }
        self.assertEqual(
            {key: value for key, value in migrated_row.items() if key not in mutable_fields},
            {key: value for key, value in original_row.items() if key not in mutable_fields},
        )
        self.assertEqual(
            migrated["meta"]["sensitivity_policy_sha256"],
            self.sensitivity.sha256,
        )
        self.assertEqual(migrated["meta"]["runtime_dimensions"], 0)
        self.assertEqual(migrated["meta"]["survey"]["runtime_dimensions"], 0)
        self.assertTrue(report["validation"]["ok"])

        second, second_report = migrate_persona_data(
            migrated,
            catalog=self.catalog,
            sensitivity=self.sensitivity,
        )
        self.assertEqual(second, migrated)
        self.assertFalse(second_report["changed"])
        self.assertEqual(second_report["sensitivity_flags_added"], 0)
        self.assertEqual(second_report["runtime_dimensions_withheld"], 0)

    def test_migration_retains_legacy_sensitivity_as_a_privacy_floor(self) -> None:
        legacy = build_persona_payload(
            candidate_payload(),
            catalog=self.catalog,
            sensitivity=self.sensitivity,
        )
        self.assertNotIn("cog_verbosity", self.sensitivity.dimension_ids)
        row = legacy["evidenced"].pop()
        row["sensitive"] = True
        legacy["sensitive_evidenced"].append(row)

        migrated, report = migrate_persona_data(
            legacy,
            catalog=self.catalog,
            sensitivity=self.sensitivity,
        )

        migrated_row = migrated["sensitive_evidenced"][0]
        self.assertTrue(migrated_row["sensitive"])
        self.assertFalse(migrated_row["runtime_included"])
        self.assertNotIn("cog_verbosity", migrated["dimensions"])
        self.assertEqual(report["sensitivity_flags_added"], 0)
        self.assertEqual(report["legacy_sensitivity_flags_retained"], 1)
        self.assertEqual(report["runtime_dimensions_withheld"], 1)
        self.assertTrue(report["validation"]["ok"])

    def test_migration_keeps_directly_confirmed_sensitive_value_at_runtime(self) -> None:
        payload = candidate_payload()
        candidate = payload["candidates"][0]
        candidate.update(
            {
                "id": "urbanicity",
                "value": self.catalog.by_id["urbanicity"]["values"][0],
                "evidence": "The available source supported this location category.",
            }
        )
        legacy = build_persona_payload(
            payload,
            catalog=self.catalog,
            sensitivity=SensitivityPolicy(
                dimension_ids=frozenset(),
                sha256="legacy-policy",
                source="legacy-fixture",
            ),
        )
        row = legacy["evidenced"][0]
        row.update(
            {
                "value_survey": row["value"],
                "confidence_survey": "self_report",
                "evidence_survey": "Directly confirmed in the local survey.",
                "selected_from": "survey",
                "selected_confidence": "self_report",
            }
        )

        migrated, report = migrate_persona_data(
            legacy,
            catalog=self.catalog,
            sensitivity=self.sensitivity,
        )

        migrated_row = migrated["sensitive_evidenced"][0]
        self.assertTrue(migrated_row["sensitive"])
        self.assertTrue(migrated_row["runtime_included"])
        self.assertIn("urbanicity", migrated["dimensions"])
        self.assertEqual(report["runtime_dimensions_withheld"], 0)
        self.assertTrue(report["validation"]["ok"])

    def test_unknown_raw_candidate_is_retained_only_when_unselected(self) -> None:
        built = build_persona_payload(
            candidate_payload(),
            catalog=self.catalog,
            sensitivity=self.sensitivity,
        )
        row = built["evidenced"][0]
        row.update(
            {
                "confidence_chatgpt": "unknown",
                "value_claude": row["value"],
                "confidence_claude": "stated",
                "evidence_claude": "A separate retained source supplied this value.",
                "selected_from": "claude",
                "selected_confidence": "stated",
            }
        )
        report = validate_persona_data(
            built,
            catalog=self.catalog,
            sensitivity=self.sensitivity,
        )
        self.assertTrue(report["ok"])
        self.assertIsNotNone(row["value_chatgpt"])

        broken = deepcopy(built)
        broken_row = broken["evidenced"][0]
        broken_row["selected_from"] = "chatgpt"
        broken_row["selected_confidence"] = "unknown"
        with self.assertRaisesRegex(PersonaBuildError, "Selected ChatGPT candidate is unknown"):
            validate_persona_data(
                broken,
                catalog=self.catalog,
                sensitivity=self.sensitivity,
            )

    def test_raw_candidate_values_remain_strict_outside_legacy_unknown_case(self) -> None:
        built = build_persona_payload(
            candidate_payload(),
            catalog=self.catalog,
            sensitivity=self.sensitivity,
        )

        missing_chatgpt = deepcopy(built)
        missing_chatgpt["evidenced"][0]["value_chatgpt"] = None
        with self.assertRaisesRegex(PersonaBuildError, "Invalid ChatGPT value"):
            validate_persona_data(
                missing_chatgpt,
                catalog=self.catalog,
                sensitivity=self.sensitivity,
            )

        missing_other = deepcopy(built)
        missing_other_row = missing_other["evidenced"][0]
        missing_other_row["confidence_claude"] = "stated"
        missing_other_row["value_claude"] = None
        with self.assertRaisesRegex(PersonaBuildError, "Invalid other-source value"):
            validate_persona_data(
                missing_other,
                catalog=self.catalog,
                sensitivity=self.sensitivity,
            )

        invalid_unknown = deepcopy(built)
        invalid_unknown_row = invalid_unknown["evidenced"][0]
        invalid_unknown_row.update(
            {
                "confidence_chatgpt": "unknown",
                "value_chatgpt": "Not an allowed value",
                "value_claude": invalid_unknown_row["value"],
                "confidence_claude": "stated",
                "evidence_claude": "A separate retained source supplied this value.",
                "selected_from": "claude",
                "selected_confidence": "stated",
            }
        )
        with self.assertRaisesRegex(PersonaBuildError, "Invalid ChatGPT value"):
            validate_persona_data(
                invalid_unknown,
                catalog=self.catalog,
                sensitivity=self.sensitivity,
            )

    def test_file_migration_dry_run_cli_write_and_idempotence(self) -> None:
        payload = candidate_payload()
        payload["candidates"][0].update(
            {
                "id": "urbanicity",
                "value": self.catalog.by_id["urbanicity"]["values"][0],
                "evidence": "The available source supported this location category.",
            }
        )
        legacy = build_persona_payload(
            payload,
            catalog=self.catalog,
            sensitivity=SensitivityPolicy(
                dimension_ids=frozenset(),
                sha256="legacy-policy",
                source="legacy-fixture",
            ),
        )
        with tempfile.TemporaryDirectory(prefix="matraix-persona-migration-") as name:
            path = Path(name) / "persona.yaml"
            path.write_text(
                yaml.safe_dump(legacy, sort_keys=False, allow_unicode=False),
                encoding="utf-8",
            )
            os.chmod(path, 0o600)
            original_bytes = path.read_bytes()

            output = StringIO()
            with redirect_stdout(output):
                return_code = persona_builder_main(
                    [
                        "migrate",
                        "--persona",
                        str(path),
                        "--dry-run",
                        "--skip-private-checks",
                    ]
                )
            dry_run_report = json.loads(output.getvalue())
            self.assertEqual(return_code, 0)
            self.assertTrue(dry_run_report["dry_run"])
            self.assertFalse(dry_run_report["written"])
            self.assertTrue(dry_run_report["migration"]["changed"])
            self.assertNotIn("persona_id", dry_run_report)
            self.assertNotIn("display_name", dry_run_report)
            self.assertEqual(path.read_bytes(), original_bytes)

            written_report = migrate_persona(path, enforce_private=False)
            self.assertTrue(written_report["written"])
            self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o600)
            migrated_bytes = path.read_bytes()
            self.assertNotEqual(migrated_bytes, original_bytes)
            self.assertTrue(
                validate_persona(
                    path,
                    require_private_mode=True,
                    require_git_ignore=False,
                )["ok"]
            )

            second_report = migrate_persona(path, enforce_private=False)
            self.assertFalse(second_report["migration"]["changed"])
            self.assertFalse(second_report["written"])
            self.assertEqual(path.read_bytes(), migrated_bytes)

    def test_file_migration_rejects_symlink_and_unprotected_private_input(self) -> None:
        payload = build_persona_payload(
            candidate_payload(),
            catalog=self.catalog,
            sensitivity=self.sensitivity,
        )
        with tempfile.TemporaryDirectory(prefix="matraix-persona-symlink-") as name:
            directory = Path(name)
            target = directory / "persona.yaml"
            link = directory / "linked-persona.yaml"
            target.write_text(yaml.safe_dump(payload, sort_keys=False), encoding="utf-8")
            os.chmod(target, 0o600)
            link.symlink_to(target)
            with self.assertRaisesRegex(PersonaBuildError, "private symlink"):
                migrate_persona(link, dry_run=True, enforce_private=False)

        data_dir = PERSONA_DIR / "survey" / "data"
        with tempfile.TemporaryDirectory(
            prefix=".persona-private-mode-",
            dir=data_dir,
        ) as name:
            path = Path(name) / "persona.yaml"
            path.write_text(yaml.safe_dump(payload, sort_keys=False), encoding="utf-8")
            os.chmod(path, 0o644)
            with self.assertRaisesRegex(PersonaBuildError, "must have mode 600"):
                migrate_persona(path, dry_run=True, enforce_private=True)

    def test_unknown_source_reference_is_rejected(self) -> None:
        payload = candidate_payload()
        payload["candidates"][0]["source_refs"] = ["missing-source"]
        with self.assertRaisesRegex(PersonaBuildError, "references unknown sources"):
            validate_candidate_payload(
                payload,
                catalog=self.catalog,
                sensitivity=self.sensitivity,
            )

    def test_candidate_notes_reject_credentials_and_personal_paths(self) -> None:
        payload = candidate_payload()
        payload["candidates"][0]["evidence"] = (
            "Found in /Users/example/private/history.json"
        )
        with self.assertRaisesRegex(PersonaBuildError, "personal absolute path"):
            validate_candidate_payload(
                payload,
                catalog=self.catalog,
                sensitivity=self.sensitivity,
            )

        payload = candidate_payload()
        payload["candidates"][0]["evidence"] = "sk-" + "a" * 40
        with self.assertRaisesRegex(PersonaBuildError, "credential or private key"):
            validate_candidate_payload(
                payload,
                catalog=self.catalog,
                sensitivity=self.sensitivity,
            )

    def test_incomplete_schema_category_review_is_rejected(self) -> None:
        payload = candidate_payload()
        payload["source_coverage"]["schema_categories_reviewed"] = [
            "Linguistic: Communication"
        ]
        with self.assertRaisesRegex(PersonaBuildError, "category review is incomplete"):
            validate_candidate_payload(
                payload,
                catalog=self.catalog,
                sensitivity=self.sensitivity,
            )

    def test_duplicate_yaml_mapping_key_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory(prefix="matraix-persona-duplicate-") as name:
            output = Path(name) / "persona.yaml"
            output.write_text(
                "persona_id: first\npersona_id: second\n",
                encoding="utf-8",
            )
            with self.assertRaisesRegex(PersonaBuildError, "Duplicate YAML mapping key"):
                validate_persona(
                    output,
                    require_private_mode=False,
                    require_git_ignore=False,
                )

    def test_validator_rejects_runtime_without_evidence(self) -> None:
        built = build_persona_payload(
            candidate_payload(),
            catalog=self.catalog,
            sensitivity=self.sensitivity,
        )
        broken = deepcopy(built)
        broken["dimensions"]["region"] = "Western Europe"
        broken["meta"]["runtime_dimensions"] = 2
        broken["meta"]["mapped_dimensions"] = 2
        broken["meta"]["rendered_dimensions"] = 2
        broken["meta"]["dimensions_left_unset"] = 1288
        with self.assertRaisesRegex(PersonaBuildError, "have no evidence rows"):
            validate_persona_data(
                broken,
                catalog=self.catalog,
                sensitivity=self.sensitivity,
            )

    def test_validator_rejects_confidence_typo(self) -> None:
        built = build_persona_payload(
            candidate_payload(),
            catalog=self.catalog,
            sensitivity=self.sensitivity,
        )
        built["evidenced"][0]["confidence_chatgpt"] = "high"
        with self.assertRaisesRegex(PersonaBuildError, "Invalid ChatGPT confidence"):
            validate_persona_data(
                built,
                catalog=self.catalog,
                sensitivity=self.sensitivity,
            )

    def test_private_mode_check_rejects_group_readable_persona(self) -> None:
        with tempfile.TemporaryDirectory(prefix="matraix-persona-mode-") as name:
            output = Path(name) / "persona.yaml"
            payload = build_persona_payload(
                candidate_payload(),
                catalog=self.catalog,
                sensitivity=self.sensitivity,
            )
            output.write_text(
                yaml.safe_dump(payload, sort_keys=False, allow_unicode=False),
                encoding="utf-8",
            )
            os.chmod(output, 0o644)
            with self.assertRaisesRegex(PersonaBuildError, "must have mode 600"):
                validate_persona(
                    output,
                    require_private_mode=True,
                    require_git_ignore=False,
                )

    def test_archive_accepts_only_tracked_private_runtime_locations(self) -> None:
        with tempfile.TemporaryDirectory(prefix="matraix-persona-archive-") as name:
            root = Path(name)
            (root / ".gitignore").write_text(
                "\n".join(
                    (
                        "/matraix/personal-persona/*.yaml",
                        "/matraix/personal-persona/*.yml",
                        "/matraix/personal-persona/source-material/",
                        "/matraix/personal-persona/survey/data/*",
                    )
                )
                + "\n",
                encoding="utf-8",
            )
            allowed = (
                root / "matraix/personal-persona/persona.yaml",
                root / "matraix/personal-persona/another-private-persona.yml",
                root
                / "matraix/personal-persona/survey/data/persona-candidates.json",
                root
                / "matraix/personal-persona/survey/data/nested/persona-report.json",
                root / "matraix/personal-persona/source-material/export.zip",
            )
            rejected = (
                root / "matraix/personal-persona/persona.example.yaml",
                root / "matraix/personal-persona/survey/data/.gitkeep",
                root / "matraix/personal-persona/not-private/candidates.json",
                root / "README.md",
            )

            with (
                patch.object(persona_builder, "REPO_ROOT", root),
                patch.object(persona_builder.subprocess, "run") as run,
            ):
                for private_path in allowed:
                    with self.subTest(allowed=private_path.relative_to(root)):
                        persona_builder._ensure_git_ignored(private_path)
                for public_path in rejected:
                    with (
                        self.subTest(rejected=public_path.relative_to(root)),
                        self.assertRaisesRegex(
                            PersonaBuildError,
                            "not in a known private runtime location",
                        ),
                    ):
                        persona_builder._ensure_git_ignored(public_path)
                run.assert_not_called()

    def test_archive_requires_matching_tracked_ignore_rule(self) -> None:
        with tempfile.TemporaryDirectory(prefix="matraix-persona-archive-") as name:
            root = Path(name)
            (root / ".gitignore").write_text(
                "/matraix/personal-persona/*.yaml\n",
                encoding="utf-8",
            )
            candidates = (
                root
                / "matraix/personal-persona/survey/data/persona-candidates.json"
            )
            with (
                patch.object(persona_builder, "REPO_ROOT", root),
                self.assertRaisesRegex(
                    PersonaBuildError,
                    "ignore rule is missing from .gitignore",
                ),
            ):
                persona_builder._ensure_git_ignored(candidates)

    def test_git_checkout_still_enforces_git_check_ignore(self) -> None:
        with tempfile.TemporaryDirectory(prefix="matraix-persona-checkout-") as name:
            root = Path(name)
            (root / ".git").mkdir()
            private_path = root / "matraix/personal-persona/persona.yaml"
            failed_check = SimpleNamespace(returncode=1, stdout="", stderr="")
            with (
                patch.object(persona_builder, "REPO_ROOT", root),
                patch.object(
                    persona_builder.subprocess,
                    "run",
                    return_value=failed_check,
                ) as run,
                self.assertRaisesRegex(
                    PersonaBuildError,
                    "path is not ignored by Git",
                ),
            ):
                persona_builder._ensure_git_ignored(private_path)
            run.assert_called_once_with(
                [
                    "git",
                    "-C",
                    str(root),
                    "check-ignore",
                    "-q",
                    "--",
                    "matraix/personal-persona/persona.yaml",
                ],
                capture_output=True,
                text=True,
                check=False,
            )

    def test_archive_mode_and_symlink_checks_remain_enforced(self) -> None:
        payload = build_persona_payload(
            candidate_payload(),
            catalog=self.catalog,
            sensitivity=self.sensitivity,
        )
        with tempfile.TemporaryDirectory(prefix="matraix-persona-archive-") as name:
            root = Path(name)
            (root / ".gitignore").write_text(
                "/matraix/personal-persona/*.yaml\n",
                encoding="utf-8",
            )
            persona_dir = root / "matraix/personal-persona"
            persona_dir.mkdir(parents=True)
            target = persona_dir / "target.yaml"
            target.write_text(
                yaml.safe_dump(payload, sort_keys=False),
                encoding="utf-8",
            )
            os.chmod(target, 0o644)
            link = persona_dir / "persona.yaml"
            link.symlink_to(target)

            with patch.object(persona_builder, "REPO_ROOT", root):
                with self.assertRaisesRegex(PersonaBuildError, "private symlink"):
                    migrate_persona(link, dry_run=True, enforce_private=True)
                with self.assertRaisesRegex(
                    PersonaBuildError,
                    "must have mode 600",
                ):
                    validate_persona(
                        target,
                        require_private_mode=True,
                        require_git_ignore=True,
                    )


if __name__ == "__main__":
    unittest.main()
