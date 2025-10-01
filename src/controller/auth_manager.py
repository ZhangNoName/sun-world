import time
import hashlib
from typing import Optional
from loguru import logger
from datetime import datetime, timedelta
import jwt
from src.controller.user_manage import UserManager
from src.type.user_type import User

SECRET_KEY = "replace_with_your_secret_key"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30
REFRESH_TOKEN_EXPIRE_DAYS = 7


class AuthManager:
    def __init__(self, user_manager: UserManager, enable_permission: bool = False):
        self.user_manager = user_manager
        self.enable_permission = enable_permission  # 权限控制开关

    def hash_password(self, password: str) -> str:
        return hashlib.sha256(password.encode()).hexdigest()

    def verify_password(self, plain_password: str, hashed_password: str) -> bool:
        return self.hash_password(plain_password) == hashed_password

    def create_access_token(self, user_id: str, expires_delta: Optional[timedelta] = None):
        expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
        to_encode = {"sub": str(user_id), "exp": expire.timestamp()}
        return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

    def create_refresh_token(self, user_id: str):
        expire = datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
        to_encode = {"sub": str(user_id), "exp": expire.timestamp()}
        return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

    def register_user(self, user: User):
        user.password = self.hash_password(user.password)
        return self.user_manager.create_user(user)

    def authenticate_user(self, username_or_email_or_phone: str, password: str) -> Optional[User]:
        # 可以根据 username/email/phone 查询
        users = self.user_manager.get_user_by_email(username_or_email_or_phone)
        if not users:
            return None
        user = users[0]
        logger.debug(f"查找到的用户名：{user}")
        if not self.verify_password(password, user['password']):
            return None
        if not user.status:
            return None
        return user

    def get_user_from_token(self, token: str) -> Optional[User]:
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            user_id = payload.get("sub")
            return self.user_manager.get_user_by_id(user_id)
        except Exception as e:
            logger.error(f"Token解析失败: {e}")
            return None
