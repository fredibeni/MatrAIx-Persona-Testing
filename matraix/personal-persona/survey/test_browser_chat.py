"""Tests for the local browser chat service and HTTP boundary."""

from __future__ import annotations

import contextlib
import http.client
import io
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


class FakeChatHelpers:
    def __init__(self) -> None:
        self.identity_paths: list[object] = []
        self.calls: list[dict[str, object]] = []
        self.fail: Exception | None = None

    def load_identity(self, path: object) -> tuple[object, str]:
        self.identity_paths.append(path)
        persona = SimpleNamespace(display_name="Alfred", persona_id="alfred")
        return persona, "Current persona identity"

    def codex_reply(self, **kwargs: object) -> str:
        self.calls.append(kwargs)
        if self.fail is not None:
            raise self.fail
        return "Fake Codex reply"


class BrowserChatTests(unittest.TestCase):
    def setUp(self) -> None:
        source_persona = EXAMPLE_PERSONA_PATH
        self.temp_directory = tempfile.TemporaryDirectory(
            prefix="matraix-browser-chat-test-"
        )
        self.addCleanup(self.temp_directory.cleanup)
        data_dir = Path(self.temp_directory.name)
        active_persona = data_dir / "persona_alfred.yaml"
        shutil.copyfile(source_persona, active_persona)
        self.helpers = FakeChatHelpers()
        self.patchers = (
            patch.object(server, "DATA_DIR", data_dir),
            patch.object(server, "RESPONSES_PATH", data_dir / "responses.json"),
            patch.object(
                server,
                "EVENTS_PATH",
                data_dir / "response-events.jsonl",
            ),
            patch.object(
                server,
                "DERIVED_PATH",
                data_dir / "derived-dimensions.json",
            ),
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
                    fake_reply="Fixture reply <img src=x onerror=window.__xss=1>",
                ),
            ),
        )
        for active_patch in self.patchers:
            active_patch.start()
            self.addCleanup(active_patch.stop)
        with server.CHAT_HISTORY_LOCK:
            server.CHAT_MESSAGES.clear()

    def test_success_commits_ordered_turn_and_reset_clears_it(self) -> None:
        result = server.generate_chat_reply("Hello Alfred")
        self.assertEqual(
            result["messages"],
            [
                {"role": "user", "content": "Hello Alfred"},
                {
                    "role": "assistant",
                    "content": "Fixture reply <img src=x onerror=window.__xss=1>",
                },
            ],
        )
        self.assertFalse(result["busy"])
        self.assertTrue(self.helpers.identity_paths)
        self.assertEqual(
            set(self.helpers.identity_paths),
            {server.ACTIVE_PERSONA_PATH},
        )
        self.assertEqual(server.reset_chat()["messages"], [])

    def test_provider_failure_leaves_history_unchanged(self) -> None:
        server.CHAT_BACKEND = server.ChatBackend(
            codex="fake-codex",
            model="gpt-5.6-luna",
            reasoning_effort="low",
            timeout=30,
        )
        self.helpers.fail = RuntimeError("provider detail that must stay server-side")
        with self.assertRaisesRegex(RuntimeError, "provider detail"):
            server.generate_chat_reply("Do not commit this")
        self.assertEqual(server.chat_state()["messages"], [])

    def test_model_selection_is_allowlisted_and_preserves_history(self) -> None:
        server.CHAT_BACKEND = server.ChatBackend(
            codex="fake-codex",
            model="gpt-5.6-luna",
            reasoning_effort="low",
            timeout=30,
        )
        prior_messages = [
            {"role": "user", "content": "Earlier question"},
            {"role": "assistant", "content": "Earlier answer"},
        ]
        with server.CHAT_HISTORY_LOCK:
            server.CHAT_MESSAGES[:] = prior_messages

        state = server.select_chat_model("gpt-5.6-terra")
        self.assertEqual(state["model"], "gpt-5.6-terra")
        self.assertEqual(state["messages"], prior_messages)
        self.assertEqual(self.helpers.calls, [])

        for model in sorted(server.ALLOWED_CHAT_MODELS):
            with self.subTest(model=model):
                self.assertEqual(server.select_chat_model(model)["model"], model)
        server.select_chat_model("gpt-5.6-terra")

        result = server.generate_chat_reply("Continue")
        self.assertEqual(self.helpers.calls[-1]["model"], "gpt-5.6-terra")
        self.assertEqual(self.helpers.calls[-1]["conversation"][:2], prior_messages)
        self.assertEqual(result["model"], "gpt-5.6-terra")

        reset_state = server.reset_chat()
        self.assertEqual(reset_state["messages"], [])
        self.assertEqual(reset_state["model"], "gpt-5.6-terra")

        invalid_payloads = (
            {"model": "gpt-5.6-terra "},
            {"model": "openai/gpt-5.6-sol"},
            {"model": "gpt-5.6-sol\n--danger"},
            {"model": "not-a-model"},
            {"model": 42},
            {"model": "gpt-5.6-sol", "reasoning_effort": "max"},
        )
        for payload in invalid_payloads:
            with (
                self.subTest(payload=payload),
                self.assertRaises((TypeError, ValueError)),
            ):
                server.validate_chat_model(payload)

        server.CHAT_LOCK.acquire()
        try:
            with self.assertRaises(server.ChatBusyError):
                server.select_chat_model("gpt-5.6-sol")
        finally:
            server.CHAT_LOCK.release()
        self.assertEqual(server.chat_state()["model"], "gpt-5.6-terra")

    def test_message_validation_and_history_limit(self) -> None:
        with self.assertRaisesRegex(TypeError, "must be text"):
            server.validate_chat_message({"message": 42})
        with self.assertRaisesRegex(ValueError, "must not be empty"):
            server.validate_chat_message({"message": "   "})
        with self.assertRaisesRegex(ValueError, "character limit"):
            server.validate_chat_message(
                {"message": "x" * (server.MAX_CHAT_MESSAGE_CHARS + 1)}
            )
        with server.CHAT_HISTORY_LOCK:
            server.CHAT_MESSAGES[:] = [
                {"role": "user", "content": "x" * server.MAX_CHAT_HISTORY_CHARS}
            ]
        with self.assertRaises(server.ChatLimitError):
            server.generate_chat_reply("One more")

    def test_http_boundary_accepts_local_json_and_rejects_cross_origin(self) -> None:
        httpd = server.ThreadingHTTPServer(("127.0.0.1", 0), server.SurveyHandler)
        thread = threading.Thread(target=httpd.serve_forever, daemon=True)
        thread.start()
        self.addCleanup(httpd.server_close)
        self.addCleanup(httpd.shutdown)
        port = int(httpd.server_address[1])

        status, survey = self.request(port, "GET", "/api/survey")
        self.assertEqual(status, 200)
        state = survey["state"]
        definition = survey["definition"]
        self.assertEqual(state["context_id"], definition["persona"]["session_key"])
        self.assertNotIn(
            "free_text",
            {
                question["type"]
                for module in definition["modules"]
                for question in module["questions"]
            },
        )
        save_payload = {
            "answers": state["answers"],
            "visited_modules": state["visited_modules"],
            "context_id": state["context_id"],
            "persona_id": state["persona_id"],
            "baseline_sha256": state["baseline_sha256"],
            "definition_sha256": state["definition_sha256"],
            "save_revision": state["save_revision"],
        }
        status, saved = self.request(port, "POST", "/api/save", save_payload)
        self.assertEqual(status, 200)
        self.assertEqual(saved["save_revision"], state["save_revision"] + 1)
        status, stale = self.request(port, "POST", "/api/save", save_payload)
        self.assertEqual(status, 409)
        self.assertEqual(stale["code"], "persona_changed")

        status, body = self.request(port, "GET", "/api/chat/state")
        self.assertEqual(status, 200)
        self.assertTrue(body["available"])
        self.assertNotIn("Current persona identity", json.dumps(body))
        self.assertEqual(
            {item["id"] for item in body["models"]},
            server.ALLOWED_CHAT_MODELS,
        )

        status, body = self.request(
            port,
            "POST",
            "/api/chat/message",
            {"message": "Hello", "model": "not-allowed", "persona": "/tmp/nope"},
            origin=f"http://127.0.0.1:{port}",
        )
        self.assertEqual(status, 200)
        self.assertEqual(body["model"], "gpt-5.6-luna")
        self.assertEqual(len(body["messages"]), 2)

        status, body = self.request(
            port,
            "POST",
            "/api/chat/model",
            {"model": "gpt-5.6-sol"},
        )
        self.assertEqual(status, 200)
        self.assertEqual(body["model"], "gpt-5.6-sol")
        self.assertEqual(len(body["messages"]), 2)

        status, body = self.request(
            port,
            "POST",
            "/api/chat/model",
            {"model": "openai/gpt-5.6-sol"},
        )
        self.assertEqual(status, 400)
        self.assertEqual(body["code"], "invalid_model")

        status, body = self.request(port, "GET", "/api/chat/state")
        self.assertEqual(status, 200)
        self.assertEqual(body["model"], "gpt-5.6-sol")
        self.assertEqual(len(body["messages"]), 2)

        status, body = self.request(
            port,
            "POST",
            "/api/chat/model",
            {"model": "gpt-5.6-sol", "reasoning_effort": "max"},
        )
        self.assertEqual(status, 400)
        self.assertEqual(body["code"], "invalid_model")

        status, body = self.request(
            port,
            "POST",
            "/api/chat/message",
            {"message": "Cross origin"},
            origin="https://example.invalid",
        )
        self.assertEqual(status, 403)
        self.assertEqual(body["code"], "invalid_origin")

        status, body = self.request(
            port,
            "POST",
            "/api/chat/reset",
            {},
            content_type="text/plain",
        )
        self.assertEqual(status, 415)
        self.assertEqual(body["code"], "invalid_content_type")

        status, body = self.request_raw(
            port,
            "POST",
            "/api/chat/message",
            "[]",
            content_type="application/json",
        )
        self.assertEqual(status, 400)
        self.assertEqual(body["code"], "invalid_request")

        status, body = self.request_raw(
            port,
            "POST",
            "/api/chat/message",
            json.dumps({"message": "x" * server.MAX_CHAT_BODY_BYTES}),
            content_type="application/json",
        )
        self.assertEqual(status, 413)
        self.assertEqual(body["code"], "request_too_large")

        status, body = self.request(
            port,
            "POST",
            "/api/chat/reset",
            {},
            host="example.invalid",
        )
        self.assertEqual(status, 403)
        self.assertEqual(body["code"], "invalid_host")

        server.CHAT_BACKEND = server.ChatBackend(
            codex="fake-codex",
            model="gpt-5.6-luna",
            reasoning_effort="low",
            timeout=30,
        )
        self.helpers.fail = RuntimeError("private provider stderr")
        stderr = io.StringIO()
        with contextlib.redirect_stderr(stderr):
            status, body = self.request(
                port,
                "POST",
                "/api/chat/message",
                {"message": "Fail safely"},
            )
        self.assertEqual(status, 502)
        self.assertEqual(body["code"], "chat_failed")
        self.assertNotIn("private provider stderr", json.dumps(body))
        self.assertNotIn("private provider stderr", stderr.getvalue())

    @staticmethod
    def request(
        port: int,
        method: str,
        path: str,
        payload: dict | None = None,
        *,
        origin: str | None = None,
        content_type: str = "application/json",
        host: str | None = None,
    ) -> tuple[int, dict]:
        body = None if payload is None else json.dumps(payload)
        return BrowserChatTests.request_raw(
            port,
            method,
            path,
            body,
            origin=origin,
            content_type=content_type,
            host=host,
        )

    @staticmethod
    def request_raw(
        port: int,
        method: str,
        path: str,
        body: str | None,
        *,
        origin: str | None = None,
        content_type: str = "application/json",
        host: str | None = None,
    ) -> tuple[int, dict]:
        connection = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
        headers = {"Content-Type": content_type}
        if origin is not None:
            headers["Origin"] = origin
        if host is not None:
            headers["Host"] = host
        connection.request(method, path, body=body, headers=headers)
        response = connection.getresponse()
        parsed = json.loads(response.read().decode("utf-8"))
        connection.close()
        return response.status, parsed


if __name__ == "__main__":
    unittest.main()
