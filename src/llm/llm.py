import asyncio
from urllib.parse import quote_plus, urlparse, parse_qs

from langgraph.graph.message import MessagesState
from langgraph.graph.state import END, START, StateGraph
from loguru import logger
from src.database.postgresql.postgresql_manager import PostgreSQLManager
from src.llm.agent import test_agent
from src.llm.graph import TestGraph
from src.llm.model.mistral import model
from src.llm.format import ResponseFormat
from src.llm.prompt import SYSTEM_PROMPT
from langchain.agents import create_agent
from src.llm.tools import get_weather_for_location, get_user_location, Context
from langgraph.checkpoint.memory import InMemorySaver
from langchain.agents.structured_output import ToolStrategy
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver

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

    def __init__(self, agent, checkpointer):
        self.checkpointer = checkpointer
        self.agent = agent

    def invoke(self, message: str):
        return self.agent.invoke(message)

    def chat_stream(self, message: str, thread_id: str, user_id: str = "1"):
        config = {"configurable": {"thread_id": thread_id}}
        context = Context(user_id=user_id)
        input_data = {"messages": [{"role": "user", "content": message}]}

        for token, metadata in self.agent.stream(
            input_data,
            config=config,
            stream_mode="messages",
        ):
            # 兼容不同的 text 输出格式
            text_content = None

            # 方式1: 如果有 content_blocks 属性
            if hasattr(token, 'content_blocks') and token.content_blocks:
                if isinstance(token.content_blocks, list) and len(token.content_blocks) > 0:
                    first_block = token.content_blocks[0]
                    if hasattr(first_block, 'text'):
                        text_content = first_block.text
                    elif isinstance(first_block, dict) and 'text' in first_block:
                        text_content = first_block['text']

            # 方式2: 如果直接有 text 属性
            if text_content is None and hasattr(token, 'text'):
                text_content = token.text

            # 方式3: 如果直接有 content 属性
            if text_content is None and hasattr(token, 'content'):
                text_content = token.content

            # 方式4: 如果是字符串类型
            if text_content is None and isinstance(token, str):
                text_content = token

            # 输出内容
            if text_content:
                yield text_content

    def test(self):
        response = self.invoke(
            "What is the weather in San Francisco?",
            'test'
        )
        print(response['structured_response'])
        response = self.invoke(
            "thank you!",
            'test'
        )

        print(response['structured_response'])

    def test_stream(self):
        for chunk in self.chat_stream("What is the weather in San Francisco?", "1"):
            print(chunk, end="", flush=True)
        print()  # 换行


async def run_test():
    """
    所有的异步操作都在这个函数内完成，共享同一个生命周期
    """
    async with AsyncPostgresSaver.from_conn_string(DB_URI) as checkpointer:

        # await checkpointer.setup()
        # logger.info(f"初始化checkpointer成功")
        agent = test_agent

        graph = TestGraph(model, checkpointer)
        await graph.test_stream()
        # await checkpointer.setup()
        # 1. 异步实例化（此时建立了数据库连接）
        # llm = LLM(agent, checkpointer)

        # # 2. 调用测试方法（由于 test_stream 内部有异步操作，也必须是 async）
        # await llm.test_stream()

    # 3. (可选) 关闭连接
    # await llm.checkpointer.conn.close()


def main():
    # 只调用一次 asyncio.run，作为整个异步程序的入口
    asyncio.run(run_test())


if __name__ == "__main__":
    main()
