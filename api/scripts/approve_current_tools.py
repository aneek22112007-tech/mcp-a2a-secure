"""Approve the live fingerprint of every registered tool.

The script writes the pins directly. It is the operator path for a process
that is not using TOOL_PINNING_BOOTSTRAP_APPROVE. Each approval also tries
to store a tool.pin.approve audit row. A failed audit write does not undo
the pin.
"""

import asyncio
import sys
from pathlib import Path


def _prepare_import_path() -> None:
    root = Path(__file__).resolve().parent.parent
    root_text = str(root)
    if root_text not in sys.path:
        sys.path.insert(0, root_text)


async def _run() -> None:
    from app.audit.events import ACTION_TOOL_PIN_APPROVE, STATUS_OK, AuditRecord
    from app.audit.sink import record_event
    from app.database import engine
    from app.models.audit_events import AUDIT_DECISION_ALLOWED
    from app.services.pins import approve_current_catalog
    from app.tools.catalog import fingerprint_tool, list_tool_definitions

    names = await approve_current_catalog(note="operator", approved_by_api_key_id=None)
    if not names:
        print("No tools are registered.")
        await engine.dispose()
        return

    definitions = {item.name: item for item in list_tool_definitions()}
    for name in names:
        fingerprint = fingerprint_tool(definitions[name])
        event = await record_event(
            AuditRecord(
                action=ACTION_TOOL_PIN_APPROVE,
                decision=AUDIT_DECISION_ALLOWED,
                status=STATUS_OK,
                tool_name=name,
                args_hash=fingerprint,
                reason="operator_script",
            ),
            required=False,
        )
        audit = "audit stored" if event is not None else "audit not stored"
        print(f"approved {name} {fingerprint} ({audit})")

    await engine.dispose()


def main() -> None:
    _prepare_import_path()
    asyncio.run(_run())


if __name__ == "__main__":
    main()
