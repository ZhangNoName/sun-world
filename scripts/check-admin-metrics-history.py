#!/usr/bin/env python3
"""Verify the admin metrics history read model protocol."""

from __future__ import annotations

import sys
from pathlib import Path


def main() -> int:
    repo_root = Path(__file__).resolve().parents[1]
    sys.path.insert(0, str(repo_root / "apps" / "api"))

    from src.core import metrics_history
    from src.core.metrics_store import InMemoryMetricsSnapshotStore
    from src.type.admin_type import MetricsHistorySnapshot

    store = InMemoryMetricsSnapshotStore(max_history=5)
    for index in range(4):
        store.save_snapshot(
            "request",
            {
                "generated_at": f"2026-06-19T00:00:0{index}+08:00",
                "total_requests": index + 1,
                "error_requests": 0,
            },
        )

    snapshot = metrics_history.build_metrics_history_snapshot(
        kind="request",
        limit=2,
        store=store,
    )
    model = MetricsHistorySnapshot.model_validate(snapshot)

    assert model.kind == "request"
    assert model.snapshot_count == 2
    assert [item["total_requests"] for item in model.snapshots] == [3, 4]

    model.snapshots[0]["total_requests"] = 999
    fresh_snapshot = metrics_history.build_metrics_history_snapshot(
        kind="request",
        limit=2,
        store=store,
    )
    fresh_model = MetricsHistorySnapshot.model_validate(fresh_snapshot)
    assert [item["total_requests"] for item in fresh_model.snapshots] == [3, 4]

    empty_snapshot = metrics_history.build_metrics_history_snapshot(
        kind="rum",
        limit=1000,
        store=store,
    )
    empty_model = MetricsHistorySnapshot.model_validate(empty_snapshot)
    assert empty_model.kind == "rum"
    assert empty_model.snapshot_count == 0
    assert empty_model.snapshots == []

    print("Admin metrics history protocol check passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
