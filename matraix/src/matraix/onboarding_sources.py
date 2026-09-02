"""Collect explicitly authorized local sources for persona onboarding.

This module performs deterministic, local parsing only. It does not prompt the
user, call Codex, or write persona data. Callers must obtain consent before
passing any source path.
"""

from __future__ import annotations

import json
import math
import os
import re
import stat
import zipfile
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from typing import Any, BinaryIO, Iterable, Iterator


MAX_ARCHIVE_BYTES = 1024 * 1024 * 1024
MAX_JSON_BYTES = 256 * 1024 * 1024
MAX_ZIP_MEMBER_BYTES = 512 * 1024 * 1024
MAX_ZIP_TOTAL_BYTES = 2 * 1024 * 1024 * 1024
MAX_ZIP_MEMBERS = 10_000
MAX_ZIP_COMPRESSION_RATIO = 500
MAX_MEMORY_BYTES = 2 * 1024 * 1024
MAX_MESSAGE_CHARS = 32_000
MEMORY_DOCUMENT_CHAR_CAP = 24_000

_CODEX_MEMORY_RELATIVE_PATH = Path("memories/memory_summary.md")
_CHATGPT_MEMORY_SUFFIXES = frozenset({".txt", ".md", ".json"})
_PRIVATE_PATH_PATTERN = re.compile(
    r"/(?:Users|home)/[^/\s]+/|[A-Za-z]:\\Users\\[^\\\s]+\\"
)
_SECRET_PATTERNS = (
    re.compile(
        r"-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----.*?"
        r"-----END (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----",
        re.DOTALL,
    ),
    re.compile(r"(?:sk-(?:proj|svcacct)-[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9]{40,})"),
    re.compile(r"(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})"),
    re.compile(r"AKIA[0-9A-Z]{16}"),
    re.compile(r"xox[baprs]-[A-Za-z0-9-]{10,}"),
    re.compile(r"AIza[0-9A-Za-z_-]{35}"),
)


class SourceCollectionError(ValueError):
    """An authorized source could not be read safely."""


@dataclass(frozen=True)
class SourceBundle:
    """Sanitized source material ready for a separate extraction step."""

    sources: list[dict[str, Any]]
    documents: list[dict[str, str]]
    limitations: list[str]


@dataclass(frozen=True)
class _Message:
    text: str
    timestamp: float | None
    ordinal: int


def _append_unique(values: list[str], value: str) -> None:
    if value not in values:
        values.append(value)


def _sanitize_text(value: str) -> tuple[str, bool]:
    """Redact common credentials and local home paths from source text."""
    sanitized = value.replace("\x00", "").replace("\u2013", "-").replace("\u2014", "-")
    redacted = False
    for pattern in _SECRET_PATTERNS:
        sanitized, count = pattern.subn("[redacted credential]", sanitized)
        redacted = redacted or count > 0
    sanitized, path_count = _PRIVATE_PATH_PATTERN.subn("[local-home]/", sanitized)
    redacted = redacted or path_count > 0
    return sanitized.strip(), redacted


@contextmanager
def _safe_open_binary(
    path: Path, *, max_bytes: int, label: str
) -> Iterator[BinaryIO]:
    """Open one size-bounded regular file without following its final symlink."""
    try:
        metadata = path.lstat()
    except FileNotFoundError as exc:
        raise SourceCollectionError(f"{label} was not found.") from exc
    except OSError as exc:
        raise SourceCollectionError(f"{label} could not be inspected.") from exc

    if stat.S_ISLNK(metadata.st_mode):
        raise SourceCollectionError(f"{label} must not be a symbolic link.")
    if not stat.S_ISREG(metadata.st_mode):
        raise SourceCollectionError(f"{label} must be a regular file.")
    if metadata.st_size > max_bytes:
        raise SourceCollectionError(f"{label} is larger than the supported size limit.")

    flags = os.O_RDONLY
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    try:
        descriptor = os.open(path, flags)
    except OSError as exc:
        raise SourceCollectionError(f"{label} could not be opened safely.") from exc
    handle: BinaryIO | None = None
    try:
        opened = os.fstat(descriptor)
        if not stat.S_ISREG(opened.st_mode):
            raise SourceCollectionError(f"{label} must be a regular file.")
        if opened.st_size > max_bytes:
            raise SourceCollectionError(
                f"{label} is larger than the supported size limit."
            )
        handle = os.fdopen(descriptor, "rb")
        descriptor = -1
        yield handle
    finally:
        if handle is not None:
            handle.close()
        elif descriptor >= 0:
            os.close(descriptor)


