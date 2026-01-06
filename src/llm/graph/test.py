from typing import Any
from langgraph.graph import START, END, MessagesState, StateGraph

config = {"configurable": {"thread_id": "1"}}


class TestGraph:
    def __init__(self, model, checkpointer):
        self.model = model
        self.checkpointer = checkpointer
        self.build()

    async def call_model(self, state: MessagesState):
        response = await self.model.ainvoke(state["messages"])
        return {"messages": response}

    def build(self):
        builder = StateGraph(MessagesState)
        builder.add_node("model", self.call_model)
        builder.add_edge(START, "model")
        builder.add_edge("model", END)
        graph = builder.compile(checkpointer=self.checkpointer)
        self.graph = graph

    async def run(self, messages: Any):
        pass

    async def run_stream(self, messages: Any):
        pass

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
