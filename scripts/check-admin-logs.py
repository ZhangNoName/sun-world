#!/usr/bin/env python3
"""Verify the authenticated admin audit-log read model protocol."""

from __future__ import annotations

import sys
import tempfile
from pathlib import Path


def main() -> int:
    repo_root = Path(__file__).resolve().parents[1]
    sys.path.insert(0, str(repo_root / "apps" / "api"))

    from src.core import audit_log
    from src.core.audit_log import AuditLogService, get_audit_log_snapshot
    from src.type.admin_type import AdminLogSnapshot

    with tempfile.TemporaryDirectory() as temp_dir:
        service = AuditLogService(log_dir=Path(temp_dir))
        service.record(
            "service_restarted_uncleanly",
            severity="warning",
            request_id="restart-1",
        )
        audit_log.audit_log = service
        snapshot = get_audit_log_snapshot(
            limit=20,
            severity="warning",
            event_type="service_restarted_uncleanly",
        )

    model = AdminLogSnapshot.model_validate(snapshot)
    assert model.event_count == 1
    assert model.events[0].event_type == "service_restarted_uncleanly"
    assert model.events[0].severity == "warning"
    assert model.events[0].request_id == "restart-1"
    assert model.max_file_bytes == 1024 * 1024
    assert model.retained_file_count == 3

    router_source = (repo_root / "apps/api/src/routers/admin/admin.py").read_text(
        encoding="utf-8"
    )
    assert '@router.get("/logs", response_model=ApiResponse[AdminLogSnapshot])' in router_source
    assert "_current_user: User = Depends(get_current_user)" in router_source
    assert "limit: int = Query(default=50, ge=1, le=100)" in router_source

    print("Admin logs protocol check passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
