# Choiceprint evaluation - development protocol

This directory documents the blind forced-choice evaluator implemented in
[`evaluate_choiceprint.py`](../scripts/evaluate_choiceprint.py).

The evaluator is a development tool. It does not certify that Choiceprint can
imitate a person generally, and a successful run does not make any domain
validated automatically. It measures whether one frozen Choiceprint export
predicts a person's held-out choices better than four simpler or ablated context
conditions in the tested domain.

## Required private data

Create a private holdout with at least 30 new, independent forced-choice cases
for each domain proposed for validation. For the first pilot, use one narrow,
low-stakes domain and balance the 30 canonical cases across at least six
scenario families. Each case should have three to five plausible options and
must not repeat a development case, a survey item, or a decision already stored
in the Twin Pack.

A human must also review the proposed holdout for semantic overlap. Automated
ID and text checks cannot reliably detect a rewritten version of a known case.
The freeze command requires a completed, hash-bound owner review receipt. A
bare command-line assertion is not accepted.

The 30 cases are a pilot floor, not proof of validation. Prompt variants and
repeated model samples do not increase the number of independent human cases.

Keep the questions, human answers, frozen run, predictions, and score outputs:

- Outside every `.choiceprint` pack, retrieval index, and ChatGPT Project.
- Outside the repository, preferably in an owner-only private directory.
- Or, for local development only, under the ignored fallback
  `matraix/personal-persona/source-material/choiceprint-evals/`.
- In directories with mode `0700` and files with mode `0600` where the
  operating system supports POSIX permissions.

Never commit or upload real holdout questions, answers, predictions, or score
reports. The public examples below are fictional schema examples only.

## Initial five conditions

Every frozen schedule runs the same scenarios under five conditions:

| Condition | Context supplied to the model |
| --- | --- |
| `generic` | No personal context |
| `matraix_yaml` | The existing MatrAIx YAML rendered as a persona identity |
| `narrative` | A frozen narrative profile supplied by the evaluator |
| `choiceprint_without_cases` | The same frozen Choiceprint adapter with `03-DECISION-CASES.md` omitted |
| `choiceprint` | The frozen ChatGPT Project adapter compiled from the Twin Pack |

This five-way comparison tests whether the Choiceprint representation adds
value over a generic model, the MatrAIx YAML, and a simple narrative. The
`choiceprint_without_cases` ablation also isolates whether observed decisions
add predictive value beyond the rest of the pack. A later release gate should
test selective retrieval, current-state handling, grounding, and safety
behavior.

The generic condition is intentionally allowed to use general human priors.
The four personalized conditions are not: they must select
`__INSUFFICIENT_EVIDENCE__` when the supplied personal evidence cannot
responsibly rank the options. This prevents generic priors from being mistaken
for persona fidelity. The condition-policy mapping is hashed into the sealed
run manifest, and any later change invalidates the run. Refreeze an existing
run after changing this policy or the common prompt template.

The runner uses the Codex CLI with the user's ChatGPT subscription. It does not
run the ChatGPT web application or a ChatGPT Project. Model identifiers,
runtime behavior, project instructions, memory, and available features can
differ, so these results cannot be presented as evidence about ChatGPT web.
The ChatGPT Project adapter needs its own isolated end-to-end evaluation.

## Record formats

Questions are JSON Lines. Each case needs exactly one `canonical` variant.
Optional paraphrases reuse the same `case_id` and option IDs with a different
`variant_id`. The evaluator rejects answer-like fields in question records.

```json
{"schema_version":1,"case_id":"fictional-weekend-001","variant_id":"canonical","domain":"low_stakes_planning","family":"weekend_activity","prompt":"A fictional person has a free afternoon. Which plan would they choose?","options":[{"id":"a","text":"Visit a familiar museum"},{"id":"b","text":"Try a new climbing class"},{"id":"c","text":"Stay home and read"}],"stakes":"low","reversibility":"high","time_horizon":"one_day","social_context":"solo","created_at":"2030-01-01T09:00:00Z"}
```

Answers are a separate JSON Lines file. They contain one record per `case_id`,
not one per paraphrase. The answer file must cover the frozen cases exactly.

```json
{"schema_version":1,"case_id":"fictional-weekend-001","selected_option_id":"c","answered_at":"2030-01-02T09:00:00Z"}
```

The example person and dates are fictional. Do not copy that answer into a real
evaluation.

## Blind workflow

Use a local preflight followed by the sealed evaluation commands so predictions
are complete before human answers exist. The prospective sequence is preflight,
human review, freeze, run, finalize, collect answers, retest, then score.

