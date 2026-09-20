from __future__ import annotations

import hashlib
import importlib.util
import json
import os
import shutil
import stat
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
SCRIPT_PATH = (
    REPOSITORY_ROOT
    / "digital-twin"
    / "scripts"
    / "verify_choiceprint_upload.py"
)
EXAMPLE_PACK = (
    REPOSITORY_ROOT
    / "digital-twin"
    / "templates"
    / "example.choiceprint"
)

spec = importlib.util.spec_from_file_location(
    "verify_choiceprint_upload_for_tests", SCRIPT_PATH
)
if spec is None or spec.loader is None:
    raise RuntimeError("could not load upload verifier")
upload = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = upload
spec.loader.exec_module(upload)


def mode(path: Path) -> int:
    return stat.S_IMODE(path.stat().st_mode)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


class VerifyChoiceprintUploadTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name).resolve()
        self.root.chmod(0o700)
        self.pack = self.root / "person.choiceprint"
        shutil.copytree(EXAMPLE_PACK, self.pack)
        self._make_private(self.pack)
        self.package = self.root / "person.chatgpt-upload"
        self._populate_package()

    def _populate_package(self) -> None:
        self.package.mkdir(mode=0o700)
        adapter = self.pack / "adapters" / "chatgpt-project"
        for filename in upload.ADAPTER_FILES:
            destination = self.package / filename
            shutil.copyfile(adapter / filename, destination)
            destination.chmod(0o600)
        readme = self.package / upload.README_NAME
        shutil.copyfile(upload.UPLOAD_README_TEMPLATE, readme)
        readme.chmod(0o600)

    def tearDown(self) -> None:
        self.temporary.cleanup()

    @staticmethod
    def _make_private(root: Path) -> None:
        for path in (root, *root.rglob("*")):
            if path.is_dir():
                path.chmod(0o700)
            elif path.is_file():
                path.chmod(0o600)

    def create(self) -> dict[str, object]:
        return upload.create_manifest(
            package_path=self.package,
            choiceprint_path=self.pack,
        )

    def verify(self) -> dict[str, object]:
        return upload.verify_package(
            package_path=self.package,
            choiceprint_path=self.pack,
        )

    def test_create_and_verify_bind_exact_private_package(self) -> None:
        created = self.create()
        manifest_path = self.package / upload.MANIFEST_NAME
        self.assertEqual(mode(self.package), 0o700)
        self.assertEqual(mode(manifest_path), 0o600)
        self.assertEqual(
            {path.name for path in self.package.iterdir()},
            {*upload.HASHED_PACKAGE_FILES, upload.MANIFEST_NAME},
        )
        self.assertTrue(
            all(mode(path) == 0o600 for path in self.package.iterdir())
        )
        self.assertEqual(
            created["choiceprint_build_metadata_sha256"],
            sha256(self.pack / "build-metadata.json"),
        )
        self.assertEqual(
            created["project_sources"], list(upload.PROJECT_SOURCES)
        )
        for filename in upload.HASHED_PACKAGE_FILES:
            self.assertEqual(created["file_sha256"][filename], sha256(
                self.package / filename
            ))

        raw_manifest = manifest_path.read_text(encoding="utf-8")
        self.assertNotIn(str(self.root), raw_manifest)
        before = {
            path.name: (path.read_bytes(), mode(path))
            for path in self.package.iterdir()
        }
        self.assertEqual(self.verify(), created)
        after = {
            path.name: (path.read_bytes(), mode(path))
            for path in self.package.iterdir()
        }
        self.assertEqual(after, before)

    def test_allowlist_comes_from_canonical_validator(self) -> None:
        expected = tuple(
            path.removeprefix(upload.ADAPTER_PREFIX)
            for path in upload.VALIDATOR.ADAPTER_REQUIRED_PATHS
        )
        self.assertEqual(upload.ADAPTER_FILES, expected)

    def test_create_rejects_adapter_that_differs_from_source(self) -> None:
        target = self.package / upload.PROJECT_SOURCES[0]
        target.write_text("changed\n", encoding="utf-8")
        target.chmod(0o600)
        with self.assertRaisesRegex(
            upload.UploadPackageError, "validated Choiceprint adapter"
        ):
            self.create()
        self.assertFalse((self.package / upload.MANIFEST_NAME).exists())

    def test_verify_rejects_adapter_tampering(self) -> None:
        self.create()
        target = self.package / upload.PROJECT_SOURCES[1]
        target.write_bytes(target.read_bytes() + b"changed\n")
        with self.assertRaisesRegex(
            upload.UploadPackageError, "changed after packaging"
        ):
            self.verify()

    def test_verify_rejects_readme_change_even_with_updated_hash(self) -> None:
        self.create()
        readme = self.package / upload.README_NAME
        readme.write_bytes(readme.read_bytes() + b"changed\n")
        manifest_path = self.package / upload.MANIFEST_NAME
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        manifest["file_sha256"][upload.README_NAME] = sha256(readme)
        manifest_path.write_text(
            json.dumps(manifest, sort_keys=True) + "\n", encoding="utf-8"
        )
        manifest_path.chmod(0o600)
        with self.assertRaisesRegex(
            upload.UploadPackageError, "tracked setup instructions"
        ):
            self.verify()

    def test_source_directory_swap_during_validation_is_rejected(self) -> None:
        self.create()
        replacement = self.root / "replacement.choiceprint"
        shutil.copytree(self.pack, replacement)
        self._make_private(replacement)
        target = (
            replacement
            / "adapters"
            / "chatgpt-project"
            / upload.PROJECT_SOURCES[0]
        )
        target.write_text("invalid replacement\n", encoding="utf-8")
        target.chmod(0o600)
        validated = self.root / "validated.choiceprint"
        real_validate = upload.VALIDATOR.validate_bundle

        def swap_after_validation(path: Path) -> object:
            result = real_validate(path)
            path.rename(validated)
            replacement.rename(path)
            return result

        with mock.patch.object(
            upload.VALIDATOR,
            "validate_bundle",
            side_effect=swap_after_validation,
        ):
            with self.assertRaisesRegex(
                upload.UploadPackageError, "changed during validation"
            ):
                self.verify()

    def test_package_permission_change_during_verification_is_rejected(
        self,
    ) -> None:
        self.create()
        real_validate = upload._validated_source_adapter

        def make_package_public(path: Path) -> object:
            result = real_validate(path)
            self.package.chmod(0o755)
            return result

        with mock.patch.object(
            upload,
            "_validated_source_adapter",
            side_effect=make_package_public,
        ):
            with self.assertRaisesRegex(
                upload.UploadPackageError, "mode 0700"
            ):
                self.verify()

    @unittest.skipUnless(hasattr(os, "symlink"), "symlinks are unavailable")
    def test_package_file_swap_during_verification_is_rejected(self) -> None:
        self.create()
        target = self.package / upload.PROJECT_SOURCES[1]
        source = (
            self.pack
            / "adapters"
            / "chatgpt-project"
            / target.name
        )
        real_file_set = upload._package_file_set

        def replace_after_check(
            package: Path, *, include_manifest: bool
        ) -> set[str]:
            result = real_file_set(
                package, include_manifest=include_manifest
            )
            target.unlink()
            target.symlink_to(source)
            return result

        with mock.patch.object(
            upload, "_package_file_set", side_effect=replace_after_check
        ):
            with self.assertRaisesRegex(upload.UploadPackageError, "symlinked"):
                self.verify()

    def test_verify_rejects_changed_source_pack(self) -> None:
        self.create()
        metadata = self.pack / "build-metadata.json"
        metadata.write_bytes(metadata.read_bytes() + b"\n")
        with self.assertRaisesRegex(
            upload.UploadPackageError, "current Choiceprint build"
        ):
            self.verify()

    def test_create_refuses_existing_manifest_without_changing_it(self) -> None:
        manifest = self.package / upload.MANIFEST_NAME
        manifest.write_text("keep\n", encoding="utf-8")
        manifest.chmod(0o600)
        before = manifest.read_bytes()
        with self.assertRaisesRegex(
            upload.UploadPackageError, "refusing to overwrite"
        ):
            self.create()
        self.assertEqual(manifest.read_bytes(), before)

    def test_exact_file_set_rejects_missing_extra_and_nested_entries(self) -> None:
        for kind in ("missing", "extra", "nested"):
            with self.subTest(kind=kind):
                if self.package.exists():
                    shutil.rmtree(self.package)
                self._populate_package()
                if kind == "missing":
                    (self.package / upload.PROJECT_SOURCES[2]).unlink()
                elif kind == "extra":
                    extra = self.package / "profile.json"
                    extra.write_text("{}\n", encoding="utf-8")
                    extra.chmod(0o600)
                else:
                    (self.package / "private").mkdir(mode=0o700)
                with self.assertRaisesRegex(
                    upload.UploadPackageError, "file set is invalid"
                ):
                    self.create()

    @unittest.skipUnless(hasattr(os, "symlink"), "symlinks are unavailable")
    def test_rejects_symlinked_package_file_and_pack_root(self) -> None:
        target = self.package / upload.PROJECT_SOURCES[3]
        target.unlink()
        target.symlink_to(
            self.pack / "adapters" / "chatgpt-project" / target.name
        )
        with self.assertRaisesRegex(upload.UploadPackageError, "symlinked"):
            self.create()

        shutil.rmtree(self.package)
        linked_pack = self.root / "linked.choiceprint"
        linked_pack.symlink_to(self.pack, target_is_directory=True)
        self.package.mkdir(mode=0o700)
        with self.assertRaisesRegex(upload.UploadPackageError, "symlinked"):
            upload.verify_package(
                package_path=self.package,
                choiceprint_path=linked_pack,
            )

    @unittest.skipUnless(hasattr(os, "link"), "hard links are unavailable")
    def test_rejects_hardlink_between_source_and_package(self) -> None:
        target = self.package / upload.PROJECT_SOURCES[4]
        source = (
            self.pack
            / "adapters"
            / "chatgpt-project"
            / target.name
        )
        target.unlink()
        os.link(source, target)
        with self.assertRaisesRegex(upload.UploadPackageError, "hard-linked"):
            self.create()

    @unittest.skipIf(os.name == "nt", "POSIX modes are unavailable")
    def test_rejects_non_private_modes(self) -> None:
        target = self.package / upload.PROJECT_SOURCES[4]
        target.chmod(0o640)
        with self.assertRaisesRegex(upload.UploadPackageError, "mode 0600"):
            self.create()

        target.chmod(0o600)
        self.package.chmod(0o750)
        with self.assertRaisesRegex(upload.UploadPackageError, "mode 0700"):
            self.create()

    def test_manifest_parser_rejects_duplicate_keys_and_nonfinite_values(self) -> None:
        self.create()
        manifest = self.package / upload.MANIFEST_NAME
        for raw, message in (
            ('{"schema_version": 1, "schema_version": 1}\n', "duplicate"),
            ('{"schema_version": NaN}\n', "non-finite"),
        ):
            with self.subTest(message=message):
                manifest.write_text(raw, encoding="utf-8")
                manifest.chmod(0o600)
                with self.assertRaisesRegex(upload.UploadPackageError, message):
                    self.verify()

    def test_manifest_schema_is_closed(self) -> None:
        self.create()
        manifest_path = self.package / upload.MANIFEST_NAME
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        manifest["persona_id"] = "must-not-be-recorded"
        manifest_path.write_text(
            json.dumps(manifest) + "\n", encoding="utf-8"
        )
        manifest_path.chmod(0o600)
        with self.assertRaisesRegex(upload.UploadPackageError, "fields"):
            self.verify()

    def test_atomic_manifest_race_preserves_winner(self) -> None:
        destination = self.package / upload.MANIFEST_NAME
        real_link = os.link

        def race(source: Path, target: Path, **kwargs: object) -> None:
            Path(target).write_text("winner\n", encoding="utf-8")
            Path(target).chmod(0o600)
            real_link(source, target, **kwargs)

        with mock.patch.object(upload.os, "link", side_effect=race):
            with self.assertRaisesRegex(
                upload.UploadPackageError, "refusing to overwrite"
            ):
                upload._atomic_write_json(destination, {"value": 1})
        self.assertEqual(destination.read_text(encoding="utf-8"), "winner\n")
        self.assertEqual(
            list(self.package.glob(f".{upload.MANIFEST_NAME}.tmp-*")), []
        )

    def test_darwin_provenance_update_keeps_content_snapshot_valid(self) -> None:
        expected = {
            "file": (
                "file",
                1,
                2,
                0o600,
                1,
                501,
                20,
                0,
                100,
                200,
                300,
                (),
                "a" * 64,
            )
        }
        for transition, flags, xattrs in (
            ("tracked flag", upload.DARWIN_ASYNC_FLAG_MASK, ()),
            (
                "provenance xattr",
                0,
                (("com.apple.provenance", "b" * 64),),
            ),
        ):
            current = {
                "file": (
                    "file",
                    1,
                    2,
                    0o600,
                    1,
                    501,
                    20,
                    flags,
                    100,
                    200,
                    301,
                    xattrs,
                    "a" * 64,
                )
            }
            with (
                self.subTest(transition=transition),
                mock.patch.object(upload.sys, "platform", "darwin"),
                mock.patch.object(
                    upload, "_capture_private_tree", return_value=current
                ),
            ):
                upload._assert_tree_unchanged(
                    self.package, expected, "package"
                )

    def test_darwin_provenance_exception_rejects_other_changes(self) -> None:
        expected = {
            "file": (
                "file",
                1,
                2,
                0o600,
                1,
                501,
                20,
                0,
                100,
                200,
                300,
                (),
                "a" * 64,
            )
        }
        for field, current in (
            (
                "content",
                {
                    "file": (
                        *expected["file"][:-1],
                        "b" * 64,
                    )
                },
            ),
            (
                "xattr",
                {
                    "file": (
                        *expected["file"][:-2],
                        (("com.example.other", "c" * 64),),
                        expected["file"][-1],
                    )
                },
            ),
            (
                "flags",
                {
                    "file": (
                        *expected["file"][:7],
                        stat.UF_NODUMP,
                        *expected["file"][8:],
                    )
                },
            ),
        ):
            with (
                self.subTest(field=field),
                mock.patch.object(upload.sys, "platform", "darwin"),
                mock.patch.object(
                    upload, "_capture_private_tree", return_value=current
                ),
                self.assertRaisesRegex(
                    upload.UploadPackageError, "changed during verification"
                ),
            ):
                upload._assert_tree_unchanged(
                    self.package, expected, "package"
                )

    def test_failed_post_publish_verification_removes_new_manifest(self) -> None:
        with mock.patch.object(
            upload,
            "verify_package",
            side_effect=upload.UploadPackageError("post-check failed"),
        ):
            with self.assertRaisesRegex(
                upload.UploadPackageError, "post-check failed"
            ):
                self.create()
        self.assertFalse((self.package / upload.MANIFEST_NAME).exists())

    def test_parser_has_no_force_or_overwrite_option(self) -> None:
        parser = upload._build_parser()
        for option in ("--force", "--overwrite", "--repair"):
            with self.subTest(option=option):
                with self.assertRaises(SystemExit):
                    parser.parse_args(
                        [
                            "create",
                            "--package",
                            str(self.package),
                            "--pack",
                            str(self.pack),
                            option,
                        ]
                    )

    def test_package_must_be_separate_from_canonical_pack(self) -> None:
        nested = self.pack / "upload"
        nested.mkdir(mode=0o700)
        with self.assertRaisesRegex(upload.UploadPackageError, "separate"):
            upload.create_manifest(
                package_path=nested,
                choiceprint_path=self.pack,
            )


if __name__ == "__main__":
    unittest.main()
