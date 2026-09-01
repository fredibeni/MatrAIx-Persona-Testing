"""Build a live survey view from the currently active persona."""

from __future__ import annotations

from copy import deepcopy
from typing import Any

EVIDENCE_BLOCKS = (
    "evidenced",
    "best_guess",
    "sensitive_evidenced",
    "sensitive_best_guess",
    "unresolved",
)

RESOLVED_CONFIDENCES = {
    "stated",
    "strong_inference",
    "scale_complete",
    "derived_self_report",
    "self_report",
}

INTENTIONALLY_RESOLVED_CONFIDENCES = {
    "self_report_unknown",
    "self_report_private",
}


def persona_identity(persona: dict[str, Any], fallback: str = "persona") -> tuple[str, str]:
    """Return a stable identity label without requiring the extended audit format."""
    persona_id = str(persona.get("persona_id") or fallback).strip() or fallback
    display_name = str(
        persona.get("display_name") or persona.get("name") or persona_id
    ).strip()
    return persona_id, display_name or persona_id


def _evidence_records(persona: dict[str, Any]) -> dict[str, dict[str, Any]]:
    records: dict[str, dict[str, Any]] = {}
    for block in EVIDENCE_BLOCKS:
        rows = persona.get(block, [])
        if not isinstance(rows, list):
            continue
        for row in rows:
            if isinstance(row, dict) and isinstance(row.get("id"), str):
                records[row["id"]] = row
    return records


def dimension_overlay(
    persona: dict[str, Any], schema_dimensions: list[dict[str, Any]]
) -> dict[str, dict[str, Any]]:
    """Describe whether each schema dimension still needs direct input."""
    runtime = persona.get("dimensions", {})
    if not isinstance(runtime, dict):
        runtime = {}
    records = _evidence_records(persona)
    overlay: dict[str, dict[str, Any]] = {}

    for metadata in schema_dimensions:
        dimension_id = str(metadata["id"])
        record = records.get(dimension_id)
        in_runtime = dimension_id in runtime and runtime[dimension_id] is not None
        if record is None:
            confidence = "provided" if in_runtime else "unknown"
            value = runtime.get(dimension_id)
            runtime_included = in_runtime
            resolved = in_runtime
        else:
            confidence = str(record.get("selected_confidence") or "unknown")
            value = runtime.get(dimension_id, record.get("value"))
            runtime_included = bool(record.get("runtime_included", in_runtime))
            resolved = confidence in INTENTIONALLY_RESOLVED_CONFIDENCES or (
                in_runtime
                and runtime_included
                and confidence in RESOLVED_CONFIDENCES
            )
        overlay[dimension_id] = {
            "value": value,
            "confidence": confidence,
            "runtime_included": runtime_included,
            "resolved": resolved,
        }
    return overlay


def _annotate(target: dict[str, Any], status: dict[str, Any]) -> None:
    target["current_value"] = status["value"]
    target["current_confidence"] = status["confidence"]
    target["current_high_confidence"] = bool(status["resolved"])


def _question_units(question: dict[str, Any]) -> int:
    question_type = question.get("type")
    if question_type == "dimension_grid":
        return len(question.get("entries", []))
    if question_type == "rank_dimensions":
        return int(question.get("max_rank", 1))
    return 1


def _complete_ranking(question: dict[str, Any], answers: dict[str, Any]) -> bool:
    answer = answers.get(question.get("id"))
    if not isinstance(answer, list):
        return False
    unique = {value for value in answer if isinstance(value, str) and value}
    return len(unique) >= int(question.get("max_rank", 1))


def adapt_definition(
    definition: dict[str, Any],
    persona: dict[str, Any],
    state: dict[str, Any],
    schema_dimensions: list[dict[str, Any]],
    *,
    persona_session_key: str,
    persona_revision: str,
) -> dict[str, Any]:
    """Return only questions that can resolve a missing or low-confidence dimension."""
    adapted = deepcopy(definition)
    overlay = dimension_overlay(persona, schema_dimensions)
    answers = state.get("answers", {})
    if not isinstance(answers, dict):
        answers = {}
    modules: list[dict[str, Any]] = []

    for source_module in definition.get("modules", []):
        module = deepcopy(source_module)
        source_questions = source_module.get("questions", [])
        questions: list[dict[str, Any]] = []
        source_units = sum(_question_units(question) for question in source_questions)

        for source_question in source_questions:
            question_type = source_question.get("type")
            question = deepcopy(source_question)

            if question_type in {"dimension_select", "likert"}:
                status = overlay.get(str(question.get("dimension_id")))
                if status is None or status["resolved"]:
                    continue
                _annotate(question, status)
                questions.append(question)
                continue

            if question_type == "dimension_grid":
                entries: list[dict[str, Any]] = []
                for source_entry in source_question.get("entries", []):
                    status = overlay.get(str(source_entry.get("dimension_id")))
                    if status is None or status["resolved"]:
                        continue
                    entry = deepcopy(source_entry)
                    _annotate(entry, status)
                    entries.append(entry)
                if entries:
                    question["entries"] = entries
                    questions.append(question)
                continue

            if question_type == "rank_dimensions":
                target_ids = [
                    str(entry.get("dimension_id"))
                    for entry in source_question.get("entries", [])
                ]
                derived_id = source_question.get("derived_dimension_id")
                if derived_id:
                    target_ids.append(str(derived_id))
                needs_input = any(
                    dimension_id in overlay and not overlay[dimension_id]["resolved"]
                    for dimension_id in target_ids
                )
                if not needs_input or _complete_ranking(question, answers):
                    continue
                question["entries"] = deepcopy(source_question.get("entries", []))
                for entry in question["entries"]:
                    status = overlay.get(str(entry.get("dimension_id")))
                    if status is not None:
                        _annotate(entry, status)
                derived_status = overlay.get(str(derived_id)) if derived_id else None
                if derived_status is not None:
                    _annotate(question, derived_status)
                question["current_high_confidence"] = False
                questions.append(question)
                continue

            # Free-text and single-choice prompts do not currently write a schema
            # dimension, so they are not part of the adaptive gap survey.

        if not questions:
            continue
        module["questions"] = questions
        visible_units = sum(_question_units(question) for question in questions)
        original_minutes = float(source_module.get("estimated_minutes") or 0)
        module["estimated_minutes"] = (
            original_minutes * visible_units / source_units if source_units else 0
        )
        modules.append(module)

    persona_id, display_name = persona_identity(persona)
    resolved_ids = [
        str(metadata["id"])
        for metadata in schema_dimensions
        if overlay[str(metadata["id"])]["resolved"]
    ]
    visible_units = sum(
        _question_units(question)
        for module in modules
        for question in module.get("questions", [])
    )
    adapted["survey_id"] = "matraix-adaptive-persona-survey"
    adapted["version"] = "2.0-adaptive"
    adapted["modules"] = modules
    adapted["persona"] = {
        "persona_id": persona_id,
        "display_name": display_name,
        "session_key": persona_session_key,
        "revision": persona_revision,
    }
    coverage = deepcopy(definition.get("coverage", {}))
    coverage["total_dimensions"] = len(schema_dimensions)
    coverage["preanswered_dimensions"] = resolved_ids
    coverage["preanswered_count"] = len(resolved_ids)
    coverage["missing_dimensions"] = len(schema_dimensions) - len(resolved_ids)
    coverage["visible_answer_fields"] = visible_units
    coverage["estimated_minutes"] = sum(
        float(module.get("estimated_minutes") or 0) for module in modules
    )
    adapted["coverage"] = coverage
    return adapted
