from datetime import datetime, date
from typing import Any, List, Optional
from pydantic import BaseModel, Field
import uuid

class User(BaseModel):
    id: Optional[int] = Field(None, description="用户的唯一标识符，自增主键")
    name: str = Field(..., description="昵称")
    sex: int = Field(..., description="性别")
    age: int = Field(..., description="年龄")
    phone: str = Field(..., description="手机号")
    email: str = Field(..., description="邮箱")
    password: str = Field(..., description="密码")
    birth_day: date = Field(..., description="出生日期，格式为 YYYY-MM-DD")
    create_time: Optional[datetime] = Field(default_factory=datetime.now, description="创建时间")
    status: bool = Field(default=True, description="用户是否启用，默认启用")


class UserPublic(BaseModel):
    id: Optional[int] = Field(None, description="用户的唯一标识符，自增主键")
    name: str = Field(..., description="昵称")
    sex: int = Field(..., description="性别")
    age: int = Field(..., description="年龄")
    phone: str = Field(..., description="手机号")
    email: str = Field(..., description="邮箱")
    birth_day: date = Field(..., description="出生日期，格式为 YYYY-MM-DD")
    create_time: Optional[datetime] = Field(default_factory=datetime.now, description="创建时间")
    status: bool = Field(default=True, description="用户是否启用，默认启用")
    roles: list[dict[str, Any]] = Field(default_factory=list, description="用户角色")
    resources: list[dict[str, Any]] = Field(default_factory=list, description="用户资源权限")


class UserCreateResult(BaseModel):
    id: Optional[int] = Field(None, description="新建用户 ID")


class UserPage(BaseModel):
    list: List[UserPublic] = Field(default_factory=list, description="当前页用户列表")
    page: int = Field(..., description="当前页码")
    page_size: int = Field(..., description="每页数量")
    total: int = Field(..., description="总条数")
