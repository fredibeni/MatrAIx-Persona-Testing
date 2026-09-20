from __future__ import annotations

import importlib.util
import json
import sys
import unittest
from pathlib import Path, PurePosixPath
from unittest.mock import patch


CHECKER_PATH = Path(__file__).resolve().parents[2] / "scripts" / "check_release.py"
SPEC = importlib.util.spec_from_file_location("check_release_for_test", CHECKER_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"cannot import release checker from {CHECKER_PATH}")
CHECKER = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = CHECKER
SPEC.loader.exec_module(CHECKER)


class ReleaseCheckerTests(unittest.TestCase):
    def test_choiceprint_derivatives_are_rejected_case_insensitively(self) -> None:
        self.assertIsNotNone(
            CHECKER.is_forbidden_tracked_path(
                PurePosixPath("Person.Choiceprint/manifest.json")
            )
        )
        self.assertIsNotNone(
            CHECKER.is_forbidden_tracked_path(
                PurePosixPath("person.choiceprint.old/private.txt")
            )
        )
        self.assertIsNotNone(
            CHECKER.is_forbidden_tracked_path(
                PurePosixPath("foo-choiceprint.tar.gz")
            )
        )
        self.assertIsNone(
            CHECKER.is_forbidden_tracked_path(
                PurePosixPath(
                    "digital-twin/templates/example.choiceprint/manifest.json"
                )
            )
        )

    def test_ignored_output_categories_are_rejected(self) -> None:
        paths = (
            ".local-logs/foo.log",
            "matraix/.venv/private.txt",
            "debug.log",
            ".pnp.cjs",
            "foo.tsbuildinfo",
            "README 2.md",
            "matraix/personal-persona/survey/assets/validation 2.css",
            "vendor/source/.git/config",
        )
        for value in paths:
            with self.subTest(path=value):
                self.assertIsNotNone(
                    CHECKER.is_forbidden_tracked_path(PurePosixPath(value))
                )

    def test_personal_content_scan_allows_only_explicit_fictional_paths(self) -> None:
        self.assertFalse(
            CHECKER.contains_personal_path(
                "Fixture loaded from /Users/example/private/history.json"
            )
        )
        self.assertTrue(
            CHECKER.contains_personal_path(
                "Fixture loaded from /"
                "Users/real-person/private/history.json"
            )
        )

    def test_clean_worktree_cannot_hide_personal_content_in_index(self) -> None:
        path = PurePosixPath("README.md")
        index_data = (
            "Private source at /" "Users/real-person/private/history.json\n"
        ).encode()
        issues: list[str] = []
        with (
            patch.object(CHECKER, "candidate_paths", return_value=[path]),
            patch.object(CHECKER, "tracked_paths", return_value=[path]),
            patch.object(CHECKER, "tracked_modes", return_value={}),
            patch.object(CHECKER, "read_index_candidate", return_value=index_data),
            patch.object(
                CHECKER,
                "read_worktree_candidate",
                return_value=b"Reviewed public copy\n",
            ),
        ):
            CHECKER.check_candidate_content(issues)

        self.assertTrue(
            any(
                issue.startswith("personal absolute path in index:README.md")
                for issue in issues
            ),
            issues,
        )

    def test_reviewed_example_pack_matches_every_pinned_file(self) -> None:
        issues: list[str] = []
        CHECKER.check_example_pack_integrity(issues)
        self.assertEqual(issues, [])

    def test_example_pack_tampering_fails_even_with_self_consistent_metadata(
        self,
    ) -> None:
        pack_paths = [
            CHECKER.EXAMPLE_PACK_ROOT / PurePosixPath(relative)
            for relative in CHECKER.EXAMPLE_PACK_HASHES
        ]

        def source_data(path: PurePosixPath, _issues: list[str]):
            data = (CHECKER.ROOT / path).read_bytes()
            if path.name == "current-state.yaml":
                data += b"private_literal: must_not_ship\n"
            if path.name == "build-metadata.json":
                metadata = json.loads(data)
                metadata["warning"] = "metadata was updated with the tampered pack"
                data = (json.dumps(metadata, indent=2) + "\n").encode()
            return {"worktree": data}

        issues: list[str] = []
        with (
            patch.object(CHECKER, "candidate_paths", return_value=pack_paths),
            patch.object(
                CHECKER,
                "candidate_data_by_source",
                side_effect=source_data,
            ),
        ):
            CHECKER.check_example_pack_integrity(issues)

        self.assertTrue(
            any("current-state.yaml" in issue for issue in issues),
            issues,
        )
        self.assertTrue(
            any("build-metadata.json" in issue for issue in issues),
            issues,
        )

    def test_schema_and_template_are_paired_within_each_source(self) -> None:
        schema_path = PurePosixPath(
            CHECKER.PERSONA_SCHEMA.relative_to(CHECKER.ROOT).as_posix()
        )
        template = b"dimensions:\n  first: null\nmeta:\n" + b"\n".join(
            f"{block}: []".encode("utf-8")
            for block in (
                "evidenced",
                "best_guess",
                "sensitive_evidenced",
                "sensitive_best_guess",
                "unresolved",
            )
        )
        index_schema = json.dumps({"dimensions": [{"id": "first"}]}).encode()
        worktree_schema = json.dumps({"dimensions": [{"id": "second"}]}).encode()

        def source_data(path: PurePosixPath, _issues: list[str]):
            if path == schema_path:
                return {"index": index_schema, "worktree": worktree_schema}
            if path == CHECKER.PERSONA_TEMPLATE_PATH:
                return {"index": template, "worktree": template}
            raise AssertionError(f"unexpected path: {path}")

        issues: list[str] = []
        with (
            patch.object(
                CHECKER,
                "tracked_paths",
                return_value=[CHECKER.PERSONA_TEMPLATE_PATH],
            ),
            patch.object(
                CHECKER,
                "candidate_data_by_source",
                side_effect=source_data,
            ),
        ):
            CHECKER.check_persona_template(issues)

        self.assertTrue(
            any("worktree" in issue and "every schema dimension" in issue for issue in issues),
            issues,
        )


if __name__ == "__main__":
    unittest.main()
