# Codex bootstrap instructions

Follow this file from the cloned repository root. The goal is a private local install in `~/Desktop/MatrAIx`, not a change to the repository. Do not edit tracked files, commit persona data, or upload user material.

## 1. Confirm the checkout and prerequisites

1. Confirm the working directory is `~/Desktop/MatrAIx` and that its Git remote is `fredibeni/MatrAIx`.
2. If the destination existed before this task, do not replace, clean, reset, or delete it. Ask the user what to do.
3. Check `git status --short`. Preserve and report any existing changes. Do not revert them.
4. Confirm that `python3.11`, `python3.12`, `python3.13`, or another `python3` reporting version 3.11 or newer is available.
5. Run the installer:

```bash
./install.sh
```

The installer creates only `matraix/.venv` and installs the three pinned packages in `matraix/requirements.txt`. If Python is missing, report the installer's exact message. Do not silently install a system package manager or a different Python distribution.

## 2. Establish the evidence boundary

Before assessing any persona dimension, list the user-authored sources that this task can genuinely inspect. Eligible sources are limited to:

- Explicit statements written by the user in the current task.
- Files the user attached, selected, or placed in scope and that are actually readable.
- Local Codex memories that are exposed to this task or are available through the documented local memory store, when the installation prompt authorizes their use.
- ChatGPT memory, ChatGPT history, Computer History, or a ChatGPT export only when that specific source is genuinely available to this task and can be inspected.

Do not treat any of the following as user evidence:

- Assistant-authored replies, generated summaries, or model speculation.
- Bundled persona examples, survey defaults, schema defaults, tests, or application copy.
- Population averages, stereotypes, or facts inferred only from an account name, file path, device name, or operating-system metadata.
- A source that the task cannot actually open. Mentioning a source is not evidence of access to it.

The desktop Codex app does not guarantee access to a complete ChatGPT archive. Local Codex memory and ChatGPT memory are separate sources and must not be described as the same thing. Record exactly what was available, what was reviewed, and what was unavailable. Do not block the installation just because full history is unavailable.

Keep raw source content out of tracked files. Store only short factual evidence notes in the private candidate file. If the user supplied source files that must remain with the install, put them only under `matraix/personal-persona/source-material/`, which is ignored by Git.

## 3. Review the complete dimension schema

Use `matraix/persona/schema/dimensions.json` as the sole authority for dimension IDs, categories, and allowed values. The current schema contains many dimensions across many categories, so process it systematically rather than searching only for familiar traits.

1. Enumerate every unique `category` in the schema.
2. Within each category, review every dimension and its exact `values` list against the eligible evidence.
3. Add a candidate only when the evidence supports one exact allowed value. Unsupported dimensions stay unset. Do not fill them with a default, midpoint, or plausible-sounding guess.
4. Mark the schema review complete only after every category has been considered. In the candidate file, `"schema_categories_reviewed": ["*"]` means all current schema categories were actually reviewed. It must not be used as a shortcut.
5. Record limitations such as missing full ChatGPT history, narrow time coverage, stale evidence, or a source concentrated in one area of life.

Use [the confidence guide](matraix/personal-persona/CONFIDENCE_LEVELS.md) for every included candidate. The only history-extraction confidence values are `stated`, `strong_inference`, `best_guess`, and `unknown`.

Sensitive dimensions are listed in `matraix/personal-persona/sensitive-dimensions.json`. Any history-derived candidate in that policy must have `runtime_included: false`, even when confidence is `stated`. The user can confirm or keep it private in Update persona later.

## 4. Write the private candidate JSON

Write the result to:

```text
matraix/personal-persona/survey/data/persona-candidates.json
```

The entire `survey/data/` directory is ignored by Git. Never print the full candidate file into the task transcript. Immediately after writing it, run `chmod 600 matraix/personal-persona/survey/data/persona-candidates.json`. The document must have this shape:

```json
{
  "schema_version": 1,
  "persona": {
    "persona_id": "local-persona",
    "display_name": "MatrAIx persona",
    "version": "1.0"
  },
  "source_coverage": {
    "generated_at": "CURRENT_UTC_TIMESTAMP",
    "sources": [],
    "schema_categories_reviewed": ["*"],
    "limitations": []
  },
  "candidates": []
}
```

