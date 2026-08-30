from __future__ import annotations

import asyncio
import hashlib
import os
import secrets
import re
from dataclasses import dataclass

from fastapi import APIRouter, Depends, HTTPException, Request, Security
from fastapi.responses import StreamingResponse
from starlette.concurrency import run_in_threadpool

from app_instance import app
from src.core.response import ApiResponse, ok
from src.core.security_schemes import access_token_cookie

from .errors import AiDomainError
from .schemas import (
    AiConversation,
    AiConversationSummary,
    AiFeedbackRequest,
    AiMessage,
    AiMessageEditRequest,
    AiPersona,
    AiPersonaInput,
    AiProviderDescriptor,
    AiProviderProfile,
    AiProviderProfileInput,
    AiRunRequest,
    AiSkill,
    AiSkillInput,
    AiStreamEvent,
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
    try:
        user = auth.get_user_from_token(token, check_redis=True)
    except Exception:
        return None
    if not user:
        return None
    user_id = user.get("id") if isinstance(user, dict) else getattr(user, "id", None)
    return int(user_id) if user_id is not None else None


@dataclass(frozen=True)
class AiRateLimitDecision:
    limit: int
    remaining: int
    retry_after: int


def _bounded_rate_limit(name: str, default: int, *, minimum: int, maximum: int) -> int:
    try:
        value = int(os.getenv(name, str(default)))
    except (TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=503,
            detail={
                "code": "AI_RATE_LIMIT_CONFIGURATION_INVALID",
                "message": "AI 请求限流配置无效。",
            },
        ) from exc
    if value < minimum or value > maximum:
        raise HTTPException(
            status_code=503,
            detail={
                "code": "AI_RATE_LIMIT_CONFIGURATION_INVALID",
                "message": "AI 请求限流配置无效。",
            },
        )
    return value


def enforce_ai_run_rate_limit(
    request: Request,
    user_id: int | None,
) -> AiRateLimitDecision:
    """Atomically charge paid-run budgets after body validation."""
    window_seconds = _bounded_rate_limit(
        "AI_RUN_RATE_WINDOW_SECONDS",
        600,
        minimum=60,
        maximum=86_400,
    )
    if user_id is None:
        limit = _bounded_rate_limit(
            "AI_GUEST_RUN_RATE_LIMIT",
            20,
            minimum=1,
            maximum=1_000,
        )
        client_host = request.client.host if request.client else "unknown"
        principal = f"guest:{client_host}"
        daily_limit = _bounded_rate_limit(
            "AI_GUEST_DAILY_RUN_LIMIT",
            50,
            minimum=1,
            maximum=10_000,
        )
    else:
        limit = _bounded_rate_limit(
            "AI_AUTHENTICATED_RUN_RATE_LIMIT",
            60,
            minimum=1,
            maximum=10_000,
        )
        principal = f"user:{user_id}"
        daily_limit = _bounded_rate_limit(
            "AI_AUTHENTICATED_DAILY_RUN_LIMIT",
            300,
            minimum=1,
            maximum=100_000,
        )
    digest = hashlib.sha256(principal.encode("utf-8")).hexdigest()
    redis = getattr(app, "redis", None)
    if redis is None:
        raise HTTPException(
            status_code=503,
            detail={
                "code": "AI_RATE_LIMIT_UNAVAILABLE",
                "message": "AI 请求限流服务暂不可用。",
            },
        )
    principal_key = f"ai:run_rate:{digest}"
    principal_daily_key = f"ai:run_daily:{digest}"
    global_limit = _bounded_rate_limit(
        "AI_GLOBAL_RUN_RATE_LIMIT",
        200,
        minimum=1,
        maximum=100_000,
    )
    daily_window_seconds = 86_400
    guest_global_daily_limit = _bounded_rate_limit(
        "AI_GUEST_GLOBAL_DAILY_RUN_LIMIT",
        500,
        minimum=1,
        maximum=1_000_000,
    )
    global_daily_limit = _bounded_rate_limit(
        "AI_GLOBAL_DAILY_RUN_LIMIT",
        2_000,
        minimum=1,
        maximum=10_000_000,
    )
    budgets = [
        (principal_key, limit, window_seconds),
        ("ai:run_rate:global", global_limit, window_seconds),
        (principal_daily_key, daily_limit, daily_window_seconds),
        ("ai:run_daily:global", global_daily_limit, daily_window_seconds),
    ]
    if user_id is None:
        budgets.append(
            (
                "ai:run_daily:guest_global",
                guest_global_daily_limit,
                daily_window_seconds,
            )
        )
    try:
        allowed, retry_after = redis.consume_multi_fixed_window(
            budgets
        )
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail={
                "code": "AI_RATE_LIMIT_UNAVAILABLE",
                "message": "AI 请求限流服务暂不可用。",
            },
        ) from exc
    try:
        principal_count = int(redis.get(principal_key) or 0)
        global_count = int(redis.get("ai:run_rate:global") or 0)
        principal_daily_count = int(redis.get(principal_daily_key) or 0)
        global_daily_count = int(redis.get("ai:run_daily:global") or 0)
        guest_global_daily_count = int(
            redis.get("ai:run_daily:guest_global") or 0
        )
    except Exception:
        principal_count = limit if not allowed else 1
        global_count = global_limit if not allowed else 1
        principal_daily_count = daily_limit if not allowed else 1
        global_daily_count = global_daily_limit if not allowed else 1
        guest_global_daily_count = (
            guest_global_daily_limit if not allowed and user_id is None else 0
        )
    if not allowed:
        if principal_count >= limit:
            raise HTTPException(
                status_code=429,
                detail={
                    "code": "AI_RATE_LIMITED",
                    "message": "AI 请求过于频繁，请稍后再试。",
                    "retry_after": retry_after,
                },
                headers={"Retry-After": str(retry_after)},
            )
        if principal_daily_count >= daily_limit:
            raise HTTPException(
                status_code=429,
                detail={
                    "code": "AI_DAILY_RATE_LIMITED",
                    "message": "今日 AI 请求额度已用完，请稍后再试。",
                    "retry_after": retry_after,
                },
                headers={"Retry-After": str(retry_after)},
            )
        if (
            global_daily_count >= global_daily_limit
            or (
                user_id is None
                and guest_global_daily_count >= guest_global_daily_limit
            )
        ):
            raise HTTPException(
                status_code=503,
                detail={
                    "code": "AI_DAILY_BUDGET_EXHAUSTED",
                    "message": "今日 AI 公共额度已用完，请稍后再试。",
                    "retry_after": retry_after,
                },
                headers={"Retry-After": str(retry_after)},
            )
        raise HTTPException(
            status_code=503,
            detail={
                "code": "AI_GLOBAL_BUDGET_EXHAUSTED",
                "message": "AI 公共额度暂时繁忙，请稍后再试。",
                "retry_after": retry_after,
            },
            headers={"Retry-After": str(retry_after)},
        )

    remaining = max(0, limit - principal_count)
    return AiRateLimitDecision(limit, remaining, retry_after)


