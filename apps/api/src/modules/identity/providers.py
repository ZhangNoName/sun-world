from __future__ import annotations

import hmac
import json
import os
import re
from dataclasses import dataclass
from typing import Callable
from urllib.parse import parse_qs, urlencode

import httpx
from jose import jwt
from jose.exceptions import JWTError

from .errors import IdentityDomainError
from .schemas import ExternalIdentityProfile, OAuthProviderName


HTTP_CONNECT_TIMEOUT_SECONDS = 5.0
HTTP_READ_TIMEOUT_SECONDS = 10.0
HTTP_WRITE_TIMEOUT_SECONDS = 10.0
HTTP_POOL_TIMEOUT_SECONDS = 5.0

TOKEN_RESPONSE_MAX_BYTES = 64 * 1024
JWKS_RESPONSE_MAX_BYTES = 512 * 1024
USERINFO_RESPONSE_MAX_BYTES = 256 * 1024


@dataclass(frozen=True)
class OAuthClientConfig:
    client_id: str
    client_secret: str


class OAuthProvider:
    name: OAuthProviderName

    def __init__(
        self,
        config: OAuthClientConfig,
        client_factory: Callable[[], httpx.AsyncClient] | None = None,
    ):
        self.config = config
        self._client_factory = client_factory or (
            lambda: httpx.AsyncClient(
                timeout=httpx.Timeout(
                    connect=HTTP_CONNECT_TIMEOUT_SECONDS,
                    read=HTTP_READ_TIMEOUT_SECONDS,
                    write=HTTP_WRITE_TIMEOUT_SECONDS,
                    pool=HTTP_POOL_TIMEOUT_SECONDS,
                ),
                follow_redirects=False,
                trust_env=False,
            )
        )

    def authorization_url(
        self,
        *,
        redirect_uri: str,
        state: str,
        code_challenge: str,
        nonce: str,
    ) -> str:
        raise NotImplementedError

    async def exchange(
        self,
        *,
        code: str,
        redirect_uri: str,
        code_verifier: str,
        nonce: str,
    ) -> ExternalIdentityProfile:
        raise NotImplementedError

    @staticmethod
    def _provider_error(message: str = "第三方登录验证失败，请重试。") -> IdentityDomainError:
        return IdentityDomainError("AUTH_OAUTH_EXCHANGE_FAILED", message, status_code=401)


async def _request_with_limited_body(
    client: httpx.AsyncClient,
    method: str,
    url: str,
    *,
    max_bytes: int,
    **request_kwargs,
) -> httpx.Response:
    """Fetch an OAuth response without buffering an unbounded provider body."""

    async with client.stream(method, url, **request_kwargs) as response:
        response.raise_for_status()

        content_length = response.headers.get("content-length")
        if content_length is not None:
            try:
                declared_size = int(content_length, 10)
            except ValueError as exc:
                raise ValueError(
                    "OAuth provider returned an invalid content length"
                ) from exc
            if declared_size < 0 or declared_size > max_bytes:
                raise ValueError("OAuth provider response exceeds the byte limit")

        body = bytearray()
        async for chunk in response.aiter_bytes():
            if len(body) + len(chunk) > max_bytes:
                raise ValueError("OAuth provider response exceeds the byte limit")
            body.extend(chunk)

        return httpx.Response(
            status_code=response.status_code,
            headers=response.headers,
            content=bytes(body),
            request=response.request,
            extensions=response.extensions,
        )


