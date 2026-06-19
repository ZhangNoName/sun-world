"""In-memory backend request metrics.

This module provides a lightweight read model for the admin dashboard.
It is intentionally process-local: metrics reset when the API process
restarts and should later be replaced or backed by persistent telemetry.
"""

from __future__ import annotations

from collections import Counter, deque
from dataclasses import dataclass, field
from datetime import datetime, timezone
from math import ceil
from threading import Lock

from src.core.metrics_store import save_metrics_snapshot

_MAX_ROUTE_KEYS = 200
_MAX_DURATION_SAMPLES = 200
_OTHER_ROUTE = "__other__"


@dataclass
class _RouteAccumulator:
    count: int = 0
    error_count: int = 0
    total_duration_ms: float = 0.0
    max_duration_ms: float = 0.0
    duration_samples: deque[float] = field(
        default_factory=lambda: deque(maxlen=_MAX_DURATION_SAMPLES)
    )

    def record(self, status_code: int, duration_ms: float) -> None:
        self.count += 1
        if status_code >= 500:
            self.error_count += 1
        self.total_duration_ms += duration_ms
        self.max_duration_ms = max(self.max_duration_ms, duration_ms)
        self.duration_samples.append(duration_ms)


class RequestMetricsCollector:
    """Thread-safe, bounded request metrics accumulator."""

    def __init__(self) -> None:
        self._lock = Lock()
        self._total_requests = 0
        self._error_requests = 0
        self._total_duration_ms = 0.0
        self._max_duration_ms = 0.0
        self._duration_samples: deque[float] = deque(maxlen=_MAX_DURATION_SAMPLES)
        self._statuses: Counter[int] = Counter()
        self._routes: dict[tuple[str, str], _RouteAccumulator] = {}

    def record(
        self,
        *,
        method: str,
        route: str,
        status_code: int,
        duration_ms: float,
    ) -> None:
        method_key = method.upper().strip() or "UNKNOWN"
        route_key = _normalise_route(route)

        with self._lock:
            if (
                (method_key, route_key) not in self._routes
                and len(self._routes) >= _MAX_ROUTE_KEYS
            ):
                route_key = _OTHER_ROUTE

            route_metric = self._routes.setdefault(
                (method_key, route_key),
                _RouteAccumulator(),
            )
            route_metric.record(status_code=status_code, duration_ms=duration_ms)

            self._total_requests += 1
            if status_code >= 500:
                self._error_requests += 1
            self._total_duration_ms += duration_ms
            self._max_duration_ms = max(self._max_duration_ms, duration_ms)
            self._duration_samples.append(duration_ms)
            self._statuses[int(status_code)] += 1

    def snapshot(self, *, persist: bool = True) -> dict:
        with self._lock:
            total_requests = self._total_requests
            avg_duration_ms = _average(self._total_duration_ms, total_requests)
            routes = [
                {
                    "method": method,
                    "route": route,
                    "count": item.count,
                    "error_count": item.error_count,
                    "avg_duration_ms": _round_ms(
                        _average(item.total_duration_ms, item.count)
                    ),
                    "p50_duration_ms": _percentile_ms(
                        list(item.duration_samples), 50
                    ),
                    "p95_duration_ms": _percentile_ms(
                        list(item.duration_samples), 95
                    ),
                    "p99_duration_ms": _percentile_ms(
                        list(item.duration_samples), 99
                    ),
                    "max_duration_ms": _round_ms(item.max_duration_ms),
                }
                for (method, route), item in self._routes.items()
            ]
            statuses = [
                {"status": status, "count": count}
                for status, count in self._statuses.items()
            ]

        routes.sort(key=lambda item: item["count"], reverse=True)
        statuses.sort(key=lambda item: item["status"])

        snapshot = {
            "generated_at": datetime.now(timezone.utc),
            "total_requests": total_requests,
            "error_requests": self._error_requests,
            "avg_duration_ms": _round_ms(avg_duration_ms),
            "p50_duration_ms": _percentile_ms(list(self._duration_samples), 50),
            "p95_duration_ms": _percentile_ms(list(self._duration_samples), 95),
            "p99_duration_ms": _percentile_ms(list(self._duration_samples), 99),
            "max_duration_ms": _round_ms(self._max_duration_ms),
            "routes": routes,
            "statuses": statuses,
        }
        if persist:
            save_metrics_snapshot("request", snapshot)
        return snapshot


request_metrics = RequestMetricsCollector()


def record_request_metric(
    *,
    method: str,
    route: str,
    status_code: int,
    duration_ms: float,
) -> None:
    request_metrics.record(
        method=method,
        route=route,
        status_code=status_code,
        duration_ms=duration_ms,
    )


def get_request_metrics_snapshot(*, persist: bool = True) -> dict:
    return request_metrics.snapshot(persist=persist)


def _normalise_route(route: str) -> str:
    route_key = str(route or "").strip()
    if not route_key:
        return "unknown"
    if len(route_key) > 200:
        return f"{route_key[:200]}..."
    return route_key


def _average(total: float, count: int) -> float:
    if count <= 0:
        return 0.0
    return total / count


def _round_ms(value: float) -> float:
    return round(float(value), 2)


def _percentile_ms(values: list[float], percentile: int) -> float:
    if not values:
        return 0.0
    sorted_values = sorted(values)
    rank = ceil((percentile / 100) * len(sorted_values))
    index = min(max(rank - 1, 0), len(sorted_values) - 1)
    return _round_ms(sorted_values[index])