def acquire_ai_run_lease() -> tuple[object, str]:
    """Acquire concurrency only after FastAPI has validated the request body."""
    redis = getattr(app, "redis", None)
    if redis is None:
        raise HTTPException(
            status_code=503,
            detail={
                "code": "AI_RATE_LIMIT_UNAVAILABLE",
                "message": "AI 请求限流服务暂不可用。",
            },
        )
    concurrency_limit = _bounded_rate_limit(
        "AI_GLOBAL_RUN_CONCURRENCY",
        8,
        minimum=1,
        maximum=1_000,
    )
    concurrency_ttl = _bounded_rate_limit(
        "AI_RUN_CONCURRENCY_TTL_SECONDS",
        240,
        # The provider has a 180-second hard deadline; retain capacity through
        # final persistence and cleanup instead of expiring mid-generation.
        minimum=240,
        maximum=900,
    )
    lease_id = secrets.token_urlsafe(24)
    try:
        acquired = redis.acquire_bounded_lease(
            name="ai:run_concurrency",
            member=lease_id,
            limit=concurrency_limit,
            ttl=concurrency_ttl,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail={
                "code": "AI_RATE_LIMIT_UNAVAILABLE",
                "message": "AI 请求限流服务暂不可用。",
            },
        ) from exc
    if not acquired:
        raise HTTPException(
            status_code=429,
            detail={
                "code": "AI_CONCURRENCY_LIMITED",
                "message": "当前 AI 请求较多，请稍后再试。",
            },
            headers={"Retry-After": "5"},
        )
    return redis, lease_id