Replace `CURRENT_UTC_TIMESTAMP` with the actual generation time. Use a user-supported `persona_id` and `display_name` when available. Otherwise retain the generic identity shown above rather than inferring a name from system metadata.

For each source in `source_coverage.sources`, use:

```json
{
  "id": "unique-source-id",
  "type": "current_task",
  "description": "What user-authored material was actually reviewed.",
  "items_reviewed": 1,
  "limitations": []
}
```

Allowed source types are `current_task`, `memory`, `chatgpt_history`, `codex_history`, `chatgpt_export`, `user_file`, `user_statement`, and `other`. `items_reviewed` must be a real non-negative count. Optional `start_date` and `end_date` fields may describe genuine source coverage.

For each supported dimension in `candidates`, use:

```json
{
  "id": "exact_schema_dimension_id",
  "value": "Exact allowed schema value",
  "confidence": "stated",
  "evidence": "Short factual note identifying the support and relevant context.",
  "source_refs": ["unique-source-id"],
  "as_of": "YYYY-MM-DD",
  "runtime_included": true
}
```

Rules for candidate records:

- Use each dimension ID at most once.
- Use an exact value from that dimension's `values` array.
- Cite at least one declared source for every non-unknown value.
- Use `as_of` only when the date or time context is known.
- Set `runtime_included: true` for supported, non-sensitive values that should affect the persona.
- Treat `best_guess` as provisional. Include it at runtime only when it is non-sensitive, has positive evidence, and is useful despite the uncertainty.
- Omit unsupported dimensions to keep the file small. If an explicit unknown audit record is useful, set `value` to `null`, `confidence` to `unknown`, and `runtime_included` to `false`, and explain the gap in `evidence`.
- Never include a sensitive history-derived value at runtime.

If no personal evidence is available, keep `sources` and `candidates` empty, list the missing sources under `limitations`, and still record that every schema category was reviewed. This produces a valid sparse persona and is preferable to invented facts.

## 5. Compile and validate

Run:

```bash
./build-persona.sh compile
./build-persona.sh validate
./matraix/personal-persona/start-chat.sh --dry-run
```

Compilation writes:

- `matraix/personal-persona/persona.yaml` - the active persona.
- `matraix/personal-persona/survey/data/persona-build-report.json` - validation counts and coverage.

The builder validates candidate IDs, enum values, confidence labels, source references, sensitive-field exclusions, runtime rendering, private file modes, and Git ignore rules. Fix the candidate data and rerun both commands if any check fails. Do not use `--skip-private-checks` during installation.

Verify every private artifact is ignored:

```bash
for private_path in \
  matraix/personal-persona/persona.yaml \
  matraix/personal-persona/survey/data/persona-candidates.json \
  matraix/personal-persona/survey/data/persona-build-report.json
do
  git check-ignore -q -- "$private_path" || exit 1
done
```

Use the build report for counts and the candidate's `source_coverage` for reviewed categories and limitations. In the completion summary, report the number of candidates at each confidence level, the number included at runtime, the number withheld as sensitive, the categories reviewed, and the source limitations. Do not quote private evidence text.

## 6. Start the app

Run `./start-local.sh` in a persistent terminal session. Wait for the local URL and chat status, then confirm that `http://127.0.0.1:8766/#chat` opens. Keep that process running for the user.

If the app starts but Chat reports that Codex is not signed in, preserve the running local app and tell the user to run `codex login` and choose ChatGPT sign-in. Update persona and Validation can still be inspected locally.

## 7. Graceful fallback

Missing history is an evidence limitation, not an installation failure. When a complete ChatGPT history or memory source is unavailable:

- State that it was unavailable without implying that it was inspected.
- Use any narrower eligible sources that are genuinely available.
- Build and validate a sparse persona, including an empty candidate list when necessary.
- Start the app normally.
- Direct the user to Update persona to fill gaps.
- Mention that the user can later attach a ChatGPT export or selected user-authored files and ask Codex to rebuild the candidate file.

Do not ask the user to paste passwords, access tokens, or an entire private archive into a public location. Do not prevent the user from using the app merely because persona coverage is incomplete.
