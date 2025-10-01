from typing import Generic, Optional, TypeVar
from pydantic import BaseModel, Field
from pydantic.generics import GenericModel

T = TypeVar('T')
class ResponseModel(BaseModel, Generic[T]):
    """
    统一的API接口返回数据模型

    该模型用于规范所有接口的返回格式，使得接口返回数据结构统一，便于前端解析和处理。

    属性：
        code (int): 状态码，用于表示请求的执行结果。
            * 0: 请求成功
            * 其他值: 请求失败，具体含义由业务定义
        data (any): 返回的数据，可以是任意类型，根据不同的接口返回不同的数据。
        message (str): 描述信息，用于提供更详细的错误信息或成功提示。
    """
    code: int
    data: Optional[T] = None
    message: str

# 定义返回类型 BlogStats
class BlogStats(BaseModel):
    blog_count: int = Field(..., description="博客文章的总数量", example=100)
    category_count: int = Field(..., description="博客种类的总数量", example=10)
    tag_count: int = Field(..., description="博客标签的总数量", example=20)
    total_view_num: int = Field(0, description="所有博客的总浏览量，默认为0", example=5000)