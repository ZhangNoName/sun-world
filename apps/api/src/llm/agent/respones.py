from langchain.tools import tool
from pydantic import BaseModel, Field, conlist
from typing import Optional, List, Literal, Union


class ContentBlock(BaseModel):
    type: Literal["text", "code", "image_url"]  # 定义内容块类型
    content: str = Field(description="具体内容，如文本字符串、代码字符串或图片URL")
    language: Optional[str] = Field(None, description="如果type是code，则为编程语言")
    alt_text: Optional[str] = Field(
        None, description="如果type是image_url，则为图片描述")


class AgentResponse(BaseModel):
    """最终的 Agent 回复，可以包含多种类型的输出。"""
    response_type: Literal["text_response", "mixed_response", "error"] = Field(
        description="回复类型：纯文本、混合内容或错误"
    )
    content_blocks: List[ContentBlock] = Field(
        ..., description="包含文本、代码、图片等不同类型内容块的列表"
    )
    summary: Optional[str] = Field(None, description="整个回复的简短总结（纯文本）")
    tool_used: Optional[str] = Field(None, description="如果使用了工具，这里是工具名称")

# 辅助函数，将 Pydantic 模型转换为字典（因为工具返回通常是字典）


def process_agent_response(response: AgentResponse) -> dict:
    return response.model_dump()


# 将其包装成 LangChain Tool


@tool
def final_answer_tool(response_type: Literal["text_response", "mixed_response", "error"],
                      content_blocks: List[dict],
                      summary: Optional[str] = None,
                      tool_used: Optional[str] = None) -> dict:
    """
    Agent 最终的回复工具，用于以结构化方式提交文本、代码或图片等混合内容。
    content_blocks 应该是 ContentBlock 字典列表。
    """
    # 在这里可以做一些验证或额外处理，例如将 content_blocks 中的字典再次解析为 Pydantic 对象
    parsed_blocks = [ContentBlock(**block) for block in content_blocks]
    final_response = AgentResponse(
        response_type=response_type,
        content_blocks=parsed_blocks,
        summary=summary,
        tool_used=tool_used
    )
    return final_response.model_dump()
