from __future__ import annotations

import contextlib
import hashlib
import importlib.util
import io
import json
import os
import shutil
import sys
import tempfile
import unittest
from collections import Counter
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from unittest import mock


REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT_PATH = REPO_ROOT / "digital-twin/scripts/retrieve_choiceprint_context.py"
EXAMPLE_PACK = REPO_ROOT / "digital-twin/templates/example.choiceprint"


def load_module():
    spec = importlib.util.spec_from_file_location(
        "choiceprint_context_retriever_tests", SCRIPT_PATH
    )
    if spec is None or spec.loader is None:
        raise RuntimeError(f"could not load retrieval module: {SCRIPT_PATH}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


RETRIEVER = load_module()


SCENARIO = {
    "domain": "analysis",
    "stakes": "medium",
    "summary": "Verify an important calculation before publishing",
}
REQUEST_AT = "2026-09-30T12:00:00Z"


def tree_hash(root: Path) -> str:
    digest = hashlib.sha256()
    for path in sorted(item for item in root.rglob("*") if item.is_file()):
        digest.update(path.relative_to(root).as_posix().encode("utf-8"))
        digest.update(path.read_bytes())
    return digest.hexdigest()


class RetrieveChoiceprintContextTests(unittest.TestCase):
    def retrieve(self, **overrides: object) -> dict[str, object]:
        arguments: dict[str, object] = {
            "mode": "predict-choice",
            "scenario": SCENARIO,
            "max_context_bytes": 12_000,
            "request_at": REQUEST_AT,
        }
        arguments.update(overrides)
        return RETRIEVER.get_twin_context(EXAMPLE_PACK, **arguments)

    def test_valid_pack_returns_deterministic_closed_context_without_writes(self) -> None:
        before = tree_hash(EXAMPLE_PACK)
        first = self.retrieve()
        second = self.retrieve()

        self.assertEqual(first, second)
        self.assertEqual(first["status"], "ok")
        self.assertEqual(first["evidence_ids"], ["src_sample_interview"])
        records = first["context"]["selected_records"]
        self.assertEqual(
            [item["id"] for item in records["decision_cases"]],
            ["case_sample_validation"],
        )
        self.assertEqual(
            [item["id"] for item in records["decision_policies"]],
            ["pol_sample_validate"],
        )
        self.assertEqual(
            [item["id"] for item in records["counterexamples"]],
            ["counter_sample_exploration"],
        )
        self.assertEqual(
            [item["id"] for item in records["sources"]],
            ["src_sample_interview"],
        )
        self.assertNotIn("locator", records["sources"][0])
        self.assertEqual(
            RETRIEVER._serialized_bytes(first["context"]), first["budget"]["used"]
        )
        self.assertLessEqual(first["budget"]["used"], first["budget"]["maximum"])
        self.assertEqual(tree_hash(EXAMPLE_PACK), before)

    def test_unconsented_mode_is_blocked_before_personal_records(self) -> None:
        result = self.retrieve(mode="advise-person")

        self.assertEqual(result["status"], "blocked")
        self.assertEqual(result["context"]["selected_records"], {})
        self.assertEqual(result["evidence_ids"], [])
        self.assertIn("not authorized", result["unknowns"][0])

    def test_owner_authorization_is_required_before_record_selection(self) -> None:
        pack = deepcopy(RETRIEVER._load_pack(EXAMPLE_PACK))
        pack["consent"]["owner_authorized"] = False
        with mock.patch.object(RETRIEVER, "_load_pack", return_value=pack):
            result = self.retrieve()

        self.assertEqual(result["status"], "blocked")
        self.assertEqual(result["context"]["selected_records"], {})
        self.assertEqual(result["selection"], [])
        self.assertIn("owner consent", result["unknowns"][0])

    def test_request_time_expiry_excludes_current_state(self) -> None:
        result = self.retrieve(request_at="2026-10-20T00:00:00Z")

        self.assertEqual(result["status"], "ok")
        self.assertNotIn("current_state", result["context"]["selected_records"])
        self.assertIn(
            {
                "record_type": "current_state",
                "reason": "expired",
                "count": 1,
            },
            result["exclusions"],
        )

    def test_request_time_cannot_predate_consent_or_pack_build(self) -> None:
        cases = (
            (
                "consent authorization",
                "2026-09-18T12:00:00Z",
                "2026-09-19",
                "2026-09-20T00:00:00Z",
            ),
            (
                "pack build",
                "2026-09-19T12:00:00Z",
                "2026-09-18",
                "2026-09-20T00:00:00Z",
            ),
        )
        for expected, request_at, authorized_at, built_at in cases:
            with self.subTest(expected=expected):
                pack = deepcopy(RETRIEVER._load_pack(EXAMPLE_PACK))
                pack["consent"]["authorized_at"] = authorized_at
                pack["build_metadata"]["built_at"] = built_at
                with mock.patch.object(RETRIEVER, "_load_pack", return_value=pack):
                    with self.assertRaisesRegex(RETRIEVER.RetrievalError, expected):
                        self.retrieve(request_at=request_at)

    def test_current_state_requires_scenario_overlap(self) -> None:
        pack = deepcopy(RETRIEVER._load_pack(EXAMPLE_PACK))
        pack["current_state"]["current_projects"] = ["Plan a hiking holiday"]
        with mock.patch.object(RETRIEVER, "_load_pack", return_value=pack):
            result = self.retrieve()

        self.assertNotIn("current_state", result["context"]["selected_records"])
        self.assertIn(
            {
                "record_type": "current_state",
                "reason": "no_scenario_match",
                "count": 1,
            },
            result["exclusions"],
        )

    def test_current_state_does_not_displace_evidence_under_tight_budget(self) -> None:
        pack = deepcopy(RETRIEVER._load_pack(EXAMPLE_PACK))
        pack["claims"] = []
        pack["policies"] = []
        pack["counterexamples"] = []
        pack["conflicts"] = []
        pack["profile"]["summary"] = "Unrelated biography"
        pack["profile"]["communication_style"] = ["Be concise"]
        pack["profile"]["gaps"] = []
        pack["current_state"]["current_projects"] = [
            "Verify an important calculation before publishing"
        ]
        case_only_pack = deepcopy(pack)
        case_only_pack["current_state"]["current_projects"] = []
        with mock.patch.object(
            RETRIEVER, "_load_pack", return_value=case_only_pack
        ):
            evidence_budget = self.retrieve()["budget"]["used"]

        with mock.patch.object(RETRIEVER, "_load_pack", return_value=pack):
            result = self.retrieve(max_context_bytes=evidence_budget)

        records = result["context"]["selected_records"]
        self.assertEqual(result["status"], "ok")
        self.assertEqual(
            [item["id"] for item in records["decision_cases"]],
            ["case_sample_validation"],
        )
        self.assertNotIn("current_state", records)
        self.assertIn(
            {
                "record_type": "current_state",
                "reason": "context_budget",
                "count": 1,
            },
            result["exclusions"],
        )

    def test_write_in_style_prioritizes_profile_under_tight_budget(self) -> None:
        pack = deepcopy(RETRIEVER._load_pack(EXAMPLE_PACK))
        pack["consent"]["allowed_modes"].append("write-in-style")
        with mock.patch.object(RETRIEVER, "_load_pack", return_value=pack):
            result = self.retrieve(mode="write-in-style", max_context_bytes=1_250)

        records = result["context"]["selected_records"]
        self.assertEqual(result["status"], "ok")
        self.assertIn("profile_overview", records)
        self.assertNotIn("claims", records)

    def test_write_in_style_requires_profile_for_ok_status(self) -> None:
        pack = deepcopy(RETRIEVER._load_pack(EXAMPLE_PACK))
        pack["consent"]["allowed_modes"].append("write-in-style")
        pack["profile"]["summary"] = "x" * 2_000
        with mock.patch.object(RETRIEVER, "_load_pack", return_value=pack):
            result = self.retrieve(mode="write-in-style", max_context_bytes=1_250)

        records = result["context"]["selected_records"]
        self.assertEqual(result["status"], "insufficient_evidence")
        self.assertNotIn("profile_overview", records)
        self.assertIn("claims", records)

    def test_small_budget_is_strict_and_returns_insufficient_evidence(self) -> None:
        result = self.retrieve(max_context_bytes=1_000)

        self.assertEqual(result["status"], "insufficient_evidence")
        self.assertEqual(result["context"]["selected_records"], {})
        self.assertEqual(
            result["budget"]["used"],
            RETRIEVER._serialized_bytes(result["context"]),
        )
        self.assertLessEqual(result["budget"]["used"], 1_000)
        self.assertTrue(
            any(item["reason"] == "context_budget" for item in result["exclusions"])
        )

    def test_invalid_pack_is_rejected_by_canonical_validator(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            pack = Path(temporary_directory).resolve() / "tampered.choiceprint"
            shutil.copytree(EXAMPLE_PACK, pack)
            claims = pack / "profile/claims.jsonl"
            claims.write_text(claims.read_text(encoding="utf-8") + "\n", encoding="utf-8")

            with self.assertRaisesRegex(
                RETRIEVER.RetrievalError, "Choiceprint validation failed"
            ):
                RETRIEVER.get_twin_context(
                    pack,
                    mode="predict-choice",
                    scenario=SCENARIO,
                    max_context_bytes=12_000,
                    request_at=REQUEST_AT,
                )

    def test_retrieval_uses_the_exact_snapshot_validated_before_source_mutation(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            pack = Path(temporary_directory).resolve() / "raced.choiceprint"
            shutil.copytree(EXAMPLE_PACK, pack)
            real_validator = RETRIEVER._load_module(
                "choiceprint_context_race_validator",
                RETRIEVER.VALIDATOR_PATH,
            )
            marker = "PRIVATE-HOLDOUT-ANSWER-MUST-NOT-BE-RETURNED"
            claims_path = pack / "profile/claims.jsonl"
            metadata_path = pack / "build-metadata.json"

            class MutatingValidator:
                def validate_bundle(self, snapshot_root: Path):
                    validation = real_validator.validate_bundle(snapshot_root)
                    claim = json.loads(claims_path.read_text(encoding="utf-8"))
                    claim["ground_truth"] = marker
                    payload = (json.dumps(claim, sort_keys=True) + "\n").encode("utf-8")
                    claims_path.write_bytes(payload)
                    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
                    metadata["file_sha256"]["profile/claims.jsonl"] = (
                        hashlib.sha256(payload).hexdigest()
                    )
                    metadata_path.write_text(
                        json.dumps(metadata, indent=2, sort_keys=True) + "\n",
                        encoding="utf-8",
                    )
                    return validation

            with mock.patch.object(
                RETRIEVER,
                "_load_module",
                return_value=MutatingValidator(),
            ):
                result = RETRIEVER.get_twin_context(
                    pack,
                    mode="predict-choice",
                    scenario=SCENARIO,
                    max_context_bytes=12_000,
                    request_at=REQUEST_AT,
                )

            self.assertEqual(result["status"], "ok")
            self.assertNotIn(marker, json.dumps(result, sort_keys=True))
            self.assertIn(marker, claims_path.read_text(encoding="utf-8"))

    def test_ranking_combines_structure_and_lexical_overlap_with_id_tiebreak(self) -> None:
        source_refs = ["src_fixture"]
        tied_case = {
            "scenario": {
                "domain": "analysis",
                "stakes": "medium",
                "summary": "Verify a calculation before publishing",
            },
            "source_refs": source_refs,
            "sensitivity": "private",
            "dataset_role": "development",
        }
        lexical_case = {
            "scenario": {
                "domain": "other",
                "summary": "Verify an important calculation before publishing",
            },
            "source_refs": source_refs,
            "sensitivity": "private",
            "dataset_role": "development",
        }
        eligible = {
            "decision_case": {
                "case-z": {"id": "case-z", **tied_case},
                "case-a": {"id": "case-a", **tied_case},
                "case-lexical": {"id": "case-lexical", **lexical_case},
            }
        }
        exclusions: Counter[tuple[str, str]] = Counter()

        ranked = RETRIEVER._candidate_records(
            eligible,
            scenario=SCENARIO,
            mode="predict-choice",
            exclusions=exclusions,
        )

        self.assertEqual(
            [item.identifier for item in ranked],
            ["case-a", "case-z", "case-lexical"],
        )
        self.assertGreater(ranked[0].structured_matches, ranked[-1].structured_matches)
        self.assertGreater(ranked[-1].lexical_overlap, 0)

    def test_safety_filter_enforces_source_sensitivity_runtime_and_expiry(self) -> None:
        sources = [
            {
                "id": "src_allowed",
                "authorship": "person",
                "sensitivity": "private",
            },
            {
                "id": "src_unapproved",
                "authorship": "person",
                "sensitivity": "private",
            },
            {
                "id": "src_sensitive",
                "authorship": "person",
                "sensitivity": "sensitive",
            },
        ]
        _, authorized = RETRIEVER._source_authorizer(sources, ["src_allowed"])
        now = datetime(2026, 9, 30, tzinfo=timezone.utc)
        base = {
            "status": "active",
            "user_confirmed": True,
            "runtime_included": True,
            "sensitivity": "private",
            "source_refs": ["src_allowed"],
        }

        self.assertIsNone(
            RETRIEVER._safety_reason(
                "claim", base, request_at=now, source_authorized=authorized
            )
        )
        for change, expected in (
            ({"runtime_included": False}, "runtime_not_included"),
            ({"sensitivity": "sensitive"}, "sensitive"),
            ({"status": "provisional"}, "inactive_claim"),
            ({"user_confirmed": False}, "owner_not_confirmed"),
            ({"source_refs": ["src_unapproved"]}, "source_not_authorized"),
            ({"source_refs": ["src_sensitive"]}, "source_not_authorized"),
            ({"effective_to": "2026-09-29"}, "expired"),
            ({"effective_from": "2026-10-01"}, "not_yet_effective"),
        ):
            with self.subTest(expected=expected):
                record = {**base, **change}
                self.assertEqual(
                    RETRIEVER._safety_reason(
                        "claim", record, request_at=now, source_authorized=authorized
                    ),
                    expected,
                )

    def test_closure_includes_sources_conflicts_and_counterexamples(self) -> None:
        source = {
            "id": "src_fixture",
            "source_type": "user_statement",
            "authorship": "person",
            "summary": "Fixture evidence",
            "sensitivity": "private",
            "runtime_excerpt_allowed": True,
        }
        claim = {
            "id": "claim-a",
            "status": "active",
            "runtime_included": True,
            "sensitivity": "private",
            "source_refs": ["src_fixture"],
        }
        counterexample = {
            "id": "counter-a",
            "claim_or_policy_id": "claim-a",
            "sensitivity": "private",
            "source_refs": ["src_fixture"],
        }
        conflict = {
            "id": "conflict-a",
            "claim_refs": ["claim-a"],
            "sensitivity": "private",
            "source_refs": ["src_fixture"],
        }
        eligible = {
            "claim": {"claim-a": claim},
            "counterexample": {"counter-a": counterexample},
            "conflict": {"conflict-a": conflict},
        }
        source_by_id, authorized = RETRIEVER._source_authorizer(
            [source], ["src_fixture"]
        )
        candidate = RETRIEVER.Candidate(
            kind="claim",
            identifier="claim-a",
            record=claim,
            domain_match=1,
            structured_matches=1,
            lexical_overlap=1,
        )

        closure = RETRIEVER._closure_for_candidate(
            candidate,
            eligible=eligible,
            source_by_id=source_by_id,
            source_authorized=authorized,
        )

        self.assertEqual(set(closure["claim"]), {"claim-a"})
        self.assertEqual(set(closure["counterexample"]), {"counter-a"})
        self.assertEqual(set(closure["conflict"]), {"conflict-a"})
        self.assertEqual(set(closure["source"]), {"src_fixture"})

    def test_ineligible_reverse_counterevidence_fails_closed_for_every_reason(
        self,
    ) -> None:
        base_pack = RETRIEVER._load_pack(EXAMPLE_PACK)
        target = "clm_sample_accuracy"
        reason_changes = (
            ("sensitive", {"sensitivity": "sensitive"}),
            ("runtime_not_included", {"runtime_included": False}),
            ("expired", {"effective_to": "2026-09-29"}),
            ("not_yet_effective", {"effective_from": "2026-10-01"}),
            ("missing_source_references", {"source_refs": []}),
            ("source_not_authorized", {"source_refs": ["src_not_allowed"]}),
        )

        for kind in ("counterexample", "conflict"):
            for reason, changes in reason_changes:
                with self.subTest(kind=kind, reason=reason):
                    pack = deepcopy(base_pack)
                    record = {
                        "id": f"blocked-{kind}-{reason}",
                        "sensitivity": "private",
                        "source_refs": ["src_sample_interview"],
                        **changes,
                    }
                    if kind == "counterexample":
                        record["claim_or_policy_id"] = target
                        pack["counterexamples"].append(record)
                    else:
                        record["claim_refs"] = [target]
                        pack["conflicts"].append(record)

                    with mock.patch.object(
                        RETRIEVER,
                        "_load_pack",
                        return_value=pack,
                    ):
                        result = self.retrieve()

                    claims = result["context"]["selected_records"].get("claims", [])
                    self.assertNotIn(target, {item["id"] for item in claims})
                    self.assertIn(
                        {
                            "record_type": kind,
                            "reason": reason,
                            "count": 1,
                        },
                        result["exclusions"],
                    )
                    self.assertIn(
                        {
                            "record_type": "claim",
                            "reason": "unsafe_reference_closure",
                            "count": 1,
                        },
                        result["exclusions"],
                    )

    def test_cli_accepts_private_scenario_file_and_rejects_unsafe_mode(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            scenario_file = Path(temporary_directory).resolve() / "scenario.json"
            scenario_file.write_text(json.dumps(SCENARIO), encoding="utf-8")
            scenario_file.chmod(0o600)
            output = io.StringIO()
            errors = io.StringIO()
            arguments = [
                "--pack",
                str(EXAMPLE_PACK),
                "--mode",
                "predict-choice",
                "--scenario-file",
                str(scenario_file),
                "--max-context-bytes",
                "12000",
                "--at",
                REQUEST_AT,
            ]

            with contextlib.redirect_stdout(output), contextlib.redirect_stderr(errors):
                self.assertEqual(RETRIEVER.main(arguments), 0)
            self.assertEqual(json.loads(output.getvalue())["status"], "ok")
            self.assertEqual(errors.getvalue(), "")

            if os.name == "posix":
                scenario_file.chmod(0o644)
                output = io.StringIO()
                errors = io.StringIO()
                with contextlib.redirect_stdout(output), contextlib.redirect_stderr(
                    errors
                ):
                    self.assertEqual(RETRIEVER.main(arguments), 2)
                self.assertEqual(output.getvalue(), "")
                self.assertIn("must have mode 0600", errors.getvalue())

    def test_cli_scenario_inputs_are_mutually_exclusive_and_symlinks_are_rejected(
        self,
    ) -> None:
        parser = RETRIEVER._build_parser()
        with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
            parser.parse_args(
                [
                    "--pack",
                    str(EXAMPLE_PACK),
                    "--mode",
                    "predict-choice",
                    "--scenario-json",
                    json.dumps(SCENARIO),
                    "--scenario-file",
                    "scenario.json",
                    "--max-context-bytes",
                    "12000",
                ]
            )

        if not hasattr(os, "symlink"):
            return
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory).resolve()
            target = root / "target.json"
            target.write_text(json.dumps(SCENARIO), encoding="utf-8")
            target.chmod(0o600)
            alias = root / "alias.json"
            alias.symlink_to(target)
            with self.assertRaisesRegex(RETRIEVER.RetrievalError, "symlink"):
                RETRIEVER._read_private_scenario_file(alias)

    def test_cli_rejects_oversized_scenario_file_before_parsing(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            scenario_file = Path(temporary_directory).resolve() / "scenario.json"
            scenario_file.write_bytes(b"{" + (b" " * RETRIEVER.MAX_SCENARIO_BYTES) + b"}")
            scenario_file.chmod(0o600)

            with self.assertRaisesRegex(RETRIEVER.RetrievalError, "exceeds"):
                RETRIEVER._read_private_scenario_file(scenario_file)

    def test_private_scenario_is_read_from_the_inspected_descriptor(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            scenario_file = Path(temporary_directory).resolve() / "scenario.json"
            scenario_file.write_text(json.dumps(SCENARIO), encoding="utf-8")
            scenario_file.chmod(0o600)

            with mock.patch.object(
                Path,
                "read_bytes",
                side_effect=AssertionError("scenario path was reopened after inspection"),
            ):
                loaded = RETRIEVER._read_private_scenario_file(scenario_file)

            self.assertEqual(loaded, SCENARIO)


if __name__ == "__main__":
    unittest.main()
