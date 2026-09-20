from __future__ import annotations

import hashlib
import importlib.util
import io
import json
import os
import shutil
import stat
import sys
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from unittest.mock import patch


SCRIPT_PATH = (
    Path(__file__).resolve().parents[1]
    / "scripts"
    / "check_choiceprint_pack_upgrade.py"
)
SPEC = importlib.util.spec_from_file_location(
    "check_choiceprint_pack_upgrade_for_test", SCRIPT_PATH
)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"cannot import pack-upgrade checker from {SCRIPT_PATH}")
CHECKER = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = CHECKER
SPEC.loader.exec_module(CHECKER)
EXAMPLE_PATH = Path(__file__).resolve().parents[1] / "templates/example.choiceprint"
FICTIONAL_PRIVATE_MARKER = "fictional-owner-value-never-print"


def write_json(path: Path, value: object) -> None:
    path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")


def refresh_integrity_metadata(root: Path) -> None:
    metadata_path = root / "build-metadata.json"
    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    metadata["file_sha256"] = {
        path.relative_to(root).as_posix(): hashlib.sha256(path.read_bytes()).hexdigest()
        for path in sorted(root.rglob("*"))
        if path.is_file()
        and not path.is_symlink()
        and path != metadata_path
    }
    write_json(metadata_path, metadata)


def secure_modes(root: Path) -> None:
    root.chmod(0o700)
    for path in sorted(root.rglob("*")):
        if path.is_dir():
            path.chmod(0o700)
        elif path.is_file():
            path.chmod(0o600)


def pack_snapshot(root: Path) -> dict[str, tuple[bytes | None, int, int]]:
    snapshot: dict[str, tuple[bytes | None, int, int]] = {}
    for path in [root, *sorted(root.rglob("*"))]:
        entry = path.lstat()
        relative = "." if path == root else path.relative_to(root).as_posix()
        data = path.read_bytes() if stat.S_ISREG(entry.st_mode) else None
        snapshot[relative] = (
            data,
            stat.S_IMODE(entry.st_mode),
            entry.st_mtime_ns,
        )
    return snapshot


class CheckChoiceprintPackUpgradeTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory(
            prefix="choiceprint-upgrade-check-test-"
        )
        self.temporary_root = Path(self.temporary.name).resolve()
        self.root = self.temporary_root / "fictional.choiceprint"
        shutil.copytree(EXAMPLE_PATH, self.root)
        secure_modes(self.root)

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def manifest(self) -> dict[str, object]:
        return json.loads((self.root / "manifest.json").read_text(encoding="utf-8"))

    def write_manifest(self, value: dict[str, object]) -> None:
        write_json(self.root / "manifest.json", value)
        refresh_integrity_metadata(self.root)

    def make_exact_legacy(self) -> None:
        manifest = self.manifest()
        coverage = manifest["coverage"]
        assert isinstance(coverage, dict)
        coverage.pop("declared_domains")
        coverage.pop("validation_events")
        manifest["fixture_marker"] = FICTIONAL_PRIVATE_MARKER
        self.write_manifest(manifest)

    def run_main(self) -> tuple[int, str, str]:
        stdout = io.StringIO()
        stderr = io.StringIO()
        with redirect_stdout(stdout), redirect_stderr(stderr):
            return_code = CHECKER.main([str(self.root)])
        return return_code, stdout.getvalue(), stderr.getvalue()

    def test_current_pack_reports_no_upgrade_needed(self) -> None:
        result = CHECKER.check_pack(self.root)
        return_code, stdout, stderr = self.run_main()

        self.assertEqual(result.status, "current")
        self.assertTrue(result.ok)
        self.assertEqual(return_code, 0)
        self.assertIn("current - no upgrade needed", stdout)
        self.assertIn("current validator: valid; 0 error(s)", stdout)
        self.assertEqual(stderr, "")
        self.assertNotIn(str(self.root), stdout)
        self.assertNotIn("Sample Person", stdout)

    def test_exact_legacy_delta_is_upgrade_ready_and_read_only(self) -> None:
        self.make_exact_legacy()
        validator_result = CHECKER.CURRENT_VALIDATOR.validate_bundle(self.root)
        self.assertEqual(
            validator_result.errors,
            [CHECKER.EXPECTED_VALIDATOR_ERROR],
        )
        before = pack_snapshot(self.root)

        result = CHECKER.check_pack(self.root)
        return_code, stdout, stderr = self.run_main()

        self.assertEqual(result.status, "upgrade-ready")
        self.assertTrue(result.ok)
        self.assertTrue(all(result.checks.values()), result.checks)
        self.assertEqual(return_code, 0)
        self.assertIn("pack-upgrade check: upgrade-ready", stdout)
        self.assertIn("legacy-coverage-schema", stdout)
        self.assertIn("files changed: none", stdout)
        self.assertIn("migration actions: unavailable", stdout)
        self.assertEqual(stderr, "")
        self.assertEqual(pack_snapshot(self.root), before)
        self.assertNotIn(FICTIONAL_PRIVATE_MARKER, stdout)
        self.assertNotIn(str(self.root), stdout)
        self.assertNotIn("Sample Person", stdout)

    def test_missing_only_required_field_is_not_the_known_legacy_shape(self) -> None:
        manifest = self.manifest()
        coverage = manifest["coverage"]
        assert isinstance(coverage, dict)
        coverage.pop("validation_events")
        self.write_manifest(manifest)

        result = CHECKER.check_pack(self.root)
        return_code, stdout, stderr = self.run_main()

        self.assertEqual(result.validator_error_count, 1)
        self.assertFalse(result.checks["legacy_shape"])
        self.assertEqual(result.status, "invalid")
        self.assertEqual(return_code, 1)
        self.assertEqual(stdout, "")
        self.assertIn("invalid or unsupported", stderr)

    def test_optional_declared_domains_can_be_absent_from_current_pack(self) -> None:
        manifest = self.manifest()
        coverage = manifest["coverage"]
        assert isinstance(coverage, dict)
        coverage.pop("declared_domains")
        self.write_manifest(manifest)

        result = CHECKER.check_pack(self.root)

        self.assertEqual(result.status, "current")
        self.assertEqual(result.validator_error_count, 0)

    def test_current_pack_accepts_stricter_modes_whitespace_and_empty_directory(
        self,
    ) -> None:
        holdout = self.root / "evals/holdout-private.jsonl"
        holdout.write_text(" \n\t", encoding="utf-8")
        (self.root / "empty-owner-directory").mkdir(mode=0o700)
        refresh_integrity_metadata(self.root)
        for path in [self.root, *sorted(self.root.rglob("*"))]:
            if path.is_dir():
                path.chmod(0o500)
            elif path.is_file():
                path.chmod(0o400)

        result = CHECKER.check_pack(self.root)

        self.assertEqual(result.status, "current")
        self.assertTrue(result.checks["permissions"])
        self.assertTrue(result.checks["holdout"])
        self.assertTrue(result.checks["inventory"])

    def test_legacy_shape_with_any_second_validator_error_is_rejected(self) -> None:
        self.make_exact_legacy()
        manifest = self.manifest()
        counts = manifest["counts"]
        assert isinstance(counts, dict)
        counts["claims"] = 99
        manifest["fixture_marker"] = FICTIONAL_PRIVATE_MARKER
        self.write_manifest(manifest)

        result = CHECKER.check_pack(self.root)
        return_code, stdout, stderr = self.run_main()

        self.assertGreaterEqual(result.validator_error_count or 0, 2)
        self.assertEqual(result.status, "invalid")
        self.assertEqual(return_code, 1)
        self.assertEqual(stdout, "")
        self.assertIn("categories=", stderr)
        self.assertNotIn(FICTIONAL_PRIVATE_MARKER, stderr)
        self.assertNotIn("99", stderr)
        self.assertNotIn(str(self.root), stderr)

    def test_validator_error_interpolating_private_identifier_is_sanitized(self) -> None:
        self.make_exact_legacy()
        claims_path = self.root / "profile/claims.jsonl"
        claim = json.loads(claims_path.read_text(encoding="utf-8"))
        claim["evidence_refs"] = [FICTIONAL_PRIVATE_MARKER]
        claims_path.write_text(json.dumps(claim) + "\n", encoding="utf-8")
        refresh_integrity_metadata(self.root)

        validator_result = CHECKER.CURRENT_VALIDATOR.validate_bundle(self.root)
        self.assertTrue(
            any(FICTIONAL_PRIVATE_MARKER in error for error in validator_result.errors),
            validator_result.errors,
        )
        return_code, stdout, stderr = self.run_main()

        self.assertEqual(return_code, 1)
        self.assertEqual(stdout, "")
        self.assertIn("categories=", stderr)
        self.assertNotIn(FICTIONAL_PRIVATE_MARKER, stderr)
        self.assertNotIn(str(self.root), stderr)

    def test_restored_source_mutation_is_detected_by_change_time(self) -> None:
        self.make_exact_legacy()
        target = self.root / "profile/claims.jsonl"
        original = target.read_bytes()
        original_stat = target.stat()
        run_validator = CHECKER._run_current_validator

        def mutate_then_restore(pack: Path):
            target.write_bytes(b"x" * len(original))
            target.write_bytes(original)
            os.utime(
                target,
                ns=(original_stat.st_atime_ns, original_stat.st_mtime_ns),
            )
            return run_validator(pack)

        with patch.object(
            CHECKER,
            "_run_current_validator",
            side_effect=mutate_then_restore,
        ):
            result = CHECKER.check_pack(self.root)

        self.assertEqual(result.status, "invalid")
        self.assertFalse(result.checks["stable_snapshot"])
        self.assertEqual(target.read_bytes(), original)

    def test_hash_permission_holdout_and_inventory_defects_fail_closed(self) -> None:
        mutations = {
            "hash": lambda: (self.root / "profile/claims.jsonl").write_text(
                '{"changed":true}\n', encoding="utf-8"
            ),
            "permission": lambda: (self.root / "profile/claims.jsonl").chmod(0o640),
            "holdout": lambda: (self.root / "evals/holdout-private.jsonl").write_text(
                '{"fictional":"answer"}\n', encoding="utf-8"
            ),
            "inventory": lambda: (self.root / "unexpected.txt").write_text(
                FICTIONAL_PRIVATE_MARKER, encoding="utf-8"
            ),
        }
        for name, mutate in mutations.items():
            with self.subTest(name=name):
                shutil.rmtree(self.root)
                shutil.copytree(EXAMPLE_PATH, self.root)
                secure_modes(self.root)
                mutate()
                result = CHECKER.check_pack(self.root)
                self.assertEqual(result.status, "invalid")

    @unittest.skipUnless(os.name == "posix", "symlink behavior requires POSIX")
    def test_symlink_root_and_inner_file_fail_closed_without_leaking_paths(self) -> None:
        link = self.temporary_root / "fictional-link.choiceprint"
        link.symlink_to(self.root, target_is_directory=True)
        root_result = CHECKER.check_pack(link)
        self.assertEqual(root_result.status, "invalid")

        target = self.root / "profile/claims-target.jsonl"
        original = self.root / "profile/claims.jsonl"
        original.replace(target)
        original.symlink_to(target.name)
        inner_result = CHECKER.check_pack(self.root)
        self.assertEqual(inner_result.status, "invalid")

        stdout = io.StringIO()
        stderr = io.StringIO()
        with redirect_stdout(stdout), redirect_stderr(stderr):
            return_code = CHECKER.main([str(link)])
        self.assertEqual(return_code, 1)
        self.assertEqual(stdout.getvalue(), "")
        self.assertNotIn(str(link), stderr.getvalue())
        self.assertNotIn(str(self.root), stderr.getvalue())

    def test_malformed_manifest_fails_closed_with_sanitized_output(self) -> None:
        (self.root / "manifest.json").write_text(
            '{"coverage":{},"coverage":{"private":"'
            + FICTIONAL_PRIVATE_MARKER
            + '"}}\n',
            encoding="utf-8",
        )
        refresh_integrity_metadata(self.root)

        return_code, stdout, stderr = self.run_main()

        self.assertEqual(return_code, 1)
        self.assertEqual(stdout, "")
        self.assertIn("invalid or unsupported", stderr)
        self.assertNotIn(FICTIONAL_PRIVATE_MARKER, stderr)
        self.assertNotIn(str(self.root), stderr)

    def test_unexpected_internal_error_is_sanitized(self) -> None:
        stdout = io.StringIO()
        stderr = io.StringIO()
        with (
            patch.object(
                CHECKER,
                "check_pack",
                side_effect=RuntimeError(FICTIONAL_PRIVATE_MARKER),
            ),
            redirect_stdout(stdout),
            redirect_stderr(stderr),
        ):
            return_code = CHECKER.main([str(self.root)])

        self.assertEqual(return_code, 1)
        self.assertEqual(stdout.getvalue(), "")
        self.assertIn("invalid or unsupported", stderr.getvalue())
        self.assertNotIn(FICTIONAL_PRIVATE_MARKER, stderr.getvalue())
        self.assertNotIn(str(self.root), stderr.getvalue())


if __name__ == "__main__":
    unittest.main()