### 0. Create the local human-review packet

Before attesting that the holdout is semantically new, generate a private,
answer-free review packet:

```bash
matraix/.venv/bin/python digital-twin/scripts/evaluate_choiceprint.py preflight \
  --questions /private/path/questions.jsonl \
  --persona matraix/personal-persona/persona.yaml \
  --narrative /private/path/narrative.md \
  --choiceprint matraix/personal-persona/digital-twin/person.choiceprint \
  --samples 5 \
  --out /private/path/holdout-review
```

The packet contains `preflight.json`, `human-overlap-review.md`, and the mode
`0600` `semantic-overlap-review.json` receipt. It displays every holdout
question beside answer-stripped development scenarios, checks exact ID and
normalized-content overlap, reports context sizes, and states the model-call
budget. It does not run Codex, access human answers, or authorize cloud
processing. For 30 canonical cases, five conditions, and five samples, the
frozen run contains 750 model calls. Adding one paraphrase variant for every
case doubles that schedule to 1,500 calls. The variants test robustness but do
not increase the number of independent human cases.

The owner must personally review the packet. Use the local interactive reviewer
to record the decisions without editing the generated template:

```bash
./choiceprint.sh holdout-review \
  --questions /private/path/questions.jsonl \
  --pack matraix/personal-persona/digital-twin/person.choiceprint \
  --template /private/path/holdout-review/semantic-overlap-review.json \
  --output /private/path/holdout-review/semantic-overlap-review.completed.json
```

The reviewer shows the answer-stripped development scenarios, both variants of
each holdout case, and all options. It requires an explicit `approve` or
`reject` for every canonical case and an explicit `yes` or `no` for each
checklist item. Rejections require notes and are preserved in a completed but
non-freeze-ready receipt. The command writes a new mode `0600` file only after
final confirmation. It never edits the template, invokes a model, accesses
human answers or predictions, or authorizes cloud processing. Cancelling,
end-of-file, or an interrupted review writes no receipt.

Do not alter the recorded question or Choiceprint build hashes. Regenerate the
preflight packet if either source changes. Freeze fails if the receipt is
incomplete, contains a rejected case, has unexpected fields or case IDs, is a
symlink or non-regular file, is not mode `0600`, has a future review time, or
does not match the current questions and Choiceprint build.

### 1. Freeze the protocol

Prepare the private question file, a frozen narrative profile, the current
MatrAIx YAML, and a validated Choiceprint pack. Decide the pilot gate before
seeing any results. Then freeze the questions, contexts, prompt template,
condition-specific prediction policies, explicit model, gate thresholds,
random schedule, runtime fingerprint, and file hashes:

```bash
matraix/.venv/bin/python digital-twin/scripts/evaluate_choiceprint.py freeze \
  --questions /private/path/questions.jsonl \
  --persona matraix/personal-persona/persona.yaml \
  --narrative /private/path/narrative.md \
  --choiceprint matraix/personal-persona/digital-twin/person.choiceprint \
  --model MODEL_ID \
  --reasoning-effort low \
  --samples 5 \
  --context-cutoff 2030-01-01T00:00:00Z \
  --semantic-review /private/path/holdout-review/semantic-overlap-review.completed.json \
  --authorize-cloud-processing \
  --minimum-domain-items 30 \
  --minimum-scenario-families 6 \
  --required-retest-items 15 \
  --minimum-choiceprint-accuracy 0.70 \
  --minimum-choiceprint-coverage 0.80 \
  --minimum-delta-over-strongest-baseline 0.05 \
  --minimum-delta-ci95-lower-bound 0.00 \
  --maximum-high-stability-wrong-rate 0.10 \
  --minimum-human-retest-agreement 0.80 \
  --out /private/path/frozen-run
```

`MODEL_ID` must be an explicit model identifier, not `default`. Record the
exact model intended for the whole run. `--semantic-review` is required and
must point to the completed owner receipt created from the matching preflight
template by the interactive reviewer.
The evaluator copies that receipt into the frozen run, hashes it with the other
frozen files, and records its digest and review timestamp in the sealed source
attestation. The `--authorize-cloud-processing` flag authorizes sending every
frozen condition context and scenario to OpenAI. Only use it when the owner has
reviewed the private content and approved that processing.