def release_ai_run_leases(
    redis: object,
    lease_id: str,
    *,
    conversation_lease_name: str | None,
    conversation_lease_id: str,
    conversation_lease_acquired: bool,
) -> None:
    """Best-effort release of all leases in one cancellation-shielded DB-free stage."""
    if conversation_lease_acquired and conversation_lease_name is not None:
        try:
            redis.release_bounded_lease(
                name=conversation_lease_name,
                member=conversation_lease_id,
            )
        except Exception:
            pass
    try:
        redis.release_bounded_lease(
            name="ai:run_concurrency",
            member=lease_id,
        )
    except Exception:
        pass


async def _await_sync_cleanup(function, /, *args, **kwargs) -> None:
    """Finish a worker-thread cleanup before propagating task cancellation."""
    cleanup_task = asyncio.create_task(
        run_in_threadpool(function, *args, **kwargs)
    )
    try:
        await asyncio.shield(cleanup_task)
    except asyncio.CancelledError:
        await cleanup_task
        raise


def ai_conversation_lease_name(
    conversation_id: str | None,
    user_id: int | None,
    guest_session_id: str | None,
) -> str | None:
    """Return a privacy-safe distributed lock key for an existing chat."""
    if conversation_id is None:
        return None
    principal = (
        f"user:{user_id}"
        if user_id is not None
        else f"guest:{guest_session_id or 'isolated'}"
    )
    digest = hashlib.sha256(
        f"{principal}\x00{conversation_id}".encode("utf-8")
    ).hexdigest()
    return f"ai:conversation_run:{digest}"


def require_ai_user_id(
    user_id: int | None = Depends(get_optional_ai_user_id),
    _documented_access_cookie: str | None = Security(access_token_cookie),
) -> int:
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
    return ok(data=await service.list_providers(), msg="AI providers loaded")


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


@router.get("/personas", response_model=ApiResponse[list[AiPersona]])
async def list_personas(
    user_id: int = Depends(require_ai_user_id),
    service: AiService = Depends(get_ai_service),
):
    return ok(data=await service.list_personas(user_id), msg="Personas loaded")


@router.post("/personas", response_model=ApiResponse[AiPersona])
async def create_persona(
    body: AiPersonaInput,
    user_id: int = Depends(require_ai_user_id),
    service: AiService = Depends(get_ai_service),
):
    return ok(
        data=await service.create_persona(user_id, body),
        msg="Persona created",
    )


@router.get("/personas/{persona_id}", response_model=ApiResponse[AiPersona])
async def get_persona(
    persona_id: str,
    user_id: int = Depends(require_ai_user_id),
    service: AiService = Depends(get_ai_service),
):
    try:
        persona = await service.get_persona(user_id, persona_id)
    except AiDomainError as error:
        raise_http(error)
    return ok(data=persona, msg="Persona loaded")


@router.put("/personas/{persona_id}", response_model=ApiResponse[AiPersona])
async def update_persona(
    persona_id: str,
    body: AiPersonaInput,
    user_id: int = Depends(require_ai_user_id),
    service: AiService = Depends(get_ai_service),
):
    try:
        persona = await service.update_persona(user_id, persona_id, body)
    except AiDomainError as error:
        raise_http(error)
    return ok(data=persona, msg="Persona updated")


