from __future__ import annotations

import asyncio
import base64
import importlib
import inspect
import ipaddress
import json
import math
import socket
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import asdict, dataclass, field, is_dataclass
from datetime import date, datetime
from decimal import Decimal
from enum import Enum
from typing import Any, Protocol
from urllib.parse import urlsplit, urlunsplit

from .errors import AiDomainError


DEFAULT_CONNECT_TIMEOUT_SECONDS = 5.0
DEFAULT_READ_TIMEOUT_SECONDS = 30.0
DEFAULT_WRITE_TIMEOUT_SECONDS = 10.0
DEFAULT_POOL_TIMEOUT_SECONDS = 5.0
DEFAULT_MAX_OUTPUT_BYTES = 64 * 1024
DEFAULT_MAX_DISCOVERY_BYTES = 1024 * 1024
DEFAULT_MAX_RESPONSE_BYTES = 2 * 1024 * 1024
MIN_OUTPUT_BYTES = 128
MAX_BUFFERED_BYTES = 16 * 1024 * 1024
MAX_TOOL_NAME_LENGTH = 256
MAX_DISCOVERY_PAGES = 100
MCP_REQUEST_TIMEOUT_CODE = -32001


@dataclass(frozen=True)
class McpConnectionOptions:
    endpoint: str = field(repr=False)
    host: str = field(repr=False)
    resolved_addresses: tuple[str, ...] = field(repr=False)
    bearer_token: str | None = field(default=None, repr=False)
    connect_timeout_seconds: float = DEFAULT_CONNECT_TIMEOUT_SECONDS
    read_timeout_seconds: float = DEFAULT_READ_TIMEOUT_SECONDS
    write_timeout_seconds: float = DEFAULT_WRITE_TIMEOUT_SECONDS
    pool_timeout_seconds: float = DEFAULT_POOL_TIMEOUT_SECONDS
    max_response_bytes: int = DEFAULT_MAX_RESPONSE_BYTES
    max_discovery_bytes: int = DEFAULT_MAX_DISCOVERY_BYTES


class McpDnsResolver(Protocol):
    async def resolve(self, host: str, port: int) -> Sequence[str]: ...


class McpConnector(Protocol):
    async def list_tools(self, options: McpConnectionOptions) -> object: ...

    async def call_tool(
        self,
        options: McpConnectionOptions,
        name: str,
        arguments: dict[str, object],
    ) -> object: ...


class SystemMcpDnsResolver:
    async def resolve(self, host: str, port: int) -> Sequence[str]:
        loop = asyncio.get_running_loop()
        records = await loop.getaddrinfo(
            host,
            port,
            family=socket.AF_UNSPEC,
            type=socket.SOCK_STREAM,
            proto=socket.IPPROTO_TCP,
        )
        addresses: list[str] = []
        for record in records:
            address = record[4][0]
            if address not in addresses:
                addresses.append(address)
        return addresses


@dataclass(frozen=True)
class McpSdkDependencies:
    """Late-loaded MCP 2.x dependencies; public so tests can supply fakes."""

    httpx2: Any
    client_class: Any
    streamable_http_client: Any


class _McpEndpointPolicyViolation(Exception):
    pass


class _McpResponseTooLarge(Exception):
    pass


class _McpProtocolViolation(Exception):
    pass


def _load_mcp_sdk_dependencies() -> McpSdkDependencies:
    try:
        httpx2 = importlib.import_module("httpx2")
        mcp = importlib.import_module("mcp")
        transport_module = importlib.import_module("mcp.client.streamable_http")
        client_class = getattr(mcp, "Client")
        streamable_http_client = getattr(transport_module, "streamable_http_client")
    except (ImportError, ModuleNotFoundError, AttributeError):
        raise AiDomainError(
            "AI_MCP_SDK_UNAVAILABLE",
            "The MCP client runtime is unavailable.",
            status_code=503,
        ) from None
    return McpSdkDependencies(
        httpx2=httpx2,
        client_class=client_class,
        streamable_http_client=streamable_http_client,
    )


