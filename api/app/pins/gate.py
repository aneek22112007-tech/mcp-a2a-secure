"""Scan hook consulted after a pin matches.

P6 will supply a real scanner. This module only defines the protocol and a
gate that never blocks.
"""

from __future__ import annotations

from typing import Protocol


class ScanGate(Protocol):
    """Return a reason string when a tool must not run, else None."""

    async def blocking_reason(self, tool_name: str, fingerprint: str) -> str | None:
        """Return a block reason for this fingerprint, or None to allow it."""


class NullScanGate:
    """Default gate. It does not implement scanner rules and never blocks."""

    async def blocking_reason(self, tool_name: str, fingerprint: str) -> str | None:
        del tool_name, fingerprint
        return None


_scan_gate: ScanGate = NullScanGate()


def get_scan_gate() -> ScanGate:
    """Return the process-wide scan gate."""

    return _scan_gate


def set_scan_gate(gate: ScanGate) -> None:
    """Replace the process-wide scan gate."""

    global _scan_gate
    _scan_gate = gate
