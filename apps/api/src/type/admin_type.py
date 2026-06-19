from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class RouteMetric(BaseModel):
    method: str = Field(description="HTTP method, upper-case.")
    route: str = Field(description="FastAPI route template or bounded fallback path.")
    count: int = Field(ge=0, description="Total requests for this route.")
    error_count: int = Field(ge=0, description="5xx requests for this route.")
    avg_duration_ms: float = Field(ge=0, description="Average latency in milliseconds.")
    p50_duration_ms: float = Field(ge=0, description="p50 latency in milliseconds.")
    p95_duration_ms: float = Field(ge=0, description="p95 latency in milliseconds.")
    p99_duration_ms: float = Field(ge=0, description="p99 latency in milliseconds.")
    max_duration_ms: float = Field(ge=0, description="Maximum latency in milliseconds.")


class StatusMetric(BaseModel):
    status: int = Field(description="HTTP status code.")
    count: int = Field(ge=0, description="Total requests with this status.")


class RequestMetricsSnapshot(BaseModel):
    generated_at: datetime = Field(description="Snapshot generation time.")
    total_requests: int = Field(ge=0, description="Total recorded requests.")
    error_requests: int = Field(ge=0, description="Total recorded 5xx requests.")
    avg_duration_ms: float = Field(ge=0, description="Average latency in milliseconds.")
    p50_duration_ms: float = Field(ge=0, description="p50 latency in milliseconds.")
    p95_duration_ms: float = Field(ge=0, description="p95 latency in milliseconds.")
    p99_duration_ms: float = Field(ge=0, description="p99 latency in milliseconds.")
    max_duration_ms: float = Field(ge=0, description="Maximum latency in milliseconds.")
    routes: list[RouteMetric] = Field(default_factory=list)
    statuses: list[StatusMetric] = Field(default_factory=list)


class MetricAlert(BaseModel):
    key: str = Field(description="Stable alert key for client-side grouping.")
    label: str = Field(description="Human-readable alert label.")
    severity: Literal["warning", "critical"] = Field(description="Alert severity.")
    actual: float = Field(ge=0, description="Observed metric value.")
    threshold: float = Field(ge=0, description="Threshold that triggered the alert.")
    unit: str = Field(description="Metric unit, for example ratio or ms.")


class AdminAlertsSnapshot(BaseModel):
    generated_at: datetime = Field(description="Snapshot generation time.")
    alerts: list[MetricAlert] = Field(default_factory=list)
    alert_count: int = Field(ge=0, description="Total active alerts.")
    warning_count: int = Field(ge=0, description="Active warning alerts.")
    critical_count: int = Field(ge=0, description="Active critical alerts.")


class MetricsHistorySnapshot(BaseModel):
    kind: Literal["request", "rum"] = Field(description="Snapshot history kind.")
    limit: int = Field(ge=1, le=120, description="Requested bounded history size.")
    snapshot_count: int = Field(ge=0, description="Returned snapshot count.")
    snapshots: list[dict[str, Any]] = Field(default_factory=list)
