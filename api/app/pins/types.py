"""Pin statuses, denial reasons, and pinning modes."""

PIN_STATUS_APPROVED = "approved"
PIN_STATUS_PENDING = "pending"
PIN_STATUS_REVOKED = "revoked"

PIN_STATUSES = frozenset({PIN_STATUS_APPROVED, PIN_STATUS_PENDING, PIN_STATUS_REVOKED})

PIN_REASON_MISSING = "pin_missing"
PIN_REASON_REVOKED = "pin_revoked"
PIN_REASON_DRIFT = "pin_drift"
PIN_REASON_SCAN_BLOCKED = "pin_scan_blocked"

MODE_OFF = "off"
MODE_WARN = "warn"
MODE_ENFORCE = "enforce"

__all__ = [
    "MODE_ENFORCE",
    "MODE_OFF",
    "MODE_WARN",
    "PIN_REASON_DRIFT",
    "PIN_REASON_MISSING",
    "PIN_REASON_REVOKED",
    "PIN_REASON_SCAN_BLOCKED",
    "PIN_STATUSES",
    "PIN_STATUS_APPROVED",
    "PIN_STATUS_PENDING",
    "PIN_STATUS_REVOKED",
]