class GoogleOAuthProvider(OAuthProvider):
    name: OAuthProviderName = "google"
    authorization_endpoint = "https://accounts.google.com/o/oauth2/v2/auth"
    token_endpoint = "https://oauth2.googleapis.com/token"
    userinfo_endpoint = "https://openidconnect.googleapis.com/v1/userinfo"

    def authorization_url(self, *, redirect_uri, state, code_challenge, nonce) -> str:
        params = {
            "client_id": self.config.client_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": "openid profile email",
            "state": state,
            "nonce": nonce,
            "code_challenge": code_challenge,
            "code_challenge_method": "S256",
            "prompt": "select_account",
        }
        return f"{self.authorization_endpoint}?{urlencode(params)}"

    async def exchange(self, *, code, redirect_uri, code_verifier, nonce) -> ExternalIdentityProfile:
        try:
            async with self._client_factory() as client:
                token_response = await _request_with_limited_body(
                    client,
                    "POST",
                    self.token_endpoint,
                    max_bytes=TOKEN_RESPONSE_MAX_BYTES,
                    data={
                        "client_id": self.config.client_id,
                        "client_secret": self.config.client_secret,
                        "code": code,
                        "grant_type": "authorization_code",
                        "redirect_uri": redirect_uri,
                        "code_verifier": code_verifier,
                    },
                )
                token_data = token_response.json()
                access_token = token_data.get("access_token")
                id_token = token_data.get("id_token")
                if not access_token or not id_token:
                    raise self._provider_error()
                jwks_response = await _request_with_limited_body(
                    client,
                    "GET",
                    "https://www.googleapis.com/oauth2/v3/certs",
                    max_bytes=JWKS_RESPONSE_MAX_BYTES,
                )
                jwks = jwks_response.json().get("keys", [])
                header = jwt.get_unverified_header(id_token)
                signing_key = next(
                    (key for key in jwks if key.get("kid") == header.get("kid")),
                    None,
                )
                if signing_key is None:
                    raise self._provider_error()
                if header.get("alg") != "RS256":
                    raise self._provider_error()
                claims = jwt.decode(
                    id_token,
                    signing_key,
                    algorithms=["RS256"],
                    audience=self.config.client_id,
                    options={"verify_at_hash": False},
                )
                if claims.get("iss") not in {
                    "https://accounts.google.com",
                    "accounts.google.com",
                } or not hmac.compare_digest(str(claims.get("nonce") or ""), nonce):
                    raise self._provider_error()
                profile_response = await _request_with_limited_body(
                    client,
                    "GET",
                    self.userinfo_endpoint,
                    max_bytes=USERINFO_RESPONSE_MAX_BYTES,
                    headers={"Authorization": f"Bearer {access_token}"},
                )
                profile = profile_response.json()
        except (httpx.HTTPError, JWTError, ValueError, TypeError) as exc:
            raise self._provider_error() from exc

        subject = str(profile.get("sub") or "").strip()
        if not subject or subject != str(claims.get("sub") or ""):
            raise self._provider_error()
        email_verified = profile.get("email_verified") is True or str(
            profile.get("email_verified", "")
        ).lower() == "true"
        return ExternalIdentityProfile(
            provider="google",
            issuer="https://accounts.google.com",
            subject=subject,
            display_name=str(profile.get("name") or profile.get("given_name") or "Google User"),
            avatar_url=profile.get("picture"),
            email=profile.get("email"),
            email_verified=email_verified,
        )


def _json_or_query_payload(response: httpx.Response) -> dict:
    try:
        payload = response.json()
        return payload if isinstance(payload, dict) else {}
    except (ValueError, json.JSONDecodeError):
        parsed = parse_qs(response.text, keep_blank_values=True)
        return {key: values[-1] for key, values in parsed.items() if values}


def _qq_json_payload(response: httpx.Response) -> dict:
    text = response.text.strip()
    if text.startswith("callback"):
        match = re.search(r"callback\s*\((.*)\)\s*;?", text, re.DOTALL)
        if not match:
            return {}
        text = match.group(1)
    try:
        value = json.loads(text)
    except json.JSONDecodeError:
        return _json_or_query_payload(response)
    return value if isinstance(value, dict) else {}


class QQOAuthProvider(OAuthProvider):
    name: OAuthProviderName = "qq"
    authorization_endpoint = "https://graph.qq.com/oauth2.0/authorize"
    token_endpoint = "https://graph.qq.com/oauth2.0/token"
    openid_endpoint = "https://graph.qq.com/oauth2.0/me"
    userinfo_endpoint = "https://graph.qq.com/user/get_user_info"

    def authorization_url(self, *, redirect_uri, state, code_challenge, nonce) -> str:
        params = {
            "client_id": self.config.client_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": "get_user_info",
            "state": state,
        }
        return f"{self.authorization_endpoint}?{urlencode(params)}"

    async def exchange(self, *, code, redirect_uri, code_verifier, nonce) -> ExternalIdentityProfile:
        try:
            async with self._client_factory() as client:
                token_response = await _request_with_limited_body(
                    client,
                    "GET",
                    self.token_endpoint,
                    max_bytes=TOKEN_RESPONSE_MAX_BYTES,
                    params={
                        "grant_type": "authorization_code",
                        "client_id": self.config.client_id,
                        "client_secret": self.config.client_secret,
                        "code": code,
                        "redirect_uri": redirect_uri,
                        "fmt": "json",
                    },
                )
                token_data = _json_or_query_payload(token_response)
                access_token = token_data.get("access_token")
                if not access_token:
                    raise self._provider_error()

                openid_response = await _request_with_limited_body(
                    client,
                    "GET",
                    self.openid_endpoint,
                    max_bytes=TOKEN_RESPONSE_MAX_BYTES,
                    params={"access_token": access_token, "fmt": "json"},
                )
                openid_data = _qq_json_payload(openid_response)
                openid = str(openid_data.get("openid") or "").strip()
                if not openid:
                    raise self._provider_error()

                profile_response = await _request_with_limited_body(
                    client,
                    "GET",
                    self.userinfo_endpoint,
                    max_bytes=USERINFO_RESPONSE_MAX_BYTES,
                    params={
                        "access_token": access_token,
                        "oauth_consumer_key": self.config.client_id,
                        "openid": openid,
                        "format": "json",
                    },
                )
                profile = profile_response.json()
        except (httpx.HTTPError, ValueError, TypeError) as exc:
            raise self._provider_error() from exc

        if int(profile.get("ret", 0)) != 0:
            raise self._provider_error()
        return ExternalIdentityProfile(
            provider="qq",
            issuer=f"https://graph.qq.com/app/{self.config.client_id}",
            subject=openid,
            display_name=str(profile.get("nickname") or "QQ User"),
            avatar_url=profile.get("figureurl_qq_2") or profile.get("figureurl_qq_1"),
        )


