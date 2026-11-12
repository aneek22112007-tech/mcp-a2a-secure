"""Approve the live fingerprint of every registered tool.

The script registers the same upstreams as the API, then writes the pins.
It is the operator path when TOOL_PINNING_BOOTSTRAP_APPROVE is off. Each
approval stores a tool.pin.approve audit row. A failed audit write does not
undo the pin; the script exits 1.
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
    import app.upstream.filesystem
    import app.upstream.lab  # noqa: F401 - same startup import as the API lifespan
    from app.audit.events import ACTION_TOOL_PIN_APPROVE, STATUS_OK, AuditRecord
    from app.audit.sink import record_event
    from app.database import engine
    from app.models.audit_events import AUDIT_DECISION_ALLOWED
    from app.services.pins import approve_current_catalog
    from app.tools.catalog import fingerprint_tool, list_tool_definitions
    from app.upstream.registry import register_upstreams

    await register_upstreams()
    names = await approve_current_catalog(note="operator", approved_by_api_key_id=None)
    if not names:
        print("No tools are registered.")
        await engine.dispose()
        return

    definitions = {item.name: item for item in list_tool_definitions()}
    failed = False
    for name in names:
        fingerprint = fingerprint_tool(definitions[name])
        try:
            await record_event(
                AuditRecord(
                    action=ACTION_TOOL_PIN_APPROVE,
                    decision=AUDIT_DECISION_ALLOWED,
                    status=STATUS_OK,
                    tool_name=name,
                    args_hash=fingerprint,
                    reason="operator_script",
                ),
                required=True,
            )
        except Exception:  # noqa: BLE001 - any audit failure must exit 1
            print("approval saved but audit row failed")
            failed = True
            break
        print(f"approved {name}")

    await engine.dispose()
    if failed:
        sys.exit(1)


def main() -> None:
    _prepare_import_path()
    asyncio.run(_run())


if __name__ == "__main__":
    main()
