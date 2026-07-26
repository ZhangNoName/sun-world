from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse

from app_instance import app
from src.core.response import ApiResponse, ok

from .errors import AiDomainError
from .schemas import (
    AiConversation,
    AiConversationSummary,
    AiFeedbackRequest,
    AiMessage,
    AiMessageEditRequest,
    AiProviderDescriptor,
    AiProviderProfile,
    AiProviderProfileInput,
    AiRunRequest,
    encode_sse_event,
)
from .service import AiService


router = APIRouter(prefix="/ai/v1", tags=["ai-v1"])


def get_ai_service() -> AiService:
    service = getattr(app, "ai_service", None)
    if service is None:
        raise HTTPException(status_code=503, detail="AI workspace service is not initialized")
    return service


def get_optional_ai_user_id(request: Request) -> int | None:
    token = request.cookies.get("access_token")
    auth = getattr(app, "auth", None)
    if not token or auth is None:
        return None
    user = auth.get_user_from_token(token, check_redis=False)
    return int(user.id) if user and user.id is not None else None


def require_ai_user_id(user_id: int | None = Depends(get_optional_ai_user_id)) -> int:
    if user_id is None:
        raise HTTPException(status_code=401, detail="Sign in to save AI workspace data")
    return user_id


def raise_http(error: AiDomainError) -> None:
    raise HTTPException(
        status_code=error.status_code,
        detail={"code": error.code, "message": error.message},
    ) from error


@router.get("/providers", response_model=ApiResponse[list[AiProviderDescriptor]])
async def list_providers(service: AiService = Depends(get_ai_service)):
    return ok(data=service.list_providers(), msg="AI providers loaded")


@router.get("/provider-profiles", response_model=ApiResponse[list[AiProviderProfile]])
async def list_provider_profiles(
    user_id: int = Depends(require_ai_user_id),
    service: AiService = Depends(get_ai_service),
):
    return ok(data=await service.list_provider_profiles(user_id), msg="Provider profiles loaded")


@router.post("/provider-profiles", response_model=ApiResponse[AiProviderProfile])
async def save_provider_profile(
    profile: AiProviderProfileInput,
    user_id: int = Depends(require_ai_user_id),
    service: AiService = Depends(get_ai_service),
):
    try:
        saved = await service.save_provider_profile(user_id, profile)
    except AiDomainError as error:
        raise_http(error)
    return ok(data=saved, msg="Provider profile saved")


@router.get("/conversations", response_model=ApiResponse[list[AiConversationSummary]])
async def list_conversations(
    user_id: int = Depends(require_ai_user_id),
    service: AiService = Depends(get_ai_service),
):
    return ok(data=await service.list_conversations(user_id), msg="Conversations loaded")


@router.post("/conversations", response_model=ApiResponse[AiConversation])
async def create_conversation(
    user_id: int = Depends(require_ai_user_id),
    service: AiService = Depends(get_ai_service),
):
    return ok(data=await service.create_conversation(user_id), msg="Conversation created")


@router.get("/conversations/{conversation_id}", response_model=ApiResponse[AiConversation])
async def get_conversation(
    conversation_id: str,
    user_id: int = Depends(require_ai_user_id),
    service: AiService = Depends(get_ai_service),
):
    try:
        conversation = await service.get_conversation(user_id, conversation_id)
    except AiDomainError as error:
        raise_http(error)
    return ok(data=conversation, msg="Conversation loaded")


@router.patch("/messages/{message_id}", response_model=ApiResponse[AiMessage])
async def edit_message(
    message_id: str,
    body: AiMessageEditRequest,
    user_id: int = Depends(require_ai_user_id),
    service: AiService = Depends(get_ai_service),
):
    try:
        message = await service.edit_message(user_id, message_id, body.content)
    except AiDomainError as error:
        raise_http(error)
    return ok(data=message, msg="Message updated")


@router.put("/messages/{message_id}/feedback", response_model=ApiResponse[None])
async def set_message_feedback(
    message_id: str,
    body: AiFeedbackRequest,
    user_id: int = Depends(require_ai_user_id),
    service: AiService = Depends(get_ai_service),
):
    try:
        await service.set_feedback(user_id, message_id, body.value)
    except AiDomainError as error:
        raise_http(error)
    return ok(data=None, msg="Feedback saved")


@router.post("/runs/stream")
async def stream_run(
    body: AiRunRequest,
    user_id: int | None = Depends(get_optional_ai_user_id),
    service: AiService = Depends(get_ai_service),
):
    async def events():
        async for event in service.stream_run(user_id, body):
            yield encode_sse_event(event)

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
