from __future__ import annotations

import hashlib
import os
import uuid
from typing import Literal
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from fastapi.responses import RedirectResponse
from starlette.concurrency import run_in_threadpool

from app_instance import app
from src.core.response import ApiResponse, ok
from src.routers.auth.auth import (
    get_cookie_settings,
    get_current_user,
    rotate_auth_cookies,
)

from .errors import IdentityDomainError
from .schemas import (
    AccountConnections,
    AuthMethodDescriptor,
    IdentitySession,
    OAuthStart,
    VerificationChallenge,
    VerificationCompleteRequest,
    VerificationRequest,
)
from .service import IdentityService, OAUTH_STATE_TTL_SECONDS


router = APIRouter(prefix="/auth", tags=["identity"])


def get_identity_service() -> IdentityService:
    service = getattr(app, "identity_service", None)
    if service is None:
        raise HTTPException(
            status_code=503,
            detail={
                "code": "AUTH_SERVICE_UNAVAILABLE",
                "message": "登录服务尚未初始化。",
            },
        )
    return service


def raise_http(error: IdentityDomainError) -> None:
    raise HTTPException(
        status_code=error.status_code,
        detail={"code": error.code, "message": error.message},
    ) from error


def _require_access_cookie_user_id(
    request: Request,
    service: IdentityService,
) -> int:
    access_token = request.cookies.get("access_token")
    if not access_token:
        raise IdentityDomainError(
            "AUTH_UNAUTHORIZED",
            "请先登录后再关联第三方身份。",
            status_code=401,
        )
    current_user = service.auth_manager.get_user_from_token(
        access_token,
        check_redis=True,
    )
    if not current_user:
        raise IdentityDomainError(
            "AUTH_TOKEN_EXPIRED",
            "登录状态无效或已过期，请重新登录。",
            status_code=401,
        )
    user_id = (
        current_user.get("id")
        if isinstance(current_user, dict)
        else getattr(current_user, "id", None)
    )
    try:
        parsed_user_id = int(user_id)
    except (TypeError, ValueError) as exc:
        raise IdentityDomainError(
            "AUTH_UNAUTHORIZED",
            "请先登录后再关联第三方身份。",
            status_code=401,
        ) from exc
    if parsed_user_id <= 0:
        raise IdentityDomainError(
            "AUTH_UNAUTHORIZED",
            "请先登录后再关联第三方身份。",
            status_code=401,
        )
    return parsed_user_id


def _step_up_max_age_seconds() -> int:
    try:
        value = int(os.getenv("AUTH_STEP_UP_MAX_AGE_SECONDS", "600"))
    except (TypeError, ValueError) as exc:
        raise IdentityDomainError(
            "AUTH_CONFIGURATION_ERROR",
            "安全验证配置无效。",
            status_code=503,
        ) from exc
    if value < 60 or value > 3600:
        raise IdentityDomainError(
            "AUTH_CONFIGURATION_ERROR",
            "安全验证配置无效。",
            status_code=503,
        )
    return value


def _enforce_oauth_start_rate_limit(request: Request, service: IdentityService) -> None:
    client_host = request.client.host if request.client else "unknown"
    client_hash = hashlib.sha256(client_host.encode("utf-8")).hexdigest()
    try:
        ip_limit = int(os.getenv("AUTH_OAUTH_START_IP_LIMIT", "30"))
        global_limit = int(os.getenv("AUTH_OAUTH_START_GLOBAL_LIMIT", "3000"))
        if ip_limit < 1 or ip_limit > 10_000 or global_limit < 1 or global_limit > 1_000_000:
            raise ValueError("OAuth rate limit is outside its safe bounds")
        allowed, retry_after = service.redis.consume_multi_fixed_window(
            [
                (
                    f"auth:oauth:start:ip:{client_hash}",
                    ip_limit,
                    600,
                ),
                (
                    "auth:oauth:start:global",
                    global_limit,
                    600,
                ),
            ]
        )
    except (TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=503,
            detail={
                "code": "AUTH_RATE_LIMIT_CONFIGURATION_INVALID",
                "message": "第三方登录限流配置无效。",
            },
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail={
                "code": "AUTH_RATE_LIMIT_UNAVAILABLE",
                "message": "登录保护服务暂不可用，请稍后再试。",
            },
        ) from exc
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail={"code": "AUTH_RATE_LIMITED", "message": "请求过于频繁，请稍后再试。"},
            headers={"Retry-After": str(retry_after)},
        )


def _require_recent_access_cookie_session(
    request: Request,
    service: IdentityService,
) -> tuple[int, str]:
    user_id = _require_access_cookie_user_id(request, service)
    context = service.auth_manager.get_recent_session_context(
        request.cookies.get("access_token", ""),
        max_age_seconds=_step_up_max_age_seconds(),
    )
    if context is None or context[0] != user_id:
        raise IdentityDomainError(
            "AUTH_STEP_UP_REQUIRED",
            "此安全操作需要近期登录，请退出后重新登录再试。",
            status_code=401,
        )
    return context


