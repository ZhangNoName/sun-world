from typing import Literal

from fastapi import APIRouter, Depends, Query

from src.core.admin_alerts import get_admin_alerts_snapshot
from src.core.metrics import get_request_metrics_snapshot
from src.core.metrics_history import get_metrics_history_snapshot
from src.core.response import ApiResponse, ok
from src.core.rum_metrics import get_rum_metrics_snapshot
from src.routers.auth.auth import get_current_user
from src.type.admin_type import (
    AdminAlertsSnapshot,
    MetricsHistorySnapshot,
    RequestMetricsSnapshot,
)
from src.type.telemetry_type import RumMetricsSnapshot
from src.type.user_type import User

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/metrics", response_model=ApiResponse[RequestMetricsSnapshot])
async def get_admin_metrics(
    _current_user: User = Depends(get_current_user),
):
    """Return a process-local backend request metrics snapshot."""
    return ok(
        data=RequestMetricsSnapshot.model_validate(get_request_metrics_snapshot()),
        msg="获取成功",
    )


@router.get("/telemetry", response_model=ApiResponse[RumMetricsSnapshot])
async def get_admin_telemetry(
    _current_user: User = Depends(get_current_user),
):
    """Return a process-local frontend RUM metrics snapshot."""
    return ok(
        data=RumMetricsSnapshot.model_validate(get_rum_metrics_snapshot()),
        msg="ok",
    )


@router.get("/alerts", response_model=ApiResponse[AdminAlertsSnapshot])
async def get_admin_alerts(
    _current_user: User = Depends(get_current_user),
):
    """Return active local request/RUM alert thresholds."""
    return ok(
        data=AdminAlertsSnapshot.model_validate(get_admin_alerts_snapshot()),
        msg="ok",
    )


@router.get("/metrics/history", response_model=ApiResponse[MetricsHistorySnapshot])
async def get_admin_metrics_history(
    kind: Literal["request", "rum"] = Query(default="request"),
    limit: int = Query(default=20, ge=1, le=120),
    _current_user: User = Depends(get_current_user),
):
    """Return bounded metrics snapshot history for admin trend views."""
    return ok(
        data=MetricsHistorySnapshot.model_validate(
            get_metrics_history_snapshot(kind=kind, limit=limit)
        ),
        msg="ok",
    )
