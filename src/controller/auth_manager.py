from datetime import datetime, timedelta
from typing import Optional
import hashlib
import jwt
from loguru import logger
from src.controller.user_manage import UserManager
from src.database.redis.redis_manage import RedisManager
from src.type.auth_type import TokenModel
from src.type.user_type import User

SECRET_KEY = "b9WqXgK9Oq1wZtR3JpN4HcFv6uL2YsVq5D8Qn0TfGzA"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30
REFRESH_TOKEN_EXPIRE_DAYS = 7


class AuthManager:
    def __init__(self, user_manager: UserManager, db: RedisManager, enable_permission: bool = False):
        self.user_manager = user_manager
        self.db = db
        self.enable_permission = enable_permission

    def hash_password(self, password: str) -> str:
        return hashlib.sha256(password.encode()).hexdigest()

    def verify_password(self, plain_password: str, hashed_password: str) -> bool:
        return self.hash_password(plain_password) == hashed_password

    def _create_tokens(self, user_id: str, device_id: str) -> TokenModel:
        """生成 access_token 和 refresh_token，并存入 Redis"""
        now = datetime.utcnow()
        access_exp = now + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        refresh_exp = now + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)

        payload = {"sub": str(user_id), "device": device_id}

        access_token = jwt.encode(
            {**payload, "exp": access_exp.timestamp()},
            SECRET_KEY,
            algorithm=ALGORITHM
        )
        refresh_token = jwt.encode(
            {**payload, "exp": refresh_exp.timestamp()},
            SECRET_KEY,
            algorithm=ALGORITHM
        )

        # Redis 存储，多设备支持（Hash key = user:{id}:tokens）
        self.db.hset(
            name=f"user:{user_id}:access_tokens",
            key=device_id,
            value=access_token,
            ttl=int((access_exp - now).total_seconds())
        )
        self.db.hset(
            name=f"user:{user_id}:refresh_tokens",
            key=device_id,
            value=refresh_token,
            ttl=int((refresh_exp - now).total_seconds())
        )

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

    def authenticate_user(self, username_or_email_or_phone: str, password: str, device_id: str) -> Optional[TokenModel]:
        """验证用户身份并生成 token"""
        users = self.user_manager.get_user_by_email(username_or_email_or_phone)
        if not users:
            return None
        user = users[0]
        if not self.verify_password(password, user.password):
            return None
        if not user.status:
            return None
        return self._create_tokens(str(user.id), device_id)

    def refresh_access_token(self, refresh_token: str) -> Optional[TokenModel]:
        """使用 refresh_token 刷新 access_token"""
        try:
            payload = jwt.decode(refresh_token, SECRET_KEY, algorithms=[ALGORITHM])
            user_id = payload.get("sub")
            device_id = payload.get("device")
            if not user_id or not device_id:
                return None

            # 校验 Redis 中是否有对应的 refresh_token
            stored_token = self.db.hget(f"user:{user_id}:refresh_tokens", device_id)
            if stored_token != refresh_token:
                return None

            user = self.user_manager.get_user_by_id(user_id)
            if not user or not user.status:
                return None

            return self._create_tokens(str(user_id), device_id)
        except Exception as e:
            logger.error(f"刷新 token 失败: {e}")
            return None

    def verify_token(self, token: str, token_type: str = "access") -> Optional[str]:
        """校验 token 是否有效"""
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            user_id = payload.get("sub")
            device_id = payload.get("device")
            if not user_id or not device_id:
                return None

            # 黑名单检查
            if self.is_token_blacklisted(token):
                return None

            # 校验 Redis 中存储的 token
            stored_token = self.db.hget(f"user:{user_id}:{token_type}_tokens", device_id)
            if stored_token != token:
                return None

            return user_id
        except jwt.ExpiredSignatureError:
            return None
        except jwt.InvalidTokenError:
            return None

    def logout(self, token: str, all_devices: bool = False) -> bool:
        """退出登录：单设备 or 所有设备"""
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            user_id = payload.get("sub")
            device_id = payload.get("device")
            exp = int(payload.get("exp", datetime.utcnow().timestamp()))
            ttl = exp - int(datetime.utcnow().timestamp())

            if not user_id or not device_id:
                return False

            if all_devices:
                # 删除用户所有设备的 token
                self.db.delete(f"user:{user_id}:access_tokens")
                self.db.delete(f"user:{user_id}:refresh_tokens")
            else:
                # 删除该设备的 token
                self.db.delete(f"user:{user_id}:access_tokens", device_id)
                self.db.delete(f"user:{user_id}:refresh_tokens", device_id)

            # 加入黑名单，避免 token 还能继续用
            if ttl > 0:
                self.db.setex(f"blacklist:{token}", ttl, "1")

            return True
        except Exception as e:
            logger.error(f"退出登录失败: {e}")
            return False

    def is_token_blacklisted(self, token: str) -> bool:
        """检查 token 是否在黑名单"""
        return self.db.exist(f"blacklist:{token}") 
