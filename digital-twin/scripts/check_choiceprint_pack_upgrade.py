#!/usr/bin/env python3
"""Check whether a Choiceprint pack matches one known legacy schema delta.

This diagnostic is deliberately read-only. It recognizes only the legacy
coverage shape which predates both ``declared_domains`` and
``validation_events``. A pack is eligible only when the current validator
reports exactly the missing required ``validation_events`` field and every
independent safety check passes.

Output is limited to fixed status labels and aggregate validator categories.
Pack paths, record identifiers, field values, hashes, and validator messages
are never printed.
"""

from __future__ import annotations

import contextlib
import hashlib
import importlib.util
import io
import json
import math
import os
import re
import stat
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Mapping, Sequence


sys.dont_write_bytecode = True

EXPECTED_VALIDATOR_ERROR = (
    "schema violation in manifest.json at coverage: "
    "'validation_events' is a required property"
)
SHA256_HEX = re.compile(r"^[a-f0-9]{64}$")
LEGACY_ABSENT_COVERAGE_FIELDS = frozenset(
    {"declared_domains", "validation_events"}
)


def _load_current_validator():
    path = Path(__file__).resolve().with_name("validate_twin_pack.py")
    spec = importlib.util.spec_from_file_location(
        "_choiceprint_current_validator_for_upgrade_check", path
    )
    if spec is None or spec.loader is None:
        raise RuntimeError("current validator is unavailable")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


try:
    CURRENT_VALIDATOR = _load_current_validator()
except Exception:
    CURRENT_VALIDATOR = None


CANONICAL_FILES = frozenset(
    getattr(CURRENT_VALIDATOR, "CANONICAL_FILE_PATHS", ())
)
ADAPTER_FILES = frozenset(
    getattr(CURRENT_VALIDATOR, "CHATGPT_PROJECT_ADAPTER_FILE_PATHS", ())
)


@dataclass(frozen=True)
class EntryFingerprint:
    """Metadata used to detect changes while the diagnostic is running."""

    device: int
    inode: int
    owner: int
    mode: int
    size: int
    modified_ns: int
    changed_ns: int


@dataclass
class Inspection:
    """One descriptor-captured in-memory snapshot of the pack tree."""

    files: dict[str, bytes] = field(default_factory=dict)
    directories: set[str] = field(default_factory=set)
    fingerprints: dict[str, EntryFingerprint] = field(default_factory=dict)
    ancestor_fingerprints: tuple[EntryFingerprint, ...] = ()
    regular_tree: bool = False


@dataclass
class CheckResult:
    """Sanitized status returned by the diagnostic."""

    checks: dict[str, bool] = field(
        default_factory=lambda: {
            "structure": False,
            "inventory": False,
            "integrity": False,
            "permissions": False,
            "holdout": False,
            "legacy_shape": False,
            "current_validator": False,
            "stable_snapshot": False,
        }
    )
    validator_error_count: int | None = None
    validator_categories: tuple[str, ...] = ()

    @property
    def base_checks_pass(self) -> bool:
        return all(
            self.checks[name]
            for name in (
                "structure",
                "inventory",
                "integrity",
                "permissions",
                "holdout",
                "stable_snapshot",
            )
        )

    @property
    def status(self) -> str:
        if not self.base_checks_pass or not self.checks["current_validator"]:
            return "invalid"
        if self.validator_error_count == 0:
            return "current"
        if (
            self.checks["legacy_shape"]
            and self.validator_error_count == 1
            and self.validator_categories == ("legacy-coverage-schema",)
        ):
            return "upgrade-ready"
        return "invalid"

    @property
    def ok(self) -> bool:
        return self.status in {"current", "upgrade-ready"}


def _fingerprint(value: os.stat_result) -> EntryFingerprint:
    return EntryFingerprint(
        device=value.st_dev,
        inode=value.st_ino,
        owner=value.st_uid,
        mode=value.st_mode,
        size=value.st_size,
        modified_ns=value.st_mtime_ns,
        changed_ns=value.st_ctime_ns,
    )


def _absolute_pack_root(value: Path | str) -> Path | None:
    try:
        raw = os.path.expanduser(os.fspath(value))
        if not raw or "\x00" in raw:
            return None
        return Path(os.path.abspath(raw))
    except (OSError, TypeError, ValueError):
        return None


def _directory_open_flags() -> int:
    flags = os.O_RDONLY
    for name in ("O_CLOEXEC", "O_DIRECTORY", "O_NOFOLLOW"):
        value = getattr(os, name, None)
        if value is None:
            return -1
        flags |= int(value)
    return flags