class WeChatOAuthProvider(OAuthProvider):
    name: OAuthProviderName = "wechat"
    authorization_endpoint = "https://open.weixin.qq.com/connect/qrconnect"
    token_endpoint = "https://api.weixin.qq.com/sns/oauth2/access_token"
    userinfo_endpoint = "https://api.weixin.qq.com/sns/userinfo"

    def authorization_url(self, *, redirect_uri, state, code_challenge, nonce) -> str:
        params = {
            "appid": self.config.client_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": "snsapi_login",
            "state": state,
        }
        return f"{self.authorization_endpoint}?{urlencode(params)}#wechat_redirect"

    async def exchange(self, *, code, redirect_uri, code_verifier, nonce) -> ExternalIdentityProfile:
        try:
            async with self._client_factory() as client:
                token_response = await _request_with_limited_body(
                    client,
                    "GET",
                    self.token_endpoint,
                    max_bytes=TOKEN_RESPONSE_MAX_BYTES,
                    params={
                        "appid": self.config.client_id,
                        "secret": self.config.client_secret,
                        "code": code,
                        "grant_type": "authorization_code",
                    },
                )
                token_data = token_response.json()
                access_token = token_data.get("access_token")
                openid = str(token_data.get("openid") or "").strip()
                if not access_token or not openid:
                    raise self._provider_error()

                profile_response = await _request_with_limited_body(
                    client,
                    "GET",
                    self.userinfo_endpoint,
                    max_bytes=USERINFO_RESPONSE_MAX_BYTES,
                    params={
                        "access_token": access_token,
                        "openid": openid,
                        "lang": "zh_CN",
                    },
                )
                profile = profile_response.json()
        except (httpx.HTTPError, ValueError, TypeError) as exc:
            raise self._provider_error() from exc

        if profile.get("errcode"):
            raise self._provider_error()
        unionid = str(profile.get("unionid") or token_data.get("unionid") or "").strip()
        return ExternalIdentityProfile(
            provider="wechat",
            # OpenID is app-scoped and present on every successful exchange, so
            # it is the stable primary key even when UnionID is intermittently
            # omitted by WeChat.  UnionID remains an alias solely to migrate
            # identities written by older Sun World versions.
            issuer=f"https://open.weixin.qq.com/app/{self.config.client_id}",
            subject=openid,
            display_name=str(profile.get("nickname") or "WeChat User"),
            avatar_url=profile.get("headimgurl"),
            legacy_identity_keys=(
                [
                    {
                        "issuer": "https://open.weixin.qq.com/unionid",
                        "subject": unionid,
                    }
                ]
                if unionid
                else []
            ),
        )


class OAuthProviderRegistry:
    def __init__(self, providers: dict[str, OAuthProvider] | None = None):
        self._providers = providers or {}

    @classmethod
    def from_env(cls) -> "OAuthProviderRegistry":
        provider_types = {
            "google": ("AUTH_GOOGLE_CLIENT_ID", "AUTH_GOOGLE_CLIENT_SECRET", GoogleOAuthProvider),
            "qq": ("AUTH_QQ_CLIENT_ID", "AUTH_QQ_CLIENT_SECRET", QQOAuthProvider),
            "wechat": ("AUTH_WECHAT_CLIENT_ID", "AUTH_WECHAT_CLIENT_SECRET", WeChatOAuthProvider),
        }
        providers: dict[str, OAuthProvider] = {}
        for name, (id_key, secret_key, provider_type) in provider_types.items():
            client_id = os.getenv(id_key, "").strip()
            client_secret = os.getenv(secret_key, "").strip()
            if client_id and client_secret:
                providers[name] = provider_type(
                    OAuthClientConfig(client_id=client_id, client_secret=client_secret)
                )
        return cls(providers)

    def get(self, name: str) -> OAuthProvider:
        provider = self._providers.get(name)
        if provider is None:
            raise IdentityDomainError(
                "AUTH_METHOD_UNAVAILABLE",
                "该登录方式尚未配置。",
                status_code=503,
            )
        return provider

    def is_enabled(self, name: str) -> bool:
        return name in self._providers
