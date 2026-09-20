# Choiceprint Twin Pack

Choiceprint is a portable, evidence-backed personal choice model for ChatGPT.
It is designed to predict likely choices within measured domains, explain the
evidence behind a prediction, and abstain when the available personal evidence
is not strong enough.

It is not a claim that a language model is the person, and it is not a promise
of reliable imitation in every possible scenario.

## Why this is a bundle rather than one persona file

A flat persona YAML is useful for compact traits and compatibility. It is not
enough for reliable choice prediction because it does not adequately represent:

- Context-dependent decisions and trade-offs.
- Actual choices, rejected alternatives, and exceptions.
- Source provenance, contradictions, and uncertainty.
- Facts and preferences that change over time.
- Safety boundaries and permissions.
- A held-out evaluation set that is kept away from the model.

Choiceprint keeps the existing persona dimensions as a legacy feature layer and
adds the missing evidence, behavior, time, policy, and evaluation layers.

## Product layers

The complete product has four forms:

1. The canonical Twin Pack is the private, versioned source of truth.
2. The ChatGPT Project Pack is a small text-first export for immediate preview
   and personal use in a ChatGPT Project. It is not a reliability-certified
   runtime.
3. The local retrieval core selects a bounded, scenario-specific context from
   the canonical pack.
4. The MCP development adapters expose that core as one read-only tool. The
   owner CLI uses local stdio. A separate authenticated Streamable HTTP ASGI
   factory provides a host integration seam without opening a port.

The static ChatGPT Project Pack is the implemented zero-service adapter. The
deterministic retrieval core, private local MCP stdio adapter, and authenticated
HTTP application factory are also implemented. Both transports expose exactly
one read-only, closed-world tool, fix the canonical pack path at process
startup, support only `predict-choice` and `write-in-style`, and cap returned
context at 12,000 UTF-8 bytes. The HTTP factory requires an injected token
verifier, an HTTPS issuer and resource identifier, resource-audience checking,
and the `choiceprint.context.read` scope. It is not a hosted service and does
not issue tokens. The core validates the canonical pack, enforces consented modes, source
authorization, sensitivity, runtime eligibility, expiry, and the byte budget.
It returns the applicable boundary document but does not yet interpret or
enforce its free-text rules. Reliability-certified use therefore still
requires isolated evaluation and the complete tested runtime contract.

The compiler generates the ChatGPT adapter only after the owner records explicit
authorization in a reviewed curation file. A persona-only build still creates a
valid canonical pack, but it intentionally omits `adapters/chatgpt-project/`.

## Canonical layout

```text
person.choiceprint/
|-- manifest.json
|-- build-metadata.json
|-- profile/
|   |-- overview.yaml
|   |-- claims.jsonl
|   |-- decision-policies.yaml
|   |-- decision-cases.jsonl
|   |-- counterexamples.jsonl
|   |-- current-state.yaml
|   `-- legacy-dimensions.yaml
|-- evidence/
|   |-- sources.jsonl
|   |-- conflicts.jsonl
|   `-- consent.yaml
|-- safety/
|   `-- boundaries.yaml
|-- evals/
|   |-- development.jsonl
|   `-- holdout-private.jsonl
`-- adapters/
    `-- chatgpt-project/
        |-- PROJECT-INSTRUCTIONS.md
        |-- 00-READ-FIRST.md
        |-- 01-CORE-PROFILE.md
        |-- 02-DECISION-RULES.md
        |-- 03-DECISION-CASES.md
        |-- 04-COUNTEREXAMPLES.md
        |-- 05-CURRENT-CONTEXT.md
        |-- 06-BOUNDARIES.md
        |-- 07-EVIDENCE-INDEX.md
        |-- 08-CONFLICTS.md
        `-- 09-CONSENT.md
