# Choiceprint - what was built and why

## Product decision

Choiceprint is the digital-twin subsystem in MatrAIx Persona Testing, an
independent adaptation of
[MatrAIx-Persona-8B](https://github.com/MatrAIx-ai/MatrAIx-Persona-8B). It is a
private, versioned body of evidence about a person, plus tooling that compiles
the owner-authorized subset into files that ChatGPT can use.

Its promise is deliberately narrow: predict likely choices within evaluated
domains, show the supporting personal evidence and uncertainty, and abstain
when evidence is insufficient. Prediction, advice, writing style, and
`draft-action` are separate permissioned modes. `draft-action` prepares text
but never executes or publishes it.

## What was built

- **Canonical Twin Pack** - the private source of truth for scoped claims,
  decision cases, rejected options, policies, counterexamples, expiring
  context, provenance, contradictions, consent, and safety boundaries.
- **ChatGPT Project Pack** - one instruction file and ten compact evidence
  files generated only from authorized material. A local export adds setup and
  integrity files. The owner can verify it, then upload it to a private
  [ChatGPT Project](https://learn.chatgpt.com/docs/projects) without operating a
  separate service.
- **Owner and evaluation tools** - deterministic building and validation,
  privacy checks, guided consent, claim review, candidate-only decision
  interviews, answer-blind holdouts, retesting, scoring, package verification,
  and owner-controlled domain release or revocation. Interview responses must
  be reviewed and deliberately mapped before a build can use them.
- **Optional retrieval adapters** - a consent-filtered local retrieval core and
  read-only MCP development adapters that return relevant context. They do not
  run a model or make the final prediction. The HTTP adapter is an integration
  seam, not a deployed production service.

## Why this extends rather than replaces MatrAIx

Choiceprint keeps MatrAIx's 1,290-dimension schema and private `persona.yaml`
as a controlled vocabulary, compatibility layer, bootstrap source, and
evaluation baseline.

The new digital-twin goal required more than a flat dimension list. A value
such as `accuracy-leaning` does not show where it applies, what the person
actually chose, which alternatives they rejected, what changed their mind,
whether the evidence is current, or when the rule should not apply. More filled
fields also do not prove better prediction.

Choiceprint therefore adds decisions, context, scope, exceptions, time,
provenance, counterevidence, consent, and a physically separate holdout set.
Unknown remains valid, and temporary circumstances do not silently become
permanent personality.

## Alternatives considered

| Alternative | Benefit | Why it was not chosen as the core |
| --- | --- | --- |
| Existing or expanded persona YAML | Portable, readable, easy to diff | Flattens context, evidence, exceptions, and change over time |
| One narrative or system prompt | Very low setup cost | Difficult to audit, update, scope, or test claim by claim |
| Raw chat history or one long narrative | Rich personal examples | Can be stale, sensitive, mixed-author, poorly retrieved, and hard to test or delete selectively |
| Interviews or surveys alone | Direct, controlled self-report | Useful evidence sources, but not a versioned representation or runtime |
| Person-specific fine-tuning | Can learn repeated language and patterns | Harder to inspect, correct, revoke, delete, and trace to evidence |
| Static Project files only | Immediate ChatGPT use with no service | Retrieval, expiry, and boundaries remain prompt-mediated |
| Hosted retrieval service as the first release | Stronger runtime selection and controls | Deferred, not rejected: it adds OAuth, security, hosting, and operations before the data model is proven |

## Why this design was selected

The layered design combines the strengths of these approaches without making
any one of them the source of truth. MatrAIx supplies candidate features.
Reviewed interviews, surveys, and history supply evidence. The canonical pack
preserves it in an inspectable, correctable, model-independent form.
Task-specific adapters expose only the authorized subset needed for a use.

This is auditable, portable, locally verifiable, immediately usable through a
ChatGPT Project, and measurable against simpler baselines. Private source
material and holdout answers stay outside the upload. However, withdrawal or
expiry does not propagate into a static uploaded Project: the owner must
manually replace or remove its files. The hosted retrieval service remains the
recommended mature form once the underlying representation proves useful.

## Current status

The schema, compiler, validator, privacy controls, Project pack, owner tools,
candidate interview collector, development evaluator, retrieval core, and MCP
adapters are implemented. A fictional pack can be built, packaged, and
verified end to end without reading private owner data.

Choiceprint remains `development_only`. The full six-condition evaluation
contract has not established person-specific or live ChatGPT reliability, and
local package verification is not proof of what ChatGPT received. Any future
passing result could support a claim only for the tested domain, runtime, model,
and period - never reliable replication across arbitrary scenarios.

See [PRODUCT_SPEC.md](PRODUCT_SPEC.md) for the architecture and
[research/RESEARCH_BASIS.md](research/RESEARCH_BASIS.md) for the research and
its limits.
