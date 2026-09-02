# Fresh installation and onboarding

This guide describes the complete local setup for a new MatrAIx download. Run every command from the repository root.

The supported setup sequence is:

```bash
./install.sh
./start-local.sh
```

The installer prepares the runtime and automatically launches onboarding. Onboarding connects Codex to the user's ChatGPT subscription, names the persona, and asks for explicit prepopulation consent. When onboarding finishes, startup launches the private local app.

## 1. Requirements

- macOS.
- Python 3.11 or newer.
- The Codex CLI, available through the Codex desktop app or a supported Codex CLI installation.
- A ChatGPT account and plan with Codex access.
- Internet access for the first package installation, ChatGPT sign-in, and model-backed features.

No separately billed OpenAI API key is required. MatrAIx must not ask the user to enter an API key, ChatGPT password, session cookie, or access token.

Git is recommended but is not required after downloading a GitHub ZIP. Both a Git clone and an extracted GitHub ZIP are supported.

## 2. Install the runtime

Run:

```bash
./install.sh
```

The installer:

- Finds Python 3.11 or newer.
- Creates the isolated environment at `matraix/.venv/` when needed.
- Installs the pinned packages in `matraix/requirements.txt`.
- Records a private install-complete marker only after every required package installs successfully. If installation is interrupted, the next startup automatically retries it.
- Confirms that the bundled browser assets are present.
- Preserves any existing private active persona.
- Automatically launches onboarding after installation succeeds.

If Python is missing, follow the exact command printed by the installer and then run `./install.sh` again. The installer must not silently install a system package manager or replace an existing Python installation.

If a ZIP extractor removed executable permissions, run:

```bash
chmod +x install.sh onboard.sh start-local.sh "Start MatrAIx.command"
```

Then rerun the installer.

## 3. Complete automatic first-run onboarding

`./install.sh` launches onboarding automatically after the runtime is ready. Complete the prompts in that same Terminal window.

To repeat onboarding later, run:

```bash
./onboard.sh
```

This manual rerun is safe. It validates and preserves an existing active persona. Both automatic and manual onboarding perform the following steps in order on a fresh installation.

### Step 1: Sign in to ChatGPT through Codex

Onboarding checks the Codex CLI login status. When a ChatGPT login is already cached, it asks the user to confirm that account or switch accounts. When Codex is not signed in, it starts the Codex login flow. The user signs in with the ChatGPT account whose plan provides Codex access.

Codex manages its own authentication state. MatrAIx does not copy credentials into the repository or store them in persona files.

After sign-in, onboarding makes a minimal non-personal capability request using the plan's default Codex model. Setup stops with an actionable error if authentication exists but the account, workspace, CLI, or model cannot run the app. This sign-in authorizes Codex model calls for Chat, persona prepopulation, and Agent validation runs. Usage remains subject to the limits of the signed-in ChatGPT plan.

### Step 2: Name the persona

Onboarding asks what the persona should be called. The entered name becomes the persona display name. A safe local identifier is derived separately for filenames and internal state.

The name must come from the user's answer. Do not infer it from a macOS account name, file path, Git author, email address, or other system metadata.

### Step 3: Ask for prepopulation consent

Onboarding asks whether Codex may prepopulate the persona from approved sources. The default answer is no. It must not inspect or send personal source material before the user agrees, and each optional private source requires an affirmative choice.

If the user declines, onboarding creates or retains a valid sparse persona and continues. Missing dimensions remain unknown and can be completed later in Update persona.

If the user agrees, onboarding offers only sources that are genuinely available, including:

- The separate local Codex memory store on the Mac.
- A user-selected ChatGPT data export.
- A user-selected text file containing ChatGPT saved memories.

The user can choose which available sources to include. Missing or unreadable sources are reported as limitations and do not prevent the app from starting.

## 4. ChatGPT history and memory boundary

ChatGPT subscription sign-in and ChatGPT personal-data access are different things.

Signing in to Codex does not expose the user's ChatGPT web conversation history or ChatGPT saved memories to this local app. MatrAIx cannot silently retrieve either source from the ChatGPT account.

To use ChatGPT history, the user must obtain a ChatGPT data export and select the export during onboarding. To use ChatGPT saved memories, the user must select a text file containing the memory entries they chose to provide.

Local Codex memory is a separate source from ChatGPT history and ChatGPT memory. Its availability does not imply access to either ChatGPT source. Source coverage must record each source accurately and must never describe an unavailable source as reviewed.

## 5. Prepopulation data flow

Prepopulation is model-backed. When the user approves prepopulation:

1. MatrAIx reads only the selected local evidence.
2. The relevant evidence is sent through the signed-in Codex CLI to OpenAI for processing.
3. Codex proposes persona candidates supported by that evidence.
4. The local builder validates candidate IDs, values, confidence labels, source references, and privacy policy.
5. Accepted non-sensitive candidates are compiled into the private active persona.

Do not select source material that should not be processed by OpenAI. Declining prepopulation keeps the source material out of the Codex prepopulation request.

Raw ChatGPT exports and memory files remain at their user-selected locations unless the user deliberately copies them into the local `source-material/` folder. The app must not commit or upload them to GitHub.

