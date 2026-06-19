"""Admin-facing alert read model assembly."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Mapping

from src.core.metrics import get_request_metrics_snapshot
from src.core.metrics_alerts import evaluate_metrics_alerts
from src.core.rum_metrics import get_rum_metrics_snapshot


def get_admin_alerts_snapshot() -> dict[str, Any]:
    return build_admin_alerts_snapshot(
        request_snapshot=get_request_metrics_snapshot(persist=False),
        rum_snapshot=get_rum_metrics_snapshot(persist=False),
    )


def build_admin_alerts_snapshot(
    *,
    request_snapshot: Mapping[str, Any] | None,
    rum_snapshot: Mapping[str, Any] | None,
) -> dict[str, Any]:
    alerts = evaluate_metrics_alerts(
        request_snapshot=request_snapshot,
        rum_snapshot=rum_snapshot,
    )
    warning_count = sum(1 for alert in alerts if alert.get("severity") == "warning")
    critical_count = sum(1 for alert in alerts if alert.get("severity") == "critical")
    return {
        "generated_at": datetime.now(timezone.utc),
        "alerts": alerts,
        "alert_count": len(alerts),
        "warning_count": warning_count,
        "critical_count": critical_count,
    }