```

`evals/holdout-private.jsonl` is an empty placeholder in a deployable pack. Real
holdout answers must be stored physically outside every deployable pack,
retrieval index, and ChatGPT Project. Evaluation should use an isolated runner
or clean project with cross-chat memory disabled. Otherwise, uploaded data or
account memory could leak answers and invalidate the evaluation.

`build-metadata.json` binds every generated file to a SHA-256 digest. The
validator rejects changed, missing, or unlisted files so a stale adapter cannot
silently disagree with canonical sensitivity or consent records.

`profile/overview.yaml` is the canonical short profile used to compile the
runtime introduction. It contains the reviewed summary, communication style,
known gaps, sensitivity, runtime inclusion decision, and source references.
The adapter is regenerated from this file and the other canonical records, so
editing generated Markdown is detected as drift.

## Use in ChatGPT

ChatGPT Projects can keep files, sources, and project instructions available
across related chats. A ChatGPT Project does not directly read an arbitrary
local folder, so its source files must be uploaded or connected. See the
[official Projects documentation](https://learn.chatgpt.com/docs/projects).

After reviewing the private curation file created during installation, use one
new filename for each output. The input must contain an owner-reviewed profile
summary rather than the placeholder summary. This guided command asks about
every declared source and supported mode, records explicit consent in a new
curation file, builds and validates a new canonical pack, creates the upload
package, and verifies the package against its source:

```bash
./choiceprint.sh prepare-chatgpt \
  --curation matraix/personal-persona/source-material/choiceprint-curation.yaml \
  --authorized-curation matraix/personal-persona/source-material/choiceprint-curation.chatgpt-v1.yaml \
  --pack matraix/personal-persona/digital-twin/person-chatgpt-v1.choiceprint \
  --package matraix/personal-persona/digital-twin/person-chatgpt-v1.chatgpt-upload
```

The command never uploads data, replaces an existing output, invokes a model,
or grants permission without the interactive owner review. Consent cancellation
stops before the build. The separate `package` and `verify-package` commands
remain available for advanced or already-authorized workflows.

1. Open `UPLOAD-README.md` in the verified output and follow it exactly.
2. Create a new private ChatGPT Project.
3. Copy the content of `PROJECT-INSTRUCTIONS.md` into Project instructions.
4. Upload only the ten numbered Markdown files from the export. Do not upload
   the setup README, manifest, canonical pack, or real holdout store.
5. Start requests with a mode that is explicitly listed under Allowed modes in
   `09-CONSENT.md`. The project instructions describe all capabilities, but a
   capability label does not authorize its use.

Example:

```text
Mode: predict-choice

Given these three options, what would the person most likely choose? Keep the
prediction separate from your advice and state any material unknowns.
```

### Private MCP development adapters

Install the optional pinned MCP runtime:

```bash
matraix/.venv/bin/python -m pip install \
  -r digital-twin/requirements-mcp.txt
```

Then start the private stdio process for an owner-only canonical pack:

```bash
./choiceprint.sh serve-mcp \
  --pack /private/path/person.choiceprint \
  --acknowledge-development-only \
  --allow-private-chatgpt-access
```

The stdio process opens no port, never starts automatically, exposes no write or
external-action tool, and does not let a caller choose the pack path or request
time. Domain validation does not remove `--acknowledge-development-only`: the
pack deliberately remains globally development-only even when named domains
have passed their gates. The access flag confirms local serving; it does not
by itself connect or upload anything. The stdio adapter has no caller-bound,
per-request authentication. Do not share, publish, or tunnel it as-is.

`serve_choiceprint_mcp.build_http_app(...)` is the separate network integration
seam. It returns an ASGI app at `/mcp`; it does not start a listener. The
factory refuses authentication settings unless bearer tokens are bound to the
configured HTTPS resource and carry the read scope. The caller must also supply
the one OAuth subject authorized to read the configured pack. A strict wrapper
rejects missing or different subjects, a wrong issuer, expired tokens, and
future `nbf` claims before retrieval. The app derives an exact public Host and
Origin policy from the resource URL, advertises the OAuth scope in tool
metadata, uses a closed result envelope, and exposes protected-resource
metadata for OAuth discovery. It also uses stateful sessions bound to the
authenticated principal, a 64 KiB request limit, a five-minute idle limit, and
an eight-session cap. In-process tests cover missing, invalid, stale,
wrong-owner, and cross-client credentials, Host and Origin spoofing, tool
metadata, retrieval, request limits, and pack immutability using only the
fictional public pack.

This is still not a live ChatGPT connection. The repository contains no OAuth
issuer, signature-validating production token verifier, TLS termination,
public deployment, tunnel, or private-pack connection. OpenAI's current
[MCP server guide](https://developers.openai.com/plugins/build/mcp-server)
requires authorization on every request that reads private data, Streamable
HTTP for the endpoint, and a stable public HTTPS service for public submission.
A later developer-mode or hosted connection also needs explicit owner approval,
real OAuth and revocation controls, monitoring, deletion, and a separate
deployment review. OpenAI-managed mTLS is additionally relevant when a public
proxy fronts a private MCP server.

## Validation

### Owner CLI

Use the repository-root owner CLI for the normal private workflow:

```bash
./choiceprint.sh doctor
./choiceprint.sh init
./choiceprint.sh build
./choiceprint.sh validate
./choiceprint.sh review-prepare
./choiceprint.sh review-claims \
  --output /private/path/claim-review.batch-01.yaml \
  --max-claims 25
