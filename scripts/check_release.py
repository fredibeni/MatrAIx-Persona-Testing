#!/usr/bin/env python3
"""Fail when a MatrAIx release candidate contains local or private state."""

from __future__ import annotations

import hashlib
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path, PurePosixPath
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
GIT = (
    "/opt/homebrew/bin/git"
    if Path("/opt/homebrew/bin/git").is_file()
    else (shutil.which("git") or "git")
)
SURVEY_DEFINITION = (
    ROOT / "matraix/personal-persona/survey/survey-definition.json"
)
PERSONA_SCHEMA = ROOT / "matraix/persona/schema/dimensions.json"
PERSONA_TEMPLATE_PATH = PurePosixPath(
    "matraix/personal-persona/persona.example.yaml"
)
SURVEY_DATA_GITKEEP = PurePosixPath(
    "matraix/personal-persona/survey/data/.gitkeep"
)
EXAMPLE_PACK_ROOT = PurePosixPath("digital-twin/templates/example.choiceprint")
EXAMPLE_PACK_HASHES = {
    "adapters/chatgpt-project/00-READ-FIRST.md": "e1872a204dc411db4ae6b6554e3c847b4b589a596eb44237ec81d31e82d532e6",
    "adapters/chatgpt-project/01-CORE-PROFILE.md": "d72591ecbe0ec1df67e5636f8b9580b9e0f3a9bee3102f4072f6885c206ebb79",
    "adapters/chatgpt-project/02-DECISION-RULES.md": "f5576e34935cdf570adcfd94aaff29f3d3de879860bddb9563a09866f9ee684f",
    "adapters/chatgpt-project/03-DECISION-CASES.md": "404fb6635d7eabc1569d5ea97527e906c347c69554f4fc1d07c659d254a1a1c9",
    "adapters/chatgpt-project/04-COUNTEREXAMPLES.md": "0ef0343829966908ee11f8e9c6f7033d0199ef8d898466047c82ea41641923f4",
    "adapters/chatgpt-project/05-CURRENT-CONTEXT.md": "23ced9364ad029be4915e962c9459288bed1be94b88c0b8ece14f0cb44de3571",
    "adapters/chatgpt-project/06-BOUNDARIES.md": "ed27776d996529a8adaf398e556849a925aa29fcc34febe66df6184c1cd68d99",
    "adapters/chatgpt-project/07-EVIDENCE-INDEX.md": "87f0dd80b5e9b4ac319fc3b927f78f99c941c2c2cc7b20897d061e4120fa07af",
    "adapters/chatgpt-project/08-CONFLICTS.md": "4cd40cdca788cf28dde22c99f401fe8ceb3ffb5ae0dab777d83e5f43454b7f0a",
    "adapters/chatgpt-project/09-CONSENT.md": "d36cd6aa222d694fe63137b455f7e3a262780807d83d26d907189ec801a2d832",
    "adapters/chatgpt-project/PROJECT-INSTRUCTIONS.md": "6ed8eb156a037de730f247c1107e2b2e9ef80d20ec944bbc3c736102cad99eba",
    "build-metadata.json": "d5b72bfb6130f24584418582e5ae8a54a2233b38cea9334604bae20e6548e10e",
    "evals/development.jsonl": "0c1c7c26343478ab5e2e1b0dc6529aab9cc1a1533f1afc3363c00332bbfd8ae9",
    "evals/holdout-private.jsonl": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "evidence/conflicts.jsonl": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "evidence/consent.yaml": "b82c8dadc2a574377172a626a84035b09f0fb3426e9511d5b0a6f2fcca04848d",
    "evidence/sources.jsonl": "d7a5288b0e4e8109fe890736667d00e907d7379f1a3700b17b1c6205898fa77a",
    "manifest.json": "d5021e32a833534ebaf0677dba843447ec3c5f84af19951981292b72df6c2140",
    "profile/claims.jsonl": "b1e5e763866f4a653f69f44bf82708421cf6643a8100c134b33c0855812302f6",
    "profile/counterexamples.jsonl": "cd11f84b885d4a3cbfe3d364276788d23fa909ac9661f000238243814a20ee8c",
    "profile/current-state.yaml": "9d5bdef6195fa23b302289aaee95af7bc1d2bb5e1fdc13794d33d501af28464a",
    "profile/decision-cases.jsonl": "57a35fb890f7e92338396d7a79de5ad7aa340ebd231d739e34a65c754adb4408",
    "profile/decision-policies.yaml": "69d9a71b2db081525144ea2467fb2ddb7494e7f63abfbd45f9895a29f7a7bde4",
    "profile/legacy-dimensions.yaml": "d2b365c34b17b897f5d0cfc77aca8595ead1e250d171406a71c34b65b2311c01",
    "profile/overview.yaml": "706c4cadcc4eb43c8ac9f9daea5e5175a0ba6c6dab054de56a781c4212892889",
    "safety/boundaries.yaml": "94b7da3c13de0eaad0309390d300740300b21a93c97e571598882a525b2660ab",
}
IGNORED_RELEASE_ROOTS = {
    ".next",
    ".vercel",
    ".vinext",
    ".wrangler",
    "coverage",
    "dist",
    "node_modules",
    "out",
}
IGNORED_RELEASE_DIRECTORIES = {
    ".next",
    ".pnp",
    ".venv",
    ".vercel",
    ".vinext",
    ".wrangler",
    "__pycache__",
    "coverage",
    "dist",
    "node_modules",
    "out",
}
PREBUILT_ASSETS = (
    ROOT / "matraix/personal-persona/survey/assets/validation.js",
    ROOT / "matraix/personal-persona/survey/assets/validation.css",
)

