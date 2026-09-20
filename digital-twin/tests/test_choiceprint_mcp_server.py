from __future__ import annotations

import hashlib
import importlib.metadata
import importlib.util
import os
import shutil
import sys
import tempfile
import time
import unittest
from unittest import mock
from pathlib import Path
from typing import Any


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
SERVER_PATH = REPOSITORY_ROOT / "digital-twin/scripts/serve_choiceprint_mcp.py"
RETRIEVER_PATH = (
    REPOSITORY_ROOT / "digital-twin/scripts/retrieve_choiceprint_context.py"
)
EXAMPLE_PACK = REPOSITORY_ROOT / "digital-twin/templates/example.choiceprint"
SCENARIO = {
    "domain": "analysis",
    "stakes": "medium",
    "summary": "Verify an important calculation before publishing",
}

MCP_AVAILABLE = importlib.util.find_spec("mcp") is not None
if MCP_AVAILABLE:
    from mcp import Client, StdioServerParameters
    from mcp.client.streamable_http import streamable_http_client
    from mcp.server.auth.provider import AccessToken
    from mcp.server.auth.settings import AuthSettings
    import httpx2


HTTP_RESOURCE = "https://choiceprint.example/mcp"
HTTP_ORIGIN = "https://choiceprint.example"
HTTP_ISSUER = "https://auth.choiceprint.example"
HTTP_TEST_TOKEN = "fixture-valid-token"
HTTP_OTHER_TOKEN = "fixture-other-token"
HTTP_OTHER_CLIENT_TOKEN = "fixture-other-client-token"
HTTP_OWNER_SUBJECT = "fixture-owner"


class FixtureTokenVerifier:
    """Test-only verifier with no network or production credential behavior."""

    def __init__(self) -> None:
        self.seen_tokens: list[str] = []

    async def verify_token(self, token: str) -> Any:
        self.seen_tokens.append(token)
        if token not in {
            HTTP_TEST_TOKEN,
            HTTP_OTHER_TOKEN,
            HTTP_OTHER_CLIENT_TOKEN,
        }:
            return None
        return AccessToken(
            token=token,
            client_id=(
                "fixture-other-client"
                if token == HTTP_OTHER_CLIENT_TOKEN
                else "fixture-client"
            ),
            scopes=["choiceprint.context.read"],
            resource=HTTP_RESOURCE,
            subject=(
                HTTP_OWNER_SUBJECT
                if token == HTTP_TEST_TOKEN
                or token == HTTP_OTHER_CLIENT_TOKEN
                else "fixture-other-owner"
            ),
            expires_at=int(time.time()) + 3600,
            claims={"iss": HTTP_ISSUER, "nbf": 0},
        )


class StaticTokenVerifier:
    """Test verifier returning one preconstructed access-token result."""

    def __init__(self, access_token: Any) -> None:
        self.access_token = access_token
        self.seen_tokens: list[str] = []

    async def verify_token(self, token: str) -> Any:
        self.seen_tokens.append(token)
        return self.access_token


def load_module(name: str, path: Path) -> Any:
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"could not load test module: {path.name}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def pack_digest(root: Path) -> str:
    digest = hashlib.sha256()
    for path in sorted(item for item in root.rglob("*") if item.is_file()):
        digest.update(path.relative_to(root).as_posix().encode("utf-8"))
        digest.update(b"\0")
        digest.update(path.read_bytes())
    return digest.hexdigest()


