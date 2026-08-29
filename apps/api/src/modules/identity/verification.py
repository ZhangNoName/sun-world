from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import os
import secrets
import smtplib
import ssl
from dataclasses import dataclass
from email.message import EmailMessage
from typing import Awaitable, Callable, Protocol

import httpx

from .errors import IdentityDomainError
from .normalization import mask_contact, normalize_contact
from .schemas import ContactKind, VerificationChallenge


CHALLENGE_TTL_SECONDS = 300
TARGET_COOLDOWN_SECONDS = 60
CLIENT_COOLDOWN_SECONDS = 10


def _bounded_quota(name: str, default: int, maximum: int) -> int:
    try:
        value = int(os.getenv(name, str(default)))
    except (TypeError, ValueError) as exc:
        raise IdentityDomainError(
            "AUTH_RATE_LIMIT_CONFIGURATION_INVALID",
            "验证码限流配置无效。",
            status_code=503,
        ) from exc
    if value < 1 or value > maximum:
        raise IdentityDomainError(
            "AUTH_RATE_LIMIT_CONFIGURATION_INVALID",
            "验证码限流配置无效。",
            status_code=503,
        )
    return value


class VerificationDelivery(Protocol):
    async def deliver(self, target: str, code: str) -> None: ...


@dataclass(frozen=True)
class SmtpSettings:
    host: str
    port: int
    sender: str
    username: str | None = None
    password: str | None = None
    use_starttls: bool = True


class EmailVerificationDelivery:
    def __init__(self, settings: SmtpSettings):
        self.settings = settings

    def _send(self, target: str, code: str) -> None:
        message = EmailMessage()
        message["Subject"] = "Sun World 登录验证码"
        message["From"] = self.settings.sender
        message["To"] = target
        message.set_content(
            f"你的 Sun World 登录验证码是 {code}。验证码 5 分钟内有效，"
            "请勿向任何人透露。若非本人操作，请忽略此邮件。"
        )
        with smtplib.SMTP(
            self.settings.host,
            self.settings.port,
            timeout=10,
        ) as client:
            client.ehlo()
            if self.settings.use_starttls:
                client.starttls(context=ssl.create_default_context())
                client.ehlo()
            if self.settings.username and self.settings.password:
                client.login(self.settings.username, self.settings.password)
            client.send_message(message)

    async def deliver(self, target: str, code: str) -> None:
        try:
            await asyncio.to_thread(self._send, target, code)
        except (OSError, smtplib.SMTPException) as exc:
            raise IdentityDomainError(
                "AUTH_VERIFICATION_DELIVERY_FAILED",
                "验证码发送失败，请稍后再试。",
                status_code=503,
            ) from exc


class SmsWebhookVerificationDelivery:
    def __init__(self, endpoint: str, token: str | None = None):
        normalized = endpoint.strip()
        if not normalized.startswith("https://"):
            raise ValueError("AUTH_SMS_WEBHOOK_URL must use HTTPS")
        self.endpoint = normalized
        self.token = token

    async def deliver(self, target: str, code: str) -> None:
        headers = {"Authorization": f"Bearer {self.token}"} if self.token else {}
        try:
            async with httpx.AsyncClient(timeout=10, follow_redirects=False) as client:
                response = await client.post(
                    self.endpoint,
                    headers=headers,
                    json={"phone": target, "code": code, "purpose": "login"},
                )
                response.raise_for_status()
        except httpx.HTTPError as exc:
            raise IdentityDomainError(
                "AUTH_VERIFICATION_DELIVERY_FAILED",
                "验证码发送失败，请稍后再试。",
                status_code=503,
            ) from exc


