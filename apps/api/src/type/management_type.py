from typing import List, Optional

from pydantic import BaseModel, Field


class RoleCreateModel(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    code: str = Field(min_length=1, max_length=100)
    description: str = Field(default="", max_length=500)


class RoleUpdateModel(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    code: Optional[str] = Field(default=None, min_length=1, max_length=100)
    description: Optional[str] = Field(default=None, max_length=500)


class BindResourcesModel(BaseModel):
    resource_ids: List[int] = Field(default_factory=list, max_length=500)


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
