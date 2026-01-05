import asyncio
from src.llm.model.mistral import model
from src.llm.format import ResponseFormat
from src.llm.prompt import SYSTEM_PROMPT
from langchain.agents import create_agent
from src.llm.tools import get_weather_for_location, get_user_location, Context
from langgraph.checkpoint.memory import InMemorySaver
from langchain.agents.structured_output import ToolStrategy


# `thread_id` is a unique identifier for a given conversation.
config = {"configurable": {"thread_id": "1"}}


class LLM:
    memory_saver = InMemorySaver()

    def __init__(self):
        self.agent = create_agent(
            model=model,
            system_prompt=SYSTEM_PROMPT,
            tools=[get_weather_for_location, get_user_location],
            # context_schema=Context,
            # response_format=ToolStrategy(ResponseFormat),
            # checkpointer=self.memory_saver
        )

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
        response = self.agent.invoke(
            {"messages": [
                {"role": "user", "content": "What is the weather in San Francisco?"}]},
            config=config,
            context=Context(user_id="1")
        )
        print(response['structured_response'])
        response = self.agent.invoke(
            {"messages": [{"role": "user", "content": "thank you!"}]},
            config=config,
            context=Context(user_id="1")
        )

        print(response['structured_response'])

    def test_stream(self):
        for chunk in self.chat_stream("What is the weather in San Francisco?", "1"):
            print(chunk, end="", flush=True)
        print()  # 换行


def main():
    llm = LLM()
    llm.test_stream()


if __name__ == "__main__":
    main()
