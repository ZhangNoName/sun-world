from __future__ import annotations

import asyncio
import ipaddress
import json
import math
import os
from collections.abc import Iterable
from dataclasses import dataclass, field
from typing import Any, AsyncIterator, Callable, Protocol
from urllib.parse import urlsplit

from .errors import AiDomainError
from .mcp_gateway import (
    MIN_OUTPUT_BYTES,
    McpGateway,
    McpSdkDependencies,
    SystemMcpDnsResolver,
    _address_is_blocked,
    _exception_tree_contains,
    _exception_tree_is_timeout,
    _host_header,
    _load_mcp_sdk_dependencies,
    _McpEndpointPolicyViolation,
    _McpProtocolViolation,
    _McpResponseTooLarge,
)
from .schemas import _allowed_insecure_provider_origins, _normalize_provider_base_url


DEFAULT_CONNECT_TIMEOUT_SECONDS = 5.0
DEFAULT_READ_TIMEOUT_SECONDS = 60.0
DEFAULT_WRITE_TIMEOUT_SECONDS = 10.0
DEFAULT_POOL_TIMEOUT_SECONDS = 5.0
DEFAULT_TOTAL_TIMEOUT_SECONDS = 180.0
DEFAULT_MAX_STREAM_BYTES = 2 * 1024 * 1024
DEFAULT_MAX_STREAM_CHARACTERS = 1_000_000
DEFAULT_MAX_OUTPUT_TOKENS = 4_096
MAX_OUTPUT_TOKENS = 16_384
MAX_STREAM_LIMIT = 16 * 1024 * 1024


@dataclass(frozen=True)
class ProviderConfig:
    provider: str
    model: str
    base_url: str
    auth_mode: str = "bearer"
    api_key: str | None = field(default=None, repr=False)


@dataclass(frozen=True)
class ProviderConnectionOptions:
    endpoint: str = field(repr=False)
    scheme: str
    host: str = field(repr=False)
    port: int
    resolved_addresses: tuple[str, ...] = field(repr=False)
    bearer_token: str | None = field(default=None, repr=False)
    connect_timeout_seconds: float = DEFAULT_CONNECT_TIMEOUT_SECONDS
    read_timeout_seconds: float = DEFAULT_READ_TIMEOUT_SECONDS
    write_timeout_seconds: float = DEFAULT_WRITE_TIMEOUT_SECONDS
    pool_timeout_seconds: float = DEFAULT_POOL_TIMEOUT_SECONDS
    max_response_bytes: int = DEFAULT_MAX_STREAM_BYTES


class AiProvider(Protocol):
    async def stream(self, messages: list[dict[str, str]]) -> AsyncIterator[str]: ...


def _environment_allowed_hosts() -> tuple[str, ...]:
    raw = os.getenv("AI_PROVIDER_ALLOWED_HOSTS", "")
    return tuple(host.strip() for host in raw.split(",") if host.strip())


def _allowed_host_values(values: Iterable[str] | str | None) -> tuple[str, ...]:
    if values is None:
        return _environment_allowed_hosts()
    if isinstance(values, str):
        return tuple(host.strip() for host in values.split(",") if host.strip())
    try:
        return tuple(values)
    except TypeError:
        return ()


def _positive_timeout(value: float) -> float:
    if (
        not isinstance(value, int | float)
        or isinstance(value, bool)
        or not math.isfinite(float(value))
        or float(value) <= 0
    ):
        raise AiDomainError(
            "AI_PROVIDER_CONFIGURATION_INVALID",
            "The AI provider network policy is invalid.",
            status_code=503,
        )
    return float(value)


def _stream_limit(value: int, *, minimum: int = 1) -> int:
    if (
        not isinstance(value, int)
        or isinstance(value, bool)
        or value < minimum
        or value > MAX_STREAM_LIMIT
    ):
        raise AiDomainError(
            "AI_PROVIDER_CONFIGURATION_INVALID",
            "The AI provider response limit is invalid.",
            status_code=503,
        )
    return value


