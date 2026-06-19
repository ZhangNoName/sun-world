#!/usr/bin/env python3
"""Verify the backend metrics snapshot store protocol."""

from __future__ import annotations

import sys
from datetime import datetime, timezone
from pathlib import Path
from tempfile import TemporaryDirectory


def main() -> int:
    repo_root = Path(__file__).resolve().parents[1]
    sys.path.insert(0, str(repo_root / "apps" / "api"))

    from src.core.metrics_store import (
        InMemoryMetricsSnapshotStore,
        JsonFileMetricsSnapshotStore,
        build_metrics_snapshot_store,
    )

    request_snapshot = {
        "generated_at": datetime(2026, 6, 19, 8, 0, tzinfo=timezone.utc),
        "total_requests": 2,
        "routes": [{"method": "GET", "route": "/healthz", "count": 2}],
    }
    rum_snapshot = {
        "generated_at": datetime(2026, 6, 19, 8, 1, tzinfo=timezone.utc),
        "accepted_events": 1,
        "recent_events": [{"name": "web_vital", "path": "/"}],
    }

    memory_store = InMemoryMetricsSnapshotStore(max_history=2)
    memory_store.save_snapshot("request", request_snapshot)
    memory_store.save_snapshot("rum", rum_snapshot)

    assert memory_store.load_latest("request")["total_requests"] == 2
    assert memory_store.load_latest("rum")["accepted_events"] == 1
    assert memory_store.load_latest("unknown") is None

    with TemporaryDirectory() as temp_dir:
        store_path = Path(temp_dir) / "metrics-snapshots.json"
        file_store = JsonFileMetricsSnapshotStore(store_path, max_history=2)
        file_store.save_snapshot("request", request_snapshot)
        file_store.save_snapshot("request", {**request_snapshot, "total_requests": 3})
        file_store.save_snapshot("request", {**request_snapshot, "total_requests": 4})
        file_store.save_snapshot("rum", rum_snapshot)

        reloaded_store = JsonFileMetricsSnapshotStore(store_path, max_history=2)
        assert reloaded_store.load_latest("request")["total_requests"] == 4
        assert reloaded_store.load_latest("rum")["accepted_events"] == 1
        assert len(reloaded_store.load_history("request")) == 2
        assert (
            reloaded_store.load_latest("request")["generated_at"]
            == "2026-06-19T08:00:00+00:00"
        )

        built_file_store = build_metrics_snapshot_store(
            {"BLOG_METRICS_STORE": "json", "BLOG_METRICS_STORE_PATH": str(store_path)}
        )
        assert isinstance(built_file_store, JsonFileMetricsSnapshotStore)

    built_memory_store = build_metrics_snapshot_store({"BLOG_METRICS_STORE": "memory"})
    assert isinstance(built_memory_store, InMemoryMetricsSnapshotStore)

    print("Metrics snapshot store protocol check passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
