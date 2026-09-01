"""Regression tests for persona-driven survey filtering and file replacement."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import server
import yaml
from adaptive_survey import adapt_definition


def write_persona(
    path: Path,
    *,
    persona_id: str,
    display_name: str,
    dimensions: dict[str, str] | None = None,
    records: list[dict] | None = None,
) -> None:
    persona = {
        "persona_id": persona_id,
        "display_name": display_name,
        "dimensions": dimensions or {},
    }
    if records is not None:
        persona["evidenced"] = records
    path.write_text(
        yaml.safe_dump(persona, sort_keys=False, allow_unicode=False),
        encoding="utf-8",
    )


class AdaptiveSurveyTests(unittest.TestCase):
    @staticmethod
    def adapted_ranking(answer: list[object]) -> dict:
        definition = {
            "modules": [
                {
                    "id": "values",
                    "estimated_minutes": 2,
                    "questions": [
                        {
                            "id": "top_values",
                            "type": "rank_dimensions",
                            "max_rank": 2,
                            "derived_dimension_id": "values_priority",
                            "entries": [
                                {"dimension_id": "val_family", "label": "Family"},
                                {"dimension_id": "val_health", "label": "Health"},
                            ],
                        }
                    ],
                }
            ],
            "coverage": {},
        }
        schema_dimensions = [
            {"id": "val_family"},
            {"id": "val_health"},
            {"id": "values_priority"},
        ]
        return adapt_definition(
            definition,
            {"persona_id": "test", "display_name": "Test", "dimensions": {}},
            {"answers": {"top_values": answer}},
            schema_dimensions,
            persona_session_key="test-context",
            persona_revision="test-revision",
        )

    def patched_store(self, directory: Path, active_path: Path):
        return (
            patch.object(server, "DATA_DIR", directory),
            patch.object(server, "ACTIVE_PERSONA_PATH", active_path),
            patch.object(server, "PERSONA_STORE_DIR", directory / "personas"),
            patch.object(
                server, "PERSONA_REGISTRY_PATH", directory / "persona-registry.json"
            ),
            patch.object(server, "RESPONSES_PATH", directory / "responses.json"),
            patch.object(server, "EVENTS_PATH", directory / "response-events.jsonl"),
            patch.object(
                server, "DERIVED_PATH", directory / "derived-dimensions.json"
            ),
        )

    def test_replacement_yaml_resets_raw_answers_and_rebuilds_question_gaps(self) -> None:
        with tempfile.TemporaryDirectory(prefix="matraix-adaptive-swap-") as name:
            directory = Path(name)
            active_path = directory / "active.yaml"
            write_persona(
                active_path,
                persona_id="first",
                display_name="First",
                dimensions={"region": "Western Europe"},
            )
            patches = self.patched_store(directory, active_path)
            for active_patch in patches:
                active_patch.start()
                self.addCleanup(active_patch.stop)

            first = server.active_survey_snapshot()
            first_state = first["state"]
            first_state["answers"] = {"direct_age_bracket": "25-34"}
            server.atomic_write_json(
                server.context_paths(first_state["context_id"])[1], first_state
            )
            with server.CHAT_HISTORY_LOCK:
                server.CHAT_MESSAGES[:] = [
                    {"role": "user", "content": "belongs to First"}
                ]

            write_persona(
                active_path,
                persona_id="second",
                display_name="Second",
                dimensions={"age_bracket": "35-44"},
            )
            second = server.active_survey_snapshot()

            self.assertNotEqual(
                first_state["context_id"], second["state"]["context_id"]
            )
            self.assertEqual(second["state"]["answers"], {})
            self.assertEqual(second["definition"]["persona"]["display_name"], "Second")
            visible_ids = {
                question["id"]
                for module in second["definition"]["modules"]
                for question in module["questions"]
            }
            self.assertNotIn("direct_age_bracket", visible_ids)
            self.assertIn("direct_region", visible_ids)
            with server.CHAT_HISTORY_LOCK:
                self.assertEqual(server.CHAT_MESSAGES, [])

    def test_plain_persona_can_be_refined_without_extended_audit_metadata(self) -> None:
        with tempfile.TemporaryDirectory(prefix="matraix-adaptive-plain-") as name:
            directory = Path(name)
            active_path = directory / "active.yaml"
            write_persona(
                active_path,
                persona_id="plain",
                display_name="Plain",
                dimensions={"region": "Western Europe"},
            )
            patches = self.patched_store(directory, active_path)
            for active_patch in patches:
                active_patch.start()
                self.addCleanup(active_patch.stop)

            snapshot = server.active_survey_snapshot()
            question = next(
                question
                for module in snapshot["definition"]["modules"]
                for question in module["questions"]
                if question.get("type") == "dimension_select"
            )
            answer = question["options"][0]["value"]
            state = snapshot["state"]
            expected = {
                "context_id": state["context_id"],
                "persona_id": state["persona_id"],
                "baseline_sha256": state["baseline_sha256"],
                "definition_sha256": state["definition_sha256"],
                "save_revision": state["save_revision"],
            }
            saved, _, _ = server.save_answers_and_rebuild(
                {question["id"]: answer}, [], expected
            )
            refined = yaml.safe_load(active_path.read_text(encoding="utf-8"))

            self.assertEqual(saved["save_revision"], 1)
            self.assertEqual(refined["dimensions"][question["dimension_id"]], answer)
            self.assertEqual(
                refined["meta"]["survey"]["context_id"], state["context_id"]
            )
            self.assertEqual(refined["meta"]["schema_dimensions"], 1290)

    def test_stale_tab_cannot_write_after_persona_replacement(self) -> None:
        with tempfile.TemporaryDirectory(prefix="matraix-adaptive-stale-") as name:
            directory = Path(name)
            active_path = directory / "active.yaml"
            write_persona(
                active_path,
                persona_id="first",
                display_name="First",
            )
            patches = self.patched_store(directory, active_path)
            for active_patch in patches:
                active_patch.start()
                self.addCleanup(active_patch.stop)

            old_state = server.active_survey_snapshot()["state"]
            expected = {
                "context_id": old_state["context_id"],
                "persona_id": old_state["persona_id"],
                "baseline_sha256": old_state["baseline_sha256"],
                "definition_sha256": old_state["definition_sha256"],
                "save_revision": old_state["save_revision"],
            }
            write_persona(
                active_path,
                persona_id="second",
                display_name="Second",
            )

            with self.assertRaises(server.StaleSurveyStateError):
                server.save_answers_and_rebuild(
                    {"direct_region": "Western Europe"}, [], expected
                )
            current = server.active_survey_snapshot()
            self.assertEqual(current["state"]["persona_id"], "second")
            self.assertEqual(current["state"]["save_revision"], 0)
            self.assertEqual(current["state"]["answers"], {})

    def test_unknown_ranking_value_does_not_complete_question(self) -> None:
        adapted = self.adapted_ranking(["val_family", "val_not_in_question"])

        self.assertEqual(len(adapted["modules"]), 1)
        self.assertEqual(adapted["modules"][0]["questions"][0]["id"], "top_values")

    def test_malformed_ranking_values_do_not_complete_question(self) -> None:
        adapted = self.adapted_ranking(
            [{"dimension_id": "val_family"}, ["val_health"], 42, None]
        )

        self.assertEqual(len(adapted["modules"]), 1)
        self.assertEqual(adapted["modules"][0]["questions"][0]["id"], "top_values")

    def test_allowed_ranking_values_complete_question(self) -> None:
        adapted = self.adapted_ranking(
            ["val_family", "val_health", "val_not_in_question"]
        )

        self.assertEqual(adapted["modules"], [])


if __name__ == "__main__":
    unittest.main()