SECRET_PATTERNS = {
    "private key": re.compile(
        rb"-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----"
    ),
    "OpenAI-style token": re.compile(
        rb"(?:sk-(?:proj|svcacct)-[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9]{40,})"
    ),
    "GitHub token": re.compile(
        rb"(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})"
    ),
    "AWS access key": re.compile(rb"AKIA[0-9A-Z]{16}"),
    "Slack token": re.compile(rb"xox[baprs]-[A-Za-z0-9-]{10,}"),
    "Google API key": re.compile(rb"AIza[0-9A-Za-z_-]{35}"),
}

PERSONAL_PATH_PATTERN = re.compile(
    r"/(?:Users|home)/[^/\s]+/|[A-Za-z]:\\Users\\[^\\\s]+\\"
)
FICTIONAL_PATH_PATTERN = re.compile(
    r"/(?:Users|home)/(?:example|sample|test)/|"
    r"[A-Za-z]:\\Users\\(?:example|sample|test)\\",
    re.IGNORECASE,
)
PERSONAL_BRAND_PATTERN = re.compile(
    r"\b" + "Al" + r"fred\b|persona_" + "al" + r"fred|AL" + "FRED_",
    re.IGNORECASE,
)
NUMBERED_README_PATTERN = re.compile(r"^README [0-9]+\.md$", re.IGNORECASE)
DUPLICATE_ASSET_PATTERN = re.compile(
    r"^validation [0-9]+\.(?:css|js)$",
    re.IGNORECASE,
)


def git_paths(*args: str) -> list[PurePosixPath]:
    result = subprocess.run(
        [GIT, "ls-files", "-z", *args],
        cwd=ROOT,
        check=True,
        capture_output=True,
    )
    return [
        PurePosixPath(item.decode("utf-8"))
        for item in result.stdout.split(b"\0")
        if item
    ]


def candidate_paths() -> list[PurePosixPath]:
    return git_paths("--cached", "--others", "--exclude-standard")


def tracked_paths() -> list[PurePosixPath]:
    return git_paths("--cached")


def tracked_modes() -> dict[PurePosixPath, str]:
    result = subprocess.run(
        [GIT, "ls-files", "-s", "-z"],
        cwd=ROOT,
        check=True,
        capture_output=True,
    )
    modes: dict[PurePosixPath, str] = {}
    for item in result.stdout.split(b"\0"):
        if not item:
            continue
        metadata, raw_path = item.split(b"\t", 1)
        mode = metadata.split(b" ", 1)[0].decode("ascii")
        modes[PurePosixPath(raw_path.decode("utf-8"))] = mode
    return modes


