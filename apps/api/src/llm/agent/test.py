import asyncio
import json
from langchain.agents import create_agent
from loguru import logger

from src.llm.model.mistral import model
from src.llm.prompt import SYSTEM_PROMPT
from src.llm.tools import get_client_ip, get_current_location, get_weather_for_location
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from src.llm.agent.respones import final_answer_tool
from src.llm.tools.tool import generate_python_code
from langchain_core.messages import AIMessage, BaseMessage, ToolMessage, HumanMessage


class TestAgent:
    def __init__(self, checkpointer: AsyncPostgresSaver):
        self.agent = create_agent(
            model=model,
            tools=[get_client_ip, get_current_location, get_weather_for_location,
                   generate_python_code],
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
        """
        流式调用 agent，按 token 返回最终响应

        Args:
            message: 用户消息
            config: 配置字典

        Yields:
            SSE 格式的数据块（data: {...}\n\n）
        """

        input_data = {"messages": [{"role": "user", "content": message}]}

        # 使用 stream_mode="messages" 来获取消息流
        # 注意：这会返回所有消息，包括工具调用的中间消息

        async for msg, metadata in self.agent.astream(
            input_data,
            config=config,
            stream_mode="messages"
        ):
            # 1. 获取当前消息所属的节点名称
            node_name = metadata.get("langgraph_node", "") if metadata else ""

            # 2. 核心过滤逻辑：只处理来自 agent 节点的消息
            if node_name == "model":
                # 3. 检查是否有文本内容（排除掉工具调用的指令消息）
                if msg.content and isinstance(msg.content, str):
                    # 封装并发送
                    chunk = json.dumps(
                        {"token": msg.content}, ensure_ascii=False)
                    yield f"data: {chunk}\n\n"

            # 如果 node_name 是 "tools"，这里可以选择记录日志，但不要 yield 给前端
            elif node_name == "tools":
                logger.debug("工具正在运行，跳过输出...")

        # 发送结束标记
        yield "data: [DONE]\n\n"
