from __future__ import annotations

import json
import os
import shutil
import stat
import subprocess
import tempfile
import unittest
from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
HELPER_SOURCE = REPOSITORY_ROOT / "scripts" / "initialize_choiceprint.sh"
INSTALL_SOURCE = REPOSITORY_ROOT / "install.sh"


STUB_CLI = r"""#!/bin/zsh
set -euo pipefail
umask 077

root_dir="$(cd -- "$(dirname -- "$0")" && pwd -P)"
curation="$root_dir/matraix/personal-persona/source-material/choiceprint-curation.yaml"
pack="$root_dir/matraix/personal-persona/digital-twin/test-person.choiceprint"
print -r -- "${(j: :)@}" >> "$root_dir/calls.log"

case "$1" in
  init)
    [[ ! -e "$curation" && ! -L "$curation" ]] || exit 2
    mkdir -p -m 700 -- "${curation:h}"
    print -r -- $'consent:\n  owner_authorized: false' > "$curation"
    chmod 600 "$curation"
    ;;
  build)
    [[ "${CHOICEPRINT_TEST_BUILD_FAIL:-0}" != "1" ]] || exit 3
    [[ ! -e "$pack" && ! -L "$pack" ]] || exit 4
    mkdir -p -m 700 -- "$pack"
    print -r -- "valid" > "$pack/validated.marker"
    chmod 600 "$pack/validated.marker"
    ;;
  validate)
    [[ -d "$pack" && ! -L "$pack" ]] || exit 5
    [[ "$(<"$pack/validated.marker")" == "valid" ]] || exit 6
    print -- "stub pack valid"
    ;;
  *) exit 7 ;;
esac
"""


class InitializeChoiceprintTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory(
            prefix="choiceprint-install-test-"
        )
        self.root = Path(self.temporary.name) / "repo"
        (self.root / "scripts").mkdir(parents=True)
        self.helper = self.root / "scripts/initialize_choiceprint.sh"
        shutil.copyfile(HELPER_SOURCE, self.helper)
        self.cli = self.root / "choiceprint.sh"
        self.cli.write_text(STUB_CLI, encoding="utf-8")

        self.persona_root = self.root / "matraix/personal-persona"
        self.persona_root.mkdir(parents=True)
        self.persona = self.persona_root / "persona.yaml"
        self.persona.write_text(
            "persona_id: test-person\ndisplay_name: Test Person\ndimensions: {}\n",
            encoding="utf-8",
        )
        self.curation = (
            self.persona_root / "source-material/choiceprint-curation.yaml"
        )
        self.pack = self.persona_root / "digital-twin/test-person.choiceprint"
        self.call_log = self.root / "calls.log"

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def run_helper(
        self, *, build_fails: bool = False
    ) -> subprocess.CompletedProcess[str]:
        environment = os.environ.copy()
        environment["CHOICEPRINT_TEST_BUILD_FAIL"] = "1" if build_fails else "0"
        return subprocess.run(
            ["/bin/zsh", str(self.helper)],
            cwd=self.root,
            env=environment,
            capture_output=True,
            text=True,
            check=False,
        )

    def calls(self) -> list[str]:
        if not self.call_log.exists():
            return []
        return self.call_log.read_text(encoding="utf-8").splitlines()

    def create_install_fixture(self, name: str = "install-fixture") -> Path:
        install_root = self.root / name
        install_root.mkdir()
        shutil.copyfile(INSTALL_SOURCE, install_root / "install.sh")

        assets = install_root / "matraix/personal-persona/survey/assets"
        assets.mkdir(parents=True)
        (assets / "validation.js").write_text("fixture\n", encoding="utf-8")
        (assets / "validation.css").write_text("fixture\n", encoding="utf-8")
        (install_root / "matraix/requirements.txt").write_text(
            "# fixture\n", encoding="utf-8"
        )

        venv_python = install_root / "matraix/.venv/bin/python"
        venv_python.parent.mkdir(parents=True)
        venv_python.write_text(
            "#!/bin/zsh\nprint -r -- pip >> \"$CHOICEPRINT_INSTALL_TEST_LOG\"\n",
            encoding="utf-8",
        )
        venv_python.chmod(0o755)

        onboarding = install_root / "onboard.sh"
        onboarding.write_text(
            """#!/bin/zsh
set -e
root_dir="$(cd -- "$(dirname -- "$0")" && pwd -P)"
print -r -- onboarding >> "$CHOICEPRINT_INSTALL_TEST_LOG"
mkdir -p -- "$root_dir/matraix/personal-persona"
print -r -- 'persona_id: test-person' > "$root_dir/matraix/personal-persona/persona.yaml"
""",
            encoding="utf-8",
        )
        onboarding.chmod(0o755)

        initializer = install_root / "scripts/initialize_choiceprint.sh"
        initializer.parent.mkdir()
        initializer.write_text(
            """#!/bin/zsh
set -e
root_dir="$(cd -- "$(dirname -- "$0")/.." && pwd -P)"
[[ -f "$root_dir/matraix/personal-persona/persona.yaml" ]]
print -r -- choiceprint >> "$CHOICEPRINT_INSTALL_TEST_LOG"
[[ "${CHOICEPRINT_INSTALL_TEST_FAIL:-0}" != "1" ]]
""",
            encoding="utf-8",
        )

        required_files = (
            install_root / "choiceprint.sh",
            install_root / "digital-twin/scripts/build_choiceprint.py",
            install_root / "digital-twin/scripts/validate_twin_pack.py",
            install_root / "digital-twin/scripts/check_choiceprint_pack_upgrade.py",
            install_root / "digital-twin/scripts/review_choiceprint_claims.py",
            install_root / "digital-twin/scripts/review_choiceprint_coverage.py",
            install_root / "digital-twin/scripts/review_choiceprint_holdout.py",
            install_root / "digital-twin/scripts/collect_choiceprint_answers.py",
            install_root / "digital-twin/scripts/collect_choiceprint_interview.py",
            install_root / "digital-twin/scripts/prepare_choiceprint_consent.py",
            install_root / "digital-twin/scripts/verify_choiceprint_upload.py",
            install_root / "digital-twin/scripts/retrieve_choiceprint_context.py",
            install_root / "digital-twin/scripts/serve_choiceprint_mcp.py",
            install_root / "digital-twin/requirements-mcp.txt",
            install_root / "digital-twin/interview/decision-interview.v1.json",
            install_root / "digital-twin/templates/curation.example.yaml",
            install_root / "digital-twin/templates/chatgpt-upload-readme.md",
        )
        for path in required_files:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("fixture\n", encoding="utf-8")
        return install_root

    def run_installer(
        self, install_root: Path, *, choiceprint_fails: bool = False
    ) -> subprocess.CompletedProcess[str]:
        install_log = install_root / "calls.log"
        environment = os.environ.copy()
        environment["CHOICEPRINT_INSTALL_TEST_LOG"] = str(install_log)
        environment["CHOICEPRINT_INSTALL_TEST_FAIL"] = (
            "1" if choiceprint_fails else "0"
        )
        return subprocess.run(
            ["/bin/zsh", str(install_root / "install.sh")],
            cwd=install_root,
            env=environment,
            capture_output=True,
            text=True,
            check=False,
        )

    def test_fresh_setup_initializes_unauthorized_curation_and_valid_pack(self) -> None:
        result = self.run_helper()

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(
            self.calls(), ["init", "validate", "build --no-curation", "validate"]
        )
        self.assertIn("owner_authorized: false", self.curation.read_text())
        self.assertEqual((self.pack / "validated.marker").read_text(), "valid\n")
        self.assertIn("private curation and canonical pack are ready", result.stdout)

    def test_rerun_preserves_existing_curation_and_valid_pack(self) -> None:
        first = self.run_helper()
        self.assertEqual(first.returncode, 0, first.stderr)
        self.curation.write_text(
            "consent:\n  owner_authorized: true\nprivate: keep\n",
            encoding="utf-8",
        )
        curation_before = self.curation.read_bytes()
        pack_before = (self.pack / "validated.marker").read_bytes()
        self.call_log.unlink()

        second = self.run_helper()

        self.assertEqual(second.returncode, 0, second.stderr)
        self.assertEqual(self.calls(), ["validate"])
        self.assertEqual(self.curation.read_bytes(), curation_before)
        self.assertEqual((self.pack / "validated.marker").read_bytes(), pack_before)
        self.assertIn("preserving the existing validated canonical pack", second.stdout)

    def test_invalid_existing_pack_is_not_overwritten(self) -> None:
        self.curation.parent.mkdir(mode=0o700)
        self.curation.write_text(
            "consent:\n  owner_authorized: true\nprivate: keep\n",
            encoding="utf-8",
        )
        self.pack.mkdir(parents=True)
        marker = self.pack / "validated.marker"
        marker.write_text("invalid\n", encoding="utf-8")
        curation_before = self.curation.read_bytes()
        marker_before = marker.read_bytes()

        result = self.run_helper()

        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.calls(), ["validate", "build --no-curation"])
        self.assertEqual(self.curation.read_bytes(), curation_before)
        self.assertEqual(marker.read_bytes(), marker_before)
        self.assertIn("stopped without replacing private data", result.stderr)
        self.assertIn("Do not use --force", result.stderr)

    def test_failed_first_build_preserves_initialized_curation(self) -> None:
        result = self.run_helper(build_fails=True)

        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.calls(), ["init", "validate", "build --no-curation"])
        self.assertIn("owner_authorized: false", self.curation.read_text())
        self.assertFalse(self.pack.exists())
        self.assertIn("stopped without replacing private data", result.stderr)

    def test_symlinked_curation_is_rejected_without_running_cli(self) -> None:
        self.curation.parent.mkdir(mode=0o700)
        target = self.root / "outside.yaml"
        target.write_text("keep\n", encoding="utf-8")
        self.curation.symlink_to(target)

        result = self.run_helper()

        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.calls(), [])
        self.assertEqual(target.read_text(encoding="utf-8"), "keep\n")
        self.assertIn("refusing the symlinked", result.stderr)

    def test_missing_persona_is_rejected_without_running_cli(self) -> None:
        self.persona.unlink()

        result = self.run_helper()

        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.calls(), [])
        self.assertIn("onboarding did not produce a safe active persona", result.stderr)

    def test_installer_runs_choiceprint_only_after_onboarding(self) -> None:
        source = INSTALL_SOURCE.read_text(encoding="utf-8")
        onboarding = source.index('"$root_dir/onboard.sh"')
        choiceprint = source.index(
            '"/bin/zsh" "$root_dir/scripts/initialize_choiceprint.sh"'
        )
        marker = source.index('touch "$install_complete_marker"')
        self.assertLess(onboarding, choiceprint)
        self.assertLess(choiceprint, marker)

    def test_stubbed_installer_completes_in_required_order(self) -> None:
        install_root = self.create_install_fixture()

        result = self.run_installer(install_root)

        self.assertEqual(result.returncode, 0, result.stderr)
        calls = (install_root / "calls.log").read_text().splitlines()
        self.assertEqual(calls, ["pip", "onboarding", "choiceprint"])
        marker = install_root / "matraix/.venv/.matraix-install-complete"
        self.assertTrue(marker.is_file())
        if os.name == "posix":
            self.assertEqual(stat.S_IMODE(marker.stat().st_mode), 0o600)

    def test_failed_choiceprint_setup_does_not_mark_install_complete(self) -> None:
        install_root = self.create_install_fixture()

        result = self.run_installer(install_root, choiceprint_fails=True)

        self.assertNotEqual(result.returncode, 0)
        calls = (install_root / "calls.log").read_text().splitlines()
        self.assertEqual(calls, ["pip", "onboarding", "choiceprint"])
        marker = install_root / "matraix/.venv/.matraix-install-complete"
        self.assertFalse(marker.exists())

    def test_installer_rejects_missing_pack_upgrade_checker(self) -> None:
        install_root = self.create_install_fixture()
        checker = (
            install_root
            / "digital-twin/scripts/check_choiceprint_pack_upgrade.py"
        )
        checker.unlink()

        result = self.run_installer(install_root)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("bundled Choiceprint file is missing or unsafe", result.stderr)
        self.assertFalse((install_root / "calls.log").exists())
        marker = install_root / "matraix/.venv/.matraix-install-complete"
        self.assertFalse(marker.exists())

    def test_installer_rejects_missing_interview_product_file(self) -> None:
        relative_paths = (
            "digital-twin/scripts/collect_choiceprint_interview.py",
            "digital-twin/interview/decision-interview.v1.json",
        )
        for index, relative_path in enumerate(relative_paths):
            with self.subTest(relative_path=relative_path):
                install_root = self.create_install_fixture(
                    f"install-fixture-interview-{index}"
                )
                (install_root / relative_path).unlink()

                result = self.run_installer(install_root)

                self.assertNotEqual(result.returncode, 0)
                self.assertIn(
                    "bundled Choiceprint file is missing or unsafe",
                    result.stderr,
                )
                self.assertFalse((install_root / "calls.log").exists())
                marker = install_root / "matraix/.venv/.matraix-install-complete"
                self.assertFalse(marker.exists())

    def test_installer_rejects_missing_consent_preparer(self) -> None:
        install_root = self.create_install_fixture(
            "install-fixture-consent-preparer"
        )
        preparer = (
            install_root
            / "digital-twin/scripts/prepare_choiceprint_consent.py"
        )
        preparer.unlink()

        result = self.run_installer(install_root)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn(
            "bundled Choiceprint file is missing or unsafe",
            result.stderr,
        )
        self.assertIn(str(preparer), result.stderr)
        self.assertFalse((install_root / "calls.log").exists())
        marker = install_root / "matraix/.venv/.matraix-install-complete"
        self.assertFalse(marker.exists())

    def test_real_commands_build_valid_pack_without_authorizing_adapter(self) -> None:
        with tempfile.TemporaryDirectory(
            prefix="choiceprint-real-install-test-"
        ) as temporary:
            private_root = Path(temporary).resolve()
            curation = private_root / "choiceprint-curation.yaml"
            output_parent = private_root / "packs"
            output_parent.mkdir()
            pack = output_parent / "new-person.choiceprint"
            cli = REPOSITORY_ROOT / "choiceprint.sh"
            persona = (
                REPOSITORY_ROOT
                / "matraix/personal-persona/persona.example.yaml"
            )

            commands = (
                ("init", "--curation", str(curation)),
                (
                    "build",
                    "--persona",
                    str(persona),
                    "--no-validation",
                    "--no-curation",
                    "--output",
                    str(pack),
                ),
                ("validate", "--pack", str(pack)),
            )
            for arguments in commands:
                result = subprocess.run(
                    ["/bin/zsh", str(cli), *arguments],
                    cwd=REPOSITORY_ROOT,
                    capture_output=True,
                    text=True,
                    check=False,
                )
                self.assertEqual(result.returncode, 0, result.stderr)

            self.assertIn("owner_authorized: false", curation.read_text())
            metadata = json.loads(
                (pack / "build-metadata.json").read_text(encoding="utf-8")
            )
            self.assertIs(metadata["chatgpt_adapter_generated"], False)
            self.assertFalse((pack / "adapters").exists())
            if os.name == "posix":
                self.assertEqual(stat.S_IMODE(pack.stat().st_mode), 0o700)
                for path in pack.rglob("*"):
                    expected = 0o700 if path.is_dir() else 0o600
                    self.assertEqual(stat.S_IMODE(path.stat().st_mode), expected)


if __name__ == "__main__":
    unittest.main()