def is_forbidden_tracked_path(path: PurePosixPath) -> str | None:
    value = path.as_posix()
    name = path.name.casefold()
    suffix = path.suffix.casefold()
    folded_parts = tuple(part.casefold() for part in path.parts)

    if "__pycache__" in folded_parts or suffix == ".pyc":
        return "Python cache artifact"
    if ".git" in folded_parts:
        return "nested Git metadata"
    if path.parts and path.parts[0] in IGNORED_RELEASE_ROOTS:
        return "ignored build or dependency output"
    if any(part in IGNORED_RELEASE_DIRECTORIES for part in folded_parts):
        return "ignored build, dependency, or environment output"
    if path.parts and path.parts[0] == ".yarn":
        allowed_yarn_roots = {"patches", "plugins", "releases", "versions"}
        if len(path.parts) < 2 or path.parts[1].casefold() not in allowed_yarn_roots:
            return "ignored Yarn runtime output"

    if (
        path.parent.as_posix() == "matraix/personal-persona"
        and suffix in {".yaml", ".yml"}
        and path != PERSONA_TEMPLATE_PATH
    ):
        return "active local persona"
    if value == "matraix/personal-persona/source-material" or value.startswith(
        "matraix/personal-persona/source-material/"
    ):
        return "persona source material"
    if value == "matraix/personal-persona/digital-twin" or value.startswith(
        "matraix/personal-persona/digital-twin/"
    ):
        return "compiled private digital twin"
    choiceprint_parts = [
        (index, part)
        for index, part in enumerate(path.parts)
        if ".choiceprint" in part.casefold()
    ]
    expected_example_root = (
        choiceprint_parts == [(2, "example.choiceprint")]
        and path.parts[:2] == ("digital-twin", "templates")
    )
    if choiceprint_parts and not expected_example_root:
        return "compiled or derived Choiceprint pack"
    if any(
        ".choiceprint.tmp-" in part or ".choiceprint.backup-" in part
        for part in path.parts
    ):
        return "compiled Choiceprint staging or backup data"
    if (
        value == "matraix/personal-persona/survey/data"
        or value.startswith("matraix/personal-persona/survey/data/")
    ) and path != SURVEY_DATA_GITKEEP:
        return "local survey or validation state"
    if value.startswith(".local-build/"):
        return "local build output"
    if value == "outputs" or value.startswith("outputs/"):
        return "generated output"
    if value == "work" or value.startswith("work/"):
        return "generated work directory"
    if value == ".local-logs" or value.startswith(".local-logs/"):
        return "local log output"
    if name == ".env" or name.startswith(".env."):
        return "environment file"
    if name == ".pnp.cjs" or name == ".pnp.loader.mjs" or name.startswith(".pnp."):
        return "package-manager runtime file"
    if name in {".npmrc", ".pypirc"}:
        return "credential-bearing configuration"
    if suffix == ".log":
        return "log output"
    if suffix == ".tsbuildinfo":
        return "TypeScript build output"
    if NUMBERED_README_PATTERN.fullmatch(path.name):
        return "numbered README copy"
    if DUPLICATE_ASSET_PATTERN.fullmatch(path.name):
        return "duplicate generated browser asset"
    if suffix in {".pem", ".key", ".p12", ".pfx"}:
        return "credential or private key file"
    if suffix in {
        ".zip",
        ".gz",
        ".tgz",
        ".tar",
        ".xz",
        ".bz2",
        ".zst",
        ".7z",
        ".rar",
    }:
        return "opaque archive"
    if "credential" in name or "secret" in name:
        return "secret-named file"
    return None


def contains_personal_path(line: str) -> bool:
    without_fictional_paths = FICTIONAL_PATH_PATTERN.sub("", line)
    return PERSONAL_PATH_PATTERN.search(without_fictional_paths) is not None


def ignored_by_release_rules(path: PurePosixPath) -> bool:
    result = subprocess.run(
        [GIT, "check-ignore", "-q", "--no-index", "--", path.as_posix()],
        cwd=ROOT,
        check=False,
    )
    if result.returncode not in {0, 1}:
        raise subprocess.CalledProcessError(
            result.returncode,
            result.args,
        )
    return result.returncode == 0


def load_survey_definition(
    data: bytes,
    label: str,
    issues: list[str],
) -> dict[str, Any] | None:
    try:
        payload = json.loads(data.decode("utf-8"))
    except (UnicodeError, json.JSONDecodeError) as exc:
        issues.append(f"invalid survey definition in {label}: {exc}")
        return None
    if not isinstance(payload, dict):
        issues.append(f"survey definition in {label} must contain a JSON object")
        return None
    return payload


