# MatrAIx Persona Testing

MatrAIx Persona Testing is a private local persona app for macOS. It lets you:

- Chat with a persona grounded in your local persona YAML.
- Fill gaps and correct details in Update persona.
- Compare your answers with the persona's answers in Validation.

The app uses Codex through your ChatGPT subscription. It does not require a separately billed OpenAI API key.

## Relationship to MatrAIx

This repository is an independent personal-testing adaptation of the original [MatrAIx-Persona-8B](https://github.com/MatrAIx-ai/MatrAIx-Persona-8B) project. `MatrAIx` is the name of that original project. This derivative is named **MatrAIx Persona Testing** to distinguish it from the official MatrAIx repository and is not presented as an official MatrAIx release.

Some internal directories, Python packages, environment variables, and launcher filenames retain the `matraix` name for compatibility with the upstream codebase.

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

The first command downloads the repository. `./install.sh` prepares the small local runtime and automatically starts first-run onboarding. When onboarding finishes, `./start-local.sh` starts the app.

## Install from a GitHub ZIP

Download the repository ZIP from GitHub and extract it. In Terminal, change to the extracted folder and run:

```bash
./install.sh
./start-local.sh
```

If macOS removed executable permissions while extracting the ZIP, run this once first:

```bash
chmod +x install.sh onboard.sh start-local.sh "Start MatrAIx.command"
```

## What onboarding does

On a new installation, `./install.sh` automatically launches `./onboard.sh`, which completes these steps in order:

1. It checks whether Codex is signed in. If a ChatGPT login is cached, it asks you to confirm it or switch accounts. Otherwise it starts the secure ChatGPT login flow. It then runs a small capability check using your plan's default Codex model.
2. It asks what the persona should be called.
3. It asks for explicit permission before using available personal material to prepopulate the persona.

MatrAIx Persona Testing never asks you to paste a ChatGPT password, session cookie, access token, or API key into the app.

### What ChatGPT sign-in does not provide

Signing in to Codex with ChatGPT authorizes Codex model use. It does not give this local app automatic access to your ChatGPT web conversation history or ChatGPT saved memories.

If you choose prepopulation, MatrAIx Persona Testing can use only sources that are actually available and that you approve, such as:

- The separate local Codex memory store on the Mac.
- A ChatGPT data export that you select.
- A text file containing ChatGPT saved memories that you choose to provide.

Unsupported dimensions remain unknown. You can fill or correct them later in Update persona.

You can safely run `./onboard.sh` manually later to recheck setup. It validates and preserves an existing active persona.

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

For the exact fresh-install flow, import boundary, and troubleshooting steps, read [BOOTSTRAP.md](BOOTSTRAP.md).
