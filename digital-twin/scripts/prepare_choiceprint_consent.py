#!/usr/bin/env python3
"""Prepare a new owner-authorized Choiceprint curation file locally.

The preparer reads one private, unauthorized curation YAML file, presents every
declared source and each supported local mode for explicit owner review, and
writes a new mode 0600 YAML file only after an exact final confirmation. It
does not invoke a model, access a network service, edit its input, or replace an
existing output.
"""

from __future__ import annotations

import argparse
import copy
import math
import os
import re
import stat
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Mapping, Sequence

import yaml


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
PRIVATE_CURATION_ROOT = (
    REPOSITORY_ROOT / "matraix/personal-persona/source-material"
)
SUPPORTED_MODE_USES = (
    ("predict-choice", "predict likely choices"),
    ("write-in-style", "draft in documented communication style"),
)
SENSITIVITY_VALUES = frozenset({"public", "private", "sensitive"})
FINAL_CONFIRMATION_PHRASE = "AUTHORIZE CHOICEPRINT CONSENT"
MAX_CURATION_BYTES = 4 * 1024 * 1024
SOURCE_ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")
PUBLIC_DIRECTORY_NAMES = frozenset({"public", "public_html", "www"})
PLACEHOLDER_SUMMARIES = frozenset(
    {
        "a concise owner-reviewed summary can go here",
        "a blank local persona ready to be filled from user-authorized evidence",
        "no reviewed profile summary is available",
    }
)
PLACEHOLDER_TEXT = re.compile(
    r"(?:\b(?:todo|tbd|placeholder|lorem\s+ipsum)\b|"
    r"\b(?:replace|insert|add)\b.{0,80}\b(?:here|this|me)\b|"
    r"\byour\b.{0,80}\bhere\b|\bcan\s+go\s+here\b)",
    re.IGNORECASE,
)


class ConsentPreparationError(ValueError):
    """The requested authorization artifact is invalid or unsafe."""


class ConsentPreparationCancelled(Exception):
    """The owner cancelled before a new curation file was published."""


class _StrictSafeLoader(yaml.SafeLoader):
    """Safe YAML loader that also rejects duplicate mapping keys."""


def _construct_unique_mapping(
    loader: _StrictSafeLoader,
    node: yaml.nodes.MappingNode,
    deep: bool = False,
) -> dict[Any, Any]:
    loader.flatten_mapping(node)
    mapping: dict[Any, Any] = {}
    for key_node, value_node in node.value:
        key = loader.construct_object(key_node, deep=deep)
        try:
            duplicate = key in mapping
        except TypeError as exc:
            raise yaml.constructor.ConstructorError(
                None,
                None,
                "YAML mapping keys must be scalar values",
                key_node.start_mark,
            ) from exc
        if duplicate:
            raise yaml.constructor.ConstructorError(
                None,
                None,
                f"duplicate YAML mapping key: {key!r}",
                key_node.start_mark,
            )
        mapping[key] = loader.construct_object(value_node, deep=deep)
    return mapping


_StrictSafeLoader.add_constructor(
    yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG,
    _construct_unique_mapping,
)


def _is_relative_to(path: Path, parent: Path) -> bool:
    try:
        path.relative_to(parent)
        return True
    except ValueError:
        return False


def _absolute_lexical_path(path: Path | str) -> Path:
    return Path(os.path.abspath(str(Path(path).expanduser())))


def _reject_symlink_chain(path: Path) -> None:
    current = path
    while True:
        if current.is_symlink():
            raise ConsentPreparationError(
                f"symlinked private path is not allowed: {current}"
            )
        if current == current.parent:
            break
        current = current.parent


def _repository_root_for(path: Path) -> Path | None:
    current = path if path.is_dir() else path.parent
    while not current.exists() and current != current.parent:
        current = current.parent
    while True:
        marker = current / ".git"
        if marker.exists() or marker.is_symlink():
            return current.resolve()
        if current == current.parent:
            return None
        current = current.parent


