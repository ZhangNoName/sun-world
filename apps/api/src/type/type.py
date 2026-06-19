from typing import Generic, Optional, TypeVar, Union
from pydantic import BaseModel, Field

T = TypeVar('T')


class ResponseModel(BaseModel, Generic[T]):
    """
    统一的 API 接口返回数据模型。

    该模型用于规范所有接口的返回格式，使得接口返回数据结构统一，便于前端解析和处理。

    属性：
        code (int | str): 业务状态码。
            * 1: 业务成功
            * 其他值: 业务失败，具体含义由业务定义
        data (Optional[T]): 返回的数据，无数据时为 None。
        msg (str): 描述信息，用于提供成功提示或错误详情。
    """
    code: Union[int, str]
    data: Optional[T] = None
    msg: str

# 定义返回类型 BlogStats
class BlogStats(BaseModel):
    blog_count: int = Field(..., description="博客文章的总数量", example=100)
    category_count: int = Field(..., description="博客种类的总数量", example=10)
    tag_count: int = Field(..., description="博客标签的总数量", example=20)
    total_view_num: int = Field(0, description="所有博客的总浏览量，默认为0", example=5000)
