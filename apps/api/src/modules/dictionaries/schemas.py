from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Generic, TypeVar

from pydantic import BaseModel, Field, field_validator


def _trim(value: str) -> str:
    normalized = value.strip()
    if not normalized:
        raise ValueError("value must not be blank")
    return normalized


class DictionaryTypeInput(BaseModel):
    code: str = Field(min_length=1, max_length=128)
    name: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=500)
    is_enabled: bool = True

    @field_validator("code", "name")
    @classmethod
    def normalize_required_text(cls, value: str) -> str:
        return _trim(value)


class DictionaryItemInput(BaseModel):
    value: str = Field(min_length=1, max_length=128)
    label: str = Field(min_length=1, max_length=255)
    color: str | None = Field(default=None, max_length=32)
    sort_order: int = Field(default=0, ge=0, le=10_000)
    is_enabled: bool = True
    extension_json: dict[str, Any] | None = None

    @field_validator("value", "label")
    @classmethod
    def normalize_required_text(cls, value: str) -> str:
        return _trim(value)

    @field_validator("color")
    @classmethod
    def normalize_color(cls, value: str | None) -> str | None:
        return value.strip() or None if value is not None else None


class DictionaryType(BaseModel):
    id: int
    code: str
    name: str
    description: str | None = None
    is_enabled: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class DictionaryItem(BaseModel):
    id: int
    dictionary_type_id: int
    value: str
    label: str
    color: str | None = None
    sort_order: int = 0
    is_enabled: bool = True
    extension_json: dict[str, Any] | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class DictionaryItemPublic(BaseModel):
    value: str
    label: str
    color: str | None = None
    sort_order: int = 0


PageItem = TypeVar("PageItem")


class DictionaryPage(BaseModel, Generic[PageItem]):
    list: list[PageItem]
    page: int
    page_size: int
    total: int
