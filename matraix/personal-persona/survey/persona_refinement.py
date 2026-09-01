"""Score saved survey answers and build a refined MatrAIx persona YAML."""

from __future__ import annotations

import json
import os
import tempfile
from copy import deepcopy
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import yaml
from matraix.persona_dimension_catalog import collect_dimension_items

BASE_CONFIDENCE_RANK = {
    "unknown": 0.0,
    "best_guess": 1.0,
    "strong_inference": 2.0,
    "stated": 3.0,
}

SURVEY_CONFIDENCE_RANK = {
    "scale_partial": 1.5,
    "scale_complete": 4.0,
    "derived_self_report": 4.5,
    "self_report": 5.0,
    "self_report_unknown": 5.0,
    "self_report_private": 5.0,
}

EVIDENCE_BLOCKS = (
    "evidenced",
    "best_guess",
    "sensitive_evidenced",
    "sensitive_best_guess",
    "unresolved",
)

VALUE_PRIORITY_MAP = {
    "val_achievement": "Achievement",
    "val_career_success": "Achievement",
    "val_recognition": "Achievement",
    "val_security_stability": "Security",
    "val_wealth": "Security",
    "val_personal_freedom": "Autonomy",
    "val_independence": "Autonomy",
    "val_community": "Community",
    "val_helping_others": "Community",
    "val_family": "Community",
    "val_adventure": "Novelty",
    "val_creativity_self_expression": "Novelty",
    "val_fun_enjoyment": "Novelty",
    "val_tradition": "Tradition",
    "val_patriotism": "Tradition",
}


def utc_now() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def load_json(path: Path) -> dict[str, Any]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise TypeError(f"Expected JSON object: {path}")
    return data


def load_yaml(path: Path) -> dict[str, Any]:
    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise TypeError(f"Expected YAML mapping: {path}")
    return data


def dump_readable_yaml(data: dict[str, Any]) -> str:
    """Serialize persona YAML with stable spacing between evidence records."""
    text = yaml.safe_dump(
        data,
        sort_keys=False,
        allow_unicode=False,
        width=100,
    )
    block_headers = {f"{name}:" for name in EVIDENCE_BLOCKS}
    output: list[str] = []
    in_evidence_block = False
    seen_record = False

    for line in text.splitlines():
        if line in block_headers:
            if output and output[-1] != "":
                output.append("")
            in_evidence_block = True
            seen_record = False
        elif in_evidence_block and line and not line.startswith((" ", "- ")):
            in_evidence_block = False
            seen_record = False

        if in_evidence_block and line.startswith("- id: "):
            if seen_record and output and output[-1] != "":
                output.append("")
            seen_record = True
        output.append(line)

    return "\n".join(output) + "\n"


def atomic_write_text(path: Path, text: str) -> None:
    """Replace a generated file without exposing a partially written version."""
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            dir=path.parent,
            prefix=f".{path.name}.",
            suffix=".tmp",
            delete=False,
        ) as handle:
            handle.write(text)
            temporary_path = Path(handle.name)
        os.replace(temporary_path, path)
    finally:
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)


def catalog(path: Path) -> tuple[dict[str, dict[str, Any]], list[str]]:
    data = load_json(path)
    dimensions = data.get("dimensions")
    if not isinstance(dimensions, list):
        raise TypeError("dimensions.json has no dimensions list")
    by_id = {item["id"]: item for item in dimensions}
    return by_id, [item["id"] for item in dimensions]


def all_questions(definition: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        question
        for module in definition.get("modules", [])
        for question in module.get("questions", [])
    ]


def response_answers(responses: dict[str, Any]) -> dict[str, Any]:
    answers = responses.get("answers", {})
    return answers if isinstance(answers, dict) else {}


def valid_value(dim_id: str, value: Any, by_id: dict[str, dict[str, Any]]) -> bool:
    return dim_id in by_id and value in by_id[dim_id]["values"]