def _file_open_flags() -> int:
    flags = os.O_RDONLY
    for name in ("O_CLOEXEC", "O_NOFOLLOW", "O_NONBLOCK"):
        value = getattr(os, name, None)
        if value is None:
            return -1
        flags |= int(value)
    return flags


def _open_directory_chain(
    root: Path,
) -> tuple[int, tuple[EntryFingerprint, ...]] | None:
    flags = _directory_open_flags()
    if flags < 0:
        return None
    descriptor: int | None = None
    fingerprints: list[EntryFingerprint] = []
    try:
        descriptor = os.open(root.anchor, flags)
        anchor_stat = os.fstat(descriptor)
        if not stat.S_ISDIR(anchor_stat.st_mode):
            os.close(descriptor)
            return None
        fingerprints.append(_fingerprint(anchor_stat))
        for part in root.parts[1:]:
            child = os.open(part, flags, dir_fd=descriptor)
            child_stat = os.fstat(child)
            if not stat.S_ISDIR(child_stat.st_mode):
                os.close(child)
                os.close(descriptor)
                return None
            fingerprints.append(_fingerprint(child_stat))
            os.close(descriptor)
            descriptor = child
        return descriptor, tuple(fingerprints)
    except OSError:
        if descriptor is not None:
            os.close(descriptor)
        return None


def _read_regular_file_at(
    directory_descriptor: int,
    name: str,
) -> tuple[bytes, EntryFingerprint] | None:
    flags = _file_open_flags()
    if flags < 0:
        return None
    try:
        descriptor = os.open(name, flags, dir_fd=directory_descriptor)
    except OSError:
        return None
    try:
        before = os.fstat(descriptor)
        if not stat.S_ISREG(before.st_mode):
            return None
        chunks: list[bytes] = []
        while True:
            chunk = os.read(descriptor, 1024 * 1024)
            if not chunk:
                break
            chunks.append(chunk)
        after = os.fstat(descriptor)
        stable_fields = (
            "st_dev",
            "st_ino",
            "st_uid",
            "st_mode",
            "st_size",
            "st_mtime_ns",
            "st_ctime_ns",
        )
        if any(
            getattr(before, field) != getattr(after, field)
            for field in stable_fields
        ):
            return None
        raw = b"".join(chunks)
        if len(raw) != after.st_size:
            return None
        return raw, _fingerprint(after)
    except OSError:
        return None
    finally:
        os.close(descriptor)


def _descriptor_snapshot(root: Path) -> Inspection:
    """Read one stable source view without following links or writing bytes."""

    inspection = Inspection()
    opened = _open_directory_chain(root)
    if opened is None:
        return inspection
    root_descriptor, ancestors = opened
    inspection.ancestor_fingerprints = ancestors
    try:
        try:
            walker = os.fwalk(
                ".",
                topdown=True,
                follow_symlinks=False,
                dir_fd=root_descriptor,
            )
            for directory, child_directories, child_files, descriptor in walker:
                relative_directory = (
                    "." if directory == "." else directory.removeprefix("./")
                )
                directory_stat = os.fstat(descriptor)
                if not stat.S_ISDIR(directory_stat.st_mode):
                    return inspection
                inspection.directories.add(relative_directory)
                inspection.fingerprints[relative_directory] = _fingerprint(
                    directory_stat
                )
                for name in sorted(child_directories):
                    entry = os.stat(
                        name,
                        dir_fd=descriptor,
                        follow_symlinks=False,
                    )
                    if not stat.S_ISDIR(entry.st_mode):
                        return inspection
                for name in sorted(child_files):
                    relative = "/".join(
                        item
                        for item in (
                            "" if relative_directory == "." else relative_directory,
                            name,
                        )
                        if item
                    )
                    read = _read_regular_file_at(descriptor, name)
                    if read is None:
                        return inspection
                    raw, fingerprint = read
                    inspection.files[relative] = raw
                    inspection.fingerprints[relative] = fingerprint
        except (OSError, ValueError):
            return inspection
    finally:
        os.close(root_descriptor)
    inspection.regular_tree = True
    return inspection


def _expected_directories(files: set[str]) -> set[str]:
    directories = {"."}
    for relative in files:
        parent = Path(relative).parent
        while parent != Path("."):
            directories.add(parent.as_posix())
            parent = parent.parent
    return directories


