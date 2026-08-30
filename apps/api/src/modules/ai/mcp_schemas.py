from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Literal
from urllib.parse import urlsplit, urlunsplit

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


AI_MCP_MAX_ARGUMENT_BYTES = 64 * 1024
AI_MCP_MAX_ARGUMENT_KEYS = 100
AI_MCP_MAX_DISCOVERED_TOOLS = 500

AiMcpCallTerminalStatus = Literal["succeeded", "failed", "unknown"]


def _normalize_https_endpoint(value: str) -> str:
    normalized = value.strip()
    if "\x00" in normalized:
        raise ValueError("MCP endpoint cannot contain null bytes")
    parsed = urlsplit(normalized)
    if parsed.scheme.lower() != "https":
        raise ValueError("MCP endpoint must use HTTPS")
    if not parsed.hostname:
        raise ValueError("MCP endpoint must include a host")
    if parsed.username is not None or parsed.password is not None:
        raise ValueError("MCP endpoint cannot contain credentials")
    if parsed.query:
        raise ValueError("MCP endpoint cannot contain a query string")
    if parsed.fragment:
        raise ValueError("MCP endpoint cannot contain a fragment")
    try:
        port = parsed.port
    except ValueError as exc:
        raise ValueError("MCP endpoint has an invalid port") from exc
    if port not in (None, 443):
        raise ValueError("MCP endpoint must use port 443")
    path = parsed.path or "/"
    return urlunsplit(("https", parsed.netloc, path, "", ""))


def _normalize_token(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    if not normalized:
        raise ValueError("bearer token cannot be blank")
    if "\x00" in normalized:
        raise ValueError("bearer token cannot contain null bytes")
    return normalized


class AiMcpConnectionCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=120)
    endpoint: str = Field(min_length=1, max_length=2048)
    bearer_token: str | None = Field(default=None, max_length=4096, repr=False)
    enabled: bool = True

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized or "\x00" in normalized:
            raise ValueError("name cannot be blank or contain null bytes")
        return normalized

    @field_validator("endpoint")
    @classmethod
    def normalize_endpoint(cls, value: str) -> str:
        return _normalize_https_endpoint(value)

    @field_validator("bearer_token")
    @classmethod
    def normalize_bearer_token(cls, value: str | None) -> str | None:
        return _normalize_token(value)


class AiMcpConnectionUpdate(AiMcpConnectionCreate):
    clear_bearer_token: bool = False

    @model_validator(mode="after")
    def validate_token_change(self) -> "AiMcpConnectionUpdate":
        if self.clear_bearer_token and self.bearer_token is not None:
            raise ValueError("bearer_token and clear_bearer_token cannot be used together")
        return self


class AiMcpConnection(BaseModel):
    id: str
    name: str
    endpoint: str
    enabled: bool
    has_bearer_token: bool
    bearer_token_hint: str | None = None
    revision: int = Field(default=1, ge=1)
    catalog_revision: int | None = Field(default=None, ge=1)
    last_discovered_at: datetime | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class AiMcpDiscoveredTool(BaseModel):
    """Normalized, non-secret tool metadata returned by the MCP gateway."""

    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    name: str = Field(min_length=1, max_length=256)
    description: str | None = Field(default=None, max_length=8_000)
    input_schema: dict[str, Any] = Field(
        default_factory=dict,
        validation_alias="inputSchema",
    )
    annotations: dict[str, Any] = Field(default_factory=dict)

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized or "\x00" in normalized:
            raise ValueError("tool name cannot be blank or contain null bytes")
        return normalized


class AiMcpTool(AiMcpDiscoveredTool):
    connection_id: str
    discovered_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class AiMcpDiscoveryResult(BaseModel):
    connection: AiMcpConnection
    tools: list[AiMcpTool]


class AiMcpToolCallRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    arguments: dict[str, Any] = Field(default_factory=dict)
    confirmed: bool = False

    @field_validator("arguments")
    @classmethod
    def validate_arguments(cls, value: dict[str, Any]) -> dict[str, Any]:
        if len(value) > AI_MCP_MAX_ARGUMENT_KEYS:
            raise ValueError(
                f"arguments cannot contain more than {AI_MCP_MAX_ARGUMENT_KEYS} top-level keys"
            )
        try:
            encoded = json.dumps(
                value,
                ensure_ascii=False,
                allow_nan=False,
                separators=(",", ":"),
            ).encode("utf-8")
        except (TypeError, ValueError) as exc:
            raise ValueError("arguments must be JSON serializable") from exc
        if len(encoded) > AI_MCP_MAX_ARGUMENT_BYTES:
            raise ValueError(
                f"arguments cannot exceed {AI_MCP_MAX_ARGUMENT_BYTES} UTF-8 bytes"
            )
        return value


class AiMcpToolCallResult(BaseModel):
    call_id: str
    connection_id: str
    tool_name: str
    status: Literal["succeeded"] = "succeeded"
    result: Any
    result_metadata: dict[str, Any]
    completed_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
