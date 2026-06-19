#!/usr/bin/env python3
"""Verify the admin-facing metrics alert snapshot protocol."""

from __future__ import annotations

import sys
from pathlib import Path


def main() -> int:
    repo_root = Path(__file__).resolve().parents[1]
    sys.path.insert(0, str(repo_root / "apps" / "api"))

    from src.core import admin_alerts
    from src.core.admin_alerts import build_admin_alerts_snapshot
    from src.type.admin_type import AdminAlertsSnapshot

    snapshot = build_admin_alerts_snapshot(
        request_snapshot={
            "generated_at": "2026-06-19T00:00:00+08:00",
            "total_requests": 10,
            "error_requests": 4,
            "avg_duration_ms": 650,
            "p50_duration_ms": 300,
            "p95_duration_ms": 2400,
            "p99_duration_ms": 1800,
            "max_duration_ms": 2000,
            "routes": [],
            "statuses": [],
        },
        rum_snapshot={
            "generated_at": "2026-06-19T00:00:00+08:00",
            "total_events": 10,
            "accepted_events": 10,
            "dropped_events": 0,
            "events": [],
            "web_vitals": {
                "LCP": {
                    "count": 10,
                    "poor_count": 6,
                    "p95_value": 5200,
                }
            },
        },
    )

    model = AdminAlertsSnapshot.model_validate(snapshot)
    assert model.alert_count == 3
    assert model.critical_count == 3
    assert model.warning_count == 0
    assert {alert.key for alert in model.alerts} == {
        "request_error_rate",
        "request_p95_latency_ms",
        "web_vital_LCP_poor_rate",
    }
    assert all(alert.severity == "critical" for alert in model.alerts)

    quiet_snapshot = build_admin_alerts_snapshot(
        request_snapshot={
            "total_requests": 20,
            "error_requests": 0,
            "p95_duration_ms": 220,
        },
        rum_snapshot={
            "web_vitals": {
                "CLS": {
                    "count": 10,
                    "poor_count": 0,
                }
            },
        },
    )
    quiet_model = AdminAlertsSnapshot.model_validate(quiet_snapshot)
    assert quiet_model.alerts == []
    assert quiet_model.alert_count == 0
    assert quiet_model.critical_count == 0
    assert quiet_model.warning_count == 0

    snapshot_calls: list[tuple[str, bool]] = []

    def fake_request_snapshot(*, persist: bool = True) -> dict:
        snapshot_calls.append(("request", persist))
        return {
            "total_requests": 1,
            "error_requests": 0,
            "p95_duration_ms": 20,
        }

    def fake_rum_snapshot(*, persist: bool = True) -> dict:
        snapshot_calls.append(("rum", persist))
        return {"web_vitals": {}}

    admin_alerts.get_request_metrics_snapshot = fake_request_snapshot
    admin_alerts.get_rum_metrics_snapshot = fake_rum_snapshot
    AdminAlertsSnapshot.model_validate(admin_alerts.get_admin_alerts_snapshot())
    assert snapshot_calls == [("request", False), ("rum", False)]

    print("Admin alerts protocol check passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
