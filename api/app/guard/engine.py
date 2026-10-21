"""Prompt-injection guard engine for tool outputs."""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from app.audit.events import (
    ACTION_TOOL_OUTPUT_INJECTION,
    AUDIT_DECISION_ALLOWED,
    AUDIT_DECISION_DENIED,
    STATUS_DENIED,
    STATUS_OK,
    AuditRecord,
)
from app.audit.redaction import safe_reason
from app.audit.sink import record_event
from app.config import settings
from app.guard.models import GuardResult
from app.guard.rules import sanitize_medium_text, scan_text, to_guard_findings

logger = logging.getLogger(__name__)


def check_tool_output(
    text: str,
    *,
    tool_name: str,
    key_prefix: str | None = None,
    request_id: str | None = None,
) -> GuardResult:
    """Evaluate tool output text against prompt injection rules G1–G6.

    Contract:
        check_tool_output(text, *, tool_name, key_prefix, request_id) -> GuardResult
    """
    mode = settings.injection_guard_mode
    if mode == "off":
        return GuardResult(
            allowed=True,
            blocked=False,
            cleaned=False,
            mode="off",
            action="allow",
            text=text,
            severity="none",
            findings=[],
        )

    matches = scan_text(text)
    findings = to_guard_findings(matches)

    if not findings:
        return GuardResult(
            allowed=True,
            blocked=False,
            cleaned=False,
            mode=mode,
            action="allow",
            text=text,
            severity="none",
            findings=[],
        )

    # Determine highest severity
    has_high = any(f.severity == "high" for f in findings)
    highest_severity = "high" if has_high else "medium"
    highest_rule_id = next(
        (f.rule_id for f in findings if f.severity == "high"),
        findings[0].rule_id,
    )

    if mode == "warn":
        allowed = True
        blocked = False
        cleaned = False
        action = "logged"
        result_text = text
    else:  # enforce
        if has_high:
            allowed = False
            blocked = True
            cleaned = False
            action = "blocked"
            result_text = f"[BLOCKED: Tool output blocked by injection guard (rule {highest_rule_id})]"
        else:
            allowed = True
            blocked = False
            cleaned = True
            action = "cleaned"
            result_text = sanitize_medium_text(text, matches)

    result = GuardResult(
        allowed=allowed,
        blocked=blocked,
        cleaned=cleaned,
        mode=mode,
        action=action,
        text=result_text,
        severity=highest_severity,
        findings=findings,
    )

    # Schedule audit event
    audit_task = _write_guard_audit(
        tool_name=tool_name,
        key_prefix=key_prefix,
        request_id=request_id,
        mode=mode,
        action=action,
        severity=highest_severity,
        findings=findings,
        blocked=blocked,
        cleaned=cleaned,
    )
    result._audit_task = audit_task

    return result


def _write_guard_audit(
    *,
    tool_name: str,
    key_prefix: str | None,
    request_id: str | None,
    mode: str,
    action: str,
    severity: str,
    findings: list[Any],
    blocked: bool,
    cleaned: bool,
) -> Any:
    """Record a guard hit audit log event."""

    rule_ids = ",".join(f.rule_id for f in findings)
    reason_str = safe_reason(
        f"mode={mode} action={action} severity={severity} rules={rule_ids}"
    )

    record = AuditRecord(
        action=ACTION_TOOL_OUTPUT_INJECTION,
        decision=AUDIT_DECISION_DENIED if blocked else AUDIT_DECISION_ALLOWED,
        status=STATUS_DENIED if blocked else (STATUS_OK if not cleaned else "cleaned"),
        tool_name=tool_name,
        key_prefix=key_prefix,
        request_id=request_id,
        reason=reason_str,
    )

    try:
        loop = asyncio.get_running_loop()
        return loop.create_task(record_event(record, required=False))
    except RuntimeError:
        # No running event loop in current thread: run synchronously in new loop
        try:
            return asyncio.run(record_event(record, required=False))
        except Exception as exc:  # noqa: BLE001
            logger.error(
                "Failed to write guard audit record type=%s", type(exc).__name__
            )
            return None