def _environment_max_output_tokens() -> int:
    raw = os.getenv("AI_PROVIDER_MAX_OUTPUT_TOKENS", str(DEFAULT_MAX_OUTPUT_TOKENS))
    try:
        value = int(raw)
    except (TypeError, ValueError) as exc:
        raise AiDomainError(
            "AI_PROVIDER_CONFIGURATION_INVALID",
            "The AI provider output-token limit is invalid.",
            status_code=503,
        ) from exc
    if value < 1 or value > MAX_OUTPUT_TOKENS:
        raise AiDomainError(
            "AI_PROVIDER_CONFIGURATION_INVALID",
            "The AI provider output-token limit is invalid.",
            status_code=503,
        )
    return value


def _policy_error(error: AiDomainError) -> AiDomainError:
    if error.code == "AI_MCP_ENDPOINT_INVALID":
        return AiDomainError(
            "AI_PROVIDER_ENDPOINT_INVALID",
            "The AI provider endpoint is invalid.",
            status_code=400,
        )
    if error.code in {"AI_MCP_HOST_NOT_ALLOWED", "AI_MCP_ADDRESS_BLOCKED"}:
        return AiDomainError(
            "AI_PROVIDER_HOST_NOT_ALLOWED",
            "The AI provider endpoint is not permitted.",
            status_code=403,
        )
    if error.code == "AI_MCP_TIMEOUT":
        return AiDomainError(
            "AI_PROVIDER_TIMEOUT",
            "The AI provider did not respond in time.",
            status_code=504,
        )
    if error.code == "AI_MCP_DNS_FAILED":
        return AiDomainError(
            "AI_PROVIDER_UNAVAILABLE",
            "The AI provider is temporarily unavailable.",
            status_code=502,
        )
    return AiDomainError(
        "AI_PROVIDER_CONFIGURATION_INVALID",
        "The AI provider network policy is invalid.",
        status_code=503,
    )


