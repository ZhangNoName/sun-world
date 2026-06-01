from typing import List, Union
import uuid
from datetime import datetime

from bson import ObjectId
from loguru import logger
from pymongo.cursor import Cursor
from src.database.mongo.mongodb_manage import MongoDBManager
from src.database.mysql.mysql_manage import MySQLManager
from src.type.blog_type import Blog, BlogBase, BlogCreate, TagNew
from src.type.type import BlogStats



class BaseManager:
    def __init__(self,db:MySQLManager):
        self.db = db
    
    def get_base_info(self) -> BlogStats:
        """
        获取博客的统计信息，包括文章数、种类数、标签数和总浏览量。
        """
        try:
            logger.info("获取博客统计信息---执行sql")
            
            # 文章总数
            blog_count = self.db.execute("SELECT COUNT(*) AS count FROM blog")[0].get("count", 0)

            # 种类总数
            category_count = self.db.execute("SELECT COUNT(*) AS count FROM category")[0].get("count", 0)

            # 标签总数
            tag_count = self.db.execute("SELECT COUNT(*) AS count FROM tag")[0].get("count", 0)

            # 总浏览量（目前先置为0，可以后续修改为实际计算总和）
            total_view_num = self.db.execute("SELECT SUM(view_num) AS total FROM blog")[0].get("total", 0) or 0
            
            # 返回正确格式的 JSON 数据
            return BlogStats(
                blog_count=blog_count,
                category_count=category_count,
                tag_count=tag_count,
                total_view_num=total_view_num
            )
        except Exception as e:
            logger.error(f"获取博客统计信息失败: {e}")
            # 异常情况下返回默认值
            return BlogStats(
                blog_count=0,
                category_count=0,
                tag_count=0,
                total_view_num=0
            )


