from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Annotated, Any, Literal, Union

from pydantic import BaseModel, Field, field_validator


AI_PROTOCOL_VERSION = "1"
AiJsonValue = Any


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
    id: Literal["deepseek", "openai", "openrouter", "openai-compatible"]
    name: str
    default_base_url: str | None = None
    default_model: str | None = None


class AiProviderProfileInput(BaseModel):
    id: str | None = None
    provider: Literal["deepseek", "openai", "openrouter", "openai-compatible"]
    name: str = Field(min_length=1, max_length=120)
    base_url: str = Field(min_length=1, max_length=2048)
    model: str = Field(min_length=1, max_length=200)
    api_key: str | None = Field(default=None, min_length=1, max_length=4096)
    is_default: bool = False

    @field_validator("base_url")
    @classmethod
    def validate_base_url(cls, value: str) -> str:
        normalized = value.strip().rstrip("/")
        if not normalized.lower().startswith("https://"):
            raise ValueError("provider base URL must use HTTPS")
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


class AiRunRequest(BaseModel):
    conversation_id: str | None = None
    message: str = Field(min_length=1, max_length=100_000)
    provider_profile_id: str | None = None
    parent_message_id: str | None = None

    @field_validator("message")
    @classmethod
    def normalize_message(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("message cannot be blank")
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
