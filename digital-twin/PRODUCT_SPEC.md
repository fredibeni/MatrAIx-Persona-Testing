# Choiceprint product specification

## Product decision

The product should be a layered Twin Pack with a ChatGPT adapter, not one large
YAML file and not a person-specific fine-tuned model.

The existing 1,290-dimension MatrAIx schema should remain as a compatibility
feature store. Only evidenced non-null values should be exported. The runtime
should then combine those values with actual decision cases, scoped decision
policies, current context, evidence provenance, contradictions, safety rules,
and a physically separate private evaluation suite.

The measurable product promise is:

> Predict likely choices within evaluated domains, show the relevant evidence
> and uncertainty, and abstain when the personal evidence is insufficient.

The product must not claim to recreate a person or predict arbitrary unseen
behavior reliably.

## Format decision

| Format | Good at | Main limitation | Role in Choiceprint |
| --- | --- | --- | --- |
| One persona YAML | Portable labels, validation, diffs | Flattens context, time, evidence, and exceptions | Retained as the legacy feature layer |
| One long narrative or chat export | Rich history | Weak retrieval, stale facts, privacy exposure, and hard-to-test behavior | Kept outside the runtime as source material |
| Fine-tuned person-specific model | Style and repeated response patterns | Harder updates, provenance, deletion, contradiction handling, and source inspection | Not the default product |
| Static ChatGPT Project Pack | Immediate use with ChatGPT and no service | Manual updates, prompt-mediated retrieval, and no enforceable runtime controls | First zero-service preview adapter |
| Canonical Twin Pack plus retrieval service | Selective context, provenance, expiry, and controlled updates | More engineering and secure hosting | Recommended mature product |

The out-of-the-box release is therefore a collection of files, compiled into a
small ChatGPT Project Pack. This is the first consumer adapter, not a
reliability-certified runtime. A plugin or retrieval service is an optional
later adapter over the same canonical data. It is not a separate personality
model.

## Design principles

### 1. Test choices against labels

Choiceprint treats the idea that an observed decision in a matching context is
more predictive than a broad trait label as a product hypothesis, not an
established rule. The evaluation suite must compare cases with and without
decision evidence. Each decision case records the scenario, options, selected
choice, rejected alternatives where known, rationale, outcome, time, and source.

### 2. Every claim has a scope

"Prefers accuracy" is too broad. A usable claim states where it applies, such
as published analysis under medium or high stakes, and names exceptions such as
private exploratory work.

### 3. State is not personality

Current goals, workload, mood, location, deadlines, and financial constraints
belong in an expiring current-state file. They must not silently become durable
traits.

### 4. Contradictions stay visible

New evidence can supersede an old claim, but the old record remains auditable.
Conflicting evidence is retrieved alongside supporting evidence until it is
resolved or scoped.

### 5. Unknown is a valid answer

The runtime can return `insufficient_evidence`, ask one focused question, or
abstain. It must not fill missing personal facts from demographics or generic
model priors.

### 6. Evaluation answers stay outside the runtime

Development cases may be used to improve the pack. Private holdout answers are
stored outside every deployable pack and retrieval index, not merely marked with
a role field. They are never uploaded to a runtime ChatGPT Project. Evaluation
must run in an isolated runner or clean project with cross-chat memory disabled,
so account or project memory cannot leak an answer before it is scored.

### 7. Prediction, advice, style, and action are different modes

- `predict-choice` estimates what the person is likely to choose.
- `advise-person` gives a recommendation and labels it as advice.
- `write-in-style` follows communication preferences without claiming identity.
- `draft-action` prepares an action but does not execute or publish it.

## Canonical data model

### Manifest

`manifest.json` identifies the owner, content version, explicit schema version,
privacy class, source coverage, supported adapters, and evaluated domains. A
domain is not marked validated merely because data exists for it. Domain
coverage starts from a pack-owned `declared_domains` taxonomy of bounded,
lowercase slugs. Holdout and score domains must come from that allowlist.
Coverage is an append-only sequence of `validate` and `revoke` events with a
fixed evaluation scope, source-pack digest, private review-receipt digest, and,
for validation, an integrity-bound evaluation-evidence digest.
`validated_domains` is the sorted projection of the latest event per domain. The
global status remains
`development_only` because narrow forced-choice evidence is not a pack-wide
reliability claim. Each event preserves `prepared_at`, `reviewed_at`, and
`recorded_at`; validation enforces that order through the release `built_at`
and prevents a domain's event chain from moving backward in time. Revocation
exports only a closed, non-sensitive reason code. The owner's free-text note
stays in the private receipt bound by its digest.

`build-metadata.json` records a SHA-256 digest for every generated file except
itself. Validation fails if a canonical or adapter file changes, disappears, or
appears without a digest. This prevents an old adapter from silently surviving
after consent or sensitivity is tightened in the canonical pack.

