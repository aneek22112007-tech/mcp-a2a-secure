"""Official A2A SDK protocol integration.

Defines the worker agent card, task state mappings, and serialization helpers
using the official ``a2a`` Python package.
"""

from __future__ import annotations

from importlib.metadata import PackageNotFoundError, version
from typing import Any

from a2a.types import (
    AgentCapabilities,
    AgentCard,
    AgentSkill,
    Message,
    Part,
    Role,
    Task,
    TaskState,
    TaskStatus,
)
from google.protobuf.json_format import MessageToDict

from app.models.a2a_tasks import (
    A2A_STATUS_BLOCKED,
    A2A_STATUS_CANCELLED,
    A2A_STATUS_COMPLETED,
    A2A_STATUS_FAILED,
    A2A_STATUS_PENDING,
    A2A_STATUS_RUNNING,
    A2ATask,
)

try:
    A2A_SDK_VERSION: str = version("a2a-sdk")
except PackageNotFoundError:  # pragma: no cover - dependency is required
    A2A_SDK_VERSION = "unknown"

_STATUS_MAP: dict[str, TaskState.ValueType] = {
    A2A_STATUS_PENDING: TaskState.TASK_STATE_SUBMITTED,
    A2A_STATUS_RUNNING: TaskState.TASK_STATE_WORKING,
    A2A_STATUS_COMPLETED: TaskState.TASK_STATE_COMPLETED,
    A2A_STATUS_FAILED: TaskState.TASK_STATE_FAILED,
    A2A_STATUS_CANCELLED: TaskState.TASK_STATE_CANCELED,
    A2A_STATUS_BLOCKED: TaskState.TASK_STATE_REJECTED,
}


def build_worker_agent_card() -> AgentCard:
    """Return the official A2A AgentCard for the notes worker agent."""
    return AgentCard(
        name="mcp-guard-notes-worker",
        description="A2A notes worker agent that interacts with notes tools via MCP Guard",
        version="1.0.0",
        capabilities=AgentCapabilities(streaming=False),
        skills=[
            AgentSkill(
                id="notes",
                name="Notes Management",
                description="Read, list, and write notes in the secure sandbox",
                tags=["notes", "sandbox", "mcp"],
            )
        ],
    )


def agent_card_dict() -> dict[str, Any]:
    """Return the JSON-serializable dictionary representation of the AgentCard."""
    card = build_worker_agent_card()
    return MessageToDict(card)


def task_to_a2a_task(
    task: A2ATask,
    tool_calls: list[dict[str, Any]] | None = None,
) -> Task:
    """Map an internal A2ATask database model to an official A2A Task protobuf."""
    proto_state = _STATUS_MAP.get(task.status, TaskState.TASK_STATE_UNSPECIFIED)

    history: list[Message] = []
    if task.task_input:
        history.append(
            Message(
                role=Role.ROLE_USER,
                parts=[Part(text=task.task_input)],
            )
        )
    if task.result:
        history.append(
            Message(
                role=Role.ROLE_AGENT,
                parts=[Part(text=task.result)],
            )
        )
    elif task.error:
        history.append(
            Message(
                role=Role.ROLE_AGENT,
                parts=[Part(text=f"Error: {task.error}")],
            )
        )

    return Task(
        id=task.id,
        status=TaskStatus(state=proto_state),
        history=history,
    )


def a2a_task_dict(
    task: A2ATask,
    tool_calls: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Return the JSON-serializable dictionary representation of the A2A Task."""
    proto_task = task_to_a2a_task(task, tool_calls)
    return MessageToDict(proto_task)
