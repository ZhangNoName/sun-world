from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class HealthSnapshot(BaseModel):
    status: Literal["ok"] = Field(description="Process liveness status.")


class DependencyReadiness(BaseModel):
    name: str = Field(description="Dependency name.")
    status: Literal["ready", "not_ready"] = Field(description="Dependency readiness.")
    duration_ms: float = Field(ge=0, description="Probe duration in milliseconds.")


class ReadinessSnapshot(BaseModel):
    status: Literal["ready", "not_ready"] = Field(description="Overall readiness.")
    generated_at: datetime = Field(description="Snapshot generation time.")
    checks: list[DependencyReadiness] = Field(default_factory=list)
