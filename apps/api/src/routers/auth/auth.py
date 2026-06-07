from datetime import datetime, timedelta, timezone
from typing import Optional
import uuid
import os
from fastapi import APIRouter, Depends, HTTPException, Header, status, Request, Response
from loguru import logger

from src.type.auth_type import AuthSession, QQModel, RegisterModel, LoginModel, TokenModel, ResetPasswordRequest, ResetPasswordModel
from src.controller.auth_manager import AuthManager
from src.core.response import ok, fail
from src.core.response import ApiResponse
from src.core.error_codes import AUTH_LOGIN_FAILED, AUTH_REGISTER_CONFLICT, AUTH_TOKEN_EXPIRED
from src.type.user_type import User
from src.util.func import get_seconds_until_expiry
from app_instance import app


def get_cookie_settings(request: Request):
    """根据环境和请求 origin 获取 cookie 设置"""
    env = os.getenv('ENV', 'local')

    # 从配置读取 cookie 设置
    auth_config = getattr(app, 'config', {}).get('auth', {})
    cookie_secure = auth_config.get('cookie_secure', None)
    cookie_samesite = auth_config.get('cookie_samesite', None)

    # 如果配置文件中明确指定了，使用配置的值
    if cookie_secure is not None and cookie_samesite:
        return {
            'secure': cookie_secure,
            'samesite': cookie_samesite
        }

    # 否则根据环境和请求自动判断
    origin = request.headers.get('origin', '')

    # 检查是否是跨站请求（不同端口也算跨站）
    is_cross_site = False
    if origin:
        try:
            from urllib.parse import urlparse
            parsed = urlparse(origin)
            origin_host = parsed.hostname
            origin_port = parsed.port or (
                443 if parsed.scheme == 'https' else 80)

            # 获取当前请求的 host
            host_header = request.headers.get('host', '')
            if ':' in host_header:
                current_host, current_port = host_header.split(':')
                current_port = int(current_port)
            else:
                current_host = host_header
                current_port = 80 if request.url.scheme == 'http' else 443

            # 如果 host 不同或 port 不同，认为是跨站
            if origin_host != current_host or origin_port != current_port:
                is_cross_site = True
        except Exception:
            # 如果无法解析，假设是跨站
            is_cross_site = True

    # 对于本地开发
    if env == 'local':
        # 如果是跨站请求，尝试使用 none + secure=False
        # 注意：Chrome 较新版本可能不允许，建议使用 HTTPS
        if is_cross_site:
            return {
                'secure': False,
                'samesite': 'none'
            }
        else:
            return {
                'secure': False,
                'samesite': 'lax'
            }
    else:
        # 生产环境：必须使用 none + secure=True（需要 HTTPS）
        return {
            'secure': True,
            'samesite': 'none'
        }


def get_auth_manager() -> AuthManager:
    auth: Optional[AuthManager] = getattr(app, "auth", None)
    if auth is None:
        raise HTTPException(
            status_code=500, detail="Auth manager not initialized")
    return auth


def get_current_user(
    request: Request,
    response: Response,
    auth_manager: AuthManager = Depends(get_auth_manager)
):
    """
    从 cookie 或 Authorization header 获取当前用户
    优先从 cookie 中读取 access_token，如果过期则尝试使用 refresh_token 自动刷新
    """
    # 优先从 cookie 获取 access_token
    access_token = request.cookies.get("access_token")

    if not access_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="未找到 token，请先登录"
        )

    # 尝试使用 access_token 获取用户
    user = auth_manager.get_user_from_token(access_token, check_redis=False)

    # 如果 access_token 过期，尝试使用 refresh_token 自动刷新
    if not user:
        refresh_token = request.cookies.get("refresh_token")
        if refresh_token:
            logger.info(
                "Access token expired, attempting to refresh using refresh_token")
            new_tokens = auth_manager.refresh_access_token(refresh_token)
            if new_tokens:
                # 更新 cookie 中的 access_token
                cookie_settings = get_cookie_settings(request)
                response.set_cookie(
                    key="access_token",
                    value=new_tokens.access_token,
                    httponly=True,
                    secure=cookie_settings['secure'],
                    samesite=cookie_settings['samesite'],
                    max_age=auth_manager.access_token_expire_minutes * 60
                )
                # 使用新的 access_token 获取用户
                user = auth_manager.get_user_from_token(
                    new_tokens.access_token, check_redis=False)
                logger.info(
                    f"Token refreshed successfully, user: {user is not None}")

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token无效或已过期，请重新登录"
        )

    return user