def _state_cookie_name(state: str) -> str:
    digest = hashlib.sha256(state.encode("utf-8")).hexdigest()[:20]
    return f"oauth_state_{digest}"


def _oauth_callback_url(
    service: IdentityService,
    *,
    status: str,
    provider: str,
    flow: str,
    return_to: str,
    code: str | None = None,
) -> str:
    params = {
        "status": status,
        "provider": provider,
        "flow": flow,
        "return_to": return_to,
    }
    if code:
        params["code"] = code
    return f"{service.public_web_origin}/auth/callback?{urlencode(params)}"


@router.get("/methods", response_model=ApiResponse[list[AuthMethodDescriptor]])
async def list_auth_methods(service: IdentityService = Depends(get_identity_service)):
    return ok(data=service.list_methods(), msg="登录方式已加载")


@router.post(
    "/verification/request",
    response_model=ApiResponse[VerificationChallenge],
)
async def request_verification_code(
    body: VerificationRequest,
    request: Request,
    service: IdentityService = Depends(get_identity_service),
):
    client_host = request.client.host if request.client else "unknown"
    try:
        challenge = await service.request_verification(
            channel=body.channel,
            target=body.target,
            client_key=client_host,
            purpose="login",
        )
    except IdentityDomainError as error:
        raise_http(error)
    return ok(data=challenge, msg="验证码已发送")


@router.post(
    "/verification/complete",
    response_model=ApiResponse[IdentitySession],
)
async def complete_verification_login(
    body: VerificationCompleteRequest,
    request: Request,
    response: Response,
    service: IdentityService = Depends(get_identity_service),
):
    device_id = request.cookies.get("device_id") or str(uuid.uuid4())

    def resolve_and_issue_session():
        resolution, channel = service.complete_verification(
            body.challenge_id,
            body.code,
        )
        session, tokens = service.issue_session(
            resolution,
            provider=channel,
            device_id=device_id,
        )
        return session, tokens

    try:
        session, tokens = await run_in_threadpool(resolve_and_issue_session)
    except IdentityDomainError as error:
        raise_http(error)
    rotate_auth_cookies(response, request, service.auth_manager, tokens, device_id)
    return ok(data=session, msg="登录成功")


@router.get(
    "/oauth/{provider}/start",
    response_model=ApiResponse[OAuthStart],
    openapi_extra={"security": [{}, {"CookieSession": []}]},
)
async def start_oauth(
    provider: str,
    request: Request,
    response: Response,
    return_to: str = Query(default="/aigc", max_length=2048),
    flow: Literal["login", "connect"] = Query(default="login"),
    service: IdentityService = Depends(get_identity_service),
):
    def prepare_attempt():
        target_user_id: int | None = None
        target_session_id: str | None = None
        _enforce_oauth_start_rate_limit(request, service)
        if flow == "connect":
            target_user_id, target_session_id = _require_recent_access_cookie_session(
                request,
                service,
            )
        return service.begin_oauth(
            provider,
            return_to,
            flow=flow,
            target_user_id=(
                int(target_user_id) if target_user_id is not None else None
            ),
            target_session_id=target_session_id,
        )

    try:
        attempt = await run_in_threadpool(prepare_attempt)
    except IdentityDomainError as error:
        raise_http(error)
    settings = get_cookie_settings(request)
    response.set_cookie(
        key=_state_cookie_name(attempt.state),
        value=attempt.state,
        max_age=OAUTH_STATE_TTL_SECONDS,
        httponly=True,
        secure=settings["secure"],
        samesite="lax",
        path=f"/auth/oauth/{provider}/callback",
    )
    return ok(
        data=OAuthStart(
            provider=attempt.provider,
            flow=attempt.flow,
            authorization_url=attempt.authorization_url,
        ),
        msg="第三方登录已准备",
    )


