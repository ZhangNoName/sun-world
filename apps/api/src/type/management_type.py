from typing import Annotated, List, Optional

from pydantic import BaseModel, Field, field_validator


class RoleCreateModel(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    code: str = Field(min_length=1, max_length=100)
    description: str = Field(default="", max_length=500)


class RoleUpdateModel(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    code: Optional[str] = Field(default=None, min_length=1, max_length=100)
    description: Optional[str] = Field(default=None, max_length=500)


class BindResourcesModel(BaseModel):
    resource_ids: List[Annotated[int, Field(strict=True, gt=0, le=2_147_483_647)]] = Field(
        default_factory=list, strict=True, max_length=500,
        description='正整数资源ID；重复项按首次出现去重，空列表清空绑定',
    )

    @field_validator('resource_ids')
    @classmethod
    def unique_resource_ids(cls, values):
        return list(dict.fromkeys(values))


class ResourceCreateModel(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    code: str = Field(min_length=1, max_length=100)
    type: str = Field(min_length=1, max_length=50)
    path: str = Field(default="", max_length=500)
    description: str = Field(default="", max_length=500)


class ResourceUpdateModel(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    code: Optional[str] = Field(default=None, min_length=1, max_length=100)
    type: Optional[str] = Field(default=None, min_length=1, max_length=50)
    path: Optional[str] = Field(default=None, max_length=500)
    description: Optional[str] = Field(default=None, max_length=500)
