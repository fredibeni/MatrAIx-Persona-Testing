#!/usr/bin/env python3
"""Create and verify a private Choiceprint ChatGPT upload manifest.

The manifest detects stale or accidentally modified upload files and binds them
to one validated canonical Choiceprint build. It is an integrity check, not a
cryptographic signature or proof about what was uploaded through the ChatGPT UI.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
import re
import stat
import sys
import tempfile
from pathlib import Path
from typing import Any, Mapping, Sequence, TypeAlias


VALIDATOR_PATH = Path(__file__).with_name("validate_twin_pack.py")
UPLOAD_README_TEMPLATE = (
    Path(__file__).resolve().parents[1]
    / "templates"
    / "chatgpt-upload-readme.md"
)
MANIFEST_NAME = "UPLOAD-MANIFEST.json"
README_NAME = "UPLOAD-README.md"
MANIFEST_FIELDS = {
    "schema_version",
    "artifact_type",
    "choiceprint_build_metadata_sha256",
    "project_instructions",
    "project_sources",
    "file_sha256",
}
SHA256_PATTERN = re.compile(r"[0-9a-f]{64}")


class UploadPackageError(ValueError):
    """The private upload package is unsafe, stale, or malformed."""


def _load_validator() -> Any:
    spec = importlib.util.spec_from_file_location(
        "choiceprint_upload_validator", VALIDATOR_PATH
    )
    if spec is None or spec.loader is None:
        raise UploadPackageError(
            f"could not load Choiceprint validator from {VALIDATOR_PATH}"
        )
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    try:
        spec.loader.exec_module(module)
    except Exception:
        sys.modules.pop(spec.name, None)
        raise
    return module


VALIDATOR = _load_validator()
ADAPTER_PREFIX = "adapters/chatgpt-project/"
try:
    ADAPTER_FILES = tuple(
        path.removeprefix(ADAPTER_PREFIX)
        for path in VALIDATOR.ADAPTER_REQUIRED_PATHS
    )
except AttributeError as exc:
    raise RuntimeError(
        "Choiceprint validator does not expose its adapter allowlist"
    ) from exc
if not ADAPTER_FILES or any(
    not path.startswith(ADAPTER_PREFIX)
    or not filename
    or "/" in filename
    for path, filename in zip(
        VALIDATOR.ADAPTER_REQUIRED_PATHS, ADAPTER_FILES, strict=True
    )
):
    raise RuntimeError("Choiceprint validator adapter allowlist is malformed")
PROJECT_INSTRUCTIONS = "PROJECT-INSTRUCTIONS.md"
PROJECT_SOURCES = tuple(
    filename for filename in ADAPTER_FILES if filename != PROJECT_INSTRUCTIONS
)
if ADAPTER_FILES != (PROJECT_INSTRUCTIONS, *PROJECT_SOURCES):
    raise RuntimeError(
        "Choiceprint validator adapter allowlist must start with project instructions"
    )
HASHED_PACKAGE_FILES = (*ADAPTER_FILES, README_NAME)
FileFingerprint: TypeAlias = tuple[
    str,
    int,
    int,
    int,
    int,
    int,
    int,
    int,
    int,
    int,
    int,
    tuple[tuple[str, str], ...],
    str,
]
DirectoryFingerprint: TypeAlias = tuple[
    str,
    int,
    int,
    int,
    int,
    int,
    int,
    int,
    int,
    int,
    tuple[tuple[str, str], ...],
]
TreeSnapshot: TypeAlias = dict[
    str, FileFingerprint | DirectoryFingerprint
]
DARWIN_ASYNC_XATTRS = frozenset({"com.apple.provenance"})
# macOS may set the private UF_TRACKED bit asynchronously with provenance.
# Python's stat module does not currently expose a named constant for it.
DARWIN_ASYNC_FLAG_MASK = 0x40


def _reject_constant(value: str) -> None:
    raise UploadPackageError(f"non-finite JSON constant is not allowed: {value}")


def _unique_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise UploadPackageError(f"duplicate JSON key is not allowed: {key}")
        result[key] = value
    return result


def _load_json(path: Path) -> dict[str, Any]:
    try:
        with path.open("r", encoding="utf-8") as handle:
            value = json.load(
                handle,
                object_pairs_hook=_unique_object,
                parse_constant=_reject_constant,
            )
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise UploadPackageError(f"invalid UTF-8 JSON in {path}: {exc}") from exc
    if not isinstance(value, dict):
        raise UploadPackageError(f"JSON document must be an object: {path}")
    return value


def _reject_symlink_chain(path: Path) -> None:
    current = Path(os.path.abspath(path.expanduser()))
    while True:
        if (current.exists() or current.is_symlink()) and current.is_symlink():
            raise UploadPackageError(
                f"symlinked upload path is not allowed: {current}"
            )
        if current == current.parent:
            break
        current = current.parent


def _mode(path: Path) -> int:
    return stat.S_IMODE(path.stat().st_mode)


def _private_directory(path: Path, label: str) -> Path:
    expanded = Path(os.path.abspath(path.expanduser()))
    _reject_symlink_chain(expanded)
    resolved = expanded.resolve()
    if not resolved.is_dir():
        raise UploadPackageError(f"{label} must be a regular directory: {path}")
    if os.name != "nt" and _mode(resolved) != 0o700:
        raise UploadPackageError(
            f"{label} must have mode 0700: {resolved} "
            f"(mode {_mode(resolved):04o})"
        )
    return resolved


def _private_file(path: Path, label: str) -> Path:
    expanded = Path(os.path.abspath(path.expanduser()))
    _reject_symlink_chain(expanded)
    resolved = expanded.resolve()
    metadata = resolved.lstat()
    if not stat.S_ISREG(metadata.st_mode):
        raise UploadPackageError(f"{label} must be a regular file: {path}")
    if metadata.st_nlink != 1:
        raise UploadPackageError(
            f"{label} must not be hard-linked: {resolved} "
            f"(link count {metadata.st_nlink})"
        )
    permissions = stat.S_IMODE(metadata.st_mode)
    if os.name != "nt" and permissions != 0o600:
        raise UploadPackageError(
            f"{label} must have mode 0600: {resolved} "
            f"(mode {permissions:04o})"
        )
    return resolved


def _regular_file(path: Path, label: str) -> Path:
    expanded = Path(os.path.abspath(path.expanduser()))
    _reject_symlink_chain(expanded)
    resolved = expanded.resolve()
    if not resolved.is_file():
        raise UploadPackageError(f"{label} must be a regular file: {path}")
    return resolved


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _xattr_fingerprint(path: Path, label: str) -> tuple[tuple[str, str], ...]:
    if sys.platform != "darwin" or not hasattr(os, "listxattr"):
        return ()
    try:
        names = sorted(os.listxattr(path))
        return tuple(
            (name, hashlib.sha256(os.getxattr(path, name)).hexdigest())
            for name in names
        )
    except OSError as exc:
        raise UploadPackageError(
            f"could not inspect {label} extended attributes: {exc}"
        ) from exc


def _capture_private_tree(root: Path, label: str) -> TreeSnapshot:
    snapshot: TreeSnapshot = {}
    for path in (root, *sorted(root.rglob("*"))):
        relative = "." if path == root else path.relative_to(root).as_posix()
        try:
            metadata = path.lstat()
        except OSError as exc:
            raise UploadPackageError(
                f"could not inspect {label} path {relative}: {exc}"
            ) from exc
        permissions = stat.S_IMODE(metadata.st_mode)
        if stat.S_ISLNK(metadata.st_mode):
            raise UploadPackageError(
                f"symlinked {label} path is not allowed: {relative}"
            )
        if stat.S_ISDIR(metadata.st_mode):
            if os.name != "nt" and permissions != 0o700:
                raise UploadPackageError(
                    f"{label} directory must have mode 0700: {relative} "
                    f"(mode {permissions:04o})"
                )
            snapshot[relative] = (
                "directory",
                metadata.st_dev,
                metadata.st_ino,
                permissions,
                metadata.st_nlink,
                metadata.st_uid,
                metadata.st_gid,
                getattr(metadata, "st_flags", 0),
                metadata.st_mtime_ns,
                metadata.st_ctime_ns,
                _xattr_fingerprint(path, f"{label} path {relative}"),
            )
            continue
        if not stat.S_ISREG(metadata.st_mode):
            raise UploadPackageError(
                f"special {label} path is not allowed: {relative}"
            )
        if metadata.st_nlink != 1:
            raise UploadPackageError(
                f"{label} file must not be hard-linked: {relative} "
                f"(link count {metadata.st_nlink})"
            )
        if os.name != "nt" and permissions != 0o600:
            raise UploadPackageError(
                f"{label} file must have mode 0600: {relative} "
                f"(mode {permissions:04o})"
            )
        snapshot[relative] = (
            "file",
            metadata.st_dev,
            metadata.st_ino,
            permissions,
            metadata.st_nlink,
            metadata.st_uid,
            metadata.st_gid,
            getattr(metadata, "st_flags", 0),
            metadata.st_size,
            metadata.st_mtime_ns,
            metadata.st_ctime_ns,
            _xattr_fingerprint(path, f"{label} path {relative}"),
            _sha256_file(path),
        )
    return snapshot


def _without_darwin_provenance(
    fingerprint: FileFingerprint | DirectoryFingerprint,
) -> tuple[Any, ...]:
    values = list(fingerprint)
    if fingerprint[0] == "file":
        ctime_index = 10
        xattr_index = 11
    else:
        ctime_index = 9
        xattr_index = 10
    values[7] &= ~DARWIN_ASYNC_FLAG_MASK
    values[ctime_index] = 0
    values[xattr_index] = tuple(
        item
        for item in values[xattr_index]
        if item[0] not in DARWIN_ASYNC_XATTRS
    )
    return tuple(values)


def _is_only_darwin_async_metadata_change(
    expected: TreeSnapshot,
    current: TreeSnapshot,
) -> bool:
    if sys.platform != "darwin" or current.keys() != expected.keys():
        return False
    return all(
        _without_darwin_provenance(expected[relative])
        == _without_darwin_provenance(current[relative])
        for relative in expected
    )


def _assert_tree_unchanged(
    root: Path, expected: TreeSnapshot, label: str
) -> None:
    current = _capture_private_tree(root, label)
    if current != expected and not _is_only_darwin_async_metadata_change(
        expected, current
    ):
        raise UploadPackageError(f"{label} changed during verification")


def _snapshot_hash(snapshot: TreeSnapshot, relative_path: str) -> str:
    fingerprint = snapshot.get(relative_path)
    if fingerprint is None or fingerprint[0] != "file":
        raise UploadPackageError(
            f"validated Choiceprint snapshot is missing {relative_path}"
        )
    return fingerprint[-1]


def _is_relative_to(path: Path, parent: Path) -> bool:
    try:
        path.relative_to(parent)
        return True
    except ValueError:
        return False


def _assert_separate_trees(package: Path, choiceprint: Path) -> None:
    if _is_relative_to(package, choiceprint) or _is_relative_to(
        choiceprint, package
    ):
        raise UploadPackageError(
            "upload package and canonical Choiceprint pack must be separate"
        )


def _validated_source_adapter(
    choiceprint_path: Path,
) -> tuple[Path, str, dict[str, str], TreeSnapshot]:
    choiceprint = _private_directory(
        choiceprint_path, "canonical Choiceprint pack"
    )
    before = _capture_private_tree(choiceprint, "canonical Choiceprint pack")
    result = VALIDATOR.validate_bundle(choiceprint)
    if not result.ok:
        raise UploadPackageError(
            "Choiceprint validation failed before upload verification:\n- "
            + "\n- ".join(result.errors)
        )
    after = _capture_private_tree(choiceprint, "canonical Choiceprint pack")
    if after != before:
        raise UploadPackageError(
            "canonical Choiceprint pack changed during validation"
        )
    build_hash = _snapshot_hash(after, "build-metadata.json")
    adapter_hashes = {
        filename: _snapshot_hash(
            after, f"{ADAPTER_PREFIX}{filename}"
        )
        for filename in ADAPTER_FILES
    }
    return choiceprint, build_hash, adapter_hashes, after


def _assert_validated_source_unchanged(
    choiceprint: Path, snapshot: TreeSnapshot
) -> None:
    _assert_tree_unchanged(
        choiceprint,
        snapshot,
        "canonical Choiceprint pack",
    )


def _compare_readme(package: Path) -> None:
    template = _regular_file(
        UPLOAD_README_TEMPLATE, "tracked ChatGPT upload README template"
    )
    if _sha256_file(package / README_NAME) != _sha256_file(template):
        raise UploadPackageError(
            "upload package README does not match the tracked setup instructions"
        )


def _package_file_set(package: Path, *, include_manifest: bool) -> set[str]:
    expected = set(HASHED_PACKAGE_FILES)
    if include_manifest:
        expected.add(MANIFEST_NAME)
    actual = {path.name for path in package.iterdir()}
    if actual != expected:
        missing = sorted(expected - actual)
        extra = sorted(actual - expected)
        details: list[str] = []
        if missing:
            details.append("missing: " + ", ".join(missing))
        if extra:
            details.append("unexpected: " + ", ".join(extra))
        raise UploadPackageError(
            "upload package file set is invalid"
            + (" (" + "; ".join(details) + ")" if details else "")
        )
    for filename in expected:
        _private_file(package / filename, f"upload package file {filename}")
    return expected


def _expected_manifest(package: Path, build_hash: str) -> dict[str, Any]:
    return {
        "schema_version": 1,
        "artifact_type": "choiceprint_chatgpt_upload_manifest",
        "choiceprint_build_metadata_sha256": build_hash,
        "project_instructions": PROJECT_INSTRUCTIONS,
        "project_sources": list(PROJECT_SOURCES),
        "file_sha256": {
            filename: _sha256_file(package / filename)
            for filename in HASHED_PACKAGE_FILES
        },
    }


def _validate_manifest(
    document: Mapping[str, Any],
    *,
    package: Path,
    build_hash: str,
) -> dict[str, Any]:
    if set(document) != MANIFEST_FIELDS:
        raise UploadPackageError("upload manifest fields do not match the schema")
    if type(document.get("schema_version")) is not int or document.get(
        "schema_version"
    ) != 1:
        raise UploadPackageError("upload manifest schema_version is invalid")
    if document.get("artifact_type") != "choiceprint_chatgpt_upload_manifest":
        raise UploadPackageError("upload manifest artifact_type is invalid")
    recorded_build_hash = document.get("choiceprint_build_metadata_sha256")
    if (
        not isinstance(recorded_build_hash, str)
        or not SHA256_PATTERN.fullmatch(recorded_build_hash)
        or recorded_build_hash != build_hash
    ):
        raise UploadPackageError(
            "upload manifest does not match the current Choiceprint build"
        )
    if document.get("project_instructions") != PROJECT_INSTRUCTIONS:
        raise UploadPackageError(
            "upload manifest project instructions file is invalid"
        )
    if document.get("project_sources") != list(PROJECT_SOURCES):
        raise UploadPackageError("upload manifest project source list is invalid")
    hashes = document.get("file_sha256")
    if not isinstance(hashes, dict) or set(hashes) != set(HASHED_PACKAGE_FILES):
        raise UploadPackageError("upload manifest file hash list is invalid")
    for filename in HASHED_PACKAGE_FILES:
        recorded_hash = hashes.get(filename)
        if (
            not isinstance(recorded_hash, str)
            or not SHA256_PATTERN.fullmatch(recorded_hash)
            or recorded_hash != _sha256_file(package / filename)
        ):
            raise UploadPackageError(
                f"upload package file changed after packaging: {filename}"
            )
    return dict(document)


def _compare_adapter(package: Path, expected_hashes: Mapping[str, str]) -> None:
    for filename in ADAPTER_FILES:
        if _sha256_file(package / filename) != expected_hashes[filename]:
            raise UploadPackageError(
                "upload package does not match the validated Choiceprint adapter: "
                + filename
            )


def _atomic_write_json(path: Path, value: Mapping[str, Any]) -> None:
    _reject_symlink_chain(path)
    if path.exists() or path.is_symlink():
        raise UploadPackageError(f"refusing to overwrite upload manifest: {path}")
    descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{path.name}.tmp-", dir=path.parent
    )
    temporary = Path(temporary_name)
    try:
        os.fchmod(descriptor, 0o600)
        payload = (
            json.dumps(
                value,
                ensure_ascii=False,
                indent=2,
                sort_keys=True,
                allow_nan=False,
            )
            + "\n"
        )
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            descriptor = -1
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
        _reject_symlink_chain(path)
        try:
            os.link(temporary, path, follow_symlinks=False)
        except FileExistsError as exc:
            raise UploadPackageError(
                f"refusing to overwrite upload manifest: {path}"
            ) from exc
        try:
            directory_descriptor = os.open(
                path.parent,
                os.O_RDONLY | getattr(os, "O_DIRECTORY", 0),
            )
            try:
                os.fsync(directory_descriptor)
            finally:
                os.close(directory_descriptor)
        except OSError:
            pass
    finally:
        if descriptor >= 0:
            os.close(descriptor)
        try:
            temporary.unlink()
        except FileNotFoundError:
            pass


def create_manifest(
    *, package_path: Path, choiceprint_path: Path
) -> dict[str, Any]:
    """Bind a new adapter-only upload directory to a validated Twin Pack."""

    package = _private_directory(package_path, "ChatGPT upload package")
    choiceprint, build_hash, adapter_hashes, source_snapshot = (
        _validated_source_adapter(choiceprint_path)
    )
    _assert_separate_trees(package, choiceprint)
    manifest_path = package / MANIFEST_NAME
    if manifest_path.exists() or manifest_path.is_symlink():
        raise UploadPackageError(
            f"refusing to overwrite upload manifest: {manifest_path}"
        )
    _package_file_set(package, include_manifest=False)
    _compare_adapter(package, adapter_hashes)
    _compare_readme(package)
    _assert_validated_source_unchanged(choiceprint, source_snapshot)
    manifest = _expected_manifest(package, build_hash)
    _atomic_write_json(manifest_path, manifest)
    try:
        return verify_package(
            package_path=package, choiceprint_path=choiceprint
        )
    except BaseException:
        try:
            if (
                manifest_path.is_file()
                and not manifest_path.is_symlink()
                and _load_json(manifest_path) == manifest
            ):
                manifest_path.unlink()
        except (OSError, UploadPackageError):
            pass
        raise


def verify_package(
    *, package_path: Path, choiceprint_path: Path
) -> dict[str, Any]:
    """Verify every upload file against its manifest and canonical source."""

    package = _private_directory(package_path, "ChatGPT upload package")
    choiceprint, build_hash, adapter_hashes, source_snapshot = (
        _validated_source_adapter(choiceprint_path)
    )
    _assert_separate_trees(package, choiceprint)
    package_snapshot = _capture_private_tree(
        package, "ChatGPT upload package"
    )
    _package_file_set(package, include_manifest=True)
    manifest = _validate_manifest(
        _load_json(package / MANIFEST_NAME),
        package=package,
        build_hash=build_hash,
    )
    _compare_adapter(package, adapter_hashes)
    _compare_readme(package)
    _assert_validated_source_unchanged(choiceprint, source_snapshot)
    _assert_tree_unchanged(
        package, package_snapshot, "ChatGPT upload package"
    )
    return manifest


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Create or verify a private Choiceprint ChatGPT upload manifest."
        )
    )
    subparsers = parser.add_subparsers(dest="command", required=True)
    subparsers.add_parser(
        "list-files",
        help="Print the canonical validator's adapter file allowlist.",
    )
    for command, help_text in (
        ("create", "Create a no-clobber manifest, then verify the package."),
        ("verify", "Verify the package against its manifest and source pack."),
    ):
        subparser = subparsers.add_parser(command, help=help_text)
        subparser.add_argument("--package", type=Path, required=True)
        subparser.add_argument("--pack", type=Path, required=True)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _build_parser().parse_args(argv)
    if args.command == "list-files":
        print("\n".join(ADAPTER_FILES))
        return 0
    try:
        if args.command == "create":
            create_manifest(
                package_path=args.package, choiceprint_path=args.pack
            )
            print(f"Created and verified private upload manifest: {args.package}")
        else:
            verify_package(
                package_path=args.package, choiceprint_path=args.pack
            )
            print(f"Choiceprint ChatGPT upload package verified: {args.package}")
    except (UploadPackageError, OSError) as exc:
        print(f"Choiceprint upload verification failed: {exc}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