def _assert_private_location(
    path: Path | str,
    *,
    label: str,
    may_not_exist: bool,
) -> Path:
    lexical = _absolute_lexical_path(path)
    _reject_symlink_chain(lexical)
    if not may_not_exist and not lexical.exists():
        raise ConsentPreparationError(f"{label} does not exist: {lexical}")
    resolved = lexical.resolve(strict=not may_not_exist)
    if any(part.casefold() in PUBLIC_DIRECTORY_NAMES for part in resolved.parts):
        raise ConsentPreparationError(
            f"{label} must not use a public directory: {resolved}"
        )
    if any(part.casefold().endswith(".choiceprint") for part in resolved.parts):
        raise ConsentPreparationError(
            f"{label} must stay outside every Choiceprint pack: {resolved}"
        )

    repository_root = _repository_root_for(resolved)
    allowed_private_root = PRIVATE_CURATION_ROOT.resolve()
    if repository_root is not None and not _is_relative_to(
        resolved, allowed_private_root
    ):
        raise ConsentPreparationError(
            f"{label} must be outside tracked source control or under the "
            f"ignored private curation directory {allowed_private_root}"
        )
    return resolved


def _assert_acyclic_finite(
    value: Any,
    *,
    context: str,
    ancestors: set[int] | None = None,
) -> None:
    if isinstance(value, float) and not math.isfinite(value):
        raise ConsentPreparationError(f"{context} contains a non-finite number")
    if not isinstance(value, (dict, list)):
        return
    active = set() if ancestors is None else set(ancestors)
    identity = id(value)
    if identity in active:
        raise ConsentPreparationError(f"{context} contains a recursive YAML alias")
    active.add(identity)
    children = value.values() if isinstance(value, dict) else value
    for child in children:
        _assert_acyclic_finite(child, context=context, ancestors=active)


def _read_private_bytes(path: Path, *, label: str) -> bytes:
    _reject_symlink_chain(path)
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
    try:
        descriptor = os.open(path, flags)
    except OSError as exc:
        raise ConsentPreparationError(f"cannot open {label} {path}: {exc}") from exc
    try:
        details = os.fstat(descriptor)
        if not stat.S_ISREG(details.st_mode):
            raise ConsentPreparationError(f"{label} must be a regular file: {path}")
        if os.name != "nt" and stat.S_IMODE(details.st_mode) & 0o077:
            raise ConsentPreparationError(
                f"{label} must not be accessible by group or other users: {path} "
                f"(mode {stat.S_IMODE(details.st_mode):04o})"
            )
        if details.st_size > MAX_CURATION_BYTES:
            raise ConsentPreparationError(
                f"{label} exceeds the {MAX_CURATION_BYTES}-byte local safety limit"
            )
        chunks: list[bytes] = []
        total = 0
        while True:
            chunk = os.read(descriptor, 64 * 1024)
            if not chunk:
                break
            total += len(chunk)
            if total > MAX_CURATION_BYTES:
                raise ConsentPreparationError(
                    f"{label} exceeds the {MAX_CURATION_BYTES}-byte local safety limit"
                )
            chunks.append(chunk)
        return b"".join(chunks)
    finally:
        os.close(descriptor)


def _load_yaml_bytes(raw: bytes, *, path: Path) -> dict[str, Any]:
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise ConsentPreparationError(
            f"curation YAML must use UTF-8: {path}"
        ) from exc
    try:
        value = yaml.load(text, Loader=_StrictSafeLoader)
    except yaml.YAMLError as exc:
        raise ConsentPreparationError(
            f"cannot parse strict safe YAML from {path}: {exc}"
        ) from exc
    if not isinstance(value, dict):
        raise ConsentPreparationError(
            f"curation YAML must contain one top-level mapping: {path}"
        )
    if any(not isinstance(key, str) for key in value):
        raise ConsentPreparationError(
            "curation YAML top-level mapping keys must be strings"
        )
    _assert_acyclic_finite(value, context=str(path))
    return value


def _normalized_text(value: str) -> str:
    return " ".join(value.split()).strip().casefold().rstrip(".")


def _placeholder_path(value: Any, path: str = "profile") -> str | None:
    if isinstance(value, dict):
        for key, child in value.items():
            found = _placeholder_path(child, f"{path}.{key}")
            if found is not None:
                return found
    elif isinstance(value, list):
        for index, child in enumerate(value, start=1):
            found = _placeholder_path(child, f"{path}[{index}]")
            if found is not None:
                return found
    elif isinstance(value, str):
        normalized = _normalized_text(value)
        if normalized in PLACEHOLDER_SUMMARIES or PLACEHOLDER_TEXT.search(value):
            return path
    return None


