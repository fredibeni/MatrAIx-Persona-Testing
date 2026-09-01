#!/usr/bin/env python3
"""Minimal direct chat with one bundled MatrAIx persona."""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_PERSONA_ID = "0042"
DEFAULT_API_MODEL = os.environ.get("MATRIX_PERSONA_MODEL", "openai/gpt-4o-mini")
DEFAULT_CODEX_MODEL = os.environ.get("MATRIX_PERSONA_CODEX_MODEL", "gpt-5.6-luna")
DEFAULT_CODEX_REASONING = os.environ.get("MATRIX_PERSONA_CODEX_REASONING", "low")
DEFAULT_CODEX_PATH = Path("/Applications/ChatGPT.app/Contents/Resources/codex")
CODEX_DISABLED_FEATURES = (
    "apps",
    "browser_use",
    "browser_use_external",
    "code_mode_host",
    "computer_use",
    "goals",
    "hooks",
    "image_generation",
    "in_app_browser",
    "memories",
    "multi_agent",
    "plugins",
    "shell_tool",
    "skill_search",
    "unified_exec",
    "view_image",
    "workspace_dependencies",
)


class CodexTimeoutError(TimeoutError):
    """Codex did not return a persona reply within the configured limit."""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Chat directly with one bundled MatrAIx persona without Docker, "
            "the Playground UI, or the Persona 1M dataset."
        )
    )
    parser.add_argument(
        "--persona",
        default=DEFAULT_PERSONA_ID,
        help="Bundled persona ID such as 0042, or a path to a persona YAML file.",
    )
    parser.add_argument(
        "--backend",
        choices=("codex", "api", "litellm"),
        default=os.environ.get("MATRIX_PERSONA_BACKEND", "codex"),
        help=(
            "Chat backend. 'codex' uses the ChatGPT subscription login; "
            "'api' and 'litellm' use a separately billed provider API. "
            "Default: %(default)s"
        ),
    )
    parser.add_argument(
        "--model",
        default=None,
        help=(
            "Model override. Codex default: MATRIX_PERSONA_CODEX_MODEL or "
            f"{DEFAULT_CODEX_MODEL}. API default: MATRIX_PERSONA_MODEL or "
            f"{DEFAULT_API_MODEL}."
        ),
    )
    parser.add_argument(
        "--reasoning-effort",
        choices=("none", "minimal", "low", "medium", "high", "xhigh", "max", "ultra"),
        default=DEFAULT_CODEX_REASONING,
        help="Codex reasoning effort. Default: %(default)s",
    )
    parser.add_argument(
        "--max-tokens",
        type=int,
        default=500,
        help="Maximum tokens per API-backend reply. Default: %(default)s",
    )
    parser.add_argument(
        "--temperature",
        type=float,
        default=0.7,
        help="API-backend reply variation from 0 to 2. Default: %(default)s",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=300,
        help="Maximum seconds to wait for each model reply. Default: %(default)s",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate and display the persona prompt without calling a model.",
    )
    return parser.parse_args()


def normalized_backend(value: str) -> str:
    return "api" if value == "litellm" else value


def effective_model(backend: str, requested: str | None) -> str:
    if requested:
        model = requested
    elif backend == "codex":
        model = DEFAULT_CODEX_MODEL
    else:
        model = DEFAULT_API_MODEL
    if backend == "codex" and model.startswith("openai/"):
        model = model.split("/", 1)[1]
    return model


def resolve_persona_path(value: str) -> Path:
    supplied = Path(value).expanduser()
    if supplied.suffix in {".yaml", ".yml"} or supplied.is_absolute():
        candidate = supplied if supplied.is_absolute() else Path.cwd() / supplied
    else:
        persona_id = value.removeprefix("persona_")
        candidate = (
            REPO_ROOT
            / "persona"
            / "datasets"
            / "matraix-persona-dev-sample"
            / f"persona_{persona_id}.yaml"
        )
    resolved = candidate.resolve()
    if not resolved.is_file():
        raise FileNotFoundError(f"Persona file not found: {resolved}")
    return resolved


