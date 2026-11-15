from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, Field, field_validator

CommentStatus = Literal["pending", "approved", "rejected"]


class CommentInput(BaseModel):
    content: str = Field(min_length=1, max_length=2000)

    @field_validator("content")
    @classmethod
    def strip_content(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Comment cannot be blank")
        return value


class CommentReview(BaseModel):
    status: Literal["approved", "rejected"]


class BlogComment(BaseModel):
    id: int
    blog_id: int
    author_name: str
    content: str
    status: CommentStatus
    created_at: datetime

    @field_validator("created_at")
    @classmethod
    def utc_date(cls, value: datetime) -> datetime:
        return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


class CommentPage(BaseModel):
    items: list[BlogComment]
    total: int
    page: int
    page_size: int
