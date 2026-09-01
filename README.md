# Install MatrAIx

Copy the complete prompt below into a new task in the desktop Codex app:

```text
Install my private GitHub repository fredibeni/MatrAIx into ~/Desktop/MatrAIx and set it up as my private local MatrAIx app. Do not overwrite or delete an existing ~/Desktop/MatrAIx folder. Confirm access with `gh auth status -h github.com`, then clone with `gh repo clone fredibeni/MatrAIx "$HOME/Desktop/MatrAIx" -- --depth 1 --filter=blob:none --single-branch`. If GitHub CLI is missing, authentication fails, or the destination already exists, stop and tell me the exact safe next command or choice, without asking me to paste a token into the chat. Once the repository is available, read BOOTSTRAP.md completely and follow it. Build my persona only from user-authored information that is genuinely available in this task, such as my explicit statements, files I supplied, and local Codex or ChatGPT memory that you can actually inspect. Do not claim or assume access to my complete ChatGPT history. Review every category in matraix/persona/schema/dimensions.json, leave unsupported dimensions unknown, and give every included value one allowed confidence level plus a short factual evidence note. Write the private candidate JSON, compile and validate persona.yaml, install the lightweight runtime, confirm the private files are ignored by Git, and start the app. If history or memory is unavailable, make the best valid sparse persona from the available evidence and let the Update persona tab collect the missing information. Complete every safe step that is possible and report any remaining blocker precisely.
```

The prompt creates `~/Desktop/MatrAIx`, builds a local persona, installs the small Python runtime, and opens one local app with:

- Chat - talk to the persona through the Codex binary included with the ChatGPT desktop app.
- Update persona - answer adaptive questions for missing or weak dimensions.
- Validation - compare the persona's survey answers with the person's own answers.

## Minimum requirements

- macOS with the desktop Codex app available through ChatGPT.
- A ChatGPT sign-in that can use Codex.
- Access to the private GitHub repository `fredibeni/MatrAIx`.
- Git and GitHub CLI authenticated with an account that has repository access. Run `gh auth login -h github.com` if needed.
- Python 3.11 or newer.
- Internet access for the private clone and the first Python package installation.

Node.js, Docker, a separately billed OpenAI API key, model downloads, and the full MatrAIx research stack are not required.

## Start it again

Double-click `Start MatrAIx.command` inside `~/Desktop/MatrAIx`.

Or run:

```bash
cd "$HOME/Desktop/MatrAIx"
./start-local.sh
```

The app opens at `http://127.0.0.1:8766/#chat`. Keep the Terminal window open while using it. Press Control-C there to stop the app.

## Private local data

The generated persona, candidate evidence, survey answers, Validation results, logs, and Python environment stay in the local checkout and are ignored by Git. The server binds only to `127.0.0.1` or `localhost`.

MatrAIx does not gain automatic access to a complete ChatGPT archive. Persona coverage depends on what the active Codex task can genuinely inspect. Missing evidence remains unknown and can be added later in Update persona.

See [BOOTSTRAP.md](BOOTSTRAP.md) for the exact installation workflow and [confidence levels](matraix/personal-persona/CONFIDENCE_LEVELS.md) for the evidence rules.