# Resume with --input set to the preceding batch and a new --output path.
./choiceprint.sh review-apply \
  --review /private/path/claim-review.completed.yaml
# Collect additional direct choice evidence without editing YAML during the interview.
./choiceprint.sh collect-interview \
  --output /private/path/decision-interview.responses.json
./choiceprint.sh build \
  --curation matraix/personal-persona/source-material/choiceprint-curation.reviewed.yaml \
  --force
# After a prospective run is finalized, answered, and scored:
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
./choiceprint.sh package \
  --pack /private/path/person.coverage-release.choiceprint \
  --output /private/path/person.chatgpt-upload
./choiceprint.sh verify-package \
  --pack /private/path/person.coverage-release.choiceprint \
  --package /private/path/person.chatgpt-upload
./choiceprint.sh get-context \
  --pack /private/path/person.coverage-release.choiceprint \
  --mode predict-choice \
  --scenario-file /private/path/scenario.json \
  --max-context-bytes 12000
# After installing digital-twin/requirements-mcp.txt:
./choiceprint.sh serve-mcp \
  --pack /private/path/person.coverage-release.choiceprint \
  --acknowledge-development-only \
  --allow-private-chatgpt-access
# To revoke previously approved coverage:
./choiceprint.sh coverage-revoke \
  --pack /private/path/person.coverage-release.choiceprint \
  --domain everyday_choices \
  --output /private/path/revocation.pending.json
./choiceprint.sh coverage-review interactive \
  --pack /private/path/person.coverage-release.choiceprint \
  --input /private/path/revocation.pending.json \
  --output /private/path/revocation.completed.json
./choiceprint.sh coverage-apply \
  --pack /private/path/person.coverage-release.choiceprint \
  --review /private/path/revocation.completed.json \
  --output /private/path/person.revoked.choiceprint
