from fastapi import APIRouter
from loguru import logger
from src.type.type import ResponseModel
router = APIRouter(prefix="/ai", tags=["ai"])

# 注入 BlogManager 依赖


def get_blog_manager() -> BlogManager:
    if not hasattr(app, 'blog'):
        raise HTTPException(
            status_code=500, detail="Blog manager not initialized")
    return app.blog
# 获取ai回答


@router.get("/chat")
async def get_answer(question: str):
    return ResponseModel(code=1, data=None, message="获取成功")
