#!/usr/bin/env python3
"""Verify the backend RUM metrics protocol without starting FastAPI."""

from __future__ import annotations

import sys
from pathlib import Path


def main() -> int:
    repo_root = Path(__file__).resolve().parents[1]
    sys.path.insert(0, str(repo_root / "apps" / "api"))

    from src.core.rum_metrics import RumMetricsCollector

    collector = RumMetricsCollector(max_recent_events=2)
    accepted = collector.record(
        {
            "name": "web_vital",
            "timestamp": 1720000000000,
            "sessionId": "session-123",
            "path": "/blogs/1?private=value",
            "properties": {
                "metric": "LCP",
                "value": 2450.4,
                "rating": "needs-improvement",
            },
        }
    )
    for value in (1200, 1800, 3200, 5100):
        collector.record(
            {
                "name": "web_vital",
                "timestamp": 1720000000500,
                "sessionId": "session-123",
                "path": "/blogs/1",
                "properties": {
                    "metric": "LCP",
                    "value": value,
                    "rating": "poor" if value >= 3200 else "good",
                },
            }
        )
    collector.record(
        {
            "name": "api_error",
            "timestamp": 1720000001000,
            "sessionId": "session-123",
            "path": "/api/user/me",
            "properties": {"status": 500, "requestId": "req-1"},
        }
    )
    collector.record(
        {
            "name": "unknown_event",
            "timestamp": 1720000002000,
            "sessionId": "session-123",
            "properties": {"ignored": True},
        }
    )

    snapshot = collector.snapshot()

    assert accepted is True
    assert snapshot["total_events"] == 7
    assert snapshot["accepted_events"] == 6
    assert snapshot["rejected_events"] == 1
    assert snapshot["events_by_name"]["web_vital"] == 5
    assert snapshot["events_by_name"]["api_error"] == 1
    assert snapshot["web_vitals"]["LCP"]["count"] == 5
    assert snapshot["web_vitals"]["LCP"]["avg_value"] == 2750.08
    assert snapshot["web_vitals"]["LCP"]["p50_value"] == 2450.4
    assert snapshot["web_vitals"]["LCP"]["p95_value"] == 5100
    assert snapshot["web_vitals"]["LCP"]["p99_value"] == 5100
    assert snapshot["web_vitals"]["LCP"]["max_value"] == 5100
    assert snapshot["web_vitals"]["LCP"]["good_count"] == 2
    assert snapshot["web_vitals"]["LCP"]["needs_improvement_count"] == 1
    assert snapshot["web_vitals"]["LCP"]["poor_count"] == 2
    assert len(snapshot["recent_events"]) == 2
    assert snapshot["recent_events"][0]["path"] == "/api/user/me"
    assert "private=value" not in snapshot["recent_events"][1]["path"]

    print("RUM metrics protocol check passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
