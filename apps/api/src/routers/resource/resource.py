from fastapi import APIRouter, Depends, HTTPException, Query, status

from src.controller.resource_manager import ResourceManager
from app_instance import app
from src.core.response import ok, fail
from src.routers.auth.auth import require_admin
from src.type.management_type import ResourceCreateModel, ResourceUpdateModel

# ------------------------------
# 路由对象
# ------------------------------

resource_router = APIRouter(
    prefix="/resource", tags=["resource"], dependencies=[Depends(require_admin)]
)
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
    resource_id = manager.create_resource(resource.model_dump())
    return ok(data={"id": resource_id}, msg="创建成功")

@resource_router.get("/{resource_id}")
async def get_resource(resource_id: int, manager: ResourceManager = Depends(get_resource_manager)):
    res = manager.get_resource_by_id(resource_id)
    if not res:
        return fail(msg="资源不存在")
    return ok(data=res, msg="获取成功")

@resource_router.get("/")
async def list_resources(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=100),
    manager: ResourceManager = Depends(get_resource_manager),
):
    res_list = manager.list_resources(page=page, per_page=page_size)
    return ok(data=res_list, msg="获取成功")

@resource_router.put("/{resource_id}")
async def update_resource(resource_id: int, data: ResourceUpdateModel, manager: ResourceManager = Depends(get_resource_manager)):
    changes = data.model_dump(exclude_none=True)
    if not changes:
        raise HTTPException(status_code=422, detail="At least one field is required")
    res = manager.update_resource(resource_id, **changes)
    return ok(data=res, msg="更新成功")

@resource_router.delete("/{resource_id}")
async def delete_resource(resource_id: int, manager: ResourceManager = Depends(get_resource_manager)):
    res = manager.delete_resource(resource_id)
    if not res:
        return fail(msg="资源不存在", data=False)
    return ok(data=True, msg="删除成功")
