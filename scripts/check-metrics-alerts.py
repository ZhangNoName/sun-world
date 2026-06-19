#!/usr/bin/env python3
"""Verify backend metrics alert rule evaluation."""

from __future__ import annotations

import sys
from pathlib import Path


def main() -> int:
    repo_root = Path(__file__).resolve().parents[1]
    sys.path.insert(0, str(repo_root / "apps" / "api"))

    from src.core.metrics_alerts import (
        MetricsAlertEvaluator,
        build_metrics_alert_rules,
    )

    rules = build_metrics_alert_rules(
        {
            "BLOG_ALERT_ERROR_RATE_WARN": "0.10",
            "BLOG_ALERT_ERROR_RATE_CRITICAL": "0.30",
            "BLOG_ALERT_P95_LATENCY_WARN_MS": "500",
            "BLOG_ALERT_P95_LATENCY_CRITICAL_MS": "1200",
            "BLOG_ALERT_WEB_VITAL_POOR_RATE_WARN": "0.20",
            "BLOG_ALERT_WEB_VITAL_POOR_RATE_CRITICAL": "0.50",
        }
    )
    evaluator = MetricsAlertEvaluator(rules)

    alerts = evaluator.evaluate(
        request_snapshot={
            "total_requests": 10,
            "error_requests": 4,
            "p95_duration_ms": 1400,
        },
        rum_snapshot={
            "web_vitals": {
                "LCP": {
                    "count": 10,
                    "poor_count": 6,
                    "p95_value": 5200,
                }
            }
        },
    )

    alert_by_key = {alert["key"]: alert for alert in alerts}
    assert alert_by_key["request_error_rate"]["severity"] == "critical"
    assert alert_by_key["request_error_rate"]["actual"] == 0.4
    assert alert_by_key["request_p95_latency_ms"]["severity"] == "critical"
    assert alert_by_key["request_p95_latency_ms"]["actual"] == 1400
    assert alert_by_key["web_vital_LCP_poor_rate"]["severity"] == "critical"
    assert alert_by_key["web_vital_LCP_poor_rate"]["actual"] == 0.6

    quiet_alerts = evaluator.evaluate(
        request_snapshot={
            "total_requests": 20,
            "error_requests": 1,
            "p95_duration_ms": 220,
        },
        rum_snapshot={
            "web_vitals": {
                "LCP": {
                    "count": 10,
                    "poor_count": 1,
                }
            }
        },
    )
    assert quiet_alerts == []

    print("Metrics alert protocol check passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
