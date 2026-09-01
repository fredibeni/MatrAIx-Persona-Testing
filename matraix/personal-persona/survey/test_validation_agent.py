"""Tests for isolated one-click Validation Agent runs."""

from __future__ import annotations

import http.client
import json
import shutil
import tempfile
import threading
import time
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import server

EXAMPLE_PERSONA_PATH = Path(__file__).resolve().parent.parent / "persona.example.yaml"


class FakeAgentHelpers:
    def __init__(self) -> None:
        self.calls: list[dict[str, object]] = []
        self.identity_paths: list[object] = []
        self.reply = ""
        self.reply_factory = None

    def load_persona_identity(self, path: object) -> tuple[object, str]:
        self.identity_paths.append(path)
        return (
            SimpleNamespace(display_name="Alfred", persona_id="alfred"),
            "Current persona identity",
        )

    def codex_task_reply(self, **kwargs: object) -> str:
        self.calls.append(kwargs)
        if self.reply_factory is not None:
            return self.reply_factory(kwargs)
        return self.reply


def first_option_reply(survey_id: str) -> str:
    survey = server.load_validation_survey(survey_id)
    return json.dumps(
        {
            "answers": {
                question["id"]: question["options"][0]["id"]
                for question in survey["questions"]
            }
        }
    )


def first_option_reply_from_call(call: dict[str, object]) -> str:
    schema = call["output_schema"]
    assert isinstance(schema, dict)
    answers_schema = schema["properties"]["answers"]
    properties = answers_schema["properties"]
    return json.dumps(
        {
            "answers": {
                question_id: question_schema["enum"][0]
                for question_id, question_schema in properties.items()
            }
        }
    )


class ConcurrentAgentHelpers(FakeAgentHelpers):
    def __init__(self, *, fail_once: bool = False) -> None:
        super().__init__()
        self.barrier = threading.Barrier(server.VALIDATION_BATCH_MAX_WORKERS)
        self.call_lock = threading.Lock()
        self.active_calls = 0
        self.max_active_calls = 0
        self.next_call = 0
        self.fail_once = fail_once

    def codex_task_reply(self, **kwargs: object) -> str:
        with self.call_lock:
            self.calls.append(kwargs)
            self.next_call += 1
            call_number = self.next_call
            self.active_calls += 1
            self.max_active_calls = max(
                self.max_active_calls,
                self.active_calls,
            )
        try:
            self.barrier.wait(timeout=10)
            time.sleep(0.01)
            if self.fail_once and call_number == 1:
                raise TimeoutError("provider details must not reach the browser")
            return first_option_reply_from_call(kwargs)
        finally:
            with self.call_lock:
                self.active_calls -= 1


class IncrementalJournalAgentHelpers(FakeAgentHelpers):
    def __init__(self) -> None:
        super().__init__()
        self.call_lock = threading.Lock()
        self.release = threading.Event()
        self.next_call = 0

    def codex_task_reply(self, **kwargs: object) -> str:
        with self.call_lock:
            self.calls.append(kwargs)
            self.next_call += 1
            call_number = self.next_call
        if call_number != 1:
            if not self.release.wait(timeout=10):
                raise TimeoutError("test release was not signalled")
        return first_option_reply_from_call(kwargs)


class ValidationAgentTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_directory = tempfile.TemporaryDirectory(
            prefix="matraix-validation-agent-test-"
        )
        self.addCleanup(self.temp_directory.cleanup)
        data_dir = Path(self.temp_directory.name)
        active_persona = data_dir / "persona_alfred.yaml"
        shutil.copyfile(EXAMPLE_PERSONA_PATH, active_persona)
        self.helpers = FakeAgentHelpers()
        self.patchers = (
            patch.object(server, "DATA_DIR", data_dir),
            patch.object(server, "RESPONSES_PATH", data_dir / "responses.json"),
            patch.object(server, "EVENTS_PATH", data_dir / "response-events.jsonl"),
            patch.object(server, "DERIVED_PATH", data_dir / "derived-dimensions.json"),
            patch.object(server, "ACTIVE_PERSONA_PATH", active_persona),
            patch.object(server, "PERSONA_STORE_DIR", data_dir / "personas"),
            patch.object(
                server,
                "PERSONA_REGISTRY_PATH",
                data_dir / "persona-registry.json",
            ),
            patch.object(server, "CHAT_HELPERS", self.helpers),
            patch.object(server, "CHAT_SETUP_ERROR", None),
            patch.object(
                server,
                "CHAT_BACKEND",
                server.ChatBackend(
                    codex="fake-codex",
                    model="gpt-5.6-luna",
                    reasoning_effort="low",
                    timeout=30,
                ),
            ),
        )
        for active_patch in self.patchers:
            active_patch.start()
            self.addCleanup(active_patch.stop)
        with server.CHAT_HISTORY_LOCK:
            server.CHAT_MESSAGES[:] = [
                {"role": "user", "content": "SECRET PRIOR CHAT SENTINEL"},
                {"role": "assistant", "content": "SECRET PRIOR REPLY"},
            ]

    def payload(self, survey_id: str = "everyday") -> dict[str, str]:
        state = server.active_validation_state()
        return {
            "survey_id": survey_id,
            "context_id": state["context_id"],
            "persona_revision": state["persona_revision"],
        }

    def batch_payload(self) -> dict[str, object]:
        state = server.active_validation_state()
        return {
            "context_id": state["context_id"],
            "persona_revision": state["persona_revision"],
            "runs_per_survey": 10,
        }

    def test_each_run_is_one_shot_and_excludes_chat_history(self) -> None:
        self.helpers.reply = first_option_reply("everyday")
        first = server.generate_validation_agent_run(self.payload())
        second = server.generate_validation_agent_run(self.payload())

        self.assertEqual(first["answers"], second["answers"])
        self.assertEqual(first["execution"]["mode"], "codex-ephemeral")
        self.assertEqual(first["execution"]["prior_conversation_messages"], 0)
        self.assertEqual(len(self.helpers.calls), 2)
        self.assertEqual(
            set(self.helpers.identity_paths),
            {server.ACTIVE_PERSONA_PATH},
        )
        for call in self.helpers.calls:
            self.assertNotIn("conversation", call)
            self.assertEqual(call["identity"], "Current persona identity")
            self.assertNotIn("SECRET PRIOR CHAT SENTINEL", str(call))
            self.assertNotIn("SECRET PRIOR REPLY", str(call))
            self.assertIn("<validation_survey_json>", str(call["task"]))
        with server.CHAT_HISTORY_LOCK:
            self.assertEqual(
                server.CHAT_MESSAGES,
                [
                    {"role": "user", "content": "SECRET PRIOR CHAT SENTINEL"},
                    {"role": "assistant", "content": "SECRET PRIOR REPLY"},
                ],
            )

    def test_request_and_output_are_strictly_validated(self) -> None:
        payload = self.payload()
        with self.assertRaisesRegex(TypeError, "Expected only"):
            server.validate_validation_agent_request(
                {**payload, "messages": ["must not be accepted"]}
            )
        with self.assertRaises(server.PersonaContextChangedError):
            server.generate_validation_agent_run(
                {**payload, "persona_revision": "0" * 64}
            )

        survey = server.load_validation_survey("everyday")
        self.helpers.reply = json.dumps(
            {"answers": {survey["questions"][0]["id"]: "not-an-option"}}
        )
        with self.assertRaises(server.ValidationAgentOutputError):
            server.generate_validation_agent_run(payload)

    def test_batch_request_is_exact_and_requires_ten_runs(self) -> None:
        payload = self.batch_payload()
        self.assertEqual(
            server.validate_validation_agent_batch_request(payload),
            (payload["context_id"], payload["persona_revision"], 10),
        )
        with self.assertRaisesRegex(TypeError, "Expected only"):
            server.validate_validation_agent_batch_request(
                {**payload, "survey_id": "everyday"}
            )
        for invalid_count in (0, 1, 9, 11, True, "10"):
            with self.subTest(runs_per_survey=invalid_count):
                with self.assertRaisesRegex(ValueError, "exactly 10"):
                    server.validate_validation_agent_batch_request(
                        {**payload, "runs_per_survey": invalid_count}
                    )

    def test_batch_checks_persona_revision_before_and_after_workers(self) -> None:
        payload = self.batch_payload()
        with self.assertRaises(server.PersonaContextChangedError):
            server.generate_validation_agent_batch(
                {**payload, "persona_revision": "0" * 64}
            )
        self.assertEqual(self.helpers.calls, [])

        mutation_lock = threading.Lock()
        mutated = False

        def reply_and_change_persona(call: dict[str, object]) -> str:
            nonlocal mutated
            with mutation_lock:
                if not mutated:
                    original = server.ACTIVE_PERSONA_PATH.read_text(encoding="utf-8")
                    server.ACTIVE_PERSONA_PATH.write_text(
                        original + "\n# changed during batch\n",
                        encoding="utf-8",
                    )
                    mutated = True
            return first_option_reply_from_call(call)

        self.helpers.reply_factory = reply_and_change_persona
        with self.assertRaises(server.PersonaContextChangedError):
            server.generate_validation_agent_batch(payload)
        self.assertEqual(len(self.helpers.calls), 40)

    def test_batch_runs_all_forty_agents_concurrently_in_stable_order(
        self,
    ) -> None:
        concurrent_helpers = ConcurrentAgentHelpers()
        with patch.object(server, "CHAT_HELPERS", concurrent_helpers):
            result = server.generate_validation_agent_batch(self.batch_payload())

        expected_order = [
            (survey_id, response_index)
            for survey_id in server.VALIDATION_SURVEY_ORDER
            for response_index in range(1, 11)
        ]
        self.assertEqual(
            [
                (entry["survey_id"], entry["response_index"])
                for entry in result["results"]
            ],
            expected_order,
        )
        self.assertEqual(concurrent_helpers.max_active_calls, 40)
        self.assertEqual(len(concurrent_helpers.calls), 40)
        self.assertEqual(len(concurrent_helpers.identity_paths), 1)
        self.assertEqual(result["requested_runs"], 40)
        self.assertEqual(result["succeeded_runs"], 40)
        self.assertEqual(result["failed_runs"], 0)
        self.assertTrue(result["batch_id"].startswith("validation-batch-"))
        self.assertTrue(all(entry["ok"] for entry in result["results"]))

    def test_background_batch_journals_each_completion_before_returning(
        self,
    ) -> None:
        helpers = IncrementalJournalAgentHelpers()
        with patch.object(server, "CHAT_HELPERS", helpers):
            started = server.start_validation_agent_batch(self.batch_payload())
            batch_id = started["batch_id"]
            self.assertEqual(started["status"], "running")
            self.assertEqual(started["completed_runs"], 0)
            self.assertTrue(server.VALIDATION_AGENT_LOCK.locked())
            try:
                deadline = time.monotonic() + 5
                progress = started
                while time.monotonic() < deadline:
                    progress = server.validation_agent_batch_status(batch_id)
                    if progress["completed_runs"] >= 1:
                        break
                    time.sleep(0.01)
                self.assertEqual(progress["status"], "running")
                self.assertGreaterEqual(progress["completed_runs"], 1)
                self.assertEqual(
                    progress["completed_runs"],
                    len(progress["results"]),
                )
            finally:
                helpers.release.set()

            with server.VALIDATION_AGENT_BATCH_THREADS_LOCK:
                batch_thread = server.VALIDATION_AGENT_BATCH_THREADS.get(batch_id)
            self.assertIsNotNone(batch_thread)
            assert batch_thread is not None
            batch_thread.join(timeout=10)
            self.assertFalse(batch_thread.is_alive())
            completed = server.validation_agent_batch_status(batch_id)
            self.assertEqual(completed["status"], "complete")
            self.assertEqual(completed["completed_runs"], 40)
            self.assertEqual(completed["succeeded_runs"], 40)
            self.assertFalse(server.VALIDATION_AGENT_LOCK.locked())

    def test_orphaned_journal_exposes_saved_partial_successes(self) -> None:
        self.helpers.reply = first_option_reply("everyday")
        payload = self.batch_payload()
        prepared = server.prepare_validation_agent_context(
            str(payload["context_id"]),
            str(payload["persona_revision"]),
        )
        success = {
            **server.generate_validation_agent_run_unlocked(
                "everyday",
                server.load_validation_survey("everyday"),
                prepared,
            ),
            "response_index": 1,
        }
        batch_id = f"validation-batch-{'a' * 24}"
        journal = server.validation_agent_batch_document(
            prepared,
            batch_id,
            10,
            "2026-09-01T09:00:00Z",
            [success],
            status="running",
        )
        path = server.validation_agent_batch_journal_path(
            prepared.results_directory,
            batch_id,
        )
        server.write_validation_agent_batch_journal(path, journal)

        recovered = server.validation_agent_batch_status(batch_id)
        self.assertEqual(recovered["status"], "complete")
        self.assertEqual(recovered["succeeded_runs"], 1)
        self.assertEqual(recovered["failed_runs"], 39)
        self.assertEqual(recovered["results"][0]["survey_id"], "everyday")
        self.assertTrue(recovered["results"][0]["ok"])
        self.assertEqual(
            {entry.get("code") for entry in recovered["results"] if not entry["ok"]},
            {"agent_interrupted"},
        )
        pending = server.pending_validation_agent_batches()
        self.assertEqual(
            [batch["batch_id"] for batch in pending["batches"]],
            [batch_id],
        )

        validation_results = {
            "store": {
                "surveys": {
                    "everyday": {
                        "agentRuns": [
                            {
                                "experiment": {
                                    "id": batch_id,
                                    "responseIndex": 1,
                                }
                            }
                        ]
                    }
                }
            }
        }
        (prepared.results_directory / server.VALIDATION_RESULTS_FILENAME).write_text(
            json.dumps(validation_results),
            encoding="utf-8",
        )
        self.assertEqual(
            server.pending_validation_agent_batches()["batches"],
            [],
        )

    def test_batch_returns_safe_failures_without_suppressing_successes(
        self,
    ) -> None:
        concurrent_helpers = ConcurrentAgentHelpers(fail_once=True)
        with patch.object(server, "CHAT_HELPERS", concurrent_helpers):
            result = server.generate_validation_agent_batch(self.batch_payload())

        self.assertEqual(result["succeeded_runs"], 39)
        self.assertEqual(result["failed_runs"], 1)
        self.assertEqual(len(result["results"]), 40)
        failure = next(entry for entry in result["results"] if not entry["ok"])
        self.assertEqual(failure["code"], "agent_timeout")
        self.assertEqual(failure["error"], "The Agent run did not finish in time.")
        self.assertNotIn("provider details", str(failure))

    def test_single_and_batch_calls_share_one_nonblocking_lock(self) -> None:
        self.assertTrue(server.VALIDATION_AGENT_LOCK.acquire(blocking=False))
        try:
            with self.assertRaises(server.ValidationAgentBusyError):
                server.generate_validation_agent_run(self.payload())
            with self.assertRaises(server.ValidationAgentBusyError):
                server.generate_validation_agent_batch(self.batch_payload())
        finally:
            server.VALIDATION_AGENT_LOCK.release()

    def test_http_endpoint_returns_a_complete_isolated_result(self) -> None:
        self.helpers.reply = first_option_reply("everyday")
        httpd = server.ThreadingHTTPServer(("127.0.0.1", 0), server.SurveyHandler)
        thread = threading.Thread(target=httpd.serve_forever, daemon=True)
        thread.start()
        self.addCleanup(httpd.server_close)
        self.addCleanup(httpd.shutdown)

        connection = http.client.HTTPConnection(
            "127.0.0.1", int(httpd.server_address[1]), timeout=5
        )
        connection.request(
            "POST",
            "/api/validation/agent-run",
            body=json.dumps(self.payload()),
            headers={"Content-Type": "application/json"},
        )
        response = connection.getresponse()
        body = json.loads(response.read().decode("utf-8"))
        connection.close()

        self.assertEqual(response.status, 200)
        self.assertTrue(body["ok"])
        self.assertEqual(body["survey_id"], "everyday")
        self.assertEqual(
            set(body["answers"]),
            {
                question["id"]
                for question in server.load_validation_survey("everyday")[
                    "questions"
                ]
            },
        )

    def test_http_batch_endpoint_returns_all_ordered_results(self) -> None:
        self.helpers.reply_factory = first_option_reply_from_call
        httpd = server.ThreadingHTTPServer(("127.0.0.1", 0), server.SurveyHandler)
        thread = threading.Thread(target=httpd.serve_forever, daemon=True)
        thread.start()
        self.addCleanup(httpd.server_close)
        self.addCleanup(httpd.shutdown)

        connection = http.client.HTTPConnection(
            "127.0.0.1", int(httpd.server_address[1]), timeout=10
        )
        connection.request(
            "POST",
            "/api/validation/agent-batch",
            body=json.dumps(self.batch_payload()),
            headers={"Content-Type": "application/json"},
        )
        response = connection.getresponse()
        body = json.loads(response.read().decode("utf-8"))
        connection.close()

        self.assertEqual(response.status, 202)
        self.assertTrue(body["ok"])
        self.assertEqual(body["runs_per_survey"], 10)
        self.assertEqual(body["status"], "running")
        self.assertEqual(body["completed_runs"], 0)

        deadline = time.monotonic() + 10
        while time.monotonic() < deadline:
            status_connection = http.client.HTTPConnection(
                "127.0.0.1", int(httpd.server_address[1]), timeout=5
            )
            status_connection.request(
                "GET",
                f"/api/validation/agent-batch?batch_id={body['batch_id']}",
            )
            status_response = status_connection.getresponse()
            completed = json.loads(status_response.read().decode("utf-8"))
            status_connection.close()
            self.assertEqual(status_response.status, 200)
            if completed["status"] == "complete":
                break
            time.sleep(0.01)
        self.assertEqual(completed["status"], "complete")
        self.assertEqual(completed["succeeded_runs"], 40)
        self.assertEqual(len(completed["results"]), 40)
        self.assertEqual(
            (
                completed["results"][0]["survey_id"],
                completed["results"][0]["response_index"],
            ),
            ("everyday", 1),
        )
        self.assertEqual(
            (
                completed["results"][-1]["survey_id"],
                completed["results"][-1]["response_index"],
            ),
            ("internet-creature", 10),
        )

        options_connection = http.client.HTTPConnection(
            "127.0.0.1", int(httpd.server_address[1]), timeout=5
        )
        options_connection.request(
            "OPTIONS",
            "/api/validation/agent-batch",
            headers={"Origin": "http://127.0.0.1:8767"},
        )
        options_response = options_connection.getresponse()
        options_response.read()
        options_connection.close()
        self.assertEqual(options_response.status, 204)
        self.assertEqual(
            options_response.getheader("Access-Control-Allow-Origin"),
            "http://127.0.0.1:8767",
        )
        self.assertEqual(
            options_response.getheader("Access-Control-Allow-Methods"),
            "GET, POST, OPTIONS",
        )


