from contextlib import asynccontextmanager
import os
import sys
import unittest
from pathlib import Path
from urllib.parse import urlsplit
from unittest.mock import patch


API_ROOT = Path(__file__).resolve().parents[1]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))


class ProviderRegistryTests(unittest.TestCase):
    def test_creates_an_openai_compatible_provider_from_a_resolved_config(self):
        from src.modules.ai.providers import (
            OpenAiCompatibleProvider,
            ProviderConfig,
            ProviderRegistry,
        )

        config = ProviderConfig(
            provider="deepseek",
            model="deepseek-chat",
            base_url="https://api.deepseek.com",
            api_key="sk-global-secret",
        )

        provider = ProviderRegistry.create(config)

        self.assertIsInstance(provider, OpenAiCompatibleProvider)
        self.assertEqual(provider.config, config)

    def test_registry_reads_the_controlled_provider_host_allowlist(self):
        from src.modules.ai.providers import ProviderRegistry

        with patch.dict(
            os.environ,
            {"AI_PROVIDER_ALLOWED_HOSTS": "api.deepseek.com, *.models.example.com"},
        ):
            provider = ProviderRegistry.create(provider_config())

        self.assertEqual(
            provider._allowed_hosts,
            ("api.deepseek.com", "*.models.example.com"),
        )

    def test_provider_profile_base_urls_are_strict_and_canonical(self):
        from pydantic import ValidationError

        from src.modules.ai.schemas import (
            AiProviderCatalogInput,
            AiProviderProfileInput,
        )

        invalid_urls = (
            "http://models.example.com/v1",
            "https://models.example.com:8443/v1",
            "https://user:password@models.example.com/v1",
            "https://models.example.com/v1#fragment",
            "https://models.example.com/v1?tenant=one",
            "https://models.example.com\\@evil.example/v1",
            "https://127.0.0.1/v1",
            "https://[::1]/v1",
        )
        for base_url in invalid_urls:
            with self.subTest(base_url=base_url):
                with self.assertRaises(ValidationError):
                    AiProviderProfileInput(
                        provider="compatible",
                        name="Compatible",
                        base_url=base_url,
                        model="chat-model",
                    )

        profile = AiProviderProfileInput(
            provider="compatible",
            name="Compatible",
            base_url="https://models.example.com:443/v1/",
            model="chat-model",
        )
        self.assertEqual(profile.base_url, "https://models.example.com/v1")

        with self.assertRaises(ValidationError):
            AiProviderCatalogInput(
                id="private-provider",
                name="Private Provider",
                default_base_url="https://169.254.169.254/v1",
                default_model="chat-model",
            )

    def test_provider_catalog_accepts_only_explicit_insecure_origins(self):
        from pydantic import ValidationError

        from src.modules.ai.schemas import (
            AiProviderCatalogInput,
            AiProviderProfileInput,
        )

        with patch.dict(
            os.environ,
            {
                "AI_PROVIDER_ALLOWED_INSECURE_ORIGINS": (
                    "http://211.141.18.165:6195"
                )
            },
        ):
            provider = AiProviderCatalogInput(
                id="qwen-public",
                name="Qwen Public",
                default_base_url="http://211.141.18.165:6195/v1/",
                default_model="qwen38_27b",
                auth_mode="none",
                is_default=True,
            )
            self.assertEqual(
                provider.default_base_url,
                "http://211.141.18.165:6195/v1",
            )
            with self.assertRaises(ValidationError):
                AiProviderCatalogInput(
                    id="insecure-bearer",
                    name="Insecure Bearer",
                    default_base_url="http://211.141.18.165:6195/v1",
                    default_model="qwen38_27b",
                    auth_mode="bearer",
                    api_key="must-not-cross-http",
                )
            with self.assertRaises(ValidationError):
                AiProviderProfileInput(
                    provider="qwen-public",
                    name="Insecure Personal Profile",
                    base_url="http://211.141.18.165:6195/v1",
                    model="qwen38_27b",
                    api_key="must-not-cross-http",
                )

            for base_url in (
                "http://211.141.18.165:6196/v1",
                "http://models.example.com/v1",
                "http://127.0.0.1:6195/v1",
            ):
                with self.subTest(base_url=base_url):
                    with self.assertRaises(ValidationError):
                        AiProviderCatalogInput(
                            id="blocked-provider",
                            name="Blocked Provider",
                            default_base_url=base_url,
                            default_model="chat-model",
                            auth_mode="none",
                        )

    def test_provider_catalog_rejects_ambiguous_credentials_and_disabled_default(self):
        from pydantic import ValidationError

        from src.modules.ai.schemas import AiProviderCatalogInput

        invalid_values = (
            {
                "auth_mode": "none",
                "api_key": "should-not-be-stored",
            },
            {
                "auth_mode": "bearer",
                "api_key": "secret",
                "clear_api_key": True,
            },
            {
                "auth_mode": "none",
                "is_enabled": False,
                "is_default": True,
            },
        )
        for overrides in invalid_values:
            with self.subTest(overrides=overrides):
                with self.assertRaises(ValidationError):
                    AiProviderCatalogInput(
                        id="invalid-provider",
                        name="Invalid Provider",
                        default_base_url="https://models.example.com/v1",
                        default_model="chat-model",
                        **overrides,
                    )