### Profile overview

`profile/overview.yaml` is the canonical short profile. It stores the reviewed
summary, communication style, known gaps, sensitivity, source references, and
an explicit runtime-inclusion flag. `manifest.json.profile_summary` must match
its summary. Generated adapter files are deterministic projections of this and
the other canonical records, not a second editable source of truth.

### Claims

`profile/claims.jsonl` stores one atomic assertion per line. Required concepts:

- Stable ID.
- Predicate and value.
- Domain and condition scope.
- Status such as active, disputed, superseded, or withheld.
- Confidence components rather than an unexplained number.
- Evidence and counterevidence references.
- Observation and validity dates.
- Sensitivity and user-confirmation state.

Confidence should consider directness, repetition, consistency, recency,
context match, and whether the source was written by the person. A model summary
of history is weaker than the underlying user-authored statement.

### Decision policies

`profile/decision-policies.yaml` stores context-conditioned heuristics. Each
policy defines:

- The domains, stakes, and conditions where it applies.
- What is preferred and what it is preferred over.
- Known exceptions.
- Strength, behavioral case references, and source references.
- A review date.

Policies are derived summaries. They do not replace the underlying cases.

### Decision cases

`profile/decision-cases.jsonl` is the most important behavioral layer. Each case
contains:

- Scenario domain, stakes, reversibility, time horizon, and social context.
- Available options.
- Actual choice and ranking where known.
- User-authored rationale where available.
- Later outcome or correction.
- Source, timestamp, and sensitivity.
- A closed person-grounded evidence type: direct self-report, direct statement,
  observed behavior, or a reviewed derived summary.
- Dataset role: training or development. Holdout answers live in a physically
  separate private evaluation store.

Agent-generated choices must never be recorded as evidence about the person.

### Counterexamples

`profile/counterexamples.jsonl` captures cases where a broad rule did not apply.
This prevents a strong but context-specific pattern from becoming a caricature.

### Current state

`profile/current-state.yaml` has `as_of` and `expires_at` fields. Expired state is
not used without confirmation.

### Evidence and consent

`evidence/sources.jsonl` records provenance without requiring raw chats to be
placed in the portable pack. `evidence/consent.yaml` records which sources and
uses the owner authorized, along with withdrawal and deletion behavior.

Raw exports should remain in a local encrypted or ignored source vault. The
portable pack should contain reviewed claims and minimal evidence excerpts, not
an unrestricted lifetime archive.

### Boundaries

`safety/boundaries.yaml` defines allowed uses, uses requiring approval, and
prohibited uses. The default pack permits prediction, explanation, and drafting.
It requires explicit approval for messages, purchases, publishing, calendar
changes, commitments, or any external side effect.

It must never claim literal identity, authenticate as the person, sign legal
documents, or make high-stakes decisions on the person's behalf.

## Runtime algorithm

For every request:

1. Determine the mode, domain, stakes, reversibility, time horizon, actors,
   options, and current constraints.
2. Apply boundaries before retrieving personal evidence.
3. Retrieve current constraints and directly analogous decision cases.
4. Retrieve matching policies, counterexamples, and contradictions.
5. Retrieve only the stable claims needed to resolve remaining uncertainty.
6. For calibrated service deployments, generate predictions through separate
   model invocations and estimate an empirical choice distribution, or use a
   probability model calibrated on held-out data. Multiple guesses inside one
   response are not independent.
7. Return the predicted choice or calibrated distribution, assumptions,
   evidence IDs, counterevidence, and unknowns. Do not present an uncalibrated
   model-reported probability as confidence.
8. Abstain or ask one focused question when a missing fact could change the
   answer.
9. Keep prediction separate from advice.

A first retrieval score can combine semantic similarity, scenario-feature
match, evidence strength, recency, and source directness. The weights are product
parameters to be tuned on holdout data, not universal constants.

Hard constraints always win. Recent direct corrections override older inferred
claims within the same scope, while the old records remain auditable.

## ChatGPT delivery

### Static Project Pack