def find_current_fields(value: Any, path: str = "root") -> list[str]:
    found: list[str] = []
    if isinstance(value, dict):
        for key, child in value.items():
            child_path = f"{path}.{key}"
            if str(key).startswith("current_"):
                found.append(child_path)
            found.extend(find_current_fields(child, child_path))
    elif isinstance(value, list):
        for index, child in enumerate(value):
            found.extend(find_current_fields(child, f"{path}[{index}]"))
    return found


def check_survey_definition(issues: list[str]) -> None:
    relative = PurePosixPath(SURVEY_DEFINITION.relative_to(ROOT).as_posix())
    for label, data in candidate_data_versions(relative, issues):
        payload = load_survey_definition(data, label, issues)
        if payload is None:
            continue

        current_fields = find_current_fields(payload)
        if current_fields:
            sample = ", ".join(current_fields[:5])
            suffix = "" if len(current_fields) <= 5 else ", ..."
            issues.append(
                f"survey definition in {label} contains {len(current_fields)} "
                f"current_* fields: {sample}{suffix}"
            )

        coverage = payload.get("coverage")
        if not isinstance(coverage, dict):
            issues.append(f"survey definition coverage in {label} must be an object")
            continue
        preanswered = coverage.get("preanswered_dimensions")
        if preanswered not in (None, []):
            count = len(preanswered) if isinstance(preanswered, list) else "invalid"
            issues.append(
                f"survey definition in {label} preanswered_dimensions must be "
                f"empty (found {count})"
            )
        if coverage.get("preanswered_count") not in (None, 0):
            issues.append(
                f"survey definition in {label} preanswered_count must be zero"
            )


def check_prebuilt_assets(issues: list[str]) -> None:
    for asset in PREBUILT_ASSETS:
        relative = PurePosixPath(asset.relative_to(ROOT).as_posix())
        for label, data in candidate_data_versions(relative, issues):
            if not data:
                issues.append(
                    f"empty prebuilt asset in {label}: {relative.as_posix()}"
                )


def indexed_bytes(path: PurePosixPath) -> bytes:
    result = subprocess.run(
        [GIT, "show", f":{path.as_posix()}"],
        cwd=ROOT,
        check=True,
        capture_output=True,
    )
    return result.stdout


def indexed_text(path: PurePosixPath) -> str:
    return indexed_bytes(path).decode("utf-8")


def candidate_data_versions(
    path: PurePosixPath,
    issues: list[str],
) -> list[tuple[str, bytes]]:
    tracked = path in set(tracked_paths())
    versions: list[tuple[str, bytes]] = []
    index_data: bytes | None = None
    if tracked:
        index_data = read_index_candidate(path)
        if index_data is None:
            issues.append(f"index content could not be inspected: {path.as_posix()}")

    absolute = ROOT / path
    worktree_data: bytes | None = None
    if absolute.is_symlink():
        issues.append(f"worktree symlink cannot be inspected safely: {path.as_posix()}")
    elif absolute.is_file():
        worktree_data = read_worktree_candidate(path)
        if worktree_data is None:
            issues.append(f"worktree content could not be inspected: {path.as_posix()}")
    elif tracked:
        issues.append(f"tracked worktree file is missing: {path.as_posix()}")

    if index_data is not None:
        versions.append((f"index:{path.as_posix()}", index_data))
    if worktree_data is not None and (
        index_data is None or worktree_data != index_data
    ):
        versions.append((f"worktree:{path.as_posix()}", worktree_data))
    if not versions:
        issues.append(f"candidate content could not be inspected: {path.as_posix()}")
    return versions


def candidate_data_by_source(
    path: PurePosixPath,
    issues: list[str],
) -> dict[str, bytes]:
    versions: dict[str, bytes] = {}
    if path in set(tracked_paths()):
        data = read_index_candidate(path)
        if data is None:
            issues.append(f"index content could not be inspected: {path.as_posix()}")
        else:
            versions["index"] = data

    absolute = ROOT / path
    if absolute.is_symlink():
        issues.append(f"worktree symlink cannot be inspected safely: {path.as_posix()}")
    elif absolute.is_file():
        data = read_worktree_candidate(path)
        if data is None:
            issues.append(f"worktree content could not be inspected: {path.as_posix()}")
        else:
            versions["worktree"] = data
    return versions


