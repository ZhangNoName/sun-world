from fastapi import APIRouter, Depends, HTTPException, Query, Request, status

from src.controller.resource_manager import ResourceManager
from src.core.auth.admin_audit import AdminAuditContext
from src.controller.auth_manager import AuthManager
from src.modules.management.public import AdminManagementService
from app_instance import app
from src.core.response import ok, fail
from src.routers.auth.auth import get_auth_manager, require_admin, require_admin_audit
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


def get_resource_management_service(auth: AuthManager = Depends(get_auth_manager),
                                    manager: ResourceManager = Depends(get_resource_manager)):
    return AdminManagementService(auth, resource_manager=manager)


# ------------------------------
# Resource 路由
# ------------------------------

@resource_router.post("/", status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_admin_audit)])
async def create_resource(resource: ResourceCreateModel, request: Request, service: AdminManagementService = Depends(get_resource_management_service),
                          audit: AdminAuditContext = Depends(require_admin_audit)):
    resource_id = service.execute(request.cookies.get('access_token', ''), 'resource.create', resource, audit=audit)
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

@resource_router.put("/{resource_id}", dependencies=[Depends(require_admin_audit)])
async def update_resource(resource_id: int, data: ResourceUpdateModel, request: Request, service: AdminManagementService = Depends(get_resource_management_service),
                          audit: AdminAuditContext = Depends(require_admin_audit)):
    changes = data.model_dump(exclude_none=True)
    if not changes:
        raise HTTPException(status_code=422, detail="At least one field is required")
    res = service.execute(request.cookies.get('access_token', ''), 'resource.update', data, target_id=resource_id, audit=audit)
    return ok(data=res, msg="更新成功")

@resource_router.delete("/{resource_id}", dependencies=[Depends(require_admin_audit)])
async def delete_resource(resource_id: int, request: Request, service: AdminManagementService = Depends(get_resource_management_service),
                          audit: AdminAuditContext = Depends(require_admin_audit)):
    res = service.execute(request.cookies.get('access_token', ''), 'resource.delete', target_id=resource_id, audit=audit)
    if not res:
        return fail(msg="资源不存在", data=False)
    return ok(data=True, msg="删除成功")
