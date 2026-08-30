from __future__ import annotations

import asyncio
import json
import math
import os
import time
from collections.abc import Mapping
from typing import Any, Protocol
from uuid import uuid4

from loguru import logger
from pydantic import ValidationError

from .credentials import CredentialCipher
from .errors import AiDomainError
from .mcp_repository import AiMcpRepository
from .mcp_schemas import (
    AI_MCP_MAX_DISCOVERED_TOOLS,
    AiMcpCallTerminalStatus,
    AiMcpConnection,
    AiMcpConnectionCreate,
    AiMcpConnectionUpdate,
    AiMcpDiscoveryResult,
    AiMcpDiscoveredTool,
    AiMcpTool,
    AiMcpToolCallRequest,
    AiMcpToolCallResult,
)


_DEFINITE_CALL_FAILURE_CODES = frozenset(
    {
        "AI_MCP_ADDRESS_BLOCKED",
        "AI_MCP_CONFIGURATION_INVALID",
        "AI_MCP_CREDENTIAL_INVALID",
        "AI_MCP_DNS_FAILED",
        "AI_MCP_ENDPOINT_INVALID",
        "AI_MCP_HOST_NOT_ALLOWED",
        "AI_MCP_REMOTE_ERROR",
        "AI_MCP_SDK_UNAVAILABLE",
        "AI_MCP_TOOL_CALL_INVALID",
    }
)
_OUTCOME_UNKNOWN_MESSAGE = (
    "The external MCP tool may have executed, but its outcome could not be "
    "confirmed. Do not retry automatically."
)
DEFAULT_MCP_DISCOVERY_DEADLINE_SECONDS = 30.0
DEFAULT_MCP_CALL_DEADLINE_SECONDS = 60.0
MAX_MCP_DISCOVERY_DEADLINE_SECONDS = 300.0
MAX_MCP_CALL_DEADLINE_SECONDS = 300.0


class McpGatewayProtocol(Protocol):
    async def discover(
        self,
        endpoint: str,
        bearer_token: str | None = None,
    ) -> list[dict[str, Any]]: ...

    async def call_tool(
        self,
        endpoint: str,
        name: str,
        arguments: dict[str, Any] | None = None,
        bearer_token: str | None = None,
    ) -> Any: ...


def _call_id() -> str:
    return f"mcpcall_{uuid4().hex}"


def _result_metadata(result: Any) -> dict[str, Any]:
    try:
        encoded = json.dumps(
            result,
            ensure_ascii=False,
            allow_nan=False,
            separators=(",", ":"),
        ).encode("utf-8")
    except (TypeError, ValueError) as exc:
        raise AiDomainError(
            "AI_MCP_INVALID_RESULT",
            "The MCP server returned a result that is not valid JSON.",
            status_code=502,
        ) from exc
    return {
        "type": type(result).__name__,
        "json_bytes": len(encoded),
        "truncated": bool(isinstance(result, dict) and result.get("_truncated") is True),
    }


def _validate_tool_result_semantics(result: Any) -> None:
    if not isinstance(result, Mapping):
        return
    has_error_flag = "isError" in result or "is_error" in result
    is_error = result.get("isError", result.get("is_error", False))
    if has_error_flag and not isinstance(is_error, bool):
        raise AiDomainError(
            "AI_MCP_PROTOCOL_ERROR",
            "The MCP server returned an invalid tool result.",
            status_code=502,
        )
    if is_error:
        raise AiDomainError(
            "AI_MCP_REMOTE_ERROR",
            "The MCP tool reported that it could not complete the requested operation.",
            status_code=502,
        )
    result_type = result.get("resultType", result.get("result_type", "complete"))
    if result_type != "complete":
        raise AiDomainError(
            "AI_MCP_PROTOCOL_ERROR",
            "The MCP server returned an incomplete tool result.",
            status_code=502,
        )


def _call_outcome_unknown() -> AiDomainError:
    return AiDomainError(
        "AI_MCP_CALL_OUTCOME_UNKNOWN",
        _OUTCOME_UNKNOWN_MESSAGE,
        status_code=502,
    )


def _is_definite_call_failure(error: AiDomainError) -> bool:
    dispatched = getattr(error, "mcp_dispatched", None)
    return dispatched is False or error.code in _DEFINITE_CALL_FAILURE_CODES


def _discovery_deadline_seconds(configured: float | None) -> float:
    return _bounded_deadline_seconds(
        configured,
        environment_name="AI_MCP_DISCOVERY_DEADLINE_SECONDS",
        default=DEFAULT_MCP_DISCOVERY_DEADLINE_SECONDS,
        maximum=MAX_MCP_DISCOVERY_DEADLINE_SECONDS,
    )


def _call_deadline_seconds(configured: float | None) -> float:
    return _bounded_deadline_seconds(
        configured,
        environment_name="AI_MCP_CALL_DEADLINE_SECONDS",
        default=DEFAULT_MCP_CALL_DEADLINE_SECONDS,
        maximum=MAX_MCP_CALL_DEADLINE_SECONDS,
    )


