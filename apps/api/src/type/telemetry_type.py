from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


TelemetryEventName = Literal[
    "web_vital",
    "route_timing",
    "global_error",
    "unhandled_rejection",
    "api_timing",
    "api_error",
    "user_action",
]

TelemetrySeverity = Literal["debug", "info", "warning", "error"]


class TelemetryEventPayload(BaseModel):
    name: TelemetryEventName = Field(description="Frontend telemetry event name.")
    severity: TelemetrySeverity = Field(default="info")
    timestamp: str | None = Field(default=None, description="Client event timestamp.")
    page: str | None = Field(default=None, description="Browser page path.")
    sessionId: str | None = Field(default=None, description="Anonymous session ID.")
    properties: dict[str, Any] = Field(default_factory=dict)


class TelemetryIngestResult(BaseModel):
    accepted: bool = Field(description="Whether the event was accepted.")


class RumWebVitalMetric(BaseModel):
    count: int = Field(ge=0)
    total_value: float = Field(ge=0)
    avg_value: float = Field(ge=0)
    max_value: float = Field(ge=0)
    p50_value: float = Field(ge=0)
    p95_value: float = Field(ge=0)
    p99_value: float = Field(ge=0)
    good_count: int = Field(ge=0)
    needs_improvement_count: int = Field(ge=0)
    poor_count: int = Field(ge=0)


class RumEventSample(BaseModel):
    name: str
    severity: str
    timestamp: str
    page: str
    path: str
    sessionId: str
    properties: dict[str, Any] = Field(default_factory=dict)


class RumMetricsSnapshot(BaseModel):
    generated_at: datetime
    started_at: datetime
    total_events: int = Field(ge=0)
    accepted_events: int = Field(ge=0)
    rejected_events: int = Field(ge=0)
    events_by_name: dict[str, int] = Field(default_factory=dict)
    events_by_severity: dict[str, int] = Field(default_factory=dict)
    web_vitals: dict[str, RumWebVitalMetric] = Field(default_factory=dict)
    recent_events: list[RumEventSample] = Field(default_factory=list)
