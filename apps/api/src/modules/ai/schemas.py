from __future__ import annotations

import json
import ipaddress
from datetime import datetime, timezone
import os
from typing import Annotated, Any, Literal, Union
from urllib.parse import urlsplit, urlunsplit

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from .errors import AiDomainError
from .mcp_gateway import _address_is_blocked, _validate_endpoint


AI_PROTOCOL_VERSION = "1"
AI_PERSONA_INSTRUCTIONS_MAX_LENGTH = 8_000
AI_SKILL_INSTRUCTIONS_MAX_LENGTH = 8_000
AI_MAX_SELECTED_SKILLS = 8
AiJsonValue = Any
AiProviderAuthMode = Literal["none", "bearer"]


def _canonical_http_origin(value: str) -> str:
    try:
        parsed = urlsplit(value)
        port = parsed.port
    except (TypeError, ValueError):
        raise ValueError("provider insecure origin is invalid") from None
    if (
        parsed.scheme.lower() != "http"
        or not parsed.hostname
        or parsed.username is not None
        or parsed.password is not None
        or parsed.path not in ("", "/")
        or parsed.query
        or parsed.fragment
    ):
        raise ValueError("provider insecure origin is invalid")
    try:
        host = parsed.hostname.encode("idna").decode("ascii").lower()
    except (UnicodeError, ValueError):
        raise ValueError("provider insecure origin is invalid") from None
    effective_port = port or 80
    authority = f"[{host}]" if ":" in host else host
    if effective_port != 80:
        authority = f"{authority}:{effective_port}"
    return urlunsplit(("http", authority, "", "", ""))


def _allowed_insecure_provider_origins() -> frozenset[str]:
    raw = os.getenv("AI_PROVIDER_ALLOWED_INSECURE_ORIGINS", "")
    origins: set[str] = set()
    for value in raw.split(","):
        value = value.strip()
        if not value:
            continue
        origins.add(_canonical_http_origin(value))
    return frozenset(origins)


def _normalize_provider_base_url(value: str) -> str:
    normalized = value.strip().rstrip("/")
    if "\\" in normalized:
        raise ValueError("provider base URL is invalid")
    try:
        parsed = urlsplit(normalized)
    except (TypeError, ValueError):
        raise ValueError("provider base URL is invalid") from None
    if parsed.scheme.lower() == "http":
        if (
            not parsed.hostname
            or parsed.username is not None
            or parsed.password is not None
            or parsed.query
            or parsed.fragment
        ):
            raise ValueError("provider base URL is invalid")
        origin = _canonical_http_origin(
            urlunsplit(("http", parsed.netloc, "", "", ""))
        )
        if origin not in _allowed_insecure_provider_origins():
            raise ValueError(
                "provider HTTP origin is not explicitly allowed"
            )
        try:
            address = ipaddress.ip_address(parsed.hostname)
        except ValueError:
            pass
        else:
            if _address_is_blocked(str(address)):
                raise ValueError("provider base URL cannot use a non-public IP address")
        authority = urlsplit(origin).netloc
        return urlunsplit(("http", authority, parsed.path, "", "")).rstrip("/")
    try:
        host, canonical = _validate_endpoint(normalized)
    except AiDomainError:
        raise ValueError(
            "provider base URL must be a safe HTTPS URL on port 443"
        ) from None
    parsed = urlsplit(canonical)
    if parsed.query:
        raise ValueError("provider base URL cannot contain a query string")
    try:
        ipaddress.ip_address(host)
    except ValueError:
        pass
    else:
        if _address_is_blocked(host):
            raise ValueError("provider base URL cannot use a non-public IP address")
    return canonical.rstrip("/")


class AiTextBlock(BaseModel):
    type: Literal["text"] = "text"
    text: str
    format: Literal["plain", "markdown"] = "markdown"


class AiTableColumn(BaseModel):
    key: str = Field(min_length=1, max_length=120)
    label: str = Field(min_length=1, max_length=200)


class AiTableBlock(BaseModel):
    type: Literal["table"] = "table"
    columns: list[AiTableColumn]
    rows: list[dict[str, AiJsonValue]]
    caption: str | None = None


class AiChartBlock(BaseModel):
    type: Literal["chart"] = "chart"
    option: dict[str, AiJsonValue]
    summary: str = Field(min_length=1, max_length=1000)


