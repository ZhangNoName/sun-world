from fastapi import APIRouter

from src.core.response import ApiResponse, ok
from src.core.rum_metrics import record_rum_event
from src.type.telemetry_type import TelemetryEventPayload, TelemetryIngestResult

router = APIRouter(prefix="/telemetry", tags=["telemetry"])
telemetry_router = router


@router.post("/events", response_model=ApiResponse[TelemetryIngestResult])
async def ingest_telemetry_event(payload: TelemetryEventPayload):
    """Ingest one frontend RUM event into the process-local metrics collector."""
    accepted = record_rum_event(payload.model_dump())
    return ok(data=TelemetryIngestResult(accepted=accepted), msg="ok")
