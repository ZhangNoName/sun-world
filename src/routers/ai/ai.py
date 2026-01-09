import asyncio
import json
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from loguru import logger
from pydantic import BaseModel
from app_instance import app
from src.controller import ai_manager
from src.controller.ai_manager import AiManager
from src.llm.model.gemma import GemmaModel
from src.llm.model.mistral_img import MistralImgModel
from src.llm.model.qwen import QwenModel
from src.type.type import ResponseModel

router = APIRouter(prefix="/ai", tags=["ai"])

# 注入 AiManager 依赖


def get_ai_manager() -> AiManager:
    if not hasattr(app, 'ai'):
        raise HTTPException(
            status_code=500, detail="AI manager not initialized")
    return app.ai

# 获取ai回答

# 1. 定义请求结构


class ChatRequest(BaseModel):
    question: str
    session_id: str = "1"


@router.post("/chat")
async def get_answer(request: Request, chat_data: ChatRequest, ai_manager: AiManager = Depends(get_ai_manager)):
    # user_id = request.state.user_id
    user_id = 2
    ip = request.headers.get("x-forwarded-for") or request.client.host
    config = {"configurable": {
        "thread_id": chat_data.session_id, "ip": ip, "user_id": user_id}}
    answer = await ai_manager.invoke(chat_data.question, config)
    return ResponseModel(code=1, data=answer, message="获取成功")


@router.post("/chat_stream")
async def get_answer_stream(request: Request, chat_data: ChatRequest, ai_manager: AiManager = Depends(get_ai_manager)):
    user_id = 2
    ip = request.headers.get("x-forwarded-for") or request.client.host
    config = {"configurable": {
        "thread_id": chat_data.session_id, "ip": ip, "user_id": user_id}}
    return StreamingResponse(
        ai_manager.invoke_stream(chat_data.question, config),
        media_type="text/event-stream",  # SSE 标准流格式
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # 👈 告诉 Nginx 不要缓存，直接转发
        }
    )


@router.post("/chat-chunk-stream")
async def chat_chunk_stream(request: Request, chat_data: ChatRequest, ai_manager: AiManager = Depends(get_ai_manager)):
    user_id = 2
    ip = request.headers.get("x-forwarded-for") or request.client.host
    config = {"configurable": {
        "thread_id": chat_data.session_id, "ip": ip, "user_id": user_id}}
    return StreamingResponse(
        ai_manager.invoke_stream(chat_data.question, config),
        media_type="application/json",  # 或者使用更规范的 application/x-ndjson
        headers={
            "Cache-Control": "no-cache",
            "X-Content-Type-Options": "nosniff",  # 防止浏览器尝试猜测类型而产生缓存
            "X-Accel-Buffering": "no",  # 👈 告诉 Nginx 不要缓存，直接转发
        }
    )


@router.post("/generate-image")
async def generate_image(request: Request, chat_data: ChatRequest, ai_manager: AiManager = Depends(get_ai_manager)):
    user_id = 2
    ip = request.headers.get("x-forwarded-for") or request.client.host
    config = {"configurable": {
        "thread_id": chat_data.session_id, "ip": ip, "user_id": user_id}}
    # answer = await ai_manager.generate_image(chat_data.question, config)
    answer = await GemmaModel.ainvoke(chat_data.question)
    logger.info(f"generate_image: {answer}")
    return ResponseModel(code=1, data=answer, message="获取成功")


@router.post("/read-image")
async def generate_image(request: Request, ai_manager: AiManager = Depends(get_ai_manager)):
    messages = [
        {
            "role": "user",
            "content": [
                {
                    "type": "text",
                    "text": "What is in this image?"
                },
                {
                    "type": "image_url",
                    "image_url": {
                        "url": "https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/Gfp-wisconsin-madison-the-nature-boardwalk.jpg/2560px-Gfp-wisconsin-madison-the-nature-boardwalk.jpg"
                    }
                }
            ]
        }
    ]
    answer = await QwenModel.ainvoke(messages)
    logger.info(f"generate_image: {answer}")
    return ResponseModel(code=1, data=answer, message="获取成功")