class FakeResolver:
    def __init__(self, *answers):
        self.answers = list(answers or [("1.1.1.1",)])
        self.calls = []

    async def resolve(self, host, port):
        self.calls.append((host, port))
        index = min(len(self.calls) - 1, len(self.answers) - 1)
        return self.answers[index]


def fake_http_dependencies(
    captured,
    *,
    chunks=(b'data: {"choices":[{"delta":{"content":"hello"}}]}\n\n', b"data: [DONE]\n\n"),
    status_code=200,
    response_headers=None,
):
    from src.modules.ai.mcp_gateway import McpSdkDependencies

    class FakeTimeout:
        def __init__(self, **kwargs):
            self.values = kwargs

    class FakeAsyncByteStream:
        async def aclose(self):
            return None

    class SourceStream(FakeAsyncByteStream):
        async def __aiter__(self):
            for chunk in chunks:
                yield chunk

    class FakeUrl:
        def __init__(self, url=None, *, host=None):
            self.host = host or urlsplit(url).hostname
            self.raw_host = self.host.encode("ascii")

        def copy_with(self, *, host):
            return FakeUrl(host=host)

    class FakeRequest:
        def __init__(self, url, headers):
            self.url = FakeUrl(url)
            self.headers = dict(headers or {})
            self.extensions = {}

    class FakeResponse:
        def __init__(self):
            self.status_code = status_code
            self.headers = dict(response_headers or {})
            self.stream = SourceStream()

        async def aiter_lines(self):
            body = bytearray()
            async for chunk in self.stream:
                body.extend(chunk)
            for line in body.decode("utf-8").splitlines():
                yield line

    class FakeAsyncClient:
        def __init__(self, **kwargs):
            self.kwargs = kwargs
            captured.setdefault("clients", []).append(self)

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc_value, traceback):
            return None

        @asynccontextmanager
        async def stream(self, method, url, **kwargs):
            request = FakeRequest(url, self.kwargs.get("headers"))
            for hook in self.kwargs["event_hooks"]["request"]:
                await hook(request)
            captured["request"] = request
            captured["request_call"] = (method, url, kwargs)
            response = FakeResponse()
            for hook in self.kwargs["event_hooks"]["response"]:
                await hook(response)
            yield response

    class FakeTimeoutException(Exception):
        pass

    class FakeHttpx2:
        Timeout = FakeTimeout
        AsyncByteStream = FakeAsyncByteStream
        AsyncClient = FakeAsyncClient
        TimeoutException = FakeTimeoutException

    return McpSdkDependencies(
        httpx2=FakeHttpx2,
        client_class=object,
        streamable_http_client=object,
    )