def _check_persona_template_content(
    schema_data: bytes,
    template_data: bytes,
    label: str,
    issues: list[str],
) -> None:
    try:
        schema = json.loads(schema_data.decode("utf-8"))
        lines = template_data.decode("utf-8").splitlines()
        expected_ids = [row["id"] for row in schema["dimensions"]]
    except (UnicodeError, json.JSONDecodeError, KeyError, TypeError) as exc:
        issues.append(f"invalid persona schema or template in {label}: {exc}")
        return

    try:
        start = lines.index("dimensions:") + 1
        end = lines.index("meta:", start)
    except ValueError:
        issues.append(f"persona template in {label} has no canonical dimensions block")
        return

    dimension_ids: list[str] = []
    for line in lines[start:end]:
        match = re.fullmatch(r"  ([A-Za-z0-9_]+): null", line)
        if match is None:
            issues.append(f"persona template dimensions in {label} must all be null")
            return
        dimension_ids.append(match.group(1))
    if dimension_ids != expected_ids:
        issues.append(
            f"persona template in {label} must contain every schema dimension in order"
        )

    for block in (
        "evidenced",
        "best_guess",
        "sensitive_evidenced",
        "sensitive_best_guess",
        "unresolved",
    ):
        if f"{block}: []" not in lines:
            issues.append(f"persona template {block} in {label} must be empty")


def check_persona_template(issues: list[str]) -> None:
    tracked_persona_yaml = [
        path
        for path in tracked_paths()
        if path.parent.as_posix() == "matraix/personal-persona"
        and path.suffix.casefold() in {".yaml", ".yml"}
    ]
    if tracked_persona_yaml != [PERSONA_TEMPLATE_PATH]:
        listed = ", ".join(path.as_posix() for path in tracked_persona_yaml)
        issues.append(
            "tracked persona YAML set must contain only persona.example.yaml"
            + (f" (found: {listed})" if listed else "")
        )
        return

    schema_path = PurePosixPath(PERSONA_SCHEMA.relative_to(ROOT).as_posix())
    schema_by_source = candidate_data_by_source(schema_path, issues)
    template_by_source = candidate_data_by_source(PERSONA_TEMPLATE_PATH, issues)
    for source in sorted(set(schema_by_source) | set(template_by_source)):
        schema_data = schema_by_source.get(source)
        template_data = template_by_source.get(source)
        label = f"{source}:{PERSONA_TEMPLATE_PATH.as_posix()}"
        if schema_data is None or template_data is None:
            issues.append(
                "persona schema and template must both be inspectable in "
                f"the {source} candidate"
            )
            continue
        _check_persona_template_content(
            schema_data,
            template_data,
            label,
            issues,
        )


def check_candidate_paths(issues: list[str]) -> None:
    tracked = set(tracked_paths())
    modes = tracked_modes()
    for path in candidate_paths():
        reason = is_forbidden_tracked_path(path)
        if reason:
            source = "tracked" if path in tracked else "untracked"
            issues.append(f"{source} {reason}: {path.as_posix()}")
        elif ignored_by_release_rules(path):
            source = "tracked" if path in tracked else "untracked"
            issues.append(
                f"{source} force-added ignored release artifact: {path.as_posix()}"
            )
        if path in tracked and modes.get(path) == "120000" and reason:
            issues.append(f"tracked symlink at sensitive path: {path.as_posix()}")


def read_worktree_candidate(path: PurePosixPath) -> bytes | None:
    absolute = ROOT / path
    if absolute.is_symlink():
        return None
    if not absolute.is_file():
        return None
    try:
        return absolute.read_bytes()
    except OSError:
        return None


def read_index_candidate(path: PurePosixPath) -> bytes | None:
    try:
        result = subprocess.run(
            [GIT, "show", f":{path.as_posix()}"],
            cwd=ROOT,
            check=True,
            capture_output=True,
        )
    except subprocess.CalledProcessError:
        return None
    return result.stdout


def check_candidate_content(issues: list[str]) -> None:
    tracked = set(tracked_paths())
    modes = tracked_modes()
    for path in candidate_paths():
        if path in tracked and modes.get(path) == "120000":
            issues.append(f"tracked symlink cannot be inspected safely: {path.as_posix()}")
        for source_label, data in candidate_data_versions(path, issues):
            if path == SURVEY_DATA_GITKEEP and data:
                issues.append(
                    "tracked survey data .gitkeep must be an empty placeholder: "
                    f"{source_label}"
                )

            for label, pattern in SECRET_PATTERNS.items():
                if pattern.search(data):
                    issues.append(f"possible {label} in {source_label}")

            try:
                text = data.decode("utf-8")
            except UnicodeDecodeError:
                issues.append(f"non-UTF-8 candidate cannot be inspected: {source_label}")
                continue

            for line_number, line in enumerate(text.splitlines(), start=1):
                if "\u2013" in line or "\u2014" in line:
                    issues.append(
                        f"long dash character in {source_label}:{line_number}"
                    )
                if contains_personal_path(line):
                    issues.append(
                        f"personal absolute path in {source_label}:{line_number}"
                    )
                if PERSONAL_BRAND_PATTERN.search(line):
                    issues.append(
                        f"personal branding in {source_label}:{line_number}"
                    )