@unittest.skipUnless(MCP_AVAILABLE, "optional mcp dependency is not installed")
class ChoiceprintMcpServerTests(unittest.IsolatedAsyncioTestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.server_module = load_module("choiceprint_mcp_server_test", SERVER_PATH)
        cls.retriever_module = load_module(
            "choiceprint_mcp_retriever_test", RETRIEVER_PATH
        )

    def build_server(self, pack: Path = EXAMPLE_PACK) -> Any:
        return self.server_module.build_server(
            pack,
            acknowledge_development_only=True,
            allow_private_chatgpt_access=True,
        )

    def build_http_auth(self, **overrides: Any) -> Any:
        values = {
            "issuer_url": HTTP_ISSUER,
            "resource_server_url": HTTP_RESOURCE,
            "validate_token_resource": True,
            "required_scopes": ["choiceprint.context.read"],
        }
        values.update(overrides)
        return AuthSettings(**values)

    def build_http_app(
        self,
        verifier: Any | None = None,
        auth: Any | None = None,
    ) -> tuple[Any, Any]:
        verifier = verifier or FixtureTokenVerifier()
        auth = auth or self.build_http_auth()
        app = self.server_module.build_http_app(
            EXAMPLE_PACK,
            acknowledge_development_only=True,
            allow_private_chatgpt_access=True,
            token_verifier=verifier,
            auth=auth,
            authorized_subject=HTTP_OWNER_SUBJECT,
        )
        return app, verifier

    def test_startup_requires_explicit_private_access(self) -> None:
        with self.assertRaisesRegex(
            self.server_module.ServerConfigurationError,
            "explicit acknowledgement",
        ):
            self.server_module.build_server(
                EXAMPLE_PACK,
                acknowledge_development_only=True,
                allow_private_chatgpt_access=False,
            )

    def test_startup_requires_development_acknowledgement(self) -> None:
        with self.assertRaisesRegex(
            self.server_module.ServerConfigurationError,
            "development-only",
        ):
            self.server_module.build_server(
                EXAMPLE_PACK,
                acknowledge_development_only=False,
                allow_private_chatgpt_access=True,
            )

    def test_runtime_matches_pinned_mcp_version(self) -> None:
        requirements = (
            REPOSITORY_ROOT / "digital-twin/requirements-mcp.txt"
        ).read_text(encoding="utf-8")
        pins = [
            line.strip()
            for line in requirements.splitlines()
            if line.strip() and not line.lstrip().startswith("#")
        ]
        self.assertEqual(pins, ["mcp==2.2.0"])
        self.assertEqual(importlib.metadata.version("mcp"), "2.2.0")

    async def test_lists_exactly_one_read_only_closed_world_tool(self) -> None:
        async with Client(self.build_server(), raise_exceptions=True) as client:
            listed = await client.list_tools()

        self.assertEqual([tool.name for tool in listed.tools], ["get_twin_context"])
        tool = listed.tools[0]
        self.assertTrue(tool.annotations.read_only_hint)
        self.assertFalse(tool.annotations.destructive_hint)
        self.assertFalse(tool.annotations.open_world_hint)
        self.assertTrue(tool.annotations.idempotent_hint)
        self.assertIsNone(tool.meta)
        self.assertFalse(tool.output_schema["additionalProperties"])
        self.assertEqual(
            set(tool.output_schema["required"]),
            {
                "status",
                "mode",
                "request_at",
                "context",
                "evidence_ids",
                "unknowns",
                "exclusions",
                "selection",
                "budget",
            },
        )
        self.assertNotIn("pack_path", tool.input_schema["properties"])
        self.assertNotIn("request_at", tool.input_schema["properties"])
        self.assertEqual(
            tool.input_schema["properties"]["mode"]["enum"],
            ["predict-choice", "write-in-style"],
        )
        budget = tool.input_schema["properties"]["max_context_bytes"]
        self.assertEqual(budget["maximum"], 12_000)

    async def test_in_memory_tool_matches_direct_retrieval_context(self) -> None:
        before = pack_digest(EXAMPLE_PACK)
        async with Client(self.build_server(), raise_exceptions=True) as client:
            result = await client.call_tool(
                "get_twin_context",
                {
                    "scenario": SCENARIO,
                    "mode": "predict-choice",
                    "max_context_bytes": 12_000,
                },
            )
        direct = self.retriever_module.get_twin_context(
            EXAMPLE_PACK,
            mode="predict-choice",
            scenario=SCENARIO,
            max_context_bytes=12_000,
        )

        self.assertFalse(result.is_error)
        self.assertEqual(result.structured_content["status"], direct["status"])
        self.assertEqual(result.structured_content["context"], direct["context"])
        self.assertEqual(
            result.structured_content["evidence_ids"], direct["evidence_ids"]
        )
        self.assertEqual(pack_digest(EXAMPLE_PACK), before)

    async def test_unconsented_supported_mode_returns_no_personal_context(self) -> None:
        async with Client(self.build_server(), raise_exceptions=True) as client:
            result = await client.call_tool(
                "get_twin_context",
                {
                    "scenario": SCENARIO,
                    "mode": "write-in-style",
                    "max_context_bytes": 12_000,
                },
            )

        self.assertTrue(result.is_error)
        self.assertIsNone(result.structured_content)
        rendered = "\n".join(
            block.text for block in result.content if hasattr(block, "text")
        )
        self.assertEqual(
            rendered,
            "Error executing tool get_twin_context: Choiceprint context is not authorized",
        )

    async def test_schema_rejects_action_mode_unknown_field_and_large_budget(self) -> None:
        requests = (
            {
                "scenario": SCENARIO,
                "mode": "draft-action",
                "max_context_bytes": 12_000,
            },
            {
                "scenario": {**SCENARIO, "pack_path": "/private/owner.pack"},
                "mode": "predict-choice",
                "max_context_bytes": 12_000,
            },
            {
                "scenario": SCENARIO,
                "mode": "predict-choice",
                "max_context_bytes": 12_001,
            },
        )
        async with Client(self.build_server()) as client:
            results = [
                await client.call_tool("get_twin_context", request)
                for request in requests
            ]

        self.assertTrue(all(result.is_error for result in results))

    async def test_oversized_payload_fails_without_releasing_context(self) -> None:
        async with Client(self.build_server(), raise_exceptions=True) as client:
            result = await client.call_tool(
                "get_twin_context",
                {
                    "scenario": {**SCENARIO, "summary": "x" * 70_000},
                    "mode": "predict-choice",
                    "max_context_bytes": 12_000,
                },
            )

        self.assertTrue(result.is_error)
        self.assertIsNone(result.structured_content)
        rendered = "\n".join(
            block.text for block in result.content if hasattr(block, "text")
        )
        self.assertEqual(
            rendered,
            "Error executing tool get_twin_context: Choiceprint context is unavailable",
        )

    async def test_retrieval_snapshot_cannot_bypass_development_acknowledgement(
        self,
    ) -> None:
        retriever = mock.Mock()
        retriever._load_pack.return_value = {
            "manifest": {"coverage": {"status": "validated"}},
            "consent": {
                "owner_authorized": True,
                "allowed_modes": ["predict-choice"],
            },
        }
        retriever.get_twin_context.return_value = {
            "status": "ok",
            "context": {
                "coverage": {"status": "development_only"},
                "boundaries": {},
                "selected_records": {"claims": [{"id": "private-claim"}]},
            },
            "evidence_ids": ["private-source"],
        }
        with mock.patch.object(
            self.server_module,
            "_load_retriever",
            return_value=retriever,
        ):
            server = self.server_module.build_server(
                EXAMPLE_PACK,
                acknowledge_development_only=False,
                allow_private_chatgpt_access=True,
            )
            async with Client(server, raise_exceptions=True) as client:
                result = await client.call_tool(
                    "get_twin_context",
                    {
                        "scenario": SCENARIO,
                        "mode": "predict-choice",
                        "max_context_bytes": 12_000,
                    },
                )

        self.assertTrue(result.is_error)
        self.assertIsNone(result.structured_content)
        rendered = "\n".join(
            block.text for block in result.content if hasattr(block, "text")
        )
        self.assertEqual(
            rendered,
            "Error executing tool get_twin_context: Choiceprint context is not authorized",
        )
        retriever.get_twin_context.assert_called_once()
        self.assertNotIn("private-claim", rendered)
        self.assertNotIn("private-source", rendered)

    async def test_runtime_pack_failure_does_not_disclose_local_path(self) -> None:
        with tempfile.TemporaryDirectory(dir="/private/tmp") as temporary:
            pack = Path(temporary) / "private-owner.choiceprint"
            shutil.copytree(EXAMPLE_PACK, pack)
            pack.chmod(0o700)
            for directory in [pack, *(p for p in pack.rglob("*") if p.is_dir())]:
                directory.chmod(0o700)
            for file_path in (p for p in pack.rglob("*") if p.is_file()):
                file_path.chmod(0o600)
            server = self.build_server(pack)
            manifest = pack / "manifest.json"
            manifest.write_text("{}\n", encoding="utf-8")
            manifest.chmod(0o600)

            async with Client(server, raise_exceptions=True) as client:
                result = await client.call_tool(
                    "get_twin_context",
                    {
                        "scenario": SCENARIO,
                        "mode": "predict-choice",
                        "max_context_bytes": 12_000,
                    },
                )

            self.assertTrue(result.is_error)
            self.assertIsNone(result.structured_content)
            rendered = "\n".join(
                block.text for block in result.content if hasattr(block, "text")
            )
            self.assertEqual(
                rendered,
                "Error executing tool get_twin_context: Choiceprint context is unavailable",
            )
            self.assertNotIn(str(pack), rendered)
            self.assertNotIn("traceback", rendered.casefold())

    async def test_retriever_tool_error_is_sanitized(self) -> None:
        retriever = mock.Mock()
        retriever._load_pack.return_value = {
            "manifest": {"coverage": {"status": "development_only"}},
            "consent": {
                "owner_authorized": True,
                "allowed_modes": ["predict-choice"],
            },
        }
        retriever.get_twin_context.side_effect = self.server_module.ToolError(
            "private marker /private/owner.choiceprint"
        )
        with mock.patch.object(
            self.server_module,
            "_load_retriever",
            return_value=retriever,
        ):
            server = self.server_module.build_server(
                EXAMPLE_PACK,
                acknowledge_development_only=True,
                allow_private_chatgpt_access=True,
            )
            async with Client(server, raise_exceptions=True) as client:
                result = await client.call_tool(
                    "get_twin_context",
                    {
                        "scenario": SCENARIO,
                        "mode": "predict-choice",
                        "max_context_bytes": 12_000,
                    },
                )

        self.assertTrue(result.is_error)
        self.assertIsNone(result.structured_content)
        rendered = "\n".join(
            block.text for block in result.content if hasattr(block, "text")
        )
        self.assertEqual(
            rendered,
            "Error executing tool get_twin_context: Choiceprint context is unavailable",
        )
        self.assertNotIn("private marker", rendered)
        self.assertNotIn("/private/owner.choiceprint", rendered)

    async def test_stdio_round_trip_uses_public_fixture_only(self) -> None:
        environment = {
            "PATH": os.environ.get("PATH", ""),
            "PYTHONDONTWRITEBYTECODE": "1",
        }
        params = StdioServerParameters(
            command=sys.executable,
            args=[
                str(SERVER_PATH),
                "--pack",
                str(EXAMPLE_PACK),
                "--acknowledge-development-only",
                "--allow-private-chatgpt-access",
            ],
            cwd=REPOSITORY_ROOT,
            env=environment,
        )

        async with Client(params, raise_exceptions=True) as client:
            listed = await client.list_tools()
            result = await client.call_tool(
                "get_twin_context",
                {
                    "scenario": SCENARIO,
                    "mode": "predict-choice",
                    "max_context_bytes": 12_000,
                },
            )

        self.assertEqual([tool.name for tool in listed.tools], ["get_twin_context"])
        self.assertFalse(result.is_error)
        self.assertEqual(result.structured_content["status"], "ok")

    def test_http_factory_requires_audience_bound_auth_and_read_scope(self) -> None:
        verifier = FixtureTokenVerifier()
        unsafe_settings = (
            self.build_http_auth(validate_token_resource=False),
            self.build_http_auth(required_scopes=[]),
            self.build_http_auth(
                resource_server_url=None,
                validate_token_resource=False,
            ),
            self.build_http_auth(issuer_url="http://auth.choiceprint.example"),
            self.build_http_auth(
                issuer_url="https://auth.choiceprint.example?tenant=fixture"
            ),
            self.build_http_auth(
                resource_server_url="https://choiceprint.example/not-mcp"
            ),
            self.build_http_auth(
                resource_server_url="https://choiceprint.example/mcp?tenant=fixture"
            ),
        )
        for auth in unsafe_settings:
            with self.subTest(auth=auth), self.assertRaises(
                self.server_module.ServerConfigurationError
            ):
                self.server_module.build_http_app(
                    EXAMPLE_PACK,
                    acknowledge_development_only=True,
                    allow_private_chatgpt_access=True,
                    token_verifier=verifier,
                    auth=auth,
                    authorized_subject=HTTP_OWNER_SUBJECT,
                )

        with self.assertRaises(self.server_module.ServerConfigurationError):
            self.server_module.build_http_app(
                EXAMPLE_PACK,
                acknowledge_development_only=True,
                allow_private_chatgpt_access=True,
                token_verifier=object(),
                auth=self.build_http_auth(),
                authorized_subject=HTTP_OWNER_SUBJECT,
            )
        with self.assertRaises(self.server_module.ServerConfigurationError):
            self.server_module.build_server(
                EXAMPLE_PACK,
                acknowledge_development_only=True,
                allow_private_chatgpt_access=True,
                token_verifier=FixtureTokenVerifier(),
                auth=self.build_http_auth(validate_token_resource=False),
                authorized_subject=HTTP_OWNER_SUBJECT,
            )

        for subject in (None, "", " fixture-owner", "fixture-owner\n"):
            with self.subTest(subject=subject), self.assertRaises(
                self.server_module.ServerConfigurationError
            ):
                self.server_module.build_http_app(
                    EXAMPLE_PACK,
                    acknowledge_development_only=True,
                    allow_private_chatgpt_access=True,
                    token_verifier=verifier,
                    auth=self.build_http_auth(),
                    authorized_subject=subject,
                )

    def test_http_factory_sets_bounded_stateful_transport(self) -> None:
        verifier = FixtureTokenVerifier()
        sentinel_app = object()
        with mock.patch.object(
            self.server_module.MCPServer,
            "streamable_http_app",
            return_value=sentinel_app,
        ) as app_builder:
            app = self.server_module.build_http_app(
                EXAMPLE_PACK,
                acknowledge_development_only=True,
                allow_private_chatgpt_access=True,
                token_verifier=verifier,
                auth=self.build_http_auth(),
                authorized_subject=HTTP_OWNER_SUBJECT,
            )

        self.assertIs(app, sentinel_app)
        call = app_builder.call_args.kwargs
        self.assertEqual(call["streamable_http_path"], "/mcp")
        self.assertTrue(call["json_response"])
        self.assertFalse(call["stateless_http"])
        self.assertEqual(call["max_request_body_size"], 64 * 1024)
        self.assertEqual(call["session_idle_timeout"], 5 * 60)
        self.assertEqual(call["max_sessions"], 8)
        self.assertEqual(call["host"], "choiceprint.example")
        security = call["transport_security"]
        self.assertTrue(security.enable_dns_rebinding_protection)
        self.assertEqual(
            security.allowed_hosts,
            ["choiceprint.example", "choiceprint.example:443"],
        )
        self.assertEqual(security.allowed_origins, [HTTP_ORIGIN])

    async def test_http_rejects_missing_and_invalid_bearer_tokens(self) -> None:
        app, verifier = self.build_http_app()
        transport = httpx2.ASGITransport(app=app)
        async with app.router.lifespan_context(app):
            async with httpx2.AsyncClient(
                transport=transport,
                base_url=HTTP_ORIGIN,
            ) as client:
                missing = await client.post("/mcp", json={})
                invalid = await client.post(
                    "/mcp",
                    json={},
                    headers={"Authorization": "Bearer fixture-invalid-token"},
                )
                metadata = await client.get(
                    "/.well-known/oauth-protected-resource/mcp"
                )

        self.assertEqual(missing.status_code, 401)
        self.assertEqual(invalid.status_code, 401)
        self.assertIn("Authentication required", missing.text)
        self.assertIn("Authentication required", invalid.text)
        self.assertIn(
            "/.well-known/oauth-protected-resource/mcp",
            missing.headers["www-authenticate"],
        )
        self.assertNotIn(HTTP_TEST_TOKEN, missing.text + invalid.text)
        self.assertEqual(verifier.seen_tokens, ["fixture-invalid-token"])
        self.assertEqual(metadata.status_code, 200)
        self.assertEqual(metadata.json()["resource"], HTTP_RESOURCE)
        self.assertEqual(metadata.json()["authorization_servers"], [HTTP_ISSUER])
        self.assertEqual(
            metadata.json()["scopes_supported"],
            ["choiceprint.context.read"],
        )

    async def test_http_enforces_resource_and_scope_after_owner_binding(
        self,
    ) -> None:
        now = int(time.time())
        cases = (
            (
                AccessToken(
                    token="fixture",
                    client_id="fixture-client",
                    scopes=["choiceprint.context.read"],
                    resource="https://other-resource.example/mcp",
                    subject=HTTP_OWNER_SUBJECT,
                    expires_at=now + 3600,
                    claims={"iss": HTTP_ISSUER},
                ),
                401,
            ),
            (
                AccessToken(
                    token="fixture",
                    client_id="fixture-client",
                    scopes=[],
                    resource=HTTP_RESOURCE,
                    subject=HTTP_OWNER_SUBJECT,
                    expires_at=now + 3600,
                    claims={"iss": HTTP_ISSUER},
                ),
                403,
            ),
        )
        initialize = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2025-06-18",
                "capabilities": {},
                "clientInfo": {"name": "fixture-client", "version": "1.0"},
            },
        }
        for access_token, status in cases:
            with self.subTest(status=status):
                app, _ = self.build_http_app(
                    verifier=StaticTokenVerifier(access_token)
                )
                transport = httpx2.ASGITransport(app=app)
                async with app.router.lifespan_context(app):
                    async with httpx2.AsyncClient(
                        transport=transport,
                        base_url=HTTP_ORIGIN,
                    ) as client:
                        response = await client.post(
                            "/mcp",
                            json=initialize,
                            headers={
                                "Authorization": "Bearer fixture-token",
                                "Accept": "application/json, text/event-stream",
                                "Content-Type": "application/json",
                            },
                        )
                self.assertEqual(response.status_code, status)
                self.assertIsNone(response.headers.get("mcp-session-id"))

    async def test_http_rejects_unbound_or_stale_verified_identity(self) -> None:
        now = int(time.time())
        unsafe_tokens = (
            AccessToken(
                token="fixture",
                client_id="fixture-client",
                scopes=["choiceprint.context.read"],
                resource=HTTP_RESOURCE,
                subject=None,
                expires_at=now + 3600,
                claims={"iss": HTTP_ISSUER},
            ),
            AccessToken(
                token="fixture",
                client_id="fixture-client",
                scopes=["choiceprint.context.read"],
                resource=HTTP_RESOURCE,
                subject=HTTP_OWNER_SUBJECT,
                expires_at=None,
                claims={"iss": HTTP_ISSUER},
            ),
            AccessToken(
                token="fixture",
                client_id="fixture-client",
                scopes=["choiceprint.context.read"],
                resource=HTTP_RESOURCE,
                subject=HTTP_OWNER_SUBJECT,
                expires_at=now - 1,
                claims={"iss": HTTP_ISSUER},
            ),
            AccessToken(
                token="fixture",
                client_id="fixture-client",
                scopes=["choiceprint.context.read"],
                resource=HTTP_RESOURCE,
                subject=HTTP_OWNER_SUBJECT,
                expires_at=now + 3600,
                claims={"iss": "https://wrong-issuer.example"},
            ),
            AccessToken(
                token="fixture",
                client_id="fixture-client",
                scopes=["choiceprint.context.read"],
                resource=HTTP_RESOURCE,
                subject=HTTP_OWNER_SUBJECT,
                expires_at=now + 3600,
                claims={"iss": HTTP_ISSUER, "nbf": now + 300},
            ),
        )
        initialize = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2025-06-18",
                "capabilities": {},
                "clientInfo": {"name": "fixture-client", "version": "1.0"},
            },
        }
        for access_token in unsafe_tokens:
            with self.subTest(access_token=access_token):
                verifier = StaticTokenVerifier(access_token)
                app, _ = self.build_http_app(verifier=verifier)
                transport = httpx2.ASGITransport(app=app)
                async with app.router.lifespan_context(app):
                    async with httpx2.AsyncClient(
                        transport=transport,
                        base_url=HTTP_ORIGIN,
                    ) as client:
                        response = await client.post(
                            "/mcp",
                            json=initialize,
                            headers={
                                "Authorization": "Bearer fixture-token",
                                "Accept": "application/json, text/event-stream",
                                "Content-Type": "application/json",
                            },
                        )
                self.assertEqual(response.status_code, 401)
                self.assertIsNone(response.headers.get("mcp-session-id"))

    async def test_http_rejects_spoofed_public_host_and_origin(self) -> None:
        app, verifier = self.build_http_app()
        transport = httpx2.ASGITransport(app=app)
        initialize = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2025-06-18",
                "capabilities": {},
                "clientInfo": {"name": "fixture-client", "version": "1.0"},
            },
        }
        common = {
            "Authorization": f"Bearer {HTTP_TEST_TOKEN}",
            "Accept": "application/json, text/event-stream",
            "Content-Type": "application/json",
        }
        async with app.router.lifespan_context(app):
            async with httpx2.AsyncClient(
                transport=transport,
                base_url=HTTP_ORIGIN,
            ) as client:
                wrong_host = await client.post(
                    "/mcp",
                    json=initialize,
                    headers={**common, "Host": "attacker.example"},
                )
                wrong_origin = await client.post(
                    "/mcp",
                    json=initialize,
                    headers={**common, "Origin": "https://attacker.example"},
                )
                valid = await client.post(
                    "/mcp",
                    json=initialize,
                    headers={**common, "Origin": HTTP_ORIGIN},
                )

        self.assertEqual(wrong_host.status_code, 421)
        self.assertEqual(wrong_origin.status_code, 403)
        self.assertEqual(valid.status_code, 200)
        self.assertIsNotNone(valid.headers.get("mcp-session-id"))
        self.assertIn(
            "untrusted evidence data",
            valid.json()["result"]["instructions"],
        )
        self.assertTrue(verifier.seen_tokens)

    async def test_http_round_trip_matches_read_only_stdio_contract(self) -> None:
        app, verifier = self.build_http_app()
        before = pack_digest(EXAMPLE_PACK)
        asgi_transport = httpx2.ASGITransport(app=app)
        async with app.router.lifespan_context(app):
            async with httpx2.AsyncClient(
                transport=asgi_transport,
                base_url=HTTP_ORIGIN,
                headers={"Authorization": f"Bearer {HTTP_TEST_TOKEN}"},
            ) as http_client:
                transport = streamable_http_client(
                    HTTP_RESOURCE,
                    http_client=http_client,
                )
                async with Client(
                    transport,
                    mode="legacy",
                    raise_exceptions=True,
                ) as client:
                    listed = await client.list_tools()
                    result = await client.call_tool(
                        "get_twin_context",
                        {
                            "scenario": SCENARIO,
                            "mode": "predict-choice",
                            "max_context_bytes": 12_000,
                        },
                    )

        self.assertEqual([tool.name for tool in listed.tools], ["get_twin_context"])
        tool = listed.tools[0]
        self.assertTrue(tool.annotations.read_only_hint)
        self.assertFalse(tool.annotations.destructive_hint)
        self.assertFalse(tool.annotations.open_world_hint)
        self.assertTrue(tool.annotations.idempotent_hint)
        self.assertEqual(
            tool.meta,
            {
                "securitySchemes": [
                    {
                        "type": "oauth2",
                        "scopes": ["choiceprint.context.read"],
                    }
                ]
            },
        )
        self.assertFalse(tool.output_schema["additionalProperties"])
        self.assertNotIn("pack_path", tool.input_schema["properties"])
        self.assertFalse(result.is_error)
        self.assertEqual(result.structured_content["status"], "ok")
        self.assertEqual(pack_digest(EXAMPLE_PACK), before)
        self.assertGreaterEqual(len(verifier.seen_tokens), 1)
        self.assertTrue(all(token == HTTP_TEST_TOKEN for token in verifier.seen_tokens))

    async def test_http_rejects_unrelated_subject_before_pack_or_session(self) -> None:
        app, verifier = self.build_http_app()
        transport = httpx2.ASGITransport(app=app)
        base_headers = {
            "Accept": "application/json, text/event-stream",
            "Content-Type": "application/json",
        }
        initialize = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2025-06-18",
                "capabilities": {},
                "clientInfo": {"name": "fixture-client", "version": "1.0"},
            },
        }
        async with app.router.lifespan_context(app):
            async with httpx2.AsyncClient(
                transport=transport,
                base_url=HTTP_ORIGIN,
            ) as client:
                opened = await client.post(
                    "/mcp",
                    json=initialize,
                    headers={
                        **base_headers,
                        "Authorization": f"Bearer {HTTP_TEST_TOKEN}",
                    },
                )
                session_id = opened.headers.get("mcp-session-id")
                self.assertEqual(opened.status_code, 200)
                self.assertIsNotNone(session_id)

                crossed = await client.post(
                    "/mcp",
                    json={"jsonrpc": "2.0", "id": 2, "method": "tools/list"},
                    headers={
                        **base_headers,
                        "Authorization": f"Bearer {HTTP_OTHER_TOKEN}",
                        "MCP-Session-Id": session_id,
                        "MCP-Protocol-Version": "2025-06-18",
                    },
                )
                separate = await client.post(
                    "/mcp",
                    json=initialize,
                    headers={
                        **base_headers,
                        "Authorization": f"Bearer {HTTP_OTHER_TOKEN}",
                    },
                )

        self.assertEqual(crossed.status_code, 401)
        self.assertEqual(separate.status_code, 401)
        self.assertIn("Authentication required", crossed.text)
        self.assertIn("Authentication required", separate.text)
        self.assertNotIn(session_id, crossed.text)
        self.assertIsNone(separate.headers.get("mcp-session-id"))
        self.assertEqual(
            verifier.seen_tokens,
            [HTTP_TEST_TOKEN, HTTP_OTHER_TOKEN, HTTP_OTHER_TOKEN],
        )

    async def test_http_session_is_bound_to_authenticated_client(self) -> None:
        app, verifier = self.build_http_app()
        transport = httpx2.ASGITransport(app=app)
        base_headers = {
            "Accept": "application/json, text/event-stream",
            "Content-Type": "application/json",
        }
        initialize = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2025-06-18",
                "capabilities": {},
                "clientInfo": {"name": "fixture-client", "version": "1.0"},
            },
        }
        async with app.router.lifespan_context(app):
            async with httpx2.AsyncClient(
                transport=transport,
                base_url=HTTP_ORIGIN,
            ) as client:
                opened = await client.post(
                    "/mcp",
                    json=initialize,
                    headers={
                        **base_headers,
                        "Authorization": f"Bearer {HTTP_TEST_TOKEN}",
                    },
                )
                session_id = opened.headers.get("mcp-session-id")
                self.assertEqual(opened.status_code, 200)
                self.assertIsNotNone(session_id)

                crossed = await client.post(
                    "/mcp",
                    json={"jsonrpc": "2.0", "id": 2, "method": "tools/list"},
                    headers={
                        **base_headers,
                        "Authorization": f"Bearer {HTTP_OTHER_CLIENT_TOKEN}",
                        "MCP-Session-Id": session_id,
                        "MCP-Protocol-Version": "2025-06-18",
                    },
                )

        self.assertEqual(crossed.status_code, 404)
        self.assertIn("Session not found", crossed.text)
        self.assertNotIn(session_id, crossed.text)
        self.assertEqual(
            verifier.seen_tokens,
            [HTTP_TEST_TOKEN, HTTP_OTHER_CLIENT_TOKEN],
        )

    async def test_http_rejects_oversized_request_before_private_processing(
        self,
    ) -> None:
        app, verifier = self.build_http_app()
        marker = b"private-owner-scenario"
        body = marker + b"x" * self.server_module.HTTP_MAX_REQUEST_BODY_BYTES
        transport = httpx2.ASGITransport(app=app)
        async with app.router.lifespan_context(app):
            async with httpx2.AsyncClient(
                transport=transport,
                base_url=HTTP_ORIGIN,
                headers={"Authorization": f"Bearer {HTTP_TEST_TOKEN}"},
            ) as client:
                response = await client.post(
                    "/mcp",
                    content=body,
                    headers={"Content-Type": "application/json"},
                )

        self.assertEqual(response.status_code, 413)
        self.assertNotIn(marker.decode("ascii"), response.text)
        self.assertEqual(verifier.seen_tokens, [HTTP_TEST_TOKEN])


if __name__ == "__main__":
    unittest.main()
