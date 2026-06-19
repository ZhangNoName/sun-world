import base64
from datetime import datetime, timedelta, timezone
import hmac
from typing import Optional
import hashlib
import secrets
from jose import JWTError, jwt
from loguru import logger
from src.controller.user_manage import UserManager
from src.database.redis.redis_manage import RedisManager
from src.type.auth_type import TokenModel
from src.type.user_type import User

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30000  # 默认值
REFRESH_TOKEN_EXPIRE_DAYS = 7  # 默认值
PASSWORD_HASH_ALGORITHM = "pbkdf2_sha256"
PASSWORD_HASH_ITERATIONS = 390000


class AuthManager:
    def __init__(self, user_manager: UserManager, db: RedisManager, enable_permission: bool = False,
                 access_token_expire_minutes: int = None, refresh_token_expire_days: int = None,
                 secret_key: str = None):
        if not secret_key:
            raise ValueError("AuthManager requires a non-empty JWT secret key")
        self.user_manager = user_manager
        self.db = db
        self.enable_permission = enable_permission
        self.access_token_expire_minutes = access_token_expire_minutes or ACCESS_TOKEN_EXPIRE_MINUTES
        self.refresh_token_expire_days = refresh_token_expire_days or REFRESH_TOKEN_EXPIRE_DAYS
        self.secret_key = secret_key

    def hash_password(self, password: str) -> str:
        salt = secrets.token_bytes(16)
        digest = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            salt,
            PASSWORD_HASH_ITERATIONS,
        )
        salt_text = base64.urlsafe_b64encode(salt).decode("ascii")
        digest_text = base64.urlsafe_b64encode(digest).decode("ascii")
        return f"{PASSWORD_HASH_ALGORITHM}${PASSWORD_HASH_ITERATIONS}${salt_text}${digest_text}"

    def verify_password(self, plain_password: str, hashed_password: str) -> bool:
        if not hashed_password:
            return False

        if hashed_password.startswith(f"{PASSWORD_HASH_ALGORITHM}$"):
            try:
                _, iterations_text, salt_text, digest_text = hashed_password.split("$", 3)
                iterations = int(iterations_text)
                salt = base64.urlsafe_b64decode(salt_text.encode("ascii"))
                expected = base64.urlsafe_b64decode(digest_text.encode("ascii"))
            except (ValueError, TypeError):
                return False

            actual = hashlib.pbkdf2_hmac(
                "sha256",
                plain_password.encode("utf-8"),
                salt,
                iterations,
            )
            return hmac.compare_digest(actual, expected)

        legacy_hash = hashlib.sha256(plain_password.encode()).hexdigest()
        return hmac.compare_digest(legacy_hash, hashed_password)

    def password_needs_rehash(self, hashed_password: str) -> bool:
        return not hashed_password.startswith(f"{PASSWORD_HASH_ALGORITHM}${PASSWORD_HASH_ITERATIONS}$")

    def _create_tokens(self, user_id: str, device_id: str) -> TokenModel:
        """生成 access_token 和 refresh_token，并存入 Redis"""
        now = datetime.now(timezone.utc)

        access_exp = now + timedelta(minutes=self.access_token_expire_minutes)
        refresh_exp = now + timedelta(days=self.refresh_token_expire_days)

        payload = {"sub": str(user_id), "device": device_id}

        access_token = jwt.encode(
            {**payload, "exp": int(access_exp.timestamp())},  # JWT exp 需要整数秒数
            self.secret_key,
            algorithm=ALGORITHM
        )
        refresh_token = jwt.encode(
            {**payload, "exp": int(refresh_exp.timestamp())},  # JWT exp 需要整数秒数
            self.secret_key,
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

    def create_tokens_for_user(self, user_id: str, device_id: str) -> TokenModel:
        """为指定用户创建 token（公共方法）"""
        return self._create_tokens(str(user_id), device_id)

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
        if self.password_needs_rehash(user.password):
            try:
                self.user_manager.update_user(user.id, password=self.hash_password(password))
                logger.info(f"Password hash upgraded for user_id={user.id}")
            except Exception as e:
                logger.warning(f"Password hash upgrade failed for user_id={user.id}: {e}")
        return self._create_tokens(str(user.id), device_id)

    def refresh_access_token(self, refresh_token: str) -> Optional[TokenModel]:
        """使用 refresh_token 刷新 access_token"""
        try:
            payload = jwt.decode(refresh_token, self.secret_key,
                                 algorithms=[ALGORITHM])
            user_id = payload.get("sub")
            device_id = payload.get("device")
            if not user_id or not device_id:
                return None

            # 校验 Redis 中是否有对应的 refresh_token
            stored_token = self.db.hget(
                f"user:{user_id}:refresh_tokens", device_id)
            if stored_token != refresh_token:
                return None

            user = self.user_manager.get_user_by_id(user_id)
            if not user or not user.status:
                return None

            return self._create_tokens(str(user_id), device_id)
        except Exception as e:
            logger.error(f"刷新 token 失败: {e}")
            return None

    def verify_token(self, token: str, token_type: str = "access", check_redis: bool = True) -> Optional[str]:
        """
        校验 token 是否有效

        Args:
            token: JWT token
            token_type: token 类型 ("access" 或 "refresh")
            check_redis: 是否检查 Redis 中的 token（对于 access_token，可以设为 False 以提高性能）
        """
        try:
            payload = jwt.decode(token, self.secret_key, algorithms=[ALGORITHM])
            user_id = payload.get("sub")
            device_id = payload.get("device")
            logger.debug(f"Token payload verified for user_id={user_id}")
            if not user_id or not device_id:
                logger.warning(
                    f"Token missing user_id or device_id: user_id={user_id}, device_id={device_id}")
                return None

            # 黑名单检查
            if self.is_token_blacklisted(token):
                logger.warning(f"Token is blacklisted: {token[:20]}...")
                return None

            # 对于 access_token，可以选择不检查 Redis（因为 JWT 本身有过期时间）
            # 对于 refresh_token，必须检查 Redis 以确保安全性
            if check_redis or token_type == "refresh":
                redis_key = f"user:{user_id}:{token_type}_tokens"
                stored_token = self.db.hget(redis_key, device_id)
                if stored_token != token:
                    logger.warning(
                        f"Token mismatch in Redis: user_id={user_id}, device_id={device_id}")
                    return None

            return user_id
        except jwt.ExpiredSignatureError as e:
            logger.warning(f"Token expired: {e}")
            return None
        except jwt.InvalidTokenError as e:
            logger.warning(f"Invalid token: {e}")
            return None

    def get_user_from_token(self, token: str, check_redis: bool = False) -> Optional[User]:
        """
        从 token 获取用户信息

        Args:
            token: JWT access token
            check_redis: 是否检查 Redis 中的 token（默认 False，只验证 JWT 有效性）
        """
        user_id = self.verify_token(token, "access", check_redis=check_redis)
        if not user_id:
            return None

        user = self.user_manager.get_user_by_id(user_id)
        if not user:
            return None

        # 检查用户状态
        if not user.get('status'):
            logger.warning(f"User {user_id} is disabled")
            return None

        return user

    def logout(self, token: str, all_devices: bool = False) -> bool:
        """退出登录：单设备 or 所有设备"""
        try:
            payload = jwt.decode(token, self.secret_key, algorithms=[ALGORITHM])
            user_id = payload.get("sub")
            device_id = payload.get("device")
            exp = int(payload.get("exp", datetime.now(timezone.utc).timestamp()))
            ttl = exp - int(datetime.now(timezone.utc).timestamp())

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