@router.delete("/personas/{persona_id}", response_model=ApiResponse[None])
async def delete_persona(
    persona_id: str,
    user_id: int = Depends(require_ai_user_id),
    service: AiService = Depends(get_ai_service),
):
    try:
        await service.delete_persona(user_id, persona_id)
    except AiDomainError as error:
        raise_http(error)
    return ok(data=None, msg="Persona deleted")


@router.get("/skills", response_model=ApiResponse[list[AiSkill]])
async def list_skills(
    user_id: int = Depends(require_ai_user_id),
    service: AiService = Depends(get_ai_service),
):
    return ok(data=await service.list_skills(user_id), msg="Skills loaded")


@router.post("/skills", response_model=ApiResponse[AiSkill])
async def create_skill(
    body: AiSkillInput,
    user_id: int = Depends(require_ai_user_id),
    service: AiService = Depends(get_ai_service),
):
    return ok(
        data=await service.create_skill(user_id, body),
        msg="Skill created",
    )


@router.get("/skills/{skill_id}", response_model=ApiResponse[AiSkill])
async def get_skill(
    skill_id: str,
    user_id: int = Depends(require_ai_user_id),
    service: AiService = Depends(get_ai_service),
):
    try:
        skill = await service.get_skill(user_id, skill_id)
    except AiDomainError as error:
        raise_http(error)
    return ok(data=skill, msg="Skill loaded")


@router.put("/skills/{skill_id}", response_model=ApiResponse[AiSkill])
async def update_skill(
    skill_id: str,
    body: AiSkillInput,
    user_id: int = Depends(require_ai_user_id),
    service: AiService = Depends(get_ai_service),
):
    try:
        skill = await service.update_skill(user_id, skill_id, body)
    except AiDomainError as error:
        raise_http(error)
    return ok(data=skill, msg="Skill updated")


@router.delete("/skills/{skill_id}", response_model=ApiResponse[None])
async def delete_skill(
    skill_id: str,
    user_id: int = Depends(require_ai_user_id),
    service: AiService = Depends(get_ai_service),
):
    try:
        await service.delete_skill(user_id, skill_id)
    except AiDomainError as error:
        raise_http(error)
    return ok(data=None, msg="Skill deleted")


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


