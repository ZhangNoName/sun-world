import json
from langchain.agents import create_agent
from loguru import logger

from src.llm.model.mistral import model
from src.llm.prompt import SYSTEM_PROMPT
from src.llm.tools import get_client_ip, get_current_location, get_weather_for_location
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from src.llm.agent.respones import final_answer_tool
from src.llm.tools.tool import generate_python_code


class TestAgent:
    def __init__(self, checkpointer: AsyncPostgresSaver):
        self.agent = create_agent(
            model=model,
            tools=[get_client_ip, get_current_location, get_weather_for_location,
                   generate_python_code, final_answer_tool],
            system_prompt=SYSTEM_PROMPT,
            checkpointer=checkpointer,
        )

    def select_model(self):
        return model

    async def invoke(self, message: str, config: dict):
        input_data = {"messages": [{"role": "user", "content": message}]}
        logger.info(f"invoke: {input_data}, config: {config}")
        result = await self.agent.ainvoke(input_data, config=config)
        logger.info(f"invoke result: {result.get('messages')[-1].content}")
        return result.get("messages")[-1].content

    async def invoke_stream(self, message: str, config: dict):
        input_data = {"messages": [{"role": "user", "content": message}]}
        # 使用 stream_mode="messages" 来获取单个 token
        async for msg, metadata in self.agent.astream(
            input_data,
            config=config,
            stream_mode="messages"
        ):
            # 过滤：只有当节点是模型输出且有内容时才 yield
            if msg.content:
                logger.info(f"invoke_stream: {msg.content}")
                # 封装成 JSON 格式方便前端解析
                chunk = json.dumps({"token": msg.content}, ensure_ascii=False)
                yield f"data: {chunk}\n\n"

        # 发送结束标记
        yield "data: [DONE]\n\n"
