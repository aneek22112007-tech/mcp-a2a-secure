"""Audit action constants and the record written by the sink."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import TYPE_CHECKING

from pydantic import BaseModel, ConfigDict

from app.models.audit_events import AUDIT_DECISION_ALLOWED, AUDIT_DECISION_DENIED

if TYPE_CHECKING:
    from app.auth.principal import Principal

ACTION_AUTH_ALLOW = "auth.allow"
ACTION_AUTH_DENY = "auth.deny"
ACTION_TOOL_CALL = "tool.call"
ACTION_TOOL_RESULT = "tool.result"
ACTION_TOOL_PIN_APPROVE = "tool.pin.approve"
ACTION_TOOL_PIN_REVOKE = "tool.pin.revoke"
ACTION_TOOL_PIN_DENY = "tool.pin.deny"
ACTION_TOOL_PIN_DRIFT = "tool.pin.drift"
ACTION_TOOL_PIN_UNAPPROVED = "tool.pin.unapproved"
ACTION_MCP_TOOLS_CALL = "mcp.tools_call"
ACTION_TOOL_SCAN_COMPLETED = "tool.scan.completed"
ACTION_TOOL_SCAN_FINDING = "tool.scan.finding"
ACTION_TOOL_SCAN_MANUAL = "tool.scan.manual"
ACTION_TOOL_SCAN_FINDING_RESOLVED = "tool.scan.finding.resolved"

STATUS_OK = "ok"
STATUS_ERROR = "error"
STATUS_DENIED = "denied"
STATUS_FORWARDED = "forwarded"

__all__ = [
    "ACTION_AUTH_ALLOW",
    "ACTION_AUTH_DENY",
    "ACTION_MCP_TOOLS_CALL",
    "ACTION_TOOL_CALL",
    "ACTION_TOOL_PIN_APPROVE",
    "ACTION_TOOL_PIN_DENY",
    "ACTION_TOOL_PIN_DRIFT",
    "ACTION_TOOL_PIN_REVOKE",
    "ACTION_TOOL_PIN_UNAPPROVED",
    "ACTION_TOOL_RESULT",
    "ACTION_TOOL_SCAN_COMPLETED",
    "ACTION_TOOL_SCAN_FINDING",
    "ACTION_TOOL_SCAN_FINDING_RESOLVED",
    "ACTION_TOOL_SCAN_MANUAL",
    "AUDIT_DECISION_ALLOWED",
    "AUDIT_DECISION_DENIED",
    "STATUS_DENIED",
    "STATUS_ERROR",
    "STATUS_FORWARDED",
    "STATUS_OK",
    "AuditEventOut",
    "AuditRecord",
]


@dataclass(frozen=True, slots=True)
class AuditRecord:
    """One audit row. Optional fields stay unset when they do not apply."""

    action: str
    decision: str
    status: str
    client_id: str | None = None
    api_key_id: str | None = None
    key_prefix: str | None = None
    request_id: str | None = None
    client_ip: str | None = None
    tool_name: str | None = None
    args_hash: str | None = None
    reason: str | None = None
    status_code: int | None = None
    error_code: str | None = None
    duration_ms: float | None = None

    @staticmethod
    def actor_fields(principal: Principal | None) -> dict[str, str | None]:
        """Copy attribution fields from a principal.

        A missing principal yields nulls. The raw API key is never copied.
        """

        if principal is None:
            return {"client_id": None, "api_key_id": None, "key_prefix": None}
        return {
            "client_id": principal.client_id,
            "api_key_id": principal.api_key_id,
            "key_prefix": principal.key_prefix,
        }


class AuditEventOut(BaseModel):
    """Public audit row. Tool arguments and secrets are not fields."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    created_at: datetime
    action: str
    decision: str
    status: str
    status_code: int | None = None
    error_code: str | None = None
    reason: str | None = None
    tool_name: str | None = None
    args_hash: str | None = None
    duration_ms: float | None = None
    request_id: str | None = None
    client_ip: str | None = None
    client_id: str | None = None
    api_key_id: str | None = None
    key_prefix: str | None = None
