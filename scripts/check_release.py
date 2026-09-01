#!/usr/bin/env python3
"""Fail when a MatrAIx release candidate contains local or private state."""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path, PurePosixPath
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
SURVEY_DEFINITION = (
    ROOT / "matraix/personal-persona/survey/survey-definition.json"
)
PERSONA_SCHEMA = ROOT / "matraix/persona/schema/dimensions.json"
PERSONA_TEMPLATE_PATH = PurePosixPath(
    "matraix/personal-persona/persona.example.yaml"
)
PREBUILT_ASSETS = (
    ROOT / "matraix/personal-persona/survey/assets/validation.js",
    ROOT / "matraix/personal-persona/survey/assets/validation.css",
)

SECRET_PATTERNS = {
    "private key": re.compile(
        rb"-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----"
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
PERSONAL_BRAND_PATTERN = re.compile(
    r"\b" + "Al" + r"fred\b|persona_" + "al" + r"fred|AL" + "FRED_",
    re.IGNORECASE,
)


def git_paths(*args: str) -> list[PurePosixPath]:
    result = subprocess.run(
        ["git", "ls-files", "-z", *args],
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


def is_test_path(path: PurePosixPath) -> bool:
    return "tests" in path.parts or any(
        part.startswith("test_") for part in path.parts
    )


def is_runtime_or_doc(path: PurePosixPath) -> bool:
    return not is_test_path(path)


def is_forbidden_tracked_path(path: PurePosixPath) -> str | None:
    value = path.as_posix()
    name = path.name.casefold()
    suffix = path.suffix.casefold()

    if (
        path.parent.as_posix() == "matraix/personal-persona"
        and suffix in {".yaml", ".yml"}
        and path != PERSONA_TEMPLATE_PATH
    ):
        return "active local persona"
    if value.startswith("matraix/personal-persona/source-material/"):
        return "persona source material"
    if value.startswith("matraix/personal-persona/survey/data/") and not value.endswith(
        "/.gitkeep"
    ):
        return "local survey or validation state"
    if value.startswith(".local-build/"):
        return "local build output"
    if name == ".env" or name.startswith(".env."):
        return "environment file"
    if name in {".npmrc", ".pypirc"}:
        return "credential-bearing configuration"
    if suffix in {".pem", ".key", ".p12", ".pfx"}:
        return "credential or private key file"
    if "credential" in name or "secret" in name:
        return "secret-named file"
    return None


def load_survey_definition(issues: list[str]) -> dict[str, Any] | None:
    if not SURVEY_DEFINITION.is_file():
        issues.append(
            "missing survey definition: "
            + SURVEY_DEFINITION.relative_to(ROOT).as_posix()
        )
        return None
    try:
        payload = json.loads(SURVEY_DEFINITION.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        issues.append(f"invalid survey definition: {exc}")
        return None
    if not isinstance(payload, dict):
        issues.append("survey definition must contain a JSON object")
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
    payload = load_survey_definition(issues)
    if payload is None:
        return

    current_fields = find_current_fields(payload)
    if current_fields:
        sample = ", ".join(current_fields[:5])
        suffix = "" if len(current_fields) <= 5 else ", ..."
        issues.append(
            f"survey definition contains {len(current_fields)} current_* fields: "
            f"{sample}{suffix}"
        )

    coverage = payload.get("coverage")
    if not isinstance(coverage, dict):
        issues.append("survey definition coverage must be an object")
        return
    preanswered = coverage.get("preanswered_dimensions")
    if preanswered not in (None, []):
        count = len(preanswered) if isinstance(preanswered, list) else "invalid"
        issues.append(
            "survey definition preanswered_dimensions must be empty "
            f"(found {count})"
        )
    if coverage.get("preanswered_count") not in (None, 0):
        issues.append("survey definition preanswered_count must be zero")


def check_prebuilt_assets(issues: list[str]) -> None:
    for asset in PREBUILT_ASSETS:
        relative = asset.relative_to(ROOT).as_posix()
        if not asset.is_file():
            issues.append(f"missing prebuilt asset: {relative}")
        elif asset.stat().st_size == 0:
            issues.append(f"empty prebuilt asset: {relative}")


def indexed_text(path: PurePosixPath) -> str:
    result = subprocess.run(
        ["git", "show", f":{path.as_posix()}"],
        cwd=ROOT,
        check=True,
        capture_output=True,
    )
    return result.stdout.decode("utf-8")


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

    schema = json.loads(PERSONA_SCHEMA.read_text(encoding="utf-8"))
    expected_ids = [row["id"] for row in schema["dimensions"]]
    lines = indexed_text(PERSONA_TEMPLATE_PATH).splitlines()
    try:
        start = lines.index("dimensions:") + 1
        end = lines.index("meta:", start)
    except ValueError:
        issues.append("tracked persona template has no canonical dimensions block")
        return

    dimension_ids: list[str] = []
    for line in lines[start:end]:
        match = re.fullmatch(r"  ([A-Za-z0-9_]+): null", line)
        if match is None:
            issues.append("tracked persona template dimensions must all be null")
            return
        dimension_ids.append(match.group(1))
    if dimension_ids != expected_ids:
        issues.append(
            "tracked persona template must contain every schema dimension in order"
        )

    for block in (
        "evidenced",
        "best_guess",
        "sensitive_evidenced",
        "sensitive_best_guess",
        "unresolved",
    ):
        if f"{block}: []" not in lines:
            issues.append(f"tracked persona template {block} must be empty")


def check_tracked_paths(issues: list[str]) -> None:
    for path in tracked_paths():
        reason = is_forbidden_tracked_path(path)
        if reason:
            issues.append(f"tracked {reason}: {path.as_posix()}")


def read_candidate(path: PurePosixPath) -> bytes | None:
    absolute = ROOT / path
    if not absolute.is_file():
        return None
    try:
        return absolute.read_bytes()
    except OSError:
        return None


def check_candidate_content(issues: list[str]) -> None:
    for path in candidate_paths():
        data = read_candidate(path)
        if data is None:
            continue

        for label, pattern in SECRET_PATTERNS.items():
            if pattern.search(data):
                issues.append(f"possible {label} in {path.as_posix()}")

        try:
            text = data.decode("utf-8")
        except UnicodeDecodeError:
            continue

        for line_number, line in enumerate(text.splitlines(), start=1):
            if "\u2013" in line or "\u2014" in line:
                issues.append(
                    f"long dash character in {path.as_posix()}:{line_number}"
                )
            if is_runtime_or_doc(path):
                if PERSONAL_PATH_PATTERN.search(line):
                    issues.append(
                        f"personal absolute path in {path.as_posix()}:{line_number}"
                    )
                if PERSONAL_BRAND_PATTERN.search(line):
                    issues.append(
                        f"personal branding in {path.as_posix()}:{line_number}"
                    )


def main() -> int:
    issues: list[str] = []
    try:
        check_survey_definition(issues)
        check_prebuilt_assets(issues)
        check_tracked_paths(issues)
        check_persona_template(issues)
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
