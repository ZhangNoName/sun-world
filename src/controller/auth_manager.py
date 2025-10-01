from datetime import datetime, timedelta
from typing import Optional
import hashlib
import jwt
from loguru import logger
from src.controller.user_manage import UserManager
from src.type.auth_type import TokenModel
from src.type.user_type import User

SECRET_KEY = "b9WqXgK9Oq1wZtR3JpN4HcFv6uL2YsVq5D8Qn0TfGzA"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30
REFRESH_TOKEN_EXPIRE_DAYS = 7

class AuthManager:
    def __init__(self, user_manager: UserManager, enable_permission: bool = False):
        self.user_manager = user_manager
        self.enable_permission = enable_permission

    def hash_password(self, password: str) -> str:
        return hashlib.sha256(password.encode()).hexdigest()

    def verify_password(self, plain_password: str, hashed_password: str) -> bool:
        return self.hash_password(plain_password) == hashed_password

    def _create_tokens(self, user_id: str) -> TokenModel:
        """内部方法，生成 access_token 和 refresh_token 并返回 TokenModel"""
        now = datetime.utcnow()
        access_exp = now + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        refresh_exp = now + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)

        access_token = jwt.encode({"sub": str(user_id), "exp": access_exp.timestamp()},
                                  SECRET_KEY, algorithm=ALGORITHM)
        refresh_token = jwt.encode({"sub": str(user_id), "exp": refresh_exp.timestamp()},
                                   SECRET_KEY, algorithm=ALGORITHM)

        return TokenModel(
            access_token=access_token,
            refresh_token=refresh_token,
            access_token_expire=access_exp,
            refresh_token_expire=refresh_exp
        )

    def register_user(self, user: User) -> bool:
        """注册用户"""
        user.password = self.hash_password(user.password)
        return self.user_manager.create_user(user)

    def authenticate_user(self, username_or_email_or_phone: str, password: str) -> Optional[TokenModel]:
        """验证用户名/邮箱/手机号 + 密码，并返回 TokenModel"""
        users = self.user_manager.get_user_by_email(username_or_email_or_phone)
        if not users:
            return None

        user = users[0]
        if not self.verify_password(password, user.password):
            return None
        if not user.status:
            return None

        return self._create_tokens(str(user.id))

    def refresh_access_token(self, refresh_token: str) -> Optional[TokenModel]:
        """使用 refresh_token 刷新 access_token"""
        try:
            payload = jwt.decode(refresh_token, SECRET_KEY, algorithms=[ALGORITHM])
            user_id = payload.get("sub")
            if not user_id:
                return None
            # 可以在这里检查用户是否仍然有效
            user = self.user_manager.get_user_by_id(user_id)
            if not user or not user.status:
                return None
            return self._create_tokens(str(user_id))
        except Exception as e:
            logger.error(f"刷新 token 失败: {e}")
            return None
