import asyncio
from urllib.parse import quote_plus, urlparse, parse_qs

from langgraph.graph.message import MessagesState
from langgraph.graph.state import END, START, StateGraph
from loguru import logger
from src.database.postgresql.postgresql_manager import PostgreSQLManager
from src.llm.agent import TestAgent
from src.llm.graph import TestGraph
from src.llm.model.mistral import model
from src.llm.format import ResponseFormat
from src.llm.prompt import SYSTEM_PROMPT
from langchain.agents import create_agent
from src.llm.tools import get_weather_for_location, get_user_location, Context
from langgraph.checkpoint.memory import InMemorySaver
from langchain.agents.structured_output import ToolStrategy
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from langgraph.graph.state import CompiledStateGraph
# `thread_id` is a unique identifier for a given conversation.
config = {"configurable": {"thread_id": "1"}}
# 1. 定义原始信息
user = "blog"
password = "Zxy@123456"  # 含有特殊字符的密码
host = "localhost"
port = "5432"
dbname = "blog"

# 2. 对密码进行转义处理
# 转义后的密码会变成 'Zxy%40123456'
safe_password = quote_plus(password)

# 3. 构造完美的 DB_URI
DB_URI = f"postgresql://{user}:{safe_password}@{host}:{port}/{dbname}?sslmode=disable"


class LLM:
    memory_saver = InMemorySaver()

    def __init__(self, graph: TestGraph, checkpointer: AsyncPostgresSaver):
        self.checkpointer = checkpointer
        self.graph = graph

    @classmethod
    def create(cls, checkpointer):
        """
        工厂方法，用于创建 LLM 实例
        注意：checkpointer 需要在外部管理生命周期（使用 async with）
        """
        graph = TestGraph(checkpointer)
        # 创建实例并返回
        instance = cls(checkpointer=checkpointer, graph=graph)
        return instance

    async def test_stream(self):
        """测试流式输出"""
        if self.graph:
            await self.graph.test_stream()
        else:
            raise ValueError(
                "Graph not initialized. Use LLM.create() to initialize.")

    async def invoke(self, message: str, thread_id: str = "4"):
        """
        调用 graph，一次性返回完整结果

        Args:
            message: 用户输入的消息
            thread_id: 对话线程 ID

        Returns:
            完整的响应字典
        """
        # input_data = {"messages": [{"role": "user", "content": message}]}
        return await self.graph.run(messages=message, thread_id=thread_id)

    async def chat_stream(self, message: str, thread_id: str = "1", user_id: str = "1"):
        """
        流式调用 graph，按 token 返回

        Args:
            message: 用户输入的消息
            thread_id: 对话线程 ID
            user_id: 用户 ID（保留用于未来扩展）

        Yields:
            文本内容字符串（按 token）
        """
        input_data = {"messages": [{"role": "user", "content": message}]}
        async for token in self.graph.run_stream(input_data, thread_id=thread_id):
            yield token

    async def test(self):
        response = await self.invoke(
            "hi i am dudu?",
            'duud'
        )
        print(response)
        # print(response['structured_response'])
        response = await self.invoke(
            "what's my name?",
            'duud'
        )
        print(response)
        # print(response['structured_response'])

    async def old_test_stream(self):
        """旧的测试流式输出方法（保留作为备用）"""
        async for chunk in self.chat_stream("What is the weather in San Francisco?", "1"):
            print(chunk, end="", flush=True)
        print()  # 换行


async def run_test():
    """
    测试函数：创建 LLM 实例并运行测试
    所有的异步操作都在这个函数内完成，共享同一个生命周期
    """
    async with AsyncPostgresSaver.from_conn_string(DB_URI) as checkpointer:
        # await checkpointer.setup()
        # logger.info(f"初始化checkpointer成功")

        # 创建 LLM 实例
        llm = LLM.create(checkpointer)

        # 运行测试
        # await llm.old_test_stream()
        # print("--------------------------------")
        # response = await llm.invoke("hi,what's your name?")
        # print(response)
        print("--------------------------------")
        await llm.test()


def main():
    # 只调用一次 asyncio.run，作为整个异步程序的入口
    asyncio.run(run_test())


if __name__ == "__main__":
    main()
