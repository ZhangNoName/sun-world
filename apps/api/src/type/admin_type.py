from datetime import datetime

from pydantic import BaseModel, Field


class RouteMetric(BaseModel):
    method: str = Field(description="HTTP method, upper-case.")
    route: str = Field(description="FastAPI route template or bounded fallback path.")
    count: int = Field(ge=0, description="Total requests for this route.")
    error_count: int = Field(ge=0, description="5xx requests for this route.")
    avg_duration_ms: float = Field(ge=0, description="Average latency in milliseconds.")
    max_duration_ms: float = Field(ge=0, description="Maximum latency in milliseconds.")


class StatusMetric(BaseModel):
    status: int = Field(description="HTTP status code.")
    count: int = Field(ge=0, description="Total requests with this status.")


class RequestMetricsSnapshot(BaseModel):
    generated_at: datetime = Field(description="Snapshot generation time.")
    total_requests: int = Field(ge=0, description="Total recorded requests.")
    error_requests: int = Field(ge=0, description="Total recorded 5xx requests.")
    avg_duration_ms: float = Field(ge=0, description="Average latency in milliseconds.")
    max_duration_ms: float = Field(ge=0, description="Maximum latency in milliseconds.")
    routes: list[RouteMetric] = Field(default_factory=list)
    statuses: list[StatusMetric] = Field(default_factory=list)
