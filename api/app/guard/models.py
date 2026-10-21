"""Data models for the prompt-injection guard."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class GuardFinding(BaseModel):
    """A single matched rule finding."""

    model_config = ConfigDict(extra="ignore")

    rule_id: str = Field(..., description="Rule ID, e.g. G1..G6")
    name: str = Field(..., description="Name or category of the rule")
    severity: Literal["medium", "high"] = Field(..., description="Rule severity level")
    description: str = Field(..., description="Description of the security finding")
    snippet: str = Field(..., description="Redacted snippet showing where the pattern matched")


class GuardResult(BaseModel):
    """Result of running the prompt-injection guard on tool output."""

    model_config = ConfigDict(extra="ignore", arbitrary_types_allowed=True)

    allowed: bool = Field(..., description="True if output is permitted to pass through")
    blocked: bool = Field(..., description="True if output was blocked in enforce mode")
    cleaned: bool = Field(..., description="True if medium severity output was sanitized")
    mode: Literal["off", "warn", "enforce"] = Field(..., description="Active guard mode")
    action: Literal["allow", "logged", "cleaned", "blocked"] = Field(
        ..., description="Action taken by the guard"
    )
    text: str = Field(..., description="Resulting text after evaluation / sanitization")
    severity: Literal["none", "medium", "high"] = Field(
        ..., description="Highest severity matched among findings"
    )
    findings: list[GuardFinding] = Field(
        default_factory=list, description="List of rule findings"
    )

    # Internal reference to the background audit task if one was scheduled
    _audit_task: Any = None

    @property
    def output(self) -> str:
        return self.text

    @property
    def sanitized_text(self) -> str:
        return self.text

    def __await__(self):
        task = getattr(self, "_audit_task", None)
        if task is not None and hasattr(task, "__await__"):
            return task.__await__()

        async def _noop():
            return self

        return _noop().__await__()
