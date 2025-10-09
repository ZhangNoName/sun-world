from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Header, status

from src.type.auth_type import RegisterModel, LoginModel, TokenModel, ResetPasswordRequest, ResetPasswordModel
from src.controller.auth_manager import AuthManager
from src.type.type import ResponseModel
from src.type.user_type import User
from app_instance import app
def get_auth_manager() -> AuthManager:
    auth: Optional[AuthManager] = getattr(app, "auth", None)
    if auth is None:
        raise HTTPException(status_code=500, detail="Auth manager not initialized")
    return auth

def get_current_user(authorization: str = Header(...), auth_manager: AuthManager = Depends(get_auth_manager)):
    token = authorization.replace("Bearer ", "")
    user = auth_manager.get_user_from_token(token)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token无效或已过期")
    return user
router = APIRouter(prefix="/auth", tags=["auth"])

@router.post("/register")
async def register(user: RegisterModel, auth:AuthManager=Depends(get_auth_manager)):
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
        return ResponseModel(code=1, data={"id": user_obj.id}, message="注册成功")
    return ResponseModel(code=0, data=None, message="注册失败")

@router.post("/login", response_model=ResponseModel)
async def login(form_data: LoginModel, auth:AuthManager=Depends(get_auth_manager)):
    tokens = auth.authenticate_user(
        form_data.username,
        form_data.password,
        form_data.device_id
    )
    if not tokens:
        return ResponseModel(code=0, data=None, message="用户名或密码错误")
    
    return ResponseModel[TokenModel](code=1, data=tokens, message="登录成功")
@router.post("/reset_password/request")
async def request_reset_password(req: ResetPasswordRequest,  auth:AuthManager=Depends(get_auth_manager)):
    # TODO: 发送验证码或邮件
    return ResponseModel(code=1, data=None, message="重置密码链接已发送")

@router.post("/reset_password")
async def reset_password(req: ResetPasswordModel,  auth:AuthManager=Depends(get_auth_manager)):
    # TODO: 校验token并重置密码
    return ResponseModel(code=1, data=None, message="密码已重置")

@router.post("/logout")
async def logout(current_user: User = Depends(get_current_user)):
    # TODO: 可选实现 token 黑名单
    return ResponseModel(code=1, data=None, message="登出成功")

@router.post("/refresh_token")
async def refresh_token(
    refresh_token: str = Header(...),
    auth: AuthManager = Depends(get_auth_manager)
):
    tokens = auth.refresh_access_token(refresh_token)
    if not tokens:
        return ResponseModel(code=0, data=None, message="刷新Token失败")
    return ResponseModel[TokenModel](code=1, data=tokens, message="Token刷新成功")