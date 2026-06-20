from typing import Optional

from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from loguru import logger


class AiManager:
    def __init__(
        self,
        checkpointer: Optional[AsyncPostgresSaver] = None,
    ):
        self.checkpointer = checkpointer
        self.agent = None
        self.image_agent = None
        logger.info("AI Manager initialized")

    def _get_agent(self):
        if self.agent is None:
            from src.llm.agent import TestAgent

            self.agent = TestAgent(self.checkpointer)
        return self.agent

    def _get_image_agent(self):
        if self.image_agent is None:
            from src.llm.model.gemma import GemmaModel

            self.image_agent = GemmaModel
        return self.image_agent

    async def invoke(self, message: str, config: dict):
        return await self._get_agent().invoke(message, config=config)

    async def invoke_stream(self, message: str, config: dict):
        async for chunk in self._get_agent().invoke_stream(message, config=config):
            yield chunk

    async def generate_image(self, message: str, config: dict):
        logger.info(f"generate_image: {message}, config: {config}")
        response = await self._get_image_agent().ainvoke(
            {"messages": [{"role": "user", "content": message}]}
        )
        return response.content
