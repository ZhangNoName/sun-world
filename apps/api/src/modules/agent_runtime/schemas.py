from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class RunInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    question: str = Field(min_length=1, max_length=2000)
    idempotency_key: UUID


class ToolCall(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    call_id: str = Field(min_length=1, max_length=128)
    generation: int
    tool_version: str
    arguments: dict


class Receipt(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    call_id: str = Field(min_length=1, max_length=128)
    result_hash: str = Field(pattern="^[0-9a-f]{64}$")


class BlogQaSource(BaseModel):
    article_id: int
    title: str
    url: str


class BlogQaRun(BaseModel):
    id: str
    status: str
    question: str = ""
    answer: str | None = None
    sources: list[BlogQaSource] = Field(default_factory=list)
    error_code: str | None = None


class BlogQaCapabilities(BaseModel):
    enabled: bool
    mode: str = "site"
    local_validation: bool = False
    dataset: str
    model: str
    authenticated: bool
    reason: str | None = None
