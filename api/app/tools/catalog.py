"""Live tool definitions and the schema fingerprint used by pinning.

The fingerprint covers the published contract: name, description, input
schema, and output schema when the tool has one. Context parameters are
already omitted from the FastMCP schema. The implementation digest is a
separate hash of the registered function source. Callers may store it.
Allow and deny decisions must not use it.
"""

from __future__ import annotations

import hashlib
import inspect
import json
from dataclasses import dataclass
from typing import Any

from app.mcp_server import mcp


@dataclass(frozen=True, slots=True)
class ToolDefinition:
    """One registered tool, copied so later edits do not change the snapshot."""

    name: str
    description: str
    input_schema: dict[str, Any]
    output_schema: dict[str, Any] | None


def list_tool_definitions() -> list[ToolDefinition]:
    """Return the tools FastMCP has registered, ordered by name."""

    definitions: list[ToolDefinition] = []
    for tool in mcp._tool_manager.list_tools():
        output = tool.output_schema
        description = tool.description if isinstance(tool.description, str) else ""
        parameters = tool.parameters if isinstance(tool.parameters, dict) else {}
        definitions.append(
            ToolDefinition(
                name=tool.name,
                description=description,
                input_schema=_plain_json(parameters),
                output_schema=None if output is None else _plain_json(output),
            )
        )
    definitions.sort(key=lambda item: item.name)
    return definitions


def get_tool_definition(tool_name: str) -> ToolDefinition | None:
    """Return one live definition, or None when the tool is not registered."""

    for definition in list_tool_definitions():
        if definition.name == tool_name:
            return definition
    return None


def fingerprint_tool(definition: ToolDefinition) -> str:
    """sha256 hex of the canonical tool contract.

    Object keys are sorted at every level. Description whitespace is collapsed
    on each line. ``outputSchema`` is included only when it is not None.
    """

    payload: dict[str, Any] = {
        "name": definition.name,
        "description": _normalise_description(definition.description),
        "inputSchema": _sorted_json(definition.input_schema),
    }
    if definition.output_schema is not None:
        payload["outputSchema"] = _sorted_json(definition.output_schema)
    canonical = json.dumps(
        payload,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def implementation_digest(tool_name: str) -> str | None:
    """sha256 hex of the registered function source, or None when it cannot be read.

    This digest is not an allow or deny input. A schema pin can match while
    the function body has changed, and the reverse is also true.
    """

    try:
        tool = mcp._tool_manager.get_tool(tool_name)
        if tool is None:
            return None
        source = inspect.getsource(tool.fn)
    except Exception:  # noqa: BLE001
        return None
    if not isinstance(source, str) or not source:
        return None
    return hashlib.sha256(source.encode("utf-8")).hexdigest()


def _plain_json(value: dict[str, Any]) -> dict[str, Any]:
    """Copy a schema through JSON so the snapshot is plain data."""

    return json.loads(
        json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    )


def _sorted_json(value: Any) -> Any:
    """Return ``value`` with dict keys sorted at every level."""

    if isinstance(value, dict):
        return {str(key): _sorted_json(value[key]) for key in sorted(value, key=str)}
    if isinstance(value, list):
        return [_sorted_json(item) for item in value]
    return value


def _normalise_description(description: str) -> str:
    """Collapse whitespace on each line and trim the whole description."""

    text = description.replace("\r\n", "\n").replace("\r", "\n")
    lines = [" ".join(line.split()) for line in text.split("\n")]
    return "\n".join(lines).strip()
