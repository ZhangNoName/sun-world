from fastapi import APIRouter, Depends, HTTPException
from loguru import logger
from app_instance import app
from src.controller.ai_manager import AiManager
from src.type.type import ResponseModel

router = APIRouter(prefix="/ai", tags=["ai"])

# 注入 AiManager 依赖


def get_ai_manager() -> AiManager:
    if not hasattr(app, 'ai'):
        raise HTTPException(
            status_code=500, detail="AI manager not initialized")
    return app.ai

# 获取ai回答


@router.post("/chat")
async def get_answer(question: str, ai_manager: AiManager = Depends(get_ai_manager)):
    answer = await ai_manager.invoke(question)
    return ResponseModel(code=1, data=answer, message="获取成功")
