"""
统一 API 响应 envelope 模块。

所有 JSON 接口统一使用 { code, data, msg } 格式：
- code === 1: 业务成功
- code !== 1: 业务失败
- data: 类型化的业务数据，无数据时为 null
- msg: 人类可读的描述信息
"""

from typing import Generic, Optional, TypeVar

from pydantic import BaseModel

T = TypeVar("T")


class ApiResponse(BaseModel, Generic[T]):
    """
    统一的 API 接口返回数据模型。

    属性：
        code (int): 业务状态码。1 表示成功，其他值表示失败。
        data (Optional[T]): 返回的业务数据，无数据时为 None。
        msg (str): 描述信息，用于提供成功提示或错误详情。
    """

    code: int
    data: Optional[T] = None
    msg: str


# ---- 便捷构造器 ----

def ok(data=None, msg: str = "获取成功") -> ApiResponse:
    """构造业务成功响应（code=1）。"""
    return ApiResponse(code=1, data=data, msg=msg)


def fail(msg: str = "请求失败", data=None, code: int = 0) -> ApiResponse:
    """构造业务失败响应（code≠1）。"""
    return ApiResponse(code=code, data=data, msg=msg)


def not_found(msg: str = "资源不存在") -> ApiResponse:
    """构造 404 语义的业务失败响应。"""
    return ApiResponse(code=0, data=None, msg=msg)


def unauthorized(msg: str = "未授权，请重新登录") -> ApiResponse:
    """构造未授权语义的业务失败响应。"""
    return ApiResponse(code=401, data=None, msg=msg)
