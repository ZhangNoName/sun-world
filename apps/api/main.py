# main.py
from fastapi.responses import RedirectResponse
from app_instance import app  # Import the app instance
from src.routers import blog_router, base_router, user_router, resource_router, role_router, auth_router, ai_router, file_router


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
