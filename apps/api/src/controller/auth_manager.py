import base64
from datetime import datetime, timedelta, timezone
import hmac
from typing import Optional
import hashlib
import secrets
import os
import uuid
from jose import jwt
from jose.exceptions import ExpiredSignatureError, JWTError
from loguru import logger
from src.controller.user_manage import UserManager
from src.core.runtime_env import is_local_runtime
from src.database.redis.redis_manage import RedisManager
from src.type.auth_type import (
    TokenModel,
    normalize_login_identifier,
    normalize_username,
)
from src.type.user_type import User

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30  # 默认值
REFRESH_TOKEN_EXPIRE_DAYS = 7  # 默认值
PASSWORD_HASH_ALGORITHM = "pbkdf2_sha256"
PASSWORD_HASH_ITERATIONS = 390000
MAX_SESSION_TOKEN_LENGTH = 4096
MAX_USER_ID_LENGTH = 20
DEVICE_ID_LENGTH = 36


class AuthManager:
    def __init__(self, user_manager: UserManager, db: RedisManager, enable_permission: bool = False,
                 access_token_expire_minutes: int = None, refresh_token_expire_days: int = None,
                 secret_key: str = None, refresh_reuse_grace_seconds: int | None = None):
        if not secret_key:
            raise ValueError("AuthManager requires a non-empty JWT secret key")
        self.user_manager = user_manager
        self.db = db
        self.enable_permission = enable_permission
        self.access_token_expire_minutes = access_token_expire_minutes or ACCESS_TOKEN_EXPIRE_MINUTES
        self.refresh_token_expire_days = refresh_token_expire_days or REFRESH_TOKEN_EXPIRE_DAYS
        self.secret_key = secret_key
        configured_grace = (
            refresh_reuse_grace_seconds
            if refresh_reuse_grace_seconds is not None
            else int(os.getenv("AUTH_REFRESH_REUSE_GRACE_SECONDS", "0"))
        )
        if configured_grace < 0 or configured_grace > 10:
            raise ValueError(
                "AUTH_REFRESH_REUSE_GRACE_SECONDS must be between 0 and 10"
            )
        if configured_grace != 0 and not is_local_runtime():
            raise ValueError(
                "AUTH_REFRESH_REUSE_GRACE_SECONDS must be 0 outside local runtime"
            )
        self.refresh_reuse_grace_seconds = configured_grace
        self._dummy_password_hash = self.hash_password(secrets.token_urlsafe(32))

    @staticmethod
    def _validated_user_id(value: object) -> str | None:
        if isinstance(value, bool):
            return None
        text = str(value) if isinstance(value, (str, int)) else ""
        if not text or len(text) > MAX_USER_ID_LENGTH or not text.isascii():
            return None
        if not text.isdigit() or text.startswith("0"):
            return None
        try:
            numeric = int(text)
        except ValueError:
            return None
        if numeric < 1 or numeric > 9_223_372_036_854_775_807:
            return None
        return str(numeric)

    @staticmethod
    def validated_device_id(value: object) -> str | None:
        """Return a canonical token-bound UUIDv4 device identifier."""
        if not isinstance(value, str) or len(value) != DEVICE_ID_LENGTH:
            return None
        try:
            parsed = uuid.UUID(value)
        except (AttributeError, TypeError, ValueError):
            return None
        if parsed.version != 4 or str(parsed) != value:
            return None
        return value

    @classmethod
    def resolve_session_device_id(cls, candidate: object) -> str:
        """Keep a valid browser device UUID or replace untrusted input."""
        return cls.validated_device_id(candidate) or str(uuid.uuid4())

    def _decode_refresh_token(
        self,
        refresh_token: object,
    ) -> tuple[dict, str, str] | None:
        if (
            not isinstance(refresh_token, str)
            or not refresh_token
            or len(refresh_token) > MAX_SESSION_TOKEN_LENGTH
        ):
            return None
        try:
            payload = jwt.decode(
                refresh_token,
                self.secret_key,
                algorithms=[ALGORITHM],
            )
        except (ExpiredSignatureError, JWTError, TypeError, ValueError):
            return None
        if payload.get("typ") != "refresh":
            return None
        user_id = self._validated_user_id(payload.get("sub"))
        device_id = self.validated_device_id(payload.get("device"))
        if user_id is None or device_id is None:
            return None
        return payload, user_id, device_id

    def get_refresh_token_context(
        self,
        refresh_token: object,
    ) -> tuple[str, str] | None:
        """Verify a refresh JWT and return its bounded (user, device) claims."""
        decoded = self._decode_refresh_token(refresh_token)
        if decoded is None:
            return None
        _payload, user_id, device_id = decoded
        return user_id, device_id

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

    def _build_tokens(
        self,
        user_id: str,
        device_id: str,
        *,
        session_family_id: str | None = None,
        auth_time: int | None = None,
    ) -> TokenModel:
        """Build a token pair without mutating the active Redis session."""
        now = datetime.now(timezone.utc)

        access_exp = now + timedelta(minutes=self.access_token_expire_minutes)
        refresh_exp = now + timedelta(days=self.refresh_token_expire_days)

        issued_at = int(now.timestamp())
        common_payload = {
            "sub": str(user_id),
            "device": device_id,
            "sid": session_family_id or secrets.token_urlsafe(16),
            "iat": issued_at,
            # Initial credential proof time is preserved across refreshes and
            # gates linking additional login factors.
            "auth_time": issued_at if auth_time is None else int(auth_time),
        }

        access_token = jwt.encode(
            {
                **common_payload,
                "typ": "access",
                "jti": secrets.token_urlsafe(16),
                "exp": int(access_exp.timestamp()),
            },
            self.secret_key,
            algorithm=ALGORITHM
        )
        refresh_token = jwt.encode(
            {
                **common_payload,
                "typ": "refresh",
                "jti": secrets.token_urlsafe(16),
                "exp": int(refresh_exp.timestamp()),
            },
            self.secret_key,
            algorithm=ALGORITHM
        )

        return TokenModel(
            access_token=access_token,
            refresh_token=refresh_token,
            access_token_expire=access_exp,
            refresh_token_expire=refresh_exp
        )

    def _store_tokens(
        self,
        user_id: str,
        device_id: str,
        session_family_id: str,
        tokens: TokenModel,
    ) -> None:
        """Persist a newly-created session that has no predecessor."""
        now = datetime.now(timezone.utc)
        self.db.store_session_tokens(
            user_id=user_id,
            device_id=device_id,
            session_family_id=session_family_id,
            access_token=tokens.access_token,
            refresh_token=tokens.refresh_token,
            access_ttl=max(1, int((tokens.access_token_expire - now).total_seconds())),
            refresh_ttl=max(1, int((tokens.refresh_token_expire - now).total_seconds())),
        )

    def _create_tokens(self, user_id: str, device_id: str) -> TokenModel:
        """Generate and store an initial access/refresh token pair."""
        user_id = self._validated_user_id(user_id) or ""
        if not user_id:
            raise ValueError("user_id must be a positive 64-bit integer")
        device_id = self.resolve_session_device_id(device_id)
        session_family_id = secrets.token_urlsafe(16)
        tokens = self._build_tokens(
            user_id,
            device_id,
            session_family_id=session_family_id,
        )
        self._store_tokens(user_id, device_id, session_family_id, tokens)
        return tokens

    def create_tokens_for_user(self, user_id: str, device_id: str) -> TokenModel:
        """为指定用户创建 token（公共方法）"""
        return self._create_tokens(str(user_id), device_id)

    def register_user(self, user: User) -> bool:
        """注册用户"""
        try:
            user.username = normalize_username(user.username or user.name)
        except ValueError:
            return False
        identifiers = {
            user.username,
            str(user.email or '').strip(),
            str(user.phone or '').strip(),
        }
        for identifier in identifiers:
            if identifier and self.user_manager.get_user_by_login_identifier(identifier):
                return False
        user.password = self.hash_password(user.password)
        return self.user_manager.create_user(user)

    def authenticate_user(self, username_or_email_or_phone: str, password: str, device_id: str) -> Optional[TokenModel]:
        """验证用户身份并生成 token"""
        try:
            login_identifier = normalize_login_identifier(username_or_email_or_phone)
        except ValueError:
            self.verify_password(password, self._dummy_password_hash)
            return None
        users = self.user_manager.get_user_by_login_identifier(
            login_identifier
        )
        if not users:
            # Keep unknown-account login work close to a real password check so
            # timing and account-enumeration signals stay bounded.
            self.verify_password(password, self._dummy_password_hash)
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
            decoded = self._decode_refresh_token(refresh_token)
            if decoded is None:
                return None
            payload, user_id, device_id = decoded

            user = self.user_manager.get_user_by_id(user_id)
            user_status = (
                user.get("status")
                if isinstance(user, dict)
                else getattr(user, "status", None)
            )
            if not user or not user_status:
                return None

            session_family_id = (
                payload.get("sid")
                or payload.get("jti")
                or (
                    "legacy_"
                    + hashlib.sha256(refresh_token.encode("utf-8")).hexdigest()
                )
            )
            tokens = self._build_tokens(
                str(user_id),
                device_id,
                session_family_id=session_family_id,
                auth_time=payload.get("auth_time", 0),
            )
            now = datetime.now(timezone.utc)
            rotation_status = self.db.rotate_session_tokens(
                user_id=str(user_id),
                device_id=device_id,
                expected_refresh_token=refresh_token,
                new_access_token=tokens.access_token,
                new_refresh_token=tokens.refresh_token,
                access_ttl=max(
                    1,
                    int((tokens.access_token_expire - now).total_seconds()),
                ),
                refresh_ttl=max(
                    1,
                    int((tokens.refresh_token_expire - now).total_seconds()),
                ),
                used_refresh_key=(
                    "auth:used_refresh:"
                    + hashlib.sha256(refresh_token.encode("utf-8")).hexdigest()
                ),
                session_family_id=session_family_id,
                revoked_session_key=f"auth:revoked_session:{session_family_id}",
                reuse_grace_seconds=self.refresh_reuse_grace_seconds,
            )
            if rotation_status == 3:
                return self._active_session_tokens(
                    str(user_id),
                    device_id,
                    session_family_id,
                )
            if rotation_status != 1:
                if rotation_status == 2:
                    logger.warning(
                        "Refresh token reuse revoked session for user_id={} device_id={}",
                        user_id,
                        device_id,
                    )
                return None
            return tokens
        except Exception as e:
            logger.error(f"刷新 token 失败: {e}")
            return None

    def _active_session_tokens(
        self,
        user_id: str,
        device_id: str,
        session_family_id: str,
    ) -> TokenModel | None:
        """Load the successor for a duplicate refresh inside the short grace."""
        snapshot = self.db.get_session_token_snapshot(
            user_id=user_id,
            device_id=device_id,
        )
        if snapshot is None:
            return None
        access_token, refresh_token, active_session_family_id = snapshot
        if active_session_family_id != session_family_id:
            return None
        try:
            access_payload = jwt.decode(
                access_token,
                self.secret_key,
                algorithms=[ALGORITHM],
            )
            refresh_payload = jwt.decode(
                refresh_token,
                self.secret_key,
                algorithms=[ALGORITHM],
            )
            if (
                access_payload.get("typ") != "access"
                or refresh_payload.get("typ") != "refresh"
                or access_payload.get("sub") != user_id
                or refresh_payload.get("sub") != user_id
                or access_payload.get("device") != device_id
                or refresh_payload.get("device") != device_id
                or access_payload.get("sid") != session_family_id
                or refresh_payload.get("sid") != session_family_id
            ):
                return None
            return TokenModel(
                access_token=access_token,
                refresh_token=refresh_token,
                access_token_expire=datetime.fromtimestamp(
                    int(access_payload["exp"]), timezone.utc
                ),
                refresh_token_expire=datetime.fromtimestamp(
                    int(refresh_payload["exp"]), timezone.utc
                ),
            )
        except (JWTError, KeyError, TypeError, ValueError, OSError):
            return None

    def verify_token(self, token: str, token_type: str = "access", check_redis: bool = True) -> Optional[str]:
        """
        校验 token 是否有效

        Args:
            token: JWT token
            token_type: token 类型 ("access" 或 "refresh")
            check_redis: 是否检查 Redis 中的 token（对于 access_token，可以设为 False 以提高性能）
        """
        if (
            not isinstance(token, str)
            or not token
            or len(token) > MAX_SESSION_TOKEN_LENGTH
        ):
            return None
        try:
            payload = jwt.decode(token, self.secret_key, algorithms=[ALGORITHM])
            user_id = self._validated_user_id(payload.get("sub"))
            device_id = self.validated_device_id(payload.get("device"))
            logger.debug(f"Token payload verified for user_id={user_id}")
            if (
                not user_id
                or not device_id
                or payload.get("typ") != token_type
            ):
                logger.warning(
                    f"Token missing user_id or device_id: user_id={user_id}, device_id={device_id}")
                return None

            # 黑名单检查
            if (check_redis or token_type == "refresh") and self.is_token_blacklisted(token):
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
        except ExpiredSignatureError as e:
            logger.warning(f"Token expired: {e}")
            return None
        except JWTError as e:
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

    def get_token_expiry(
        self,
        token: str,
        token_type: str,
        *,
        check_redis: bool = True,
    ) -> datetime | None:
        """Return the signed active token expiry without exposing the token."""
        if not token or not self.verify_token(
            token,
            token_type,
            check_redis=check_redis,
        ):
            return None
        try:
            payload = jwt.decode(token, self.secret_key, algorithms=[ALGORITHM])
            return datetime.fromtimestamp(int(payload["exp"]), timezone.utc)
        except (JWTError, KeyError, TypeError, ValueError, OSError):
            return None

    def get_recent_session_context(
        self,
        access_token: str,
        *,
        max_age_seconds: int,
    ) -> tuple[int, str] | None:
        """Return (user_id, session family) after a recent primary login."""
        if not access_token or not self.verify_token(
            access_token,
            "access",
            check_redis=True,
        ):
            return None
        try:
            payload = jwt.decode(
                access_token,
                self.secret_key,
                algorithms=[ALGORITHM],
            )
            user_id = int(payload["sub"])
            session_family_id = str(payload["sid"])
            auth_time = int(payload["auth_time"])
            now = int(datetime.now(timezone.utc).timestamp())
        except (JWTError, KeyError, TypeError, ValueError, OSError):
            return None
        if (
            user_id <= 0
            or not session_family_id
            or auth_time > now + 60
            or now - auth_time > max(1, int(max_age_seconds))
        ):
            return None
        return user_id, session_family_id

    def logout(self, token: str, all_devices: bool = False) -> bool:
        """退出登录：单设备 or 所有设备"""
        if (
            not isinstance(token, str)
            or not token
            or len(token) > MAX_SESSION_TOKEN_LENGTH
        ):
            return False
        try:
            # Logout must be able to clear an expired browser session without
            # refreshing it first. Signature and token shape are still
            # verified; only the expiry check is disabled for revocation.
            payload = jwt.decode(
                token,
                self.secret_key,
                algorithms=[ALGORITHM],
                options={"verify_exp": False},
            )
            user_id = self._validated_user_id(payload.get("sub"))
            device_id = self.validated_device_id(payload.get("device"))
            token_type = payload.get("typ")
            session_family_id = (
                payload.get("sid")
                or payload.get("jti")
                or "legacy_" + hashlib.sha256(token.encode("utf-8")).hexdigest()
            )
            exp = int(payload.get("exp", datetime.now(timezone.utc).timestamp()))
            ttl = exp - int(datetime.now(timezone.utc).timestamp())

            if (
                not user_id
                or not device_id
                or not session_family_id
                or token_type not in {None, "access", "refresh"}
            ):
                return False

            revoked = self.db.revoke_session_tokens(
                user_id=str(user_id),
                device_id=device_id,
                session_family_id=session_family_id,
                candidate_token=token,
                revoked_session_key=f"auth:revoked_session:{session_family_id}",
                session_ttl=self.refresh_token_expire_days * 24 * 60 * 60,
                all_devices=all_devices,
            )
            if revoked != 1:
                return False

            # 加入黑名单，避免 token 还能继续用
            if ttl > 0:
                self.db.setex(self._blacklist_key(token), ttl, "1")

            return True
        except Exception as e:
            logger.error(f"退出登录失败: {e}")
            return False

    def is_token_blacklisted(self, token: str) -> bool:
        """检查 token 是否在黑名单"""
        return self.db.exist(self._blacklist_key(token))

    @staticmethod
    def _blacklist_key(token: str) -> str:
        return "blacklist:" + hashlib.sha256(token.encode("utf-8")).hexdigest()