```

The private scenario file is a single JSON object and must have mode `0600`:

```json
{"summary":"Choose a planning approach","domain":"planning","stakes":"low","reversibility":"high","options":["make a short plan","start immediately"]}
```

- `doctor` checks the installed runtime, active persona, active registry binding,
  optional validation results, curation file, and existing canonical pack without
  changing them.
- `init` copies the tracked curation template to the ignored private source
  directory with mode `0600`. It refuses existing destinations and preserves
  `consent.owner_authorized: false`.
- `build` safely matches the active persona to its own validation context, uses
  the reviewed private curation file when present, and builds the canonical
  private pack. It never edits or infers consent. Existing output is replaced
  only when the owner explicitly passes `--force`.
- `validate` runs the canonical pack validator.
- `review-prepare` creates a mode `0600` owner worksheet containing every
  canonical claim, its current value and status, optional domain and condition
  scopes, and a `pending` decision. SHA-256 bindings tie it to that exact pack.
  It makes no network or model calls and confirms nothing automatically.
- `review-claims` shows only pending claims and records explicit owner decisions
  in a new mode `0600` worksheet. `--max-claims` makes a large review resumable:
  use each output as the next command's `--input`. Existing decisions and the
  input file are preserved, outputs are never replaced, and `reviewed_at` is
  set automatically only after the final pending claim is decided. It makes no
  model or network calls and has no automatic-approval option. Scopes and notes
  can still be narrowed in the private worksheet before `review-apply`.
- `review-apply` requires a non-pending decision for every claim, revalidates
  the exact source pack and immutable claim snapshots, and writes a new mode
  `0600` curation file. The base curation is not edited. Supported decisions
  are `confirm`, `dispute`, `withhold`, and `unconfirmed`. The latter three are
  excluded from runtime use. A confirmed sensitive claim also remains withheld
  and runtime-excluded. Claim scope and review provenance are retained in the
  rebuilt canonical pack. Existing review or output data is replaced only with
  separate, explicit options.
- `coverage-review prepare` re-verifies the exact frozen run, prediction
  finalization, answers, integrity-bound score bundle, and source pack. It exposes only
  domains that passed every pre-registered gate and that already appear in the
  source pack's `coverage.declared_domains` taxonomy. Domain IDs are bounded
  lowercase slugs, so evaluation output cannot inject display markup or invent
  a coverage category. `coverage-review interactive`
  re-verifies the same evidence, rejects changed failure context, then requires
  a separate explicit owner decision for each candidate and writes a new
  private receipt. Neither command edits a pack or offers an automatic-approval
  flag.
- `coverage-apply` re-verifies all bindings and creates a new pack containing
  only sanitized event metadata and opaque hashes. It never copies questions,
  answers, predictions, prompts, item failures, or score metrics into the
  deployable pack, and it never mutates the evaluated source pack. The global
  status remains `development_only`; `validated_domains` is only a projection
  of the latest owner-reviewed event for each declared domain. Event timestamps
  must satisfy `prepared_at <= reviewed_at <= recorded_at <= built_at`, and a
  later event for one domain cannot predate its predecessor.
- `coverage-revoke` prepares a separate owner review for currently validated
  domains. An approved revocation requires a private owner note and one closed,
  non-sensitive public reason code. Only the code enters the pack; the free-text
  note remains in the private review receipt. The new event removes the domain
  from the projection without deleting its history.
- `holdout-review` interactively compares every private holdout case with
  answer-stripped development cases and writes a new hash-bound review receipt.
  It requires explicit owner decisions, never edits the preflight template, and
  makes no model or cloud call. See the
  [blind evaluation workflow](evaluation/README.md) for the required paths and
  sequence.
- `collect-interview` runs a tracked 12-question, six-domain low-stakes
  decision interview without a model or network call. It records the selected
  and rejected options, rationale, exceptions, context, any known analogous
  outcome, and timestamps in one mode `0600`, hash-bound artifact outside the
  repository. Cancellation writes nothing. The result is always
  `candidate_only`: it must be reviewed and deliberately mapped into curation
  before a later build can use it.
- `collect-retest` administers a deterministic, family-balanced subset 7-14
  days after the first pass. It never displays prior selections, changes its
  inputs, replaces an output, or calls a model. It preserves the first-pass
  records in a new mode `0600` file and adds retest fields only to the selected
  cases. An explicit seed and item count make the subset reproducible.
- `package` validates the canonical pack and creates a mode `0700`, adapter-only
  ChatGPT upload directory. It contains the 11 generated adapter Markdown files
  plus `UPLOAD-README.md` and `UPLOAD-MANIFEST.json`. It excludes canonical
  source records, evidence archives, evaluation datasets, answers, and private
  holdout material. Rendered runtime content can include decision cases that the
  owner explicitly authorized. The command never replaces an existing package
  and intentionally has no `--force` option.
- `verify-package` revalidates the canonical pack and checks the export's exact
  file set, owner-only permissions, tracked setup instructions, manifest hashes,
  and adapter bytes. It is read-only and has no repair or overwrite mode. The
  manifest detects stale or accidentally changed local files; it is not a
  cryptographic signature or proof of what was uploaded through ChatGPT.
- `get-context` validates the canonical pack and returns deterministic JSON for
  one scenario without modifying the pack or calling a model. It selects only
  runtime-eligible, consented, source-authorized, non-sensitive, unexpired
  evidence and preserves the required source, conflict, and counterexample
  closure within a strict UTF-8 byte budget. Use a mode `0600` scenario file for
  private inputs; inline JSON can be retained in shell history. `status: ok`
  means safe matching context was found, not that the domain is validated or
  the eventual prediction is correct. Boundary rules are returned but are not
  yet actively interpreted by this local core.

Run `./choiceprint.sh <command> --help` for overrides. Automatic validation-data
selection fails closed when the active registry, baseline, persona revision, or
result metadata disagree. Missing optional validation results are simply omitted.
If the persona claims change after a worksheet is prepared, applying or building
that review fails as stale. Re-run `review-prepare` against the new pack instead
of copying decisions across versions implicitly.
The owner CLI makes setup safer and less manual, but the resulting static adapter
remains a development preview until the relevant domains pass isolated human
evaluation.

### Direct compiler commands

Build a private pack from a MatrAIx persona, optional validation data, and an
optional reviewed curation file:

```bash
install -d -m 700 matraix/personal-persona/source-material
install -m 600 digital-twin/templates/curation.example.yaml \
  matraix/personal-persona/source-material/choiceprint-curation.yaml
