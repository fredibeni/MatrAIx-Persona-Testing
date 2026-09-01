"""HTTP contract tests for disk-backed Validation experiment history."""

from __future__ import annotations

import http.client
import json
import tempfile
import threading
import unittest
from copy import deepcopy
from pathlib import Path
from unittest.mock import patch

import server
from matraix.persona_builder import (
    SensitivityPolicy,
    build_persona_payload,
    dump_readable_yaml,
    load_catalog,
    load_sensitivity_policy,
)


VALIDATION_ORIGIN = "http://127.0.0.1:8767"


def filled_example_persona() -> dict:
    catalog = load_catalog()
    sensitivity = load_sensitivity_policy(catalog=catalog)
    return build_persona_payload(
        {
            "schema_version": 1,
            "persona": {
                "persona_id": "example-persona",
                "display_name": "Example Persona",
                "version": "1.0",
            },
            "source_coverage": {
                "generated_at": "2026-09-01T00:00:00Z",
                "sources": [
                    {
                        "id": "test-source",
                        "type": "current_task",
                        "description": "A deterministic test fixture.",
                        "items_reviewed": 1,
                        "limitations": [],
                    }
                ],
                "schema_categories_reviewed": ["*"],
                "limitations": [],
            },
            "candidates": [
                {
                    "id": "cog_verbosity",
                    "value": "Concise",
                    "confidence": "stated",
                    "evidence": "The deterministic fixture selects concise responses.",
                    "source_refs": ["test-source"],
                    "runtime_included": True,
                }
            ],
        },
        catalog=catalog,
        sensitivity=sensitivity,
    )


def example_store(*, answer: str = "short-plan") -> dict:
    """Return a small nested store that exercises benchmark and Agent history."""
    return {
        "version": 2,
        "surveys": {
            "everyday": {
                "human": {
                    "id": "human-everyday-1",
                    "startedAt": "2026-08-31T09:00:00.000Z",
                    "answers": {"free-saturday": answer},
                    "clearedAnswers": ["restaurant"],
                },
                "agentRuns": [
                    {
                        "id": "agent-everyday-1",
                        "sequence": 1,
                        "dimensionCount": 42,
                        "startedAt": "2026-08-31T09:05:00.000Z",
                        "freshSessionAttestedAt": "2026-08-31T09:05:00.000Z",
                        "benchmarkId": "human-everyday-1",
                        "answers": {"free-saturday": answer},
                        "clearedAnswers": ["restaurant"],
                    }
                ],
            }
        },
        "updatedAt": "2026-08-31T09:10:00.000Z",
    }


def expected_stamped_store(envelope: dict, store: dict) -> dict:
    stamped = deepcopy(store)
    persona_agent = {
        "contextId": envelope["context_id"],
        "personaId": envelope["persona_id"],
        "displayName": envelope["persona_display_name"],
        "baselineSha256": envelope["baseline_sha256"],
        "revisionSha256": envelope["persona_revision"],
    }
    for history in stamped["surveys"].values():
        if isinstance(history.get("human"), dict):
            history["human"]["personaAgent"] = persona_agent
        for run in history.get("agentRuns", []):
            run["personaAgent"] = persona_agent
    return stamped


class ValidationPersistenceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_directory = tempfile.TemporaryDirectory(
            prefix="matraix-validation-persistence-test-"
        )
        self.addCleanup(self.temp_directory.cleanup)
        self.data_dir = Path(self.temp_directory.name)
        self.active_persona = self.data_dir / "persona.yaml"
        self.active_persona.write_text(
            dump_readable_yaml(filled_example_persona()),
            encoding="utf-8",
        )
        self.patchers = (
            patch.object(server, "DATA_DIR", self.data_dir),
            patch.object(server, "RESPONSES_PATH", self.data_dir / "responses.json"),
            patch.object(
                server,
                "EVENTS_PATH",
                self.data_dir / "response-events.jsonl",
            ),
            patch.object(
                server,
                "DERIVED_PATH",
                self.data_dir / "derived-dimensions.json",
            ),
            patch.object(server, "ACTIVE_PERSONA_PATH", self.active_persona),
            patch.object(server, "PERSONA_STORE_DIR", self.data_dir / "personas"),
            patch.object(
                server,
                "PERSONA_REGISTRY_PATH",
                self.data_dir / "persona-registry.json",
            ),
        )
        for active_patch in self.patchers:
            active_patch.start()
            self.addCleanup(active_patch.stop)

        self.httpd = server.ThreadingHTTPServer(
            ("127.0.0.1", 0), server.SurveyHandler
        )
        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)
        self.thread.start()
        self.addCleanup(self.httpd.server_close)
        self.addCleanup(self.httpd.shutdown)
        self.port = int(self.httpd.server_address[1])

    def test_policy_migration_preserves_context_questionnaire_and_validation_files(
        self,
    ) -> None:
        catalog = load_catalog()
        legacy_policy = SensitivityPolicy(
            dimension_ids=frozenset(),
            sha256="legacy-policy-sha256",
            source="legacy-test-policy",
        )
        legacy_persona = build_persona_payload(
            {
                "schema_version": 1,
                "persona": {
                    "persona_id": "legacy-policy-persona",
                    "display_name": "Legacy Policy Persona",
                    "version": "1.0",
                },
                "source_coverage": {
                    "generated_at": "2026-09-01T00:00:00Z",
                    "sources": [
                        {
                            "id": "legacy-test-source",
                            "type": "current_task",
                            "description": "A deterministic legacy-policy fixture.",
                            "items_reviewed": 1,
                            "limitations": [],
                        }
                    ],
                    "schema_categories_reviewed": ["*"],
                    "limitations": [],
                },
                "candidates": [
                    {
                        "id": "urbanicity",
                        "value": "Dense urban",
                        "confidence": "stated",
                        "evidence": "The fixture supplies an evidence-backed value.",
                        "source_refs": ["legacy-test-source"],
                        "runtime_included": True,
                    }
                ],
            },
            catalog=catalog,
            sensitivity=legacy_policy,
        )
        self.active_persona.write_text(
            dump_readable_yaml(legacy_persona),
            encoding="utf-8",
        )

        registry, context = server.initialize_persona_registry()
        original_active_hash = server.sha256_path(self.active_persona)
        original_baseline = context.baseline_path.read_bytes()
        self.assertEqual(len(registry["contexts"]), 1)

        questionnaire_state = server.state_for_context(context)
        questionnaire_state.update(
            {
                "answers": {"direct_cog_verbosity": "Concise"},
                "visited_modules": ["conversation_fingerprint"],
                "save_revision": 7,
                "saved_at": "2026-09-01T08:00:00Z",
            }
        )
        server.atomic_write_json(context.responses_path, questionnaire_state)

        validation_state = server.empty_validation_state(context)
        validation_state.update(
            {
                "save_revision": 4,
                "saved_at": "2026-09-01T08:05:00Z",
            }
        )
        validation_state["store"] = expected_stamped_store(
            validation_state,
            example_store(),
        )
        validation_path = server.validation_results_path(context)
        server.atomic_write_json(validation_path, validation_state)

        original_questionnaire = context.responses_path.read_bytes()
        original_validation = validation_path.read_bytes()

        with server.STATE_LOCK:
            migrated_context = server.synchronize_active_persona_context_unlocked()

        self.assertIsNotNone(migrated_context)
        assert migrated_context is not None
        self.assertEqual(migrated_context.context_id, context.context_id)
        self.assertEqual(migrated_context.baseline_sha256, context.baseline_sha256)
        self.assertEqual(context.baseline_path.read_bytes(), original_baseline)
        self.assertEqual(context.responses_path.read_bytes(), original_questionnaire)
        self.assertEqual(validation_path.read_bytes(), original_validation)

        migrated_active_hash = server.sha256_path(self.active_persona)
        self.assertNotEqual(migrated_active_hash, original_active_hash)
        self.assertEqual(migrated_context.output_sha256, migrated_active_hash)
        migrated_registry = server.load_persona_registry()
        self.assertEqual(migrated_registry["active_context_id"], context.context_id)
        self.assertEqual(len(migrated_registry["contexts"]), 1)
        self.assertEqual(
            migrated_registry["contexts"][context.context_id]["output_sha256"],
            migrated_active_hash,
        )

        migrated_persona = server.load_persona_yaml(self.active_persona)
        migrated_row = next(
            row
            for row in migrated_persona["sensitive_evidenced"]
            if row["id"] == "urbanicity"
        )
        self.assertTrue(migrated_row["sensitive"])
        self.assertFalse(migrated_row["runtime_included"])
        self.assertEqual(migrated_row["value"], "Dense urban")
        self.assertNotIn("urbanicity", migrated_persona["dimensions"])
        self.assertTrue(
            server.validate_persona(
                self.active_persona,
                schema_path=server.SCHEMA_PATH,
                sensitivity_path=server.SENSITIVITY_PATH,
            )["ok"]
        )

        reloaded_questionnaire = server.load_state(migrated_context)
        self.assertEqual(reloaded_questionnaire["save_revision"], 7)
        self.assertEqual(
            reloaded_questionnaire["answers"],
            {"direct_cog_verbosity": "Concise"},
        )
        self.assertEqual(
            json.loads(validation_path.read_text(encoding="utf-8"))["store"],
            validation_state["store"],
        )

    def test_empty_get_returns_active_persona_envelope(self) -> None:
        status, body, _ = self.request("GET", "/api/validation/state")

        expected_dimension_count = sum(
            value is not None
            for value in server.load_persona_yaml(self.active_persona)[
                "dimensions"
            ].values()
        )
        self.assertEqual(status, 200)
        self.assertEqual(body["schema_version"], 1)
        self.assertEqual(body["persona_id"], "example-persona")
        self.assertEqual(body["persona_display_name"], "Example Persona")
        self.assertTrue(body["context_id"])
        self.assertTrue(body["baseline_sha256"])
        self.assertTrue(body["persona_revision"])
        self.assertEqual(
            body["persona_dimension_count"], expected_dimension_count
        )
        self.assertEqual(body["save_revision"], 0)
        self.assertIsNone(body["saved_at"])
        self.assertEqual(body["store"]["version"], 2)
        self.assertEqual(body["store"]["surveys"], {})
        self.assertIsInstance(body["store"]["updatedAt"], str)

    def test_post_persists_nested_store_and_increments_revision(self) -> None:
        _, initial, _ = self.request("GET", "/api/validation/state")
        store = example_store()
        status, saved, _ = self.request(
            "POST",
            "/api/validation/state",
            {
                "context_id": initial["context_id"],
                "expected_save_revision": initial["save_revision"],
                "store": store,
            },
            origin=VALIDATION_ORIGIN,
        )

        self.assertEqual(status, 200)
        self.assertEqual(saved["save_revision"], 1)
        self.assertEqual(
            saved["persona_dimension_count"],
            initial["persona_dimension_count"],
        )
        expected_store = expected_stamped_store(initial, store)
        self.assertEqual(saved["store"], expected_store)
        self.assertIsInstance(saved["saved_at"], str)
        self.assertEqual(
            saved["store"]["surveys"]["everyday"]["human"]["personaAgent"],
            {
                "contextId": initial["context_id"],
                "personaId": "example-persona",
                "displayName": "Example Persona",
                "baselineSha256": initial["baseline_sha256"],
                "revisionSha256": initial["persona_revision"],
            },
        )

        result_path = (
            server.context_paths(initial["context_id"])[1].parent
            / "validation-results.json"
        )
        self.assertTrue(result_path.is_file())
        persisted = json.loads(result_path.read_text(encoding="utf-8"))
        self.assertEqual(
            persisted["persona_dimension_count"],
            initial["persona_dimension_count"],
        )
        self.assertEqual(persisted["store"], expected_store)

        status, reloaded, _ = self.request("GET", "/api/validation/state")
        self.assertEqual(status, 200)
        self.assertEqual(reloaded, saved)

    def test_batch_records_keep_journal_revision_after_persona_advances(self) -> None:
        _, initial, _ = self.request("GET", "/api/validation/state")
        revision_a = initial["persona_revision"]
        dimension_count = initial["persona_dimension_count"]
        with server.STATE_LOCK:
            context = server.synchronize_active_persona_context_unlocked()
        self.assertIsNotNone(context)
        assert context is not None

        batch_id = f"validation-batch-{'a' * 24}"
        batch_started_at = "2026-09-01T09:00:00Z"
        batch_completed_at = "2026-09-01T09:02:00Z"
        prepared = server.ValidationAgentContext(
            backend=server.ChatBackend(
                codex="codex",
                model="gpt-5.6-luna",
                reasoning_effort="low",
                timeout=30,
            ),
            helpers=None,
            identity="server-captured-persona-a",
            persona_display_name=context.display_name,
            snapshot={
                "context_id": context.context_id,
                "persona_id": context.persona_id,
                "persona_display_name": context.display_name,
                "baseline_sha256": context.baseline_sha256,
                "persona_revision": revision_a,
                "persona_dimension_count": dimension_count,
            },
            results_directory=context.responses_path.parent,
        )
        results = []
        for survey_id in server.VALIDATION_SURVEY_ORDER:
            survey = server.load_validation_survey(survey_id)
            answers = {
                question["id"]: question["options"][0]["id"]
                for question in survey["questions"]
            }
            for response_index in range(
                1, server.VALIDATION_BATCH_RUNS_PER_SURVEY + 1
            ):
                started_at = f"2026-09-01T09:00:{response_index:02d}Z"
                completed_at = f"2026-09-01T09:01:{response_index:02d}Z"
                results.append(
                    {
                        "ok": True,
                        "survey_id": survey_id,
                        "response_index": response_index,
                        "answers": deepcopy(answers),
                        **prepared.snapshot,
                        "persona_display_name": context.display_name,
                        "model": prepared.backend.model,
                        "reasoning_effort": prepared.backend.reasoning_effort,
                        "started_at": started_at,
                        "completed_at": completed_at,
                        "execution": {
                            "mode": "codex-ephemeral",
                            "prior_conversation_messages": 0,
                            "memory": "disabled",
                            "tools": "disabled",
                        },
                    }
                )
        journal = server.validation_agent_batch_document(
            prepared,
            batch_id,
            server.VALIDATION_BATCH_RUNS_PER_SURVEY,
            batch_started_at,
            results,
            status="complete",
            completed_at=batch_completed_at,
        )
        server.write_validation_agent_batch_journal(
            server.validation_agent_batch_journal_path(
                context.responses_path.parent,
                batch_id,
            ),
            journal,
        )

        server.save_answers_and_rebuild(
            {"direct_cog_verbosity": "Wordy"},
            ["conversation_fingerprint"],
        )
        revision_b = server.sha256_path(self.active_persona)
        self.assertNotEqual(revision_b, revision_a)

        results_by_slot = {
            (result["survey_id"], result["response_index"]): result
            for result in results
        }
        surveys = {}
        for survey_id in server.VALIDATION_SURVEY_ORDER:
            agent_runs = []
            for response_index in range(
                1, server.VALIDATION_BATCH_RUNS_PER_SURVEY + 1
            ):
                result = results_by_slot[(survey_id, response_index)]
                agent_runs.append(
                    {
                        "id": (
                            f"agent-{batch_id}-{survey_id}-{response_index}"
                        ),
                        "sequence": response_index,
                        "dimensionCount": dimension_count,
                        "answers": deepcopy(result["answers"]),
                        "startedAt": result["started_at"],
                        "completedAt": result["completed_at"],
                        "freshSessionAttestedAt": result["started_at"],
                        "benchmarkId": None,
                        "personaAgent": {
                            "contextId": "browser-controlled-context",
                            "personaId": "browser-controlled-persona",
                            "displayName": "Browser Controlled",
                            "baselineSha256": "f" * 64,
                            "revisionSha256": "f" * 64,
                        },
                        "experiment": {
                            "id": batch_id,
                            "startedAt": batch_started_at,
                            "responseIndex": response_index,
                            "responsesPerSurvey": (
                                server.VALIDATION_BATCH_RUNS_PER_SURVEY
                            ),
                            "surveyIds": list(server.VALIDATION_SURVEY_ORDER),
                        },
                    }
                )
            surveys[survey_id] = {"agentRuns": agent_runs}
        store = {
            "version": server.VALIDATION_STORE_VERSION,
            "surveys": surveys,
            "updatedAt": batch_completed_at,
        }

        status, saved, _ = self.request(
            "POST",
            "/api/validation/state",
            {
                "context_id": initial["context_id"],
                "expected_save_revision": 0,
                "store": store,
            },
            origin=VALIDATION_ORIGIN,
        )

        self.assertEqual(status, 200)
        self.assertEqual(saved["persona_revision"], revision_b)
        saved_runs = [
            run
            for history in saved["store"]["surveys"].values()
            for run in history["agentRuns"]
        ]
        self.assertEqual(len(saved_runs), 40)
        self.assertEqual(
            {run["personaAgent"]["revisionSha256"] for run in saved_runs},
            {revision_a},
        )
        self.assertTrue(
            all(
                run["personaAgent"]
                == server.validation_persona_agent(context, revision_a)
                for run in saved_runs
            )
        )

        status, reloaded, _ = self.request("GET", "/api/validation/state")
        self.assertEqual(status, 200)
        reloaded_runs = [
            run
            for history in reloaded["store"]["surveys"].values()
            for run in history["agentRuns"]
        ]
        self.assertEqual(
            {run["personaAgent"]["revisionSha256"] for run in reloaded_runs},
            {revision_a},
        )

    def test_each_persona_context_uses_a_separate_results_file(self) -> None:
        _, first, _ = self.request("GET", "/api/validation/state")
        first_store = example_store(answer="short-plan")
        status, first_saved, _ = self.request(
            "POST",
            "/api/validation/state",
            {
                "context_id": first["context_id"],
                "expected_save_revision": 0,
                "store": first_store,
            },
            origin=VALIDATION_ORIGIN,
        )
        self.assertEqual(status, 200)

        replacement = self.active_persona.read_text(encoding="utf-8")
        replacement = replacement.replace(
            "persona_id: example-persona", "persona_id: second", 1
        )
        replacement = replacement.replace(
            "display_name: Example Persona", "display_name: Second", 1
        )
        self.active_persona.write_text(replacement, encoding="utf-8")

        status, second, _ = self.request("GET", "/api/validation/state")
        self.assertEqual(status, 200)
        self.assertEqual(second["persona_id"], "second")
        self.assertNotEqual(second["context_id"], first["context_id"])
        self.assertEqual(second["save_revision"], 0)
        self.assertEqual(second["store"]["surveys"], {})

        second_store = example_store(answer="follow-mood")
        status, second_saved, _ = self.request(
            "POST",
            "/api/validation/state",
            {
                "context_id": second["context_id"],
                "expected_save_revision": 0,
                "store": second_store,
            },
            origin=VALIDATION_ORIGIN,
        )
        self.assertEqual(status, 200)

        first_path = (
            server.context_paths(first["context_id"])[1].parent
            / "validation-results.json"
        )
        second_path = (
            server.context_paths(second["context_id"])[1].parent
            / "validation-results.json"
        )
        self.assertNotEqual(first_path, second_path)
        self.assertEqual(
            json.loads(first_path.read_text(encoding="utf-8"))["store"],
            first_saved["store"],
        )
        self.assertEqual(
            json.loads(second_path.read_text(encoding="utf-8"))["store"],
            second_saved["store"],
        )

    def test_replugging_a_persona_restores_its_archived_validation_file(self) -> None:
        original_yaml = self.active_persona.read_text(encoding="utf-8")
        _, first, _ = self.request("GET", "/api/validation/state")
        status, first_saved, _ = self.request(
            "POST",
            "/api/validation/state",
            {
                "context_id": first["context_id"],
                "expected_save_revision": 0,
                "store": example_store(answer="short-plan"),
            },
            origin=VALIDATION_ORIGIN,
        )
        self.assertEqual(status, 200)

        replacement = original_yaml.replace(
            "persona_id: example-persona", "persona_id: second", 1
        ).replace("display_name: Example Persona", "display_name: Second", 1)
        self.active_persona.write_text(replacement, encoding="utf-8")
        _, second, _ = self.request("GET", "/api/validation/state")
        status, second_saved, _ = self.request(
            "POST",
            "/api/validation/state",
            {
                "context_id": second["context_id"],
                "expected_save_revision": 0,
                "store": example_store(answer="follow-mood"),
            },
            origin=VALIDATION_ORIGIN,
        )
        self.assertEqual(status, 200)

        status, conflict, _ = self.request(
            "POST",
            "/api/validation/state",
            {
                "context_id": first["context_id"],
                "expected_save_revision": first_saved["save_revision"],
                "store": example_store(answer="short-plan"),
            },
            origin=VALIDATION_ORIGIN,
        )
        self.assertEqual(status, 409)
        self.assertEqual(conflict["state"]["context_id"], second["context_id"])
        self.assertEqual(conflict["state"]["store"], second_saved["store"])

        self.active_persona.write_text(original_yaml, encoding="utf-8")
        status, restored, _ = self.request("GET", "/api/validation/state")
        self.assertEqual(status, 200)
        self.assertEqual(restored["context_id"], first["context_id"])
        self.assertEqual(restored["persona_id"], "example-persona")
        self.assertEqual(restored["store"], first_saved["store"])

        second_path = (
            server.context_paths(second["context_id"])[1].parent
            / "validation-results.json"
        )
        self.assertEqual(
            json.loads(second_path.read_text(encoding="utf-8"))["store"],
            second_saved["store"],
        )

    def test_legacy_records_are_backfilled_without_changing_save_revision(self) -> None:
        _, initial, _ = self.request("GET", "/api/validation/state")
        legacy_store = example_store()
        result_path = (
            server.context_paths(initial["context_id"])[1].parent
            / "validation-results.json"
        )
        result_path.parent.mkdir(parents=True, exist_ok=True)
        result_path.write_text(
            json.dumps(
                {
                    "schema_version": 1,
                    "context_id": initial["context_id"],
                    "persona_id": initial["persona_id"],
                    "baseline_sha256": initial["baseline_sha256"],
                    "save_revision": 4,
                    "saved_at": "2026-08-31T09:10:00.000Z",
                    "store": legacy_store,
                }
            ),
            encoding="utf-8",
        )

        status, migrated, _ = self.request("GET", "/api/validation/state")
        self.assertEqual(status, 200)
        self.assertEqual(migrated["save_revision"], 4)
        self.assertEqual(
            migrated["persona_dimension_count"],
            initial["persona_dimension_count"],
        )
        identity = migrated["store"]["surveys"]["everyday"]["human"][
            "personaAgent"
        ]
        self.assertEqual(identity["contextId"], initial["context_id"])
        self.assertEqual(identity["displayName"], "Example Persona")
        self.assertIsNone(identity["revisionSha256"])
        self.assertEqual(
            json.loads(result_path.read_text(encoding="utf-8")), migrated
        )

    def test_persona_dimension_count_ignores_only_null_values(self) -> None:
        self.active_persona.write_text(
            """persona_id: count-test
display_name: Count Test
dimensions:
  text: filled
  zero: 0
  false: false
  empty: ''
  missing: null
meta:
  runtime_dimensions: 999
""",
            encoding="utf-8",
        )

        self.assertEqual(server.active_persona_dimension_count(), 4)

    def test_stale_revision_is_rejected_without_overwriting_disk(self) -> None:
        _, initial, _ = self.request("GET", "/api/validation/state")
        first_store = example_store(answer="short-plan")
        status, saved, _ = self.request(
            "POST",
            "/api/validation/state",
            {
                "context_id": initial["context_id"],
                "expected_save_revision": 0,
                "store": first_store,
            },
            origin=VALIDATION_ORIGIN,
        )
        self.assertEqual(status, 200)
        self.assertEqual(saved["save_revision"], 1)

        status, conflict, _ = self.request(
            "POST",
            "/api/validation/state",
            {
                "context_id": initial["context_id"],
                "expected_save_revision": 0,
                "store": example_store(answer="follow-mood"),
            },
            origin=VALIDATION_ORIGIN,
        )
        self.assertEqual(status, 409)
        self.assertEqual(conflict["code"], "validation_state_changed")

        status, reloaded, _ = self.request("GET", "/api/validation/state")
        self.assertEqual(status, 200)
        self.assertEqual(reloaded["save_revision"], 1)
        self.assertEqual(reloaded["store"], expected_stamped_store(initial, first_store))

    def test_invalid_posts_are_rejected(self) -> None:
        _, initial, _ = self.request("GET", "/api/validation/state")

        status, body, _ = self.request(
            "POST",
            "/api/validation/state",
            {
                "context_id": initial["context_id"],
                "expected_save_revision": 0,
                "store": {"version": 2, "surveys": []},
            },
            origin=VALIDATION_ORIGIN,
        )
        self.assertEqual(status, 400)
        self.assertEqual(body["code"], "invalid_validation_state")

        status, body, _ = self.request(
            "POST",
            "/api/validation/state",
            {
                "context_id": initial["context_id"],
                "expected_save_revision": 0,
                "store": example_store(),
            },
            origin=VALIDATION_ORIGIN,
            content_type="text/plain",
        )
        self.assertEqual(status, 415)
        self.assertEqual(body["code"], "invalid_content_type")

        max_bytes = getattr(server, "MAX_VALIDATION_BODY_BYTES", 2 * 1024 * 1024)
        status, body, _ = self.request_raw(
            "POST",
            "/api/validation/state",
            None,
            origin=VALIDATION_ORIGIN,
            extra_headers={
                "Content-Length": str(max_bytes + 1),
                "Content-Type": "application/json",
            },
        )
        self.assertEqual(status, 413)
        self.assertEqual(body["code"], "request_too_large")

    def test_agent_experiment_metadata_is_validated(self) -> None:
        valid = example_store()
        valid["surveys"]["everyday"]["agentRuns"][0]["experiment"] = {
            "id": "validation-batch-1",
            "startedAt": "2026-09-01T09:00:00.000Z",
            "responseIndex": 1,
            "responsesPerSurvey": 10,
            "surveyIds": [
                "everyday",
                "dials",
                "plot-twists",
                "internet-creature",
            ],
        }
        self.assertIs(server.validate_validation_store(valid), valid)

        invalid_experiments = {
            "not an object": [],
            "missing field": {
                "id": "validation-batch-1",
                "startedAt": "2026-09-01T09:00:00.000Z",
                "responseIndex": 1,
                "responsesPerSurvey": 10,
            },
            "empty id": {
                **valid["surveys"]["everyday"]["agentRuns"][0]["experiment"],
                "id": " ",
            },
            "invalid timestamp": {
                **valid["surveys"]["everyday"]["agentRuns"][0]["experiment"],
                "startedAt": "not-a-time",
            },
            "index below range": {
                **valid["surveys"]["everyday"]["agentRuns"][0]["experiment"],
                "responseIndex": 0,
            },
            "index above range": {
                **valid["surveys"]["everyday"]["agentRuns"][0]["experiment"],
                "responseIndex": 11,
            },
            "wrong batch size": {
                **valid["surveys"]["everyday"]["agentRuns"][0]["experiment"],
                "responsesPerSurvey": 9,
            },
            "duplicate survey": {
                **valid["surveys"]["everyday"]["agentRuns"][0]["experiment"],
                "surveyIds": ["everyday", "everyday"],
            },
            "unknown survey": {
                **valid["surveys"]["everyday"]["agentRuns"][0]["experiment"],
                "surveyIds": ["everyday", "unknown"],
            },
            "missing owning survey": {
                **valid["surveys"]["everyday"]["agentRuns"][0]["experiment"],
                "surveyIds": ["dials", "plot-twists"],
            },
        }
        for name, experiment in invalid_experiments.items():
            with self.subTest(name=name):
                invalid = deepcopy(valid)
                invalid["surveys"]["everyday"]["agentRuns"][0][
                    "experiment"
                ] = experiment
                with self.assertRaises((TypeError, ValueError)):
                    server.validate_validation_store(invalid)

        legacy_without_experiment = example_store()
        self.assertIs(
            server.validate_validation_store(legacy_without_experiment),
            legacy_without_experiment,
        )

    def test_validation_origin_get_post_and_preflight_are_allowlisted(self) -> None:
        status, initial, headers = self.request(
            "GET", "/api/validation/state", origin=VALIDATION_ORIGIN
        )
        self.assertEqual(status, 200)
        self.assertEqual(headers.get("access-control-allow-origin"), VALIDATION_ORIGIN)
        self.assertEqual(headers.get("vary"), "Origin")

        status, _, headers = self.request(
            "POST",
            "/api/validation/state",
            {
                "context_id": initial["context_id"],
                "expected_save_revision": 0,
                "store": example_store(),
            },
            origin=VALIDATION_ORIGIN,
        )
        self.assertEqual(status, 200)
        self.assertEqual(headers.get("access-control-allow-origin"), VALIDATION_ORIGIN)

        status, body, headers = self.request_raw(
            "OPTIONS",
            "/api/validation/state",
            None,
            origin=VALIDATION_ORIGIN,
            extra_headers={"Access-Control-Request-Method": "POST"},
        )
        self.assertEqual(status, 204)
        self.assertIsNone(body)
        self.assertEqual(headers.get("access-control-allow-origin"), VALIDATION_ORIGIN)
        self.assertIn("POST", headers.get("access-control-allow-methods", ""))
        self.assertIn("Content-Type", headers.get("access-control-allow-headers", ""))

    def test_native_same_origin_validation_can_load_and_save(self) -> None:
        native_origin = f"http://127.0.0.1:{self.port}"
        status, initial, headers = self.request(
            "GET", "/api/validation/state", origin=native_origin
        )
        self.assertEqual(status, 200)
        self.assertNotIn("access-control-allow-origin", headers)

        status, saved, headers = self.request(
            "POST",
            "/api/validation/state",
            {
                "context_id": initial["context_id"],
                "expected_save_revision": initial["save_revision"],
                "store": example_store(),
            },
            origin=native_origin,
        )
        self.assertEqual(status, 200)
        self.assertEqual(saved["save_revision"], 1)
        self.assertNotIn("access-control-allow-origin", headers)

    def test_host_document_mounts_validation_without_an_iframe(self) -> None:
        document = (server.SURVEY_DIR / "index.html").read_text(encoding="utf-8")
        self.assertIn('id="validation-root"', document)
        self.assertIn('/validation-assets/validation.js', document)
        self.assertNotIn("<iframe", document)

    def test_unapproved_validation_origin_is_rejected(self) -> None:
        status, body, headers = self.request(
            "GET",
            "/api/validation/state",
            origin="https://example.invalid",
        )
        self.assertEqual(status, 403)
        self.assertEqual(body["code"], "invalid_origin")
        self.assertNotIn("access-control-allow-origin", headers)

    def request(
        self,
        method: str,
        path: str,
        payload: dict | None = None,
        *,
        origin: str | None = None,
        content_type: str = "application/json",
    ) -> tuple[int, dict | None, dict[str, str]]:
        body = None if payload is None else json.dumps(payload)
        return self.request_raw(
            method,
            path,
            body,
            origin=origin,
            content_type=content_type,
        )

    def request_raw(
        self,
        method: str,
        path: str,
        body: str | None,
        *,
        origin: str | None = None,
        content_type: str = "application/json",
        extra_headers: dict[str, str] | None = None,
    ) -> tuple[int, dict | None, dict[str, str]]:
        connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        headers = dict(extra_headers or {})
        if body is not None:
            headers["Content-Type"] = content_type
        if origin is not None:
            headers["Origin"] = origin
        connection.request(method, path, body=body, headers=headers)
        response = connection.getresponse()
        raw_body = response.read().decode("utf-8")
        response_headers = {key.casefold(): value for key, value in response.getheaders()}
        connection.close()
        parsed = json.loads(raw_body) if raw_body else None
        return response.status, parsed, response_headers


if __name__ == "__main__":
    unittest.main()