@router.get(
    "/oauth/{provider}/callback",
    response_class=RedirectResponse,
    status_code=303,
    responses={303: {"description": "Redirect to the browser OAuth callback page"}},
    openapi_extra={"security": [{}, {"CookieSession": []}]},
)
async def complete_oauth_callback(
    provider: str,
    request: Request,
    state: str,
    code: str | None = None,
    error: str | None = None,
    service: IdentityService = Depends(get_identity_service),
):
    cookie_name = _state_cookie_name(state)
    state_cookie = request.cookies.get(cookie_name)
    return_to = "/aigc"
    flow = "login"
    error_code: str | None = None
    session_tokens = None
    session_resolution = None
    session_device_id = None
    try:
        attempt = await run_in_threadpool(
            service.consume_oauth_attempt,
            provider_name=provider,
            state=state,
            state_cookie=state_cookie,
        )
        return_to = attempt.return_to
        flow = attempt.flow
        if flow == "connect":
            callback_user_id, callback_session_id = await run_in_threadpool(
                _require_recent_access_cookie_session,
                request,
                service,
            )
            if (
                callback_user_id != attempt.target_user_id
                or callback_session_id != attempt.target_session_id
            ):
                raise IdentityDomainError(
                    "AUTH_OAUTH_CONNECT_SESSION_CHANGED",
                    "当前登录账户与发起关联时不一致，请重新发起授权。",
                    status_code=401,
                )
        if error:
            error_code = "AUTH_OAUTH_DENIED"
        elif not code:
            raise IdentityDomainError(
                "AUTH_OAUTH_CODE_MISSING",
                "第三方登录未返回授权码。",
                status_code=401,
            )
        else:
            def revalidate_connect_session(bound_attempt) -> None:
                if bound_attempt.flow != "connect":
                    return
                current_user_id, current_session_id = (
                    _require_recent_access_cookie_session(request, service)
                )
                if (
                    current_user_id != bound_attempt.target_user_id
                    or current_session_id != bound_attempt.target_session_id
                ):
                    raise IdentityDomainError(
                        "AUTH_OAUTH_CONNECT_SESSION_CHANGED",
                        "授权期间登录账户已变化，请重新发起关联。",
                        status_code=401,
                    )

            session_resolution = await service.resolve_oauth_attempt(
                attempt,
                code=code,
                connect_guard=revalidate_connect_session,
            )
            if flow == "login":
                session_device_id = request.cookies.get("device_id") or str(uuid.uuid4())
                _session, session_tokens = await run_in_threadpool(
                    service.issue_session,
                    session_resolution,
                    provider=provider,
                    device_id=session_device_id,
                )
    except IdentityDomainError as identity_error:
        error_code = identity_error.code

    destination = _oauth_callback_url(
        service,
        status="error" if error_code else "success",
        provider=provider,
        flow=flow,
        return_to=return_to,
        code=error_code,
    )
    response = RedirectResponse(destination, status_code=303)
    response.delete_cookie(
        key=cookie_name,
        path=f"/auth/oauth/{provider}/callback",
    )
    if (
        session_tokens is not None
        and session_resolution is not None
        and session_device_id is not None
    ):
        rotate_auth_cookies(
            response,
            request,
            service.auth_manager,
            session_tokens,
            session_device_id,
        )
    return response


@router.get("/connections", response_model=ApiResponse[AccountConnections])
async def list_account_connections(
    current_user=Depends(get_current_user),
    service: IdentityService = Depends(get_identity_service),
):
    user_id = (
        current_user.get("id")
        if isinstance(current_user, dict)
        else getattr(current_user, "id", None)
    )
    if user_id is None:
        raise HTTPException(
            status_code=401,
            detail={"code": "AUTH_UNAUTHORIZED", "message": "请先登录。"},
        )
    connections = await run_in_threadpool(service.list_connections, int(user_id))
    return ok(data=connections, msg="账户连接已加载")


@router.post(
    "/connections/verification/request",
    response_model=ApiResponse[VerificationChallenge],
)
async def request_connection_verification(
    body: VerificationRequest,
    request: Request,
    current_user=Depends(get_current_user),
    service: IdentityService = Depends(get_identity_service),
):
    try:
        user_id, session_id = await run_in_threadpool(
            _require_recent_access_cookie_session,
            request,
            service,
        )
        current_user_id = (
            current_user.get("id")
            if isinstance(current_user, dict)
            else getattr(current_user, "id", None)
        )
        if int(current_user_id) != user_id:
            raise IdentityDomainError(
                "AUTH_OAUTH_CONNECT_SESSION_CHANGED",
                "当前登录账户已变化，请重新登录后再试。",
                status_code=401,
            )
        client_host = request.client.host if request.client else "unknown"
        challenge = await service.request_verification(
            channel=body.channel,
            target=body.target,
            client_key=client_host,
            purpose="connect",
            target_user_id=user_id,
            session_id=session_id,
        )
    except (IdentityDomainError, TypeError, ValueError) as error:
        if isinstance(error, IdentityDomainError):
            raise_http(error)
        raise HTTPException(status_code=401, detail={"code": "AUTH_UNAUTHORIZED", "message": "请先登录。"}) from error
    return ok(data=challenge, msg="验证码已发送")


@router.post(
    "/connections/verification/complete",
    response_model=ApiResponse[AccountConnections],
)
async def complete_connection_verification(
    body: VerificationCompleteRequest,
    request: Request,
    current_user=Depends(get_current_user),
    service: IdentityService = Depends(get_identity_service),
):
    user_id = (
        current_user.get("id")
        if isinstance(current_user, dict)
        else getattr(current_user, "id", None)
    )
    if user_id is None:
        raise HTTPException(
            status_code=401,
            detail={"code": "AUTH_UNAUTHORIZED", "message": "请先登录。"},
        )
    try:
        recent_user_id, session_id = await run_in_threadpool(
            _require_recent_access_cookie_session,
            request,
            service,
        )
        if recent_user_id != int(user_id):
            raise IdentityDomainError(
                "AUTH_OAUTH_CONNECT_SESSION_CHANGED",
                "当前登录账户已变化，请重新登录后再试。",
                status_code=401,
            )
        connections = await run_in_threadpool(
            service.complete_connection_verification,
            user_id=int(user_id),
            challenge_id=body.challenge_id,
            code=body.code,
            session_id=session_id,
        )
    except IdentityDomainError as error:
        raise_http(error)
    return ok(data=connections, msg="联系方式已验证并关联")