The point-delta threshold sets the minimum useful improvement over the strongest
baseline. The separate CI threshold requires the lower end of the paired 95%
bootstrap interval to strictly clear a pre-registered floor; its default of zero
requires evidence that the improvement remains positive after accounting for sampling
uncertainty. These and the other displayed gate thresholds are initial product
policies, not universal scientific cutoffs. Change them only on a documented
basis and always before running predictions. They are sealed into the run
manifest so they cannot be tuned after results are known.

The freeze command has no answer argument and records that answer data was not
accessed. Use `--retrospective` only when pre-existing human answers make the
prospective ordering impossible, and treat the result as weaker evidence. A
retrospective run still requires complete, finalized predictions before
scoring.

Do not change the model, reasoning effort, context, questions, or scoring plan
after the freeze. The evaluator seals and hashes frozen inputs and rejects
later changes.

### 2. Run predictions without human answers

Run the complete frozen schedule before collecting human answers:

```bash
matraix/.venv/bin/python digital-twin/scripts/evaluate_choiceprint.py run \
  --manifest /private/path/frozen-run/run-manifest.json
```

The `run` command deliberately has no answer argument. It launches isolated
Codex CLI prompts and supplies only the frozen condition context, scenario,
options, and output schema. It does not give the model a file tool, browser,
shell, conversation history, or answer path. Interrupted runs can be resumed.
Use `--limit NUMBER` for a controlled partial run.

The runner deterministically counterbalances option order from each frozen
schedule ID. It also omits condition names from the model prompt, so the model
sees the supplied context but is not told whether it came from `generic`,
`matraix_yaml`, `narrative`, or `choiceprint`. The frozen schedule and recorded
hashes make that transformation reproducible.

### 3. Finalize predictions before collecting answers

After every scheduled prediction has completed, seal the prediction file:

```bash
matraix/.venv/bin/python digital-twin/scripts/evaluate_choiceprint.py finalize \
  --run /private/path/frozen-run
```

Finalization verifies that the prediction schedule is complete, records its
digest and timestamp, and prevents later prediction changes. It is mandatory.
Do not collect the person's answers until this command succeeds. For a normal
prospective run, scoring rejects any `answered_at` timestamp earlier than the
finalization timestamp. Only a run frozen with `--retrospective` may use older
answer timestamps.

### 4. Collect answers, retest, then score offline

After finalization, the person should answer the scenarios locally without
ChatGPT or Codex administering them. Store those answers at a private path that
is outside the frozen run. Do not upload them, place them in any model context,
or expose them through chat memory.

Use the local first-pass collector to show only canonical question text and
options. It deterministically randomizes case and option presentation while
preserving the original option IDs in the answer records:

```bash
matraix/.venv/bin/python digital-twin/scripts/collect_choiceprint_answers.py \
  --questions /private/path/frozen-run/questions.jsonl \
  --out /private/path/answers.jsonl \
  --seed 20260919 \
  --ask-confidence
```

The collector never calls a model and has no arguments for persona context,
predictions, or prior answers. It keeps responses in memory until every case
is complete, then atomically creates a mode `0600` JSONL file. It refuses
existing outputs, symlinks, repository paths outside the ignored evaluation
fallback, and paths inside a `.choiceprint` pack. Canceling before completion
leaves no partial answer file. `--ask-confidence` adds an optional value from
0 to 1; it does not collect rationales.

Before viewing predictions or results, repeat a balanced 15-case subset after
7 to 14 days. Use the local retest mode with an explicit presentation seed and
case count:

```bash
./choiceprint.sh collect-retest \
  --questions /private/path/frozen-run/questions.jsonl \
  --answers /private/path/answers.jsonl \
  --output /private/path/answers-with-retest.jsonl \
  --seed 20260926 \
  --count 15
```

Retest mode uses the first-pass file only to bind case IDs, verify the 7 to 14
day timing window, preserve its records, and create a new answer file. It never
shows prior selections or uses them to choose the subset. The subset is
deterministic for the explicit seed and balanced across scenario families by
round-robin allocation. Case and option presentation are independently
shuffled.

The command refuses first-pass files that already contain retest fields,
existing output paths, unsafe permissions, symlinks, repository paths outside
the ignored evaluation fallback, and paths inside a `.choiceprint` pack. It
publishes only after the full answer set passes evaluator validation, and it
leaves the first-pass file unchanged. The new records add
`retest_selected_option_id` and `retest_answered_at` only to the selected cases:

```json
{"schema_version":1,"case_id":"fictional-weekend-001","selected_option_id":"c","answered_at":"2030-01-02T09:00:00Z","retest_selected_option_id":"c","retest_answered_at":"2030-01-12T09:00:00Z"}
```