def _bounded_deadline_seconds(
    configured: float | None,
    *,
    environment_name: str,
    default: float,
    maximum: float,
) -> float:
    raw_value: object = (
        os.getenv(environment_name, str(default)) if configured is None else configured
    )
    try:
        value = float(raw_value)
    except (TypeError, ValueError) as exc:
        raise AiDomainError(
            "AI_MCP_CONFIGURATION_INVALID",
            "The MCP operation deadline configuration is invalid.",
            status_code=503,
        ) from exc
    if (
        isinstance(raw_value, bool)
        or not math.isfinite(value)
        or value <= 0
        or value > maximum
    ):
        raise AiDomainError(
            "AI_MCP_CONFIGURATION_INVALID",
            "The MCP operation deadline configuration is invalid.",
            status_code=503,
        )
    return value


class AiMcpService:
    """User-owned MCP control plane. It never invokes tools autonomously."""

    def __init__(
        self,
        repository: AiMcpRepository,
        gateway: McpGatewayProtocol,
        cipher: CredentialCipher,
        discovery_deadline_seconds: float | None = None,
        call_deadline_seconds: float | None = None,
    ) -> None:
        self.repository = repository
        self.gateway = gateway
        self.cipher = cipher
        self.discovery_deadline_seconds = _discovery_deadline_seconds(
            discovery_deadline_seconds
        )
        self.call_deadline_seconds = _call_deadline_seconds(call_deadline_seconds)

    async def list_connections(self, user_id: int) -> list[AiMcpConnection]:
        return await self.repository.list_connections(user_id)

    async def create_connection(
        self,
        user_id: int,
        value: AiMcpConnectionCreate,
    ) -> AiMcpConnection:
        ciphertext = self.cipher.encrypt(value.bearer_token) if value.bearer_token else None
        hint = self.cipher.hint(value.bearer_token) if value.bearer_token else None
        return await self.repository.create_connection(user_id, value, ciphertext, hint)

    async def update_connection(
        self,
        user_id: int,
        connection_id: str,
        value: AiMcpConnectionUpdate,
    ) -> AiMcpConnection:
        existing = await self.repository.get_connection_record(user_id, connection_id)
        ciphertext = existing.bearer_token_ciphertext
        hint = existing.connection.bearer_token_hint
        if value.clear_bearer_token:
            ciphertext = None
            hint = None
        elif value.bearer_token is not None:
            ciphertext = self.cipher.encrypt(value.bearer_token)
            hint = self.cipher.hint(value.bearer_token)
        normalized = AiMcpConnectionCreate(
            name=value.name,
            endpoint=value.endpoint,
            enabled=value.enabled,
        )
        return await self.repository.update_connection(
            user_id,
            connection_id,
            normalized,
            ciphertext,
            hint,
            existing.connection.revision,
        )

    async def delete_connection(self, user_id: int, connection_id: str) -> None:
        await self.repository.delete_connection(user_id, connection_id)

    async def list_tools(self, user_id: int, connection_id: str) -> list[AiMcpTool]:
        return await self.repository.list_tools(user_id, connection_id)

    @staticmethod
    def _require_enabled(connection: AiMcpConnection) -> None:
        if not connection.enabled:
            raise AiDomainError(
                "AI_MCP_CONNECTION_DISABLED",
                "Enable this MCP connection before contacting it.",
                status_code=409,
            )

    def _decrypt_token(self, ciphertext: str | None) -> str | None:
        return self.cipher.decrypt(ciphertext) if ciphertext else None

    async def discover(
        self,
        user_id: int,
        connection_id: str,
    ) -> AiMcpDiscoveryResult:
        record = await self.repository.get_connection_record(user_id, connection_id)
        self._require_enabled(record.connection)
        token = self._decrypt_token(record.bearer_token_ciphertext)
        try:
            discovered = await asyncio.wait_for(
                self.gateway.discover(
                    record.connection.endpoint,
                    bearer_token=token,
                ),
                timeout=self.discovery_deadline_seconds,
            )
        except TimeoutError:
            raise AiDomainError(
                "AI_MCP_TIMEOUT",
                "MCP tool discovery exceeded its overall deadline.",
                status_code=504,
            ) from None
        except AiDomainError:
            raise
        except Exception as exc:
            raise AiDomainError(
                "AI_MCP_DISCOVERY_FAILED",
                "The MCP server could not be reached or returned an invalid discovery response.",
                status_code=502,
            ) from exc
        if len(discovered) > AI_MCP_MAX_DISCOVERED_TOOLS:
            raise AiDomainError(
                "AI_MCP_TOO_MANY_TOOLS",
                f"MCP discovery cannot return more than {AI_MCP_MAX_DISCOVERED_TOOLS} tools.",
                status_code=502,
            )
        try:
            tools = [AiMcpDiscoveredTool.model_validate(item) for item in discovered]
        except ValidationError as exc:
            raise AiDomainError(
                "AI_MCP_INVALID_DISCOVERY",
                "The MCP server returned invalid tool metadata.",
                status_code=502,
            ) from exc
        names = [tool.name for tool in tools]
        if len(names) != len(set(names)):
            raise AiDomainError(
                "AI_MCP_INVALID_DISCOVERY",
                "The MCP server returned duplicate tool names.",
                status_code=502,
            )
        connection, stored = await self.repository.replace_tools(
            user_id,
            connection_id,
            tools,
            record.connection.revision,
        )
        return AiMcpDiscoveryResult(connection=connection, tools=stored)

    async def call_tool(
        self,
        user_id: int,
        connection_id: str,
        tool_name: str,
        value: AiMcpToolCallRequest,
    ) -> AiMcpToolCallResult:
        if value.confirmed is not True:
            raise AiDomainError(
                "AI_MCP_CONFIRMATION_REQUIRED",
                "Confirm this MCP tool call before it is sent to the external server.",
                status_code=409,
            )
        record = await self.repository.get_connection_record(user_id, connection_id)
        self._require_enabled(record.connection)
        token = self._decrypt_token(record.bearer_token_ciphertext)
        call_id = _call_id()
        started = time.monotonic()
        argument_keys = sorted(value.arguments)
        try:
            await self.repository.begin_call(
                call_id=call_id,
                user_id=user_id,
                connection_id=connection_id,
                tool_name=tool_name,
                argument_keys=argument_keys,
                connection_revision=record.connection.revision,
            )
        except AiDomainError:
            raise
        except Exception as audit_error:
            logger.error(
                "Failed to begin MCP call audit id={} error_type={}",
                call_id,
                type(audit_error).__name__,
            )
            raise AiDomainError(
                "AI_MCP_AUDIT_UNAVAILABLE",
                "The MCP call was not sent because its audit record could not be created.",
                status_code=503,
            ) from audit_error

        try:
            result = await asyncio.wait_for(
                self.gateway.call_tool(
                    record.connection.endpoint,
                    tool_name,
                    value.arguments,
                    bearer_token=token,
                ),
                timeout=self.call_deadline_seconds,
            )
            _validate_tool_result_semantics(result)
            metadata = _result_metadata(result)
        except asyncio.CancelledError:
            await self._complete_cancelled_call(
                call_id=call_id,
                user_id=user_id,
                started=started,
            )
            raise
        except TimeoutError:
            await self._complete_or_raise_unknown(
                call_id=call_id,
                user_id=user_id,
                status="unknown",
                result_metadata=None,
                error_code="AI_MCP_TIMEOUT",
                started=started,
            )
            raise _call_outcome_unknown() from None
        except AiDomainError as error:
            if not _is_definite_call_failure(error):
                await self._complete_or_raise_unknown(
                    call_id=call_id,
                    user_id=user_id,
                    status="unknown",
                    result_metadata=None,
                    error_code=error.code,
                    started=started,
                )
                raise _call_outcome_unknown() from None
            await self._complete_or_raise_unknown(
                call_id=call_id,
                user_id=user_id,
                status="failed",
                result_metadata=None,
                error_code=error.code,
                started=started,
            )
            raise
        except Exception as exc:
            await self._complete_or_raise_unknown(
                call_id=call_id,
                user_id=user_id,
                status="unknown",
                result_metadata=None,
                error_code="AI_MCP_UNEXPECTED_ERROR",
                started=started,
            )
            raise _call_outcome_unknown() from exc

        await self._complete_or_raise_unknown(
            call_id=call_id,
            user_id=user_id,
            status="succeeded",
            result_metadata=metadata,
            error_code=None,
            started=started,
        )
        return AiMcpToolCallResult(
            call_id=call_id,
            connection_id=connection_id,
            tool_name=tool_name,
            result=result,
            result_metadata=metadata,
        )

    async def _complete_or_raise_unknown(
        self,
        *,
        call_id: str,
        user_id: int,
        status: AiMcpCallTerminalStatus,
        result_metadata: dict[str, Any] | None,
        error_code: str | None,
        started: float,
    ) -> None:
        try:
            await self.repository.complete_call(
                call_id=call_id,
                user_id=user_id,
                status=status,
                result_metadata=result_metadata,
                error_code=error_code,
                duration_ms=max(0, int((time.monotonic() - started) * 1000)),
            )
        except Exception as audit_error:
            logger.error(
                "Failed to persist MCP call audit id={} error_type={}",
                call_id,
                type(audit_error).__name__,
            )
            raise AiDomainError(
                "AI_MCP_CALL_OUTCOME_UNKNOWN",
                _OUTCOME_UNKNOWN_MESSAGE,
                status_code=502,
            ) from audit_error

    async def _complete_cancelled_call(
        self,
        *,
        call_id: str,
        user_id: int,
        started: float,
    ) -> None:
        try:
            await asyncio.shield(
                self.repository.complete_call(
                    call_id=call_id,
                    user_id=user_id,
                    status="unknown",
                    result_metadata=None,
                    error_code="AI_MCP_CALL_CANCELLED",
                    duration_ms=max(0, int((time.monotonic() - started) * 1000)),
                )
            )
        except BaseException as audit_error:
            logger.error(
                "Failed to persist cancelled MCP call audit id={} error_type={}",
                call_id,
                type(audit_error).__name__,
            )
