from typing import Any, List, Dict, Optional, Union, AsyncIterator
from langgraph.graph import START, END, MessagesState, StateGraph
from langchain_core.messages import BaseMessage, HumanMessage
from loguru import logger

from src.llm.agent import TestAgent

config = {"configurable": {"thread_id": "1"}}


class TestGraph:
    def __init__(self,  checkpointer):
        self.checkpointer = checkpointer
        self.agent = TestAgent(checkpointer)
        self.build()

    async def call_agent(self, state: MessagesState):
        logger.info(f"call_agent: {state}")
        response = await self.agent.ainvoke(state["messages"][-1])
        # 【关键修复】
        # 如果 response 是字典且包含 messages，我们只取出最后一条 AI 的回复
        if isinstance(response, dict) and "messages" in response:
            # 获取最后一条消息
            last_msg = response["messages"][-1]
            return {"messages": [last_msg]}

        # 如果 response 直接就是消息对象
        return {"messages": [response]}

    def build(self):
        builder = StateGraph(MessagesState)
        builder.add_node("weather", self.call_agent)
        builder.add_edge(START, "weather")
        builder.add_edge("weather", END)
        graph = builder.compile(checkpointer=self.checkpointer)
        self.graph = graph

    async def run(
        self,
        messages:  str,
        thread_id: str = "2",
        config: Optional[Dict] = None,
    ) -> MessagesState:
        """
        运行 graph，一次性返回完整结果

        Args:
            messages: 输入消息，可以是：
                - 字符串：自动转换为用户消息
                - 消息字典列表：[{"role": "user", "content": "..."}]
                - BaseMessage 列表
            thread_id: 对话线程 ID，用于持久化记忆
            config: 可选的配置字典

        Returns:
            完整的响应字典，包含 messages 字段
        """
        logger.info(f"run: {messages}")
        # 标准化输入格式
        input_data = {"messages": HumanMessage(content=messages)}
        # if isinstance(messages, str):
        #     input_data = {"messages": HumanMessage(content=messages)}
        # elif isinstance(messages, dict) and "messages" in messages:
        #     input_data = messages
        # else:
        #     input_data = {"messages": messages}

        # 构建配置
        run_config = config or {"configurable": {"thread_id": thread_id}}

        # 异步调用 graph
        result = await self.graph.ainvoke(input_data, config=run_config)
        return result

    async def run_stream(
        self,
        messages: Union[str, List[Dict[str, str]], List[BaseMessage]],
        thread_id: str = "1",
        config: Optional[Dict] = None,
        stream_mode: str = "messages",
    ) -> AsyncIterator[str]:
        """
        运行 graph，按 token 流式返回

        Args:
            messages: 输入消息，可以是：
                - 字符串：自动转换为用户消息
                - 消息字典列表：[{"role": "user", "content": "..."}]
                - BaseMessage 列表
            thread_id: 对话线程 ID，用于持久化记忆
            config: 可选的配置字典
            stream_mode: 流式模式，可选值：
                - "messages": 按消息 token 流式返回（推荐）
                - "values": 按状态值流式返回

        Yields:
            文本内容字符串（按 token）
        """
        # 标准化输入格式
        if isinstance(messages, str):
            input_data = {"messages": [{"role": "user", "content": messages}]}
        elif isinstance(messages, list) and len(messages) > 0:
            if isinstance(messages[0], dict):
                input_data = {"messages": messages}
            else:
                # 如果是 BaseMessage 列表，转换为字典格式
                input_data = {"messages": [{"role": msg.role, "content": msg.content} if hasattr(
                    msg, 'role') else str(msg) for msg in messages]}
        else:
            input_data = {"messages": messages}

        # 构建配置
        run_config = config or {"configurable": {"thread_id": thread_id}}

        # 异步流式调用 graph
        async for chunk in self.graph.astream(
            input_data,
            config=run_config,
            stream_mode=stream_mode,
        ):
            # 提取文本内容
            text_content = None

            if stream_mode == "messages":
                # 流式模式：chunk 是消息对象
                # 方式1: 如果有 content_blocks 属性
                if hasattr(chunk, 'content_blocks') and chunk.content_blocks:
                    if isinstance(chunk.content_blocks, list) and len(chunk.content_blocks) > 0:
                        first_block = chunk.content_blocks[0]
                        if hasattr(first_block, 'text'):
                            text_content = first_block.text
                        elif isinstance(first_block, dict) and 'text' in first_block:
                            text_content = first_block['text']

                # 方式2: 如果直接有 text 属性
                if text_content is None and hasattr(chunk, 'text'):
                    text_content = chunk.text

                # 方式3: 如果直接有 content 属性
                if text_content is None and hasattr(chunk, 'content'):
                    text_content = chunk.content

                # 方式4: 如果是字符串类型
                if text_content is None and isinstance(chunk, str):
                    text_content = chunk

            elif stream_mode == "values":
                # 值流式模式：chunk 是状态字典
                if isinstance(chunk, dict) and "messages" in chunk:
                    messages_list = chunk["messages"]
                    if messages_list and len(messages_list) > 0:
                        last_message = messages_list[-1]
                        if hasattr(last_message, 'content'):
                            text_content = last_message.content
                        elif isinstance(last_message, dict) and 'content' in last_message:
                            text_content = last_message['content']
                        elif isinstance(last_message, str):
                            text_content = last_message

            # 输出内容
            if text_content:
                yield text_content

    async def test(self):
        pass

    async def test_stream(self):
        async for chunk in self.graph.astream(
            {"messages": [{"role": "user", "content": "hi! I'm SW"}]},
            config,
            stream_mode="values"
        ):
            chunk["messages"][-1].pretty_print()

        async for chunk in self.graph.astream(
            {"messages": [{"role": "user", "content": "what's my name?"}]},
            config,
            stream_mode="values"
        ):
            chunk["messages"][-1].pretty_print()
