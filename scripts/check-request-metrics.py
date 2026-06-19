#!/usr/bin/env python3
"""Verify backend request metrics percentile protocol."""

from __future__ import annotations

import sys
from pathlib import Path


def main() -> int:
    repo_root = Path(__file__).resolve().parents[1]
    sys.path.insert(0, str(repo_root / "apps" / "api"))

    from src.core.metrics import RequestMetricsCollector

    collector = RequestMetricsCollector()
    for duration_ms, status_code in (
        (50, 200),
        (120, 200),
        (200, 200),
        (800, 500),
        (1500, 200),
    ):
        collector.record(
            method="get",
            route="/blogs/{blog_id}",
            status_code=status_code,
            duration_ms=duration_ms,
        )

    collector.record(
        method="post",
        route="/ai/chat",
        status_code=200,
        duration_ms=640,
    )

    snapshot = collector.snapshot()
    blog_route = next(
        route for route in snapshot["routes"] if route["route"] == "/blogs/{blog_id}"
    )

    assert snapshot["total_requests"] == 6
    assert snapshot["error_requests"] == 1
    assert snapshot["avg_duration_ms"] == 551.67
    assert snapshot["p50_duration_ms"] == 200
    assert snapshot["p95_duration_ms"] == 1500
    assert snapshot["p99_duration_ms"] == 1500
    assert snapshot["max_duration_ms"] == 1500
    assert blog_route["count"] == 5
    assert blog_route["error_count"] == 1
    assert blog_route["avg_duration_ms"] == 534
    assert blog_route["p50_duration_ms"] == 200
    assert blog_route["p95_duration_ms"] == 1500
    assert blog_route["p99_duration_ms"] == 1500
    assert blog_route["max_duration_ms"] == 1500

    print("Request metrics protocol check passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