class AiLinkBlock(BaseModel):
    type: Literal["link"] = "link"
    label: str = Field(min_length=1, max_length=500)
    url: str = Field(min_length=1, max_length=2048)
    description: str | None = Field(default=None, max_length=1000)

    @field_validator("url")
    @classmethod
    def validate_safe_url(cls, value: str) -> str:
        lowered = value.strip().lower()
        if not lowered.startswith(("https://", "http://", "mailto:")):
            raise ValueError("link URL must use http, https, or mailto")
        return value.strip()


class AiRecordBlock(BaseModel):
    type: Literal["record"] = "record"
    record_type: str = Field(min_length=1, max_length=120)
    record_id: str = Field(min_length=1, max_length=160)
    title: str = Field(min_length=1, max_length=500)
    metadata: dict[str, AiJsonValue] = Field(default_factory=dict)


class AiCustomBlock(BaseModel):
    type: Literal["custom"] = "custom"
    name: str = Field(pattern=r"^[a-z0-9]+(?:[.-][a-z0-9]+)+$", max_length=160)
    payload: AiJsonValue


AiContentBlock = Annotated[
    Union[
        AiTextBlock,
        AiTableBlock,
        AiChartBlock,
        AiLinkBlock,
        AiRecordBlock,
        AiCustomBlock,
    ],
    Field(discriminator="type"),
]

AiRole = Literal["user", "assistant", "system", "tool"]
AiMessageStatus = Literal["pending", "streaming", "completed", "interrupted", "failed"]


class AiMessage(BaseModel):
    id: str
    conversation_id: str
    role: AiRole
    blocks: list[AiContentBlock]
    sequence: int = Field(ge=1)
    status: AiMessageStatus = "completed"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    feedback: Literal["like", "dislike"] | None = None


class AiConversationSummary(BaseModel):
    id: str
    title: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class AiConversation(AiConversationSummary):
    messages: list[AiMessage] = Field(default_factory=list)


class AiProviderDescriptor(BaseModel):
    id: str = Field(
        min_length=2,
        max_length=64,
        pattern=r"^[a-z0-9]+(?:[-_][a-z0-9]+)*$",
    )
    name: str
    default_base_url: str | None = None
    default_model: str | None = None
    is_default: bool = False


