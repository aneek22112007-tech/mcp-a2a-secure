from dataclasses import dataclass
from typing import Literal

Severity = Literal["low", "medium", "high", "critical"]


@dataclass(frozen=True, slots=True)
class ScannerFinding:
    rule_id: str
    severity: Severity
    message: str
    evidence: str | None


def is_ai_finding(rule_id: str) -> bool:
    """Return True if the finding originates from an AI scanner pass."""
    return rule_id.startswith("AI")
