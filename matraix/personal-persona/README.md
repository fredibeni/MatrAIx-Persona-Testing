# Local persona runtime

This directory holds one private active persona and the local service used by the top-level MatrAIx app.

Start the combined app from the repository root:

```bash
./start-local.sh
```

The app has three tabs:

- Chat - direct conversation grounded in the active persona YAML.
- Update persona - adaptive questions for missing or weak dimensions.
- Validation - local Human and Agent Mirror Match survey runs.

## Active persona

`persona.yaml` is the local source of truth. The initial file is compiled from the private candidate JSON described in the repository [bootstrap guide](../../BOOTSTRAP.md). It is ignored by Git.

Replacing `persona.yaml` with another compatible persona creates a separate local questionnaire and Validation context. Existing contexts remain under `survey/data/personas/`, so restoring a previously used persona YAML also restores its saved questionnaire state, Human benchmarks, and Agent runs.

Use [Persona confidence levels](CONFIDENCE_LEVELS.md) when assessing source evidence. Every included schema dimension must use an exact value from `../persona/schema/dimensions.json`, an allowed confidence label, and a short factual evidence note. Missing evidence stays unknown instead of being replaced by a default or demographic guess.

## Local-only files

The following content is private and generated locally:

- `persona.yaml` - the compiled active persona.
- `source-material/` - user-provided source files retained with the install.
- `survey/data/persona-candidates.json` - the private candidate evidence.
- `survey/data/` - questionnaire state, build reports, and Validation results.
- `../.venv/` - the isolated Python environment.

These paths are ignored by Git. Do not force-add them to a commit.

## Useful checks

Validate the candidate and compile the active persona from the repository root using the commands in [BOOTSTRAP.md](../../BOOTSTRAP.md).

Render the active persona prompt without calling a model:

```bash
./matraix/personal-persona/start-chat.sh --dry-run
```

Run the local Python tests:

```bash
env PYTHONDONTWRITEBYTECODE=1 \
  PYTHONPATH="$PWD/matraix:$PWD/matraix/src:$PWD/matraix/environment/agents" \
  matraix/.venv/bin/python -m unittest discover \
  -s matraix/personal-persona/survey -p 'test_*.py' -v
```
