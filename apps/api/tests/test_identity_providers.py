import asyncio
import base64
import json
import os
import sys
import time
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.parse import parse_qs, urlparse

import httpx


API_ROOT = Path(__file__).resolve().parents[1]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))


def client_factory(handler):
    transport = httpx.MockTransport(handler)
    return lambda: httpx.AsyncClient(transport=transport, follow_redirects=False)


def base64url_uint(value: int) -> str:
    length = (value.bit_length() + 7) // 8
    return base64.urlsafe_b64encode(value.to_bytes(length, "big")).rstrip(b"=").decode()


class IdentityProviderTests(unittest.TestCase):
    def test_google_requires_the_exact_audience_and_authorized_presenter(self):
        from src.modules.identity.providers import _google_client_claims_match

        self.assertFalse(_google_client_claims_match({}, "google-client"))
        self.assertTrue(
            _google_client_claims_match(
                {"aud": "google-client"},
                "google-client",
            )
        )
        self.assertTrue(
            _google_client_claims_match(
                {"aud": "google-client", "azp": "google-client"},
                "google-client",
            )
        )
        self.assertFalse(
            _google_client_claims_match(
                {"aud": ["google-client", "different-client"]},
                "google-client",
            )
        )
        self.assertFalse(
            _google_client_claims_match(
                {"aud": "google-client", "azp": "different-client"},
                "google-client",
            )
        )
        self.assertFalse(
            _google_client_claims_match(
                {"aud": "google-client", "azp": ["google-client"]},
                "google-client",
            )
        )

    def test_default_client_disables_environment_and_uses_fixed_timeouts(self):
        from src.modules.identity.providers import (
            HTTP_CONNECT_TIMEOUT_SECONDS,
            HTTP_POOL_TIMEOUT_SECONDS,
            HTTP_READ_TIMEOUT_SECONDS,
            HTTP_WRITE_TIMEOUT_SECONDS,
            GoogleOAuthProvider,
            OAuthClientConfig,
        )

        provider = GoogleOAuthProvider(OAuthClientConfig("google-client", "google-secret"))
        client = provider._client_factory()
        try:
            self.assertFalse(client._trust_env)
            self.assertFalse(client.follow_redirects)
            self.assertEqual(client.timeout.connect, HTTP_CONNECT_TIMEOUT_SECONDS)
            self.assertEqual(client.timeout.read, HTTP_READ_TIMEOUT_SECONDS)
            self.assertEqual(client.timeout.write, HTTP_WRITE_TIMEOUT_SECONDS)
            self.assertEqual(client.timeout.pool, HTTP_POOL_TIMEOUT_SECONDS)
        finally:
            asyncio.run(client.aclose())

        with patch("src.modules.identity.providers.httpx.AsyncClient") as client_type:
            provider._client_factory()
            self.assertNotIn("proxy", client_type.call_args.kwargs)
            self.assertTrue(client_type.call_args.kwargs["verify"])

    def test_google_registry_applies_only_the_explicit_proxy(self):
        from src.modules.identity.providers import OAuthProviderRegistry

        environment = {
            "AUTH_GOOGLE_CLIENT_ID": "google-client",
            "AUTH_GOOGLE_CLIENT_SECRET": "google-secret",
            "AUTH_GOOGLE_OUTBOUND_PROXY_URL": (
                "https://test-user:test-password@proxy.example:8443/"
            ),
            "AUTH_QQ_CLIENT_ID": "qq-client",
            "AUTH_QQ_CLIENT_SECRET": "qq-secret",
        }
        with patch.dict(os.environ, environment, clear=True):
            registry = OAuthProviderRegistry.from_env()

        with patch("src.modules.identity.providers.httpx.AsyncClient") as client_type:
            registry.get("google")._client_factory()
            google_kwargs = client_type.call_args.kwargs
            self.assertEqual(
                google_kwargs["proxy"],
                environment["AUTH_GOOGLE_OUTBOUND_PROXY_URL"],
            )
            self.assertFalse(google_kwargs["trust_env"])
            self.assertFalse(google_kwargs["follow_redirects"])
            self.assertTrue(google_kwargs["verify"])

            client_type.reset_mock()
            registry.get("qq")._client_factory()
            qq_kwargs = client_type.call_args.kwargs
            self.assertNotIn("proxy", qq_kwargs)
            self.assertFalse(qq_kwargs["trust_env"])

    def test_google_registry_rejects_invalid_explicit_proxy_without_credentials(self):
        from src.modules.identity.providers import OAuthProviderRegistry

        invalid_values = (
            "socks5://proxy.example:1080",
            "http://proxy.example",
            "http://proxy.example:0",
            "http://test-user:test-password@proxy.example:8080",
            "http://proxy.example:8080/tunnel",
            "http://proxy.example:8080?mode=tunnel",
            "http://proxy.example:8080#fragment",
            "http://proxy.example:99999",
            "http://pro%xy:8080",
            "http://proxy..example:8080",
            "http://proxy.example:8080\n",
            "https://user:$(id)@proxy.example:8443",
            "https://user:`id`@proxy.example:8443",
            "https://user:secret;id@proxy.example:8443",
            "https://user:secret&more@proxy.example:8443",
            "https://user:secret'quote@proxy.example:8443",
            'https://user:secret"quote@proxy.example:8443',
            "https://user:secret=padding@proxy.example:8443",
            "https://user:bad%escape@proxy.example:8443",
        )
        for value in invalid_values:
            with self.subTest(value=value), patch.dict(
                os.environ,
                {"AUTH_GOOGLE_OUTBOUND_PROXY_URL": value},
                clear=True,
            ):
                with self.assertRaisesRegex(
                    ValueError,
                    "^AUTH_GOOGLE_OUTBOUND_PROXY_URL is invalid$",
                ):
                    OAuthProviderRegistry.from_env()

    def test_google_proxy_does_not_enable_missing_client_credentials(self):
        from src.modules.identity.providers import OAuthProviderRegistry

        with patch.dict(
            os.environ,
            {"AUTH_GOOGLE_OUTBOUND_PROXY_URL": "http://proxy.example:8080"},
            clear=True,
        ):
            registry = OAuthProviderRegistry.from_env()

        self.assertFalse(registry.is_enabled("google"))

    def test_google_provider_constructor_rejects_unvalidated_proxy(self):
        from src.modules.identity.providers import (
            GoogleOAuthProvider,
            OAuthClientConfig,
        )

        with self.assertRaisesRegex(
            ValueError,
            "^AUTH_GOOGLE_OUTBOUND_PROXY_URL is invalid$",
        ):
            GoogleOAuthProvider(
                OAuthClientConfig("google-client", "google-secret"),
                outbound_proxy_url=(
                    "http://test-user:test-password@proxy.example:8080"
                ),
            )

    def test_response_limit_rejects_declared_size_without_reading_body(self):
        from src.modules.identity.providers import _request_with_limited_body

        body_was_read = False

        class GuardedStream(httpx.AsyncByteStream):
            async def __aiter__(self):
                nonlocal body_was_read
                body_was_read = True
                yield b"small"

        def handler(request):
            return httpx.Response(
                200,
                headers={"content-length": "6"},
                stream=GuardedStream(),
            )

        async def request():
            async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
                await _request_with_limited_body(
                    client,
                    "GET",
                    "https://provider.example/token",
                    max_bytes=5,
                )

        with self.assertRaises(ValueError):
            asyncio.run(request())
        self.assertFalse(body_was_read)

    def test_response_limit_rejects_stream_without_content_length(self):
        from src.modules.identity.providers import _request_with_limited_body

        class ChunkedStream(httpx.AsyncByteStream):
            async def __aiter__(self):
                yield b"1234"
                yield b"56"

        def handler(request):
            return httpx.Response(200, stream=ChunkedStream())

        async def request():
            async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
                await _request_with_limited_body(
                    client,
                    "GET",
                    "https://provider.example/userinfo",
                    max_bytes=5,
                )

        with self.assertRaises(ValueError):
            asyncio.run(request())

    def test_qq_rejects_oversized_text_response(self):
        from src.modules.identity.errors import IdentityDomainError
        from src.modules.identity.providers import (
            TOKEN_RESPONSE_MAX_BYTES,
            OAuthClientConfig,
            QQOAuthProvider,
        )

        def handler(request):
            if request.url.path.endswith("/token"):
                return httpx.Response(200, text="access_token=qq-token")
            if request.url.path.endswith("/me"):
                return httpx.Response(200, content=b"x" * (TOKEN_RESPONSE_MAX_BYTES + 1))
            return httpx.Response(404)

        provider = QQOAuthProvider(
            OAuthClientConfig("qq-client", "qq-secret"),
            client_factory(handler),
        )
        with self.assertRaises(IdentityDomainError) as raised:
            asyncio.run(
                provider.exchange(
                    code="code",
                    redirect_uri="https://api.example/callback",
                    code_verifier="unused",
                    nonce="unused",
                )
            )

        self.assertEqual(raised.exception.code, "AUTH_OAUTH_EXCHANGE_FAILED")

    def test_google_validates_signed_id_token_nonce_and_uses_sub_as_subject(self):
        from cryptography.hazmat.primitives import serialization
        from cryptography.hazmat.primitives.asymmetric import rsa
        from jose import jwt

        from src.modules.identity.providers import (
            GoogleOAuthProvider,
            OAuthClientConfig,
        )

        private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        private_pem = private_key.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.PKCS8,
            serialization.NoEncryption(),
        )
        numbers = private_key.public_key().public_numbers()
        jwk = {
            "kty": "RSA",
            "kid": "test-key",
            "use": "sig",
            "alg": "RS256",
            "n": base64url_uint(numbers.n),
            "e": base64url_uint(numbers.e),
        }
        now = int(time.time())
        id_token = jwt.encode(
            {
                "iss": "https://accounts.google.com",
                "aud": "google-client",
                "sub": "stable-google-sub",
                "nonce": "expected-nonce",
                "iat": now,
                "exp": now + 300,
            },
            private_pem,
            algorithm="RS256",
            headers={"kid": "test-key"},
        )

        def handler(request):
            if request.url.path.endswith("/token"):
                return httpx.Response(
                    200,
                    json={"access_token": "provider-access", "id_token": id_token},
                )
            if request.url.path.endswith("/certs"):
                return httpx.Response(200, json={"keys": [jwk]})
            if request.url.path.endswith("/userinfo"):
                return httpx.Response(
                    200,
                    json={
                        "sub": "stable-google-sub",
                        "name": "Google Person",
                        "email": "person@example.com",
                        "email_verified": True,
                    },
                )
            return httpx.Response(404)

        provider = GoogleOAuthProvider(
            OAuthClientConfig("google-client", "google-secret"),
            client_factory(handler),
        )
        profile = asyncio.run(
            provider.exchange(
                code="authorization-code",
                redirect_uri="https://api.example/auth/callback",
                code_verifier="verifier",
                nonce="expected-nonce",
            )
        )

        self.assertEqual(profile.subject, "stable-google-sub")
        self.assertTrue(profile.email_verified)
        self.assertIsNone(profile.phone)

    def test_qq_uses_app_scoped_openid_and_never_infers_phone(self):
        from src.modules.identity.providers import OAuthClientConfig, QQOAuthProvider

        def handler(request):
            if request.url.path.endswith("/token"):
                return httpx.Response(200, text="access_token=qq-token&expires_in=7776000")
            if request.url.path.endswith("/me"):
                return httpx.Response(
                    200,
                    text='callback( {"client_id":"qq-client","openid":"qq-openid"} );',
                )
            if request.url.path.endswith("/get_user_info"):
                return httpx.Response(
                    200,
                    json={"ret": 0, "nickname": "QQ Person", "figureurl_qq_2": "https://img.example/avatar"},
                )
            return httpx.Response(404)

        provider = QQOAuthProvider(
            OAuthClientConfig("qq-client", "qq-secret"),
            client_factory(handler),
        )
        profile = asyncio.run(
            provider.exchange(
                code="code",
                redirect_uri="https://api.example/callback",
                code_verifier="unused",
                nonce="unused",
            )
        )

        self.assertEqual(profile.subject, "qq-openid")
        self.assertIn("qq-client", profile.issuer)
        self.assertFalse(profile.phone_verified)

    def test_wechat_uses_app_openid_as_primary_and_keeps_unionid_as_legacy_key(self):
        from src.modules.identity.providers import OAuthClientConfig, WeChatOAuthProvider

        def handler(request):
            if request.url.path.endswith("/access_token"):
                return httpx.Response(
                    200,
                    json={
                        "access_token": "wechat-token",
                        "openid": "wechat-openid",
                        "unionid": "wechat-unionid",
                    },
                )
            if request.url.path.endswith("/userinfo"):
                return httpx.Response(
                    200,
                    json={
                        "openid": "wechat-openid",
                        "unionid": "wechat-unionid",
                        "nickname": "WeChat Person",
                    },
                )
            return httpx.Response(404)

        provider = WeChatOAuthProvider(
            OAuthClientConfig("wechat-app", "wechat-secret"),
            client_factory(handler),
        )
        authorization_url = provider.authorization_url(
            redirect_uri="https://api.example/callback",
            state="one-time-state",
            code_challenge="unused",
            nonce="unused",
        )
        query = parse_qs(urlparse(authorization_url).query)
        profile = asyncio.run(
            provider.exchange(
                code="code",
                redirect_uri="https://api.example/callback",
                code_verifier="unused",
                nonce="unused",
            )
        )

        self.assertEqual(query["state"], ["one-time-state"])
        self.assertEqual(profile.subject, "wechat-openid")
        self.assertEqual(profile.issuer, "https://open.weixin.qq.com/app/wechat-app")
        self.assertEqual(len(profile.legacy_identity_keys), 1)
        self.assertEqual(
            profile.legacy_identity_keys[0].issuer,
            "https://open.weixin.qq.com/unionid",
        )
        self.assertEqual(profile.legacy_identity_keys[0].subject, "wechat-unionid")
        self.assertFalse(profile.phone_verified)

    def test_wechat_primary_key_is_unchanged_when_unionid_is_omitted(self):
        from src.modules.identity.providers import OAuthClientConfig, WeChatOAuthProvider

        def handler(request):
            if request.url.path.endswith("/access_token"):
                return httpx.Response(
                    200,
                    json={"access_token": "wechat-token", "openid": "wechat-openid"},
                )
            if request.url.path.endswith("/userinfo"):
                return httpx.Response(
                    200,
                    json={"openid": "wechat-openid", "nickname": "WeChat Person"},
                )
            return httpx.Response(404)

        provider = WeChatOAuthProvider(
            OAuthClientConfig("wechat-app", "wechat-secret"),
            client_factory(handler),
        )
        profile = asyncio.run(
            provider.exchange(
                code="code",
                redirect_uri="https://api.example/callback",
                code_verifier="unused",
                nonce="unused",
            )
        )

        self.assertEqual(profile.subject, "wechat-openid")
        self.assertEqual(profile.issuer, "https://open.weixin.qq.com/app/wechat-app")
        self.assertEqual(profile.legacy_identity_keys, [])


if __name__ == "__main__":
    unittest.main()
