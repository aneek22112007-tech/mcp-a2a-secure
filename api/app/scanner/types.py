from dataclasses import dataclass
from typing import Literal

Severity = Literal["low", "medium", "high", "critical"]


@dataclass(frozen=True, slots=True)
class ScannerFinding:
    rule_id: str
    severity: Severity
    message: str
    evidence: str | None
