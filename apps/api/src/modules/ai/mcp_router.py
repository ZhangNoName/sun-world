from __future__ import annotations

import hashlib
import math
import os
import secrets
from dataclasses import dataclass

from fastapi import APIRouter, Depends, HTTPException, Request
from starlette.concurrency import run_in_threadpool

from app_instance import app
from src.core.response import ApiResponse, ok

from .errors import AiDomainError
from .mcp_schemas import (
    AiMcpConnection,
    AiMcpConnectionCreate,
    AiMcpConnectionUpdate,
    AiMcpDiscoveryResult,
    AiMcpTool,
    AiMcpToolCallRequest,
    AiMcpToolCallResult,
)
from .mcp_service import AiMcpService
from .router import _await_sync_cleanup, raise_http, require_ai_user_id


router = APIRouter(prefix="/ai/v1/mcp", tags=["ai-v1-mcp"])
MCP_LEASE_DEADLINE_GRACE_SECONDS = 30


@dataclass(frozen=True)
class McpRateLimitDecision:
    retry_after: int


def _bounded_mcp_integer(
    name: str,
    default: int,
    *,
    minimum: int,
    maximum: int,
) -> int:
    try:
        value = int(os.getenv(name, str(default)))
    except (TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=503,
            detail={
                "code": "AI_MCP_RATE_LIMIT_CONFIGURATION_INVALID",
                "message": "The MCP traffic guard configuration is invalid.",
            },
        ) from exc
    if value < minimum or value > maximum:
        raise HTTPException(
            status_code=503,
            detail={
                "code": "AI_MCP_RATE_LIMIT_CONFIGURATION_INVALID",
                "message": "The MCP traffic guard configuration is invalid.",
            },
        )
    return value


def _mcp_guard_configuration_error() -> HTTPException:
    return HTTPException(
        status_code=503,
        detail={
            "code": "AI_MCP_RATE_LIMIT_CONFIGURATION_INVALID",
            "message": "The MCP traffic guard configuration is invalid.",
        },
    )


def enforce_mcp_remote_rate_limit(
    request: Request,
    user_id: int,
) -> McpRateLimitDecision:
    """Atomically charge per-user, per-IP, and global remote MCP budgets."""

    redis = getattr(app, "redis", None)
    if redis is None:
        raise HTTPException(
            status_code=503,
            detail={
                "code": "AI_MCP_RATE_LIMIT_UNAVAILABLE",
                "message": "MCP traffic protection is temporarily unavailable.",
            },
        )
    window_seconds = _bounded_mcp_integer(
        "AI_MCP_RATE_WINDOW_SECONDS",
        600,
        minimum=10,
        maximum=86_400,
    )
    user_limit = _bounded_mcp_integer(
        "AI_MCP_USER_RATE_LIMIT",
        60,
        minimum=1,
        maximum=10_000,
    )
    ip_limit = _bounded_mcp_integer(
        "AI_MCP_IP_RATE_LIMIT",
        120,
        minimum=1,
        maximum=100_000,
    )
    global_limit = _bounded_mcp_integer(
        "AI_MCP_GLOBAL_RATE_LIMIT",
        1_000,
        minimum=1,
        maximum=1_000_000,
    )
    client_host = request.client.host if request.client else "unknown"
    user_digest = hashlib.sha256(f"user:{user_id}".encode("utf-8")).hexdigest()
    ip_digest = hashlib.sha256(f"ip:{client_host}".encode("utf-8")).hexdigest()
    try:
        allowed, retry_after = redis.consume_multi_fixed_window(
            [
                (f"ai:mcp:remote:user:{user_digest}", user_limit, window_seconds),
                (f"ai:mcp:remote:ip:{ip_digest}", ip_limit, window_seconds),
                ("ai:mcp:remote:global", global_limit, window_seconds),
            ]
        )
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail={
                "code": "AI_MCP_RATE_LIMIT_UNAVAILABLE",
                "message": "MCP traffic protection is temporarily unavailable.",
            },
        ) from exc
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail={
                "code": "AI_MCP_RATE_LIMITED",
                "message": "MCP requests are too frequent. Try again later.",
                "retry_after": retry_after,
            },
            headers={"Retry-After": str(retry_after)},
        )
    return McpRateLimitDecision(retry_after=retry_after)


def acquire_mcp_remote_lease() -> tuple[object, str]:
    redis = getattr(app, "redis", None)
    if redis is None:
        raise HTTPException(
            status_code=503,
            detail={
                "code": "AI_MCP_RATE_LIMIT_UNAVAILABLE",
                "message": "MCP traffic protection is temporarily unavailable.",
            },
        )
    limit = _bounded_mcp_integer(
        "AI_MCP_GLOBAL_CONCURRENCY",
        8,
        minimum=1,
        maximum=1_000,
    )
    ttl = _bounded_mcp_integer(
        "AI_MCP_CONCURRENCY_TTL_SECONDS",
        120,
        minimum=30,
        maximum=900,
    )
    try:
        discovery_deadline = float(
            os.getenv("AI_MCP_DISCOVERY_DEADLINE_SECONDS", "30")
        )
        call_deadline = float(os.getenv("AI_MCP_CALL_DEADLINE_SECONDS", "60"))
    except (TypeError, ValueError) as exc:
        raise _mcp_guard_configuration_error() from exc
    deadlines = (discovery_deadline, call_deadline)
    if any(
        not math.isfinite(deadline) or deadline <= 0 or deadline > 300
        for deadline in deadlines
    ) or ttl < math.ceil(max(deadlines)) + MCP_LEASE_DEADLINE_GRACE_SECONDS:
        raise _mcp_guard_configuration_error()
    lease_id = secrets.token_urlsafe(24)
    try:
        acquired = redis.acquire_bounded_lease(
            name="ai:mcp:remote_concurrency",
            member=lease_id,
            limit=limit,
            ttl=ttl,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail={
                "code": "AI_MCP_RATE_LIMIT_UNAVAILABLE",
                "message": "MCP traffic protection is temporarily unavailable.",
            },
        ) from exc
    if not acquired:
        raise HTTPException(
            status_code=429,
            detail={
                "code": "AI_MCP_CONCURRENCY_LIMITED",
                "message": "MCP remote capacity is busy. Try again shortly.",
            },
            headers={"Retry-After": "5"},
        )
    return redis, lease_id