class VerificationDeliveryRegistry:
    def __init__(self, deliveries: dict[str, VerificationDelivery] | None = None):
        self._deliveries = deliveries or {}

    @classmethod
    def from_env(cls) -> "VerificationDeliveryRegistry":
        deliveries: dict[str, VerificationDelivery] = {}
        smtp_host = os.getenv("AUTH_EMAIL_SMTP_HOST", "").strip()
        smtp_sender = os.getenv("AUTH_EMAIL_FROM", "").strip()
        if smtp_host and smtp_sender:
            deliveries["email"] = EmailVerificationDelivery(
                SmtpSettings(
                    host=smtp_host,
                    port=int(os.getenv("AUTH_EMAIL_SMTP_PORT", "587")),
                    sender=smtp_sender,
                    username=os.getenv("AUTH_EMAIL_SMTP_USERNAME") or None,
                    password=os.getenv("AUTH_EMAIL_SMTP_PASSWORD") or None,
                    use_starttls=os.getenv("AUTH_EMAIL_SMTP_STARTTLS", "true").lower()
                    not in {"0", "false", "no"},
                )
            )
        sms_endpoint = os.getenv("AUTH_SMS_WEBHOOK_URL", "").strip()
        if sms_endpoint:
            deliveries["phone"] = SmsWebhookVerificationDelivery(
                sms_endpoint,
                os.getenv("AUTH_SMS_WEBHOOK_TOKEN") or None,
            )
        return cls(deliveries)

    def is_enabled(self, channel: str) -> bool:
        return channel in self._deliveries

    async def deliver(self, channel: str, target: str, code: str) -> None:
        delivery = self._deliveries.get(channel)
        if delivery is None:
            raise IdentityDomainError(
                "AUTH_METHOD_UNAVAILABLE",
                "该验证码登录方式尚未配置。",
                status_code=503,
            )
        await delivery.deliver(target, code)