class OfficialMcpConnector:
    """MCP 2.x Streamable HTTP connector with an owned, locked-down client."""

    def __init__(self, dependency_loader: Any | None = None):
        self._dependency_loader = dependency_loader or _load_mcp_sdk_dependencies

    async def list_tools(self, options: McpConnectionOptions) -> object:
        return await self._run(options, operation="list_tools")

    async def call_tool(
        self,
        options: McpConnectionOptions,
        name: str,
        arguments: dict[str, object],
    ) -> object:
        return await self._run(
            options,
            operation="call_tool",
            name=name,
            arguments=arguments,
        )

    async def _run(
        self,
        options: McpConnectionOptions,
        *,
        operation: str,
        name: str | None = None,
        arguments: dict[str, object] | None = None,
    ) -> object:
        dependencies = self._load_dependencies()
        http_client = self._build_http_client(dependencies, options)
        try:
            async with http_client:
                transport = dependencies.streamable_http_client(
                    options.endpoint,
                    http_client=http_client,
                    terminate_on_close=True,
                )
                client = dependencies.client_class(
                    transport,
                    read_timeout_seconds=options.read_timeout_seconds,
                    cache=None,
                )
                async with client as session:
                    if operation == "list_tools":
                        return await self._list_all_tools(session, options)
                    return await session.call_tool(
                        name,
                        arguments,
                        read_timeout_seconds=options.read_timeout_seconds,
                    )
        except AiDomainError:
            raise
        except Exception as exc:
            timeout_type = getattr(dependencies.httpx2, "TimeoutException", None)
            if _exception_tree_contains(exc, _McpEndpointPolicyViolation):
                raise AiDomainError(
                    "AI_MCP_HOST_NOT_ALLOWED",
                    "The MCP endpoint is not permitted.",
                    status_code=403,
                ) from None
            if _exception_tree_contains(exc, _McpResponseTooLarge):
                raise AiDomainError(
                    "AI_MCP_RESPONSE_TOO_LARGE",
                    "The MCP server response is too large.",
                    status_code=502,
                ) from None
            if _exception_tree_contains(exc, _McpProtocolViolation):
                raise AiDomainError(
                    "AI_MCP_PROTOCOL_ERROR",
                    "The MCP server returned an unsupported response.",
                    status_code=502,
                ) from None
            if _exception_tree_is_timeout(exc, timeout_type):
                raise AiDomainError(
                    "AI_MCP_TIMEOUT",
                    "The MCP server did not respond in time.",
                    status_code=504,
                ) from None
            raise AiDomainError(
                "AI_MCP_UNAVAILABLE",
                "The MCP server is temporarily unavailable.",
                status_code=502,
            ) from None

    @staticmethod
    async def _list_all_tools(session: object, options: McpConnectionOptions) -> object:
        tools: list[dict[str, object]] = []
        cursor: str | None = None
        seen_cursors: set[str] = set()
        for _ in range(MAX_DISCOVERY_PAGES):
            try:
                page = await session.list_tools(cursor=cursor, cache_mode="bypass")
                page_tools = _serialize_tools(page)
            except AiDomainError:
                raise
            except Exception:
                raise AiDomainError(
                    "AI_MCP_PROTOCOL_ERROR",
                    "The MCP server returned an invalid tool catalog.",
                    status_code=502,
                ) from None
            tools.extend(page_tools)
            if _json_size(tools) > options.max_discovery_bytes:
                raise AiDomainError(
                    "AI_MCP_RESPONSE_TOO_LARGE",
                    "The MCP server returned too much tool metadata.",
                    status_code=502,
                )
            next_cursor = _field(page, "nextCursor", "next_cursor")
            if next_cursor is None:
                return {"tools": tools}
            if (
                not isinstance(next_cursor, str)
                or not next_cursor
                or next_cursor in seen_cursors
            ):
                raise AiDomainError(
                    "AI_MCP_PROTOCOL_ERROR",
                    "The MCP server returned an invalid tool catalog.",
                    status_code=502,
                )
            seen_cursors.add(next_cursor)
            cursor = next_cursor
        raise AiDomainError(
            "AI_MCP_PROTOCOL_ERROR",
            "The MCP tool catalog has too many pages.",
            status_code=502,
        )

    def _load_dependencies(self) -> McpSdkDependencies:
        try:
            dependencies = self._dependency_loader()
        except AiDomainError:
            raise
        except (ImportError, ModuleNotFoundError, AttributeError):
            raise AiDomainError(
                "AI_MCP_SDK_UNAVAILABLE",
                "The MCP client runtime is unavailable.",
                status_code=503,
            ) from None
        if not isinstance(dependencies, McpSdkDependencies):
            raise AiDomainError(
                "AI_MCP_SDK_UNAVAILABLE",
                "The MCP client runtime is unavailable.",
                status_code=503,
            )
        return dependencies

    @staticmethod
    def _build_http_client(
        dependencies: McpSdkDependencies,
        options: McpConnectionOptions,
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
        host_header = _host_header(options.host)

        async def pin_validated_address(request: object) -> None:
            try:
                request_host = request.url.raw_host.decode("ascii").lower()
            except (AttributeError, UnicodeError):
                raise _McpEndpointPolicyViolation from None
            if request_host != options.host:
                raise _McpEndpointPolicyViolation
            request.headers["Host"] = host_header
            request.headers["Accept-Encoding"] = "identity"
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


class McpGateway:
    """Policy boundary for remote MCP discovery and tool calls."""

    def __init__(
        self,
        *,
        allowed_hosts: Iterable[str],
        resolver: McpDnsResolver | None = None,
        connector: McpConnector | None = None,
        connect_timeout_seconds: float = DEFAULT_CONNECT_TIMEOUT_SECONDS,
        read_timeout_seconds: float = DEFAULT_READ_TIMEOUT_SECONDS,
        write_timeout_seconds: float = DEFAULT_WRITE_TIMEOUT_SECONDS,
        pool_timeout_seconds: float = DEFAULT_POOL_TIMEOUT_SECONDS,
        max_output_bytes: int = DEFAULT_MAX_OUTPUT_BYTES,
        max_discovery_bytes: int = DEFAULT_MAX_DISCOVERY_BYTES,
        max_response_bytes: int = DEFAULT_MAX_RESPONSE_BYTES,
    ):
        self._exact_hosts, self._wildcard_suffixes = _normalize_allowed_hosts(allowed_hosts)
        self._resolver = resolver or SystemMcpDnsResolver()
        self._connector = connector or OfficialMcpConnector()
        self._connect_timeout_seconds = _positive_timeout(connect_timeout_seconds)
        self._read_timeout_seconds = _positive_timeout(read_timeout_seconds)
        self._write_timeout_seconds = _positive_timeout(write_timeout_seconds)
        self._pool_timeout_seconds = _positive_timeout(pool_timeout_seconds)
        self._max_output_bytes = _byte_limit(max_output_bytes)
        self._max_discovery_bytes = _byte_limit(max_discovery_bytes)
        self._max_response_bytes = _byte_limit(max_response_bytes)
        if self._max_response_bytes < max(
            self._max_output_bytes,
            self._max_discovery_bytes,
        ):
            raise AiDomainError(
                "AI_MCP_CONFIGURATION_INVALID",
                "The MCP gateway response limit is invalid.",
                status_code=503,
            )

    async def discover(
        self,
        endpoint: str,
        *,
        bearer_token: str | None = None,
    ) -> list[dict[str, object]]:
        options = await self._validated_options(endpoint, bearer_token)
        result = await self._invoke(lambda: self._connector.list_tools(options))
        try:
            tools = _serialize_tools(result)
            if _json_size(tools) > self._max_discovery_bytes:
                raise AiDomainError(
                    "AI_MCP_RESPONSE_TOO_LARGE",
                    "The MCP server returned too much tool metadata.",
                    status_code=502,
                )
            return tools
        except AiDomainError:
            raise
        except Exception:
            raise AiDomainError(
                "AI_MCP_PROTOCOL_ERROR",
                "The MCP server returned an invalid tool catalog.",
                status_code=502,
            ) from None

    async def discover_tools(
        self,
        endpoint: str,
        *,
        bearer_token: str | None = None,
    ) -> list[dict[str, object]]:
        return await self.discover(endpoint, bearer_token=bearer_token)

    async def call_tool(
        self,
        endpoint: str,
        name: str,
        arguments: Mapping[str, object] | None = None,
        *,
        bearer_token: str | None = None,
    ) -> object:
        if not isinstance(name, str) or not name.strip() or len(name) > MAX_TOOL_NAME_LENGTH:
            raise AiDomainError(
                "AI_MCP_TOOL_CALL_INVALID",
                "The MCP tool call is invalid.",
                status_code=400,
            )
        if arguments is not None and not isinstance(arguments, Mapping):
            raise AiDomainError(
                "AI_MCP_TOOL_CALL_INVALID",
                "The MCP tool call is invalid.",
                status_code=400,
            )
        try:
            options = await self._validated_options(endpoint, bearer_token)
        except AiDomainError as error:
            # Validation and DNS resolution happen before the connector can dispatch.
            setattr(error, "mcp_dispatched", False)
            raise
        call_arguments = dict(arguments or {})
        result = await self._invoke(
            lambda: self._connector.call_tool(options, name, call_arguments)
        )
        try:
            normalized = _to_jsonable(result)
            if not isinstance(normalized, Mapping):
                raise ValueError("invalid tool result")

            is_error = normalized.get(
                "isError",
                normalized.get("is_error", False),
            )
            if not isinstance(is_error, bool):
                raise ValueError("invalid isError value")
            if is_error:
                raise AiDomainError(
                    "AI_MCP_REMOTE_ERROR",
                    "The MCP tool reported that it could not complete the requested operation.",
                    status_code=502,
                )

            result_type = normalized.get(
                "resultType",
                normalized.get("result_type", "complete"),
            )
            if result_type != "complete":
                raise AiDomainError(
                    "AI_MCP_PROTOCOL_ERROR",
                    "The MCP server returned an incomplete tool result.",
                    status_code=502,
                )
            return _bounded_json_value(normalized, self._max_output_bytes)
        except AiDomainError:
            raise
        except Exception:
            raise AiDomainError(
                "AI_MCP_PROTOCOL_ERROR",
                "The MCP server returned an invalid tool result.",
                status_code=502,
            ) from None

    async def _validated_options(
        self,
        endpoint: str,
        bearer_token: str | None,
    ) -> McpConnectionOptions:
        host, canonical_endpoint = _validate_endpoint(endpoint)
        if not self._host_is_allowed(host):
            raise AiDomainError(
                "AI_MCP_HOST_NOT_ALLOWED",
                "The MCP endpoint is not permitted.",
                status_code=403,
            )
        _validate_bearer_token(bearer_token)
        addresses = await self._resolve(host)
        for address in addresses:
            if _address_is_blocked(address):
                raise AiDomainError(
                    "AI_MCP_ADDRESS_BLOCKED",
                    "The MCP endpoint is not permitted.",
                    status_code=403,
                )
        return McpConnectionOptions(
            endpoint=canonical_endpoint,
            host=host,
            resolved_addresses=tuple(address.split("%", 1)[0] for address in addresses),
            bearer_token=bearer_token,
            connect_timeout_seconds=self._connect_timeout_seconds,
            read_timeout_seconds=self._read_timeout_seconds,
            write_timeout_seconds=self._write_timeout_seconds,
            pool_timeout_seconds=self._pool_timeout_seconds,
            max_response_bytes=self._max_response_bytes,
            max_discovery_bytes=self._max_discovery_bytes,
        )

    async def _resolve(self, host: str) -> tuple[str, ...]:
        try:
            resolve = getattr(self._resolver, "resolve", self._resolver)
            outcome = resolve(host, 443)
            if inspect.isawaitable(outcome):
                outcome = await asyncio.wait_for(
                    outcome,
                    timeout=self._connect_timeout_seconds,
                )
            if isinstance(outcome, str):
                outcome = [outcome]
            addresses = tuple(dict.fromkeys(str(item) for item in outcome))
        except TimeoutError:
            raise AiDomainError(
                "AI_MCP_TIMEOUT",
                "The MCP endpoint could not be resolved in time.",
                status_code=504,
            ) from None
        except Exception:
            raise AiDomainError(
                "AI_MCP_DNS_FAILED",
                "The MCP endpoint could not be resolved.",
                status_code=502,
            ) from None
        if not addresses:
            raise AiDomainError(
                "AI_MCP_DNS_FAILED",
                "The MCP endpoint could not be resolved.",
                status_code=502,
            )
        for address in addresses:
            try:
                ipaddress.ip_address(address.split("%", 1)[0])
            except ValueError:
                raise AiDomainError(
                    "AI_MCP_DNS_FAILED",
                    "The MCP endpoint could not be resolved.",
                    status_code=502,
                ) from None
        return addresses

    def _host_is_allowed(self, host: str) -> bool:
        if host in self._exact_hosts:
            return True
        return any(host.endswith(f".{suffix}") for suffix in self._wildcard_suffixes)

    @staticmethod
    async def _invoke(operation: Any) -> object:
        try:
            return await operation()
        except AiDomainError:
            raise
        except (ImportError, ModuleNotFoundError, AttributeError):
            raise AiDomainError(
                "AI_MCP_SDK_UNAVAILABLE",
                "The MCP client runtime is unavailable.",
                status_code=503,
            ) from None
        except TimeoutError:
            raise AiDomainError(
                "AI_MCP_TIMEOUT",
                "The MCP server did not respond in time.",
                status_code=504,
            ) from None
        except Exception as exc:
            if _exception_tree_is_timeout(exc, None):
                raise AiDomainError(
                    "AI_MCP_TIMEOUT",
                    "The MCP server did not respond in time.",
                    status_code=504,
                ) from None
            raise AiDomainError(
                "AI_MCP_UNAVAILABLE",
                "The MCP server is temporarily unavailable.",
                status_code=502,
            ) from None


def _positive_timeout(value: float) -> float:
    if not isinstance(value, int | float) or isinstance(value, bool):
        valid = False
    else:
        valid = math.isfinite(float(value)) and float(value) > 0
    if not valid:
        raise AiDomainError(
            "AI_MCP_CONFIGURATION_INVALID",
            "The MCP gateway timeout configuration is invalid.",
            status_code=503,
        )
    return float(value)


def _byte_limit(value: int) -> int:
    if (
        not isinstance(value, int)
        or isinstance(value, bool)
        or value < MIN_OUTPUT_BYTES
        or value > MAX_BUFFERED_BYTES
    ):
        raise AiDomainError(
            "AI_MCP_CONFIGURATION_INVALID",
            "The MCP gateway byte limit is invalid.",
            status_code=503,
        )
    return value


def _normalize_allowed_hosts(allowed_hosts: Iterable[str]) -> tuple[frozenset[str], frozenset[str]]:
    if isinstance(allowed_hosts, str):
        allowed_hosts = [allowed_hosts]
    exact: set[str] = set()
    wildcards: set[str] = set()
    try:
        values = list(allowed_hosts)
    except TypeError:
        values = []
    for value in values:
        if not isinstance(value, str) or not value or value != value.strip():
            _invalid_host_configuration()
        if value.startswith("*."):
            suffix = _normalize_host(value[2:])
            if _looks_like_ip(suffix) or suffix.count(".") < 1:
                _invalid_host_configuration()
            wildcards.add(suffix)
        elif "*" in value:
            _invalid_host_configuration()
        else:
            exact.add(_normalize_host(value))
    if not exact and not wildcards:
        _invalid_host_configuration()
    return frozenset(exact), frozenset(wildcards)


def _invalid_host_configuration() -> None:
    raise AiDomainError(
        "AI_MCP_CONFIGURATION_INVALID",
        "The MCP gateway host policy is invalid.",
        status_code=503,
    )


def _normalize_host(host: str) -> str:
    normalized = host[:-1] if host.endswith(".") else host
    try:
        address = ipaddress.ip_address(normalized)
    except ValueError:
        try:
            normalized = normalized.encode("idna").decode("ascii").lower()
        except (UnicodeError, ValueError):
            _invalid_host_configuration()
        labels = normalized.split(".")
        if (
            not normalized
            or len(normalized) > 253
            or any(not label or len(label) > 63 for label in labels)
            or any(label.startswith("-") or label.endswith("-") for label in labels)
        ):
            _invalid_host_configuration()
        return normalized
    return address.compressed.lower()


def _looks_like_ip(host: str) -> bool:
    try:
        ipaddress.ip_address(host)
    except ValueError:
        return False
    return True


def _validate_endpoint(endpoint: str) -> tuple[str, str]:
    if (
        not isinstance(endpoint, str)
        or not endpoint
        or len(endpoint) > 2048
        or any(character.isspace() or ord(character) < 32 for character in endpoint)
    ):
        _invalid_endpoint()
    try:
        parsed = urlsplit(endpoint)
        port = parsed.port
    except (TypeError, ValueError):
        _invalid_endpoint()
    if (
        parsed.scheme.lower() != "https"
        or not parsed.hostname
        or parsed.username is not None
        or parsed.password is not None
        or parsed.fragment
        or (port is not None and port != 443)
    ):
        _invalid_endpoint()
    try:
        host = _normalize_host(parsed.hostname)
    except AiDomainError:
        _invalid_endpoint()
    authority = _host_header(host)
    canonical_endpoint = urlunsplit(
        ("https", authority, parsed.path, parsed.query, "")
    )
    return host, canonical_endpoint


def _invalid_endpoint() -> None:
    raise AiDomainError(
        "AI_MCP_ENDPOINT_INVALID",
        "The MCP endpoint must be an HTTPS URL on port 443.",
        status_code=400,
    )


def _validate_bearer_token(token: str | None) -> None:
    if token is None:
        return
    if (
        not isinstance(token, str)
        or not token
        or len(token) > 16 * 1024
        or "\r" in token
        or "\n" in token
    ):
        raise AiDomainError(
            "AI_MCP_CREDENTIAL_INVALID",
            "The MCP credential is invalid.",
            status_code=400,
        )


def _address_is_blocked(address: str) -> bool:
    parsed = ipaddress.ip_address(address.split("%", 1)[0])
    if isinstance(parsed, ipaddress.IPv6Address) and parsed.ipv4_mapped is not None:
        parsed = parsed.ipv4_mapped
    return (
        parsed.is_loopback
        or parsed.is_private
        or parsed.is_link_local
        or parsed.is_multicast
        or parsed.is_reserved
        or parsed.is_unspecified
        or not parsed.is_global
    )


def _host_header(host: str) -> str:
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        return host
    if isinstance(address, ipaddress.IPv6Address):
        return f"[{host}]"
    return host


def _exception_tree_contains(exception: BaseException, exception_type: type[BaseException]) -> bool:
    if isinstance(exception, exception_type):
        return True
    nested = getattr(exception, "exceptions", ())
    return isinstance(nested, tuple) and any(
        _exception_tree_contains(item, exception_type)
        for item in nested
        if isinstance(item, BaseException)
    )


def _exception_tree_is_timeout(
    exception: BaseException,
    http_timeout_type: object,
) -> bool:
    if isinstance(exception, TimeoutError) or getattr(exception, "code", None) == MCP_REQUEST_TIMEOUT_CODE:
        return True
    if isinstance(http_timeout_type, type) and isinstance(exception, http_timeout_type):
        return True
    nested = getattr(exception, "exceptions", ())
    return isinstance(nested, tuple) and any(
        _exception_tree_is_timeout(item, http_timeout_type)
        for item in nested
        if isinstance(item, BaseException)
    )


def _serialize_tools(result: object) -> list[dict[str, object]]:
    raw_tools: object
    if isinstance(result, Mapping):
        raw_tools = result.get("tools")
    else:
        raw_tools = getattr(result, "tools", None)
    if not isinstance(raw_tools, Iterable) or isinstance(raw_tools, str | bytes | Mapping):
        raise ValueError("invalid tool catalog")
    tools: list[dict[str, object]] = []
    for tool in raw_tools:
        name = _field(tool, "name")
        description = _field(tool, "description")
        input_schema = _field(tool, "inputSchema", "input_schema")
        annotations = _field(tool, "annotations")
        if not isinstance(name, str) or not name or len(name) > MAX_TOOL_NAME_LENGTH:
            raise ValueError("invalid tool name")
        if description is not None and not isinstance(description, str):
            raise ValueError("invalid tool description")
        if input_schema is None:
            input_schema = {}
        normalized_schema = _to_jsonable(input_schema)
        if not isinstance(normalized_schema, dict):
            raise ValueError("invalid tool schema")
        normalized_annotations = (
            _to_jsonable(annotations) if annotations is not None else {}
        )
        if not isinstance(normalized_annotations, dict):
            raise ValueError("invalid tool annotations")
        tools.append(
            {
                "name": name,
                "description": description,
                "inputSchema": normalized_schema,
                "annotations": normalized_annotations,
            }
        )
    return tools


def _field(value: object, *names: str) -> object:
    if isinstance(value, Mapping):
        for name in names:
            if name in value:
                return value[name]
        return None
    for name in names:
        if hasattr(value, name):
            return getattr(value, name)
    return None


def _bounded_json_value(value: object, max_bytes: int) -> object:
    normalized = _to_jsonable(value)
    serialized = _json_dumps(normalized)
    original_bytes = len(serialized.encode("utf-8"))
    if original_bytes <= max_bytes:
        return normalized
    low = 0
    high = len(serialized)
    best: dict[str, object] = {"_truncated": True, "preview": ""}
    while low <= high:
        middle = (low + high) // 2
        candidate: dict[str, object] = {
            "_truncated": True,
            "originalBytes": original_bytes,
            "preview": serialized[:middle],
        }
        if _json_size(candidate) <= max_bytes:
            best = candidate
            low = middle + 1
        else:
            high = middle - 1
    return best


def _to_jsonable(value: object, *, _depth: int = 0, _seen: set[int] | None = None) -> object:
    if _depth > 40:
        return "[maximum depth exceeded]"
    if value is None or isinstance(value, str | bool | int):
        return value
    if isinstance(value, float):
        return value if math.isfinite(value) else str(value)
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, Enum):
        return _to_jsonable(value.value, _depth=_depth + 1, _seen=_seen)
    if isinstance(value, datetime | date):
        return value.isoformat()
    if isinstance(value, bytes | bytearray | memoryview):
        return {
            "encoding": "base64",
            "data": base64.b64encode(bytes(value)).decode("ascii"),
        }

    seen = _seen if _seen is not None else set()
    identity = id(value)
    if identity in seen:
        return "[circular reference]"
    seen.add(identity)
    try:
        model_dump = getattr(value, "model_dump", None)
        if callable(model_dump):
            try:
                dumped = model_dump(mode="json", by_alias=True, exclude_none=True)
            except TypeError:
                dumped = model_dump()
            return _to_jsonable(dumped, _depth=_depth + 1, _seen=seen)
        if is_dataclass(value) and not isinstance(value, type):
            return _to_jsonable(asdict(value), _depth=_depth + 1, _seen=seen)
        if isinstance(value, Mapping):
            return {
                str(key): _to_jsonable(item, _depth=_depth + 1, _seen=seen)
                for key, item in value.items()
            }
        if isinstance(value, Sequence) and not isinstance(value, str | bytes | bytearray):
            return [_to_jsonable(item, _depth=_depth + 1, _seen=seen) for item in value]
        if isinstance(value, set | frozenset):
            return [_to_jsonable(item, _depth=_depth + 1, _seen=seen) for item in value]
        return str(value)
    finally:
        seen.remove(identity)


def _json_dumps(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False)


def _json_size(value: object) -> int:
    return len(_json_dumps(value).encode("utf-8"))
