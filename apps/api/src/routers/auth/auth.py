import os
import uuid
from datetime import datetime
from typing import Optional
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response, status
from loguru import logger

from app_instance import app
from src.controller.auth_manager import AuthManager
from src.core.error_codes import (
    AUTH_FORBIDDEN,
    AUTH_LOGIN_FAILED,
    AUTH_REGISTER_CONFLICT,
    AUTH_TOKEN_EXPIRED,
    AUTH_UNAUTHORIZED,
)
from src.core.response import ApiResponse, fail, ok
from src.type.auth_type import (
    AuthSession,
    LoginModel,
    QQModel,
    RegisterModel,
    ResetPasswordModel,
    ResetPasswordRequest,
    TokenModel,
)
from src.type.user_type import User
from src.util.func import get_seconds_until_expiry


def get_cookie_settings(request: Request) -> dict[str, object]:
    env = os.getenv("ENV", "local")
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

    if env == "local":
        return {"secure": False, "samesite": "none" if cross_site else "lax"}
    return {"secure": True, "samesite": "none"}


def set_auth_cookies(
    response: Response,
    request: Request,
    auth: AuthManager,
    tokens: TokenModel,
    device_id: str,
) -> None:
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
        httponly=False,
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


def get_current_user(
    request: Request,
    response: Response,
    auth_manager: AuthManager = Depends(get_auth_manager),
):
    access_token = request.cookies.get("access_token")
    if not access_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=_error_detail(AUTH_UNAUTHORIZED, "未找到 token，请先登录"),
        )

    user = auth_manager.get_user_from_token(access_token, check_redis=False)
    if not user:
        refresh_token = request.cookies.get("refresh_token")
        if refresh_token:
            new_tokens = auth_manager.refresh_access_token(refresh_token)
            if new_tokens:
                rotate_auth_cookies(
                    response,
                    request,
                    auth_manager,
                    new_tokens,
                    request.cookies.get("device_id", str(uuid.uuid4())),
                )
                user = auth_manager.get_user_from_token(
                    new_tokens.access_token, check_redis=False
                )

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=_error_detail(AUTH_TOKEN_EXPIRED, "Token 无效或已过期，请重新登录"),
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


@router.post("/register", response_model=ApiResponse[AuthSession])
async def register(
    user: RegisterModel,
    request: Request,
    response: Response,
    auth: AuthManager = Depends(get_auth_manager),
):
    device_id = request.cookies.get("device_id") or str(uuid.uuid4())
    user_obj = User(
        username=user.name,
        name=user.name,
        age=0,
        phone=user.phone or "",
        email=user.email,
        password=user.password,
        birth_day="1970-01-01",
        sex=0,
    )
    if not auth.register_user(user_obj):
        return fail(msg="注册失败，账号已存在或数据冲突", code=AUTH_REGISTER_CONFLICT)
    tokens = auth.create_tokens_for_user(str(user_obj.id), device_id)
    rotate_auth_cookies(response, request, auth, tokens, device_id)
    return ok(
        data={
            "id": user_obj.id,
            "refresh_token": tokens.refresh_token,
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
    device_id = request.cookies.get("device_id") or str(uuid.uuid4())
    tokens = auth.authenticate_user(form_data.username or "", form_data.password, device_id)
    if not tokens:
        return fail(msg="用户名或密码错误", code=AUTH_LOGIN_FAILED)
    rotate_auth_cookies(response, request, auth, tokens, device_id)
    return ok(
        data={
            "refresh_token": tokens.refresh_token,
            "refresh_token_expire": tokens.refresh_token_expire.isoformat(),
        },
        msg="登录成功",
    )


@router.post("/reset_password/request", response_model=ApiResponse[None])
async def request_reset_password(
    req: ResetPasswordRequest, auth: AuthManager = Depends(get_auth_manager)
):
    return ok(data=None, msg="重置密码链接已发送")


@router.post("/reset_password", response_model=ApiResponse[None])
async def reset_password(
    req: ResetPasswordModel, auth: AuthManager = Depends(get_auth_manager)
):
    return ok(data=None, msg="密码已重置")


@router.post("/logout", response_model=ApiResponse[None])
async def logout(
    request: Request,
    response: Response,
    current_user: User = Depends(get_current_user),
    auth: AuthManager = Depends(get_auth_manager),
):
    token = request.cookies.get("access_token")
    if not token:
        authorization = request.headers.get("authorization", "")
        if authorization.lower().startswith("bearer "):
            token = authorization[7:].strip()
    if token:
        auth.logout(token, all_devices=False)
    clear_auth_cookies(response)
    return ok(data=None, msg="退出成功")


@router.post("/refresh_token", response_model=ApiResponse[AuthSession])
async def refresh_token(
    request: Request,
    response: Response,
    refresh_token: Optional[str] = Header(None),
    auth: AuthManager = Depends(get_auth_manager),
):
    token = request.cookies.get("refresh_token") or refresh_token
    if not token:
        return fail(msg="未找到 refresh_token", code=AUTH_TOKEN_EXPIRED)
    tokens = auth.refresh_access_token(token)
    if not tokens:
        return fail(msg="刷新 Token 失败", code=AUTH_TOKEN_EXPIRED)
    rotate_auth_cookies(
        response,
        request,
        auth,
        tokens,
        request.cookies.get("device_id", str(uuid.uuid4())),
    )
    return ok(
        data={
            "refresh_token": tokens.refresh_token,
            "refresh_token_expire": tokens.refresh_token_expire.isoformat(),
        },
        msg="Token 刷新成功",
    )


@router.post("/qq", response_model=ApiResponse[None])
async def qq(info: QQModel, auth: AuthManager = Depends(get_auth_manager)):
    logger.info("qq login requested")
    return ok(data=None, msg="qq 登录成功")