## 6. Evidence rules

`matraix/persona/schema/dimensions.json` is the authority for dimension IDs, categories, and allowed values.

Prepopulation must follow these rules:

- Review the complete schema systematically rather than filling only familiar traits.
- Use an exact allowed schema value for every included dimension.
- Ground candidates in user-authored statements or explicitly approved saved-memory material.
- Do not treat assistant speculation, bundled examples, survey defaults, schema defaults, population averages, or demographic stereotypes as user evidence.
- Attach at least one real source reference, at least one supporting document reference, and a short factual evidence note to every model-generated supported candidate.
- Use only the allowed confidence labels documented in [CONFIDENCE_LEVELS.md](matraix/personal-persona/CONFIDENCE_LEVELS.md).
- Leave unsupported dimensions unknown.
- Withhold history-derived sensitive dimensions according to `matraix/personal-persona/sensitive-dimensions.json` until the user confirms them directly in Update persona.
- Record missing history, incomplete time coverage, unreadable files, and other evidence limitations explicitly.

The private candidate document is written to:

```text
matraix/personal-persona/survey/data/persona-candidates.json
```

Its high-level shape is:

```json
{
  "schema_version": 1,
  "persona": {
    "persona_id": "safe-local-id",
    "display_name": "User-selected name",
    "version": "1.0"
  },
  "source_coverage": {
    "generated_at": "CURRENT_UTC_TIMESTAMP",
    "sources": [],
    "schema_categories_reviewed": ["*"],
    "schema_review_complete": true,
    "limitations": []
  },
  "candidates": []
}
```

`["*"]` and `schema_review_complete: true` are valid only when every current schema category was actually reviewed. A consent-declined, evidence-free, or interrupted sparse build records the categories it completed and sets `schema_review_complete` to false rather than claiming full coverage.

## 7. Private files and Git safety

The repository tracks only the all-null distribution template:

```text
matraix/personal-persona/persona.example.yaml
```

Private local state is stored under ignored paths, including:

```text
matraix/personal-persona/persona.yaml
matraix/personal-persona/source-material/
matraix/personal-persona/survey/data/
matraix/.venv/
.local-logs/
```

Persona and candidate artifacts are protected with private file permissions. In a Git checkout, the builder also verifies that private artifacts are ignored. In an extracted GitHub ZIP, the shipped `.gitignore` protects those paths if the folder is later initialized as a Git repository.

Never force-add private files. Before publishing changes from a configured checkout, run:

```bash
git status --short
npm run check:release
```

The release check rejects active persona files, survey state, source material, common credentials, private keys, personal absolute paths, and other local artifacts from a release candidate.

## 8. Existing installations and reruns

`install.sh`, `onboard.sh`, and `start-local.sh` preserve an existing `matraix/personal-persona/persona.yaml`.

- Reinstalling dependencies does not reset the persona.
- Running onboarding again does not silently replace an existing persona.
- Normal startup skips onboarding when an active private persona already exists.
- Starting the app never replaces the active persona with the blank template.
- Update persona and an explicitly approved rebuild may refine private local state.
- Each persona keeps separate local survey and Validation context under `survey/data/personas/`.

Back up the ignored private files separately if they must survive deletion of the checkout. Git does not back them up.

## 9. Start and verify the app

Run:

```bash
./start-local.sh
```

The server binds to `127.0.0.1` and opens:

```text
http://127.0.0.1:8766/#chat
```

Verify the three main areas:

- Chat can send a message through the signed-in Codex CLI.
- Update persona shows the active persona name and populated dimension count, and can save an answer.
- Validation can save a Human benchmark and run Agent validation through Codex.

Update persona and Validation must both derive the populated dimension count from the same active `persona.yaml`. Confirm that both views show the same count and that only non-null dimension values are counted.

Keep the Terminal window open while using the app. Press Control-C there to stop it.

For later use, double-click `Start MatrAIx.command` or run `./start-local.sh` again.

## 10. Troubleshooting

### Codex is missing

Install a supported Codex CLI or the Codex desktop app, then rerun `./onboard.sh`.

### Codex is not signed in

Run:

```bash
codex login
```

Choose ChatGPT sign-in, finish the browser flow, and rerun `./onboard.sh`.

### ChatGPT history or memory is unavailable

This is an evidence limitation, not an installation failure. Continue with local Codex memory, an approved export or text file, or no prepopulation. Use Update persona to fill gaps later.

### Port 8766 is already in use

Stop the process currently using the port, then rerun `./start-local.sh`.

### The folder came from a ZIP and a script is not executable

Run the `chmod +x` command from the installation section, then retry.

## 11. Maintainer verification

Node.js is needed only to rebuild and verify the bundled frontend, not for normal app use. Before a GitHub release, run in a clean checkout:

```bash
npm ci
npm run check
npm run build
npm run check:release
git diff --check
git status --short
```

Then test the automatic `./install.sh` onboarding flow and `./start-local.sh` from both a fresh Git clone and an extracted GitHub archive. Also test a manual `./onboard.sh` rerun. Cover signed-out, already-signed-in, prepopulation-approved, prepopulation-declined, interrupted-onboarding, and repeated-onboarding paths without using private fixture data.
