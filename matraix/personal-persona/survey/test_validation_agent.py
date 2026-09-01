"""Tests for isolated one-click Validation Agent runs."""

from __future__ import annotations

import http.client
import json
import shutil
import tempfile
import threading
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

    def load_persona_identity(self, path: object) -> tuple[object, str]:
        self.identity_paths.append(path)
        return (
            SimpleNamespace(display_name="Alfred", persona_id="alfred"),
            "Current persona identity",
        )

    def codex_task_reply(self, **kwargs: object) -> str:
        self.calls.append(kwargs)
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
