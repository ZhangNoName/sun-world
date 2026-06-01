from fastapi import APIRouter, Depends, HTTPException, status
from loguru import logger
from pydantic import BaseModel
from typing import List, Optional, Dict, Any

from src.controller.role_manager import RoleManager
from src.controller.resource_manager import ResourceManager

from app_instance import app
from src.type.type import ResponseModel

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

resource_router = APIRouter(prefix="/resource", tags=["resource"])
# ------------------------------
# 依赖注入
# ------------------------------


def get_resource_manager() -> ResourceManager:
    if not hasattr(app, "resource"):
        raise HTTPException(status_code=500, detail="Resource manager not initialized")
    return app.resource


# ------------------------------
# Resource 路由
# ------------------------------

@resource_router.post("/", status_code=status.HTTP_201_CREATED)
async def create_resource(resource: ResourceCreateModel, manager: ResourceManager = Depends(get_resource_manager)):
    resource_id = manager.create_resource(resource.dict())
    return ResponseModel(code=1, data={"id": resource_id}, message="创建成功")

@resource_router.get("/{resource_id}")
async def get_resource(resource_id: int, manager: ResourceManager = Depends(get_resource_manager)):
    res = manager.get_resource_by_id(resource_id)
    if not res:
        return ResponseModel(code=0, data=None, message="资源不存在")
    return ResponseModel(code=1, data=res, message="获取成功")

@resource_router.get("/")
async def list_resources(page: int = 1, page_size: int = 10, manager: ResourceManager = Depends(get_resource_manager)):
    res_list = manager.list_resources(page=page, per_page=page_size)
    return ResponseModel(code=1, data=res_list, message="获取成功")

@resource_router.put("/{resource_id}")
async def update_resource(resource_id: int, data: ResourceUpdateModel, manager: ResourceManager = Depends(get_resource_manager)):
    res = manager.update_resource(resource_id, **data.dict(exclude_none=True))
    return ResponseModel(code=1, data=res, message="更新成功")

@resource_router.delete("/{resource_id}")
async def delete_resource(resource_id: int, manager: ResourceManager = Depends(get_resource_manager)):
    res = manager.delete_resource(resource_id)
    if not res:
        return ResponseModel(code=0, data=False, message="资源不存在")
    return ResponseModel(code=1, data=True, message="删除成功")