class OpenAiCompatibleProvider:
    def __init__(
        self,
        config: ProviderConfig,
        *,
        allowed_hosts: Iterable[str] | str | None = None,
        resolver: object | None = None,
        dependency_loader: Callable[[], McpSdkDependencies] | None = None,
        connect_timeout_seconds: float = DEFAULT_CONNECT_TIMEOUT_SECONDS,
        read_timeout_seconds: float = DEFAULT_READ_TIMEOUT_SECONDS,
        write_timeout_seconds: float = DEFAULT_WRITE_TIMEOUT_SECONDS,
        pool_timeout_seconds: float = DEFAULT_POOL_TIMEOUT_SECONDS,
        total_timeout_seconds: float = DEFAULT_TOTAL_TIMEOUT_SECONDS,
        max_stream_bytes: int = DEFAULT_MAX_STREAM_BYTES,
        max_stream_characters: int = DEFAULT_MAX_STREAM_CHARACTERS,
        max_output_tokens: int | None = None,
    ):
        self.config = config
        self._allowed_hosts = _allowed_host_values(allowed_hosts)
        self._resolver = resolver
        self._dependency_loader = dependency_loader or _load_mcp_sdk_dependencies
        self._connect_timeout_seconds = _positive_timeout(connect_timeout_seconds)
        self._read_timeout_seconds = _positive_timeout(read_timeout_seconds)
        self._write_timeout_seconds = _positive_timeout(write_timeout_seconds)
        self._pool_timeout_seconds = _positive_timeout(pool_timeout_seconds)
        self._total_timeout_seconds = _positive_timeout(total_timeout_seconds)
        self._max_stream_bytes = _stream_limit(
            max_stream_bytes,
            minimum=MIN_OUTPUT_BYTES,
        )
        self._max_stream_characters = _stream_limit(max_stream_characters)
        self._max_output_tokens = (
            _environment_max_output_tokens()
            if max_output_tokens is None
            else max_output_tokens
        )
        if (
            not isinstance(self._max_output_tokens, int)
            or isinstance(self._max_output_tokens, bool)
            or self._max_output_tokens < 1
            or self._max_output_tokens > MAX_OUTPUT_TOKENS
        ):
            raise AiDomainError(
                "AI_PROVIDER_CONFIGURATION_INVALID",
                "The AI provider output-token limit is invalid.",
                status_code=503,
            )

    async def _connection_options(self, endpoint: str):
        parsed = urlsplit(endpoint)
        bearer_token = self.config.api_key if self.config.auth_mode == "bearer" else None
        if parsed.scheme.lower() == "http":
            if self.config.auth_mode != "none" or bearer_token is not None:
                raise AiDomainError(
                    "AI_PROVIDER_CONFIGURATION_INVALID",
                    "Bearer-authenticated providers require HTTPS.",
                    status_code=503,
                )
            return await self._insecure_connection_options(endpoint, None)
        if not self._allowed_hosts:
            raise AiDomainError(
                "AI_PROVIDER_HOST_POLICY_NOT_CONFIGURED",
                "The AI provider host policy is not configured.",
                status_code=503,
            )
        try:
            gateway = McpGateway(
                allowed_hosts=self._allowed_hosts,
                resolver=self._resolver,
                connect_timeout_seconds=self._connect_timeout_seconds,
                read_timeout_seconds=self._read_timeout_seconds,
                write_timeout_seconds=self._write_timeout_seconds,
                pool_timeout_seconds=self._pool_timeout_seconds,
                max_output_bytes=MIN_OUTPUT_BYTES,
                max_discovery_bytes=MIN_OUTPUT_BYTES,
                max_response_bytes=self._max_stream_bytes,
            )
            options = await gateway._validated_options(endpoint, bearer_token)
            return ProviderConnectionOptions(
                endpoint=options.endpoint,
                scheme="https",
                host=options.host,
                port=443,
                resolved_addresses=options.resolved_addresses,
                bearer_token=options.bearer_token,
                connect_timeout_seconds=options.connect_timeout_seconds,
                read_timeout_seconds=options.read_timeout_seconds,
                write_timeout_seconds=options.write_timeout_seconds,
                pool_timeout_seconds=options.pool_timeout_seconds,
                max_response_bytes=options.max_response_bytes,
            )
        except AiDomainError as error:
            raise _policy_error(error) from None

    async def _insecure_connection_options(
        self,
        endpoint: str,
        bearer_token: str | None,
    ) -> ProviderConnectionOptions:
        try:
            parsed = urlsplit(endpoint)
            port = parsed.port or 80
            base_origin = f"http://{parsed.netloc}"
            canonical_origins = _allowed_insecure_provider_origins()
        except (TypeError, ValueError):
            raise AiDomainError(
                "AI_PROVIDER_ENDPOINT_INVALID",
                "The AI provider endpoint is invalid.",
                status_code=400,
            ) from None
        if (
            parsed.scheme.lower() != "http"
            or not parsed.hostname
            or parsed.username is not None
            or parsed.password is not None
            or base_origin not in canonical_origins
        ):
            raise AiDomainError(
                "AI_PROVIDER_HOST_NOT_ALLOWED",
                "The AI provider endpoint is not permitted.",
                status_code=403,
            )
        try:
            host = parsed.hostname.encode("idna").decode("ascii").lower()
            resolver = self._resolver or SystemMcpDnsResolver()
            outcome = resolver.resolve(host, port)
            if hasattr(outcome, "__await__"):
                outcome = await asyncio.wait_for(
                    outcome,
                    timeout=self._connect_timeout_seconds,
                )
            if isinstance(outcome, str):
                outcome = [outcome]
            addresses = tuple(
                dict.fromkeys(str(address).split("%", 1)[0] for address in outcome)
            )
        except TimeoutError:
            raise AiDomainError(
                "AI_PROVIDER_TIMEOUT",
                "The AI provider did not respond in time.",
                status_code=504,
            ) from None
        except AiDomainError:
            raise
        except Exception:
            raise AiDomainError(
                "AI_PROVIDER_UNAVAILABLE",
                "The AI provider is temporarily unavailable.",
                status_code=502,
            ) from None
        if not addresses:
            raise AiDomainError(
                "AI_PROVIDER_UNAVAILABLE",
                "The AI provider is temporarily unavailable.",
                status_code=502,
            )
        for address in addresses:
            try:
                ipaddress.ip_address(address)
            except ValueError:
                raise AiDomainError(
                    "AI_PROVIDER_UNAVAILABLE",
                    "The AI provider is temporarily unavailable.",
                    status_code=502,
                ) from None
            if _address_is_blocked(address):
                raise AiDomainError(
                    "AI_PROVIDER_HOST_NOT_ALLOWED",
                    "The AI provider endpoint is not permitted.",
                    status_code=403,
                )
        return ProviderConnectionOptions(
            endpoint=endpoint,
            scheme="http",
            host=host,
            port=port,
            resolved_addresses=addresses,
            bearer_token=bearer_token,
            connect_timeout_seconds=self._connect_timeout_seconds,
            read_timeout_seconds=self._read_timeout_seconds,
            write_timeout_seconds=self._write_timeout_seconds,
            pool_timeout_seconds=self._pool_timeout_seconds,
            max_response_bytes=self._max_stream_bytes,
        )

    def _load_dependencies(self) -> McpSdkDependencies:
        try:
            dependencies = self._dependency_loader()
        except Exception:
            raise AiDomainError(
                "AI_PROVIDER_UNAVAILABLE",
                "The AI provider client runtime is unavailable.",
                status_code=503,
            ) from None
        if not isinstance(dependencies, McpSdkDependencies):
            raise AiDomainError(
                "AI_PROVIDER_UNAVAILABLE",
                "The AI provider client runtime is unavailable.",
                status_code=503,
            )
        return dependencies

    def _endpoint(self) -> str:
        try:
            canonical_base_url = _normalize_provider_base_url(self.config.base_url)
        except (AiDomainError, ValueError):
            raise AiDomainError(
                "AI_PROVIDER_ENDPOINT_INVALID",
                "The AI provider endpoint is invalid.",
                status_code=400,
            ) from None
        if urlsplit(canonical_base_url).query:
            raise AiDomainError(
                "AI_PROVIDER_ENDPOINT_INVALID",
                "The AI provider endpoint is invalid.",
                status_code=400,
            )
        return f"{canonical_base_url.rstrip('/')}/chat/completions"

    async def stream(self, messages: list[dict[str, str]]) -> AsyncIterator[str]:
        if self.config.auth_mode not in {"none", "bearer"}:
            raise AiDomainError(
                "AI_PROVIDER_CONFIGURATION_INVALID",
                "The AI provider authentication mode is invalid.",
                status_code=503,
            )
        if self.config.auth_mode == "bearer" and not self.config.api_key:
            raise AiDomainError(
                "AI_PROVIDER_NOT_CONFIGURED",
                "The selected AI provider does not have an API key.",
                status_code=503,
            )
        endpoint = self._endpoint()
        options = await self._connection_options(endpoint)
        dependencies = self._load_dependencies()
        payload = {
            "model": self.config.model,
            "messages": messages,
            "stream": True,
            "max_tokens": self._max_output_tokens,
        }
        emitted_characters = 0
        try:
            http_client = self._build_http_client(dependencies, options)
            async with asyncio.timeout(self._total_timeout_seconds):
                async with http_client:
                    async with http_client.stream(
                        "POST",
                        options.endpoint,
                        json=payload,
                    ) as response:
                        if response.status_code == 429:
                            raise AiDomainError(
                                "AI_RATE_LIMITED",
                                "The AI provider is busy. Try again shortly.",
                                status_code=429,
                            )
                        if response.status_code >= 300:
                            raise AiDomainError(
                                "AI_PROVIDER_UNAVAILABLE",
                                "The AI provider could not complete this request.",
                                status_code=502,
                            )
                        async for raw_line in response.aiter_lines():
                            if not raw_line.startswith("data:"):
                                continue
                            raw = raw_line.removeprefix("data:").strip()
                            if raw == "[DONE]":
                                break
                            try:
                                body = json.loads(raw)
                                delta = body["choices"][0]["delta"].get("content")
                            except (KeyError, IndexError, TypeError, json.JSONDecodeError):
                                continue
                            if isinstance(delta, str) and delta:
                                emitted_characters += len(delta)
                                if emitted_characters > self._max_stream_characters:
                                    raise AiDomainError(
                                        "AI_PROVIDER_RESPONSE_TOO_LARGE",
                                        "The AI provider response is too large.",
                                        status_code=502,
                                    )
                                yield delta
        except AiDomainError:
            raise
        except Exception as exc:
            if _exception_tree_contains(exc, _McpResponseTooLarge):
                raise AiDomainError(
                    "AI_PROVIDER_RESPONSE_TOO_LARGE",
                    "The AI provider response is too large.",
                    status_code=502,
                ) from None
            if _exception_tree_contains(exc, _McpEndpointPolicyViolation):
                raise AiDomainError(
                    "AI_PROVIDER_HOST_NOT_ALLOWED",
                    "The AI provider endpoint is not permitted.",
                    status_code=403,
                ) from None
            if _exception_tree_contains(exc, _McpProtocolViolation):
                raise AiDomainError(
                    "AI_PROVIDER_PROTOCOL_ERROR",
                    "The AI provider returned an unsupported response.",
                    status_code=502,
                ) from None
            timeout_type: Any = getattr(dependencies.httpx2, "TimeoutException", None)
            if _exception_tree_is_timeout(exc, timeout_type):
                raise AiDomainError(
                    "AI_PROVIDER_TIMEOUT",
                    "The AI provider did not respond in time.",
                    status_code=504,
                ) from None
            raise AiDomainError(
                "AI_PROVIDER_UNAVAILABLE",
                "The AI provider is temporarily unavailable.",
                status_code=502,
            ) from None

    @staticmethod
    def _build_http_client(
        dependencies: McpSdkDependencies,
        options: ProviderConnectionOptions,
    ) -> object:
        timeout = dependencies.httpx2.Timeout(
            connect=options.connect_timeout_seconds,
            read=options.read_timeout_seconds,
            write=options.write_timeout_seconds,
            pool=options.pool_timeout_seconds,
        )
        headers = None
        if options.bearer_token is not None:
            headers = {"Authorization": f"Bearer {options.bearer_token}"}

        pinned_address = options.resolved_addresses[0]
        default_port = 443 if options.scheme == "https" else 80
        host_header = _host_header(options.host)
        if options.port != default_port:
            host_header = f"{host_header}:{options.port}"

        async def pin_validated_address(request: object) -> None:
            try:
                request_host = request.url.raw_host.decode("ascii").lower()
            except (AttributeError, UnicodeError):
                raise _McpEndpointPolicyViolation from None
            if request_host != options.host:
                raise _McpEndpointPolicyViolation
            request.headers["Host"] = host_header
            request.headers["Accept-Encoding"] = "identity"
            if options.scheme == "https":
                request.extensions["sni_hostname"] = options.host
            request.url = request.url.copy_with(host=pinned_address)

        stream_base = dependencies.httpx2.AsyncByteStream

        class LimitedResponseStream(stream_base):
            def __init__(self, stream: object):
                self._stream = stream

            async def __aiter__(self):
                received = 0
                async for chunk in self._stream:
                    received += len(chunk)
                    if received > options.max_response_bytes:
                        raise _McpResponseTooLarge
                    yield chunk

            async def aclose(self) -> None:
                await self._stream.aclose()

        async def limit_response(response: object) -> None:
            content_encoding = response.headers.get("content-encoding", "identity")
            if content_encoding.strip().lower() not in ("", "identity"):
                raise _McpProtocolViolation
            content_length = response.headers.get("content-length")
            if content_length is not None:
                try:
                    if int(content_length) > options.max_response_bytes:
                        raise _McpResponseTooLarge
                except ValueError:
                    pass
            response.stream = LimitedResponseStream(response.stream)

        return dependencies.httpx2.AsyncClient(
            headers=headers,
            timeout=timeout,
            follow_redirects=False,
            trust_env=False,
            event_hooks={
                "request": [pin_validated_address],
                "response": [limit_response],
            },
        )


class ProviderRegistry:
    @staticmethod
    def create(config: ProviderConfig) -> AiProvider:
        return OpenAiCompatibleProvider(config)