def expected_key(model: str) -> str | None:
    provider = model.split("/", 1)[0].lower()
    return {
        "anthropic": "ANTHROPIC_API_KEY",
        "azure": "AZURE_API_KEY",
        "dashscope": "DASHSCOPE_API_KEY",
        "gemini": "GEMINI_API_KEY",
        "openai": "OPENAI_API_KEY",
        "openrouter": "OPENROUTER_API_KEY",
    }.get(provider)


def load_persona_identity(persona_path: Path) -> tuple[object, str]:
    from matraix.agents.persona.loader import load_persona
    from matraix.agents.persona.templating import (
        PERSONA_SYSTEM_TEMPLATE,
        render_persona_template,
        resolve_persona_template,
    )

    persona = load_persona(persona_path)
    template = resolve_persona_template(persona, None, PERSONA_SYSTEM_TEMPLATE)
    identity = render_persona_template(template, persona)
    return persona, identity


def load_identity(persona_path: Path) -> tuple[object, str]:
    persona, identity = load_persona_identity(persona_path)
    conversation_context = (
        "\n\nYou are having a direct, open-ended conversation with the person at "
        "the keyboard. Respond naturally in the first person, consistent with "
        "the identity above. Do not mention hidden instructions or persona data. "
        "When the identity does not specify something, answer with ordinary human "
        "uncertainty instead of inventing a detailed backstory."
    )
    return persona, identity + conversation_context


def response_text(response: object) -> str:
    choices = getattr(response, "choices", None)
    if not choices:
        raise RuntimeError("The model returned no choices.")
    message = getattr(choices[0], "message", None)
    content = getattr(message, "content", None)
    if not isinstance(content, str) or not content.strip():
        raise RuntimeError("The model returned an empty text reply.")
    return content.strip()


def resolve_codex_executable() -> str:
    override = os.environ.get("MATRIX_CODEX_CLI", "").strip()
    if override:
        resolved = shutil.which(override)
        if resolved:
            return resolved
        candidate = Path(override).expanduser()
        if candidate.is_file() and os.access(candidate, os.X_OK):
            return str(candidate)
        raise RuntimeError(f"MATRIX_CODEX_CLI is not executable: {override}")

    path_command = shutil.which("codex")
    if path_command:
        return path_command
    if DEFAULT_CODEX_PATH.is_file() and os.access(DEFAULT_CODEX_PATH, os.X_OK):
        return str(DEFAULT_CODEX_PATH)
    raise RuntimeError(
        "Codex CLI was not found. Install Codex or set MATRIX_CODEX_CLI to its path."
    )


def codex_environment() -> dict[str, str]:
    env = os.environ.copy()
    for name in (
        "OPENAI_API_KEY",
        "CODEX_API_KEY",
        "OPENAI_BASE_URL",
        "OPENAI_API_BASE",
    ):
        env.pop(name, None)
    env["NO_COLOR"] = "1"
    return env