def _safe_read_bytes(path: Path, *, max_bytes: int, label: str) -> bytes:
    """Read one regular file without following its final symlink."""
    with _safe_open_binary(path, max_bytes=max_bytes, label=label) as handle:
        data = handle.read(max_bytes + 1)
    if len(data) > max_bytes:
        raise SourceCollectionError(f"{label} is larger than the supported size limit.")
    return data


def _decode_text(data: bytes, *, label: str) -> str:
    try:
        return data.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise SourceCollectionError(f"{label} must use UTF-8 text encoding.") from exc


def _safe_directory(path: Path, *, label: str) -> None:
    try:
        metadata = path.lstat()
    except FileNotFoundError as exc:
        raise SourceCollectionError(f"{label} was not found.") from exc
    except OSError as exc:
        raise SourceCollectionError(f"{label} could not be inspected.") from exc
    if stat.S_ISLNK(metadata.st_mode):
        raise SourceCollectionError(f"{label} must not be a symbolic link.")
    if not stat.S_ISDIR(metadata.st_mode):
        raise SourceCollectionError(f"{label} must be a directory.")


def _zip_member_path(name: str) -> PurePosixPath:
    if not name or "\x00" in name or "\\" in name:
        raise SourceCollectionError("The ChatGPT export contains an unsafe ZIP member name.")
    raw_parts = name.split("/")
    path_parts = raw_parts[:-1] if raw_parts[-1] == "" else raw_parts
    if any(part in {"", ".", ".."} for part in path_parts):
        raise SourceCollectionError("The ChatGPT export contains an unsafe ZIP member path.")
    member_path = PurePosixPath(name)
    if member_path.is_absolute():
        raise SourceCollectionError("The ChatGPT export contains an unsafe ZIP member path.")
    return member_path


def _zip_member_is_symlink(info: zipfile.ZipInfo) -> bool:
    unix_mode = (info.external_attr >> 16) & 0xFFFF
    return stat.S_ISLNK(unix_mode)


def _read_conversations_from_zip(path: Path) -> bytes:
    try:
        with _safe_open_binary(
            path,
            max_bytes=MAX_ARCHIVE_BYTES,
            label="ChatGPT export ZIP",
        ) as archive_file, zipfile.ZipFile(archive_file) as archive:
            infos = archive.infolist()
            if len(infos) > MAX_ZIP_MEMBERS:
                raise SourceCollectionError(
                    "The ChatGPT export contains too many ZIP members."
                )

            total_size = 0
            matches: list[zipfile.ZipInfo] = []
            for info in infos:
                member_path = _zip_member_path(info.filename)
                if _zip_member_is_symlink(info):
                    raise SourceCollectionError(
                        "The ChatGPT export contains a symbolic-link ZIP member."
                    )
                if info.flag_bits & 0x1:
                    raise SourceCollectionError(
                        "Encrypted ChatGPT export ZIP members are not supported."
                    )
                if info.file_size > MAX_ZIP_MEMBER_BYTES:
                    raise SourceCollectionError(
                        "The ChatGPT export contains an oversized ZIP member."
                    )
                total_size += info.file_size
                if total_size > MAX_ZIP_TOTAL_BYTES:
                    raise SourceCollectionError(
                        "The ChatGPT export expands beyond the supported size limit."
                    )
                if info.file_size and (
                    info.compress_size == 0
                    or info.file_size / info.compress_size > MAX_ZIP_COMPRESSION_RATIO
                ):
                    raise SourceCollectionError(
                        "The ChatGPT export contains a suspiciously compressed ZIP member."
                    )
                if not info.is_dir() and member_path.name == "conversations.json":
                    matches.append(info)

            if len(matches) != 1:
                raise SourceCollectionError(
                    "The ChatGPT export ZIP must contain exactly one conversations.json file."
                )
            target = matches[0]
            if target.file_size > MAX_JSON_BYTES:
                raise SourceCollectionError(
                    "The ChatGPT conversations file is larger than the supported size limit."
                )
            with archive.open(target) as handle:
                data = handle.read(MAX_JSON_BYTES + 1)
            if len(data) > MAX_JSON_BYTES:
                raise SourceCollectionError(
                    "The ChatGPT conversations file is larger than the supported size limit."
                )
            return data
    except zipfile.BadZipFile as exc:
        raise SourceCollectionError("The ChatGPT export ZIP is invalid.") from exc