class AiProviderCatalogInput(AiProviderDescriptor):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=120)
    default_base_url: str | None = Field(default=None, max_length=2048)
    default_model: str | None = Field(default=None, max_length=200)
    auth_mode: AiProviderAuthMode = "bearer"
    api_key: str | None = Field(
        default=None,
        min_length=1,
        max_length=4096,
        exclude=True,
        repr=False,
    )
    clear_api_key: bool = Field(default=False, exclude=True)
    is_enabled: bool = True
    sort_order: int = Field(default=0, ge=0, le=10_000)

    @field_validator("default_base_url")
    @classmethod
    def validate_default_base_url(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return _normalize_provider_base_url(value)

    @model_validator(mode="after")
    def validate_provider_configuration(self):
        if self.api_key is not None and self.clear_api_key:
            raise ValueError("api_key and clear_api_key cannot be used together")
        if self.auth_mode == "none" and self.api_key is not None:
            raise ValueError("api_key is not valid when auth_mode is none")
        if (
            self.auth_mode == "bearer"
            and self.default_base_url is not None
            and urlsplit(self.default_base_url).scheme == "http"
        ):
            raise ValueError("bearer-authenticated providers require HTTPS")
        if self.is_default and not self.is_enabled:
            raise ValueError("the default provider must be enabled")
        if self.is_enabled and (
            not self.default_base_url or not self.default_model
        ):
            raise ValueError("enabled providers require a base URL and model")
        return self


class AiProviderCatalog(AiProviderDescriptor):
    auth_mode: AiProviderAuthMode = "bearer"
    is_enabled: bool = True
    sort_order: int = Field(default=0, ge=0, le=10_000)
    has_api_key: bool = False
    api_key_hint: str | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class AiProviderProfileInput(BaseModel):
    id: str | None = None
    provider: str = Field(
        min_length=2,
        max_length=64,
        pattern=r"^[a-z0-9]+(?:[-_][a-z0-9]+)*$",
    )
    name: str = Field(min_length=1, max_length=120)
    base_url: str = Field(min_length=1, max_length=2048)
    model: str = Field(min_length=1, max_length=200)
    api_key: str | None = Field(default=None, min_length=1, max_length=4096)
    is_default: bool = False

    @field_validator("base_url")
    @classmethod
    def validate_base_url(cls, value: str) -> str:
        normalized = _normalize_provider_base_url(value)
        if urlsplit(normalized).scheme != "https":
            raise ValueError("personal provider profiles require HTTPS")
        return normalized


class AiProviderProfile(BaseModel):
    id: str
    provider: str
    name: str
    base_url: str
    model: str
    is_default: bool
    has_api_key: bool
    api_key_hint: str | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


def _normalize_required_text(value: str, *, field_name: str) -> str:
    normalized = value.strip()
    if not normalized:
        raise ValueError(f"{field_name} cannot be blank")
    if "\x00" in normalized:
        raise ValueError(f"{field_name} cannot contain null bytes")
    return normalized


class AiPersonaInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=1000)
    instructions: str = Field(
        min_length=1,
        max_length=AI_PERSONA_INSTRUCTIONS_MAX_LENGTH,
        description="Declarative Markdown instructions for this persona.",
    )

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        return _normalize_required_text(value, field_name="name")

    @field_validator("description")
    @classmethod
    def normalize_description(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return value.strip() or None

    @field_validator("instructions")
    @classmethod
    def normalize_instructions(cls, value: str) -> str:
        return _normalize_required_text(value, field_name="instructions")


class AiPersona(AiPersonaInput):
    id: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class AiSkillInput(BaseModel):
    """A declarative Markdown prompt. It is never loaded or executed as code."""

    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=1000)
    kind: Literal["prompt"] = "prompt"
    instructions: str = Field(
        min_length=1,
        max_length=AI_SKILL_INSTRUCTIONS_MAX_LENGTH,
        description="Prompt-only Markdown instructions; never executable code or tool configuration.",
    )

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        return _normalize_required_text(value, field_name="name")

    @field_validator("description")
    @classmethod
    def normalize_description(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return value.strip() or None

    @field_validator("instructions")
    @classmethod
    def normalize_instructions(cls, value: str) -> str:
        return _normalize_required_text(value, field_name="instructions")


class AiSkill(AiSkillInput):
    id: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class AiRunRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    conversation_id: str | None = None
    message: str = Field(min_length=1, max_length=20_000)
    provider_profile_id: str | None = None
    model_id: str | None = Field(
        default=None,
        min_length=2,
        max_length=64,
        pattern=r"^[a-z0-9]+(?:[-_][a-z0-9]+)*$",
    )
    parent_message_id: str | None = None
    persona_id: str | None = Field(default=None, min_length=1, max_length=64)
    skill_ids: list[str] = Field(default_factory=list, max_length=AI_MAX_SELECTED_SKILLS)

    @field_validator("message")
    @classmethod
    def normalize_message(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("message cannot be blank")
        return normalized

    @model_validator(mode="after")
    def validate_provider_selection(self):
        if self.provider_profile_id is not None and self.model_id is not None:
            raise ValueError(
                "provider_profile_id and model_id cannot be used together"
            )
        return self

    @field_validator("persona_id")
    @classmethod
    def normalize_persona_id(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return _normalize_required_text(value, field_name="persona_id")

    @field_validator("skill_ids")
    @classmethod
    def normalize_skill_ids(cls, value: list[str]) -> list[str]:
        normalized: list[str] = []
        seen: set[str] = set()
        for raw_skill_id in value:
            skill_id = _normalize_required_text(raw_skill_id, field_name="skill_id")
            if len(skill_id) > 64:
                raise ValueError("skill_id cannot exceed 64 characters")
            if skill_id in seen:
                raise ValueError("skill_ids cannot contain duplicates")
            seen.add(skill_id)
            normalized.append(skill_id)
        return normalized


class AiMessageEditRequest(BaseModel):
    content: str = Field(min_length=1, max_length=100_000)


class AiFeedbackRequest(BaseModel):
    value: Literal["like", "dislike", "none"]

AiStreamEventType = Literal[
    "run.started",
    "content.delta",
    "component.upsert",
    "message.completed",
    "run.failed",
]


class AiStreamEvent(BaseModel):
    version: Literal["1"] = AI_PROTOCOL_VERSION
    event_id: str = Field(min_length=1, max_length=160)
    type: AiStreamEventType
    conversation_id: str = Field(min_length=1, max_length=160)
    message_id: str = Field(min_length=1, max_length=160)
    sequence: int = Field(ge=0)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    data: dict[str, AiJsonValue] = Field(default_factory=dict)


def encode_sse_event(event: AiStreamEvent) -> str:
    payload = event.model_dump(mode="json")
    return f"data: {json.dumps(payload, ensure_ascii=False, separators=(',', ':'))}\n\n"