def direct_updates(
    definition: dict[str, Any],
    responses: dict[str, Any],
    by_id: dict[str, dict[str, Any]],
) -> tuple[list[dict[str, Any]], dict[str, str]]:
    answers = response_answers(responses)
    updates: list[dict[str, Any]] = []
    free_text: dict[str, str] = {}

    for question in all_questions(definition):
        question_id = question["id"]
        answer = answers.get(question_id)
        question_type = question.get("type")

        if question_type == "free_text":
            if isinstance(answer, str) and answer.strip():
                free_text[question_id] = answer.strip()
            continue

        if question_type == "dimension_select":
            if answer in (None, ""):
                continue
            dim_id = question["dimension_id"]
            if answer == "__unknown__":
                updates.append(
                    {
                        "dimension_id": dim_id,
                        "value": None,
                        "confidence": "self_report_unknown",
                        "evidence": "Current survey: The persona owner explicitly marked this dimension unknown.",
                        "sensitive": bool(question.get("sensitive")),
                        "question_id": question_id,
                    }
                )
            elif answer == "__private__":
                updates.append(
                    {
                        "dimension_id": dim_id,
                        "value": None,
                        "confidence": "self_report_private",
                        "evidence": "Current survey: The persona owner marked this dimension private and withheld it from runtime.",
                        "sensitive": True,
                        "question_id": question_id,
                    }
                )
            elif valid_value(dim_id, answer, by_id):
                updates.append(
                    {
                        "dimension_id": dim_id,
                        "value": answer,
                        "confidence": "self_report",
                        "evidence": f"Current survey: The persona owner directly selected {answer}.",
                        "sensitive": bool(question.get("sensitive")),
                        "question_id": question_id,
                    }
                )
            else:
                raise ValueError(f"Invalid survey value for {dim_id}: {answer!r}")

        elif question_type == "dimension_grid":
            if not isinstance(answer, dict):
                continue
            for dim_id, value in answer.items():
                if value in (None, ""):
                    continue
                if not valid_value(dim_id, value, by_id):
                    raise ValueError(f"Invalid grid value for {dim_id}: {value!r}")
                updates.append(
                    {
                        "dimension_id": dim_id,
                        "value": value,
                        "confidence": "self_report",
                        "evidence": f"Current survey gap grid: The persona owner directly selected {value}.",
                        "sensitive": False,
                        "question_id": question_id,
                    }
                )

        elif question_type == "rank_dimensions" and isinstance(answer, list):
            ranked = [value for value in answer if value]
            seen: set[str] = set()
            for index, dim_id in enumerate(ranked[: int(question.get("max_rank", 5))]):
                if (
                    dim_id in seen
                    or dim_id not in by_id
                    or not dim_id.startswith("val_")
                ):
                    continue
                seen.add(dim_id)
                value = "Core value" if index == 0 else "Important"
                updates.append(
                    {
                        "dimension_id": dim_id,
                        "value": value,
                        "confidence": "self_report",
                        "evidence": f"Current survey value ranking: The persona owner ranked this value number {index + 1}.",
                        "sensitive": False,
                        "question_id": question_id,
                    }
                )
            if ranked and ranked[0] in VALUE_PRIORITY_MAP:
                updates.append(
                    {
                        "dimension_id": "values_priority",
                        "value": VALUE_PRIORITY_MAP[ranked[0]],
                        "confidence": "derived_self_report",
                        "evidence": "Derived from the persona owner's top-ranked current value in the survey.",
                        "sensitive": False,
                        "question_id": question_id,
                    }
                )
    return updates, free_text


def response_band(mean: float, scale_max: int, allowed_values: list[str]) -> str:
    if allowed_values == ["Signature", "Strong", "Moderate", "Slight", "Absent"]:
        if mean <= 1.8:
            return "Absent"
        if mean <= 2.6:
            return "Slight"
        if mean < 3.4:
            return "Moderate"
        if mean < 4.2:
            return "Strong"
        return "Signature"
    if scale_max == 5:
        if mean <= 1.8:
            return "Very low"
        if mean <= 2.6:
            return "Low"
        if mean < 3.4:
            return "Average"
        if mean < 4.2:
            return "High"
        return "Very high"
    if scale_max == 7:
        if mean <= 1.8:
            return "Very low"
        if mean <= 3.2:
            return "Low"
        if mean < 4.8:
            return "Average"
        if mean < 6.2:
            return "High"
        return "Very high"
    raise ValueError(f"Unsupported scale maximum: {scale_max}")


