from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import JSONResponse

from src.controller.role_manager import RoleManager
from src.core.auth.admin_recovery import LastAdministratorError
from src.core.auth.admin_audit import AdminAuditContext
from src.controller.auth_manager import AuthManager
from src.modules.management.public import AdminManagementService
from app_instance import app
from src.core.response import ok, fail
from src.routers.auth.auth import get_auth_manager, require_admin, require_admin_audit
from src.type.management_type import BindResourcesModel, RoleCreateModel, RoleUpdateModel

# ------------------------------
# 路由对象
# ------------------------------

router = APIRouter(
    prefix="/role", tags=["role"], dependencies=[Depends(require_admin)]
)


# ------------------------------
# 依赖注入
# ------------------------------

def get_role_manager() -> RoleManager:
    if not hasattr(app, "role"):
        raise HTTPException(status_code=500, detail="Role manager not initialized")
    return app.role


def get_role_management_service(auth: AuthManager = Depends(get_auth_manager),
                                manager: RoleManager = Depends(get_role_manager)):
    return AdminManagementService(auth, role_manager=manager)

# ------------------------------
# Role 路由
# ------------------------------

@router.post("/", status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_admin_audit)])
async def create_role(role: RoleCreateModel, request: Request, service: AdminManagementService = Depends(get_role_management_service),
                      audit: AdminAuditContext = Depends(require_admin_audit)):
    role_id = service.execute(request.cookies.get('access_token', ''), 'role.create', role, audit=audit)
    return ok(data={"id": role_id}, msg="创建成功")

@router.get("/{role_id}")
async def get_role(role_id: int, manager: RoleManager = Depends(get_role_manager)):
    role = manager.get_role_by_id(role_id)
    if not role:
        return fail(msg="角色不存在")
    role["resource_ids"] = manager.get_resources_by_role(role_id)
    return ok(data=role, msg="获取成功")

@router.get("/")
async def list_roles(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=100),
    manager: RoleManager = Depends(get_role_manager),
):
    roles = manager.get_roles_with_resources(page, page_size)
    return ok(data=roles, msg="获取成功")

@router.put("/{role_id}", dependencies=[Depends(require_admin_audit)])
async def update_role(role_id: int, data: RoleUpdateModel, request: Request, service: AdminManagementService = Depends(get_role_management_service),
                      audit: AdminAuditContext = Depends(require_admin_audit)):
    changes = data.model_dump(exclude_none=True)
    if not changes:
        raise HTTPException(status_code=422, detail="At least one field is required")
    try:
        res = service.execute(request.cookies.get('access_token', ''), 'role.update', data, target_id=role_id, audit=audit)
    except LastAdministratorError as error:
        return JSONResponse(status_code=409, content={
            "code": error.code, "data": None, "msg": error.message,
        })
    return ok(data=res, msg="更新成功")

@router.delete("/{role_id}", dependencies=[Depends(require_admin_audit)])
async def delete_role(role_id: int, request: Request, service: AdminManagementService = Depends(get_role_management_service),
                      audit: AdminAuditContext = Depends(require_admin_audit)):
    try:
        res = service.execute(request.cookies.get('access_token', ''), 'role.delete', target_id=role_id, audit=audit)
    except LastAdministratorError as error:
        return JSONResponse(status_code=409, content={
            "code": error.code, "data": None, "msg": error.message,
        })
    if not res:
        return fail(msg="角色不存在", data=False)
    return ok(data=True, msg="删除成功")

@router.post("/{role_id}/bind_resources", dependencies=[Depends(require_admin_audit)])
async def bind_resources(role_id: int, data: BindResourcesModel, request: Request, service: AdminManagementService = Depends(get_role_management_service),
                         audit: AdminAuditContext = Depends(require_admin_audit)):
    service.execute(request.cookies.get('access_token', ''), 'role.bind_resources', data, target_id=role_id, audit=audit)
    return ok(data=True, msg="绑定资源成功")