def _read_conversations_json(path: Path) -> bytes:
    if path.is_dir():
        _safe_directory(path, label="ChatGPT export directory")
        candidate = path / "conversations.json"
        return _safe_read_bytes(
            candidate,
            max_bytes=MAX_JSON_BYTES,
            label="ChatGPT conversations file",
        )

    suffix = path.suffix.casefold()
    if suffix == ".zip":
        return _read_conversations_from_zip(path)
    if suffix != ".json":
        raise SourceCollectionError(
            "ChatGPT history must be a conversations.json file, an export ZIP, or an export directory."
        )
    return _safe_read_bytes(
        path,
        max_bytes=MAX_JSON_BYTES,
        label="ChatGPT conversations file",
    )


def _timestamp(value: Any) -> float | None:
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, (int, float)):
        number = float(value)
        return number if math.isfinite(number) else None
    if not isinstance(value, str):
        return None
    stripped = value.strip()
    if not stripped:
        return None
    try:
        number = float(stripped)
    except ValueError:
        try:
            parsed = datetime.fromisoformat(stripped.replace("Z", "+00:00"))
        except ValueError:
            return None
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.timestamp()
    return number if math.isfinite(number) else None


def _message_text(message: dict[str, Any]) -> str:
    content = message.get("content")
    if isinstance(content, str):
        return content.strip()
    if not isinstance(content, dict):
        return ""
    parts = content.get("parts")
    collected: list[str] = []
    if isinstance(parts, list):
        for part in parts:
            if isinstance(part, str):
                collected.append(part)
            elif isinstance(part, dict) and isinstance(part.get("text"), str):
                collected.append(part["text"])
    elif isinstance(content.get("text"), str):
        collected.append(content["text"])
    return "\n".join(item.strip() for item in collected if item.strip()).strip()


def _conversation_list(payload: Any) -> list[Any]:
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict) and isinstance(payload.get("conversations"), list):
        return payload["conversations"]
    raise SourceCollectionError(
        "The ChatGPT conversations file does not have a supported JSON structure."
    )


def _extract_messages(payload: Any) -> tuple[list[_Message], int, int]:
    messages: list[_Message] = []
    skipped_non_text = 0
    truncated_messages = 0
    ordinal = 0
    for conversation in _conversation_list(payload):
        if not isinstance(conversation, dict):
            continue
        fallback_time = _timestamp(
            conversation.get("update_time", conversation.get("create_time"))
        )
        mapping = conversation.get("mapping")
        if not isinstance(mapping, dict):
            continue
        for node in mapping.values():
            if not isinstance(node, dict):
                continue
            message = node.get("message")
            if not isinstance(message, dict):
                continue
            author = message.get("author")
            role = author.get("role") if isinstance(author, dict) else message.get("role")
            if role != "user":
                continue
            metadata = message.get("metadata")
            if isinstance(metadata, dict) and metadata.get(
                "is_visually_hidden_from_conversation"
            ) is True:
                continue
            text = _message_text(message)
            if not text:
                skipped_non_text += 1
                continue
            if len(text) > MAX_MESSAGE_CHARS:
                text = text[:MAX_MESSAGE_CHARS]
                truncated_messages += 1
            ordinal += 1
            message_time = _timestamp(message.get("create_time"))
            messages.append(
                _Message(
                    text=text,
                    timestamp=message_time if message_time is not None else fallback_time,
                    ordinal=ordinal,
                )
            )
    return messages, skipped_non_text, truncated_messages


def _deduplicate_messages(messages: Iterable[_Message]) -> tuple[list[_Message], int]:
    by_text: dict[str, _Message] = {}
    duplicates = 0
    for message in messages:
        key = " ".join(message.text.split())
        previous = by_text.get(key)
        if previous is None:
            by_text[key] = message
            continue
        duplicates += 1
        previous_key = (
            previous.timestamp is not None,
            previous.timestamp if previous.timestamp is not None else float("-inf"),
            previous.ordinal,
        )
        message_key = (
            message.timestamp is not None,
            message.timestamp if message.timestamp is not None else float("-inf"),
            message.ordinal,
        )
        if message_key > previous_key:
            by_text[key] = message
    return list(by_text.values()), duplicates


