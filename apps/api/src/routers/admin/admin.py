from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query

from app_instance import app
from src.core.admin_alerts import get_admin_alerts_snapshot
from src.core.audit_log import get_audit_log_snapshot
from src.core.metrics import get_request_metrics_snapshot
from src.core.metrics_history import get_metrics_history_snapshot
from src.core.response import ApiResponse, ok
from src.core.rum_metrics import get_rum_metrics_snapshot
from src.routers.auth.auth import require_admin
from src.type.admin_type import (
    AdminLogSnapshot,
    AdminAlertsSnapshot,
    MetricsHistorySnapshot,
    RequestMetricsSnapshot,
)
from src.type.telemetry_type import RumMetricsSnapshot
from src.type.user_type import User
from src.modules.ai.errors import AiDomainError
from src.modules.ai.schemas import AiProviderCatalog, AiProviderCatalogInput
from src.modules.ai.service import AiService

router = APIRouter(prefix="/admin", tags=["admin"])


def get_admin_ai_service() -> AiService:
    service = getattr(app, "ai_service", None)
    if service is None:
        raise HTTPException(status_code=503, detail="AI workspace service is not initialized")
    return service


def raise_ai_http(error: AiDomainError) -> None:
    raise HTTPException(
        status_code=error.status_code,
        detail={"code": error.code, "message": error.message},
    ) from error


@router.get("/ai/providers", response_model=ApiResponse[list[AiProviderCatalog]])
async def list_admin_ai_providers(
    _current_user: User = Depends(require_admin),
    service: AiService = Depends(get_admin_ai_service),
):
    return ok(data=await service.list_provider_catalog(), msg="AI provider catalog loaded")


@router.post("/ai/providers", response_model=ApiResponse[AiProviderCatalog])
async def create_admin_ai_provider(
    body: AiProviderCatalogInput,
    _current_user: User = Depends(require_admin),
    service: AiService = Depends(get_admin_ai_service),
):
    try:
        created = await service.create_provider_catalog_entry(body)
    except AiDomainError as error:
        raise_ai_http(error)
    return ok(data=created, msg="AI provider created")


@router.put("/ai/providers/{provider_id}", response_model=ApiResponse[AiProviderCatalog])
async def update_admin_ai_provider(
    provider_id: str,
    body: AiProviderCatalogInput,
    _current_user: User = Depends(require_admin),
    service: AiService = Depends(get_admin_ai_service),
):
    try:
        updated = await service.update_provider_catalog_entry(provider_id, body)
    except AiDomainError as error:
        raise_ai_http(error)
    return ok(data=updated, msg="AI provider updated")


@router.delete("/ai/providers/{provider_id}", response_model=ApiResponse[None])
async def delete_admin_ai_provider(
    provider_id: str,
    _current_user: User = Depends(require_admin),
    service: AiService = Depends(get_admin_ai_service),
):
    try:
        await service.delete_provider_catalog_entry(provider_id)
    except AiDomainError as error:
        raise_ai_http(error)
    return ok(data=None, msg="AI provider deleted")


@router.get("/metrics", response_model=ApiResponse[RequestMetricsSnapshot])
async def get_admin_metrics(
    _current_user: User = Depends(require_admin),
):
    """Return a process-local backend request metrics snapshot."""
    return ok(
        data=RequestMetricsSnapshot.model_validate(get_request_metrics_snapshot()),
        msg="获取成功",
    )


@router.get("/telemetry", response_model=ApiResponse[RumMetricsSnapshot])
async def get_admin_telemetry(
    _current_user: User = Depends(require_admin),
):
    """Return a process-local frontend RUM metrics snapshot."""
    return ok(
        data=RumMetricsSnapshot.model_validate(get_rum_metrics_snapshot()),
        msg="ok",
    )


@router.get("/alerts", response_model=ApiResponse[AdminAlertsSnapshot])
async def get_admin_alerts(
    _current_user: User = Depends(require_admin),
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
    _current_user: User = Depends(require_admin),
):
    """Return bounded metrics snapshot history for admin trend views."""
    return ok(
        data=MetricsHistorySnapshot.model_validate(
            get_metrics_history_snapshot(kind=kind, limit=limit)
        ),
        msg="ok",
    )


@router.get("/logs", response_model=ApiResponse[AdminLogSnapshot])
async def get_admin_logs(
    limit: int = Query(default=50, ge=1, le=100),
    severity: Literal["debug", "info", "warning", "error", "critical"] | None = Query(
        default=None
    ),
    event_type: str | None = Query(default=None, min_length=1, max_length=64),
    _current_user: User = Depends(require_admin),
):
    """Return bounded, sanitized lifecycle and request audit events."""
    return ok(
        data=AdminLogSnapshot.model_validate(
            get_audit_log_snapshot(
                limit=limit,
                severity=severity,
                event_type=event_type,
            )
        ),
        msg="ok",
    )
