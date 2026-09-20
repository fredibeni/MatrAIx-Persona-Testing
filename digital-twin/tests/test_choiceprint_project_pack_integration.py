from __future__ import annotations

import json
import os
import stat
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import yaml


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
CLI = REPOSITORY_ROOT / "choiceprint.sh"
PERSONA = REPOSITORY_ROOT / "matraix/personal-persona/persona.example.yaml"
CURATION_TEMPLATE = (
    REPOSITORY_ROOT / "digital-twin/templates/curation.example.yaml"
)
CONSENT_PREPARER = (
    REPOSITORY_ROOT / "digital-twin/scripts/prepare_choiceprint_consent.py"
)
CONSENT_FIXTURE = (
    REPOSITORY_ROOT
    / "digital-twin/tests/fixtures/consent-curation.fictional.yaml"
)
ADAPTER_FILES = {
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
}


def mode(path: Path) -> int:
    return stat.S_IMODE(path.stat().st_mode)


class ChoiceprintProjectPackIntegrationTests(unittest.TestCase):
    def run_cli(self, *arguments: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            ["/bin/zsh", str(CLI), *arguments],
            cwd=REPOSITORY_ROOT,
            env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"},
            capture_output=True,
            text=True,
            check=False,
        )

    def test_fictional_authorized_persona_builds_verified_project_package(self) -> None:
        with tempfile.TemporaryDirectory(
            prefix="choiceprint-project-pack-integration-"
        ) as temporary:
            root = Path(temporary).resolve()
            root.chmod(0o700)
            curation = root / "fictional-authorized-curation.yaml"
            pack = root / "fictional.choiceprint"
            package = root / "fictional.chatgpt-upload"

            document = yaml.safe_load(CURATION_TEMPLATE.read_text(encoding="utf-8"))
            document["profile"] = {
                "summary": "A fictional profile used only for integration testing.",
                "runtime_included": True,
                "sensitivity": "private",
                "source_refs": ["src_persona_yaml_current"],
            }
            document["consent"].update(
                {
                    "owner_authorized": True,
                    "authorized_at": "2025-01-01T00:00:00Z",
                    "allowed_sources": ["src_persona_yaml_current"],
                    "allowed_modes": ["predict-choice", "write-in-style"],
                    "allowed_uses": [
                        "predict likely choices",
                        "draft in documented communication style",
                    ],
                }
            )
            curation.write_text(
                yaml.safe_dump(document, sort_keys=False, allow_unicode=True),
                encoding="utf-8",
            )
            curation.chmod(0o600)

            build = self.run_cli(
                "build",
                "--persona",
                str(PERSONA),
                "--no-validation",
                "--curation",
                str(curation),
                "--output",
                str(pack),
            )
            self.assertEqual(build.returncode, 0, build.stderr)

            package_result = self.run_cli(
                "package",
                "--pack",
                str(pack),
                "--output",
                str(package),
            )
            self.assertEqual(package_result.returncode, 0, package_result.stderr)

            verify = self.run_cli(
                "verify-package",
                "--pack",
                str(pack),
                "--package",
                str(package),
            )
            self.assertEqual(verify.returncode, 0, verify.stderr)

            metadata = json.loads(
                (pack / "build-metadata.json").read_text(encoding="utf-8")
            )
            self.assertIs(metadata["chatgpt_adapter_generated"], True)
            self.assertEqual(mode(pack), 0o700)
            self.assertEqual(mode(package), 0o700)
            self.assertEqual(
                {path.name for path in package.iterdir()},
                ADAPTER_FILES | {"UPLOAD-README.md", "UPLOAD-MANIFEST.json"},
            )
            for path in package.iterdir():
                self.assertTrue(path.is_file())
                self.assertEqual(mode(path), 0o600)

            consent_text = (package / "09-CONSENT.md").read_text(encoding="utf-8")
            self.assertIn("predict-choice", consent_text)
            self.assertIn("write-in-style", consent_text)
            self.assertNotIn("A concise owner-reviewed summary can go here", "\n".join(
                path.read_text(encoding="utf-8")
                for path in package.iterdir()
                if path.suffix == ".md"
            ))
            setup = (package / "UPLOAD-README.md").read_text(encoding="utf-8")
            self.assertIn("https://learn.chatgpt.com/docs/projects", setup)
            self.assertIn("Do not mix files from different packages", setup)
            self.assertIn("all ten numbered filenames", setup)

    def test_interactive_consent_builds_verified_project_package(self) -> None:
        with tempfile.TemporaryDirectory(
            prefix="choiceprint-consent-project-integration-"
        ) as temporary:
            root = Path(temporary).resolve()
            root.chmod(0o700)
            curation = root / "fictional-unauthorized-curation.yaml"
            authorized = root / "fictional-authorized-curation.yaml"
            pack = root / "fictional-consented.choiceprint"
            package = root / "fictional-consented.chatgpt-upload"

            curation.write_bytes(CONSENT_FIXTURE.read_bytes())
            curation.chmod(0o600)
            original_curation = curation.read_bytes()
            consent = subprocess.run(
                [
                    sys.executable,
                    str(CONSENT_PREPARER),
                    "--curation",
                    str(curation),
                    "--output",
                    str(authorized),
                ],
                cwd=REPOSITORY_ROOT,
                env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"},
                input=(
                    "yes\n"
                    "no\n"
                    "yes\n"
                    "yes\n"
                    "AUTHORIZE CHOICEPRINT CONSENT\n"
                ),
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(consent.returncode, 0, consent.stderr)
            self.assertEqual(curation.read_bytes(), original_curation)
            self.assertEqual(mode(authorized), 0o600)

            authorized_document = yaml.safe_load(
                authorized.read_text(encoding="utf-8")
            )
            self.assertIs(
                authorized_document["consent"]["owner_authorized"], True
            )
            self.assertEqual(
                authorized_document["consent"]["allowed_sources"],
                ["src_fictional_interview"],
            )
            self.assertEqual(
                authorized_document["consent"]["allowed_modes"],
                ["predict-choice", "write-in-style"],
            )
            self.assertEqual(
                authorized_document["consent"]["allowed_uses"],
                [
                    "predict likely choices",
                    "draft in documented communication style",
                ],
            )

            build = self.run_cli(
                "build",
                "--persona",
                str(PERSONA),
                "--no-validation",
                "--curation",
                str(authorized),
                "--output",
                str(pack),
            )
            self.assertEqual(build.returncode, 0, build.stderr)

            package_result = self.run_cli(
                "package",
                "--pack",
                str(pack),
                "--output",
                str(package),
            )
            self.assertEqual(package_result.returncode, 0, package_result.stderr)
            verify = self.run_cli(
                "verify-package",
                "--pack",
                str(pack),
                "--package",
                str(package),
            )
            self.assertEqual(verify.returncode, 0, verify.stderr)

            self.assertEqual(mode(pack), 0o700)
            self.assertEqual(mode(package), 0o700)
            self.assertEqual(
                {path.name for path in package.iterdir()},
                ADAPTER_FILES | {"UPLOAD-README.md", "UPLOAD-MANIFEST.json"},
            )
            for path in package.iterdir():
                self.assertTrue(path.is_file())
                self.assertEqual(mode(path), 0o600)

            exported_markdown = "\n".join(
                path.read_text(encoding="utf-8")
                for path in package.iterdir()
                if path.suffix == ".md"
            )
            self.assertIn("src_fictional_interview", exported_markdown)
            self.assertNotIn("src_fictional_notes", exported_markdown)
            self.assertIn("predict-choice", exported_markdown)
            self.assertIn("write-in-style", exported_markdown)


if __name__ == "__main__":
    unittest.main()