router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=ApiResponse[AuthSession])
async def register(user: RegisterModel, request: Request, response: Response, auth: AuthManager = Depends(get_auth_manager)):
    # 从 cookie 获取 device_id，如果没有则生成新的
    device_id = request.cookies.get("device_id") or str(uuid.uuid4())

    user_obj = User(
        username=user.name,
        name=user.name,
        age=0,
        phone=user.phone or "",
        email=user.email,
        password=user.password,
        birth_day="1970-01-01",
        sex=0
    )
    res = auth.register_user(user_obj)
    if res:
        # 注册成功后自动登录，生成 token
        tokens = auth.create_tokens_for_user(str(user_obj.id), device_id)

        # 设置 cookie
        refresh_expire_seconds = get_seconds_until_expiry(
            tokens.refresh_token_expire)
        cookie_settings = get_cookie_settings(request)
        response.set_cookie(
            key="access_token",
            value=tokens.access_token,
            samesite="none",  # 允许跨域发送 Cookie
            secure=True,      # samesite=none 必须配合 secure=False
            httponly=True,
            max_age=auth.access_token_expire_minutes * 60
        )

        response.set_cookie(
            key="device_id",
            value=device_id,
            # samesite="lax",  # 允许跨域发送 Cookie
            secure=False,      # samesite=none 必须配合 secure=False
            httponly=True,
            max_age=refresh_expire_seconds,

        )

        return ok(
            data={
                "id": user_obj.id,
                "refresh_token": tokens.refresh_token,
                "refresh_token_expire": tokens.refresh_token_expire.isoformat()
            },
            msg="注册成功"
        )
    return fail(msg="注册失败", code=AUTH_REGISTER_CONFLICT)


@router.post("/login", response_model=ApiResponse[AuthSession])
async def login(form_data: LoginModel, request: Request, response: Response, auth: AuthManager = Depends(get_auth_manager)):
    # 优先从 cookie 获取 device_id，如果没有则生成新的
    device_id = request.cookies.get("device_id") or str(uuid.uuid4())

    tokens = auth.authenticate_user(
        form_data.username,
        form_data.password,
        device_id
    )
    if not tokens:
        return fail(msg="用户名或密码错误", code=AUTH_LOGIN_FAILED)

    # 设置 cookie
    refresh_expire_seconds = get_seconds_until_expiry(
        tokens.refresh_token_expire)
    cookie_settings = get_cookie_settings(request)
    response.set_cookie(
        key="access_token",
        value=tokens.access_token,
        httponly=True,
        secure=cookie_settings['secure'],
        samesite=cookie_settings['samesite'],
        max_age=auth.access_token_expire_minutes * 60
    )

    response.set_cookie(
        key="device_id",
        value=device_id,
        httponly=False,  # device_id 可能需要前端访问
        secure=cookie_settings['secure'],
        samesite=cookie_settings['samesite'],
        max_age=refresh_expire_seconds
    )

    return ok(
        data={
            "refresh_token": tokens.refresh_token,
            "refresh_token_expire": tokens.refresh_token_expire.isoformat()
        },
        msg="登录成功"
    )


@router.post("/reset_password/request", response_model=ApiResponse[None])
async def request_reset_password(req: ResetPasswordRequest,  auth: AuthManager = Depends(get_auth_manager)):
    # TODO: 发送验证码或邮件
    return ok(data=None, msg="重置密码链接已发送")


@router.post("/reset_password", response_model=ApiResponse[None])
async def reset_password(req: ResetPasswordModel,  auth: AuthManager = Depends(get_auth_manager)):
    # TODO: 校验token并重置密码
    return ok(data=None, msg="密码已重置")


@router.post("/logout", response_model=ApiResponse[None])
async def logout(
    request: Request,
    response: Response,
    current_user: User = Depends(get_current_user),
    auth: AuthManager = Depends(get_auth_manager)
):
    """登出：从 cookie 或 header 获取 token 并加入黑名单"""
    # 优先从 cookie 获取 token
    token = request.cookies.get("access_token")

    # 如果 cookie 中没有，尝试从 Authorization header 获取
    if not token:
        authorization = request.headers.get("authorization", "")
        if authorization:
            token = authorization.replace("Bearer ", "")

    if token:
        # 将 token 加入黑名单
        auth.logout(token, all_devices=False)

    # 清除 cookie
    response.delete_cookie(key="access_token")
    response.delete_cookie(key="refresh_token")
    response.delete_cookie(key="device_id")

    return ok(data=None, msg="登出成功")


@router.post("/refresh_token", response_model=ApiResponse[AuthSession])
async def refresh_token(
    request: Request,
    response: Response,
    refresh_token: Optional[str] = Header(None),
    auth: AuthManager = Depends(get_auth_manager)
):
    """
    刷新 access_token
    优先从 cookie 中读取 refresh_token，如果没有则从 header 读取
    """
    # 优先从 cookie 获取 refresh_token
    token = request.cookies.get("refresh_token")

    # 如果 cookie 中没有，尝试从 header 获取
    if not token and refresh_token:
        token = refresh_token

    if not token:
        return fail(msg="未找到 refresh_token", code=AUTH_TOKEN_EXPIRED)

    tokens = auth.refresh_access_token(token)
    if not tokens:
        return fail(msg="刷新Token失败", code=AUTH_TOKEN_EXPIRED)

    # 更新 cookie 中的 access_token
    cookie_settings = get_cookie_settings(request)
    response.set_cookie(
        key="access_token",
        value=tokens.access_token,
        httponly=True,
        secure=cookie_settings['secure'],
        samesite=cookie_settings['samesite'],
        max_age=auth.access_token_expire_minutes * 60
    )

    return ok(
        data={
            "refresh_token": tokens.refresh_token,
            "refresh_token_expire": tokens.refresh_token_expire.isoformat()
        },
        msg="Token刷新成功"
    )


@router.post("/qq", response_model=ApiResponse[None])
async def qq(info: QQModel, auth: AuthManager = Depends(get_auth_manager)):
    logger.info(f"qq登录: {info}")
    return ok(data=None, msg="qq成功")
