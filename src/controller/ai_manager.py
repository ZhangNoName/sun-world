import os
from typing import Optional
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from loguru import logger
from langchain.chat_models import init_chat_model
from langchain_core.messages import BaseMessage

from src.llm.agent import TestAgent
from src.llm.llm import LLM


class AiManager:
    def __init__(
        self,
        checkpointer: Optional[AsyncPostgresSaver] = None,
    ):
        """
        初始化 AI Manager

        Args:
            base_url: AI API 的基础 URL，默认从环境变量 AI_URL 读取
            api_key: API 密钥，默认从环境变量 OPENROUTER_API_KEY 读取
            model: 模型名称，默认 "mistralai/devstral-2512:free"
            model_provider: 模型提供商，默认 "mistralai"
        """

        self.checkpointer = checkpointer
        self.agent = TestAgent(checkpointer)
        logger.info("AI Manager 初始化成功")

    async def invoke(self, message: str, thread_id: str = "1"):
        """
        调用 AI 模型，一次性返回完整结果

        Args:
            message: 用户消息
            thread_id: 对话线程 ID

        Returns:
            AI 响应字典
        """
        if self.agent is None:
            raise RuntimeError("AI 模型未初始化，请检查配置")

        return await self.agent.invoke(message, thread_id=thread_id)

    async def invoke_stream(self, message: str, thread_id: str = "1"):
        """
        调用 AI 模型，按 token 流式返回

        Args:
            message: 用户消息
            thread_id: 对话线程 ID

        Yields:
            文本内容字符串（按 token）
        """
        if self.agent is None:
            raise RuntimeError("AI 模型未初始化，请检查配置")

        async for token in self.agent.invoke_stream(message, thread_id=thread_id):
            yield token
