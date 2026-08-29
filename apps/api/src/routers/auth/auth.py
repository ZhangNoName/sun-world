import os
import hashlib
import uuid
from datetime import datetime
from typing import Optional
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response, Security, status
from fastapi.responses import JSONResponse
from loguru import logger
from starlette.concurrency import run_in_threadpool

from app_instance import app
from src.controller.auth_manager import AuthManager
from src.core.error_codes import (
    AUTH_FORBIDDEN,
    AUTH_LOGIN_FAILED,
    AUTH_NOT_IMPLEMENTED,
    AUTH_REGISTER_CONFLICT,
    AUTH_TOKEN_EXPIRED,
    AUTH_UNAUTHORIZED,
)
from src.core.response import ApiResponse, fail, ok
from src.core.runtime_env import is_local_runtime
from src.core.security_schemes import access_token_cookie
from src.type.auth_type import (
    AuthSession,
    LoginModel,
    RegisterModel,
    ResetPasswordModel,
    ResetPasswordRequest,
    TokenModel,
)
from src.type.user_type import User
from src.util.func import get_seconds_until_expiry


def get_cookie_settings(request: Request) -> dict[str, object]:
    # Production security mode is authoritative. Historical YAML overrides are
    # allowed to relax cookies only for an explicitly local runtime.
    if not is_local_runtime():
        return {"secure": True, "samesite": "none"}
    auth_config = getattr(app, "config", {}).get("auth", {})
    configured_secure = auth_config.get("cookie_secure")
    configured_samesite = auth_config.get("cookie_samesite")
    if configured_secure is not None and configured_samesite:
        forwarded_proto = request.headers.get("x-forwarded-proto", "")
        is_https = request.url.scheme == "https" or forwarded_proto == "https"
        secure = bool(configured_secure) and is_https
        samesite = str(configured_samesite).lower()
        if not secure and samesite == "none":
            samesite = "lax"
        return {"secure": secure, "samesite": samesite}

    origin = request.headers.get("origin", "")
    cross_site = False
    if origin:
        try:
            parsed = urlparse(origin)
            origin_host = parsed.hostname
            origin_port = parsed.port or (443 if parsed.scheme == "https" else 80)
            host_header = request.headers.get("host", "")
            if ":" in host_header:
                current_host, current_port_text = host_header.rsplit(":", 1)
                current_port = int(current_port_text)
            else:
                current_host = host_header
                current_port = 80 if request.url.scheme == "http" else 443
            cross_site = origin_host != current_host or origin_port != current_port
        except (TypeError, ValueError):
            cross_site = True

    if is_local_runtime():
        return {"secure": False, "samesite": "none" if cross_site else "lax"}
    return {"secure": True, "samesite": "none"}


def set_auth_cookies(
    response: Response,
    request: Request,
    auth: AuthManager,
    tokens: TokenModel,
    device_id: str,
) -> None:
    if isinstance(auth, AuthManager):
        refresh_context = auth.get_refresh_token_context(tokens.refresh_token)
        if refresh_context is None:
            raise RuntimeError("issued refresh token has invalid session claims")
        _user_id, device_id = refresh_context
    settings = get_cookie_settings(request)
    refresh_max_age = get_seconds_until_expiry(tokens.refresh_token_expire)
    common = {
        "httponly": True,
        "secure": settings["secure"],
        "samesite": settings["samesite"],
        "path": "/",
    }
    response.set_cookie(
        key="access_token",
        value=tokens.access_token,
        max_age=auth.access_token_expire_minutes * 60,
        **common,
    )
    response.set_cookie(
        key="refresh_token",
        value=tokens.refresh_token,
        max_age=refresh_max_age,
        **common,
    )
    response.set_cookie(
        key="device_id",
        value=device_id,
        httponly=True,
        secure=settings["secure"],
        samesite=settings["samesite"],
        max_age=refresh_max_age,
        path="/",
    )
    response.set_cookie(
        key="access_token_expire",
        value=tokens.access_token_expire.isoformat(),
        max_age=auth.access_token_expire_minutes * 60,
        secure=settings["secure"],
        samesite=settings["samesite"],
        path="/",
    )
    response.set_cookie(
        key="refresh_token_expire",
        value=tokens.refresh_token_expire.isoformat(),
        max_age=refresh_max_age,
        secure=settings["secure"],
        samesite=settings["samesite"],
        path="/",
    )


