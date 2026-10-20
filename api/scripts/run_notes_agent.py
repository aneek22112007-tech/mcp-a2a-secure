"""Run the notes agent from the command line.

Usage, from the api/ directory:

    uv run python scripts/run_notes_agent.py "your task"

The API must already be serving /mcp/. The agent sends NOTES_AGENT_API_KEY
to that endpoint. LLM_ENABLED must be true.
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path


def _prepare_import_path() -> None:
    root = Path(__file__).resolve().parent.parent
    root_text = str(root)
    if root_text not in sys.path:
        sys.path.insert(0, root_text)


def _task_from_argv(argv: list[str]) -> str:
    task = " ".join(argv[1:]).strip()
    if not task:
        print(
            'usage: uv run python scripts/run_notes_agent.py "your task"',
            file=sys.stderr,
        )
        raise SystemExit(2)
    return task


def _fail(message: str) -> None:
    print(message, file=sys.stderr)
    raise SystemExit(1)


async def _run(task: str):
    from app.agents.gateway import GatewayProtocolError, GatewayTransportError
    from app.agents.notes_agent import (
        AgentNotConfiguredError,
        TaskError,
        run_notes_agent,
    )
    from app.llm.backend import LLMDisabledError, LLMUnavailableError

    try:
        return await run_notes_agent(task)
    except LLMDisabledError:
        _fail("LLM is disabled. Set LLM_ENABLED=true.")
    except AgentNotConfiguredError:
        _fail("NOTES_AGENT_API_KEY is not set.")
    except TaskError as exc:
        _fail(str(exc))
    except LLMUnavailableError:
        _fail("LLM is unavailable.")
    except (GatewayTransportError, GatewayProtocolError):
        _fail("MCP gateway is unavailable.")


def _print_outcome(outcome) -> None:
    print(outcome.result)
    print(f"provider: {outcome.provider or '-'}")
    print(f"model: {outcome.model or '-'}")
    if outcome.request_id:
        print(f"request_id: {outcome.request_id}")
    print("tool_calls:")
    if not outcome.tool_calls:
        print("- (none)")
        return
    for call in outcome.tool_calls:
        error = call.get("error")
        suffix = f" error={error}" if error else ""
        print(f"- {call.get('name')} status={call.get('status')}{suffix}")


def main() -> None:
    _prepare_import_path()
    task = _task_from_argv(sys.argv)
    outcome = asyncio.run(_run(task))
    _print_outcome(outcome)


if __name__ == "__main__":
    main()
