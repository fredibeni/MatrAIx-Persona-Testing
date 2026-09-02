"""Tests for consent-bounded onboarding source collection."""

from __future__ import annotations

import json
import stat
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

from matraix.onboarding_sources import (
    SourceCollectionError,
    collect_authorized_sources,
)


def message_node(
    role: str,
    text: object,
    created_at: float,
    *,
    hidden: bool = False,
) -> dict:
    return {
        "message": {
            "author": {"role": role},
            "create_time": created_at,
            "content": {"parts": [text]},
            "metadata": {"is_visually_hidden_from_conversation": hidden},
        }
    }


def conversation_payload(*nodes: dict) -> list[dict]:
    return [
        {
            "create_time": 1,
            "mapping": {str(index): node for index, node in enumerate(nodes)},
        }
    ]


class OnboardingSourceTests(unittest.TestCase):
    def write_json(self, directory: Path, payload: object) -> Path:
        path = directory / "conversations.json"
        path.write_text(json.dumps(payload), encoding="utf-8")
        return path

    def collect_export(self, path: Path, *, max_chars: int = 120_000):
        return collect_authorized_sources(
            include_codex_memory=False,
            codex_home=None,
            chatgpt_export=path,
            chatgpt_memory=None,
            max_total_chars=max_chars,
        )

    def test_json_extracts_only_visible_user_text_and_sorts_by_time(self) -> None:
        with tempfile.TemporaryDirectory(prefix="matraix-onboarding-") as name:
            directory = Path(name)
            payload = conversation_payload(
                message_node("user", "Newest", 30),
                message_node("assistant", "Assistant answer", 31),
                message_node("user", {"asset_pointer": "image"}, 25),
                message_node("user", "Hidden", 21, hidden=True),
                message_node("system", "System text", 1),
                message_node("user", "Oldest", 10),
                message_node("user", {"text": "Middle"}, 20),
            )
            bundle = self.collect_export(self.write_json(directory, payload))

            self.assertEqual(
                [document["text"] for document in bundle.documents],
                ["Oldest", "Middle", "Newest"],
            )
            self.assertNotIn("Assistant answer", json.dumps(bundle.documents))
            self.assertNotIn("Hidden", json.dumps(bundle.documents))
            self.assertEqual(bundle.sources[0]["items_reviewed"], 3)
            self.assertEqual(bundle.sources[0]["start_date"], "1970-01-01")
            self.assertIn(
                "User messages without supported text were skipped.",
                bundle.limitations,
            )

    def test_duplicate_messages_keep_newest_copy(self) -> None:
        with tempfile.TemporaryDirectory(prefix="matraix-onboarding-") as name:
            directory = Path(name)
            payload = conversation_payload(
                message_node("user", "Repeated message", 10),
                message_node("user", "Unique message", 20),
                message_node("user", "  Repeated   message  ", 30),
            )
            bundle = self.collect_export(self.write_json(directory, payload))

            self.assertEqual(len(bundle.documents), 2)
            self.assertEqual(bundle.documents[-1]["text"], "Repeated   message")
            self.assertIn("Duplicate user messages were removed.", bundle.limitations)

    def test_character_cap_keeps_newest_content(self) -> None:
        with tempfile.TemporaryDirectory(prefix="matraix-onboarding-") as name:
            directory = Path(name)
            payload = conversation_payload(
                message_node("user", "old-message", 10),
                message_node("user", "new-message", 20),
            )
            bundle = self.collect_export(
                self.write_json(directory, payload), max_chars=7
            )

            self.assertEqual(
                bundle.documents,
                [
                    {
                        "id": "chatgpt-export-message-000001",
                        "source_id": "chatgpt-export",
                        "text": "new-mes",
                    }
                ],
            )
            self.assertLessEqual(
                sum(len(document["text"]) for document in bundle.documents), 7
            )
            self.assertIn(
                "Older user messages were omitted to meet the configured character limit.",
                bundle.limitations,
            )

    def test_export_directory_reads_direct_conversations_file(self) -> None:
        with tempfile.TemporaryDirectory(prefix="matraix-onboarding-") as name:
            directory = Path(name)
            self.write_json(
                directory,
                conversation_payload(message_node("user", "From directory", 10)),
            )
            bundle = self.collect_export(directory)
            self.assertEqual(bundle.documents[0]["text"], "From directory")

    def test_export_zip_reads_one_nested_conversations_file(self) -> None:
        with tempfile.TemporaryDirectory(prefix="matraix-onboarding-") as name:
            archive_path = Path(name) / "export.zip"
            payload = conversation_payload(message_node("user", "From ZIP", 10))
            with zipfile.ZipFile(archive_path, "w", zipfile.ZIP_DEFLATED) as archive:
                archive.writestr("export/conversations.json", json.dumps(payload))
                archive.writestr("export/readme.html", "ignored")

            bundle = self.collect_export(archive_path)
            self.assertEqual(bundle.documents[0]["text"], "From ZIP")

    def test_export_zip_rejects_unsafe_member_path(self) -> None:
        with tempfile.TemporaryDirectory(prefix="matraix-onboarding-") as name:
            archive_path = Path(name) / "export.zip"
            with zipfile.ZipFile(archive_path, "w") as archive:
                archive.writestr("conversations.json", "[]")
                archive.writestr("../outside.txt", "unsafe")
            with self.assertRaisesRegex(SourceCollectionError, "unsafe ZIP member"):
                self.collect_export(archive_path)

    def test_export_zip_rejects_symbolic_link_member(self) -> None:
        with tempfile.TemporaryDirectory(prefix="matraix-onboarding-") as name:
            archive_path = Path(name) / "export.zip"
            link = zipfile.ZipInfo("link")
            link.create_system = 3
            link.external_attr = (stat.S_IFLNK | 0o777) << 16
            with zipfile.ZipFile(archive_path, "w") as archive:
                archive.writestr("conversations.json", "[]")
                archive.writestr(link, "target")
            with self.assertRaisesRegex(SourceCollectionError, "symbolic-link"):
                self.collect_export(archive_path)

    def test_export_zip_rejects_oversized_member(self) -> None:
        with tempfile.TemporaryDirectory(prefix="matraix-onboarding-") as name:
            archive_path = Path(name) / "export.zip"
            with zipfile.ZipFile(archive_path, "w") as archive:
                archive.writestr("conversations.json", "[]")
                archive.writestr("large.bin", b"12345")
            with patch("matraix.onboarding_sources.MAX_ZIP_MEMBER_BYTES", 4):
                with self.assertRaisesRegex(SourceCollectionError, "oversized"):
                    self.collect_export(archive_path)

    def test_export_zip_requires_exactly_one_conversations_file(self) -> None:
        with tempfile.TemporaryDirectory(prefix="matraix-onboarding-") as name:
            archive_path = Path(name) / "export.zip"
            with zipfile.ZipFile(archive_path, "w") as archive:
                archive.writestr("one/conversations.json", "[]")
                archive.writestr("two/conversations.json", "[]")
            with self.assertRaisesRegex(SourceCollectionError, "exactly one"):
                self.collect_export(archive_path)

    def test_export_file_symlink_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory(prefix="matraix-onboarding-") as name:
            directory = Path(name)
            target = self.write_json(directory, [])
            link = directory / "linked.json"
            link.symlink_to(target)
            with self.assertRaisesRegex(SourceCollectionError, "symbolic link"):
                self.collect_export(link)

    def test_codex_memory_reads_only_authorized_summary(self) -> None:
        with tempfile.TemporaryDirectory(prefix="matraix-onboarding-") as name:
            codex_home = Path(name)
            memories = codex_home / "memories"
            memories.mkdir()
            (memories / "memory_summary.md").write_text(
                "The user prefers concise answers.", encoding="utf-8"
            )
            (memories / "raw_memories.md").write_text(
                "This should not be collected.", encoding="utf-8"
            )

            bundle = collect_authorized_sources(
                include_codex_memory=True,
                codex_home=codex_home,
                chatgpt_export=None,
                chatgpt_memory=None,
            )
            self.assertEqual(bundle.sources[0]["id"], "codex-memory")
            self.assertEqual(
                bundle.documents,
                [
                    {
                        "id": "codex-memory-summary",
                        "source_id": "codex-memory",
                        "text": "The user prefers concise answers.",
                    }
                ],
            )
            self.assertNotIn("raw_memories", json.dumps(bundle.sources))

    def test_missing_codex_memory_is_a_limitation_not_an_error(self) -> None:
        with tempfile.TemporaryDirectory(prefix="matraix-onboarding-") as name:
            bundle = collect_authorized_sources(
                include_codex_memory=True,
                codex_home=Path(name),
                chatgpt_export=None,
                chatgpt_memory=None,
            )
            self.assertEqual(bundle.sources, [])
            self.assertEqual(bundle.documents, [])
            self.assertIn(
                "No local Codex memory summary was available for analysis.",
                bundle.limitations,
            )

    def test_codex_memory_symlink_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory(prefix="matraix-onboarding-") as name:
            codex_home = Path(name)
            memories = codex_home / "memories"
            memories.mkdir()
            target = codex_home / "target.md"
            target.write_text("memory", encoding="utf-8")
            (memories / "memory_summary.md").symlink_to(target)
            with self.assertRaisesRegex(SourceCollectionError, "symbolic link"):
                collect_authorized_sources(
                    include_codex_memory=True,
                    codex_home=codex_home,
                    chatgpt_export=None,
                    chatgpt_memory=None,
                )

    def test_saved_memory_supports_text_markdown_and_json(self) -> None:
        with tempfile.TemporaryDirectory(prefix="matraix-onboarding-") as name:
            directory = Path(name)
            fixtures = {
                ".txt": "Likes tea",
                ".md": "# Memory\nLikes tea",
                ".json": {"memory": "Likes tea"},
            }
            for suffix, payload in fixtures.items():
                with self.subTest(suffix=suffix):
                    path = directory / f"saved{suffix}"
                    if isinstance(payload, str):
                        path.write_text(payload, encoding="utf-8")
                    else:
                        path.write_text(json.dumps(payload), encoding="utf-8")
                    bundle = collect_authorized_sources(
                        include_codex_memory=False,
                        codex_home=None,
                        chatgpt_export=None,
                        chatgpt_memory=path,
                    )
                    self.assertEqual(bundle.sources[0]["id"], "chatgpt-memory")
                    self.assertIn("Likes tea", bundle.documents[0]["text"])

    def test_source_text_is_sanitized_and_metadata_has_no_path_or_secret(self) -> None:
        with tempfile.TemporaryDirectory(prefix="matraix-onboarding-secret-") as name:
            directory = Path(name)
            secret = "sk-" + "a" * 40
            memory = directory / f"private-{secret}.txt"
            memory.write_text(
                f"Token {secret} in /Users/example/private/file.txt",
                encoding="utf-8",
            )
            bundle = collect_authorized_sources(
                include_codex_memory=False,
                codex_home=None,
                chatgpt_export=None,
                chatgpt_memory=memory,
            )

            metadata = json.dumps(
                {"sources": bundle.sources, "limitations": bundle.limitations}
            )
            self.assertNotIn(secret, metadata)
            self.assertNotIn(name, metadata)
            self.assertNotIn(secret, bundle.documents[0]["text"])
            self.assertNotIn("/Users/example/", bundle.documents[0]["text"])
            self.assertIn("[redacted credential]", bundle.documents[0]["text"])
            self.assertIn("[local-home]/", bundle.documents[0]["text"])

    def test_invalid_saved_memory_type_and_json_are_rejected(self) -> None:
        with tempfile.TemporaryDirectory(prefix="matraix-onboarding-") as name:
            directory = Path(name)
            unsupported = directory / "memory.yaml"
            unsupported.write_text("memory: value", encoding="utf-8")
            invalid_json = directory / "memory.json"
            invalid_json.write_text("{", encoding="utf-8")

            for path, expected in (
                (unsupported, "must be a .txt"),
                (invalid_json, "invalid JSON"),
            ):
                with self.subTest(path=path.name):
                    with self.assertRaisesRegex(SourceCollectionError, expected):
                        collect_authorized_sources(
                            include_codex_memory=False,
                            codex_home=None,
                            chatgpt_export=None,
                            chatgpt_memory=path,
                        )

    def test_invalid_character_limit_is_rejected(self) -> None:
        for value in (0, -1, True, 1.5):
            with self.subTest(value=value):
                with self.assertRaisesRegex(SourceCollectionError, "positive integer"):
                    collect_authorized_sources(
                        include_codex_memory=False,
                        codex_home=None,
                        chatgpt_export=None,
                        chatgpt_memory=None,
                        max_total_chars=value,  # type: ignore[arg-type]
                    )


if __name__ == "__main__":
    unittest.main()