def clear_auth_cookies(response: Response) -> None:
    for path in ("/", "/api"):
        for key in (
            "access_token",
            "refresh_token",
            "device_id",
            "access_token_expire",
            "refresh_token_expire",
        ):
            response.delete_cookie(key=key, path=path)


def rotate_auth_cookies(
    response: Response,
    request: Request,
    auth: AuthManager,
    tokens: TokenModel,
    device_id: str,
) -> None:
    """Replace current cookies and remove cookies issued under legacy paths."""
    clear_auth_cookies(response)
    set_auth_cookies(response, request, auth, tokens, device_id)


def get_auth_manager() -> AuthManager:
    auth: Optional[AuthManager] = getattr(app, "auth", None)
    if auth is None:
        raise HTTPException(status_code=500, detail="Auth manager not initialized")
    return auth


def _error_detail(code: str, message: str) -> dict[str, str]:
    return {"code": code, "message": message}


def _not_implemented(feature: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail=_error_detail(
            AUTH_NOT_IMPLEMENTED,
            f"{feature} is not available yet.",
        ),
    )


def get_current_user(
    request: Request,
    response: Response,
    auth_manager: AuthManager = Depends(get_auth_manager),
    _documented_access_cookie: str | None = Security(access_token_cookie),
):
    access_token = request.cookies.get("access_token")
    user = (
        auth_manager.get_user_from_token(access_token, check_redis=True)
        if access_token
        else None
    )
    if not user:
        if not access_token and not request.cookies.get("refresh_token"):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=_error_detail(AUTH_UNAUTHORIZED, "未找到 token，请先登录"),
            )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=_error_detail(
                AUTH_TOKEN_EXPIRED,
                "访问令牌无效或已过期，请通过 POST /auth/refresh_token 刷新。",
            ),
        )
    return user


def require_admin(current_user=Depends(get_current_user)):
    roles = (
        current_user.get("roles", [])
        if isinstance(current_user, dict)
        else getattr(current_user, "roles", [])
    )
    if not any(
        isinstance(role, dict)
        and str(role.get("code", "")).strip().lower() == "admin"
        for role in roles
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=_error_detail(AUTH_FORBIDDEN, "需要管理员权限"),
        )
    return current_user


router = APIRouter(prefix="/auth", tags=["auth"])


def _bounded_auth_limit(
    name: str,
    default: int,
    maximum: int,
    *,
    minimum: int = 1,
) -> int:
    try:
        value = int(os.getenv(name, str(default)))
    except (TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=503,
            detail=_error_detail(
                "AUTH_RATE_LIMIT_CONFIGURATION_INVALID",
                "登录限流配置无效。",
            ),
        ) from exc
    if value < minimum or value > maximum:
        raise HTTPException(
            status_code=503,
            detail=_error_detail(
                "AUTH_RATE_LIMIT_CONFIGURATION_INVALID",
                "登录限流配置无效。",
            ),
        )
    return value


def _opaque_rate_key(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _client_rate_principal(request: Request) -> str:
    # Uvicorn only trusts forwarded headers from configured proxy peers; do not
    # parse attacker-controlled X-Forwarded-For here.
    return request.client.host if request.client else "unknown"


def _enforce_auth_rate_limit(
    auth: AuthManager,
    rules: list[tuple[str, int, int]],
) -> None:
    try:
        allowed, retry_after = auth.db.consume_multi_fixed_window(rules)
    except Exception as exc:
        logger.warning("Authentication rate limiter unavailable: {}", type(exc).__name__)
        raise HTTPException(
            status_code=503,
            detail=_error_detail(
                "AUTH_RATE_LIMIT_UNAVAILABLE",
                "登录保护服务暂不可用，请稍后再试。",
            ),
        ) from exc
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail=_error_detail("AUTH_RATE_LIMITED", "请求过于频繁，请稍后再试。"),
            headers={"Retry-After": str(retry_after)},
        )


