# Persona confidence levels

Use this guide when turning genuinely available user-authored sources into a MatrAIx candidate file. Those sources may include an inspectable part of ChatGPT history, local memory, explicit user statements, or user-supplied files. Assign confidence separately for every candidate dimension.

Confidence measures how well the available evidence supports the exact selected schema value. It does not measure how important, useful, stable, or safe to include that dimension is.

Access to a complete ChatGPT history is not guaranteed. Never label history or memory as reviewed unless the active task could actually inspect it. When a source is unavailable, record that limitation and leave unsupported dimensions unset.

## Confidence levels for source extraction

The private candidate JSON must use exactly one of these four values in `confidence`. The compiler copies it to `confidence_chatgpt` and `selected_confidence` in the generated persona YAML:

| Level | Rank | Use it when | Do not use it when |
| --- | ---: | --- | --- |
| `stated` | 3 | The user explicitly stated the fact, trait, or preference, or an authoritative user-supplied document states it unambiguously. A deterministic normalization to an allowed schema value is acceptable when it adds no assumption. | The value depends on interpreting behavior, filling a gap, or choosing between several plausible schema values. |
| `strong_inference` | 2 | Multiple independent, specific, and consistent signals converge on the same value, with no material contradiction. A direct fact that needs one reasonable but unconfirmed derivation can also qualify. | There is only one weak clue, the clues all come from the same repeated prompt or template, or a meaningful alternative remains equally plausible. |
| `best_guess` | 1 | At least one attributable clue supports the value, but the evidence is sparse, context-specific, stale, or ambiguous. Treat the value as provisional and ask the user to confirm it. | There is no positive evidence. Silence, a schema default, a population average, or a stereotype is not a best guess. |
| `unknown` | 0 | There is no independent evidence, evidence conflicts, evidence is too stale, or the history cannot support one exact allowed value. Leave the dimension unset. | A supported value can be assigned at one of the three higher levels. |

The order is:

```text
stated > strong_inference > best_guess > unknown
```

Copy these strings exactly. The persona compiler rejects unrecognized confidence strings.

## Decision test

Apply these questions in order for each dimension:

1. Is there a clear, attributable, reasonably current user statement or user-supplied source that establishes the value? Use `stated`.
2. If not, do at least two independent signals converge on one exact allowed value without a material contradiction, or does one established fact support the value through one reasonable derivation? Use `strong_inference`.
3. If not, is there at least one credible indirect signal that makes one value more plausible than the alternatives? Use `best_guess`.
4. Otherwise use `unknown` and do not add a value to the top-level `dimensions` mapping.

One direct statement can be enough for `stated`. Repetition is not required. For `strong_inference`, repeated copies of the same instruction, one continuing conversation, or one source quoted several times count as one signal, not several.

## Examples

- A user-supplied CV explicitly lists an MSc. `highest_education: Master's` can be `stated` because the schema mapping is deterministic.
- Education and career dates from independent records consistently place the person in the same age bracket, but the person never states their age. The bracket can be `strong_inference`.
- One isolated request suggests a preference, but it may only reflect that task. The preference can be `best_guess` if one schema value is genuinely more plausible.
- The history says nothing about religion. The value is `unknown`, not the schema default and not a demographic guess.

## Evidence that must not be promoted

Downgrade confidence or use `unknown` when any of these apply:

- The evidence describes what the assistant produced rather than what the user did, knows, uses, or prefers.
- A request for a deliverable is being treated as proof of the user's skill, use frequency, or personal preference.
- The apparent pattern was imposed by an app, template, role, or task.
- The evidence is old and the dimension describes a current state, location, device, job, or routine.
- Different periods or sources support different values and neither clearly supersedes the other.
- The value relies on a demographic stereotype, population prior, schema default, or neutral midpoint.
- The exact evidence cannot be mapped to one allowed enum value without an extra assumption.
- The available history is heavily sampled from one part of the person's life.

Sensitive or private traits should normally remain `unknown` unless the user stated them or supplied authoritative evidence. Strong evidence does not automatically make a sensitive value suitable for the runtime persona.

## Candidate JSON recording rules

Write candidates to `survey/data/persona-candidates.json` using the format in the repository bootstrap guide. For every supported value:

- Use the exact dimension ID and allowed value from `matraix/persona/schema/dimensions.json`.
- Put the level in `confidence` and a short factual support note in `evidence`.
- Identify every supporting declared source in `source_refs`.
- Add `as_of` when the evidence has meaningful time context.
- Set `runtime_included` separately from confidence. A well-supported value can still be excluded because it is sensitive, private, volatile, or irrelevant to runtime behavior.
- When confidence is `unknown`, set `value` to `null` and `runtime_included` to `false`. It is usually simpler to omit unsupported dimensions entirely.
- Never set a sensitive history-derived candidate to `runtime_included: true`. The compiler enforces this rule using `sensitive-dimensions.json`.
- A non-sensitive `best_guess` may be included provisionally only when positive evidence exists and the provisional value is useful. Update persona will still ask the person to confirm it.

Example of a direct, non-sensitive candidate:

```json
{
  "id": "highest_education",
  "value": "Master's",
  "confidence": "stated",
  "evidence": "A user-supplied CV explicitly lists an MSc in Finance.",
  "source_refs": ["cv-file"],
  "as_of": "2026-09-01",
  "runtime_included": true
}
```

The compiler creates the YAML evidence blocks, copies only runtime-approved values into the top-level `dimensions` mapping, and validates that every included value retains its evidence and confidence. Do not hand-edit the compiled YAML to bypass those rules.

## Conflicts and repeated evidence

The candidate file permits each dimension ID only once, so reconcile all source evidence before writing that record:

- A clearly supported, higher-confidence and newer value may supersede a weaker candidate when the dimension can change over time.
- Equal confidence and the same value is corroboration, not two separate candidates.
- Equal confidence and different values is unresolved. Use `unknown` or omit the candidate rather than choosing a default or average.
- Recency may resolve a conflict only when the dimension is time-sensitive and the newer evidence clearly supersedes the older evidence. Record that reason.

## App-generated confidence levels

The app may later write these additional levels:

| Level | Rank | Meaning |
| --- | ---: | --- |
| `scale_partial` | 1.5 | An incomplete multi-item scale produced a provisional result. |
| `scale_complete` | 4 | Every required item in a scale was answered. |
| `derived_self_report` | 4.5 | The app deterministically derived the value from direct answers. |
| `self_report` | 5 | The person directly selected the current value in the app. |
| `self_report_unknown` | 5 | The person explicitly chose to remove the current guess and leave the value unknown. |
| `self_report_private` | 5 | The person explicitly chose to keep the value out of the runtime persona. |

Do not assign these six levels during source extraction. `provided` is also an internal fallback for a plain YAML value with no evidence row, not a confidence value to write.

## Compact extraction instruction

```text
Use only user-authored sources that this task can genuinely inspect. Review every category in the MatrAIx dimension schema. For every supported dimension, select one exact allowed value and assign exactly one confidence: stated, strong_inference, best_guess, or unknown. Use stated only for an explicit user statement or unambiguous user-supplied source. Use strong_inference only when independent, consistent signals converge on one value or one established fact supports the value through one reasonable derivation. Use best_guess only when at least one attributable clue supports a provisional value. Use unknown when evidence is absent, conflicting, stale, stereotype-based, default-based, or cannot support one exact enum. Do not infer personal facts from assistant-authored output. Do not fill gaps with defaults. Write a short factual evidence note and source reference for every non-unknown candidate. Keep sensitive history-derived values out of the runtime. Record unavailable history or memory as a limitation instead of pretending it was reviewed.
```
