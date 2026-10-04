"""Audit log for tool calls and authentication decisions."""

from app.audit.events import (
    ACTION_AUTH_ALLOW,
    ACTION_AUTH_DENY,
    ACTION_MCP_TOOLS_CALL,
    ACTION_TOOL_CALL,
    STATUS_DENIED,
    STATUS_ERROR,
    STATUS_FORWARDED,
    STATUS_OK,
    AuditEventOut,
    AuditRecord,
)
from app.audit.sink import (
    AuditListener,
    AuditSink,
    AuditUnavailableError,
    add_audit_listener,
    get_audit_sink,
    record_event,
    remove_audit_listener,
    set_audit_sink,
)
from app.audit.stream import audit_broadcaster

__all__ = [
    "ACTION_AUTH_ALLOW",
    "ACTION_AUTH_DENY",
    "ACTION_MCP_TOOLS_CALL",
    "ACTION_TOOL_CALL",
    "STATUS_DENIED",
    "STATUS_ERROR",
    "STATUS_FORWARDED",
    "STATUS_OK",
    "AuditEventOut",
    "AuditListener",
    "AuditRecord",
    "AuditSink",
    "AuditUnavailableError",
    "add_audit_listener",
    "audit_broadcaster",
    "get_audit_sink",
    "record_event",
    "remove_audit_listener",
    "set_audit_sink",
]
