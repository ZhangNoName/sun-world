from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
from dataclasses import dataclass
from typing import Callable
from urllib.parse import unquote, urljoin, urlsplit

from starlette.concurrency import run_in_threadpool

from .errors import IdentityDomainError
from .normalization import normalize_email, normalize_phone
from .providers import OAuthProviderRegistry
from .repository import IdentityRepository, VerifiedContactValue
from .schemas import (
    AccountConnections,
    AuthMethodDescriptor,
    ExternalIdentityProfile,
    IdentityResolution,
    IdentitySession,
    OAuthFlow,
    OAuthStart,
    VerificationChallenge,
)
from .verification import VerificationService


OAUTH_STATE_TTL_SECONDS = 600


@dataclass(frozen=True)
class OAuthAttempt:
    provider: str
    state: str
    flow: OAuthFlow
    authorization_url: str


@dataclass(frozen=True)
class OAuthState:
    provider: str
    return_to: str
    redirect_uri: str
    code_verifier: str
    nonce: str
    flow: OAuthFlow
    target_user_id: int | None
    target_session_id: str | None


class IdentityService:
    def __init__(
        self,
        *,
        repository: IdentityRepository,
        auth_manager,
        redis,
        providers: OAuthProviderRegistry,
        verification: VerificationService,
        public_api_origin: str,
        public_web_origin: str,
    ):
        self.repository = repository
        self.auth_manager = auth_manager
        self.redis = redis
        self.providers = providers
        self.verification = verification
        self.public_api_origin = public_api_origin.rstrip("/")
        self.public_web_origin = public_web_origin.rstrip("/")

    def list_methods(self) -> list[AuthMethodDescriptor]:
        methods = [
            AuthMethodDescriptor(
                id="password",
                kind="password",
                label="账号密码",
                enabled=True,
            ),
            AuthMethodDescriptor(
                id="phone",
                kind="verification_code",
                label="手机号",
                enabled=self.verification.deliveries.is_enabled("phone"),
                reason=(
                    None
                    if self.verification.deliveries.is_enabled("phone")
                    else "短信服务尚未配置"
                ),
            ),
            AuthMethodDescriptor(
                id="email",
                kind="verification_code",
                label="邮箱",
                enabled=self.verification.deliveries.is_enabled("email"),
                reason=(
                    None
                    if self.verification.deliveries.is_enabled("email")
                    else "邮件服务尚未配置"
                ),
            ),
        ]
        labels = {"google": "Google", "qq": "QQ", "wechat": "微信"}
        for provider in ("google", "qq", "wechat"):
            enabled = self.providers.is_enabled(provider)
            methods.append(
                AuthMethodDescriptor(
                    id=provider,
                    kind="oauth",
                    label=labels[provider],
                    enabled=enabled,
                    reason=None if enabled else "第三方应用凭据尚未配置",
                )
            )
        return methods

    def normalize_return_to(self, return_to: str | None) -> str:
        candidate = str(return_to or "/aigc")
        decoded_forms = [candidate]
        for _iteration in range(8):
            decoded = unquote(decoded_forms[-1])
            if decoded == decoded_forms[-1]:
                break
            decoded_forms.append(decoded)
        else:
            decoded_forms.append("")

        invalid_form = any(
            not value.startswith("/")
            or value.startswith("//")
            or "\\" in value
            or any(
                character.isspace()
                or ord(character) < 32
                or ord(character) == 127
                for character in value
            )
            or bool(urlsplit(value).scheme)
            or bool(urlsplit(value).netloc)
            for value in decoded_forms
        )
        base = urlsplit(self.public_web_origin)
        target = urlsplit(urljoin(f"{self.public_web_origin}/", candidate))
        try:
            base_origin = (base.scheme.lower(), (base.hostname or "").lower(), base.port)
            target_origin = (
                target.scheme.lower(),
                (target.hostname or "").lower(),
                target.port,
            )
        except ValueError:
            invalid_form = True
            base_origin = ("", "", None)
            target_origin = ("invalid", "", None)
        if (
            invalid_form
            or base.scheme not in {"http", "https"}
            or not base.hostname
            or base.username is not None
            or base.password is not None
            or target.username is not None
            or target.password is not None
            or target_origin != base_origin
        ):
            raise IdentityDomainError(
                "AUTH_RETURN_URL_INVALID",
                "登录返回地址无效。",
                status_code=422,
            )
        return candidate

    def callback_uri(self, provider: str) -> str:
        return f"{self.public_api_origin}/auth/oauth/{provider}/callback"

    @staticmethod
    def _pkce_challenge(verifier: str) -> str:
        digest = hashlib.sha256(verifier.encode("ascii")).digest()
        return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")

    def begin_oauth(
        self,
        provider_name: str,
        return_to: str | None,
        *,
        flow: OAuthFlow = "login",
        target_user_id: int | None = None,
        target_session_id: str | None = None,
    ) -> OAuthAttempt:
        provider = self.providers.get(provider_name)
        safe_return_to = self.normalize_return_to(return_to)
        if flow not in {"login", "connect"}:
            raise IdentityDomainError(
                "AUTH_OAUTH_FLOW_INVALID",
                "不支持的第三方授权流程。",
                status_code=422,
            )
        if flow == "connect":
            if (
                target_user_id is None
                or int(target_user_id) <= 0
                or not target_session_id
            ):
                raise IdentityDomainError(
                    "AUTH_UNAUTHORIZED",
                    "请先登录后再关联第三方身份。",
                    status_code=401,
                )
            bound_user_id: int | None = int(target_user_id)
            bound_session_id: str | None = str(target_session_id)
        else:
            if target_user_id is not None or target_session_id is not None:
                raise IdentityDomainError(
                    "AUTH_OAUTH_FLOW_INVALID",
                    "登录流程不能指定关联账户。",
                    status_code=422,
                )
            bound_user_id = None
            bound_session_id = None
        state = secrets.token_urlsafe(32)
        verifier = secrets.token_urlsafe(64)
        nonce = secrets.token_urlsafe(32)
        redirect_uri = self.callback_uri(provider_name)
        payload = json.dumps(
            {
                "provider": provider_name,
                "return_to": safe_return_to,
                "redirect_uri": redirect_uri,
                "code_verifier": verifier,
                "nonce": nonce,
                "flow": flow,
                "target_user_id": bound_user_id,
                "target_session_id": bound_session_id,
            },
            ensure_ascii=True,
            separators=(",", ":"),
        )
        self.redis.setex(
            f"auth:oauth:state:{state}",
            OAUTH_STATE_TTL_SECONDS,
            payload,
        )
        authorization_url = provider.authorization_url(
            redirect_uri=redirect_uri,
            state=state,
            code_challenge=self._pkce_challenge(verifier),
            nonce=nonce,
        )
        return OAuthAttempt(
            provider=provider_name,
            state=state,
            flow=flow,
            authorization_url=authorization_url,
        )

    @staticmethod
    def _verified_contacts(profile: ExternalIdentityProfile) -> list[VerifiedContactValue]:
        values: list[VerifiedContactValue] = []
        if profile.phone and profile.phone_verified:
            try:
                values.append(("phone", normalize_phone(profile.phone)))
            except IdentityDomainError:
                pass
        if profile.email and profile.email_verified:
            try:
                values.append(("email", normalize_email(profile.email)))
            except IdentityDomainError:
                pass
        return values

    def _unusable_password_hash(self) -> str:
        return self.auth_manager.hash_password(secrets.token_urlsafe(64))

    def consume_oauth_attempt(
        self,
        *,
        provider_name: str,
        state: str,
        state_cookie: str | None,
    ) -> OAuthState:
        if not state_cookie or not hmac.compare_digest(state_cookie, state):
            raise IdentityDomainError(
                "AUTH_OAUTH_STATE_INVALID",
                "登录状态无效或已过期，请重新发起登录。",
                status_code=401,
            )
        raw = self.redis.getdel(f"auth:oauth:state:{state}")
        if not raw:
            raise IdentityDomainError(
                "AUTH_OAUTH_STATE_INVALID",
                "登录状态无效或已过期，请重新发起登录。",
                status_code=401,
            )
        try:
            attempt = json.loads(raw)
        except (TypeError, ValueError, json.JSONDecodeError) as exc:
            raise IdentityDomainError(
                "AUTH_OAUTH_STATE_INVALID",
                "登录状态无效或已过期，请重新发起登录。",
                status_code=401,
            ) from exc
        flow = attempt.get("flow")
        target_user_id = attempt.get("target_user_id")
        target_session_id = attempt.get("target_session_id")
        try:
            parsed_target_user_id = (
                int(target_user_id) if target_user_id is not None else None
            )
        except (TypeError, ValueError) as exc:
            raise IdentityDomainError(
                "AUTH_OAUTH_STATE_INVALID",
                "登录状态无效或已过期，请重新发起登录。",
                status_code=401,
            ) from exc
        if (
            attempt.get("provider") != provider_name
            or attempt.get("redirect_uri") != self.callback_uri(provider_name)
            or not attempt.get("code_verifier")
            or not attempt.get("nonce")
            or flow not in {"login", "connect"}
            or (flow == "connect" and (parsed_target_user_id or 0) <= 0)
            or (flow == "connect" and not target_session_id)
            or (flow == "login" and parsed_target_user_id is not None)
            or (flow == "login" and target_session_id is not None)
        ):
            raise IdentityDomainError(
                "AUTH_OAUTH_STATE_INVALID",
                "登录状态无效或已过期，请重新发起登录。",
                status_code=401,
            )
        return OAuthState(
            provider=provider_name,
            return_to=self.normalize_return_to(attempt.get("return_to")),
            redirect_uri=attempt["redirect_uri"],
            code_verifier=attempt["code_verifier"],
            nonce=attempt["nonce"],
            flow=flow,
            target_user_id=parsed_target_user_id,
            target_session_id=(str(target_session_id) if target_session_id else None),
        )

    async def resolve_oauth_attempt(
        self,
        attempt: OAuthState,
        *,
        code: str,
        connect_guard: Callable[[OAuthState], None] | None = None,
    ) -> IdentityResolution:
        provider = self.providers.get(attempt.provider)
        profile = await provider.exchange(
            code=code,
            redirect_uri=attempt.redirect_uri,
            code_verifier=attempt.code_verifier,
            nonce=attempt.nonce,
        )
        if profile.provider != attempt.provider:
            raise IdentityDomainError(
                "AUTH_OAUTH_PROVIDER_MISMATCH",
                "第三方身份来源校验失败，请重新发起授权。",
                status_code=401,
            )
        return await run_in_threadpool(
            self._persist_oauth_profile,
            attempt,
            profile,
            connect_guard,
        )

    def _persist_oauth_profile(
        self,
        attempt: OAuthState,
        profile: ExternalIdentityProfile,
        connect_guard: Callable[[OAuthState], None] | None,
    ) -> IdentityResolution:
        """Run PBKDF/Redis/MySQL identity persistence outside the event loop."""
        contacts = self._verified_contacts(profile)
        if attempt.flow == "connect":
            if attempt.target_user_id is None:
                raise IdentityDomainError(
                    "AUTH_OAUTH_STATE_INVALID",
                    "登录状态无效或已过期，请重新发起登录。",
                    status_code=401,
                )
            if connect_guard is None:
                raise IdentityDomainError(
                    "AUTH_OAUTH_CONNECT_SESSION_CHANGED",
                    "关联授权缺少当前会话校验，请重新发起授权。",
                    status_code=401,
                )
            # Recheck after the remote exchange, immediately before the
            # persistent identity attach, to close logout/account-switch TOCTOU.
            connect_guard(attempt)
            return self.repository.attach_provider_identity(
                attempt.target_user_id,
                profile,
                contacts,
            )
        return self.repository.resolve_provider_identity(
            profile,
            contacts,
            self._unusable_password_hash,
        )

    async def complete_oauth(
        self,
        *,
        provider_name: str,
        state: str,
        state_cookie: str | None,
        code: str,
        connect_guard: Callable[[OAuthState], None] | None = None,
    ) -> tuple[IdentityResolution, str]:
        attempt = self.consume_oauth_attempt(
            provider_name=provider_name,
            state=state,
            state_cookie=state_cookie,
        )
        resolution = await self.resolve_oauth_attempt(
            attempt,
            code=code,
            connect_guard=connect_guard,
        )
        return resolution, attempt.return_to

    def cancel_oauth(
        self,
        *,
        provider_name: str,
        state: str,
        state_cookie: str | None,
    ) -> str:
        attempt = self.consume_oauth_attempt(
            provider_name=provider_name,
            state=state,
            state_cookie=state_cookie,
        )
        return attempt.return_to

    async def request_verification(
        self,
        *,
        channel: str,
        target: str,
        client_key: str,
        purpose: str = "login",
        target_user_id: int | None = None,
        session_id: str | None = None,
    ) -> VerificationChallenge:
        if channel not in {"phone", "email"}:
            raise IdentityDomainError(
                "AUTH_CONTACT_INVALID",
                "不支持的验证码登录方式。",
                status_code=422,
            )
        return await self.verification.request_challenge(
            channel=channel,
            target=target,
            client_key=client_key,
            purpose=purpose,
            target_user_id=target_user_id,
            session_id=session_id,
        )

    def complete_verification(
        self,
        challenge_id: str,
        code: str,
    ) -> tuple[IdentityResolution, str]:
        kind, value = self.verification.consume_challenge(
            challenge_id,
            code,
            expected_purpose="login",
        )
        return (
            self.repository.resolve_verified_contact(
                kind,
                value,
                self._unusable_password_hash,
            ),
            kind,
        )

    def issue_session(
        self,
        resolution: IdentityResolution,
        *,
        provider: str,
        device_id: str,
    ) -> tuple[IdentitySession, object]:
        tokens = self.auth_manager.create_tokens_for_user(
            str(resolution.user_id),
            device_id,
        )
        session = IdentitySession(
            user_id=resolution.user_id,
            account_created=resolution.account_created,
            linked_by=resolution.linked_by,
            provider=provider,
            access_token_expire=tokens.access_token_expire,
            refresh_token_expire=tokens.refresh_token_expire,
        )
        return session, tokens

    def list_connections(self, user_id: int) -> AccountConnections:
        return self.repository.list_connections(user_id)

    def complete_connection_verification(
        self,
        *,
        user_id: int,
        challenge_id: str,
        code: str,
        session_id: str,
    ) -> AccountConnections:
        kind, value = self.verification.consume_challenge(
            challenge_id,
            code,
            expected_purpose="connect",
            target_user_id=user_id,
            session_id=session_id,
        )
        self.repository.attach_verified_contact(
            user_id,
            kind,
            value,
            "site_otp",
        )
        return self.repository.list_connections(user_id)