def _inventory_is_exact(inspection: Inspection) -> bool:
    if not inspection.regular_tree or not CANONICAL_FILES:
        return False
    actual_files = set(inspection.files)
    allowed_sets = (
        set(CANONICAL_FILES),
        set(CANONICAL_FILES | ADAPTER_FILES),
    )
    if actual_files not in allowed_sets:
        return False
    return _expected_directories(actual_files).issubset(inspection.directories)


def _permissions_are_private(inspection: Inspection) -> bool:
    if os.name != "posix" or not inspection.regular_tree:
        return False
    owner = os.getuid()
    for fingerprint in inspection.fingerprints.values():
        mode = fingerprint.mode
        permissions = stat.S_IMODE(mode)
        if fingerprint.owner != owner:
            return False
        if not (stat.S_ISDIR(mode) or stat.S_ISREG(mode)):
            return False
        if permissions & (stat.S_IRWXG | stat.S_IRWXO):
            return False
    return True


def _unique_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    value: dict[str, Any] = {}
    for key, item in pairs:
        if key in value:
            raise ValueError("duplicate JSON key")
        value[key] = item
    return value


def _reject_constant(value: str) -> Any:
    raise ValueError("non-finite JSON number")


def _assert_finite(value: Any) -> None:
    if isinstance(value, float) and not math.isfinite(value):
        raise ValueError("non-finite JSON number")
    if isinstance(value, Mapping):
        for child in value.values():
            _assert_finite(child)
    elif isinstance(value, list):
        for child in value:
            _assert_finite(child)


def _load_json_object(raw: bytes | None) -> dict[str, Any] | None:
    if raw is None:
        return None
    try:
        value = json.loads(
            raw.decode("utf-8"),
            object_pairs_hook=_unique_object,
            parse_constant=_reject_constant,
        )
        _assert_finite(value)
    except (UnicodeError, ValueError, RecursionError):
        return None
    return value if isinstance(value, dict) else None


def _legacy_shape_is_exact(manifest: dict[str, Any] | None) -> bool:
    if not isinstance(manifest, dict):
        return False
    if manifest.get("bundle_format") != "choiceprint/0.1":
        return False
    if manifest.get("schema_version") != "0.1":
        return False
    coverage = manifest.get("coverage")
    if not isinstance(coverage, dict):
        return False
    return LEGACY_ABSENT_COVERAGE_FIELDS.isdisjoint(coverage)


def _hashes_for_files(files: Mapping[str, bytes]) -> dict[str, str]:
    return {
        relative: hashlib.sha256(files[relative]).hexdigest()
        for relative in sorted(files)
    }


def _integrity_is_exact(
    inspection: Inspection,
    metadata: dict[str, Any] | None,
    hashes: Mapping[str, str] | None,
) -> bool:
    if not isinstance(metadata, dict) or hashes is None:
        return False
    expected = metadata.get("file_sha256")
    if not isinstance(expected, dict):
        return False
    actual_paths = set(inspection.files) - {"build-metadata.json"}
    if set(expected) != actual_paths:
        return False
    for relative in sorted(actual_paths):
        expected_digest = expected.get(relative)
        if not isinstance(expected_digest, str):
            return False
        if not SHA256_HEX.fullmatch(expected_digest):
            return False
        if hashes.get(relative) != expected_digest:
            return False
    return True


def _holdout_is_empty(inspection: Inspection) -> bool:
    raw = inspection.files.get("evals/holdout-private.jsonl")
    if raw is None:
        return False
    try:
        return raw.decode("utf-8").strip() == ""
    except UnicodeError:
        return False


def _validator_categories(errors: Sequence[str]) -> tuple[str, ...]:
    categories: set[str] = set()
    for message in errors:
        if message == EXPECTED_VALIDATOR_ERROR:
            categories.add("legacy-coverage-schema")
        elif message.startswith("schema violation"):
            categories.add("schema")
        elif any(
            marker in message
            for marker in (
                "digest mismatch",
                "integrity metadata",
                "cannot hash",
            )
        ):
            categories.add("integrity")
        elif any(
            marker in message
            for marker in (
                "missing required path",
                "unexpected file",
                "special filesystem entry",
                "symlink is not allowed",
                "Git metadata",
            )
        ):
            categories.add("inventory")
        elif "permission" in message or "grants group or other" in message:
            categories.add("permissions")
        elif "holdout-private.jsonl must stay an empty placeholder" in message:
            categories.add("holdout")
        elif "possible secret" in message or "private key" in message:
            categories.add("secret-scan")
        elif "adapter" in message.lower():
            categories.add("adapter")
        else:
            categories.add("canonical-validation")
    return tuple(sorted(categories))


