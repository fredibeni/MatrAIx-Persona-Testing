from __future__ import annotations

import hashlib
import json
import os
import shlex
import shutil
import stat
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import yaml


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
CLI_SOURCE = REPOSITORY_ROOT / "choiceprint.sh"
ADAPTER_FILES = (
    "PROJECT-INSTRUCTIONS.md",
    "00-READ-FIRST.md",
    "01-CORE-PROFILE.md",
    "02-DECISION-RULES.md",
    "03-DECISION-CASES.md",
    "04-COUNTEREXAMPLES.md",
    "05-CURRENT-CONTEXT.md",
    "06-BOUNDARIES.md",
    "07-EVIDENCE-INDEX.md",
    "08-CONFLICTS.md",
    "09-CONSENT.md",
)


def mode(path: Path) -> int:
    return stat.S_IMODE(path.stat().st_mode)


class ChoiceprintCliTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name) / "repo"
        self.root.mkdir()
        self.root = self.root.resolve()
        self.cli = self.root / "choiceprint.sh"
        shutil.copyfile(CLI_SOURCE, self.cli)
        self.cli.chmod(0o755)

        self.scripts = self.root / "digital-twin/scripts"
        self.templates = self.root / "digital-twin/templates"
        self.scripts.mkdir(parents=True)
        self.templates.mkdir(parents=True)
        self.builder = self.scripts / "build_choiceprint.py"
        self.validator = self.scripts / "validate_twin_pack.py"
        self.pack_upgrade_checker = (
            self.scripts / "check_choiceprint_pack_upgrade.py"
        )
        self.claim_reviewer = self.scripts / "review_choiceprint_claims.py"
        self.coverage_reviewer = (
            self.scripts / "review_choiceprint_coverage.py"
        )
        self.holdout_reviewer = (
            self.scripts / "review_choiceprint_holdout.py"
        )
        self.answer_collector = (
            self.scripts / "collect_choiceprint_answers.py"
        )
        self.interview_collector = (
            self.scripts / "collect_choiceprint_interview.py"
        )
        self.consent_preparer = (
            self.scripts / "prepare_choiceprint_consent.py"
        )
        self.upload_verifier = (
            self.scripts / "verify_choiceprint_upload.py"
        )
        self.context_retriever = (
            self.scripts / "retrieve_choiceprint_context.py"
        )
        self.mcp_server = self.scripts / "serve_choiceprint_mcp.py"
        self.builder.write_text(
            """\
import json
import os
import pathlib
import sys
pathlib.Path(os.environ["CHOICEPRINT_TEST_BUILD_LOG"]).write_text(
    json.dumps(sys.argv[1:]), encoding="utf-8"
)
args = sys.argv[1:]
output = pathlib.Path(args[args.index("--output") + 1])
output.mkdir(parents=True, exist_ok=True)
adapter = output / "adapters/chatgpt-project"
adapter.mkdir(parents=True, exist_ok=True)
for filename in %s:
    (adapter / filename).write_text(
        f"adapter: {filename}\\n", encoding="utf-8"
    )
workflow_log = os.environ.get("CHOICEPRINT_TEST_WORKFLOW_LOG")
if workflow_log:
    with pathlib.Path(workflow_log).open("a", encoding="utf-8") as handle:
        handle.write("build\\n")
print("stub build complete")
"""
            % repr(list(ADAPTER_FILES)),
            encoding="utf-8",
        )
        self.validator.write_text(
            """\
import os
import pathlib
import sys
if os.environ.get("CHOICEPRINT_TEST_VALIDATOR_FAIL") == "1":
    raise SystemExit(1)
log = os.environ.get("CHOICEPRINT_TEST_VALIDATE_LOG")
if log:
    pathlib.Path(log).write_text(sys.argv[1], encoding="utf-8")
print("stub pack valid")
""",
            encoding="utf-8",
        )
        self.pack_upgrade_checker.write_text(
            """\
import json
import os
import pathlib
import sys
pathlib.Path(os.environ["CHOICEPRINT_TEST_PACK_UPGRADE_LOG"]).write_text(
    json.dumps(sys.argv[1:]), encoding="utf-8"
)
if os.environ.get("CHOICEPRINT_TEST_PACK_UPGRADE_FAIL") == "1":
    print("Choiceprint pack-upgrade check: invalid or unsupported", file=sys.stderr)
    raise SystemExit(8)
print("Choiceprint pack-upgrade check: current - no upgrade needed")
""",
            encoding="utf-8",
        )
        self.claim_reviewer.write_text(
            """\
import json
import os
import pathlib
import sys
args = sys.argv[1:]
pathlib.Path(os.environ["CHOICEPRINT_TEST_REVIEW_LOG"]).write_text(
    json.dumps(args), encoding="utf-8"
)
output = pathlib.Path(args[args.index("--output") + 1])
output.write_text("review: stub\\n", encoding="utf-8")
output.chmod(0o600)
print("stub review complete")
""",
            encoding="utf-8",
        )
        self.coverage_reviewer.write_text(
            """\
import json
import os
import pathlib
import sys
args = sys.argv[1:]
pathlib.Path(os.environ["CHOICEPRINT_TEST_COVERAGE_REVIEW_LOG"]).write_text(
    json.dumps(args), encoding="utf-8"
)
output = pathlib.Path(args[args.index("--output") + 1])
if args[0] == "apply":
    output.mkdir(parents=True, mode=0o700)
else:
    output.write_text("{}\\n", encoding="utf-8")
    output.chmod(0o600)
print("stub coverage review complete")
""",
            encoding="utf-8",
        )
        self.holdout_reviewer.write_text(
            """\
import json
import os
import pathlib
import sys
args = sys.argv[1:]
pathlib.Path(os.environ["CHOICEPRINT_TEST_HOLDOUT_REVIEW_LOG"]).write_text(
    json.dumps(args), encoding="utf-8"
)
output = pathlib.Path(args[args.index("--out") + 1])
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text("{}\\n", encoding="utf-8")
output.chmod(0o600)
print("stub holdout review complete")
""",
            encoding="utf-8",
        )
        self.answer_collector.write_text(
            """\
import json
import os
import pathlib
import sys
args = sys.argv[1:]
pathlib.Path(os.environ["CHOICEPRINT_TEST_ANSWER_COLLECTOR_LOG"]).write_text(
    json.dumps(args), encoding="utf-8"
)
output = pathlib.Path(args[args.index("--out") + 1])
output.write_text("{}\\n", encoding="utf-8")
output.chmod(0o600)
print("stub retest complete")
""",
            encoding="utf-8",
        )
        self.interview_collector.write_text(
            """\
import json
import os
import pathlib
import sys
args = sys.argv[1:]
pathlib.Path(os.environ["CHOICEPRINT_TEST_INTERVIEW_LOG"]).write_text(
    json.dumps(args), encoding="utf-8"
)
output = pathlib.Path(args[args.index("--out") + 1])
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text("{}\\n", encoding="utf-8")
output.chmod(0o600)
print("stub interview complete")
""",
            encoding="utf-8",
        )
        self.consent_preparer.write_text(
            """\
import json
import os
import pathlib
import sys
args = sys.argv[1:]
pathlib.Path(os.environ["CHOICEPRINT_TEST_CONSENT_LOG"]).write_text(
    json.dumps(args), encoding="utf-8"
)
workflow_log = os.environ.get("CHOICEPRINT_TEST_WORKFLOW_LOG")
if workflow_log:
    with pathlib.Path(workflow_log).open("a", encoding="utf-8") as handle:
        handle.write("consent\\n")
if os.environ.get("CHOICEPRINT_TEST_CONSENT_FAIL") == "1":
    print("Owner consent cancelled; no output was written.", file=sys.stderr)
    raise SystemExit(130)
output = pathlib.Path(args[args.index("--output") + 1])
output.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
output.write_text("consent:\\n  owner_authorized: true\\n", encoding="utf-8")
output.chmod(0o600)
print("stub consent complete")
""",
            encoding="utf-8",
        )
        self.upload_verifier.write_text(
            """\
import json
import os
import pathlib
import sys
files = %s
args = sys.argv[1:]
if args == ["list-files"]:
    print("\\n".join(files))
    raise SystemExit(0)
log = pathlib.Path(os.environ["CHOICEPRINT_TEST_UPLOAD_VERIFY_LOG"])
with log.open("a", encoding="utf-8") as handle:
    handle.write(json.dumps(args) + "\\n")
if os.environ.get("CHOICEPRINT_TEST_UPLOAD_VERIFY_FAIL") == "1":
    raise SystemExit(9)
if args[0] == "create":
    package = pathlib.Path(args[args.index("--package") + 1])
    manifest = package / "UPLOAD-MANIFEST.json"
    manifest.write_text("{}\\n", encoding="utf-8")
    manifest.chmod(0o600)
workflow_log = os.environ.get("CHOICEPRINT_TEST_WORKFLOW_LOG")
if workflow_log:
    with pathlib.Path(workflow_log).open("a", encoding="utf-8") as handle:
        handle.write(args[0] + "\\n")
print("stub upload verification complete")
"""
            % repr(list(ADAPTER_FILES)),
            encoding="utf-8",
        )
        self.context_retriever.write_text(
            """\
import json
import os
import pathlib
import sys
args = sys.argv[1:]
pathlib.Path(os.environ["CHOICEPRINT_TEST_CONTEXT_LOG"]).write_text(
    json.dumps(args), encoding="utf-8"
)
print(json.dumps({"status": "ok", "selected_records": []}, sort_keys=True))
""",
            encoding="utf-8",
        )
        self.mcp_server.write_text(
            """\
import json
import os
import pathlib
import sys
pathlib.Path(os.environ["CHOICEPRINT_TEST_MCP_LOG"]).write_text(
    json.dumps(sys.argv[1:]), encoding="utf-8"
)
""",
            encoding="utf-8",
        )
        (self.root / "digital-twin/requirements-mcp.txt").write_text(
            "mcp==2.2.0\n", encoding="utf-8"
        )
        self.interview_bank = (
            self.root / "digital-twin/interview/decision-interview.v1.json"
        )
        self.interview_bank.parent.mkdir(parents=True)
        self.interview_bank.write_text("{}\n", encoding="utf-8")
        self.fake_site = self.root / "test-site-packages"
        metadata = self.fake_site / "mcp-2.2.0.dist-info/METADATA"
        metadata.parent.mkdir(parents=True)
        metadata.write_text("Name: mcp\nVersion: 2.2.0\n", encoding="utf-8")
        (self.templates / "chatgpt-upload-readme.md").write_text(
            """\
# Choiceprint ChatGPT Project setup

Run `./choiceprint.sh verify-package` before upload.
Upload only the numbered adapter files. Do not upload this README or the
manifest.
""",
            encoding="utf-8",
        )
        (self.templates / "curation.example.yaml").write_text(
            yaml.safe_dump(
                {
                    "content_version": "0.1.0",
                    "consent": {
                        "owner_authorized": False,
                        "allowed_sources": [],
                    },
                },
                sort_keys=False,
            ),
            encoding="utf-8",
        )

        self.persona_root = self.root / "matraix/personal-persona"
        self.persona_root.mkdir(parents=True)
        self.venv_bin = self.root / "matraix/.venv/bin"
        self.venv_bin.mkdir(parents=True)
        wrapper = self.venv_bin / "python"
        wrapper.write_text(
            f"#!/bin/sh\nexec {shlex.quote(sys.executable)} \"$@\"\n",
            encoding="utf-8",
        )
        wrapper.chmod(0o755)

        self.persona = self.persona_root / "persona.yaml"
        self.persona.write_text(
            yaml.safe_dump(
                {
                    "persona_id": "test-person",
                    "display_name": "Test Person",
                    "dimensions": {"one": "value", "two": None},
                },
                sort_keys=False,
            ),
            encoding="utf-8",
        )
        self.persona.chmod(0o600)
        self.persona_hash = hashlib.sha256(self.persona.read_bytes()).hexdigest()

        survey_root = self.persona_root / "survey"
        self.store = survey_root / "data/personas"
        self.context_id = "test-person--context"
        self.context = self.store / self.context_id
        self.context.mkdir(parents=True)
        self.baseline = self.context / "baseline.yaml"
        self.baseline.write_text("baseline: true\n", encoding="utf-8")
        self.baseline_hash = hashlib.sha256(self.baseline.read_bytes()).hexdigest()
        self.results = self.context / "validation-results.json"
        self._write_results()
        self.registry = survey_root / "data/persona-registry.json"
        self._write_registry()
        self.surveys = survey_root / "validation-surveys.json"
        self.surveys.write_text('{"surveys": {}}\n', encoding="utf-8")
        for path in (self.results, self.registry, self.surveys, self.baseline):
            path.chmod(0o600)

        self.private_pack_root = self.persona_root / "digital-twin"
        self.private_pack_root.mkdir(mode=0o700)
        self.source_root = self.persona_root / "source-material"
        self.build_log = self.root / "build-log.json"
        self.validate_log = self.root / "validate-log.txt"
        self.pack_upgrade_log = self.root / "pack-upgrade-log.json"
        self.review_log = self.root / "review-log.json"
        self.coverage_review_log = self.root / "coverage-review-log.json"
        self.holdout_review_log = self.root / "holdout-review-log.json"
        self.answer_collector_log = self.root / "answer-collector-log.json"
        self.interview_log = self.root / "interview-log.json"
        self.consent_log = self.root / "consent-log.json"
        self.workflow_log = self.root / "workflow-log.txt"
        self.upload_verify_log = self.root / "upload-verify-log.jsonl"
        self.context_log = self.root / "context-log.json"
        self.mcp_log = self.root / "mcp-log.json"

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def _write_registry(self, **entry_changes: object) -> None:
        entry = {
            "persona_id": "test-person",
            "display_name": "Test Person",
            "baseline_sha256": self.baseline_hash,
            "output_sha256": self.persona_hash,
        }
        entry.update(entry_changes)
        self.registry.parent.mkdir(parents=True, exist_ok=True)
        self.registry.write_text(
            json.dumps(
                {
                    "version": 1,
                    "active_context_id": self.context_id,
                    "contexts": {self.context_id: entry},
                }
            )
            + "\n",
            encoding="utf-8",
        )
        self.registry.chmod(0o600)

    def _write_results(self, **changes: object) -> None:
        value = {
            "schema_version": 1,
            "context_id": self.context_id,
            "persona_id": "test-person",
            "baseline_sha256": self.baseline_hash,
            "persona_revision": self.persona_hash,
            "persona_dimension_count": 1,
            "store": {"surveys": {}},
        }
        value.update(changes)
        self.results.write_text(json.dumps(value) + "\n", encoding="utf-8")
        self.results.chmod(0o600)

    def run_cli(
        self,
        *arguments: str,
        validator_fails: bool = False,
        pack_upgrade_fails: bool = False,
        upload_verifier_fails: bool = False,
        consent_fails: bool = False,
        cwd: Path | None = None,
    ) -> subprocess.CompletedProcess[str]:
        environment = os.environ.copy()
        environment.update(
            {
                "CHOICEPRINT_TEST_BUILD_LOG": str(self.build_log),
                "CHOICEPRINT_TEST_VALIDATE_LOG": str(self.validate_log),
                "CHOICEPRINT_TEST_PACK_UPGRADE_LOG": str(
                    self.pack_upgrade_log
                ),
                "CHOICEPRINT_TEST_REVIEW_LOG": str(self.review_log),
                "CHOICEPRINT_TEST_COVERAGE_REVIEW_LOG": str(
                    self.coverage_review_log
                ),
                "CHOICEPRINT_TEST_HOLDOUT_REVIEW_LOG": str(
                    self.holdout_review_log
                ),
                "CHOICEPRINT_TEST_ANSWER_COLLECTOR_LOG": str(
                    self.answer_collector_log
                ),
                "CHOICEPRINT_TEST_INTERVIEW_LOG": str(self.interview_log),
                "CHOICEPRINT_TEST_CONSENT_LOG": str(self.consent_log),
                "CHOICEPRINT_TEST_WORKFLOW_LOG": str(self.workflow_log),
                "CHOICEPRINT_TEST_UPLOAD_VERIFY_LOG": str(
                    self.upload_verify_log
                ),
                "CHOICEPRINT_TEST_CONTEXT_LOG": str(self.context_log),
                "CHOICEPRINT_TEST_MCP_LOG": str(self.mcp_log),
                "PYTHONPATH": str(self.fake_site),
                "CHOICEPRINT_TEST_VALIDATOR_FAIL": "1" if validator_fails else "0",
                "CHOICEPRINT_TEST_PACK_UPGRADE_FAIL": (
                    "1" if pack_upgrade_fails else "0"
                ),
                "CHOICEPRINT_TEST_UPLOAD_VERIFY_FAIL": (
                    "1" if upload_verifier_fails else "0"
                ),
                "CHOICEPRINT_TEST_CONSENT_FAIL": (
                    "1" if consent_fails else "0"
                ),
            }
        )
        return subprocess.run(
            ["/bin/zsh", str(self.cli), *arguments],
            cwd=cwd or self.root,
            env=environment,
            capture_output=True,
            text=True,
            check=False,
        )

    def create_pack(self, name: str = "test-person.choiceprint") -> Path:
        pack = self.private_pack_root / name
        adapter = pack / "adapters/chatgpt-project"
        adapter.mkdir(parents=True)
        for filename in ADAPTER_FILES:
            path = adapter / filename
            path.write_text(f"adapter: {filename}\n", encoding="utf-8")
            path.chmod(0o600)
        (pack / "profile").mkdir()
        (pack / "profile/claims.jsonl").write_text(
            '{"private": "canonical-only"}\n', encoding="utf-8"
        )
        (pack / "evals").mkdir()
        (pack / "evals/holdout-private.jsonl").write_text("", encoding="utf-8")
        for directory in (pack, adapter, pack / "adapters", pack / "profile", pack / "evals"):
            directory.chmod(0o700)
        for path in pack.rglob("*"):
            if path.is_file():
                path.chmod(0o600)
        return pack

    def test_help_lists_owner_commands(self) -> None:
        for help_argument in ("--help", "help"):
            with self.subTest(help_argument=help_argument):
                result = self.run_cli(help_argument)
                self.assertEqual(result.returncode, 0, result.stderr)
                for command in (
                    "doctor",
                    "init",
                    "build",
                    "validate",
                    "pack-upgrade",
                    "review-prepare",
                    "review-claims",
                    "review-apply",
                    "coverage-review",
                    "coverage-apply",
                    "coverage-revoke",
                    "holdout-review",
                    "collect-interview",
                    "collect-retest",
                    "prepare-chatgpt",
                    "package",
                    "verify-package",
                    "get-context",
                    "serve-mcp",
                ):
                    self.assertIn(command, result.stdout)

    def test_prepare_chatgpt_runs_consent_build_package_and_verify_in_order(
        self,
    ) -> None:
        self.source_root.mkdir(mode=0o700)
        curation = self.source_root / "fictional-curation.yaml"
        curation.write_text("consent:\n  owner_authorized: false\n", encoding="utf-8")
        curation.chmod(0o600)
        authorized = self.source_root / "fictional-authorized.yaml"
        pack = self.private_pack_root / "fictional-release.choiceprint"
        package = self.private_pack_root / "fictional-release.chatgpt-upload"

        result = self.run_cli(
            "prepare-chatgpt",
            "--curation",
            str(curation),
            "--authorized-curation",
            str(authorized),
            "--pack",
            str(pack),
            "--package",
            str(package),
        )

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(
            self.workflow_log.read_text(encoding="utf-8").splitlines(),
            ["consent", "build", "create", "verify"],
        )
        self.assertEqual(
            json.loads(self.consent_log.read_text(encoding="utf-8")),
            ["--curation", str(curation), "--output", str(authorized)],
        )
        build_arguments = json.loads(self.build_log.read_text(encoding="utf-8"))
        self.assertEqual(
            build_arguments[build_arguments.index("--curation") + 1],
            str(authorized),
        )
        self.assertEqual(
            build_arguments[build_arguments.index("--output") + 1], str(pack)
        )
        self.assertTrue(authorized.is_file())
        self.assertEqual(mode(authorized), 0o600)
        self.assertTrue(pack.is_dir())
        self.assertEqual(mode(pack), 0o700)
        self.assertTrue(package.is_dir())
        self.assertEqual(mode(package), 0o700)
        verification_calls = [
            json.loads(line)
            for line in self.upload_verify_log.read_text(
                encoding="utf-8"
            ).splitlines()
        ]
        self.assertEqual(
            verification_calls,
            [
                ["create", "--package", str(package), "--pack", str(pack)],
                ["verify", "--package", str(package), "--pack", str(pack)],
            ],
        )
        self.assertIn(f"Open {package}/UPLOAD-README.md", result.stdout)
        self.assertIn("Upload all ten numbered files", result.stdout)
        self.assertNotIn("--force", build_arguments)

    def test_prepare_chatgpt_requires_every_explicit_path_and_refuses_unsafe_flags(
        self,
    ) -> None:
        required = (
            "--curation",
            "--authorized-curation",
            "--pack",
            "--package",
        )
        values = {
            "--curation": "input.yaml",
            "--authorized-curation": "authorized.yaml",
            "--pack": "release.choiceprint",
            "--package": "release-upload",
        }
        for omitted in required:
            arguments: list[str] = ["prepare-chatgpt"]
            for option in required:
                if option != omitted:
                    arguments.extend((option, values[option]))
            with self.subTest(omitted=omitted):
                result = self.run_cli(*arguments)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn(f"requires {omitted}", result.stderr)

        for option in (
            "--force",
            "--overwrite",
            "--replace",
            "--publish",
            "--upload",
            "--network",
            "--model",
        ):
            with self.subTest(option=option):
                result = self.run_cli("prepare-chatgpt", option)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("never replaces or uploads", result.stderr)
        self.assertFalse(self.consent_log.exists())

    def test_prepare_chatgpt_preflights_all_new_outputs_before_consent(self) -> None:
        self.source_root.mkdir(mode=0o700)
        curation = self.source_root / "fictional-curation.yaml"
        curation.write_text("consent:\n  owner_authorized: false\n", encoding="utf-8")
        curation.chmod(0o600)
        authorized = self.source_root / "fictional-authorized.yaml"
        pack = self.private_pack_root / "fictional-release.choiceprint"
        package = self.private_pack_root / "fictional-release.chatgpt-upload"

        candidates = (authorized, pack, package)
        for candidate in candidates:
            if candidate.suffix in {".yaml", ".yml"}:
                candidate.write_text("keep\n", encoding="utf-8")
                candidate.chmod(0o600)
            else:
                candidate.mkdir(mode=0o700)
            with self.subTest(existing=candidate.name):
                result = self.run_cli(
                    "prepare-chatgpt",
                    "--curation",
                    str(curation),
                    "--authorized-curation",
                    str(authorized),
                    "--pack",
                    str(pack),
                    "--package",
                    str(package),
                )
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("refusing to replace", result.stderr)
                self.assertFalse(self.consent_log.exists())
            if candidate.is_dir():
                candidate.rmdir()
            else:
                candidate.unlink()

    def test_prepare_chatgpt_stops_when_owner_consent_fails(self) -> None:
        self.source_root.mkdir(mode=0o700)
        curation = self.source_root / "fictional-curation.yaml"
        curation.write_text("consent:\n  owner_authorized: false\n", encoding="utf-8")
        curation.chmod(0o600)
        authorized = self.source_root / "fictional-authorized.yaml"
        pack = self.private_pack_root / "fictional-release.choiceprint"
        package = self.private_pack_root / "fictional-release.chatgpt-upload"

        result = self.run_cli(
            "prepare-chatgpt",
            "--curation",
            str(curation),
            "--authorized-curation",
            str(authorized),
            "--pack",
            str(pack),
            "--package",
            str(package),
            consent_fails=True,
        )

        self.assertEqual(result.returncode, 130)
        self.assertEqual(
            self.workflow_log.read_text(encoding="utf-8").splitlines(),
            ["consent"],
        )
        self.assertFalse(authorized.exists())
        self.assertFalse(pack.exists())
        self.assertFalse(package.exists())
        self.assertFalse(self.build_log.exists())
        self.assertFalse(self.upload_verify_log.exists())

    def test_prepare_chatgpt_requires_private_output_parents_before_consent(
        self,
    ) -> None:
        self.source_root.mkdir(mode=0o700)
        curation = self.source_root / "fictional-curation.yaml"
        curation.write_text("consent:\n  owner_authorized: false\n", encoding="utf-8")
        curation.chmod(0o600)
        authorized = self.source_root / "fictional-authorized.yaml"
        public_output = self.root / "public-output"
        public_output.mkdir(mode=0o755)
        public_output.chmod(0o755)
        pack = public_output / "fictional-release.choiceprint"
        package = self.private_pack_root / "fictional-release.chatgpt-upload"

        result = self.run_cli(
            "prepare-chatgpt",
            "--curation",
            str(curation),
            "--authorized-curation",
            str(authorized),
            "--pack",
            str(pack),
            "--package",
            str(package),
        )

        self.assertNotEqual(result.returncode, 0)
        self.assertIn(
            "canonical pack output parent must have mode 700",
            result.stderr,
        )
        self.assertFalse(self.consent_log.exists())
        self.assertFalse(authorized.exists())
        self.assertFalse(pack.exists())
        self.assertFalse(package.exists())

    def test_collect_interview_delegates_to_local_candidate_collector(self) -> None:
        output = self.root.parent / "owner-private" / "interview.json"

        result = self.run_cli(
            "collect-interview",
            "--output",
            str(output),
        )

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(
            json.loads(self.interview_log.read_text(encoding="utf-8")),
            [
                "--bank",
                str(self.interview_bank),
                "--out",
                str(output),
            ],
        )

    def test_collect_interview_requires_output_and_refuses_unsafe_options(self) -> None:
        missing_output = self.run_cli("collect-interview")
        self.assertNotEqual(missing_output.returncode, 0)
        self.assertIn("requires --output", missing_output.stderr)

        for option in (
            "--force",
            "--replace",
            "--overwrite",
            "--publish",
            "--promote",
            "--network",
            "--model",
        ):
            with self.subTest(option=option):
                refused = self.run_cli("collect-interview", option)
                self.assertNotEqual(refused.returncode, 0)
                self.assertIn("candidate-only", refused.stderr)
        self.assertFalse(self.interview_log.exists())

    def test_get_context_delegates_to_read_only_retriever(self) -> None:
        pack = self.create_pack()
        self.source_root.mkdir(mode=0o700)
        scenario = self.source_root / "scenario.json"
        scenario.write_text(
            json.dumps(
                {
                    "summary": "Choose a planning approach",
                    "domain": "planning",
                    "options": ["plan", "improvise"],
                }
            )
            + "\n",
            encoding="utf-8",
        )
        scenario.chmod(0o600)

        result = self.run_cli(
            "get-context",
            "--pack",
            str(pack),
            "--mode",
            "predict-choice",
            "--scenario-file",
            str(scenario),
            "--max-context-bytes",
            "4096",
        )

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(
            json.loads(result.stdout),
            {"selected_records": [], "status": "ok"},
        )
        self.assertEqual(
            json.loads(self.context_log.read_text(encoding="utf-8")),
            [
                "--pack",
                str(pack),
                "--mode",
                "predict-choice",
                "--max-context-bytes",
                "4096",
                "--scenario-file",
                str(scenario),
            ],
        )

    def test_get_context_requires_one_scenario_and_refuses_mutation(self) -> None:
        missing_mode = self.run_cli("get-context", "--scenario-json", "{}")
        self.assertNotEqual(missing_mode.returncode, 0)
        self.assertIn("requires --mode", missing_mode.stderr)

        missing_scenario = self.run_cli(
            "get-context", "--mode", "predict-choice"
        )
        self.assertNotEqual(missing_scenario.returncode, 0)
        self.assertIn("requires --scenario-file or --scenario-json", missing_scenario.stderr)

        both = self.run_cli(
            "get-context",
            "--mode",
            "predict-choice",
            "--scenario-json",
            "{}",
            "--scenario-file",
            "unused.json",
        )
        self.assertNotEqual(both.returncode, 0)
        self.assertIn("accepts exactly one", both.stderr)

        for option in ("--force", "--write", "--update", "--replace"):
            with self.subTest(option=option):
                refused = self.run_cli("get-context", option)
                self.assertNotEqual(refused.returncode, 0)
                self.assertIn("read-only", refused.stderr)
        self.assertFalse(self.context_log.exists())

    def test_serve_mcp_delegates_with_explicit_private_controls(self) -> None:
        pack = self.create_pack()

        result = self.run_cli(
            "serve-mcp",
            "--pack",
            str(pack),
            "--acknowledge-development-only",
            "--allow-private-chatgpt-access",
        )

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(
            json.loads(self.mcp_log.read_text(encoding="utf-8")),
            [
                "--pack",
                str(pack),
                "--allow-private-chatgpt-access",
                "--acknowledge-development-only",
            ],
        )

    def test_serve_mcp_requires_pack_and_private_access(self) -> None:
        missing_pack = self.run_cli(
            "serve-mcp", "--allow-private-chatgpt-access"
        )
        self.assertNotEqual(missing_pack.returncode, 0)
        self.assertIn("requires --pack", missing_pack.stderr)

        pack = self.create_pack()
        missing_access = self.run_cli("serve-mcp", "--pack", str(pack))
        self.assertNotEqual(missing_access.returncode, 0)
        self.assertIn("requires --allow-private-chatgpt-access", missing_access.stderr)
        self.assertFalse(self.mcp_log.exists())

    def test_serve_mcp_refuses_network_and_mutating_options(self) -> None:
        for option in (
            "--transport",
            "--host",
            "--port",
            "--http",
            "--write",
            "--force",
            "--update",
            "--replace",
        ):
            with self.subTest(option=option):
                refused = self.run_cli("serve-mcp", option)
                self.assertNotEqual(refused.returncode, 0)
                self.assertIn("private, local, read-only", refused.stderr)
        self.assertFalse(self.mcp_log.exists())

    def test_get_context_rejects_non_private_scenario_file(self) -> None:
        pack = self.create_pack()
        self.source_root.mkdir(mode=0o700)
        scenario = self.source_root / "scenario.json"
        scenario.write_text("{}\n", encoding="utf-8")
        scenario.chmod(0o644)

        result = self.run_cli(
            "get-context",
            "--pack",
            str(pack),
            "--mode",
            "predict-choice",
            "--scenario-file",
            str(scenario),
        )

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("must have mode 600", result.stderr)
        self.assertFalse(self.context_log.exists())

    def test_holdout_review_delegates_to_local_interactive_reviewer(self) -> None:
        pack = self.create_pack()
        self.source_root.mkdir(mode=0o700)
        questions = self.source_root / "questions.jsonl"
        questions.write_text("{}\n", encoding="utf-8")
        questions.chmod(0o600)
        template = self.source_root / "semantic-review.json"
        template.write_text("{}\n", encoding="utf-8")
        template.chmod(0o600)
        output = self.source_root / "completed-review.json"

        result = self.run_cli(
            "holdout-review",
            "--questions",
            str(questions),
            "--template",
            str(template),
            "--output",
            str(output),
            "--pack",
            str(pack),
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        arguments = json.loads(
            self.holdout_review_log.read_text(encoding="utf-8")
        )
        self.assertEqual(
            arguments,
            [
                "--questions",
                str(questions),
                "--choiceprint",
                str(pack),
                "--template",
                str(template),
                "--out",
                str(output),
            ],
        )
        self.assertEqual(mode(output), 0o600)

    def test_holdout_review_rejects_missing_and_automatic_approval_options(
        self,
    ) -> None:
        missing = self.run_cli("holdout-review")
        self.assertNotEqual(missing.returncode, 0)
        self.assertIn("requires --questions", missing.stderr)
        for option in (
            "--force",
            "--approve",
            "--authorize-cloud-processing",
        ):
            with self.subTest(option=option):
                refused = self.run_cli("holdout-review", option)
                self.assertNotEqual(refused.returncode, 0)
                self.assertIn("does not support automatic approval", refused.stderr)

    def test_collect_retest_delegates_without_revealing_prior_answers(self) -> None:
        self.source_root.mkdir(mode=0o700)
        questions = self.source_root / "questions.jsonl"
        questions.write_text("{}\n", encoding="utf-8")
        questions.chmod(0o600)
        answers = self.source_root / "answers.jsonl"
        answers.write_text('{"selected_option_id":"private"}\n', encoding="utf-8")
        answers.chmod(0o600)
        output = self.source_root / "answers-with-retest.jsonl"

        result = self.run_cli(
            "collect-retest",
            "--questions",
            str(questions),
            "--answers",
            str(answers),
            "--output",
            str(output),
            "--seed",
            "20260926",
            "--count",
            "15",
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertNotIn("private", result.stdout)
        self.assertNotIn("private", result.stderr)
        arguments = json.loads(
            self.answer_collector_log.read_text(encoding="utf-8")
        )
        self.assertEqual(
            arguments,
            [
                "retest",
                "--questions",
                str(questions),
                "--answers",
                str(answers),
                "--out",
                str(output),
                "--seed",
                "20260926",
                "--count",
                "15",
            ],
        )
        self.assertEqual(mode(output), 0o600)

    def test_collect_retest_requires_explicit_inputs_and_refuses_mutation(self) -> None:
        missing = self.run_cli("collect-retest")
        self.assertNotEqual(missing.returncode, 0)
        self.assertIn("requires --questions", missing.stderr)
        for option in ("--force", "--replace", "--show-first-pass"):
            with self.subTest(option=option):
                refused = self.run_cli("collect-retest", option)
                self.assertNotEqual(refused.returncode, 0)
                self.assertIn("never replaces", refused.stderr)
        self.assertFalse(self.answer_collector_log.exists())

    def test_review_prepare_uses_private_default_and_refuses_overwrite(self) -> None:
        pack = self.create_pack()
        result = self.run_cli("review-prepare", "--pack", str(pack))
        self.assertEqual(result.returncode, 0, result.stderr)
        output = self.source_root / "claim-reviews/test-person.claim-review.yaml"
        self.assertEqual(mode(output.parent), 0o700)
        self.assertEqual(mode(output), 0o600)
        arguments = json.loads(self.review_log.read_text(encoding="utf-8"))
        self.assertEqual(arguments[0], "prepare")
        self.assertEqual(arguments[arguments.index("--pack") + 1], str(pack))
        self.assertEqual(arguments[arguments.index("--output") + 1], str(output))

        original = output.read_bytes()
        refused = self.run_cli("review-prepare", "--pack", str(pack))
        self.assertNotEqual(refused.returncode, 0)
        self.assertEqual(output.read_bytes(), original)

    def test_review_claims_delegates_to_resumable_local_reviewer(self) -> None:
        pack = self.create_pack()
        self.source_root.mkdir(mode=0o700)
        review = self.source_root / "claim-review.yaml"
        review.write_text("review: pending\n", encoding="utf-8")
        review.chmod(0o600)
        output = self.source_root / "claim-review-batch-1.yaml"

        result = self.run_cli(
            "review-claims",
            "--pack",
            str(pack),
            "--input",
            str(review),
            "--output",
            str(output),
            "--max-claims",
            "12",
        )

        self.assertEqual(result.returncode, 0, result.stderr)
        arguments = json.loads(self.review_log.read_text(encoding="utf-8"))
        self.assertEqual(
            arguments,
            [
                "interactive",
                "--pack",
                str(pack),
                "--input",
                str(review),
                "--output",
                str(output),
                "--max-claims",
                "12",
            ],
        )
        self.assertEqual(mode(output), 0o600)

    def test_review_claims_requires_output_and_refuses_automatic_approval(
        self,
    ) -> None:
        missing = self.run_cli("review-claims")
        self.assertNotEqual(missing.returncode, 0)
        self.assertIn("requires --output", missing.stderr)
        for option in ("--force", "--approve-all", "--confirm-all"):
            with self.subTest(option=option):
                refused = self.run_cli("review-claims", option)
                self.assertNotEqual(refused.returncode, 0)
                self.assertIn(
                    "does not support automatic approval", refused.stderr
                )

    def test_review_apply_keeps_base_and_output_separate(self) -> None:
        pack = self.create_pack()
        self.source_root.mkdir(mode=0o700)
        curation = self.source_root / "choiceprint-curation.yaml"
        curation.write_text("consent: {}\n", encoding="utf-8")
        curation.chmod(0o600)
        review = self.source_root / "claim-review.yaml"
        review.write_text("review: completed\n", encoding="utf-8")
        review.chmod(0o600)
        output = self.source_root / "reviewed.yaml"

        result = self.run_cli(
            "review-apply",
            "--pack",
            str(pack),
            "--review",
            str(review),
            "--curation",
            str(curation),
            "--output",
            str(output),
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(curation.read_text(encoding="utf-8"), "consent: {}\n")
        self.assertEqual(mode(output), 0o600)
        arguments = json.loads(self.review_log.read_text(encoding="utf-8"))
        self.assertEqual(arguments[0], "apply")
        self.assertEqual(arguments[arguments.index("--curation") + 1], str(curation))
        self.assertEqual(arguments[arguments.index("--output") + 1], str(output))

    def test_coverage_review_prepare_and_interactive_route_private_artifacts(
        self,
    ) -> None:
        pack = self.create_pack()
        self.source_root.mkdir(mode=0o700)
        run = self.source_root / "run"
        run.mkdir(mode=0o700)
        score = self.source_root / "score"
        score.mkdir(mode=0o700)
        answers = self.source_root / "answers.jsonl"
        answers.write_text("{}\n", encoding="utf-8")
        answers.chmod(0o600)
        pending = self.source_root / "coverage-pending.json"

        prepared = self.run_cli(
            "coverage-review",
            "prepare",
            "--pack",
            str(pack),
            "--run",
            str(run),
            "--answers",
            str(answers),
            "--score",
            str(score),
            "--output",
            str(pending),
        )
        self.assertEqual(prepared.returncode, 0, prepared.stderr)
        self.assertEqual(mode(pending), 0o600)
        arguments = json.loads(
            self.coverage_review_log.read_text(encoding="utf-8")
        )
        self.assertEqual(arguments[0], "prepare")
        self.assertEqual(arguments[arguments.index("--run") + 1], str(run))

        completed = self.source_root / "coverage-completed.json"
        reviewed = self.run_cli(
            "coverage-review",
            "interactive",
            "--pack",
            str(pack),
            "--input",
            str(pending),
            "--output",
            str(completed),
            "--run",
            str(run),
            "--answers",
            str(answers),
            "--score",
            str(score),
        )
        self.assertEqual(reviewed.returncode, 0, reviewed.stderr)
        arguments = json.loads(
            self.coverage_review_log.read_text(encoding="utf-8")
        )
        self.assertEqual(arguments[0], "interactive")
        self.assertEqual(mode(completed), 0o600)

    def test_coverage_apply_routes_sealed_evidence_and_refuses_unsafe_flags(
        self,
    ) -> None:
        pack = self.create_pack()
        self.source_root.mkdir(mode=0o700)
        review = self.source_root / "coverage-completed.json"
        review.write_text("{}\n", encoding="utf-8")
        review.chmod(0o600)
        answers = self.source_root / "answers.jsonl"
        answers.write_text("{}\n", encoding="utf-8")
        answers.chmod(0o600)
        run = self.source_root / "run"
        run.mkdir(mode=0o700)
        score = self.source_root / "score"
        score.mkdir(mode=0o700)
        output = self.private_pack_root / "validated.choiceprint"

        result = self.run_cli(
            "coverage-apply",
            "--pack",
            str(pack),
            "--review",
            str(review),
            "--run",
            str(run),
            "--answers",
            str(answers),
            "--score",
            str(score),
            "--output",
            str(output),
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(mode(output), 0o700)
        arguments = json.loads(
            self.coverage_review_log.read_text(encoding="utf-8")
        )
        self.assertEqual(arguments[0], "apply")
        self.assertEqual(arguments[arguments.index("--review") + 1], str(review))

        for option in ("--force", "--approve-all", "--yes"):
            with self.subTest(option=option):
                refused = self.run_cli("coverage-apply", option)
                self.assertNotEqual(refused.returncode, 0)
                self.assertIn("does not support", refused.stderr)

    def test_coverage_revoke_prepares_only_an_explicit_pending_review(self) -> None:
        pack = self.create_pack()
        self.source_root.mkdir(mode=0o700)
        output = self.source_root / "coverage-revoke.json"
        result = self.run_cli(
            "coverage-revoke",
            "--pack",
            str(pack),
            "--domain",
            "everyday_choices",
            "--domain",
            "work_choices",
            "--output",
            str(output),
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(mode(output), 0o600)
        arguments = json.loads(
            self.coverage_review_log.read_text(encoding="utf-8")
        )
        self.assertEqual(arguments[0], "prepare-revoke")
        self.assertEqual(arguments.count("--domain"), 2)

        refused = self.run_cli("coverage-revoke", "--approve-all")
        self.assertNotEqual(refused.returncode, 0)
        self.assertIn("separate interactive owner decision", refused.stderr)

    def test_init_creates_owner_only_unauthorized_curation_and_refuses_overwrite(self) -> None:
        result = self.run_cli("init")
        self.assertEqual(result.returncode, 0, result.stderr)
        curation = self.source_root / "choiceprint-curation.yaml"
        self.assertEqual(mode(self.source_root), 0o700)
        self.assertEqual(mode(curation), 0o600)
        value = yaml.safe_load(curation.read_text(encoding="utf-8"))
        self.assertIs(value["consent"]["owner_authorized"], False)

        original = curation.read_bytes()
        second = self.run_cli("init")
        self.assertNotEqual(second.returncode, 0)
        self.assertEqual(curation.read_bytes(), original)
        self.assertIn("refusing to replace", second.stderr)

    def test_build_uses_only_strictly_bound_active_validation_results(self) -> None:
        result = self.run_cli("build", "--no-curation")
        self.assertEqual(result.returncode, 0, result.stderr)
        arguments = json.loads(self.build_log.read_text(encoding="utf-8"))
        self.assertEqual(
            arguments[arguments.index("--persona") + 1], str(self.persona.resolve())
        )
        self.assertEqual(
            arguments[arguments.index("--validation-results") + 1],
            str(self.results.resolve()),
        )
        self.assertEqual(
            arguments[arguments.index("--validation-surveys") + 1],
            str(self.surveys.resolve()),
        )
        output = Path(arguments[arguments.index("--output") + 1])
        self.assertEqual(
            output, self.private_pack_root.resolve() / "test-person.choiceprint"
        )
        self.assertEqual(mode(output), 0o700)

    def test_build_fails_closed_for_stale_validation_results(self) -> None:
        self._write_results(persona_revision="0" * 64)
        result = self.run_cli("build", "--no-curation")
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(self.build_log.exists())
        self.assertIn("stale, mismatched, malformed, or unsafe", result.stderr)

    def test_build_omits_absent_optional_validation_results(self) -> None:
        self.results.unlink()
        result = self.run_cli("build", "--no-curation")
        self.assertEqual(result.returncode, 0, result.stderr)
        arguments = json.loads(self.build_log.read_text(encoding="utf-8"))
        self.assertNotIn("--validation-results", arguments)
        self.assertNotIn("--validation-surveys", arguments)

    def test_build_requires_explicit_force_to_replace_output(self) -> None:
        output = self.private_pack_root / "test-person.choiceprint"
        output.mkdir()
        refused = self.run_cli("build", "--no-validation", "--no-curation")
        self.assertNotEqual(refused.returncode, 0)
        self.assertFalse(self.build_log.exists())
        self.assertIn("pass --force", refused.stderr)

        allowed = self.run_cli(
            "build", "--no-validation", "--no-curation", "--force"
        )
        self.assertEqual(allowed.returncode, 0, allowed.stderr)
        arguments = json.loads(self.build_log.read_text(encoding="utf-8"))
        self.assertIn("--force", arguments)

    def test_validate_invokes_validator_for_default_pack(self) -> None:
        pack = self.create_pack()
        result = self.run_cli("validate")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(
            self.validate_log.read_text(encoding="utf-8"), str(pack.resolve())
        )

    def test_validate_rejects_symlinked_pack_root(self) -> None:
        real_pack = self.create_pack("real.choiceprint")
        linked_pack = self.private_pack_root / "linked.choiceprint"
        linked_pack.symlink_to(real_pack, target_is_directory=True)
        result = self.run_cli("validate", "--pack", str(linked_pack))
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("symlink", result.stderr)

    def test_pack_upgrade_check_delegates_default_and_explicit_pack(self) -> None:
        default_pack = self.create_pack()
        default_result = self.run_cli("pack-upgrade", "check")
        self.assertEqual(default_result.returncode, 0, default_result.stderr)
        self.assertIn("current - no upgrade needed", default_result.stdout)
        self.assertEqual(
            json.loads(self.pack_upgrade_log.read_text(encoding="utf-8")),
            [str(default_pack)],
        )

        explicit_pack = self.create_pack("fictional-explicit.choiceprint")
        explicit_result = self.run_cli(
            "pack-upgrade", "check", "--pack", str(explicit_pack)
        )
        self.assertEqual(explicit_result.returncode, 0, explicit_result.stderr)
        self.assertEqual(
            json.loads(self.pack_upgrade_log.read_text(encoding="utf-8")),
            [str(explicit_pack)],
        )

    def test_pack_upgrade_default_rejects_symlinked_active_persona(self) -> None:
        target = self.root / "fictional-persona-target.yaml"
        self.persona.replace(target)
        self.persona.symlink_to(target)

        result = self.run_cli("pack-upgrade", "check")

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("symlink", result.stderr)
        self.assertFalse(self.pack_upgrade_log.exists())

    def test_pack_upgrade_check_is_read_only_and_propagates_failure(self) -> None:
        pack = self.create_pack()
        before = {
            path.relative_to(pack).as_posix(): (
                path.read_bytes() if path.is_file() else None,
                mode(path),
            )
            for path in [pack, *sorted(pack.rglob("*"))]
        }

        result = self.run_cli(
            "pack-upgrade",
            "check",
            "--pack",
            str(pack),
            pack_upgrade_fails=True,
        )

        self.assertEqual(result.returncode, 8)
        self.assertIn("invalid or unsupported", result.stderr)
        after = {
            path.relative_to(pack).as_posix(): (
                path.read_bytes() if path.is_file() else None,
                mode(path),
            )
            for path in [pack, *sorted(pack.rglob("*"))]
        }
        self.assertEqual(after, before)

    def test_pack_upgrade_exposes_only_check_and_refuses_mutation(self) -> None:
        for action in ("prepare", "activate", "apply"):
            with self.subTest(action=action):
                result = self.run_cli("pack-upgrade", action)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("only the read-only check action", result.stderr)
        for option in (
            "--force",
            "--output",
            "--write",
            "--repair",
            "--replace",
            "--update",
        ):
            with self.subTest(option=option):
                result = self.run_cli("pack-upgrade", "check", option)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("read-only", result.stderr)
        self.assertFalse(self.pack_upgrade_log.exists())

    def test_pack_upgrade_help_and_unknown_option_are_sanitized(self) -> None:
        help_result = self.run_cli("pack-upgrade", "--help")
        self.assertEqual(help_result.returncode, 0, help_result.stderr)
        self.assertIn("pack-upgrade check", help_result.stdout)

        private_option = "--fictional-private-value-never-print"
        invalid = self.run_cli("pack-upgrade", "check", private_option)
        self.assertNotEqual(invalid.returncode, 0)
        self.assertIn("unknown pack-upgrade check option", invalid.stderr)
        self.assertNotIn(private_option, invalid.stderr)
        self.assertFalse(self.pack_upgrade_log.exists())

    def test_package_contains_only_adapter_files_and_setup_readme(self) -> None:
        pack = self.create_pack()
        output = self.private_pack_root / "upload"
        result = self.run_cli(
            "package", "--pack", str(pack), "--output", str(output)
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(mode(output), 0o700)
        names = sorted(path.name for path in output.iterdir())
        self.assertEqual(
            names,
            sorted(
                (*ADAPTER_FILES, "UPLOAD-README.md", "UPLOAD-MANIFEST.json")
            ),
        )
        self.assertTrue(all(path.is_file() for path in output.iterdir()))
        self.assertTrue(all(mode(path) == 0o600 for path in output.iterdir()))
        for filename in ADAPTER_FILES:
            self.assertEqual(
                (output / filename).read_bytes(),
                (pack / "adapters/chatgpt-project" / filename).read_bytes(),
            )
        self.assertNotIn("canonical-only", (output / "UPLOAD-README.md").read_text())
        self.assertIn(
            "verify-package", (output / "UPLOAD-README.md").read_text()
        )
        calls = [
            json.loads(line)
            for line in self.upload_verify_log.read_text(encoding="utf-8").splitlines()
        ]
        self.assertEqual(
            calls,
            [
                [
                    "create",
                    "--package",
                    str(output),
                    "--pack",
                    str(pack),
                ]
            ],
        )

    def test_verify_package_delegates_without_mutating_package(self) -> None:
        pack = self.create_pack()
        package = self.private_pack_root / "upload"
        package.mkdir(mode=0o700)
        sentinel = package / "sentinel"
        sentinel.write_text("keep\n", encoding="utf-8")
        sentinel.chmod(0o600)
        before = (sentinel.read_bytes(), mode(sentinel), mode(package))

        result = self.run_cli(
            "verify-package",
            "--pack",
            str(pack),
            "--package",
            str(package),
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        calls = [
            json.loads(line)
            for line in self.upload_verify_log.read_text(encoding="utf-8").splitlines()
        ]
        self.assertEqual(
            calls,
            [
                [
                    "verify",
                    "--package",
                    str(package),
                    "--pack",
                    str(pack),
                ]
            ],
        )
        self.assertEqual(
            (sentinel.read_bytes(), mode(sentinel), mode(package)), before
        )

    def test_verify_package_rejects_mutating_options(self) -> None:
        for option in ("--force", "--repair", "--update"):
            with self.subTest(option=option):
                result = self.run_cli("verify-package", option)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("read-only", result.stderr)
        self.assertFalse(self.upload_verify_log.exists())

    def test_package_refuses_existing_output_and_force(self) -> None:
        pack = self.create_pack()
        output = self.private_pack_root / "upload"
        output.mkdir()
        sentinel = output / "sentinel"
        sentinel.write_text("keep", encoding="utf-8")

        result = self.run_cli(
            "package", "--pack", str(pack), "--output", str(output)
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(sentinel.read_text(encoding="utf-8"), "keep")
        forced = self.run_cli(
            "package", "--pack", str(pack), "--output", str(output), "--force"
        )
        self.assertNotEqual(forced.returncode, 0)
        self.assertIn("intentionally has no --force", forced.stderr)
        self.assertEqual(sentinel.read_text(encoding="utf-8"), "keep")

    def test_package_does_not_publish_when_validation_fails(self) -> None:
        pack = self.create_pack()
        output = self.private_pack_root / "upload"
        result = self.run_cli(
            "package",
            "--pack",
            str(pack),
            "--output",
            str(output),
            validator_fails=True,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(output.exists())

    def test_package_cleanup_removes_output_when_manifest_creation_fails(self) -> None:
        pack = self.create_pack()
        output = self.private_pack_root / "upload"
        result = self.run_cli(
            "package",
            "--pack",
            str(pack),
            "--output",
            str(output),
            upload_verifier_fails=True,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(output.exists())
        self.assertNotIn("read-only variable", result.stderr)

    def test_package_rejects_output_inside_canonical_pack(self) -> None:
        pack = self.create_pack()
        output = pack / "upload"
        result = self.run_cli(
            "package", "--pack", str(pack), "--output", str(output)
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(output.exists())
        self.assertIn("must not be inside", result.stderr)

    def test_doctor_is_read_only_and_reports_bound_context(self) -> None:
        before = {
            path: (path.read_bytes(), mode(path))
            for path in (self.persona, self.registry, self.results, self.baseline)
        }
        result = self.run_cli("doctor", cwd=Path(self.temporary.name))
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn(str(self.results.resolve()), result.stdout)
        for path, expected in before.items():
            self.assertEqual((path.read_bytes(), mode(path)), expected)

    def test_doctor_requires_interview_collector_and_question_bank(self) -> None:
        for path in (self.interview_collector, self.interview_bank):
            with self.subTest(path=path.name):
                original = path.read_bytes()
                path.unlink()
                try:
                    result = self.run_cli("doctor")
                    self.assertNotEqual(result.returncode, 0)
                    self.assertIn("required product file", result.stderr)
                    self.assertIn(str(path), result.stderr)
                finally:
                    path.parent.mkdir(parents=True, exist_ok=True)
                    path.write_bytes(original)

    def test_doctor_requires_consent_preparer(self) -> None:
        original = self.consent_preparer.read_bytes()
        self.consent_preparer.unlink()
        try:
            result = self.run_cli("doctor")
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("required product file", result.stderr)
            self.assertIn(str(self.consent_preparer), result.stderr)
        finally:
            self.consent_preparer.parent.mkdir(parents=True, exist_ok=True)
            self.consent_preparer.write_bytes(original)


if __name__ == "__main__":
    unittest.main()
