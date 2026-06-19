import asyncio
import os
from urllib.parse import quote_plus

from langgraph.checkpoint.memory import InMemorySaver
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from src.llm.graph import TestGraph


config = {"configurable": {"thread_id": "1"}}

user = os.getenv("BLOG_TEST_POSTGRES_USER", "blog")
password = os.getenv("BLOG_TEST_POSTGRES_PASSWORD", "example")
host = os.getenv("BLOG_TEST_POSTGRES_HOST", "localhost")
port = os.getenv("BLOG_TEST_POSTGRES_PORT", "5432")
dbname = os.getenv("BLOG_TEST_POSTGRES_DB", "blog")
safe_password = quote_plus(password)
DB_URI = f"postgresql://{user}:{safe_password}@{host}:{port}/{dbname}?sslmode=disable"


class LLM:
    memory_saver = InMemorySaver()

    def __init__(self, graph: TestGraph, checkpointer: AsyncPostgresSaver):
        self.checkpointer = checkpointer
        self.graph = graph

    @classmethod
    def create(cls, checkpointer):
        graph = TestGraph(checkpointer)
        return cls(checkpointer=checkpointer, graph=graph)

    async def test_stream(self):
        if self.graph:
            await self.graph.test_stream()
            return
        raise ValueError("Graph not initialized. Use LLM.create() to initialize.")

    async def invoke(self, message: str, thread_id: str = "4"):
        return await self.graph.run(messages=message, thread_id=thread_id)

    async def chat_stream(self, message: str, thread_id: str = "1", user_id: str = "1"):
        input_data = {"messages": [{"role": "user", "content": message}]}
        async for token in self.graph.run_stream(input_data, thread_id=thread_id):
            yield token

    async def test(self):
        response = await self.invoke("hi i am dudu?", "duud")
        print(response)
        response = await self.invoke("what's my name?", "duud")
        print(response)

    async def old_test_stream(self):
        async for chunk in self.chat_stream("What is the weather in San Francisco?", "1"):
            print(chunk, end="", flush=True)
        print()


async def run_test():
    async with AsyncPostgresSaver.from_conn_string(DB_URI) as checkpointer:
        llm = LLM.create(checkpointer)
        print("--------------------------------")
        await llm.test()


def main():
    asyncio.run(run_test())


if __name__ == "__main__":
    main()