@router.post(
    "/runs/stream",
    response_class=StreamingResponse,
    responses={
        200: {
            "description": "Versioned server-sent event stream",
            "content": {
                "text/event-stream": {
                    "schema": {"type": "string"},
                }
            },
        }
    },
)
async def stream_run(
    body: AiRunRequest,
    request: Request,
    user_id: int | None = Depends(get_optional_ai_user_id),
    service: AiService = Depends(get_ai_service),
):
    # Paid-run budgets and concurrency both live inside the endpoint because
    # dependencies may execute before FastAPI validates the request body.
    # Malformed requests therefore cannot consume provider capacity or quota.
    rate_limit = await run_in_threadpool(
        enforce_ai_run_rate_limit,
        request,
        user_id,
    )
    redis, lease_id = await run_in_threadpool(acquire_ai_run_lease)
    guest_session_id: str | None = None
    if user_id is None:
        candidate = request.cookies.get("ai_guest_session", "")
        guest_session_id = (
            candidate
            if re.fullmatch(r"[A-Za-z0-9_-]{32,128}", candidate)
            else secrets.token_urlsafe(32)
        )

    async def events():
        conversation_lease_name: str | None = None
        conversation_lease_id = secrets.token_urlsafe(24)
        conversation_lease_acquired = False
        try:
            try:
                resolved_conversation_id = await service.resolve_run_conversation_id(
                    user_id,
                    body,
                )
            except AiDomainError as error:
                yield encode_sse_event(
                    AiStreamEvent(
                        event_id=f"evt_{secrets.token_hex(16)}",
                        type="run.failed",
                        conversation_id=body.conversation_id or "pending",
                        message_id=f"msg_{secrets.token_hex(16)}",
                        sequence=0,
                        data={
                            "code": error.code,
                            "message": error.message,
                            "retryable": False,
                        },
                    )
                )
                return
            except Exception:
                yield encode_sse_event(
                    AiStreamEvent(
                        event_id=f"evt_{secrets.token_hex(16)}",
                        type="run.failed",
                        conversation_id=body.conversation_id or "pending",
                        message_id=f"msg_{secrets.token_hex(16)}",
                        sequence=0,
                        data={
                            "code": "AI_STORAGE_UNAVAILABLE",
                            "message": "The AI conversation could not be loaded. Please try again.",
                            "retryable": True,
                        },
                    )
                )
                return
            effective_body = (
                body.model_copy(update={"conversation_id": resolved_conversation_id})
                if resolved_conversation_id != body.conversation_id
                else body
            )
            conversation_lease_name = ai_conversation_lease_name(
                resolved_conversation_id,
                user_id,
                guest_session_id,
            )
            if conversation_lease_name is not None:
                try:
                    # Provider streams have a 180-second hard deadline. Keep
                    # this distributed lock alive longer without holding a DB
                    # transaction or connection across the remote request.
                    conversation_lease_ttl = max(
                        240,
                        _bounded_rate_limit(
                            "AI_RUN_CONCURRENCY_TTL_SECONDS",
                            240,
                            minimum=30,
                            maximum=900,
                        ),
                    )
                    conversation_lease_acquired = await run_in_threadpool(
                        redis.acquire_bounded_lease,
                        name=conversation_lease_name,
                        member=conversation_lease_id,
                        limit=1,
                        ttl=conversation_lease_ttl,
                    )
                except Exception:
                    yield encode_sse_event(
                        AiStreamEvent(
                            event_id=f"evt_{secrets.token_hex(16)}",
                            type="run.failed",
                            conversation_id=resolved_conversation_id or "pending",
                            message_id=f"msg_{secrets.token_hex(16)}",
                            sequence=0,
                            data={
                                "code": "AI_CONVERSATION_LOCK_UNAVAILABLE",
                                "message": "The conversation is temporarily unavailable. Please try again.",
                                "retryable": True,
                            },
                        )
                    )
                    return
                if not conversation_lease_acquired:
                    yield encode_sse_event(
                        AiStreamEvent(
                            event_id=f"evt_{secrets.token_hex(16)}",
                            type="run.failed",
                            conversation_id=resolved_conversation_id or "pending",
                            message_id=f"msg_{secrets.token_hex(16)}",
                            sequence=0,
                            data={
                                "code": "AI_CONVERSATION_BUSY",
                                "message": "This conversation already has a response in progress.",
                                "retryable": True,
                            },
                        )
                    )
                    return
            async for event in service.stream_run(
                user_id,
                effective_body,
                guest_session_id=guest_session_id,
            ):
                yield encode_sse_event(event)
        finally:
            # Releasing both leases in one protected worker call prevents
            # cancellation between conversation and global cleanup.
            await _await_sync_cleanup(
                release_ai_run_leases,
                redis,
                lease_id,
                conversation_lease_name=conversation_lease_name,
                conversation_lease_id=conversation_lease_id,
                conversation_lease_acquired=conversation_lease_acquired,
            )

    response = StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
            "X-RateLimit-Limit": str(rate_limit.limit),
            "X-RateLimit-Remaining": str(rate_limit.remaining),
        },
    )
    if guest_session_id is not None:
        from src.routers.auth.auth import get_cookie_settings

        settings = get_cookie_settings(request)
        response.set_cookie(
            key="ai_guest_session",
            value=guest_session_id,
            max_age=60 * 60,
            httponly=True,
            secure=settings["secure"],
            samesite=settings["samesite"],
            path="/ai/v1",
        )
    return response
