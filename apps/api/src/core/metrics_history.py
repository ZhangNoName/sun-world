"""Admin metrics snapshot history read-model helpers."""

from __future__ import annotations

from typing import Any, Literal

from src.core.metrics_store import (
    MetricsSnapshotStore,
    load_metrics_snapshot_history,
)

MetricsHistoryKind = Literal["request", "rum"]
MAX_HISTORY_LIMIT = 120


def get_metrics_history_snapshot(
    *,
    kind: MetricsHistoryKind,
    limit: int = 20,
) -> dict[str, Any]:
    return build_metrics_history_snapshot(kind=kind, limit=limit)


def build_metrics_history_snapshot(
    *,
    kind: MetricsHistoryKind,
    limit: int = 20,
    store: MetricsSnapshotStore | None = None,
) -> dict[str, Any]:
    bounded_limit = _bounded_limit(limit)
    history = (
        store.load_history(kind)
        if store is not None
        else load_metrics_snapshot_history(kind)
    )
    snapshots = [dict(item) for item in history[-bounded_limit:]]
    return {
        "kind": kind,
        "limit": bounded_limit,
        "snapshot_count": len(snapshots),
        "snapshots": snapshots,
    }


def _bounded_limit(value: int) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return 20
    return min(max(parsed, 1), MAX_HISTORY_LIMIT)
