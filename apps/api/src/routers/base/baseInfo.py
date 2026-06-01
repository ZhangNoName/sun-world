from fastapi import APIRouter, Depends, HTTPException
from loguru import logger
from app_instance import app
from src.controller.base_manage import BaseManager
from src.controller.tag_manage import TagManager
from src.type.type import BlogStats, ResponseModel

router = APIRouter(prefix="/base",tags=["基础信息"])
# 注入 BlogManager 依赖
def get_tag_manager() -> TagManager:
    if not hasattr(app, 'blog'):
        raise HTTPException(status_code=500, detail="Tag manager not initialized")
    return app.tag
def get_base_manager() -> BaseManager:
    if not hasattr(app, 'base'):
        raise HTTPException(status_code=500, detail="Base manager not initialized")
    return app.base
@router.get("/", tags=["基础信息"])
async def base_info(base_manager: BaseManager = Depends(get_base_manager)):
    """
    获取博客的统计信息，包括文章数、种类数、标签数和总浏览量。
    """
    # logger.info("获取博客统计信息")
    try:
        # logger.info("获取博客统计信息---准备进入")
        res = base_manager.get_base_info()
        # logger.info(f"获取博客统计信息成功: {res}")
        return ResponseModel(code=1, data=res.model_dump(), message="获取统计数据成功")
    except Exception as e:
        logger.error(f"获取博客统计信息失败: {str(e)}")
        return ResponseModel(code=0, data=BlogStats(blog_count=0, category_count=0, tag_count=0, total_view_num=0), message="获取统计数据失败")
@router.get("/blog/category", tags=["基础信息"],description="获取博客的种类列表",summary="博客种类列表")
async def get_blog_category(tag_manager: TagManager = Depends(get_tag_manager)):
    """
    获取博客的种类列表
    """
    res = tag_manager.get_category()
    if not res:
        return ResponseModel(code=0, data=None, message="获取category失败")
    return ResponseModel(code=1, data=res, message="获取category列表成功")
@router.get("/blog/tag", tags=["基础信息"] ,description="获取博客的tag列表",summary="博客tag列表")
async def get_tag_list(tag_manager: TagManager = Depends(get_tag_manager)):
    """
    获取博客的tag列表
    """
    res = tag_manager.get_tag()
    if not res:
        return ResponseModel(code=0, data=None, message="获取tag失败")
    return ResponseModel(code=1, data=res, message="获取Tag列表成功")

