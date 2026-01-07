from langchain.agents import create_agent

from src.llm.model.mistral import model
from src.llm.prompt import SYSTEM_PROMPT
from src.llm.tools import get_weather_for_location, get_user_location, Context
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver

# 使用 LangChain 1.0+ 的 create_agent


class TestAgent:
    def __init__(self, checkpointer: AsyncPostgresSaver):
        self.agent = create_agent(
            model=model,
            tools=[get_weather_for_location, get_user_location],
            system_prompt=SYSTEM_PROMPT,
            checkpointer=checkpointer,
        )

    async def invoke(self, message: str, thread_id: str = "1"):
        input_data = {"messages": [{"role": "user", "content": message}]}
        return await self.agent.ainvoke(input_data, config={"configurable": {"thread_id": thread_id}})

    async def invoke_stream(self, message: str, thread_id: str = "1"):
        input_data = {"messages": [{"role": "user", "content": message}]}
        async for token in self.agent.astream(input_data, config={"configurable": {"thread_id": thread_id}}):
            yield token