def _date_string(timestamp: float | None) -> str | None:
    if timestamp is None:
        return None
    try:
        return datetime.fromtimestamp(timestamp, tz=timezone.utc).date().isoformat()
    except (OSError, OverflowError, ValueError):
        return None


def _memory_document(
    path: Path,
    *,
    source_id: str,
    document_id: str,
    source_type: str,
    description: str,
    max_chars: int,
    label: str,
) -> tuple[dict[str, Any], dict[str, str], list[str]]:
    raw = _safe_read_bytes(path, max_bytes=MAX_MEMORY_BYTES, label=label)
    text = _decode_text(raw, label=label)
    if path.suffix.casefold() == ".json":
        try:
            parsed = json.loads(text)
        except json.JSONDecodeError as exc:
            raise SourceCollectionError(f"{label} contains invalid JSON.") from exc
        text = json.dumps(parsed, ensure_ascii=False, indent=2)
    sanitized, redacted = _sanitize_text(text)
    limitations: list[str] = []
    if redacted:
        limitations.append("Credentials or local home paths were redacted before analysis.")
    if len(sanitized) > max_chars:
        sanitized = sanitized[:max_chars]
        limitations.append("The source was truncated to the configured character limit.")
    if not sanitized:
        limitations.append("No supported text was found in the source.")
    source = {
        "id": source_id,
        "type": source_type,
        "description": description,
        "items_reviewed": int(bool(sanitized)),
        "limitations": list(limitations),
    }
    return source, {
        "id": document_id,
        "source_id": source_id,
        "text": sanitized,
    }, limitations


def _collect_chatgpt_export(
    path: Path,
    *,
    max_chars: int,
) -> tuple[dict[str, Any], list[dict[str, str]], list[str]]:
    data = _read_conversations_json(path)
    try:
        payload = json.loads(_decode_text(data, label="ChatGPT conversations file"))
    except json.JSONDecodeError as exc:
        raise SourceCollectionError(
            "The ChatGPT conversations file contains invalid JSON."
        ) from exc
    extracted, skipped_non_text, truncated_messages = _extract_messages(payload)
    messages, duplicate_count = _deduplicate_messages(extracted)

    newest_first = sorted(
        messages,
        key=lambda message: (
            message.timestamp is not None,
            message.timestamp if message.timestamp is not None else float("-inf"),
            message.ordinal,
        ),
        reverse=True,
    )
    selected: list[tuple[_Message, str]] = []
    used = 0
    char_truncated = False
    redacted_any = False
    for message in newest_first:
        if used >= max_chars:
            char_truncated = True
            break
        sanitized, redacted = _sanitize_text(message.text)
        redacted_any = redacted_any or redacted
        if not sanitized:
            continue
        remaining = max_chars - used
        if len(sanitized) > remaining:
            sanitized = sanitized[:remaining]
            char_truncated = True
        selected.append((message, sanitized))
        used += len(sanitized)
        if used >= max_chars:
            char_truncated = len(selected) < len(newest_first) or len(sanitized) < len(message.text)
            break

    selected.sort(
        key=lambda item: (
            item[0].timestamp is not None,
            item[0].timestamp if item[0].timestamp is not None else float("-inf"),
            item[0].ordinal,
        )
    )
    documents = [
        {
            "id": f"chatgpt-export-message-{index:06d}",
            "source_id": "chatgpt-export",
            "text": text,
        }
        for index, (_, text) in enumerate(selected, start=1)
    ]
    selected_dates = [
        value
        for value in (_date_string(message.timestamp) for message, _ in selected)
        if value is not None
    ]
    limitations: list[str] = []
    if duplicate_count:
        limitations.append("Duplicate user messages were removed.")
    if skipped_non_text:
        limitations.append("User messages without supported text were skipped.")
    if truncated_messages:
        limitations.append("Very long user messages were truncated before analysis.")
    if char_truncated:
        limitations.append(
            "Older user messages were omitted to meet the configured character limit."
        )
    if redacted_any:
        limitations.append("Credentials or local home paths were redacted before analysis.")
    if not documents:
        limitations.append("No supported user-authored text was found in the export.")

    source: dict[str, Any] = {
        "id": "chatgpt-export",
        "type": "chatgpt_export",
        "description": "User-authored messages parsed from a user-supplied ChatGPT data export.",
        "items_reviewed": len(documents),
        "limitations": list(limitations),
    }
    if selected_dates:
        source["start_date"] = min(selected_dates)
        source["end_date"] = max(selected_dates)
    return source, documents, limitations


