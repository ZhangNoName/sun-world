from fastapi import APIRouter, HTTPException

from src.core.response import ApiResponse, ok

from .registry import integration_registry
from .schemas import IntegrationConnector


router = APIRouter(prefix="/integrations/v1", tags=["integrations"])


@router.get("/connectors", response_model=ApiResponse[list[IntegrationConnector]])
async def list_integration_connectors():
    return ok(
        data=integration_registry.list_connectors(),
        msg="Integration connectors loaded",
    )


@router.get(
    "/connectors/{adapter_id}",
    response_model=ApiResponse[IntegrationConnector],
)
async def get_integration_connector(adapter_id: str):
    connector = integration_registry.get_connector(adapter_id)
    if connector is None:
        raise HTTPException(
            status_code=404,
            detail={
                "code": "INTEGRATION_CONNECTOR_NOT_FOUND",
                "message": "Integration connector not found.",
            },
        )
    return ok(data=connector, msg="Integration connector loaded")
