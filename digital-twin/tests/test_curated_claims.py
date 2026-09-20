from __future__ import annotations

import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path

import yaml


SCRIPTS_DIRECTORY = Path(__file__).resolve().parents[1] / "scripts"
CLAIM_MARKER = "Prefers a short written plan before a complex task."


def load_module(name: str, filename: str):
    path = SCRIPTS_DIRECTORY / filename
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot import {name} from {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


COMPILER = load_module("build_choiceprint_for_curated_claims", "build_choiceprint.py")
RETRIEVER = load_module(
    "retrieve_choiceprint_context_for_curated_claims",
    "retrieve_choiceprint_context.py",
)
REVIEW = load_module(
    "review_choiceprint_claims_for_curated_claims", "review_choiceprint_claims.py"
)
VALIDATOR = load_module(
    "validate_twin_pack_for_curated_claims", "validate_twin_pack.py"
)


def write_yaml(path: Path, value: object) -> None:
    path.write_text(yaml.safe_dump(value, sort_keys=False), encoding="utf-8")
    path.chmod(0o600)


def read_jsonl(path: Path) -> list[dict[str, object]]:
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]


def adapter_text(pack: Path) -> str:
    return "\n".join(
        path.read_text(encoding="utf-8")
        for path in sorted((pack / "adapters/chatgpt-project").glob("*.md"))
    )


def persona_fixture() -> dict[str, object]:
    return {
        "persona_id": "fictional-email-person",
        "version": "1.0",
        "display_name": "Fictional Email Person",
        "dimensions": {},
        "meta": {"schema_version": "1.0"},
    }


def curation_fixture() -> dict[str, object]:
    return {
        "content_version": "email-test-v1",
        "profile": {
            "summary": "No runtime profile summary is available.",
            "runtime_included": False,
            "sensitivity": "private",
            "source_refs": [],
        },
        "sources": [
            {
                "id": "src_baseline",
                "source_type": "structured_self_report",
                "authorship": "person",
                "captured_at": "2026-09-01",
                "summary": "Fictional baseline source retained in both variants.",
                "sensitivity": "private",
                "runtime_excerpt_allowed": False,
            },
            {
                "id": "src_email_v1_planning",
                "source_type": "email_corpus",
                "authorship": "person",
                "captured_at": "2026-09-01",
                "summary": "Fictional email evidence about planning preferences.",
                "sensitivity": "private",
                "runtime_excerpt_allowed": False,
                "evidence_set": "email-v1",
            },
        ],
        "claims": [
            {
                "id": "clm_email_v1_planning",
                "predicate": "preference.planning_style",
                "label": "Planning style",
                "value": CLAIM_MARKER,
                "scope": {"domains": ["planning"], "conditions": []},
                "confidence": {
                    "label": "medium",
                    "basis": "repeated fictional first-person email statements",
                },
                "evidence_refs": ["src_baseline", "src_email_v1_planning"],
                "sensitivity": "private",
                "observed_at": "2026-09-01",
                "runtime_included": True,
            }
        ],
        "decision_cases": [],
        "decision_policies": [],
        "counterexamples": [],
        "conflicts": [],
        "current_state": {},
        "consent": {
            "owner_authorized": True,
            "authorized_at": "2026-09-01",
            "allowed_sources": ["src_baseline", "src_email_v1_planning"],
            "allowed_modes": ["predict-choice"],
            "allowed_uses": ["predict likely choices"],
            "prohibited_uses": ["claim literal identity"],
            "publication_requires_fresh_approval": True,
        },
        "boundaries": {"ask_before": ["send any external message"]},
        "coverage": {
            "status": "development_only",
            "declared_domains": ["planning"],
            "validated_domains": [],
        },
    }


class CuratedClaimTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name).resolve()
        self.root.chmod(0o700)
        self.persona = self.root / "persona.yaml"
        self.curation = self.root / "curation.yaml"
        write_yaml(self.persona, persona_fixture())
        write_yaml(self.curation, curation_fixture())

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def build(self, name: str, curation_path: Path | None = None) -> Path:
        output = self.root / f"{name}.choiceprint"
        COMPILER.build_choiceprint(
            self.persona,
            output,
            curation_path=curation_path or self.curation,
        )
        validation = VALIDATOR.validate_bundle(output)
        self.assertTrue(validation.ok, validation.errors)
        return output

    def test_claim_is_reviewed_then_filtered_only_by_source_authorization(self) -> None:
        unreviewed_pack = self.build("unreviewed")
        unreviewed_claim = read_jsonl(
            unreviewed_pack / "profile/claims.jsonl"
        )[0]
        self.assertEqual(unreviewed_claim["status"], "provisional")
        self.assertIs(unreviewed_claim["user_confirmed"], False)
        self.assertNotIn(CLAIM_MARKER, adapter_text(unreviewed_pack))

        review_path = self.root / "claim-review.yaml"
        REVIEW.prepare_review(unreviewed_pack, review_path)
        review = yaml.safe_load(review_path.read_text(encoding="utf-8"))
        self.assertEqual(
            [row["claim_id"] for row in review["claims"]],
            ["clm_email_v1_planning"],
        )
        review["reviewed_at"] = "2026-09-18"
        review["claims"][0]["decision"] = "confirm"
        review["claims"][0]["domains"] = ["planning"]
        review["claims"][0]["conditions"] = []
        write_yaml(review_path, review)

        reviewed_curation = self.root / "curation.reviewed.yaml"
        REVIEW.apply_review(
            unreviewed_pack,
            review_path,
            self.curation,
            reviewed_curation,
        )
        with_email_pack = self.build("with-email", reviewed_curation)

        without_email = yaml.safe_load(
            reviewed_curation.read_text(encoding="utf-8")
        )
        without_email["consent"]["allowed_sources"] = ["src_baseline"]
        without_email_curation = self.root / "curation.no-email.yaml"
        write_yaml(without_email_curation, without_email)
        without_email_pack = self.build("without-email", without_email_curation)

        with_email_claim = read_jsonl(
            with_email_pack / "profile/claims.jsonl"
        )[0]
        self.assertEqual(with_email_claim["status"], "active")
        self.assertIs(with_email_claim["user_confirmed"], True)
        self.assertIn(CLAIM_MARKER, adapter_text(with_email_pack))
        self.assertNotIn(CLAIM_MARKER, adapter_text(without_email_pack))
        self.assertEqual(
            (with_email_pack / "profile/claims.jsonl").read_bytes(),
            (without_email_pack / "profile/claims.jsonl").read_bytes(),
        )
        self.assertEqual(
            (with_email_pack / "evidence/sources.jsonl").read_bytes(),
            (without_email_pack / "evidence/sources.jsonl").read_bytes(),
        )
        email_source = next(
            source
            for source in read_jsonl(with_email_pack / "evidence/sources.jsonl")
            if source["id"] == "src_email_v1_planning"
        )
        self.assertEqual(email_source["evidence_set"], "email-v1")

        scenario = {
            "summary": "Choose how to begin a complex planning task.",
            "domain": "planning",
            "options": ["write a short plan", "start immediately"],
        }
        with_context = RETRIEVER.get_twin_context(
            with_email_pack,
            mode="predict-choice",
            scenario=scenario,
            max_context_bytes=12000,
            request_at="2030-01-01T00:00:00Z",
        )
        without_context = RETRIEVER.get_twin_context(
            without_email_pack,
            mode="predict-choice",
            scenario=scenario,
            max_context_bytes=12000,
            request_at="2030-01-01T00:00:00Z",
        )
        self.assertIn("clm_email_v1_planning", json.dumps(with_context))
        self.assertNotIn("clm_email_v1_planning", json.dumps(without_context))
        self.assertIn(
            {"record_type": "claim", "reason": "source_not_authorized", "count": 1},
            without_context["exclusions"],
        )

    def test_invalid_claim_metadata_and_source_references_are_rejected(self) -> None:
        cases = []

        invalid_id = curation_fixture()
        invalid_id["claims"][0]["id"] = "bad claim id"
        cases.append(("invalid-id", invalid_id, "valid record ID"))

        unsupported_field = curation_fixture()
        unsupported_field["claims"][0]["automatic_approval"] = True
        cases.append(("unsupported-field", unsupported_field, "unsupported fields"))

        reserved_predicate = curation_fixture()
        reserved_predicate["claims"][0]["predicate"] = "legacy_dimension.accuracy"
        cases.append(("reserved-predicate", reserved_predicate, "reserved predicate"))

        unknown_source = curation_fixture()
        unknown_source["claims"][0]["evidence_refs"] = ["src_missing"]
        cases.append(("unknown-source", unknown_source, "unknown source reference"))

        preconfirmed = curation_fixture()
        preconfirmed["claims"][0]["status"] = "active"
        preconfirmed["claims"][0]["user_confirmed"] = True
        cases.append(("preconfirmed", preconfirmed, "before owner review"))

        invalid_evidence_set = curation_fixture()
        invalid_evidence_set["sources"][1]["evidence_set"] = "email v1"
        cases.append(
            ("invalid-evidence-set", invalid_evidence_set, "valid record ID")
        )

        for name, document, message in cases:
            with self.subTest(name=name):
                curation = self.root / f"{name}.yaml"
                write_yaml(curation, document)
                output = self.root / f"{name}.choiceprint"
                with self.assertRaisesRegex(ValueError, message):
                    COMPILER.build_choiceprint(
                        self.persona, output, curation_path=curation
                    )
                self.assertFalse(output.exists())


if __name__ == "__main__":
    unittest.main()
