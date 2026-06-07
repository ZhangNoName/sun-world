"""In-memory backend request metrics.

This module provides a lightweight read model for the admin dashboard.
It is intentionally process-local: metrics reset when the API process
restarts and should later be replaced or backed by persistent telemetry.
"""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timezone
from threading import Lock

_MAX_ROUTE_KEYS = 200
_OTHER_ROUTE = "__other__"


@dataclass
class _RouteAccumulator:
    count: int = 0
    error_count: int = 0
    total_duration_ms: float = 0.0
    max_duration_ms: float = 0.0

    def record(self, status_code: int, duration_ms: float) -> None:
        self.count += 1
        if status_code >= 500:
            self.error_count += 1
        self.total_duration_ms += duration_ms
        self.max_duration_ms = max(self.max_duration_ms, duration_ms)


class RequestMetricsCollector:
    """Thread-safe, bounded request metrics accumulator."""

    def __init__(self) -> None:
        self._lock = Lock()
        self._total_requests = 0
        self._error_requests = 0
        self._total_duration_ms = 0.0
        self._max_duration_ms = 0.0
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
            self._statuses[int(status_code)] += 1

    def snapshot(self) -> dict:
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

        return {
            "generated_at": datetime.now(timezone.utc),
            "total_requests": total_requests,
            "error_requests": self._error_requests,
            "avg_duration_ms": _round_ms(avg_duration_ms),
            "max_duration_ms": _round_ms(self._max_duration_ms),
            "routes": routes,
            "statuses": statuses,
        }


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


def get_request_metrics_snapshot() -> dict:
    return request_metrics.snapshot()


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
