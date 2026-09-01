"""Regression tests for deterministic persona compilation and validation."""

from __future__ import annotations

import json
import os
import stat
import tempfile
import unittest
from copy import deepcopy
from pathlib import Path

import yaml

from matraix.persona_builder import (
    DEFAULT_SCHEMA_PATH,
    DEFAULT_SENSITIVITY_PATH,
    PersonaBuildError,
    build_persona_payload,
    compile_candidates,
    derive_sensitive_ids_from_survey,
    load_catalog,
    load_sensitivity_policy,
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
        self.assertEqual(report["runtime_dimensions"], 1)
        self.assertEqual(report["rendered_dimensions"], 1)

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


if __name__ == "__main__":
    unittest.main()
