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


def evaluate_output(text: str) -> GuardResult:
    """Run G1–G6 and the enforce cleaning loop. This does not write an audit row.

    ``scan_text`` and ``sanitize_medium_text`` are looked up on this module so
    tests can replace them.
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
            result_text = (
                "[BLOCKED: Tool output blocked by injection guard "
                f"(rule {highest_rule_id})]"
            )
        else:
            current_text = text
            current_matches = matches
            allowed = False
            blocked = True
            cleaned = False
            action = "blocked"
            result_text = (
                "[BLOCKED: Tool output blocked by injection guard "
                f"(rule {highest_rule_id})]"
            )

            for _attempt in range(3):
                new_text = sanitize_medium_text(current_text, current_matches)
                re_matches = scan_text(new_text)
                re_findings = to_guard_findings(re_matches)

                # Check if re-scan produced any high-severity finding
                re_high_rule = next(
                    (f.rule_id for f in re_findings if f.severity == "high"),
                    None,
                )
                if re_high_rule is not None:
                    highest_severity = "high"
                    highest_rule_id = re_high_rule
                    result_text = (
                        "[BLOCKED: Tool output blocked by injection guard "
                        f"(rule {highest_rule_id})]"
                    )
                    # Include the high finding that caused the block
                    findings = re_findings + [
                        f
                        for f in findings
                        if f.rule_id not in {rf.rule_id for rf in re_findings}
                    ]
                    break

                # Output can be allowed ONLY when a fresh scan confirms NO remaining findings
                if not re_findings:
                    allowed = True
                    blocked = False
                    cleaned = True
                    action = "cleaned"
                    result_text = new_text
                    break

                # If text did not change while findings remain, sanitization made no progress -> fail closed
                if new_text == current_text:
                    break

                # Text changed but findings remain; advance to next attempt if within limit
                current_text = new_text
                current_matches = re_matches

    return GuardResult(
        allowed=allowed,
        blocked=blocked,
        cleaned=cleaned,
        mode=mode,
        action=action,
        text=result_text,
        severity=highest_severity,
        findings=findings,
    )


def check_tool_output(
    text: str,
    *,
    tool_name: str,
    key_prefix: str | None = None,
    request_id: str | None = None,
    audit_action: str = ACTION_TOOL_OUTPUT_INJECTION,
    client_id: str | None = None,
    api_key_id: str | None = None,
) -> GuardResult:
    """Evaluate tool output text against prompt injection rules G1–G6.

    Contract:
        check_tool_output(text, *, tool_name, key_prefix, request_id) -> GuardResult
    """
    result = evaluate_output(text)
    if not result.findings:
        return result

    result._audit_task = _write_guard_audit(
        tool_name=tool_name,
        key_prefix=key_prefix,
        request_id=request_id,
        mode=result.mode,
        action=result.action,
        severity=result.severity,
        findings=result.findings,
        blocked=result.blocked,
        cleaned=result.cleaned,
        audit_action=audit_action,
        client_id=client_id,
        api_key_id=api_key_id,
    )
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
    audit_action: str = ACTION_TOOL_OUTPUT_INJECTION,
    client_id: str | None = None,
    api_key_id: str | None = None,
) -> Any:
    """Record a guard hit audit log event."""

    rule_ids = ",".join(f.rule_id for f in findings)
    reason_str = safe_reason(
        f"mode={mode} action={action} severity={severity} rules={rule_ids}"
    )

    record = AuditRecord(
        action=audit_action,
        decision=AUDIT_DECISION_DENIED if blocked else AUDIT_DECISION_ALLOWED,
        status=STATUS_DENIED if blocked else (STATUS_OK if not cleaned else "cleaned"),
        client_id=client_id,
        api_key_id=api_key_id,
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
