"""Run an A2A task from the command line.

Usage, from the api/ directory:

    uv run python scripts/run_a2a_task.py "your task"

Environment variables required:
    MANAGER_API_KEY     – API key with agent:run scope (manager identity)
    API_BASE_URL        – Base URL of the running MCP Guard service
                          (default: http://127.0.0.1:8000)

The script reads credentials exclusively from environment variables.
It prints only: task status, result, task_id, and correlation IDs.
It does not create keys automatically and never prints secret values.

Exit codes:
    0   – task completed or truthful failure reported
    1   – configuration or connectivity error
    2   – usage error
"""

from __future__ import annotations

import asyncio
import os
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
            'usage: uv run python scripts/run_a2a_task.py "your task"',
            file=sys.stderr,
        )
        raise SystemExit(2)
    return task


def _fail(message: str) -> None:
    print(message, file=sys.stderr)
    raise SystemExit(1)


def _get_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        _fail(f"{name} is not set. Export it before running this script.")
    return value


async def _run(task: str) -> None:
    import httpx

    manager_key = _get_env("MANAGER_API_KEY")
    base_url = os.environ.get("API_BASE_URL", "http://127.0.0.1:8000").rstrip("/")

    url = f"{base_url}/api/a2a/tasks/run"
    headers = {
        "Authorization": f"Bearer {manager_key}",
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=150.0, follow_redirects=False) as client:
        try:
            response = await client.post(url, headers=headers, json={"task": task})
        except httpx.ConnectError:
            _fail(f"Cannot connect to {base_url}. Is the service running?")
        except httpx.TimeoutException:
            _fail("Request timed out.")

    if response.status_code == 401:
        _fail("Authentication failed. Check MANAGER_API_KEY.")
    if response.status_code == 403:
        body = _safe_json(response)
        err = body.get("error") if isinstance(body.get("error"), dict) else {}
        msg = err.get("message") or body.get("detail") or "Forbidden"
        _fail(f"Forbidden (403): {msg}")
    if response.status_code == 503:
        body = _safe_json(response)
        err = body.get("error") if isinstance(body.get("error"), dict) else {}
        msg = err.get("message") or body.get("detail") or "Service Unavailable"
        _fail(f"Service unavailable (503): {msg}")
    if response.status_code == 422:
        body = _safe_json(response)
        _fail(f"Validation error (422): {body}")
    if response.status_code != 200:
        _fail(f"Unexpected response {response.status_code}: {response.text[:300]}")

    body = response.json()
    _print_outcome(body)


def _print_outcome(body: dict) -> None:
    task_id = body.get("task_id", "-")
    status = body.get("status", "-")
    result = body.get("result", "(none)")
    provider = body.get("provider") or "-"
    model = body.get("model") or "-"
    manager_request_id = body.get("manager_request_id") or "-"
    worker_key_prefix = body.get("worker_key_prefix") or "-"
    delegated_scopes = body.get("delegated_scopes") or []

    print(f"status:               {status}")
    print(f"task_id:              {task_id}")
    print(f"manager_request_id:   {manager_request_id}")
    print(f"worker_key_prefix:    {worker_key_prefix}")
    print(f"delegated_scopes:     {', '.join(delegated_scopes) or '(none)'}")
    print(f"provider:             {provider}")
    print(f"model:                {model}")
    print()
    print("result:")
    print(result)
    print()

    tool_calls = body.get("tool_calls") or []
    print(f"tool_calls ({len(tool_calls)}):")
    if not tool_calls:
        print("  (none)")
    else:
        for call in tool_calls:
            err = call.get("error")
            suffix = f"  error={err}" if err else ""
            print(f"  {call.get('name')} status={call.get('status')}{suffix}")


def _safe_json(response) -> dict:
    try:
        return response.json()
    except (ValueError, TypeError):
        return {}


def _safe_detail(body: dict) -> str:
    detail = body.get("detail") or body.get("error") or {}
    if isinstance(detail, str):
        return detail
    if isinstance(detail, dict):
        return detail.get("message") or str(detail)
    return str(detail)


def main() -> None:
    _prepare_import_path()
    task = _task_from_argv(sys.argv)
    asyncio.run(_run(task))


if __name__ == "__main__":
    main()
