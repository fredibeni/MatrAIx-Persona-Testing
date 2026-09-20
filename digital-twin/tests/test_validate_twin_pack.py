from __future__ import annotations

import importlib.util
import io
import hashlib
import json
import os
import shutil
import stat
import sys
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path

import yaml


VALIDATOR_PATH = (
    Path(__file__).resolve().parents[1] / "scripts" / "validate_twin_pack.py"
)
SPEC = importlib.util.spec_from_file_location("validate_twin_pack", VALIDATOR_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"cannot import validator from {VALIDATOR_PATH}")
VALIDATOR = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = VALIDATOR
SPEC.loader.exec_module(VALIDATOR)
EXAMPLE_PATH = Path(__file__).resolve().parents[1] / "templates" / "example.choiceprint"


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")


def write_jsonl(path: Path, records: list[dict[str, object]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        "".join(json.dumps(record) + "\n" for record in records),
        encoding="utf-8",
    )


def write_yaml(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(yaml.safe_dump(value, sort_keys=False), encoding="utf-8")


def make_valid_bundle(root: Path) -> None:
    shutil.copytree(EXAMPLE_PATH, root, dirs_exist_ok=True)


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


def coverage_event(
    *,
    event_id: str,
    domain: str = "product",
    action: str = "validate",
    supersedes: str | None = None,
) -> dict[str, object]:
    event: dict[str, object] = {
        "event_id": event_id,
        "domain": domain,
        "action": action,
        "scope": "forced_choice_prediction/1",
        "prepared_at": "2026-09-19T00:00:00Z",
        "reviewed_at": "2026-09-19T00:00:00Z",
        "recorded_at": "2026-09-19T00:00:00Z",
        "review_receipt_sha256": "a" * 64,
        "source_build_metadata_sha256": "b" * 64,
        "supersedes_event_id": supersedes,
    }
    if action == "validate":
        event["evaluation_evidence_sha256"] = "c" * 64
    else:
        event["reason_code"] = "owner_withdrew_validation"
    return event


def set_coverage_events(
    root: Path,
    events: list[dict[str, object]],
    validated_domains: list[str],
) -> None:
    manifest_path = root / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    declared_domains = sorted(
        set(manifest.get("coverage", {}).get("declared_domains", []))
        | {str(event["domain"]) for event in events}
    )
    manifest["coverage"] = {
        "status": "development_only",
        "declared_domains": declared_domains,
        "validated_domains": validated_domains,
        "validation_events": events,
    }
    write_json(manifest_path, manifest)
    refresh_integrity_metadata(root)


class ValidateTwinPackTests(unittest.TestCase):
    def test_valid_bundle(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            make_valid_bundle(root)

            result = VALIDATOR.validate_bundle(root)

            self.assertTrue(result.ok, result.errors)
            self.assertEqual(result.counts["claims"], 1)
            self.assertEqual(result.counts["policies"], 1)
            self.assertEqual(result.counts["cases"], 1)
            self.assertEqual(result.counts["sources"], 1)
            with redirect_stdout(io.StringIO()):
                self.assertEqual(VALIDATOR.main([str(root)]), 0)

    @unittest.skipUnless(os.name == "posix", "POSIX permission modes are required")
    def test_non_example_bundle_requires_owner_only_permissions(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            make_valid_bundle(root)
            manifest_path = root / "manifest.json"
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            manifest["coverage"]["status"] = "development_only"
            write_json(manifest_path, manifest)
            read_first_path = (
                root / "adapters/chatgpt-project/00-READ-FIRST.md"
            )
            read_first_path.write_text(
                read_first_path.read_text(encoding="utf-8").replace(
                    "Status: example_only",
                    "Status: development_only",
                ),
                encoding="utf-8",
            )
            refresh_integrity_metadata(root)

            insecure_result = VALIDATOR.validate_bundle(root)

            self.assertFalse(insecure_result.ok)
            self.assertTrue(
                any(
                    "grants group or other permissions" in error
                    for error in insecure_result.errors
                ),
                insecure_result.errors,
            )

            for path in [root, *sorted(root.rglob("*"))]:
                mode = path.lstat().st_mode
                if stat.S_ISDIR(mode):
                    path.chmod(0o700)
                elif stat.S_ISREG(mode):
                    path.chmod(0o600)

            secure_result = VALIDATOR.validate_bundle(root)

            self.assertTrue(secure_result.ok, secure_result.errors)

    def test_missing_required_path(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            make_valid_bundle(root)
            (root / "safety/boundaries.yaml").unlink()

            result = VALIDATOR.validate_bundle(root)

            self.assertFalse(result.ok)
            self.assertIn(
                "missing required path: safety/boundaries.yaml", result.errors
            )
            with redirect_stderr(io.StringIO()):
                self.assertNotEqual(VALIDATOR.main([str(root)]), 0)

    def test_duplicate_id_and_bad_references(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            make_valid_bundle(root)
            write_jsonl(
                root / "profile/claims.jsonl",
                [
                    {"id": "claim-1", "source_ids": ["source-missing"]},
                    {"id": "claim-1", "source_ids": ["source-1"]},
                ],
            )

            result = VALIDATOR.validate_bundle(root)

            self.assertFalse(result.ok)
            self.assertIn(
                "duplicate claim ID 'claim-1' in profile/claims.jsonl",
                result.errors,
            )
            self.assertIn(
                "unknown source reference 'source-missing' in "
                "profile/claims.jsonl record 1",
                result.errors,
            )

    def test_obvious_secret_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            make_valid_bundle(root)
            (root / "adapters" / "chatgpt-project" / "local-notes.txt").write_text(
        "api_key: " + "sk-proj-" + "abcdefghijklmnopqrstuvwxyz012345\n",
                encoding="utf-8",
            )

            result = VALIDATOR.validate_bundle(root)

            self.assertFalse(result.ok)
            self.assertTrue(
                any("OpenAI API key" in error for error in result.errors),
                result.errors,
            )

    def test_encrypted_private_key_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            make_valid_bundle(root)
            (root / "adapters" / "chatgpt-project" / "local-key.txt").write_text(
                "-----BEGIN ENCRYPTED " + "PRIVATE KEY-----\nsecret\n",
                encoding="utf-8",
            )

            result = VALIDATOR.validate_bundle(root)

            self.assertFalse(result.ok)
            self.assertTrue(
                any("private key" in error for error in result.errors),
                result.errors,
            )

    def test_git_metadata_subtree_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            make_valid_bundle(root)
            git_secret = root / ".git" / "secret.txt"
            git_secret.parent.mkdir()
            git_secret.write_text("private holdout answer\n", encoding="utf-8")

            result = VALIDATOR.validate_bundle(root)

            self.assertFalse(result.ok)
            self.assertTrue(
                any("Git metadata is not allowed" in error for error in result.errors),
                result.errors,
            )

    @unittest.skipUnless(hasattr(os, "mkfifo"), "FIFO creation is unavailable")
    def test_special_filesystem_entry_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            make_valid_bundle(root)
            os.mkfifo(root / "extra.pipe")

            result = VALIDATOR.validate_bundle(root)

            self.assertFalse(result.ok)
            self.assertTrue(
                any(
                    "special filesystem entry is not allowed" in error
                    for error in result.errors
                ),
                result.errors,
            )

    def test_holdout_answer_is_rejected_from_build_metadata(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            make_valid_bundle(root)
            metadata_path = root / "build-metadata.json"
            metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
            metadata["gold_answer"] = "private-choice"
            write_json(metadata_path, metadata)

            result = VALIDATOR.validate_bundle(root)

            self.assertFalse(result.ok)
            self.assertIn(
                "holdout answer field is not allowed in build-metadata.json",
                result.errors,
            )

    def test_build_metadata_persona_must_match_manifest(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            make_valid_bundle(root)
            metadata_path = root / "build-metadata.json"
            metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
            metadata["persona_id"] = "different-person"
            write_json(metadata_path, metadata)

            result = VALIDATOR.validate_bundle(root)

            self.assertFalse(result.ok)
            self.assertIn(
                "build-metadata.json persona_id does not match manifest.json persona_id",
                result.errors,
            )

    def test_build_metadata_adapter_flag_must_match_pack(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            make_valid_bundle(root)
            metadata_path = root / "build-metadata.json"
            metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
            metadata["chatgpt_adapter_generated"] = False
            write_json(metadata_path, metadata)

            result = VALIDATOR.validate_bundle(root)

            self.assertFalse(result.ok)
            self.assertIn(
                "build-metadata.json chatgpt_adapter_generated does not match "
                "the actual adapter presence",
                result.errors,
            )

    def test_policy_state_consent_and_counterexample_references(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            make_valid_bundle(root)
            write_yaml(
                root / "profile/decision-policies.yaml",
                [
                    {
                        "id": "policy-1",
                        "case_refs": ["case-missing"],
                        "source_refs": ["source-missing-policy"],
                    }
                ],
            )
            write_yaml(
                root / "profile/current-state.yaml",
                {"as_of": "2026-01-01", "source_refs": ["source-missing-state"]},
            )
            write_yaml(
                root / "evidence/consent.yaml",
                {
                    "status": "granted",
                    "allowed_sources": ["source-missing-consent"],
                },
            )
            write_jsonl(
                root / "profile/counterexamples.jsonl",
                [
                    {
                        "id": "counter-1",
                        "claim_or_policy_id": "claim-or-policy-missing",
                        "source_refs": ["source-1"],
                    }
                ],
            )

            result = VALIDATOR.validate_bundle(root)

            self.assertFalse(result.ok)
            joined = "\n".join(result.errors)
            self.assertIn("unknown case reference 'case-missing'", joined)
            self.assertIn("unknown source reference 'source-missing-policy'", joined)
            self.assertIn("unknown source reference 'source-missing-state'", joined)
            self.assertIn("unknown source reference 'source-missing-consent'", joined)
            self.assertIn("unknown claim or policy target", joined)

    def test_duplicate_yaml_key_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            make_valid_bundle(root)
            consent_path = root / "evidence/consent.yaml"
            consent_path.write_text(
                "owner_authorized: false\n"
                "owner_authorized: true\n"
                "authorized_at: '2026-09-19'\n"
                "allowed_sources: [src_sample_interview]\n"
                "allowed_uses: [predict likely choices]\n"
                "prohibited_uses: []\n"
                "publication_requires_fresh_approval: true\n"
                "withdrawal:\n"
                "  method: delete\n"
                "  effect: stop\n",
                encoding="utf-8",
            )

            result = VALIDATOR.validate_bundle(root)

            self.assertFalse(result.ok)
            self.assertTrue(
                any("duplicate YAML mapping key" in error for error in result.errors),
                result.errors,
            )

    def test_duplicate_json_keys_are_rejected_in_json_and_jsonl(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            make_valid_bundle(root)
            manifest_path = root / "manifest.json"
            manifest_text = manifest_path.read_text(encoding="utf-8")
            manifest_path.write_text(
                manifest_text.replace(
                    '"persona_id": "sample-person",',
                    '"persona_id": "sample-person",\n  "persona_id": "other-person",',
                    1,
                ),
                encoding="utf-8",
            )

            result = VALIDATOR.validate_bundle(root)

            self.assertFalse(result.ok)
            self.assertTrue(
                any("duplicate JSON object key" in error for error in result.errors),
                result.errors,
            )

        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            make_valid_bundle(root)
            claim_path = root / "profile/claims.jsonl"
            claim_text = claim_path.read_text(encoding="utf-8")
            claim_path.write_text(
                claim_text.replace(
                    '"sensitivity":"private"',
                    '"sensitivity":"private","sensitivity":"sensitive"',
                    1,
                ),
                encoding="utf-8",
            )

            result = VALIDATOR.validate_bundle(root)

            self.assertFalse(result.ok)
            self.assertTrue(
                any("duplicate JSON object key" in error for error in result.errors),
                result.errors,
            )

    def test_runtime_current_state_requires_valid_expiry(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            make_valid_bundle(root)
            state_path = root / "profile/current-state.yaml"
            state = yaml.safe_load(state_path.read_text(encoding="utf-8"))
            state["expires_at"] = None
            write_yaml(state_path, state)

            result = VALIDATOR.validate_bundle(root)

            self.assertFalse(result.ok)
            self.assertIn(
                "profile/current-state.yaml expires_at is required when "
                "runtime_included is true",
                result.errors,
            )

            state["expires_at"] = "2026-99-99"
            write_yaml(state_path, state)
            result = VALIDATOR.validate_bundle(root)
            self.assertFalse(result.ok)
            self.assertTrue(
                any("invalid ISO date" in error for error in result.errors),
                result.errors,
            )

    def test_evaluation_answers_are_rejected_from_adapter(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            make_valid_bundle(root)
            write_jsonl(
                root / "adapters" / "chatgpt-project" / "holdout-private.jsonl",
                [{"id": "eval-1", "dataset_role": "holdout", "choice": "hidden"}],
            )

            result = VALIDATOR.validate_bundle(root)

            self.assertFalse(result.ok)
            self.assertTrue(
                any(
                    "evaluation answers must not be included" in error
                    for error in result.errors
                ),
                result.errors,
            )

    def test_binary_and_unlisted_files_are_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            make_valid_bundle(root)
            (root / "private.bin").write_bytes(b"\x00private payload")

            result = VALIDATOR.validate_bundle(root)

            self.assertFalse(result.ok)
            joined = "\n".join(result.errors)
            self.assertIn("unexpected file is not allowed", joined)
            self.assertIn("file is not covered by integrity metadata", joined)
            self.assertIn("binary file cannot be inspected safely", joined)

    def test_rehashed_unexpected_files_are_rejected_everywhere(self) -> None:
        unexpected_paths = (
            "EXTRA-PERSONAL-NOTES.md",
            "adapters/chatgpt-project/EXTRA-PERSONAL-NOTES.md",
        )
        for unexpected_path in unexpected_paths:
            with (
                self.subTest(unexpected_path=unexpected_path),
                tempfile.TemporaryDirectory() as temporary_directory,
            ):
                root = Path(temporary_directory)
                make_valid_bundle(root)
                path = root / unexpected_path
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(
                    "Private notes that do not belong in the pack.\n",
                    encoding="utf-8",
                )
                refresh_integrity_metadata(root)

                result = VALIDATOR.validate_bundle(root)

                self.assertFalse(result.ok)
                self.assertIn(
                    "unexpected file is not allowed in a Choiceprint pack: "
                    f"{unexpected_path}",
                    result.errors,
                )
                self.assertNotIn(
                    f"file is not covered by integrity metadata: {unexpected_path}",
                    result.errors,
                )

    def test_adapter_file_set_remains_optional(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            make_valid_bundle(root)
            shutil.rmtree(root / "adapters")

            consent_path = root / "evidence/consent.yaml"
            consent = yaml.safe_load(consent_path.read_text(encoding="utf-8"))
            consent["owner_authorized"] = False
            consent["authorized_at"] = None
            consent["allowed_modes"] = []
            write_yaml(consent_path, consent)

            manifest_path = root / "manifest.json"
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            manifest["default_mode"] = None
            manifest["compatibility"] = []
            write_json(manifest_path, manifest)

            metadata_path = root / "build-metadata.json"
            metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
            metadata["chatgpt_adapter_generated"] = False
            write_json(metadata_path, metadata)
            development_path = root / "evals/development.jsonl"
            development_evals = [
                json.loads(line)
                for line in development_path.read_text(encoding="utf-8").splitlines()
                if line.strip()
            ]
            for record in development_evals:
                record["exposed_to_runtime"] = False
            write_jsonl(development_path, development_evals)
            refresh_integrity_metadata(root)

            result = VALIDATOR.validate_bundle(root)

            self.assertTrue(result.ok, result.errors)

    def test_stale_adapter_or_canonical_file_digest_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            make_valid_bundle(root)
            claim_path = root / "profile/claims.jsonl"
            claim_path.write_text(
                claim_path.read_text(encoding="utf-8").replace(
                    '"sensitivity":"private"', '"sensitivity":"sensitive"'
                ),
                encoding="utf-8",
            )

            result = VALIDATOR.validate_bundle(root)

            self.assertFalse(result.ok)
            self.assertIn(
                "file digest mismatch: profile/claims.jsonl",
                result.errors,
            )

    def test_holdout_role_is_rejected_from_canonical_pack(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            make_valid_bundle(root)
            case_path = root / "profile/decision-cases.jsonl"
            records = [json.loads(line) for line in case_path.read_text().splitlines()]
            records[0]["dataset_role"] = "holdout"
            write_jsonl(case_path, records)

            result = VALIDATOR.validate_bundle(root)

            self.assertFalse(result.ok)
            self.assertTrue(
                any("holdout record is not allowed" in error for error in result.errors),
                result.errors,
            )

        for spelling in ("hold_out", "held_out"):
            with self.subTest(spelling=spelling), tempfile.TemporaryDirectory() as temporary_directory:
                root = Path(temporary_directory)
                make_valid_bundle(root)
                metadata_path = root / "build-metadata.json"
                metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
                metadata["nested_audit"] = {"dataset_role": spelling}
                write_json(metadata_path, metadata)

                result = VALIDATOR.validate_bundle(root)

                self.assertFalse(result.ok)
                self.assertIn(
                    "holdout record is not allowed in build-metadata.json",
                    result.errors,
                )

    def test_development_eval_must_match_referenced_case_choice(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            make_valid_bundle(root)
            eval_path = root / "evals/development.jsonl"
            records = [json.loads(line) for line in eval_path.read_text().splitlines()]
            records[0]["expected"] = "publish_now"
            write_jsonl(eval_path, records)

            result = VALIDATOR.validate_bundle(root)

            self.assertFalse(result.ok)
            self.assertTrue(
                any(
                    "expected value does not match" in error
                    for error in result.errors
                ),
                result.errors,
            )

    def test_manifest_count_mismatch_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            make_valid_bundle(root)
            manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
            manifest["counts"] = {
                "claims": 2,
                "active_claims": 1,
                "provisional_claims": 0,
                "withheld_claims": 0,
                "policies": 1,
                "decision_cases": 1,
                "sources": 1,
                "conflicts": 0,
            }
            write_json(root / "manifest.json", manifest)

            result = VALIDATOR.validate_bundle(root)

            self.assertFalse(result.ok)
            self.assertIn(
                "manifest count 'claims' is 2, but the pack contains 1",
                result.errors,
            )

    def test_invalid_case_selection_and_references_are_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            make_valid_bundle(root)
            cases = [
                json.loads(line)
                for line in (root / "profile/decision-cases.jsonl")
                .read_text(encoding="utf-8")
                .splitlines()
                if line.strip()
            ]
            cases[0]["selected_option_id"] = "not-an-option"
            cases[0]["source_refs"] = ["source-missing"]
            write_jsonl(root / "profile/decision-cases.jsonl", cases)
            development_evals = [
                json.loads(line)
                for line in (root / "evals/development.jsonl")
                .read_text(encoding="utf-8")
                .splitlines()
                if line.strip()
            ]
            development_evals[0]["case_id"] = "case-missing"
            write_jsonl(root / "evals/development.jsonl", development_evals)

            result = VALIDATOR.validate_bundle(root)

            self.assertFalse(result.ok)
            joined = "\n".join(result.errors)
            self.assertIn(
                "selected_option_id 'not-an-option' does not resolve to exactly one option",
                joined,
            )
            self.assertIn("unknown source reference 'source-missing'", joined)
            self.assertIn("unknown case reference 'case-missing'", joined)

    def test_development_eval_runtime_exposure_must_match_adapter(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            make_valid_bundle(root)
            development_path = root / "evals/development.jsonl"
            development_evals = [
                json.loads(line)
                for line in development_path.read_text(encoding="utf-8").splitlines()
                if line.strip()
            ]
            development_evals[0]["exposed_to_runtime"] = False
            write_jsonl(development_path, development_evals)
            refresh_integrity_metadata(root)

            result = VALIDATOR.validate_bundle(root)

            self.assertFalse(result.ok)
            self.assertIn(
                "development evaluation exposed_to_runtime does not match the "
                "generated ChatGPT adapter in evals/development.jsonl record 1",
                result.errors,
            )

    def test_case_choice_fields_must_resolve_to_one_consistent_option(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            make_valid_bundle(root)
            case_path = root / "profile/decision-cases.jsonl"
            cases = [json.loads(line) for line in case_path.read_text().splitlines()]
            cases[0]["options"] = [
                {"id": "a", "label": "Alpha"},
                {"id": "b", "label": "Beta"},
            ]
            cases[0]["selected_option_id"] = "a"
            cases[0]["choice"] = {"id": "a", "label": "Beta"}
            write_jsonl(case_path, cases)

            result = VALIDATOR.validate_bundle(root)

            self.assertFalse(result.ok)
            self.assertTrue(
                any(
                    "choice does not resolve to exactly one option" in error
                    for error in result.errors
                ),
                result.errors,
            )

            cases[0]["choice"] = {"id": "b", "label": "Beta"}
            write_jsonl(case_path, cases)
            result = VALIDATOR.validate_bundle(root)
            self.assertFalse(result.ok)
            self.assertTrue(
                any(
                    "selected_option_id and choice resolve to different options"
                    in error
                    for error in result.errors
                ),
                result.errors,
            )

    def test_duplicate_option_tokens_are_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            make_valid_bundle(root)
            case_path = root / "profile/decision-cases.jsonl"
            cases = [json.loads(line) for line in case_path.read_text().splitlines()]
            cases[0]["options"] = [
                {"id": "same", "label": "Alpha"},
                {"id": "same", "label": "Beta"},
            ]
            cases[0]["selected_option_id"] = "same"
            cases[0]["choice"] = "same"
            write_jsonl(case_path, cases)

            result = VALIDATOR.validate_bundle(root)

            self.assertFalse(result.ok)
            self.assertTrue(
                any("duplicate or ambiguous ID or label" in error for error in result.errors),
                result.errors,
            )

    def test_nonempty_validated_domains_are_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            make_valid_bundle(root)
            manifest_path = root / "manifest.json"
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            manifest["coverage"]["validated_domains"] = ["anything"]
            write_json(manifest_path, manifest)

            result = VALIDATOR.validate_bundle(root)

            self.assertFalse(result.ok)
            self.assertTrue(
                any("exact sorted projection" in error for error in result.errors),
                result.errors,
            )

    def test_validation_event_ids_must_be_unique(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            make_valid_bundle(root)
            set_coverage_events(
                root,
                [
                    coverage_event(event_id="event-1", domain="product"),
                    coverage_event(event_id="event-1", domain="finance"),
                ],
                ["finance", "product"],
            )

            result = VALIDATOR.validate_bundle(root)

            self.assertFalse(result.ok)
            self.assertTrue(
                any("duplicate coverage validation event_id" in error for error in result.errors),
                result.errors,
            )

    def test_validation_event_must_immediately_supersede_domain_predecessor(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            make_valid_bundle(root)
            set_coverage_events(
                root,
                [
                    coverage_event(event_id="event-1"),
                    coverage_event(event_id="event-2", supersedes=None),
                ],
                ["product"],
            )

            result = VALIDATOR.validate_bundle(root)

            self.assertFalse(result.ok)
            self.assertTrue(
                any("must immediately supersede 'event-1'" in error for error in result.errors),
                result.errors,
            )

    def test_validation_event_scope_and_hashes_are_fixed_and_complete(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            make_valid_bundle(root)
            event = coverage_event(event_id="event-1")
            event["scope"] = "all_tasks/1"
            event["review_receipt_sha256"] = "short"
            event["evaluation_evidence_sha256"] = "D" * 64
            set_coverage_events(root, [event], ["product"])

            result = VALIDATOR.validate_bundle(root)

            self.assertFalse(result.ok)
            self.assertTrue(
                any("scope must be forced_choice_prediction/1" in error for error in result.errors),
                result.errors,
            )
            self.assertTrue(
                any("review_receipt_sha256 must be a complete" in error for error in result.errors),
                result.errors,
            )
            self.assertTrue(
                any("evaluation_evidence_sha256 must be a complete" in error for error in result.errors),
                result.errors,
            )

    def test_validation_event_domain_must_be_safe_and_declared(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            make_valid_bundle(root)
            event = coverage_event(
                event_id="event-unsafe",
                domain="unsafe\n# markdown",
            )
            set_coverage_events(root, [event], ["unsafe\n# markdown"])

            result = VALIDATOR.validate_bundle(root)

            self.assertFalse(result.ok)
            self.assertTrue(
                any("safe coverage-domain slug" in error for error in result.errors),
                result.errors,
            )

    def test_validation_event_domain_must_belong_to_declared_taxonomy(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            make_valid_bundle(root)
            set_coverage_events(
                root,
                [coverage_event(event_id="event-1", domain="product")],
                ["product"],
            )
            manifest_path = root / "manifest.json"
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            manifest["coverage"]["declared_domains"] = []
            write_json(manifest_path, manifest)
            refresh_integrity_metadata(root)

            result = VALIDATOR.validate_bundle(root)

            self.assertFalse(result.ok)
            self.assertTrue(
                any("is not in coverage.declared_domains" in error for error in result.errors),
                result.errors,
            )

    def test_validation_event_timestamps_are_ordered_across_domain_chain(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            make_valid_bundle(root)
            first = coverage_event(event_id="event-1")
            first["prepared_at"] = "2026-09-19T00:01:00Z"
            first["reviewed_at"] = "2026-09-19T00:02:00Z"
            first["recorded_at"] = "2026-09-19T00:03:00Z"
            second = coverage_event(event_id="event-2", supersedes="event-1")
            second["prepared_at"] = "2026-09-19T00:02:30Z"
            second["reviewed_at"] = "2026-09-19T00:04:00Z"
            second["recorded_at"] = "2026-09-19T00:05:00Z"
            set_coverage_events(root, [first, second], ["product"])
            metadata_path = root / "build-metadata.json"
            metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
            metadata["built_at"] = "2026-09-19T00:06:00Z"
            write_json(metadata_path, metadata)
            refresh_integrity_metadata(root)

            result = VALIDATOR.validate_bundle(root)

            self.assertFalse(result.ok)
            self.assertTrue(
                any("must not predate the prior event" in error for error in result.errors),
                result.errors,
            )

    def test_revocation_requires_reason_code_and_projection_removes_domain(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            make_valid_bundle(root)
            revoke = coverage_event(
                event_id="event-2",
                action="revoke",
                supersedes="event-1",
            )
            revoke["reason_code"] = "private free text must not be exported"
            set_coverage_events(
                root,
                [coverage_event(event_id="event-1"), revoke],
                ["product"],
            )

            result = VALIDATOR.validate_bundle(root)

            self.assertFalse(result.ok)
            self.assertTrue(
                any("revocation reason_code is invalid" in error for error in result.errors),
                result.errors,
            )
            self.assertTrue(
                any("exact sorted projection" in error for error in result.errors),
                result.errors,
            )

    def test_adapter_must_match_canonical_data_even_after_rehash(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            make_valid_bundle(root)
            overview_path = root / "profile/overview.yaml"
            overview = yaml.safe_load(overview_path.read_text(encoding="utf-8"))
            overview["summary"] = "Changed canonical summary"
            write_yaml(overview_path, overview)
            manifest_path = root / "manifest.json"
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            manifest["profile_summary"] = overview["summary"]
            write_json(manifest_path, manifest)
            refresh_integrity_metadata(root)

            result = VALIDATOR.validate_bundle(root)

            self.assertFalse(result.ok)
            self.assertTrue(
                any(
                    "adapter does not match canonical pack data" in error
                    for error in result.errors
                ),
                result.errors,
            )

    def test_person_evidence_type_is_closed(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            make_valid_bundle(root)
            case_path = root / "profile/decision-cases.jsonl"
            cases = [json.loads(line) for line in case_path.read_text().splitlines()]
            cases[0]["evidence_type"] = "model_prediction"
            write_jsonl(case_path, cases)
            refresh_integrity_metadata(root)

            result = VALIDATOR.validate_bundle(root)

            self.assertFalse(result.ok)
            self.assertTrue(
                any("unsupported evidence_type" in error for error in result.errors),
                result.errors,
            )

    def test_semantic_consent_and_privacy_checks_cannot_be_rehashed_away(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            make_valid_bundle(root)
            consent_path = root / "evidence/consent.yaml"
            consent = yaml.safe_load(consent_path.read_text(encoding="utf-8"))
            consent["prohibited_uses"].append(consent["allowed_uses"][0])
            consent["authorized_at"] = "2099-01-01"
            write_yaml(consent_path, consent)
            manifest_path = root / "manifest.json"
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            manifest["privacy_class"] = "public"
            write_json(manifest_path, manifest)
            refresh_integrity_metadata(root)

            result = VALIDATOR.validate_bundle(root)

            self.assertFalse(result.ok)
            self.assertTrue(any("overlap" in error for error in result.errors), result.errors)
            self.assertTrue(
                any("authorized_at must not be later" in error for error in result.errors),
                result.errors,
            )
            self.assertTrue(
                any("privacy_class does not match" in error for error in result.errors),
                result.errors,
            )

    def test_nonfinite_json_and_recursive_yaml_are_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            make_valid_bundle(root)
            manifest_path = root / "manifest.json"
            manifest_path.write_text('{"score": NaN}\n', encoding="utf-8")

            result = VALIDATOR.validate_bundle(root)

            self.assertFalse(result.ok)
            self.assertTrue(
                any("non-finite JSON number" in error for error in result.errors),
                result.errors,
            )

        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            make_valid_bundle(root)
            (root / "profile/current-state.yaml").write_text(
                "as_of: '2026-09-19'\n"
                "expires_at: null\n"
                "active_goals: &loop [*loop]\n"
                "current_projects: []\n"
                "temporary_constraints: []\n"
                "capacity: unknown\n"
                "sensitivity: private\n"
                "runtime_included: false\n",
                encoding="utf-8",
            )

            result = VALIDATOR.validate_bundle(root)

            self.assertFalse(result.ok)
            self.assertTrue(
                any("recursive alias" in error for error in result.errors),
                result.errors,
            )

    def test_sensitive_registry_and_runtime_flag_are_enforced_on_claims(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            make_valid_bundle(root)
            claims_path = root / "profile/claims.jsonl"
            claims = [json.loads(line) for line in claims_path.read_text().splitlines()]
            claims[0]["predicate"] = "legacy_dimension.gender_identity"
            claims[0]["sensitivity"] = "private"
            claims[0]["status"] = "active"
            claims[0]["runtime_included"] = True
            write_jsonl(claims_path, claims)
            refresh_integrity_metadata(root)

            result = VALIDATOR.validate_bundle(root)

            self.assertFalse(result.ok)
            self.assertTrue(
                any("known sensitive legacy dimension" in error for error in result.errors),
                result.errors,
            )

        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            make_valid_bundle(root)
            claims_path = root / "profile/claims.jsonl"
            claims = [json.loads(line) for line in claims_path.read_text().splitlines()]
            claims[0].pop("runtime_included", None)
            write_jsonl(claims_path, claims)
            refresh_integrity_metadata(root)

            result = VALIDATOR.validate_bundle(root)

            self.assertFalse(result.ok)
            self.assertTrue(
                any(
                    "'runtime_included' is a required property" in error
                    for error in result.errors
                ),
                result.errors,
            )

    def test_legacy_dimensions_must_match_eligible_claims_after_rehash(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            make_valid_bundle(root)
            legacy_path = root / "profile/legacy-dimensions.yaml"
            legacy = yaml.safe_load(legacy_path.read_text(encoding="utf-8"))
            legacy["dimensions"]["speed_vs_accuracy"] = "inconsistent-value"
            legacy["dimensions"]["unclaimed_dimension"] = "unclaimed-value"
            legacy["dimensions"]["Gender Identity"] = "sensitive-value"
            write_yaml(legacy_path, legacy)
            refresh_integrity_metadata(root)

            result = VALIDATOR.validate_bundle(root)

            self.assertFalse(result.ok)
            self.assertTrue(
                any("registry-sensitive dimension" in error for error in result.errors),
                result.errors,
            )
            self.assertTrue(
                any(
                    "without an eligible canonical claim" in error
                    and "unclaimed_dimension" in error
                    for error in result.errors
                ),
                result.errors,
            )
            self.assertTrue(
                any(
                    "value does not match the eligible canonical claim" in error
                    and "speed_vs_accuracy" in error
                    for error in result.errors
                ),
                result.errors,
            )

        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            make_valid_bundle(root)
            legacy_path = root / "profile/legacy-dimensions.yaml"
            legacy = yaml.safe_load(legacy_path.read_text(encoding="utf-8"))
            legacy["dimensions"].pop("speed_vs_accuracy")
            write_yaml(legacy_path, legacy)
            refresh_integrity_metadata(root)

            result = VALIDATOR.validate_bundle(root)

            self.assertFalse(result.ok)
            self.assertTrue(
                any(
                    "missing eligible canonical dimension 'speed_vs_accuracy'" in error
                    for error in result.errors
                ),
                result.errors,
            )

    def test_runtime_adapter_rejects_conflict_referencing_sensitive_claim(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            make_valid_bundle(root)
            claims_path = root / "profile/claims.jsonl"
            claims = [json.loads(line) for line in claims_path.read_text().splitlines()]
            sensitive_claim = dict(claims[0])
            sensitive_claim.update(
                {
                    "id": "clm_sensitive_private_fact",
                    "predicate": "legacy_dimension.gender_identity",
                    "value": "sensitive-claim-value",
                    "status": "withheld",
                    "sensitivity": "sensitive",
                    "runtime_included": False,
                }
            )
            claims.append(sensitive_claim)
            write_jsonl(claims_path, claims)
            conflict = {
                "id": "conflict_sensitive_claim_dependency",
                "domain": "private",
                "status": "open",
                "summary": "sensitive-conflict-marker",
                "positions": [
                    {"value": "one", "source_refs": ["src_sample_interview"]},
                    {"value": "two", "source_refs": ["src_sample_interview"]},
                ],
                "handling": "Do not expose this conflict.",
                "runtime_effect": "No runtime effect.",
                "claim_refs": ["clm_sensitive_private_fact"],
                "sensitivity": "private",
            }
            write_jsonl(root / "evidence/conflicts.jsonl", [conflict])
            manifest_path = root / "manifest.json"
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            manifest["privacy_class"] = "sensitive"
            manifest["counts"].update(
                {"claims": 2, "withheld_claims": 1, "conflicts": 1}
            )
            write_json(manifest_path, manifest)
            conflicts_adapter = root / "adapters/chatgpt-project/08-CONFLICTS.md"
            conflicts_adapter.write_text(
                "# Conflicts\n\n"
                "`conflict_sensitive_claim_dependency` - sensitive-conflict-marker. "
                "Handling: Do not expose this conflict. Runtime effect: No runtime effect.\n",
                encoding="utf-8",
            )
            refresh_integrity_metadata(root)

            result = VALIDATOR.validate_bundle(root)

            self.assertFalse(result.ok)
            self.assertTrue(
                any(
                    "runtime adapter conflict 'conflict_sensitive_claim_dependency' "
                    "references non-runtime-safe claim 'clm_sensitive_private_fact'"
                    in error
                    for error in result.errors
                ),
                result.errors,
            )
            self.assertTrue(
                any(
                    "ChatGPT adapter does not match canonical pack data: "
                    "adapters/chatgpt-project/08-CONFLICTS.md"
                    in error
                    for error in result.errors
                ),
                result.errors,
            )


if __name__ == "__main__":
    unittest.main()