def collect_authorized_sources(
    *,
    include_codex_memory: bool,
    codex_home: Path | None,
    chatgpt_export: Path | None,
    chatgpt_memory: Path | None,
    max_total_chars: int = 120_000,
) -> SourceBundle:
    """Collect only the source paths that an onboarding caller authorized.

    The returned metadata never contains source paths or credentials. Raw source
    text is sanitized, and the total document text does not exceed
    ``max_total_chars``. Memory sources are considered first. Within ChatGPT
    history, the newest distinct messages are selected first and then returned
    in chronological order.
    """
    if (
        not isinstance(max_total_chars, int)
        or isinstance(max_total_chars, bool)
        or max_total_chars <= 0
    ):
        raise SourceCollectionError("max_total_chars must be a positive integer.")

    sources: list[dict[str, Any]] = []
    documents: list[dict[str, str]] = []
    limitations: list[str] = []
    remaining = max_total_chars

    def add_limitations(values: Iterable[str]) -> None:
        for value in values:
            _append_unique(limitations, value)

    if include_codex_memory:
        if codex_home is None:
            add_limitations(
                ["Local Codex memory was authorized but no Codex home was supplied."]
            )
        else:
            memory_path = codex_home / _CODEX_MEMORY_RELATIVE_PATH
            if not memory_path.exists() and not memory_path.is_symlink():
                add_limitations(
                    ["No local Codex memory summary was available for analysis."]
                )
            else:
                source, document, source_limitations = _memory_document(
                    memory_path,
                    source_id="codex-memory",
                    document_id="codex-memory-summary",
                    source_type="memory",
                    description="Local Codex memory summary included with explicit user authorization.",
                    max_chars=min(remaining, MEMORY_DOCUMENT_CHAR_CAP),
                    label="Local Codex memory summary",
                )
                sources.append(source)
                if document["text"]:
                    documents.append(document)
                    remaining -= len(document["text"])
                add_limitations(source_limitations)

    if chatgpt_memory is not None:
        suffix = chatgpt_memory.suffix.casefold()
        if suffix not in _CHATGPT_MEMORY_SUFFIXES:
            raise SourceCollectionError(
                "Saved ChatGPT memory must be a .txt, .md, or .json file."
            )
        source, document, source_limitations = _memory_document(
            chatgpt_memory,
            source_id="chatgpt-memory",
            document_id="chatgpt-saved-memory",
            source_type="memory",
            description="Saved ChatGPT memory supplied explicitly by the user.",
            max_chars=min(remaining, MEMORY_DOCUMENT_CHAR_CAP),
            label="Saved ChatGPT memory file",
        )
        sources.append(source)
        if document["text"]:
            documents.append(document)
            remaining -= len(document["text"])
        add_limitations(source_limitations)

    if chatgpt_export is not None:
        if remaining <= 0:
            limitation = (
                "ChatGPT history was not analyzed because earlier authorized sources used the configured character limit."
            )
            sources.append(
                {
                    "id": "chatgpt-export",
                    "type": "chatgpt_export",
                    "description": "User-authored messages in a user-supplied ChatGPT data export.",
                    "items_reviewed": 0,
                    "limitations": [limitation],
                }
            )
            add_limitations([limitation])
        else:
            source, export_documents, source_limitations = _collect_chatgpt_export(
                chatgpt_export,
                max_chars=remaining,
            )
            sources.append(source)
            documents.extend(export_documents)
            remaining -= sum(len(document["text"]) for document in export_documents)
            add_limitations(source_limitations)

    return SourceBundle(
        sources=sources,
        documents=documents,
        limitations=limitations,
    )


__all__ = [
    "SourceBundle",
    "SourceCollectionError",
    "collect_authorized_sources",
]