The retest estimates the person's own answer stability. It is not a claim of
human equivalence, and Choiceprint accuracy should be reported both raw and in
the context of that retest agreement.

Only the offline score command receives the completed private answer path. It requires a
valid finalization seal, verifies that predictions have not changed, and checks
the prospective answer timestamps unless the manifest is retrospective:

```bash
matraix/.venv/bin/python digital-twin/scripts/evaluate_choiceprint.py score \
  --run /private/path/frozen-run \
  --answers /private/path/answers-with-retest.jsonl \
  --out /private/path/scored-run
```

The private score directory contains `summary.json`, `items.jsonl`, `report.md`,
`score-evidence.json`, and `score-evidence.sha256`. The evidence record binds
the exact frozen run, prediction finalization, answers, source pack, and score
outputs; its private random nonce prevents its digest from becoming a practical
dictionary oracle over answer data. Keep all five files outside the deployable
pack and repository because they contain or reveal human answers.

## Interpreting a run

The primary metric is case-mean forced-choice accuracy with abstentions counted
as wrong. It uses only each case's `canonical` variant. Paraphrase variants are
used for robustness diagnostics and do not inflate the primary sample size.

The report also includes selective accuracy, coverage, modal accuracy across
samples, fractional top-2 accuracy, multiclass Brier score, uniform-random
chance, modal stability, high-stability errors, paraphrase agreement,
per-domain results, bootstrap intervals, and paired Choiceprint differences
against the four baselines and ablations.

Modal stability is the share of repeated samples selecting the modal answer.
The frozen diagnostic threshold is `0.8`. A high-stability wrong case is one
where at least that share converges on the wrong option. This is a consistency
diagnostic, not calibrated probability or model confidence. The per-domain
high-stability wrong rate is part of the frozen pilot gate.

Repeated samples estimate model variability. They are not additional human
observations. A 30-case result is a pilot and should be described as such.
Review item-level errors and confidence intervals, not only a headline score.

`summary.json` reports `pilot_gate_by_domain` with every frozen criterion and
its pass or fail result. It also reports `all_domain_pilot_gates_met`. The gate
checks case count, scenario-family count, retest count and agreement,
Choiceprint accuracy and coverage, improvement over the strongest baseline,
and the high-stability wrong rate.

Passing that automated gate is still only a pilot result. Scoring always
records `validated_domains_updated: false` and never edits the Twin Pack
manifest. Any later promotion of a domain requires a separate human release
decision, review of uncertainty and item-level failures, and separate safety
evidence. A prospective finalized run with at least one passing domain can be
prepared for review with:

```bash
./choiceprint.sh coverage-review prepare \
  --pack /private/path/person.choiceprint \
  --run /private/path/eval-run \
  --answers /private/path/answers-with-retest.jsonl \
  --score /private/path/score \
  --output /private/path/coverage.pending.json

./choiceprint.sh coverage-review interactive \
  --pack /private/path/person.choiceprint \
  --input /private/path/coverage.pending.json \
  --output /private/path/coverage.completed.json \
  --run /private/path/eval-run \
  --answers /private/path/answers-with-retest.jsonl \
  --score /private/path/score

./choiceprint.sh coverage-apply \
  --pack /private/path/person.choiceprint \
  --review /private/path/coverage.completed.json \
  --run /private/path/eval-run \
  --answers /private/path/answers-with-retest.jsonl \
  --score /private/path/score \
  --output /private/path/person.coverage-release.choiceprint
```

Before freezing the holdout, add each intended domain as a bounded lowercase
slug under `coverage.declared_domains` in private curation and rebuild the pack.
The first command recomputes and verifies the integrity-bound score evidence
and includes only gate-passing domains from that pack-owned taxonomy. The
second requires explicit owner decisions. The third re-verifies every binding
and creates a new pack; it never mutates the evaluated pack or
copies private evaluation content into the release. Approved domains are
append-only validation events and can later be revoked through a separate
owner review. A revocation's free-text owner note remains in the private receipt
while the pack receives only a closed public reason code. Review, record, and
build timestamps are checked in order, including across each domain's event
chain. The pack still remains globally `development_only`, so a narrow
domain result cannot be presented as broad persona reliability.

## What this pilot does not test

The current harness covers forced-choice prediction only. It does not establish
reliability for rankings, multi-select choices, rating scales, free-form
decisions, writing style, factual grounding, temporal updates, tool use, or
high-stakes decisions. Those need separate task-appropriate evaluations and
must not be inferred from this score.