def _run_current_validator(root: Path) -> tuple[list[str] | None, bool]:
    if CURRENT_VALIDATOR is None:
        return None, False
    try:
        with (
            contextlib.redirect_stdout(io.StringIO()),
            contextlib.redirect_stderr(io.StringIO()),
        ):
            validation = CURRENT_VALIDATOR.validate_bundle(root)
        errors = list(validation.errors)
    except Exception:
        return None, False
    return errors, errors == [EXPECTED_VALIDATOR_ERROR]


def check_pack(value: Path | str) -> CheckResult:
    """Run the read-only eligibility check and emit no private values.

    Descriptor snapshots and ctime comparison detect ordinary concurrent
    changes. This is a local stability check, not a cryptographic filesystem
    lock against a process with stronger privileges.
    """

    result = CheckResult()
    root = _absolute_pack_root(value)
    if root is None:
        return result

    first = _descriptor_snapshot(root)
    result.checks["structure"] = first.regular_tree
    result.checks["inventory"] = _inventory_is_exact(first)
    result.checks["permissions"] = _permissions_are_private(first)
    result.checks["holdout"] = _holdout_is_empty(first)

    manifest = _load_json_object(first.files.get("manifest.json"))
    metadata = _load_json_object(first.files.get("build-metadata.json"))
    result.checks["legacy_shape"] = _legacy_shape_is_exact(manifest)

    first_hashes = _hashes_for_files(first.files) if first.regular_tree else None
    result.checks["integrity"] = _integrity_is_exact(
        first, metadata, first_hashes
    )

    errors, validator_ok = _run_current_validator(root)
    if errors is not None:
        result.validator_error_count = len(errors)
        result.validator_categories = _validator_categories(errors)
    result.checks["current_validator"] = (
        errors is not None and (not errors or validator_ok)
    )

    second = _descriptor_snapshot(root)
    result.checks["stable_snapshot"] = (
        first.regular_tree
        and second.regular_tree
        and first.files == second.files
        and first.directories == second.directories
        and first.fingerprints == second.fingerprints
        and first.ancestor_fingerprints == second.ancestor_fingerprints
    )
    return result


def _status(value: bool) -> str:
    return "pass" if value else "fail"


def render_result(result: CheckResult) -> str:
    """Render fixed-label output which cannot include pack values."""

    headline_by_status = {
        "current": "current - no upgrade needed",
        "upgrade-ready": "upgrade-ready",
        "invalid": "invalid or unsupported",
    }
    headline = headline_by_status[result.status]
    validator_summary = "unavailable"
    if result.validator_error_count is not None:
        categories = ",".join(result.validator_categories) or "none"
        if result.validator_error_count == 0:
            validator_summary = "valid; 0 error(s)"
        else:
            validator_summary = (
                f"{result.validator_error_count} error(s); categories={categories}"
            )
    legacy_shape_summary = (
        "not needed"
        if result.status == "current"
        else _status(result.checks["legacy_shape"])
    )
    lines = [
        f"Choiceprint pack-upgrade check: {headline}",
        "- mode: read-only",
        f"- filesystem structure: {_status(result.checks['structure'])}",
        f"- closed file inventory: {_status(result.checks['inventory'])}",
        f"- integrity hashes: {_status(result.checks['integrity'])}",
        f"- owner-only permissions: {_status(result.checks['permissions'])}",
        f"- empty holdout placeholder: {_status(result.checks['holdout'])}",
        f"- exact legacy coverage shape: {legacy_shape_summary}",
        f"- current validator: {validator_summary}",
        f"- stable read snapshot: {_status(result.checks['stable_snapshot'])}",
        "- files changed: none",
    ]
    if result.status == "upgrade-ready":
        lines.append("- migration actions: unavailable")
    return "\n".join(lines) + "\n"


def main(argv: Sequence[str] | None = None) -> int:
    arguments = list(sys.argv[1:] if argv is None else argv)
    if arguments in (["--help"], ["-h"]):
        print("Usage: check_choiceprint_pack_upgrade.py PACK")
        print("Read-only check for one known legacy coverage schema delta.")
        return 0
    if len(arguments) != 1:
        print(
            "Choiceprint pack-upgrade check: invalid invocation",
            file=sys.stderr,
        )
        return 2
    try:
        result = check_pack(arguments[0])
    except Exception:
        result = CheckResult()
    stream = sys.stdout if result.ok else sys.stderr
    print(render_result(result), end="", file=stream)
    return 0 if result.ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
