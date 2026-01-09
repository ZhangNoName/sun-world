import asyncio
import json
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from loguru import logger
from pydantic import BaseModel
from app_instance import app
from src.controller import ai_manager
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


@router.get("/gemini-style-stream")
async def gemini_style_stream(ai_manager: AiManager = Depends(get_ai_manager)):
    # async def generate():
    #     # 模拟模型逐字生成
    #     tokens = [
    #         "Hello", " this", " is", " a", " Gemini", "-style", " stream", ".",
    #         " It", " demonstrates", " how", " to", " send", " streaming", " responses",
    #         " in", " a", " format", " similar", " to", " Google", "'s", " Gemini", " API", ".",
    #         " Each", " token", " is", " sent", " as", " a", " separate", " JSON", " chunk",
    #         " with", " the", " text", " content", " and", " status", " information", ".",
    #         " This", " allows", " for", " real", "-time", " streaming", " of", " AI", " responses",
    #         " to", " the", " client", " without", " waiting", " for", " the", " complete", " response", ".",
    #         " The", " client", " can", " display", " the", " text", " as", " it", " arrives",
    #         " creating", " a", " more", " interactive", " and", " responsive", " user", " experience", "."
    #     ]
    #     for token in tokens:
    #         # 模仿 Google 的封装格式：每个块都是一个独立的 JSON 片段
    #         chunk = json.dumps({"text": token, "status": "generating"})
    #         # 注意：这里我们不加 "data:" 前缀，直接 yield 字符串 + 换行符
    #         yield chunk + "\n"
    #         await asyncio.sleep(0.1)  # 模拟网络延迟

    return StreamingResponse(
        # generate(),
        ai_manager.invoke_stream("请写一个200字的作文，题目自拟", {
                                 "configurable": {"thread_id": "999"}}),
        media_type="application/json",  # 或者使用更规范的 application/x-ndjson
        headers={
            "Cache-Control": "no-cache",
            "X-Content-Type-Options": "nosniff",  # 防止浏览器尝试猜测类型而产生缓存
            "X-Accel-Buffering": "no",  # 👈 告诉 Nginx 不要缓存，直接转发
        }
    )
