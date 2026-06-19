from fastapi import APIRouter, Depends, HTTPException, status
from loguru import logger
from pydantic import BaseModel
from typing import List, Optional, Dict, Any

from src.controller.role_manager import RoleManager
from src.controller.resource_manager import ResourceManager

from app_instance import app
from src.core.response import ok, fail

# ------------------------------
# Pydantic 模型
# ------------------------------

class RoleCreateModel(BaseModel):
    name: str
    code: str
    description: Optional[str] = ""

class RoleUpdateModel(BaseModel):
    name: Optional[str]
    code: Optional[str]
    description: Optional[str]

class BindResourcesModel(BaseModel):
    resource_ids: List[int]

class ResourceCreateModel(BaseModel):
    name: str
    code: str
    type: str
    path: Optional[str] = ""
    description: Optional[str] = ""

class ResourceUpdateModel(BaseModel):
    name: Optional[str]
    code: Optional[str]
    type: Optional[str]
    path: Optional[str]
    description: Optional[str]

# ------------------------------
# 路由对象
# ------------------------------

router = APIRouter(prefix="/role", tags=["role"])


# ------------------------------
# 依赖注入
# ------------------------------

def get_role_manager() -> RoleManager:
    if not hasattr(app, "role"):
        raise HTTPException(status_code=500, detail="Role manager not initialized")
    return app.role

# ------------------------------
# Role 路由
# ------------------------------

@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_role(role: RoleCreateModel, manager: RoleManager = Depends(get_role_manager)):
    role_id = manager.create_role(role.dict())
    return ok(data={"id": role_id}, msg="创建成功")

@router.get("/{role_id}")
async def get_role(role_id: int, manager: RoleManager = Depends(get_role_manager)):
    role = manager.get_role_by_id(role_id)
    if not role:
        return fail(msg="角色不存在")
    role["resource_ids"] = manager.get_resources_by_role(role_id)
    return ok(data=role, msg="获取成功")

@router.get("/")
async def list_roles(page: int = 1, page_size: int = 10, manager: RoleManager = Depends(get_role_manager)):
    roles = manager.get_roles_with_resources(page, page_size)
    return ok(data=roles, msg="获取成功")

@router.put("/{role_id}")
async def update_role(role_id: int, data: RoleUpdateModel, manager: RoleManager = Depends(get_role_manager)):
    res = manager.update_role(role_id, **data.dict(exclude_none=True))
    return ok(data=res, msg="更新成功")

@router.delete("/{role_id}")
async def delete_role(role_id: int, manager: RoleManager = Depends(get_role_manager)):
    res = manager.delete_role(role_id)
    if not res:
        return fail(msg="角色不存在", data=False)
    return ok(data=True, msg="删除成功")

@router.post("/{role_id}/bind_resources")
async def bind_resources(role_id: int, data: BindResourcesModel, manager: RoleManager = Depends(get_role_manager)):
    manager.bind_resources(role_id, data.resource_ids)
    return ok(data=True, msg="绑定资源成功")
