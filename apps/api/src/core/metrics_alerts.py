"""Local metrics alert rule evaluation.

This module evaluates aggregate snapshots only. It intentionally does not send
notifications; delivery can be added later behind a separate adapter.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any, Mapping


@dataclass(frozen=True)
class MetricsAlertRules:
    error_rate_warn: float = 0.05
    error_rate_critical: float = 0.20
    p95_latency_warn_ms: float = 800.0
    p95_latency_critical_ms: float = 2000.0
    web_vital_poor_rate_warn: float = 0.20
    web_vital_poor_rate_critical: float = 0.50


class MetricsAlertEvaluator:
    """Evaluates request/RUM snapshots against threshold rules."""

    def __init__(self, rules: MetricsAlertRules | None = None) -> None:
        self._rules = rules or MetricsAlertRules()

    def evaluate(
        self,
        *,
        request_snapshot: Mapping[str, Any] | None,
        rum_snapshot: Mapping[str, Any] | None,
    ) -> list[dict[str, Any]]:
        alerts: list[dict[str, Any]] = []
        if request_snapshot:
            alerts.extend(self._evaluate_request_snapshot(request_snapshot))
        if rum_snapshot:
            alerts.extend(self._evaluate_rum_snapshot(rum_snapshot))
        return alerts

    def _evaluate_request_snapshot(
        self,
        snapshot: Mapping[str, Any],
    ) -> list[dict[str, Any]]:
        alerts: list[dict[str, Any]] = []
        total_requests = _to_float(snapshot.get("total_requests"))
        error_requests = _to_float(snapshot.get("error_requests"))
        if total_requests > 0:
            error_rate = round(error_requests / total_requests, 4)
            alert = _threshold_alert(
                key="request_error_rate",
                label="Request error rate",
                actual=error_rate,
                warn=self._rules.error_rate_warn,
                critical=self._rules.error_rate_critical,
                unit="ratio",
            )
            if alert:
                alerts.append(alert)

        p95_duration_ms = _to_float(snapshot.get("p95_duration_ms"))
        alert = _threshold_alert(
            key="request_p95_latency_ms",
            label="Request p95 latency",
            actual=p95_duration_ms,
            warn=self._rules.p95_latency_warn_ms,
            critical=self._rules.p95_latency_critical_ms,
            unit="ms",
        )
        if alert:
            alerts.append(alert)
        return alerts

    def _evaluate_rum_snapshot(
        self,
        snapshot: Mapping[str, Any],
    ) -> list[dict[str, Any]]:
        alerts: list[dict[str, Any]] = []
        web_vitals = snapshot.get("web_vitals")
        if not isinstance(web_vitals, Mapping):
            return alerts

        for metric, raw_values in web_vitals.items():
            if not isinstance(raw_values, Mapping):
                continue
            count = _to_float(raw_values.get("count"))
            poor_count = _to_float(raw_values.get("poor_count"))
            if count <= 0:
                continue

            poor_rate = round(poor_count / count, 4)
            metric_key = _safe_key(metric)
            alert = _threshold_alert(
                key=f"web_vital_{metric_key}_poor_rate",
                label=f"Web Vital {metric_key} poor rate",
                actual=poor_rate,
                warn=self._rules.web_vital_poor_rate_warn,
                critical=self._rules.web_vital_poor_rate_critical,
                unit="ratio",
            )
            if alert:
                alerts.append(alert)
        return alerts


def build_metrics_alert_rules(
    env: Mapping[str, str] | None = None,
) -> MetricsAlertRules:
    source = os.environ if env is None else env
    return MetricsAlertRules(
        error_rate_warn=_read_float(
            source.get("BLOG_ALERT_ERROR_RATE_WARN"),
            MetricsAlertRules.error_rate_warn,
        ),
        error_rate_critical=_read_float(
            source.get("BLOG_ALERT_ERROR_RATE_CRITICAL"),
            MetricsAlertRules.error_rate_critical,
        ),
        p95_latency_warn_ms=_read_float(
            source.get("BLOG_ALERT_P95_LATENCY_WARN_MS"),
            MetricsAlertRules.p95_latency_warn_ms,
        ),
        p95_latency_critical_ms=_read_float(
            source.get("BLOG_ALERT_P95_LATENCY_CRITICAL_MS"),
            MetricsAlertRules.p95_latency_critical_ms,
        ),
        web_vital_poor_rate_warn=_read_float(
            source.get("BLOG_ALERT_WEB_VITAL_POOR_RATE_WARN"),
            MetricsAlertRules.web_vital_poor_rate_warn,
        ),
        web_vital_poor_rate_critical=_read_float(
            source.get("BLOG_ALERT_WEB_VITAL_POOR_RATE_CRITICAL"),
            MetricsAlertRules.web_vital_poor_rate_critical,
        ),
    )


def evaluate_metrics_alerts(
    *,
    request_snapshot: Mapping[str, Any] | None,
    rum_snapshot: Mapping[str, Any] | None,
) -> list[dict[str, Any]]:
    evaluator = MetricsAlertEvaluator(build_metrics_alert_rules())
    return evaluator.evaluate(
        request_snapshot=request_snapshot,
        rum_snapshot=rum_snapshot,
    )


def _threshold_alert(
    *,
    key: str,
    label: str,
    actual: float,
    warn: float,
    critical: float,
    unit: str,
) -> dict[str, Any] | None:
    if actual >= critical:
        severity = "critical"
        threshold = critical
    elif actual >= warn:
        severity = "warning"
        threshold = warn
    else:
        return None

    return {
        "key": key,
        "label": label,
        "severity": severity,
        "actual": actual,
        "threshold": threshold,
        "unit": unit,
    }


def _read_float(value: str | None, fallback: float) -> float:
    try:
        parsed = float(str(value or "").strip())
    except ValueError:
        return fallback
    return parsed if parsed >= 0 else fallback


def _to_float(value: Any) -> float:
    if isinstance(value, bool):
        return 0.0
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _safe_key(value: Any) -> str:
    key = str(value or "unknown").strip()
    return "".join(char if char.isalnum() else "_" for char in key)[:48] or "unknown"