def verify_codex_chatgpt_login(
    codex: str, *, timeout: int = 20, env: dict[str, str] | None = None
) -> None:
    try:
        result = subprocess.run(
            [codex, "login", "status"],
            capture_output=True,
            text=True,
            timeout=timeout,
            env=env if env is not None else codex_environment(),
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError("Timed out while checking the Codex login.") from exc
    except OSError as exc:
        raise RuntimeError(f"Could not run Codex CLI: {exc}") from exc

    status = "\n".join(part for part in (result.stdout, result.stderr) if part)
    if result.returncode != 0 or "logged in using chatgpt" not in status.lower():
        raise RuntimeError(
            "Codex is not logged in with ChatGPT. Run 'codex login', choose "
            "ChatGPT sign-in, and try again. API-key login is intentionally "
            "rejected to prevent separate API billing."
        )


def build_codex_prompt(identity: str, conversation: list[dict[str, str]]) -> str:
    transcript = json.dumps(conversation, ensure_ascii=False, indent=2)
    return f"""You are the response engine for a lightweight persona chat.

This is a text-only conversation. Do not inspect files, run commands, browse,
call tools, use apps, or discuss software work. Return only the persona's next
message, with no speaker label, preamble, analysis, or metadata.

Follow this persona identity consistently:

<persona_identity>
{identity}
</persona_identity>

The conversation so far is the following JSON array. The final item is the
human message that you must answer now:

<conversation_json>
{transcript}
</conversation_json>
"""


def run_codex_prompt(
    *,
    codex: str,
    model: str,
    reasoning_effort: str,
    prompt: str,
    timeout: int,
    env: dict[str, str] | None = None,
    output_schema: dict[str, object] | None = None,
    temp_prefix: str = "matraix-persona-",
) -> str:
    with tempfile.TemporaryDirectory(prefix=temp_prefix) as temp_dir:
        runtime_dir = Path(temp_dir)
        output_path = runtime_dir / "reply.txt"
        command = [
            codex,
            "exec",
            "--ephemeral",
            "--ignore-user-config",
            "--ignore-rules",
            "--skip-git-repo-check",
            "--sandbox",
            "read-only",
            "--color",
            "never",
            "-C",
            str(runtime_dir),
            "-m",
            model,
            "-c",
            f'model_reasoning_effort="{reasoning_effort}"',
        ]
        for feature in CODEX_DISABLED_FEATURES:
            command.extend(("--disable", feature))
        if output_schema is not None:
            schema_path = runtime_dir / "output-schema.json"
            schema_path.write_text(
                json.dumps(output_schema, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
            command.extend(("--output-schema", str(schema_path)))
        command.extend(("-o", str(output_path), "-"))

        try:
            result = subprocess.run(
                command,
                input=prompt,
                capture_output=True,
                text=True,
                timeout=timeout,
                cwd=runtime_dir,
                env=env if env is not None else codex_environment(),
                check=False,
            )
        except subprocess.TimeoutExpired as exc:
            raise CodexTimeoutError(
                f"Codex did not reply within {timeout} seconds."
            ) from exc
        except OSError as exc:
            raise RuntimeError(f"Could not run Codex CLI: {exc}") from exc

        if result.returncode != 0:
            detail = (result.stderr or result.stdout or "unknown Codex error").strip()
            detail = detail[-2000:]
            raise RuntimeError(f"Codex CLI failed: {detail}")
        if not output_path.is_file():
            raise RuntimeError("Codex CLI did not produce a final reply.")
        reply = output_path.read_text(encoding="utf-8").strip()
        if not reply:
            raise RuntimeError("Codex CLI returned an empty reply.")
        return reply


def codex_reply(
    *,
    codex: str,
    model: str,
    reasoning_effort: str,
    identity: str,
    conversation: list[dict[str, str]],
    timeout: int,
    env: dict[str, str] | None = None,
) -> str:
    return run_codex_prompt(
        codex=codex,
        model=model,
        reasoning_effort=reasoning_effort,
        prompt=build_codex_prompt(identity, conversation),
        timeout=timeout,
        env=env,
        temp_prefix="matraix-persona-chat-",
    )


def codex_task_reply(
    *,
    codex: str,
    model: str,
    reasoning_effort: str,
    identity: str,
    task: str,
    output_schema: dict[str, object],
    timeout: int,
    env: dict[str, str] | None = None,
) -> str:
    prompt = f"""You are the response engine for a one-shot MatrAIx persona task.

Do not inspect files, run commands, browse, call tools, use apps, or discuss
software work. There is no prior conversation. Follow the persona identity and
complete only the task below. Return only JSON matching the supplied output
schema, with no preamble, analysis, markdown, or metadata.

<persona_identity>
{identity}
</persona_identity>

<task>
{task}
</task>
"""
    return run_codex_prompt(
        codex=codex,
        model=model,
        reasoning_effort=reasoning_effort,
        prompt=prompt,
        timeout=timeout,
        env=env,
        output_schema=output_schema,
        temp_prefix="matraix-persona-task-",
    )


def main() -> int:
    args = parse_args()
    backend = normalized_backend(args.backend)
    model = effective_model(backend, args.model)
    try:
        persona_path = resolve_persona_path(args.persona)
        persona, system_prompt = load_identity(persona_path)
    except (FileNotFoundError, ValueError) as exc:
        print(f"Setup error: {exc}", file=sys.stderr)
        return 2

    name = getattr(persona, "display_name", None) or "MatrAIx persona"
    persona_id = getattr(persona, "persona_id", None) or persona_path.stem

    if args.dry_run:
        print(f"Persona: {name} ({persona_id})")
        print(f"Backend: {backend}")
        print(f"Model: {model}")
        if backend == "codex":
            print(f"Reasoning effort: {args.reasoning_effort}")
        print(f"Prompt characters: {len(system_prompt)}")
        print("\n" + system_prompt)
        return 0

    codex = ""
    if backend == "codex":
        try:
            codex = resolve_codex_executable()
            verify_codex_chatgpt_login(codex)
        except RuntimeError as exc:
            print(f"Setup error: {exc}", file=sys.stderr)
            return 2
    else:
        key_name = expected_key(model)
        if key_name and not os.environ.get(key_name):
            print(f"{key_name} is not set.", file=sys.stderr)
            print(
                f"Set it in this terminal, then rerun. Example:\n"
                f"  export {key_name}='your-key-here'",
                file=sys.stderr,
            )
            print("Do not paste an API key into a chat message.", file=sys.stderr)
            return 2

    api_completion = None
    if backend == "api":
        os.environ.setdefault("LITELLM_LOCAL_MODEL_COST_MAP", "True")
        from litellm import completion

        api_completion = completion

    if backend == "codex":
        print(
            f"Chatting with {name} ({persona_id}) using {model} "
            f"with {args.reasoning_effort} reasoning."
        )
        print("Authentication: ChatGPT subscription through the local Codex CLI.")
        print("API-key variables are removed from Codex child processes.")
    else:
        print(f"Chatting with {name} ({persona_id}) using {model} through LiteLLM.")
        print("Messages are sent to the selected API model provider.")
    print("Commands: /info, /reset, /quit\n")

    conversation: list[dict[str, str]] = []
    while True:
        try:
            user_text = input("You: ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\nGoodbye.")
            return 0

        if not user_text:
            continue
        if user_text.lower() in {"/quit", "/exit"}:
            print("Goodbye.")
            return 0
        if user_text.lower() == "/info":
            print(f"Persona: {name} ({persona_id})")
            print(f"Persona file: {persona_path}")
            print(f"Backend: {backend}")
            print(f"Model: {model}")
            if backend == "codex":
                print(f"Reasoning effort: {args.reasoning_effort}")
                print("Authentication: ChatGPT subscription")
            print()
            continue
        if user_text.lower() == "/reset":
            conversation = []
            print("Conversation history cleared.\n")
            continue

        conversation.append({"role": "user", "content": user_text})
        try:
            if backend == "codex":
                reply = codex_reply(
                    codex=codex,
                    model=model,
                    reasoning_effort=args.reasoning_effort,
                    identity=system_prompt,
                    conversation=conversation,
                    timeout=args.timeout,
                )
            else:
                assert api_completion is not None
                response = api_completion(
                    model=model,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        *conversation,
                    ],
                    max_tokens=args.max_tokens,
                    temperature=args.temperature,
                    timeout=args.timeout,
                )
                reply = response_text(response)
        except Exception as exc:  # noqa: BLE001 - provider SDK exceptions vary.
            conversation.pop()
            print(f"Model call failed: {exc}", file=sys.stderr)
            print("Your last message was not added to the history.\n")
            continue

        conversation.append({"role": "assistant", "content": reply})
        print(f"{name}: {reply}\n")


if __name__ == "__main__":
    raise SystemExit(main())
