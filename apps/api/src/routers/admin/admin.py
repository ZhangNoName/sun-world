from fastapi import APIRouter, Depends

from src.core.metrics import get_request_metrics_snapshot
from src.core.response import ApiResponse, ok
from src.routers.auth.auth import get_current_user
from src.type.admin_type import RequestMetricsSnapshot
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
