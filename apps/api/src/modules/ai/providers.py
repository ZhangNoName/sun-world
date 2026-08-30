from __future__ import annotations

import asyncio
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
    OfficialMcpConnector,
    _exception_tree_contains,
    _exception_tree_is_timeout,
    _load_mcp_sdk_dependencies,
    _McpEndpointPolicyViolation,
    _McpProtocolViolation,
    _McpResponseTooLarge,
    _validate_endpoint,
)


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
    api_key: str | None = field(default=None, repr=False)


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
            return await gateway._validated_options(endpoint, self.config.api_key)
        except AiDomainError as error:
            raise _policy_error(error) from None

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
            _host, canonical_base_url = _validate_endpoint(self.config.base_url)
        except AiDomainError as error:
            raise _policy_error(error) from None
        if urlsplit(canonical_base_url).query:
            raise AiDomainError(
                "AI_PROVIDER_ENDPOINT_INVALID",
                "The AI provider endpoint is invalid.",
                status_code=400,
            )
        return f"{canonical_base_url.rstrip('/')}/chat/completions"

    async def stream(self, messages: list[dict[str, str]]) -> AsyncIterator[str]:
        if not self.config.api_key:
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
            http_client = OfficialMcpConnector._build_http_client(
                dependencies,
                options,
            )
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


class ProviderRegistry:
    @staticmethod
    def create(config: ProviderConfig) -> AiProvider:
        return OpenAiCompatibleProvider(config)