@router.post("/register", response_model=ApiResponse[AuthSession])
async def register(
    user: RegisterModel,
    request: Request,
    response: Response,
    auth: AuthManager = Depends(get_auth_manager),
):
    window = 3600
    rate_rules = [
            (
                f"auth:register:ip:{_opaque_rate_key(_client_rate_principal(request))}",
                _bounded_auth_limit("AUTH_REGISTER_IP_LIMIT", 5, 1_000),
                window,
            ),
            (
                "auth:register:global",
                _bounded_auth_limit("AUTH_REGISTER_GLOBAL_LIMIT", 200, 100_000),
                window,
            ),
        ]
    device_id = request.cookies.get("device_id") or str(uuid.uuid4())
    user_obj = User(
        username=user.name,
        name=user.name,
        age=0,
        phone="",
        # Contact inputs are not trusted during password registration. Users
        # add email/phone through the purpose-bound OTP flow after login.
        email=f"registration-{uuid.uuid4().hex}@users.invalid",
        password=user.password,
        birth_day="1970-01-01",
        sex=0,
    )
    def register_and_issue_tokens():
        _enforce_auth_rate_limit(auth, rate_rules)
        if not auth.register_user(user_obj):
            return None
        return auth.create_tokens_for_user(str(user_obj.id), device_id)

    tokens = await run_in_threadpool(register_and_issue_tokens)
    if tokens is None:
        return fail(msg="注册失败，账号已存在或数据冲突", code=AUTH_REGISTER_CONFLICT)
    rotate_auth_cookies(response, request, auth, tokens, device_id)
    return ok(
        data={
            "id": user_obj.id,
            "access_token_expire": tokens.access_token_expire.isoformat(),
            "refresh_token_expire": tokens.refresh_token_expire.isoformat(),
        },
        msg="注册成功",
    )


@router.post("/login", response_model=ApiResponse[AuthSession])
async def login(
    form_data: LoginModel,
    request: Request,
    response: Response,
    auth: AuthManager = Depends(get_auth_manager),
):
    window = 600
    # LoginModel has already mapped the selected username/contact namespace to
    # its canonical value; use that same value for both throttling and lookup.
    identifier = form_data.username
    rate_rules = [
            (
                f"auth:login:ip:{_opaque_rate_key(_client_rate_principal(request))}",
                _bounded_auth_limit("AUTH_LOGIN_IP_LIMIT", 30, 10_000),
                window,
            ),
            (
                f"auth:login:identifier:{_opaque_rate_key(identifier)}",
                _bounded_auth_limit("AUTH_LOGIN_IDENTIFIER_LIMIT", 10, 1_000),
                window,
            ),
            (
                "auth:login:global",
                _bounded_auth_limit("AUTH_LOGIN_GLOBAL_LIMIT", 3_000, 1_000_000),
                window,
            ),
        ]
    device_id = request.cookies.get("device_id") or str(uuid.uuid4())

    def authenticate_with_rate_limit():
        _enforce_auth_rate_limit(auth, rate_rules)
        return auth.authenticate_user(
            identifier,
            form_data.password,
            device_id,
        )

    tokens = await run_in_threadpool(authenticate_with_rate_limit)
    if not tokens:
        return fail(msg="用户名或密码错误", code=AUTH_LOGIN_FAILED)
    rotate_auth_cookies(response, request, auth, tokens, device_id)
    return ok(
        data={
            "access_token_expire": tokens.access_token_expire.isoformat(),
            "refresh_token_expire": tokens.refresh_token_expire.isoformat(),
        },
        msg="登录成功",
    )


@router.post("/reset_password/request", response_model=ApiResponse[None])
async def request_reset_password(
    req: ResetPasswordRequest, auth: AuthManager = Depends(get_auth_manager)
):
    raise _not_implemented("Password reset requests")


@router.post("/reset_password", response_model=ApiResponse[None])
async def reset_password(
    req: ResetPasswordModel, auth: AuthManager = Depends(get_auth_manager)
):
    raise _not_implemented("Password reset")


