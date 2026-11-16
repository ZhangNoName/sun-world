from pydantic import BaseModel, ConfigDict, Field, field_validator


class ToolInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class BlogSearchPublicInput(ToolInput):
    query: str = Field(min_length=1, max_length=200,
                      description='按标题或摘要匹配连续片段；每次只用一个简短核心词，不用空格拼接多词。')
    limit: int = Field(default=10, ge=1, le=10)

    @field_validator("query", mode="before")
    @classmethod
    def trim_query(cls, value):
        return value.strip() if isinstance(value, str) else value


class BlogReadPublicInput(ToolInput):
    article_id: int = Field(gt=0)


class BlogPublicSearchItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    article_id: int = Field(gt=0)
    title: str = Field(max_length=128)
    abstract: str = Field(max_length=512)
    truncated: bool = False


class BlogSearchPublicOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    items: list[BlogPublicSearchItem] = Field(max_length=10)


class BlogReadPublicOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    article_id: int = Field(gt=0)
    title: str = Field(max_length=512)
    content: str
    content_hash: str = Field(pattern="^[0-9a-f]{64}$")
    truncated: bool
    content_bytes: int = Field(ge=0)
    returned_bytes: int = Field(ge=0, le=16 * 1024)