def scale_updates(
    definition: dict[str, Any],
    responses: dict[str, Any],
    by_id: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    answers = response_answers(responses)
    groups: dict[tuple[str, str], list[dict[str, Any]]] = {}
    for question in all_questions(definition):
        if question.get("type") != "likert" or not question.get("instrument"):
            continue
        key = (question["instrument"], question["dimension_id"])
        groups.setdefault(key, []).append(question)

    updates: list[dict[str, Any]] = []
    for (instrument, dim_id), questions in groups.items():
        keyed_scores: list[float] = []
        raw_scores: list[int] = []
        for question in questions:
            raw = answers.get(question["id"])
            if isinstance(raw, str) and raw.isdigit():
                raw = int(raw)
            scale_values = [int(item["value"]) for item in question["scale"]]
            if not isinstance(raw, int) or raw not in scale_values:
                continue
            raw_scores.append(raw)
            if int(question.get("key_direction", 1)) < 0:
                keyed_scores.append(min(scale_values) + max(scale_values) - raw)
            else:
                keyed_scores.append(float(raw))

        expected = len(questions)
        answered = len(keyed_scores)
        if instrument == "DOSPERT-inspired domain risk profile":
            minimum = 2
        else:
            minimum = 1
        if answered < minimum:
            continue
        complete = answered == expected
        mean = sum(keyed_scores) / answered
        scale_max = max(int(item["value"]) for item in questions[0]["scale"])
        value = response_band(mean, scale_max, by_id[dim_id]["values"])
        if not valid_value(dim_id, value, by_id):
            raise ValueError(f"Scored value not allowed for {dim_id}: {value}")
        status = "complete" if complete else "provisional"
        evidence = (
            f"Local survey {instrument}: keyed mean {mean:.2f} from {answered}/{expected} "
            f"items ({status}). Category uses absolute response bands without population norms."
        )
        if instrument == "DOSPERT-inspired domain risk profile":
            evidence += (
                " Scenarios are original and this is not an official DOSPERT score."
            )
        updates.append(
            {
                "dimension_id": dim_id,
                "value": value,
                "confidence": "scale_complete" if complete else "scale_partial",
                "evidence": evidence,
                "sensitive": False,
                "instrument": instrument,
                "score": round(mean, 4),
                "answered_items": answered,
                "expected_items": expected,
                "raw_scores": raw_scores,
            }
        )
    return updates


def evidence_map(base: dict[str, Any]) -> dict[str, dict[str, Any]]:
    records: dict[str, dict[str, Any]] = {}
    for block in (
        "evidenced",
        "best_guess",
        "sensitive_evidenced",
        "sensitive_best_guess",
        "unresolved",
    ):
        for row in base.get(block, []):
            records[row["id"]] = deepcopy(row)
    return records


def blank_record(dim_id: str, meta: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": dim_id,
        "label": meta["label"],
        "category": meta["category"],
        "value": None,
        "value_claude": None,
        "confidence_claude": "unknown",
        "evidence_claude": "No Claude candidate was supplied for this dimension.",
        "value_chatgpt": None,
        "confidence_chatgpt": "unknown",
        "evidence_chatgpt": "No independent evidence in the available retained ChatGPT memory.",
        "selected_from": "none",
        "selection_reason": "No base candidate was supplied.",
        "selected_confidence": "unknown",
        "sensitive": False,
        "runtime_included": False,
        "needs_review": True,
    }


def merge_updates(
    base: dict[str, Any],
    updates: list[dict[str, Any]],
    by_id: dict[str, dict[str, Any]],
    order: list[str],
    saved_at: str,
    survey_id: str,
    survey_version: str,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    refined = deepcopy(base)
    records = evidence_map(refined)
    runtime = dict(refined.get("dimensions", {}))
    applied: list[dict[str, Any]] = []

    # Last direct response for a dimension wins. Scale groups are unique.
    deduped: dict[str, dict[str, Any]] = {}
    for update in updates:
        previous = deduped.get(update["dimension_id"])
        if (
            previous is None
            or SURVEY_CONFIDENCE_RANK[update["confidence"]]
            >= SURVEY_CONFIDENCE_RANK[previous["confidence"]]
        ):
            deduped[update["dimension_id"]] = update

    for dim_id, update in deduped.items():
        record = records.setdefault(dim_id, blank_record(dim_id, by_id[dim_id]))
        survey_rank = SURVEY_CONFIDENCE_RANK[update["confidence"]]
        previous_selected_confidence = record.get("selected_confidence", "unknown")
        base_rank = BASE_CONFIDENCE_RANK.get(previous_selected_confidence, 0.0)
        record["value_survey"] = update["value"]
        record["confidence_survey"] = update["confidence"]
        record["evidence_survey"] = update["evidence"]
        record["survey_saved_at"] = saved_at
        for key in ("instrument", "score", "answered_items", "expected_items"):
            if key in update:
                record[f"survey_{key}"] = update[key]
        record["sensitive"] = bool(record.get("sensitive") or update.get("sensitive"))

        selected = survey_rank > base_rank or update["confidence"].startswith(
            "self_report"
        )
        if selected:
            record["value"] = update["value"]
            record["selected_from"] = "survey"
            record["selected_confidence"] = update["confidence"]
            record["selection_reason"] = (
                "Current direct self-report overrides model-derived evidence."
                if update["confidence"].startswith("self_report")
                else "The completed or derived survey evidence has the higher confidence rank."
            )
            record.pop("runtime_exclusion_reason", None)
            if update["value"] is None:
                runtime.pop(dim_id, None)
                record["runtime_included"] = False
                record["needs_review"] = False
            else:
                runtime[dim_id] = update["value"]
                record["runtime_included"] = True
                record["needs_review"] = update["confidence"] == "scale_partial"
        applied.append(
            {
                **update,
                "selected_for_runtime": selected,
                "previous_selected_confidence": previous_selected_confidence,
            }
        )

    index = {dim_id: position for position, dim_id in enumerate(order)}
    sorted_records = sorted(
        records.values(), key=lambda row: index.get(row["id"], len(index))
    )
    blocks: dict[str, list[dict[str, Any]]] = {
        "evidenced": [],
        "best_guess": [],
        "sensitive_evidenced": [],
        "sensitive_best_guess": [],
        "unresolved": [],
    }
    for record in sorted_records:
        confidence = record.get("selected_confidence", "unknown")
        if record.get("value") is None:
            block = "unresolved"
        elif record.get("sensitive") and confidence == "best_guess":
            block = "sensitive_best_guess"
        elif record.get("sensitive"):
            block = "sensitive_evidenced"
        elif confidence == "best_guess":
            block = "best_guess"
        else:
            block = "evidenced"
        blocks[block].append(record)

    refined["dimensions"] = runtime
    for name, rows in blocks.items():
        refined[name] = rows
    meta = refined.setdefault("meta", {})
    meta.setdefault("schema_dimensions", len(order))
    meta["survey"] = {
        "survey_id": survey_id,
        "survey_version": survey_version,
        "saved_at": saved_at,
        "candidate_updates": len(applied),
        "runtime_dimensions": len(runtime),
        "confidence_rank": {**BASE_CONFIDENCE_RANK, **SURVEY_CONFIDENCE_RANK},
    }
    meta["runtime_dimensions"] = len(runtime)
    meta["mapped_dimensions"] = len(runtime)
    meta["rendered_dimensions"] = sum(
        len(rows) for rows in collect_dimension_items(runtime).values()
    )
    meta["dimensions_left_unset"] = int(meta["schema_dimensions"]) - len(runtime)
    return refined, applied


def refine_persona(
    *,
    base_persona_path: Path,
    definition_path: Path,
    responses_path: Path,
    schema_path: Path,
    output_path: Path,
    derived_path: Path | None = None,
) -> dict[str, Any]:
    base = load_yaml(base_persona_path)
    definition = load_json(definition_path)
    responses = load_json(responses_path)
    by_id, order = catalog(schema_path)
    direct, free_text = direct_updates(definition, responses, by_id)
    scales = scale_updates(definition, responses, by_id)
    saved_at = str(responses.get("saved_at") or utc_now())
    refined, applied = merge_updates(
        base,
        direct + scales,
        by_id,
        order,
        saved_at,
        str(definition.get("survey_id") or "matraix-adaptive-persona-survey"),
        str(definition.get("version") or "unknown"),
    )
    refined["survey_free_text"] = free_text
    atomic_write_text(output_path, dump_readable_yaml(refined))
    summary = {
        "generated_at": utc_now(),
        "responses_saved_at": saved_at,
        "output": str(output_path),
        "runtime_dimensions": len(refined["dimensions"]),
        "candidate_updates": len(applied),
        "selected_updates": sum(1 for item in applied if item["selected_for_runtime"]),
        "free_text_responses": len(free_text),
        "updates": applied,
    }
    if derived_path is not None:
        atomic_write_text(
            derived_path, json.dumps(summary, indent=2, ensure_ascii=True) + "\n"
        )
    return summary