def release_mcp_remote_lease(redis: object, lease_id: str) -> None:
    try:
        redis.release_bounded_lease(
            name="ai:mcp:remote_concurrency",
            member=lease_id,
        )
    except Exception:
        # Leases are expiring; a release outage must not hide the operation result.
        pass


def get_ai_mcp_service() -> AiMcpService:
    service = getattr(app, "ai_mcp_service", None)
    if service is None:
        raise HTTPException(
            status_code=503,
            detail={
                "code": "AI_MCP_DISABLED",
                "message": "MCP is disabled until the server allowlist is configured.",
            },
        )
    return service


@router.get("/connections", response_model=ApiResponse[list[AiMcpConnection]])
async def list_connections(
    user_id: int = Depends(require_ai_user_id),
    service: AiMcpService = Depends(get_ai_mcp_service),
):
    return ok(data=await service.list_connections(user_id), msg="MCP connections loaded")


@router.post("/connections", response_model=ApiResponse[AiMcpConnection])
async def create_connection(
    body: AiMcpConnectionCreate,
    user_id: int = Depends(require_ai_user_id),
    service: AiMcpService = Depends(get_ai_mcp_service),
):
    try:
        connection = await service.create_connection(user_id, body)
    except AiDomainError as error:
        raise_http(error)
    return ok(data=connection, msg="MCP connection created")


@router.put("/connections/{connection_id}", response_model=ApiResponse[AiMcpConnection])
async def update_connection(
    connection_id: str,
    body: AiMcpConnectionUpdate,
    user_id: int = Depends(require_ai_user_id),
    service: AiMcpService = Depends(get_ai_mcp_service),
):
    try:
        connection = await service.update_connection(user_id, connection_id, body)
    except AiDomainError as error:
        raise_http(error)
    return ok(data=connection, msg="MCP connection updated")


@router.delete("/connections/{connection_id}", response_model=ApiResponse[None])
async def delete_connection(
    connection_id: str,
    user_id: int = Depends(require_ai_user_id),
    service: AiMcpService = Depends(get_ai_mcp_service),
):
    try:
        await service.delete_connection(user_id, connection_id)
    except AiDomainError as error:
        raise_http(error)
    return ok(data=None, msg="MCP connection deleted")


@router.post(
    "/connections/{connection_id}/discover",
    response_model=ApiResponse[AiMcpDiscoveryResult],
)
async def discover_tools(
    connection_id: str,
    request: Request,
    user_id: int = Depends(require_ai_user_id),
    service: AiMcpService = Depends(get_ai_mcp_service),
):
    await run_in_threadpool(enforce_mcp_remote_rate_limit, request, user_id)
    redis, lease_id = await run_in_threadpool(acquire_mcp_remote_lease)
    try:
        try:
            result = await service.discover(user_id, connection_id)
        except AiDomainError as error:
            raise_http(error)
    finally:
        await _await_sync_cleanup(release_mcp_remote_lease, redis, lease_id)
    return ok(data=result, msg="MCP tools discovered")


@router.get(
    "/connections/{connection_id}/tools",
    response_model=ApiResponse[list[AiMcpTool]],
)
async def list_tools(
    connection_id: str,
    user_id: int = Depends(require_ai_user_id),
    service: AiMcpService = Depends(get_ai_mcp_service),
):
    try:
        tools = await service.list_tools(user_id, connection_id)
    except AiDomainError as error:
        raise_http(error)
    return ok(data=tools, msg="MCP tools loaded")


@router.post(
    "/connections/{connection_id}/tools/{tool_name:path}/call",
    response_model=ApiResponse[AiMcpToolCallResult],
)
async def call_tool(
    connection_id: str,
    tool_name: str,
    body: AiMcpToolCallRequest,
    request: Request,
    user_id: int = Depends(require_ai_user_id),
    service: AiMcpService = Depends(get_ai_mcp_service),
):
    await run_in_threadpool(enforce_mcp_remote_rate_limit, request, user_id)
    redis, lease_id = await run_in_threadpool(acquire_mcp_remote_lease)
    try:
        try:
            result = await service.call_tool(
                user_id,
                connection_id,
                tool_name,
                body,
            )
        except AiDomainError as error:
            raise_http(error)
    finally:
        await _await_sync_cleanup(release_mcp_remote_lease, redis, lease_id)
    return ok(data=result, msg="MCP tool call completed")