def check_example_pack_integrity(issues: list[str]) -> None:
    expected_paths = {
        EXAMPLE_PACK_ROOT / PurePosixPath(relative)
        for relative in EXAMPLE_PACK_HASHES
    }
    pack_paths = {
        path
        for path in candidate_paths()
        if len(path.parts) > len(EXAMPLE_PACK_ROOT.parts)
        and path.parts[: len(EXAMPLE_PACK_ROOT.parts)] == EXAMPLE_PACK_ROOT.parts
    }
    source_files: dict[str, dict[PurePosixPath, bytes]] = {
        "index": {},
        "worktree": {},
    }
    for path in pack_paths:
        for source, data in candidate_data_by_source(path, issues).items():
            source_files[source][path] = data

    for source, files in source_files.items():
        if source == "index" and not files:
            continue
        actual_paths = set(files)
        missing = sorted(expected_paths - actual_paths)
        unexpected = sorted(actual_paths - expected_paths)
        for path in missing:
            issues.append(
                f"fictional example pack is missing {source} file: {path.as_posix()}"
            )
        for path in unexpected:
            issues.append(
                f"fictional example pack has unexpected {source} file: "
                f"{path.as_posix()}"
            )
        for path in sorted(expected_paths & actual_paths):
            relative = path.relative_to(EXAMPLE_PACK_ROOT).as_posix()
            actual_hash = hashlib.sha256(files[path]).hexdigest()
            if actual_hash != EXAMPLE_PACK_HASHES[relative]:
                issues.append(
                    f"fictional example pack content differs from the reviewed "
                    f"{source} fixture: {path.as_posix()}"
                )


def check_example_pack_is_fictional(issues: list[str]) -> None:
    required = {
        "manifest.json": {
            "persona_id": "sample-person",
            "display_name": "Sample Person",
        },
        "profile/claims.jsonl": {"id": "clm_sample_accuracy"},
        "profile/decision-cases.jsonl": {"id": "case_sample_validation"},
        "evidence/sources.jsonl": {"id": "src_sample_interview"},
    }
    for relative_name, sentinels in required.items():
        path = EXAMPLE_PACK_ROOT / relative_name
        for label, data in candidate_data_versions(path, issues):
            try:
                if relative_name.endswith(".jsonl"):
                    records = [
                        json.loads(line)
                        for line in data.decode("utf-8").splitlines()
                        if line.strip()
                    ]
                    if len(records) != 1:
                        raise ValueError("expected exactly one fictional record")
                    document = records[0]
                else:
                    document = json.loads(data.decode("utf-8"))
            except (UnicodeError, json.JSONDecodeError, ValueError) as exc:
                issues.append(f"invalid fictional example in {label}: {exc}")
                continue
            for key, expected in sentinels.items():
                if document.get(key) != expected:
                    issues.append(
                        f"fictional example sentinel {key!r} is missing in {label}"
                    )
            if relative_name == "manifest.json":
                coverage = document.get("coverage")
                if not isinstance(coverage, dict) or coverage.get("status") != "example_only":
                    issues.append(
                        f"fictional example coverage must be example_only in {label}"
                    )


def main() -> int:
    issues: list[str] = []
    try:
        check_survey_definition(issues)
        check_prebuilt_assets(issues)
        check_candidate_paths(issues)
        check_persona_template(issues)
        check_example_pack_integrity(issues)
        check_example_pack_is_fictional(issues)
        check_candidate_content(issues)
    except (OSError, subprocess.CalledProcessError) as exc:
        issues.append(f"release check could not inspect the repository: {exc}")

    unique_issues = list(dict.fromkeys(issues))
    if unique_issues:
        print(f"Release check failed with {len(unique_issues)} issue(s):")
        for issue in unique_issues:
            print(f"- {issue}")
        return 1

    print("Release check: ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
