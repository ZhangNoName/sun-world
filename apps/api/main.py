# main.py
from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, RedirectResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app_instance import app  # Import the app instance
from src.core.response import fail
from src.routers import blog_router, base_router, user_router, resource_router, role_router, auth_router, ai_router, file_router


# ---- 全局异常处理器 — 统一使用 { code, data, msg } envelope ----


def _safe_msg(detail, fallback: str = "请求失败") -> str:
    if isinstance(detail, str):
        return detail
    if detail is None:
        return fallback
    return str(detail)


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(_request: Request, exc: StarletteHTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content=fail(msg=_safe_msg(exc.detail), code=exc.status_code).model_dump(),
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(_request: Request, exc: RequestValidationError):
    errors = exc.errors()
    return JSONResponse(
        status_code=422,
        content=fail(
            msg="参数校验失败",
            code=422,
            data=[{"loc": e.get("loc", []), "msg": e.get("msg", "")} for e in errors],
        ).model_dump(),
    )


@app.exception_handler(Exception)
async def general_exception_handler(_request: Request, _exc: Exception):
    return JSONResponse(
        status_code=500,
        content=fail(msg="服务器内部错误", code=500).model_dump(),
    )


@app.get("/")
async def redirect_root_to_docs():
    return RedirectResponse("/docs")


@app.get("/healthz")
async def healthz():
    return {"status": "ok"}

routers = [
    blog_router,
    base_router,
    user_router,
    role_router,
    resource_router,
    auth_router,
    ai_router,
    file_router
]

# 使用循环一次性添加所有路由器
for router in routers:
    app.include_router(router)