def _nonempty_display_string(value: Any, *, label: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ConsentPreparationError(f"{label} must be a non-empty string")
    if any(ord(character) < 32 and character not in "\t\n\r" for character in value):
        raise ConsentPreparationError(f"{label} contains a terminal control character")
    return " ".join(value.split())


def _exact_nonempty_string(value: Any, *, label: str) -> str:
    rendered = _nonempty_display_string(value, label=label)
    if rendered != value:
        raise ConsentPreparationError(
            f"{label} must not contain leading, trailing, or repeated whitespace"
        )
    return rendered


def _string_list(value: Any, *, label: str) -> list[str]:
    if not isinstance(value, list):
        raise ConsentPreparationError(f"{label} must be a list")
    result: list[str] = []
    for index, item in enumerate(value, start=1):
        result.append(
            _nonempty_display_string(item, label=f"{label} item {index}")
        )
    return result


def _validate_curation(document: Mapping[str, Any]) -> list[dict[str, str]]:
    profile = document.get("profile")
    if not isinstance(profile, dict):
        raise ConsentPreparationError("curation field 'profile' must be a mapping")
    _nonempty_display_string(
        profile.get("summary"), label="curation field 'profile.summary'"
    )
    placeholder = _placeholder_path(profile)
    if placeholder is not None:
        raise ConsentPreparationError(
            f"refusing placeholder profile content at {placeholder}"
        )

    raw_sources = document.get("sources")
    if not isinstance(raw_sources, list) or not raw_sources:
        raise ConsentPreparationError(
            "curation field 'sources' must declare at least one source"
        )
    sources: list[dict[str, str]] = []
    seen_source_ids: set[str] = set()
    for index, source in enumerate(raw_sources, start=1):
        if not isinstance(source, dict):
            raise ConsentPreparationError(
                f"curation source {index} must be a mapping"
            )
        source_id = _exact_nonempty_string(
            source.get("id"), label=f"curation source {index} id"
        )
        if not SOURCE_ID_PATTERN.fullmatch(source_id):
            raise ConsentPreparationError(
                f"curation source {index} id must use 1-128 ASCII letters, "
                "digits, dots, underscores, colons, or hyphens"
            )
        if source_id in seen_source_ids:
            raise ConsentPreparationError(f"duplicate source id: {source_id}")
        seen_source_ids.add(source_id)
        summary = _nonempty_display_string(
            source.get("summary"), label=f"curation source {source_id} summary"
        )
        sensitivity = _exact_nonempty_string(
            source.get("sensitivity"),
            label=f"curation source {source_id} sensitivity",
        )
        if sensitivity not in SENSITIVITY_VALUES:
            raise ConsentPreparationError(
                f"curation source {source_id} sensitivity must be public, "
                "private, or sensitive"
            )
        sources.append(
            {
                "id": source_id,
                "summary": summary,
                "sensitivity": sensitivity,
            }
        )

    consent = document.get("consent")
    if not isinstance(consent, dict):
        raise ConsentPreparationError("curation field 'consent' must be a mapping")
    owner_authorized = consent.get("owner_authorized")
    if owner_authorized is True:
        raise ConsentPreparationError(
            "refusing already-authorized curation input"
        )
    if owner_authorized is not False:
        raise ConsentPreparationError(
            "consent.owner_authorized must be explicitly false"
        )
    if "authorized_at" not in consent or consent.get("authorized_at") is not None:
        raise ConsentPreparationError(
            "consent.authorized_at must be explicitly null before authorization"
        )
    _string_list(
        consent.get("prohibited_uses"), label="consent.prohibited_uses"
    )

    boundaries = document.get("boundaries")
    if not isinstance(boundaries, dict):
        raise ConsentPreparationError("curation field 'boundaries' must be a mapping")
    for field in ("allowed", "ask_before", "never"):
        if field in boundaries:
            _string_list(
                boundaries[field], label=f"boundaries.{field}"
            )
    return sources


def _input_snapshot(path: Path) -> tuple[bytes, dict[str, Any], list[dict[str, str]]]:
    raw = _read_private_bytes(path, label="private curation input")
    document = _load_yaml_bytes(raw, path=path)
    sources = _validate_curation(document)
    return raw, document, sources


def _candidate_output(path: Path | str) -> Path:
    output = _assert_private_location(
        path, label="private curation output", may_not_exist=True
    )
    if output.suffix.casefold() not in {".yaml", ".yml"}:
        raise ConsentPreparationError(
            "private curation output must be a narrowly named YAML file"
        )
    if output.name in {"", ".", "..", ".yaml", ".yml"}:
        raise ConsentPreparationError(
            "private curation output must be a narrowly named YAML file"
        )
    if output.exists() or output.is_symlink():
        raise ConsentPreparationError(
            f"refusing to overwrite existing curation output: {output}"
        )
    return output


def _prepare_private_parent(path: Path) -> None:
    missing: list[Path] = []
    current = path
    while not current.exists() and not current.is_symlink():
        missing.append(current)
        current = current.parent
    _reject_symlink_chain(current)
    if not current.is_dir():
        raise ConsentPreparationError(
            f"curation output parent is not a directory: {current}"
        )
    for directory in reversed(missing):
        try:
            os.mkdir(directory, 0o700)
        except FileExistsError:
            pass
        _reject_symlink_chain(directory)
        if not directory.is_dir():
            raise ConsentPreparationError(
                f"curation output parent is not a directory: {directory}"
            )


def _serialize_yaml(value: Mapping[str, Any]) -> bytes:
    try:
        payload = yaml.safe_dump(
            dict(value),
            sort_keys=False,
            allow_unicode=True,
            width=100,
        )
    except yaml.YAMLError as exc:
        raise ConsentPreparationError(
            f"cannot serialize authorized curation YAML: {exc}"
        ) from exc
    return payload.encode("utf-8")


def _atomic_write_yaml(
    path: Path,
    value: Mapping[str, Any],
    *,
    before_publish: Callable[[], None],
) -> None:
    payload = _serialize_yaml(value)
    _reject_symlink_chain(path)
    if path.exists() or path.is_symlink():
        raise ConsentPreparationError(
            f"refusing to overwrite existing curation output: {path}"
        )
    descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{path.name}.tmp-", dir=path.parent
    )
    temporary = Path(temporary_name)
    try:
        os.fchmod(descriptor, 0o600)
        with os.fdopen(descriptor, "wb") as handle:
            descriptor = -1
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
        before_publish()
        _reject_symlink_chain(path)
        try:
            os.link(temporary, path, follow_symlinks=False)
        except FileExistsError as exc:
            raise ConsentPreparationError(
                f"refusing to overwrite existing curation output: {path}"
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


def _ask_yes_no(
    prompt: str,
    *,
    input_fn: Callable[[str], str],
    output_fn: Callable[[str], Any],
) -> bool:
    while True:
        response = input_fn(f"{prompt} - type yes, no, or cancel: ")
        answer = response.strip().casefold()
        if answer == "yes":
            return True
        if answer == "no":
            return False
        if answer == "cancel":
            raise ConsentPreparationCancelled
        output_fn("Enter yes, no, or cancel.")


def _confirmation(
    *,
    input_fn: Callable[[str], str],
) -> None:
    response = input_fn(
        f"Type exactly '{FINAL_CONFIRMATION_PHRASE}' to create the new file, "
        "or type cancel: "
    )
    if response == "cancel":
        raise ConsentPreparationCancelled
    if response != FINAL_CONFIRMATION_PHRASE:
        raise ConsentPreparationCancelled(
            "the final confirmation phrase did not match exactly"
        )


def _utc_timestamp(now_fn: Callable[[], datetime]) -> str:
    value = now_fn()
    if value.tzinfo is None or value.utcoffset() is None:
        raise ConsentPreparationError(
            "authorization timestamp must include a timezone"
        )
    return (
        value.astimezone(timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z")
    )


def prepare_consent(
    curation_path: Path | str,
    output_path: Path | str,
    *,
    input_fn: Callable[[str], str] = input,
    output_fn: Callable[[str], Any] = print,
    now_fn: Callable[[], datetime] | None = None,
) -> dict[str, Any]:
    """Collect owner consent and publish one new private curation YAML file."""

    curation = _assert_private_location(
        curation_path, label="private curation input", may_not_exist=False
    )
    output = _candidate_output(output_path)
    if curation == output:
        raise ConsentPreparationError(
            "private curation input and output must be different paths"
        )
    original_bytes, original_document, sources = _input_snapshot(curation)

    output_fn("Choiceprint local owner consent review")
    output_fn("No model or network service is used.")
    output_fn("The input file will not be edited.")

    allowed_sources: list[str] = []
    for index, source in enumerate(sources, start=1):
        output_fn("")
        output_fn(f"Source {index} of {len(sources)}: {source['id']}")
        output_fn(f"Summary: {source['summary']}")
        output_fn(f"Sensitivity: {source['sensitivity']}")
        if _ask_yes_no(
            f"Authorize source '{source['id']}'",
            input_fn=input_fn,
            output_fn=output_fn,
        ):
            allowed_sources.append(source["id"])

    allowed_modes: list[str] = []
    allowed_uses: list[str] = []
    output_fn("")
    output_fn("Supported modes")
    for mode, use in SUPPORTED_MODE_USES:
        output_fn(f"Mode: {mode}")
        output_fn(f"Exact allowed use: {use}")
        if _ask_yes_no(
            f"Authorize mode '{mode}'",
            input_fn=input_fn,
            output_fn=output_fn,
        ):
            allowed_modes.append(mode)
            allowed_uses.append(use)

    if not allowed_sources:
        raise ConsentPreparationError(
            "at least one declared source must be explicitly authorized"
        )
    if not allowed_modes:
        raise ConsentPreparationError(
            "at least one supported mode must be explicitly authorized"
        )
    prohibited_uses = {
        _normalized_text(item)
        for item in original_document["consent"]["prohibited_uses"]
    }
    overlap = {
        use for use in allowed_uses if _normalized_text(use) in prohibited_uses
    }
    if overlap:
        raise ConsentPreparationError(
            "selected allowed uses conflict with preserved prohibited uses: "
            + ", ".join(sorted(overlap))
        )

    output_fn("")
    output_fn("Authorization summary")
    output_fn("Sources: " + ", ".join(allowed_sources))
    output_fn("Modes: " + ", ".join(allowed_modes))
    for use in allowed_uses:
        output_fn(f"Allowed use: {use}")
    output_fn("Existing prohibited uses and boundaries will be preserved.")
    _confirmation(input_fn=input_fn)

    current_bytes, current_document, _ = _input_snapshot(curation)
    if current_bytes != original_bytes or current_document != original_document:
        raise ConsentPreparationError(
            "private curation input changed during consent review"
        )

    authorized = copy.deepcopy(original_document)
    consent = authorized["consent"]
    consent["owner_authorized"] = True
    consent["authorized_at"] = _utc_timestamp(
        now_fn or (lambda: datetime.now(timezone.utc))
    )
    consent["allowed_sources"] = allowed_sources
    consent["allowed_modes"] = allowed_modes
    consent["allowed_uses"] = allowed_uses

    if consent.get("prohibited_uses") != original_document["consent"].get(
        "prohibited_uses"
    ):
        raise ConsentPreparationError("prohibited uses changed unexpectedly")
    if authorized.get("boundaries") != original_document.get("boundaries"):
        raise ConsentPreparationError("boundaries changed unexpectedly")

    def before_publish() -> None:
        candidate = _candidate_output(output)
        if candidate != output:
            raise ConsentPreparationError("curation output path changed unexpectedly")
        latest_bytes, latest_document, _ = _input_snapshot(curation)
        if latest_bytes != original_bytes or latest_document != original_document:
            raise ConsentPreparationError(
                "private curation input changed during consent review"
            )

    _prepare_private_parent(output.parent)
    output = _candidate_output(output)
    _atomic_write_yaml(output, authorized, before_publish=before_publish)
    output_fn(f"Saved authorized private curation to {output}")
    return authorized


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--curation", required=True, type=Path, help="private unauthorized YAML"
    )
    parser.add_argument(
        "--output", required=True, type=Path, help="new private authorized YAML"
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        prepare_consent(args.curation, args.output)
    except ConsentPreparationCancelled as exc:
        detail = f": {exc}" if str(exc) else ""
        print(
            f"\nOwner consent cancelled{detail}; no output was written.",
            file=sys.stderr,
        )
        return 130
    except (EOFError, KeyboardInterrupt):
        print(
            "\nOwner consent cancelled; no output was written.",
            file=sys.stderr,
        )
        return 130
    except (ConsentPreparationError, OSError) as exc:
        print(f"Consent preparation failed: {exc}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