The first shipping format is a small, text-first ChatGPT Project Pack. It is a
zero-service preview and consumer adapter. ChatGPT Projects keep uploaded files
and project instructions available across related chats, while the owner remains
responsible for choosing which sources to upload.
[OpenAI's Projects documentation](https://help.openai.com/en/articles/10169521-using-projects-in-chatgpt)
describes that shared context model.

The compiler does not emit this adapter until the owner records explicit
authorization, allowed sources, and allowed uses in the consent record.

Advantages:

- Immediately usable with ChatGPT.
- No server, separate API key, or custom model required.
- The local source files are easy to inspect, version, replace, export, and
  delete.

Limitations:

- Retrieval and update behavior is prompt-mediated.
- Evidence files can contain instruction-like text. Project instructions mark it
  as untrusted data, but the static adapter cannot fully enforce prompt-injection
  isolation.
- There is no guaranteed enforcement of provenance or expiry.
- It cannot guarantee selective retrieval, boundary enforcement, or calibrated
  probabilities.
- Large packs eventually require compilation into smaller task views.
- The owner must manually replace changed files.

A domain must not be described as reliability-certified on the strength of the
static adapter alone. Certification requires isolated evaluation and the
retrieval service or another controlled runtime that can enforce the tested
retrieval, expiry, provenance, and boundary behavior.

### Local retrieval core and private MCP adapters

The repository now includes a transport-independent, read-only
`get_twin_context` core. It validates the canonical pack at request time,
requires an explicitly consented mode, filters by runtime eligibility,
sensitivity, source authorization, and expiry, and returns deterministic
scenario-matched evidence within a strict serialized-context budget. Reference
closure keeps selected sources, counterexamples, and conflicts together. The
local core returns the boundary document but does not interpret its free-text
rules, so it is not yet the complete controlled runtime described above.

The first MCP adapter is implemented as a private local stdio process. An
authenticated Streamable HTTP ASGI factory now wraps the same server contract
without selecting a host or opening a port. Both expose only:

- `get_twin_context(scenario, mode, max_context_bytes)`

The pack path and request time are fixed by the server, not chosen by the MCP
caller. The adapter supports only `predict-choice` and `write-in-style`, caps
context at 12,000 UTF-8 bytes, exposes no external action, and checks the
initially configured pack for explicit development-only acknowledgement. Its
tool annotation is a client hint; read-only behavior is enforced by the absence
of writing code and by the retrieval core. The stdio command is a single-owner
local development adapter with no caller-bound, per-request authentication and
must not be shared, published, or tunnelled as-is.

The HTTP factory requires an injected MCP token verifier and auth settings. It
refuses non-HTTPS issuer or resource identifiers, missing resource-audience
validation, and a missing `choiceprint.context.read` scope. It also requires an
exact authorized owner subject for the one configured pack. Its strict verifier
wrapper rejects a wrong or missing subject, wrong issuer, missing expiry,
expired token, or future `nbf` before private retrieval. Its `/mcp` endpoint
derives a fail-closed Host and Origin policy from the HTTPS resource URL, uses
stateful sessions bound to the authenticated principal, advertises the OAuth
scope, returns a closed result envelope, and applies a 64 KiB request body
limit, a five-minute idle limit, and an eight-session cap. Tests exercise
authentication, wrong-owner and cross-client rejection, transport-header
spoofing, metadata, retrieval, request limits, and source-pack immutability
against the fictional fixture. The factory is an integration seam, not an
authorization server, cryptographic token verifier, or deployment.

A later authenticated hosted service can add focused read-only tools such as:

- `get_coverage(domain)`
- `get_claim(claim_id)`
- `list_conflicts(domain)`
- `explain_prediction(prediction_id)`

Write operations should stage proposals and require owner approval. A correction
must never silently rewrite the canonical twin.

The service should keep raw evidence local or encrypted, mediate every retrieval,
redact unnecessary sensitive data, log access, and support complete export and
deletion.

ChatGPT does not connect directly to an arbitrary local MCP stdio process. A
ChatGPT app needs a Streamable HTTP endpoint. The authenticated factory
establishes the application boundary, but the repository has not configured a
real OAuth issuer or verifier, public HTTPS host, tunnel, or private-pack
connection. The static Project Pack therefore remains the lowest-friction
adapter. A public service still needs hosted HTTP, OAuth, monitoring,
revocation, deletion controls, and, where a public proxy fronts a private MCP
server, OpenAI-managed mTLS. OpenAI's current
[MCP server guide](https://developers.openai.com/plugins/build/mcp-server)
defines these integration constraints; it does not establish Choiceprint's
persona reliability.

## Update protocol

1. Ingest only owner-approved sources.
2. Separate user-authored content from assistant-generated content.
3. Extract candidate claims, cases, counterexamples, and state changes.
4. Detect duplicates, contradictions, sensitive inferences, and stale state.
5. Ask for confirmation where the evidence or sensitivity requires it.
6. Append accepted events rather than overwriting history.
7. Rebuild derived files and the Project Pack.
8. Run the full evaluation suite.
9. Confirm that every evaluated domain is a safe slug in the pack-owned
   `declared_domains` taxonomy.
10. Write and verify integrity-bound score outputs, then complete a separate
    owner coverage review for
    each gate-passing domain.
11. Create a new hash-bound pack release only for explicitly approved domains;
    never let the evaluator edit the source pack.
12. Publish a new version only if quality and safety gates pass.
13. Keep the prior release available for rollback and use append-only
    revocation events when evidence no longer supports a domain.

The twin must never learn from its own predictions. A human correction is
high-value negative evidence. Aspirational statements and revealed preferences
remain distinct.

## Evaluation contract

Reliability is measured against independent human answers, not by whether the
output sounds plausible.

Required metrics:

| Target | Metric |
| --- | --- |
| Forced choice | Accuracy and top-2 accuracy |
| Ranked choice | Kendall tau or Spearman correlation |
| Multi-select | Jaccard similarity and F1 |
| Scale response | Normalized distance and exact match |
| Probability quality | Brier score or log loss |
| Calibration | Expected calibration error |
| Abstention | Coverage-accuracy curve |
| Robustness | Paraphrase consistency and irrelevant-perturbation stability |
| Temporal behavior | Accuracy by evidence age and update handling |
| Grounding | Unsupported personal-fact rate |
| Safety | Identity-claim and unauthorized-action failure rate |
| Style | A separate communication-style rubric |

Required baselines:

1. Generic ChatGPT without personal context.
2. Existing YAML only.
3. Narrative profile only.
4. Full pack without decision cases.
5. Full pack with decision cases and selective retrieval.
6. Full pack with retrieval and current state.

For each model version, run several separate samples and prompt paraphrases.
Report raw accuracy, per-domain results, item-level differences, and accuracy
normalized to the person's own retest reliability benchmark. Do not call a
domain validated until an independent sample is large enough to support that
claim.

Thirty holdout decisions in a claimed domain can be a pilot floor, but it is not
enough by itself to establish validation. The release gate should pre-specify a
minimum useful effect and require either adequate statistical power or a target
confidence-interval width, a lower confidence bound above the strongest
baseline, no critical safety regression, and a low false-high-confidence rate.
These are starting product policies, not established universal thresholds.

## Migration from MatrAIx

The migration process is:

1. Copy every active non-null dimension to `legacy-dimensions.yaml`.
2. Convert every audited candidate to an atomic claim.
3. Preserve its selected value, confidence, evidence notes, sensitivity, and
   runtime-inclusion status.
4. Mark sensitive inferred values as withheld until directly confirmed.
5. Preserve null dimensions as unknown and omit them from runtime context.
6. Route communication dimensions to the style adapter.
7. Route expertise and tools to capability context.
8. Route risk, speed-versus-accuracy, logic-versus-intuition, and decision-speed
   fields to initial decision-model candidates.
9. Treat interests as retrieval signals rather than deterministic choices.
10. Move transient fields into expiring current state.
11. Convert consented human validation answers into development decision cases.
12. Exclude agent validation answers from the evidence base.
13. Use approved history to add real decisions and counterexamples, not merely
    more trait labels.

## Current evidence gap to prioritize

The highest-value next data is not another broad dimension survey. It is a
balanced set of scenario-choice-rationale examples across underrepresented life
domains, with rejected alternatives, exceptions, later outcomes, and a retest.

The onboarding target should be:

- A substantial structured life and decision interview as a research-backed
  reference protocol, while measuring the cost-fidelity curve rather than
  treating two hours as an established optimum.
- Shorter progressive sessions for users who prefer gradual setup.
- Direct choices and trade-offs across work, money, relationships, health,
  leisure, purchases, travel, conflict, and uncertainty.
- Repeated questions after one to two weeks to estimate the person's own
  test-retest reliability benchmark.

This yields a product that can improve with evidence while staying honest about
where it has not been validated.

## Recommended acquisition protocol

The full onboarding protocol can run once as a structured interview or in short
progressive sessions. It should collect high-value behavioral evidence in this
order:

1. Life and role map - durable responsibilities, important relationships,
   environments, recurring constraints, and the vocabulary the person uses.
2. Real decision reconstruction - recent choices, options considered, rejected
   alternatives, reasoning, outcome, and what would have changed the choice.
3. Domain trade-offs - paired or ranked scenarios across work, purchases,
   money, health, leisure, travel, conflict, uncertainty, and social settings.
4. Boundary cases - exceptions, reversals, disliked caricatures, and situations
   where a broad trait does not apply.
5. Communication samples - user-authored examples for style tasks, kept
   separate from behavioral evidence.
6. Current state - active goals and temporary constraints with dates and an
   expiry.
7. Consent - approved sources, approved uses, sensitive fields, retention, and
   deletion rules.
8. Retest - a private repeat of a balanced subset one to two weeks later to
   estimate the person's own test-retest reliability benchmark.

Each interview answer should produce candidate claims or cases for review. It
must not become accepted evidence merely because a model extracted it. The
elicitation system should prioritize missing high-impact context and weak
domains instead of trying to fill all 1,290 legacy dimensions.

The first model-free slice of this protocol is implemented by
`./choiceprint.sh collect-interview`. It intentionally stops at a private,
candidate-only response artifact. Automated extraction and promotion are not
implemented because the owner review boundary must remain explicit.
