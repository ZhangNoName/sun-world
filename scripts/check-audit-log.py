#!/usr/bin/env python3
"""Verify bounded, sanitised audit-log behaviour without starting FastAPI."""

from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path


def main() -> int:
    repo_root = Path(__file__).resolve().parents[1]
    sys.path.insert(0, str(repo_root / "apps" / "api"))

    from src.core.audit_log import AuditLogService

    with tempfile.TemporaryDirectory() as temp_dir:
        service = AuditLogService(
            log_dir=Path(temp_dir),
            max_file_bytes=512,
            max_files=3,
        )
        event = service.record(
            "request_mutated",
            severity="info",
            request_id="request-1",
            method="POST",
            route="/blogs/{blog_id}",
            status_code=201,
            duration_ms=12.345,
            password="must-not-persist",
            query="must-not-persist",
        )

        assert event is not None
        assert event["event_type"] == "request_mutated"
        assert event["status_code"] == 201
        assert event["duration_ms"] == 12.35
        assert "password" not in event
        assert "query" not in event

        raw_event = json.loads((Path(temp_dir) / "audit.jsonl").read_text().strip())
        assert raw_event == event

        for index in range(12):
            service.record(
                "request_failed" if index % 2 else "request_mutated",
                severity="error" if index % 2 else "info",
                route=f"/items/{index}",
                status_code=500 if index % 2 else 204,
            )

        files = sorted(Path(temp_dir).glob("audit*.jsonl"))
        assert len(files) <= 3
        assert all(path.stat().st_size <= 512 for path in files)

        filtered = service.list_events(
            limit=3,
            severity="error",
            event_type="request_failed",
        )
        assert filtered["event_count"] == 3
        assert all(item["severity"] == "error" for item in filtered["events"])
        assert all(item["event_type"] == "request_failed" for item in filtered["events"])
        assert filtered["events"] == sorted(
            filtered["events"],
            key=lambda item: item["timestamp"],
            reverse=True,
        )
        assert filtered["max_file_bytes"] == 512
        assert filtered["retained_file_count"] == 3

    with tempfile.TemporaryDirectory() as temp_dir:
        log_dir = Path(temp_dir)
        first_run = AuditLogService(log_dir=log_dir)
        first_run.start()
        assert (log_dir / ".audit-runtime.json").exists()

        restarted = AuditLogService(log_dir=log_dir)
        restarted.start()
        restart_events = restarted.list_events(limit=10)["events"]
        assert any(
            item["event_type"] == "service_restarted_uncleanly"
            for item in restart_events
        )
        restarted.stop()
        assert not (log_dir / ".audit-runtime.json").exists()

        clean_start = AuditLogService(log_dir=log_dir)
        clean_start.start()
        clean_events = clean_start.list_events(limit=10)["events"]
        assert sum(
            item["event_type"] == "service_restarted_uncleanly"
            for item in clean_events
        ) == 1
        clean_start.stop()

    with tempfile.TemporaryDirectory() as temp_dir:
        blocked_path = Path(temp_dir) / "blocked"
        blocked_path.write_text("not a directory", encoding="utf-8")
        blocked = AuditLogService(log_dir=blocked_path)
        assert blocked.record("request_failed", severity="error") is None
        assert blocked.list_events(limit=10)["events"] == []

    with tempfile.TemporaryDirectory() as temp_dir:
        log_dir = Path(temp_dir)
        (log_dir / "audit.jsonl").write_text(
            '{"event_type":"request_failed","severity":"error"}\n',
            encoding="utf-8",
        )
        malformed = AuditLogService(log_dir=log_dir)
        assert malformed.list_events(limit=10)["events"] == []

    print("Audit log protocol check passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