class CodexIsolationCommandTests(unittest.TestCase):
    def test_task_helper_uses_ephemeral_codex_without_resume_or_tools(self) -> None:
        helpers = server.load_chat_helpers()
        captured: dict[str, object] = {}

        def fake_run(command: list[str], **kwargs: object) -> SimpleNamespace:
            captured["command"] = command
            captured["cwd"] = kwargs.get("cwd")
            captured["prompt"] = kwargs.get("input")
            output_path = Path(command[command.index("-o") + 1])
            output_path.write_text('{"answers":{"q":"a"}}', encoding="utf-8")
            return SimpleNamespace(returncode=0, stdout="", stderr="")

        with patch.object(helpers.subprocess, "run", side_effect=fake_run):
            reply = helpers.codex_task_reply(
                codex="codex",
                model="gpt-5.6-luna",
                reasoning_effort="low",
                identity="Only this persona identity",
                task="Choose an answer",
                output_schema={
                    "type": "object",
                    "properties": {
                        "answers": {
                            "type": "object",
                            "properties": {"q": {"type": "string", "enum": ["a"]}},
                            "required": ["q"],
                            "additionalProperties": False,
                        }
                    },
                    "required": ["answers"],
                    "additionalProperties": False,
                },
                timeout=30,
                env={},
            )

        self.assertEqual(reply, '{"answers":{"q":"a"}}')
        command = captured["command"]
        self.assertIsInstance(command, list)
        assert isinstance(command, list)
        for flag in (
            "--ephemeral",
            "--ignore-user-config",
            "--ignore-rules",
            "--output-schema",
        ):
            self.assertIn(flag, command)
        self.assertNotIn("resume", command)
        self.assertNotIn("fork", command)
        for feature in ("memories", "shell_tool", "browser_use", "multi_agent"):
            self.assertIn(feature, command)
        self.assertIn("There is no prior conversation.", str(captured["prompt"]))


if __name__ == "__main__":
    unittest.main()
