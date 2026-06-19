from fastapi import APIRouter, Request, status
from fastapi.responses import JSONResponse

from src.core.readiness import build_readiness_snapshot
from src.type.health_type import HealthSnapshot, ReadinessSnapshot

router = APIRouter(tags=["health"])


@router.get("/healthz", response_model=HealthSnapshot)
async def healthz():
    return HealthSnapshot(status="ok")


@router.get(
    "/readyz",
    response_model=ReadinessSnapshot,
    responses={status.HTTP_503_SERVICE_UNAVAILABLE: {"model": ReadinessSnapshot}},
)
async def readyz(request: Request):
    snapshot = await build_readiness_snapshot(request.app)
    status_code = (
        status.HTTP_200_OK
        if snapshot.status == "ready"
        else status.HTTP_503_SERVICE_UNAVAILABLE
    )
    return JSONResponse(
        status_code=status_code,
        content=snapshot.model_dump(mode="json"),
    )
