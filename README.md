# MatrAIx Persona Testing

MatrAIx Persona Testing is for playing around and examining how much you could impart your personality to an AI agent.
*The app uses your ChatGPT subscription and does not require a separately billed OpenAI API key.*

- On first start up, the app asks to fill in a list of personality dimensions from your ChatGPT history and memory
- Then there are 3 functionalities:
  1. **Chat** directly with the personalised agent based on your local persona YAML
  2. **Update persona** by answering questions on the missing personality dimensions
  3. **Validate** how similar the agent's answers are to yours on a set of questions
    - you answer the questions once, then they are used as the benchmark 
    - recommended to run Validation each time you add a batch of new personality dimensions
    - the similarity of the agent's answers to your benchmark is summarised and visualised

## Relationship to MatrAIx

This repository is an independent testing adaptation of the original [MatrAIx-Persona-8B](https://github.com/MatrAIx-ai/MatrAIx-Persona-8B) project. `MatrAIx` is the name used by that original project. This derivative is named **MatrAIx Persona Testing** to distinguish it from the official MatrAIx repository and is not presented as an official MatrAIx release.

## Requirements

- macOS.
- Python 3.11 or newer.
- The Codex CLI, available through the Codex desktop app or a supported Codex CLI installation.
- A ChatGPT account and plan with Codex access.
- Internet access for installation, ChatGPT sign-in, persona prepopulation, chat, and Agent validation runs.

Node.js, Docker, a separate OpenAI API key, local model downloads, and the full MatrAIx research stack are not required for normal use.

## Install from Git

```bash
git clone https://github.com/fredibeni/MatrAIx-Persona-Testing.git
cd MatrAIx-Persona-Testing
./install.sh
./start-local.sh
```

The first command downloads the repository. `./install.sh` prepares the small local runtime, automatically starts first-run onboarding, and initializes a private Choiceprint pack. When installation finishes, `./start-local.sh` starts the app.

## Install from a GitHub ZIP

Download the repository ZIP from GitHub and extract it. In Terminal, change to the extracted folder and run:

```bash
./install.sh
./start-local.sh
```

If macOS removed executable permissions while extracting the ZIP, run this once first:

```bash
chmod +x install.sh onboard.sh start-local.sh choiceprint.sh "Start MatrAIx.command"
```

## What installation and onboarding do

On a new installation, `./install.sh` automatically launches `./onboard.sh`, which completes these steps in order:

1. It checks whether Codex is signed in. If a ChatGPT login is cached, it asks you to confirm it or switch accounts. Otherwise it starts the secure ChatGPT login flow. It then runs a small capability check using your plan's default Codex model.
2. It asks what the persona should be called.
3. It asks for explicit permission before using available personal material to prepopulate the persona.
4. After onboarding succeeds, the installer creates an owner-only Choiceprint curation file with `owner_authorized: false`, builds the first canonical pack, and validates it. No ChatGPT adapter is generated until you explicitly review and authorize the curation file.

MatrAIx Persona Testing never asks you to paste a ChatGPT password, session cookie, access token, or API key into the app.

### What ChatGPT sign-in does not provide

Signing in to Codex with ChatGPT authorizes Codex model use. It does not give this local app automatic access to your ChatGPT web conversation history or ChatGPT saved memories.

If you choose prepopulation, MatrAIx Persona Testing can use only sources that are actually available and that you approve, such as:

- The separate local Codex memory store on the Mac.
- A ChatGPT data export that you select.
- A text file containing ChatGPT saved memories that you choose to provide.

Unsupported dimensions remain unknown. You can fill or correct them later in Update persona.

You can safely run `./onboard.sh` manually later to recheck setup. It validates and preserves an existing active persona.

Re-running `./install.sh` also preserves existing Choiceprint curation and packs. It validates an existing canonical pack instead of rebuilding it. If existing private state is invalid, installation stops with recovery guidance and does not overwrite it.

### Privacy during prepopulation

Prepopulation is optional and defaults to no. Each private source also requires an affirmative choice. When you approve it, the selected evidence is sent through Codex to OpenAI so the model can identify supported persona values. Do not select material you do not want processed by OpenAI.

By default, Chat and validation use the model selected by the signed-in ChatGPT plan and Codex workspace. The app also offers explicit supported model choices; availability can depend on the signed-in account. Set `MATRIX_PERSONA_CODEX_MODEL` only when an explicit model override is needed.

The generated candidate evidence, persona YAML, survey answers, validation results, logs, and any source material copied into the app stay in ignored local paths. They are not committed by the normal Git workflow. See [BOOTSTRAP.md](BOOTSTRAP.md) for the complete data boundary and evidence rules.

## Start it again

Double-click `Start MatrAIx.command`, or run:

```bash
./start-local.sh
```

The app opens at `http://127.0.0.1:8766/#chat`. Keep the Terminal window open while using it. Press Control-C in that window to stop the app.

## Existing personas are preserved

Installation, onboarding, and normal startup do not replace an existing `matraix/personal-persona/persona.yaml`. Normal startup skips onboarding when that private persona already exists. Re-running the setup is safe for an existing local persona. The tracked `persona.example.yaml` remains an all-null distribution template.

## Local data

Private runtime data is stored only in the local checkout under ignored paths, including:

- `matraix/personal-persona/persona.yaml`
- `matraix/personal-persona/source-material/`
- `matraix/personal-persona/survey/data/`
- `matraix/.venv/`
- `.local-logs/`

The local server binds only to `127.0.0.1` or `localhost`.

Update persona and Validation both count populated dimensions from the same active `persona.yaml`. They therefore show the same active-persona dimension count, with only non-null dimension values counted.

## Choiceprint digital twin design

The repository also includes [Choiceprint](digital-twin/README.md), a researched
design, working compiler, and read-only retrieval core for turning the MatrAIx
persona into an evidence-backed personal choice model for ChatGPT. Choiceprint keeps the flat
YAML dimensions as a compatibility layer, then adds observed decisions, scoped
policies, provenance, conflicts, expiring state, safety boundaries, and a
workflow for a physically separate private holdout evaluation set. The compiler
creates only an empty holdout placeholder - never the answers. A populated
person's pack stays in the ignored
`matraix/personal-persona/digital-twin/` directory and is rejected by the public
release checker if it is ever force-added. That checker is a heuristic scan of
the current index and worktree candidate. Before a first public push, also run a
dedicated full-history secret scan and manually review the repository history.

The first installation automatically runs the safe equivalent of
`choiceprint.sh init`, `build --no-curation`, and `validate`. The unreviewed
curation remains unauthorized and the canonical pack contains no ChatGPT
adapter. After reviewing the curation, the owner workflow is available through
`./choiceprint.sh`. Its resumable owner-review, candidate-only local decision
interview, blinded-retest, build, validation, integrity-bound scoring, separate
domain coverage-review, revocation, guided ChatGPT preparation, packaging,
verification, scenario-context, and private local MCP commands safely bind
the active persona and private evaluation data to their exact source context.
`get-context` selects only runtime-safe, consented evidence within a strict byte
budget, but it does not yet interpret the pack's free-text boundary rules or
make a prediction. `serve-mcp` optionally exposes that same bounded retrieval
through one read-only local stdio tool after explicit owner acknowledgement. It
does not start automatically, open a port, or configure a ChatGPT tunnel. It is
a single-owner local development adapter with no per-request user
authentication, so it must not be shared, published, or tunnelled as-is.
An additional authenticated Streamable HTTP application factory exposes the
same one-tool contract for future hosting. It requires audience-bound bearer
tokens, a read scope, and an exact OAuth subject authorized for the one
configured pack. It rejects wrong-owner or stale identities before retrieval,
derives a Host and Origin policy from the HTTPS resource URL, limits request
bodies and sessions, and binds each session to its authenticated principal. It
does not start a listener, issue or cryptographically verify tokens, deploy a
host, connect ChatGPT, or serve the private pack by itself.
`prepare-chatgpt` is the only owner CLI command that records owner consent. It requires a
reviewed unauthorized curation file and explicit new paths, asks about every
source and supported mode, and then builds, packages, and verifies locally. It
never uploads or replaces data. Packaging produces an adapter-only ChatGPT upload directory
without copying canonical evidence or evaluation files. The export includes a
closed integrity manifest, and `verify-package` checks it against the validated
canonical source before upload. No package or retest command replaces an
existing output. A passing evaluation cannot certify
itself: named domains enter `validated_domains` only through a separate explicit
owner decision that creates a new hash-bound pack, and later revocation is
append-only. The pack remains globally `development_only` so narrow evidence
cannot be presented as broad persona reliability.

For the exact fresh-install flow, import boundary, and troubleshooting steps, read [BOOTSTRAP.md](BOOTSTRAP.md).
