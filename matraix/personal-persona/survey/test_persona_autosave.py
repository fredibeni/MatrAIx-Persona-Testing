"""Regression tests for survey autosave persona regeneration."""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import yaml

SURVEY_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SURVEY_DIR.parent
EXAMPLE_PERSONA_PATH = PROJECT_DIR / "persona.example.yaml"

import server

EVIDENCE_BLOCKS = (
    "evidenced",
    "best_guess",
    "sensitive_evidenced",
    "sensitive_best_guess",
    "unresolved",
)


def load_yaml(path: Path) -> dict:
    return yaml.safe_load(path.read_text(encoding="utf-8"))


def evidence_record(persona: dict, dimension_id: str) -> dict:
    return next(
        row
        for block in EVIDENCE_BLOCKS
        for row in persona.get(block, [])
        if row["id"] == dimension_id
    )


class PersonaAutosaveTests(unittest.TestCase):
    def test_ranking_reorder_survives_persistence_and_persona_compilation(
        self,
    ) -> None:
        original_ranking = ["val_family", "val_adventure", "val_tradition"]
        reordered_ranking = [
            "val_obsolete",
            "val_adventure",
            "val_family",
            "val_tradition",
        ]

        with tempfile.TemporaryDirectory(
            prefix="matraix-ranking-autosave-test-"
        ) as temp_dir:
            data_dir = Path(temp_dir)
            responses_path = data_dir / "responses.json"
            events_path = data_dir / "response-events.jsonl"
            derived_path = data_dir / "derived-dimensions.json"
            active_path = data_dir / "persona.yaml"
            persona_store = data_dir / "personas"
            registry_path = data_dir / "persona-registry.json"
            active_path.write_text(
                EXAMPLE_PERSONA_PATH.read_text(encoding="utf-8"),
                encoding="utf-8",
            )
            patches = (
                patch.object(server, "DATA_DIR", data_dir),
                patch.object(server, "RESPONSES_PATH", responses_path),
                patch.object(server, "EVENTS_PATH", events_path),
                patch.object(server, "DERIVED_PATH", derived_path),
                patch.object(server, "ACTIVE_PERSONA_PATH", active_path),
                patch.object(server, "PERSONA_STORE_DIR", persona_store),
                patch.object(server, "PERSONA_REGISTRY_PATH", registry_path),
            )
            for active_patch in patches:
                active_patch.start()
                self.addCleanup(active_patch.stop)

            first_state, _, _ = server.save_answers_and_rebuild(
                {"top_values": original_ranking},
                ["values_quick"],
            )
            second_state, second_changes, _ = server.save_answers_and_rebuild(
                {"top_values": reordered_ranking},
                ["values_quick"],
            )

            registry = server.load_persona_registry()
            context = server.context_from_entry(
                second_state["context_id"],
                registry["contexts"][second_state["context_id"]],
            )
            saved_json = json.loads(
                context.responses_path.read_text(encoding="utf-8")
            )
            reloaded_state = server.load_state(context)
            history = [
                json.loads(line)
                for line in context.events_path.read_text(
                    encoding="utf-8"
                ).splitlines()
                if line.strip()
            ]
            compiled = load_yaml(active_path)

            self.assertEqual(first_state["answers"]["top_values"], original_ranking)
            self.assertEqual(second_state["save_revision"], 2)
            self.assertEqual(
                saved_json["answers"]["top_values"], reordered_ranking
            )
            self.assertEqual(
                reloaded_state["answers"]["top_values"], reordered_ranking
            )
            self.assertEqual(len(second_changes), 1)
            self.assertEqual(second_changes[0]["question_id"], "top_values")
            self.assertEqual(second_changes[0]["old_value"], original_ranking)
            self.assertEqual(second_changes[0]["new_value"], reordered_ranking)
            self.assertEqual(history[-1]["question_id"], "top_values")
            self.assertEqual(history[-1]["old_value"], original_ranking)
            self.assertEqual(history[-1]["new_value"], reordered_ranking)
            self.assertEqual(
                evidence_record(compiled, "val_adventure")["value"], "Core value"
            )
            self.assertEqual(
                evidence_record(compiled, "val_family")["value"], "Important"
            )
            self.assertEqual(
                evidence_record(compiled, "values_priority")["value"], "Novelty"
            )

    def test_autosave_updates_active_persona_and_clearing_reverts_to_baseline(
        self,
    ) -> None:
        definition = json.loads(server.DEFINITION_PATH.read_text(encoding="utf-8"))
        question = next(
            question
            for module in definition["modules"]
            for question in module["questions"]
            if question.get("dimension_id") == "cog_verbosity"
        )
        dimension_id = question["dimension_id"]
        baseline = load_yaml(EXAMPLE_PERSONA_PATH)
        self.assertIsNone(baseline["dimensions"][dimension_id])
        answer = next(
            option["value"]
            for option in question["options"]
            if not option["value"].startswith("__")
        )

        with tempfile.TemporaryDirectory(
            prefix="matraix-persona-autosave-test-"
        ) as temp_dir:
            data_dir = Path(temp_dir)
            responses_path = data_dir / "responses.json"
            events_path = data_dir / "response-events.jsonl"
            derived_path = data_dir / "derived-dimensions.json"
            active_path = data_dir / "persona_alfred.yaml"
            persona_store = data_dir / "personas"
            registry_path = data_dir / "persona-registry.json"
            active_path.write_text(
                EXAMPLE_PERSONA_PATH.read_text(encoding="utf-8"),
                encoding="utf-8",
            )
            patches = (
                patch.object(server, "DATA_DIR", data_dir),
                patch.object(server, "RESPONSES_PATH", responses_path),
                patch.object(server, "EVENTS_PATH", events_path),
                patch.object(server, "DERIVED_PATH", derived_path),
                patch.object(server, "ACTIVE_PERSONA_PATH", active_path),
                patch.object(server, "PERSONA_STORE_DIR", persona_store),
                patch.object(server, "PERSONA_REGISTRY_PATH", registry_path),
            )
            for active_patch in patches:
                active_patch.start()
                self.addCleanup(active_patch.stop)

            first_state, first_changes, first_summary = server.save_answers_and_rebuild(
                {question["id"]: answer},
                [],
            )
            updated = load_yaml(active_path)
            updated_record = evidence_record(updated, dimension_id)
            self.assertEqual(first_state["save_revision"], 1)
            self.assertEqual(len(first_changes), 1)
            self.assertGreaterEqual(first_summary["selected_updates"], 1)
            self.assertEqual(updated_record["selected_from"], "survey")
            self.assertEqual(updated_record["value"], answer)

            second_state, second_changes, _ = server.save_answers_and_rebuild({}, [])
            reverted = load_yaml(active_path)
            self.assertEqual(second_state["save_revision"], 2)
            self.assertEqual(len(second_changes), 1)
            self.assertNotIn(dimension_id, reverted["dimensions"])
            self.assertFalse(
                any(
                    row["id"] == dimension_id
                    for block in EVIDENCE_BLOCKS
                    for row in reverted.get(block, [])
                )
            )
            _, _, context_events, context_derived = server.context_paths(
                second_state["context_id"]
            )
            self.assertTrue(context_derived.is_file())
            self.assertTrue(context_events.is_file())


if __name__ == "__main__":
    unittest.main()
