from langchain.agents import create_agent

from src.llm.model.mistral import model
from src.llm.prompt import SYSTEM_PROMPT
from src.llm.tools import get_weather_for_location, get_user_location, Context

test_agent = create_agent(
    model=model,
    system_prompt=SYSTEM_PROMPT,
    tools=[get_weather_for_location, get_user_location],
    # context_schema=Context,
    # response_format=ToolStrategy(ResponseFormat),
    # checkpointer=self.memory_saver
)