def provider_config(base_url="https://models.example.com/v1"):
    from src.modules.ai.providers import ProviderConfig

    return ProviderConfig(
        provider="compatible",
        model="chat-model",
        base_url=base_url,
        api_key="secret-token",
    )


class ProviderOutboundSecurityTests(unittest.IsolatedAsyncioTestCase):
    async def _collect(self, provider):
        return [
            delta
            async for delta in provider.stream(
                [{"role": "user", "content": "hello"}]
            )
        ]

    async def test_fails_closed_when_no_provider_host_allowlist_is_configured(self):
        from src.modules.ai.errors import AiDomainError
        from src.modules.ai.providers import OpenAiCompatibleProvider

        resolver = FakeResolver()
        with patch.dict(os.environ, {"AI_PROVIDER_ALLOWED_HOSTS": ""}):
            provider = OpenAiCompatibleProvider(
                provider_config(),
                resolver=resolver,
                dependency_loader=lambda: self.fail("HTTP client must not be loaded"),
            )

        with self.assertRaises(AiDomainError) as caught:
            await self._collect(provider)

        self.assertEqual(caught.exception.code, "AI_PROVIDER_HOST_POLICY_NOT_CONFIGURED")
        self.assertEqual(resolver.calls, [])
        self.assertNotIn("secret-token", str(caught.exception))

    async def test_resolves_all_addresses_and_pins_the_validated_global_ip(self):
        from src.modules.ai.providers import OpenAiCompatibleProvider

        captured = {}
        dependencies = fake_http_dependencies(captured)
        resolver = FakeResolver(("1.1.1.1", "2606:4700:4700::1111"))
        provider = OpenAiCompatibleProvider(
            provider_config(),
            allowed_hosts=["models.example.com"],
            resolver=resolver,
            dependency_loader=lambda: dependencies,
            connect_timeout_seconds=2,
            read_timeout_seconds=11,
            write_timeout_seconds=3,
            pool_timeout_seconds=4,
        )

        deltas = await self._collect(provider)

        self.assertEqual(deltas, ["hello"])
        self.assertEqual(resolver.calls, [("models.example.com", 443)])
        client_kwargs = captured["clients"][0].kwargs
        self.assertFalse(client_kwargs["follow_redirects"])
        self.assertFalse(client_kwargs["trust_env"])
        self.assertEqual(
            client_kwargs["timeout"].values,
            {"connect": 2.0, "read": 11.0, "write": 3.0, "pool": 4.0},
        )
        self.assertEqual(captured["request"].url.host, "1.1.1.1")
        self.assertEqual(captured["request"].headers["Host"], "models.example.com")
        self.assertEqual(captured["request"].headers["Accept-Encoding"], "identity")
        self.assertEqual(
            captured["request"].extensions["sni_hostname"],
            "models.example.com",
        )
        self.assertEqual(
            captured["request_call"][1],
            "https://models.example.com/v1/chat/completions",
        )
        self.assertEqual(captured["request_call"][2]["json"]["max_tokens"], 4_096)
        self.assertNotIn("secret-token", repr(provider.config))

    async def test_keyless_http_provider_requires_exact_origin_and_pins_the_public_ip(self):
        from src.modules.ai.providers import OpenAiCompatibleProvider, ProviderConfig

        captured = {}
        dependencies = fake_http_dependencies(captured)
        resolver = FakeResolver(("211.141.18.165",))
        config = ProviderConfig(
            provider="qwen-public",
            model="qwen38_27b",
            base_url="http://211.141.18.165:6195/v1",
            auth_mode="none",
        )
        with patch.dict(
            os.environ,
            {
                "AI_PROVIDER_ALLOWED_INSECURE_ORIGINS": (
                    "http://211.141.18.165:6195"
                )
            },
        ):
            provider = OpenAiCompatibleProvider(
                config,
                allowed_hosts=[],
                resolver=resolver,
                dependency_loader=lambda: dependencies,
            )
            self.assertEqual(await self._collect(provider), ["hello"])
            self.assertEqual(await self._collect(provider), ["hello"])

        self.assertEqual(
            resolver.calls,
            [
                ("211.141.18.165", 6195),
                ("211.141.18.165", 6195),
            ],
        )
        self.assertEqual(
            captured["request_call"][:2],
            ("POST", "http://211.141.18.165:6195/v1/chat/completions"),
        )
        self.assertIsNone(captured["clients"][0].kwargs["headers"])
        self.assertFalse(captured["clients"][0].kwargs["follow_redirects"])
        self.assertFalse(captured["clients"][0].kwargs["trust_env"])
        self.assertEqual(
            captured["request"].headers["Host"],
            "211.141.18.165:6195",
        )
        self.assertNotIn("sni_hostname", captured["request"].extensions)

    async def test_bearer_provider_without_a_key_fails_before_network_access(self):
        from src.modules.ai.errors import AiDomainError
        from src.modules.ai.providers import OpenAiCompatibleProvider, ProviderConfig

        resolver = FakeResolver(("1.1.1.1",))
        provider = OpenAiCompatibleProvider(
            ProviderConfig(
                provider="bearer-provider",
                model="chat-model",
                base_url="https://models.example.com/v1",
                auth_mode="bearer",
            ),
            allowed_hosts=["models.example.com"],
            resolver=resolver,
            dependency_loader=lambda: self.fail("HTTP client must not be loaded"),
        )

        with self.assertRaises(AiDomainError) as caught:
            await self._collect(provider)

        self.assertEqual(caught.exception.code, "AI_PROVIDER_NOT_CONFIGURED")
        self.assertEqual(resolver.calls, [])

    async def test_bearer_provider_never_sends_a_key_over_allowlisted_http(self):
        from src.modules.ai.errors import AiDomainError
        from src.modules.ai.providers import OpenAiCompatibleProvider, ProviderConfig

        resolver = FakeResolver(("211.141.18.165",))
        with patch.dict(
            os.environ,
            {
                "AI_PROVIDER_ALLOWED_INSECURE_ORIGINS": (
                    "http://211.141.18.165:6195"
                )
            },
        ):
            provider = OpenAiCompatibleProvider(
                ProviderConfig(
                    provider="insecure-bearer",
                    model="qwen38_27b",
                    base_url="http://211.141.18.165:6195/v1",
                    auth_mode="bearer",
                    api_key="must-not-cross-http",
                ),
                allowed_hosts=[],
                resolver=resolver,
                dependency_loader=lambda: self.fail(
                    "HTTP client must not be loaded"
                ),
            )

            with self.assertRaises(AiDomainError) as caught:
                await self._collect(provider)

        self.assertEqual(
            caught.exception.code,
            "AI_PROVIDER_CONFIGURATION_INVALID",
        )
        self.assertEqual(resolver.calls, [])

    async def test_rejects_suffix_confusion_and_any_non_global_dns_answer(self):
        from src.modules.ai.errors import AiDomainError
        from src.modules.ai.providers import OpenAiCompatibleProvider

        resolver = FakeResolver(("1.1.1.1", "169.254.169.254"))
        provider = OpenAiCompatibleProvider(
            provider_config(),
            allowed_hosts=["models.example.com"],
            resolver=resolver,
        )
        with self.assertRaises(AiDomainError) as caught:
            await self._collect(provider)
        self.assertEqual(caught.exception.code, "AI_PROVIDER_HOST_NOT_ALLOWED")

        suffix_resolver = FakeResolver()
        suffix_provider = OpenAiCompatibleProvider(
            provider_config("https://models.example.com.attacker.invalid/v1"),
            allowed_hosts=["models.example.com"],
            resolver=suffix_resolver,
        )
        with self.assertRaises(AiDomainError) as caught:
            await self._collect(suffix_provider)
        self.assertEqual(caught.exception.code, "AI_PROVIDER_HOST_NOT_ALLOWED")
        self.assertEqual(suffix_resolver.calls, [])

    async def test_revalidates_dns_on_every_stream_to_block_rebinding(self):
        from src.modules.ai.errors import AiDomainError
        from src.modules.ai.providers import OpenAiCompatibleProvider

        captured = {}
        dependencies = fake_http_dependencies(captured)
        resolver = FakeResolver(("1.1.1.1",), ("127.0.0.1",))
        provider = OpenAiCompatibleProvider(
            provider_config(),
            allowed_hosts=["models.example.com"],
            resolver=resolver,
            dependency_loader=lambda: dependencies,
        )

        self.assertEqual(await self._collect(provider), ["hello"])
        with self.assertRaises(AiDomainError) as caught:
            await self._collect(provider)

        self.assertEqual(caught.exception.code, "AI_PROVIDER_HOST_NOT_ALLOWED")
        self.assertEqual(len(resolver.calls), 2)
        self.assertEqual(len(captured["clients"]), 1)

    async def test_bounds_raw_stream_bytes_and_emitted_characters(self):
        from src.modules.ai.errors import AiDomainError
        from src.modules.ai.providers import OpenAiCompatibleProvider

        byte_capture = {}
        byte_dependencies = fake_http_dependencies(
            byte_capture,
            chunks=(b"x" * 129,),
        )
        byte_provider = OpenAiCompatibleProvider(
            provider_config(),
            allowed_hosts=["models.example.com"],
            resolver=FakeResolver(),
            dependency_loader=lambda: byte_dependencies,
            max_stream_bytes=128,
        )
        with self.assertRaises(AiDomainError) as caught:
            await self._collect(byte_provider)
        self.assertEqual(caught.exception.code, "AI_PROVIDER_RESPONSE_TOO_LARGE")

        character_capture = {}
        character_dependencies = fake_http_dependencies(
            character_capture,
            chunks=(
                b'data: {"choices":[{"delta":{"content":"123456"}}]}\n\n',
            ),
        )
        character_provider = OpenAiCompatibleProvider(
            provider_config(),
            allowed_hosts=["models.example.com"],
            resolver=FakeResolver(),
            dependency_loader=lambda: character_dependencies,
            max_stream_characters=5,
        )
        with self.assertRaises(AiDomainError) as caught:
            await self._collect(character_provider)
        self.assertEqual(caught.exception.code, "AI_PROVIDER_RESPONSE_TOO_LARGE")

    async def test_rejects_compressed_and_redirect_responses(self):
        from src.modules.ai.errors import AiDomainError
        from src.modules.ai.providers import OpenAiCompatibleProvider

        compressed_dependencies = fake_http_dependencies(
            {},
            response_headers={"content-encoding": "gzip"},
        )
        compressed_provider = OpenAiCompatibleProvider(
            provider_config(),
            allowed_hosts=["models.example.com"],
            resolver=FakeResolver(),
            dependency_loader=lambda: compressed_dependencies,
        )
        with self.assertRaises(AiDomainError) as caught:
            await self._collect(compressed_provider)
        self.assertEqual(caught.exception.code, "AI_PROVIDER_PROTOCOL_ERROR")

        redirect_dependencies = fake_http_dependencies({}, status_code=302)
        redirect_provider = OpenAiCompatibleProvider(
            provider_config(),
            allowed_hosts=["models.example.com"],
            resolver=FakeResolver(),
            dependency_loader=lambda: redirect_dependencies,
        )
        with self.assertRaises(AiDomainError) as caught:
            await self._collect(redirect_provider)
        self.assertEqual(caught.exception.code, "AI_PROVIDER_UNAVAILABLE")


if __name__ == "__main__":
    unittest.main()
