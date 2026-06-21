from typing import Union
import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from loguru import logger
from pydantic import BaseModel
from src.controller.blog_manage import BlogManager
from app_instance import app
from src.type.blog_type import BlogCreate, BlogCreateResult, BlogDetail, BlogPage
from src.core.response import ok, fail
from src.core.response import ApiResponse
from src.core.error_codes import BLOG_CREATE_FAILED, BLOG_NOT_FOUND


# 创建博客 API 路由
router = APIRouter(prefix="/blogs",tags=["blog"])

# 注入 BlogManager 依赖
def get_blog_manager() -> BlogManager:
    if not hasattr(app, 'blog'):
        raise HTTPException(status_code=500, detail="Blog manager not initialized")
    return app.blog

# 创建新博客
@router.post("/", status_code=status.HTTP_201_CREATED, response_model=ApiResponse[BlogCreateResult])
async def create_blog(blog: BlogCreate, blog_manager: BlogManager = Depends(get_blog_manager)):
    """
    创建新的博客

    Args:
        blog (Blog): 新博客的数据模型

    Returns:
        dict: 包含新博客 ID 的字典
    """
    logger.info(f'接收到的参数：{blog}')

    res = blog_manager.add_blog(blog)

    if res:
        return ok(data={"id": res}, msg="创建成功")
    else:
        return fail(msg="创建失败", code=BLOG_CREATE_FAILED)

# 获取指定博客
@router.get("/{blog_id}", response_model=ApiResponse[BlogDetail])
async def get_blog(blog_id:int, blog_manager: BlogManager = Depends(get_blog_manager)):
    """
    获取指定 ID 的博客

    Args:
        blog_id (str): 博客的 ID

    Returns:
        Blog: 博客对象，如果不存在则抛出 404 错误
    """
    blog = blog_manager.get_blog(blog_id)
    logger.info(f'查找的结果-----{blog}')

    if not blog:
        return fail(msg="博客不存在", code=BLOG_NOT_FOUND)

    blog_dict = blog.model_dump()

    return ok(data=blog_dict, msg="获取成功")

# 分页获取博客
@router.get("/", response_model=ApiResponse[BlogPage])
async def get_blogs_paginated(
    page: int = 1,
    pageSize: int = 10,
    keyword: str | None = None,
    sortBy: str = "updated_at",
    sortOrder: str = "desc",
    blog_manager: BlogManager = Depends(get_blog_manager)
):
    """
    分页获取博客列表

    Args:
        page (int, optional): 页码. Defaults to 1.
        page_size (int, optional): 每页显示数量. Defaults to 10.
        blog_manager (BlogManager, optional): 博客管理对象. Defaults to Depends(get_blog_manager).

    Returns:
        dict: 包含分页信息的字典
    """
    logger.info(f'分页参数：{page}--{pageSize}')
    blogs = blog_manager.get_blog_by_page(
        page,
        pageSize,
        keyword=keyword,
        sort_by=sortBy,
        sort_order=sortOrder,
    )
    return ok(data=blogs, msg="获取成功")


# 删除指定博客
@router.delete("/{blog_id}", response_model=ApiResponse[None])
async def delete_blog(blog_id: str, blog_manager: BlogManager = Depends(get_blog_manager)):
    """
    删除指定 ID 的博客

    Args:
        blog_id (str): 博客的 ID

    Returns:
        dict: 包含删除成功消息的字典
    """
    if not blog_manager.delete_blog(blog_id):
        return fail(msg="博客不存在", code=BLOG_NOT_FOUND)
    return ok(data=None, msg="删除成功")
