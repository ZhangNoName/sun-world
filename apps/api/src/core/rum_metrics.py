"""In-memory real user monitoring metrics."""

from __future__ import annotations

from collections import Counter, deque
from datetime import datetime, timezone
from math import ceil
from threading import Lock
from typing import Any
from urllib.parse import urlsplit

from src.core.metrics_store import save_metrics_snapshot


ALLOWED_EVENT_NAMES = {
    "web_vital",
    "route_timing",
    "global_error",
    "unhandled_rejection",
    "api_timing",
    "api_error",
    "user_action",
}

WEB_VITAL_RATINGS = {
    "good": "good_count",
    "needs-improvement": "needs_improvement_count",
    "poor": "poor_count",
}


class RumMetricsCollector:
    """Thread-safe, process-local RUM event accumulator."""

    def __init__(
        self,
        max_recent_events: int = 50,
        max_metric_samples: int = 200,
    ) -> None:
        self._lock = Lock()
        self._started_at = datetime.now(timezone.utc)
        self._max_metric_samples = max(1, max_metric_samples)
        self._total_events = 0
        self._accepted_events = 0
        self._rejected_events = 0
        self._events_by_name: Counter[str] = Counter()
        self._events_by_severity: Counter[str] = Counter()
        self._web_vitals: dict[str, dict[str, Any]] = {}
        self._recent_events: deque[dict[str, Any]] = deque(
            maxlen=max(1, max_recent_events)
        )

    def record(self, event: dict[str, Any]) -> bool:
        name = _clean_string(event.get("name"), max_length=64)
        with self._lock:
            self._total_events += 1
            if name not in ALLOWED_EVENT_NAMES:
                self._rejected_events += 1
                return False

            severity = _clean_string(event.get("severity"), max_length=24) or "info"
            page = _clean_path(event.get("page") or event.get("path"))
            session_id = _clean_string(event.get("sessionId"), max_length=96)
            properties = _clean_properties(event.get("properties"))

            self._accepted_events += 1
            self._events_by_name[name] += 1
            self._events_by_severity[severity] += 1
            self._recent_events.append(
                {
                    "name": name,
                    "severity": severity,
                    "timestamp": _clean_string(event.get("timestamp"), max_length=64),
                    "page": page,
                    "path": page,
                    "sessionId": session_id,
                    "properties": properties,
                }
            )

            if name == "web_vital":
                self._record_web_vital(properties)

            return True

    def snapshot(self, *, persist: bool = True) -> dict[str, Any]:
        with self._lock:
            snapshot = {
                "generated_at": datetime.now(timezone.utc),
                "started_at": self._started_at,
                "total_events": self._total_events,
                "accepted_events": self._accepted_events,
                "rejected_events": self._rejected_events,
                "events_by_name": dict(self._events_by_name),
                "events_by_severity": dict(self._events_by_severity),
                "web_vitals": {
                    metric: _snapshot_web_vital_metric(values)
                    for metric, values in self._web_vitals.items()
                },
                "recent_events": list(reversed(self._recent_events)),
            }
        if persist:
            save_metrics_snapshot("rum", snapshot)
        return snapshot

    def _record_web_vital(self, properties: dict[str, Any]) -> None:
        metric = _clean_string(properties.get("metric"), max_length=24)
        value = _clean_number(properties.get("value"))
        if not metric or value is None:
            return

        values = self._web_vitals.setdefault(
            metric,
            {
                "count": 0,
                "total_value": 0.0,
                "max_value": 0.0,
                "values": deque(maxlen=self._max_metric_samples),
                "good_count": 0,
                "needs_improvement_count": 0,
                "poor_count": 0,
            },
        )
        values["count"] += 1
        values["total_value"] += value
        values["max_value"] = max(values["max_value"], value)
        values["values"].append(value)

        rating = _clean_string(properties.get("rating"), max_length=32)
        rating_key = WEB_VITAL_RATINGS.get(rating)
        if rating_key:
            values[rating_key] += 1


rum_metrics = RumMetricsCollector()


def record_rum_event(event: dict[str, Any]) -> bool:
    return rum_metrics.record(event)


def get_rum_metrics_snapshot(*, persist: bool = True) -> dict[str, Any]:
    return rum_metrics.snapshot(persist=persist)


def _clean_string(value: Any, max_length: int) -> str:
    if value is None:
        return ""
    text = str(value).strip()
    return text[:max_length]


def _clean_number(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if number < 0:
        return None
    return number


def _clean_path(value: Any) -> str:
    text = _clean_string(value, max_length=240)
    if not text:
        return ""
    parts = urlsplit(text)
    if parts.scheme or parts.netloc:
        path = parts.path or "/"
    else:
        path = text.split("?", 1)[0]
    return path[:240]


def _clean_properties(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        return {}

    cleaned: dict[str, Any] = {}
    for key, raw_value in value.items():
        clean_key = _clean_string(key, max_length=48)
        if not clean_key:
            continue
        if isinstance(raw_value, (int, float, bool)) or raw_value is None:
            cleaned[clean_key] = raw_value
        else:
            cleaned[clean_key] = _clean_string(raw_value, max_length=200)
        if len(cleaned) >= 24:
            break
    return cleaned


def _snapshot_web_vital_metric(values: dict[str, Any]) -> dict[str, Any]:
    count = values["count"]
    samples = list(values.get("values", []))
    return {
        "count": count,
        "total_value": values["total_value"],
        "avg_value": round(values["total_value"] / count, 4) if count else 0,
        "max_value": values["max_value"],
        "p50_value": _percentile(samples, 50),
        "p95_value": _percentile(samples, 95),
        "p99_value": _percentile(samples, 99),
        "good_count": values["good_count"],
        "needs_improvement_count": values["needs_improvement_count"],
        "poor_count": values["poor_count"],
    }


def _percentile(values: list[float], percentile: int) -> float:
    if not values:
        return 0
    sorted_values = sorted(values)
    rank = ceil((percentile / 100) * len(sorted_values))
    index = min(max(rank - 1, 0), len(sorted_values) - 1)
    return round(sorted_values[index], 4)