```

Review the private copy before authorizing any sources or uses. Keep the
directory at mode `0700` and the curation file at mode `0600`.

Atomic evidence-derived facts and preferences may be added under the private
curation file's `claims` list. The compiler requires stable IDs, a non-reserved
predicate, supported fields, and at least one known evidence source. Curated
claims always enter as unconfirmed and must pass the same exhaustive owner
claim-review workflow as generated claims. The static adapter and local
retriever expose a claim only when it is active, owner-confirmed,
runtime-included, non-sensitive, current, and every evidence or counterevidence
source is authorized.

An optional source `evidence_set` ID, such as `email-v1`, labels a provenance
cohort without authorizing it. For a with-email versus no-email evaluation,
keep the reviewed claims and source records identical and create two curation
variants whose `consent.allowed_sources` differ. The no-email variant must omit
every email source ID, which makes any claim depending on those sources
ineligible at runtime.

```bash
matraix/.venv/bin/python digital-twin/scripts/build_choiceprint.py \
  --persona matraix/personal-persona/persona.yaml \
  --validation-results matraix/personal-persona/survey/data/personas/PERSONA_ID/validation-results.json \
  --validation-surveys matraix/personal-persona/survey/validation-surveys.json \
  --curation matraix/personal-persona/source-material/choiceprint-curation.yaml \
  --output matraix/personal-persona/digital-twin/person.choiceprint
```

Omit either optional validation argument or `--curation` when that source is
not available. To generate the ChatGPT adapter, review every source and allowed
use in the private curation copy, set `consent.owner_authorized: true`, and pass
that reviewed file with `--curation`. Rebuilding an existing output requires
`--force`.

Completed human validation answers are included in the adapter only when a
reviewed curation source has `authorship: person`, sets `validation_survey_id`
to the exact survey ID, and appears in `consent.allowed_sources`. Unmapped or
non-consented survey cases remain in the canonical development data but stay
out of the ChatGPT adapter.

Run the validator against a canonical pack:

```bash
matraix/.venv/bin/python digital-twin/scripts/validate_twin_pack.py \
  matraix/personal-persona/digital-twin/person.choiceprint
```

The populated pack is private local data. It belongs under the ignored
`matraix/personal-persona/digital-twin/` directory and must not be force-added
to Git.

## What the existing MatrAIx persona contributes

The current MatrAIx persona remains valuable as:

- A constrained vocabulary for stable attributes.
- A compatibility layer for the existing local chat and validation app.
- A source of candidate claims, confidence labels, and evidence notes.
- A baseline that the fuller Choiceprint pack must beat on held-out choices.

Null dimensions stay unknown. A larger dimension count is not a quality score.
Whether observed decisions add predictive value over broad labels must be tested
through ablation. Independent evaluation matters more than filling every
possible field.

Read [ONE-PAGER.md](ONE-PAGER.md) for the short product and architecture
rationale, [PRODUCT_SPEC.md](PRODUCT_SPEC.md) for the full design, and
[research/RESEARCH_BASIS.md](research/RESEARCH_BASIS.md) for the supporting
evidence and its limitations. The development-only blind forced-choice workflow
is documented in [evaluation/README.md](evaluation/README.md).