class VerificationService:
    def __init__(
        self,
        redis,
        deliveries: VerificationDeliveryRegistry,
        pepper: str,
        code_factory: Callable[[], str] | None = None,
    ):
        if not pepper:
            raise ValueError("VerificationService requires a secret pepper")
        self.redis = redis
        self.deliveries = deliveries
        self._pepper = pepper.encode("utf-8")
        self._code_factory = code_factory or (
            lambda: f"{secrets.randbelow(1_000_000):06d}"
        )

    @staticmethod
    def _opaque_hash(value: str) -> str:
        return hashlib.sha256(value.encode("utf-8")).hexdigest()

    def _digest(self, challenge_id: str, code: str) -> str:
        return hmac.new(
            self._pepper,
            f"{challenge_id}:{code}".encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()

    async def request_challenge(
        self,
        *,
        channel: ContactKind,
        target: str,
        client_key: str,
        purpose: str = "login",
        target_user_id: int | None = None,
        session_id: str | None = None,
    ) -> VerificationChallenge:
        normalized = normalize_contact(channel, target)
        if purpose not in {"login", "connect"} or (
            purpose == "connect"
            and ((target_user_id or 0) <= 0 or not session_id)
        ) or (
            purpose == "login"
            and (target_user_id is not None or session_id is not None)
        ):
            raise IdentityDomainError(
                "AUTH_VERIFICATION_PURPOSE_INVALID",
                "验证码用途无效，请重新发起操作。",
                status_code=401,
            )
        if not self.deliveries.is_enabled(channel):
            raise IdentityDomainError(
                "AUTH_METHOD_UNAVAILABLE",
                "该验证码登录方式尚未配置。",
                status_code=503,
            )
        client_hash = self._opaque_hash(client_key or "unknown")
        target_hash = self._opaque_hash(f"{channel}:{normalized}")
        challenge_id = f"verify_{secrets.token_urlsafe(32)}"
        reservation_id = secrets.token_urlsafe(32)
        reservation_name = f"auth:verify:reservation:{challenge_id}"
        cooldowns = [
            (f"auth:verify:client:{client_hash}", CLIENT_COOLDOWN_SECONDS),
            (f"auth:verify:target:{target_hash}", TARGET_COOLDOWN_SECONDS),
        ]
        limits = [
            (
                f"auth:verify:quota:ip:{client_hash}",
                _bounded_quota("AUTH_OTP_IP_HOURLY_LIMIT", 10, 10_000),
                3600,
            ),
            (
                f"auth:verify:quota:target-hour:{target_hash}",
                _bounded_quota("AUTH_OTP_TARGET_HOURLY_LIMIT", 5, 1_000),
                3600,
            ),
            (
                f"auth:verify:quota:target-day:{target_hash}",
                _bounded_quota("AUTH_OTP_TARGET_DAILY_LIMIT", 10, 10_000),
                86_400,
            ),
            (
                "auth:verify:quota:global-hour",
                _bounded_quota("AUTH_OTP_GLOBAL_HOURLY_LIMIT", 1_000, 1_000_000),
                3600,
            ),
        ]
        try:
            allowed, _retry_after = await asyncio.to_thread(
                self.redis.reserve_rate_limits_with_cooldowns,
                reservation_name=reservation_name,
                reservation_id=reservation_id,
                cooldowns=cooldowns,
                limits=limits,
                reservation_ttl=86_400,
            )
        except IdentityDomainError:
            raise
        except Exception as exc:
            raise IdentityDomainError(
                "AUTH_RATE_LIMIT_UNAVAILABLE",
                "验证码保护服务暂不可用，请稍后再试。",
                status_code=503,
            ) from exc
        if not allowed:
            raise IdentityDomainError(
                "AUTH_RATE_LIMITED",
                "请求过于频繁，请稍后再试。",
                status_code=429,
            )
        code = self._code_factory()
        payload = json.dumps(
            {
                "channel": channel,
                "target": normalized,
                "digest": self._digest(challenge_id, code),
                "purpose": purpose,
                "target_user_id": target_user_id,
                "session_id": session_id,
            },
            ensure_ascii=True,
            separators=(",", ":"),
        )
        try:
            await asyncio.to_thread(
                self.redis.setex,
                f"auth:verify:challenge:{challenge_id}",
                CHALLENGE_TTL_SECONDS,
                payload,
            )
            await self.deliveries.deliver(channel, normalized, code)
        except Exception as exc:
            try:
                def cleanup_failed_delivery() -> None:
                    self.redis.delete(f"auth:verify:challenge:{challenge_id}")
                    self.redis.rollback_rate_limit_reservation(
                        reservation_name=reservation_name,
                        reservation_id=reservation_id,
                        # A provider-level delivery failure must not lock the
                        # victim target, but it did consume outbound resources.
                        # Refund only target dimensions; retain client cooldown
                        # plus IP/global attempt budgets to cap deliberate
                        # 4xx/550 destinations and provider-outage amplification.
                        cooldown_names=[cooldowns[1][0]],
                        limit_names=[limits[1][0], limits[2][0]],
                    )

                await asyncio.to_thread(cleanup_failed_delivery)
            except Exception:
                pass
            if isinstance(exc, IdentityDomainError):
                raise
            raise IdentityDomainError(
                "AUTH_RATE_LIMIT_UNAVAILABLE",
                "验证码保护服务暂不可用，请稍后再试。",
                status_code=503,
            ) from exc
        try:
            await asyncio.to_thread(
                self.redis.commit_rate_limit_reservation,
                reservation_name=reservation_name,
                reservation_id=reservation_id,
            )
        except Exception:
            # Cleanup ownership is best-effort after successful delivery. The
            # reservation expires and quota enforcement remains conservative.
            pass
        return VerificationChallenge(
            challenge_id=challenge_id,
            channel=channel,
            target_hint=mask_contact(channel, normalized),
            expires_in=CHALLENGE_TTL_SECONDS,
            resend_after=TARGET_COOLDOWN_SECONDS,
        )

    def consume_challenge(
        self,
        challenge_id: str,
        code: str,
        *,
        expected_purpose: str = "login",
        target_user_id: int | None = None,
        session_id: str | None = None,
    ) -> tuple[ContactKind, str]:
        raw = self.redis.getdel(f"auth:verify:challenge:{challenge_id}")
        if not raw:
            raise IdentityDomainError(
                "AUTH_VERIFICATION_INVALID",
                "验证码无效或已过期，请重新获取。",
                status_code=401,
            )
        try:
            payload = json.loads(raw)
            channel = payload["channel"]
            target = payload["target"]
            expected = payload["digest"]
            purpose = payload["purpose"]
        except (KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
            raise IdentityDomainError(
                "AUTH_VERIFICATION_INVALID",
                "验证码无效或已过期，请重新获取。",
                status_code=401,
            ) from exc
        purpose_matches = purpose == expected_purpose
        binding_matches = (
            expected_purpose == "login"
            and payload.get("target_user_id") is None
            and payload.get("session_id") is None
            and target_user_id is None
            and session_id is None
        ) or (
            expected_purpose == "connect"
            and payload.get("target_user_id") == target_user_id
            and bool(session_id)
            and hmac.compare_digest(str(payload.get("session_id") or ""), str(session_id))
        )
        if (
            channel not in {"phone", "email"}
            or not purpose_matches
            or not binding_matches
            or not hmac.compare_digest(str(expected), self._digest(challenge_id, code))
        ):
            raise IdentityDomainError(
                "AUTH_VERIFICATION_INVALID",
                "验证码无效或已过期，请重新获取。",
                status_code=401,
            )
        return channel, str(target)