@router.post("/logout", response_model=ApiResponse[None])
async def logout(
    request: Request,
    response: Response,
    auth: AuthManager = Depends(get_auth_manager),
):
    authorization = request.headers.get("authorization", "")
    bearer_token = (
        authorization[7:].strip()
        if authorization.lower().startswith("bearer ")
        else None
    )
    # Prefer refresh: it remains authoritative when access has expired. The
    # manager verifies that a token is still active before deleting the device
    # session, so stale tokens cannot revoke a newer login.
    candidates = [
        request.cookies.get("refresh_token"),
        request.cookies.get("access_token"),
        bearer_token,
    ]
    unique_candidates = list(
        dict.fromkeys(token for token in candidates if token)
    )
    def revoke_candidates() -> bool:
        revoked_candidate = not unique_candidates
        for token in unique_candidates:
            if auth.logout(token, all_devices=False):
                revoked_candidate = True
        return revoked_candidate

    revoked = await run_in_threadpool(revoke_candidates)
    if not revoked:
        failure = JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content=fail(
                msg="服务端会话撤销失败，本地登录凭据已清除，请稍后重试。",
                code="AUTH_LOGOUT_FAILED",
            ).model_dump(),
        )
        clear_auth_cookies(failure)
        return failure
    clear_auth_cookies(response)
    return ok(data=None, msg="退出成功")


@router.get("/session", response_model=ApiResponse[AuthSession])
async def session_status(
    request: Request,
    current_user=Depends(get_current_user),
    auth: AuthManager = Depends(get_auth_manager),
):
    def get_session_expiries():
        access = auth.get_token_expiry(
            request.cookies.get("access_token", ""),
            "access",
            check_redis=True,
        )
        refresh = auth.get_token_expiry(
            request.cookies.get("refresh_token", ""),
            "refresh",
            check_redis=True,
        )
        return access, refresh

    access_expire, refresh_expire = await run_in_threadpool(get_session_expiries)
    if access_expire is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=_error_detail(AUTH_TOKEN_EXPIRED, "访问令牌无效或已过期。"),
        )
    return ok(
        data=AuthSession(
            access_token_expire=access_expire,
            refresh_token_expire=refresh_expire,
        ),
        msg="会话状态已加载",
    )


@router.post("/refresh_token", response_model=ApiResponse[AuthSession])
async def refresh_token(
    request: Request,
    response: Response,
    refresh_token: Optional[str] = Header(None),
    auth: AuthManager = Depends(get_auth_manager),
):
    token = request.cookies.get("refresh_token") or refresh_token
    refresh_context = auth.get_refresh_token_context(token) if token else None
    window = _bounded_auth_limit(
        "AUTH_REFRESH_RATE_WINDOW_SECONDS",
        600,
        3_600,
        minimum=60,
    )
    rules = [
        (
            f"auth:refresh:ip:{_opaque_rate_key(_client_rate_principal(request))}",
            _bounded_auth_limit("AUTH_REFRESH_IP_LIMIT", 120, 100_000),
            window,
        ),
        (
            "auth:refresh:global",
            _bounded_auth_limit("AUTH_REFRESH_GLOBAL_LIMIT", 10_000, 1_000_000),
            window,
        ),
    ]
    if refresh_context is not None:
        user_id, device_id = refresh_context
        rules.extend(
            [
                (
                    f"auth:refresh:user:{_opaque_rate_key(user_id)}",
                    _bounded_auth_limit("AUTH_REFRESH_USER_LIMIT", 60, 10_000),
                    window,
                ),
                (
                    f"auth:refresh:device:{_opaque_rate_key(device_id)}",
                    _bounded_auth_limit("AUTH_REFRESH_DEVICE_LIMIT", 30, 10_000),
                    window,
                ),
            ]
        )
    else:
        rules.append(
            (
                "auth:refresh:invalid:global",
                _bounded_auth_limit(
                    "AUTH_REFRESH_INVALID_GLOBAL_LIMIT",
                    1_000,
                    100_000,
                ),
                window,
            )
        )
    await run_in_threadpool(_enforce_auth_rate_limit, auth, rules)
    if not token:
        return fail(msg="未找到 refresh_token", code=AUTH_TOKEN_EXPIRED)
    if refresh_context is None:
        return fail(msg="刷新 Token 失败", code=AUTH_TOKEN_EXPIRED)
    tokens = await run_in_threadpool(auth.refresh_access_token, token)
    if not tokens:
        return fail(msg="刷新 Token 失败", code=AUTH_TOKEN_EXPIRED)
    rotate_auth_cookies(
        response,
        request,
        auth,
        tokens,
        device_id,
    )
    return ok(
        data={
            "access_token_expire": tokens.access_token_expire.isoformat(),
            "refresh_token_expire": tokens.refresh_token_expire.isoformat(),
        },
        msg="Token 刷新成功",
    )
