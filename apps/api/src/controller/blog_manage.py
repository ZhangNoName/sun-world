from typing import Any, Dict, List, Optional, Union
import uuid
from datetime import datetime

from bson import ObjectId
from loguru import logger
from pymongo.cursor import Cursor
from src.database.mongo.mongodb_manage import MongoDBManager
from src.database.mysql.mysql_manage import MySQLManager
from src.type.blog_type import Blog, BlogBase, BlogCreate, BlogDetail, TagNew


# Compatibility exports for callers and SQL protocol checks.
from src.modules.blog.repository import build_blog_list_query, build_blog_list_count_query


class BlogManager:
    def __init__(self,baseDB:MySQLManager, contentDB: MongoDBManager):
        self.db = baseDB
        self.contentDB = contentDB

    def get_or_create_tag(self, tag: Union[int, TagNew], blog_id: int) -> int:
        """检查标签是否存在，不存在则创建"""
        if isinstance(tag, int) and not isinstance(tag, bool):
            tag_id = tag
        elif isinstance(tag, TagNew):
            tag_name = tag.name.strip()
            if not tag_name:
                raise ValueError("Tag name cannot be empty")
            sql = "SELECT id FROM tag WHERE name = %s"
            existing = self.db.fetch_one(sql, (tag_name,))
            if existing:
                tag_id = int(existing["id"])
            else:
                create_sql = """
                    INSERT INTO tag (name) VALUES (%s)
                """
                tag_id = int(self.db.execute(create_sql, (tag_name,)))
        else:
            raise TypeError("Tag must be an integer ID or TagNew")

        blog_tag_sql = "INSERT IGNORE INTO blog_tag (blog_id, tag_id) VALUES (%s, %s)"
        self.db.execute(blog_tag_sql, (blog_id, tag_id))
        return tag_id


    def add_blog(self, blog: BlogCreate) -> str:
        """
        添加一个博客,返回生成的唯一ID。

        Args:
            blog (Blog): 博客对象

        Returns:
            str: 插入后的文档的 ID
        """
        # return self.contentDB.insert_one("blogs", blog.model_dump())

        sql = """
        INSERT INTO blog (title, author, abstract,  category, updated_at, is_deleted)
        VALUES (%s, %s,  %s, %s, NOW(), 0)
        """
        params = (blog.title, blog.author, blog.abstract,  blog.category)
        id = self.db.execute(sql, params)
        # logger.info(f'插入的结果{res}')
         # 处理标签，确保所有 tag 都是 ID
        tag_ids = [self.get_or_create_tag(tag,id) for tag in blog.tag]
        # 将内容插入MongoDB记录
        result = self.contentDB.insert_one("blogs", {"blogId": id, "title": blog.title, "content": blog.content})
        if result:
            return id
        logger.error(f"Mongo content insert failed for blog_id={id}; rolling back MySQL metadata")
        self.rollback_blog_metadata(id)
        return None

    def rollback_blog_metadata(self, blog_id: int) -> None:
        try:
            self.db.execute("DELETE FROM blog_tag WHERE blog_id = %s", (blog_id,))
            self.db.execute("DELETE FROM blog WHERE id = %s", (blog_id,))
        except Exception as e:
            logger.error(f"Failed to roll back blog metadata for blog_id={blog_id}: {e}")

    def delete_blog(self, blog_id: str) -> bool:
        """
        删除指定ID的博客。

        Args:
            blog_id (str): 博客的 ID

        Returns:
            bool: 删除成功返回 True，否则返回 False
        """
        sql = """
        UPDATE blog
        SET is_deleted = TRUE
        WHERE id = %s AND COALESCE(is_deleted, 0) = 0
        """
        result = self.db.execute(sql, (blog_id,))
        return result > 0

    def update_blog(self, blog_id: int, blog: BlogCreate) -> bool:
        """Update blog metadata, content, and tag relations."""
        existing = self.db.fetch_one(
            """
            SELECT id
            FROM blog
            WHERE id = %s AND COALESCE(is_deleted, 0) = 0
            """,
            (blog_id,),
        )
        if not existing:
            return False

        self.db.execute(
            """
            UPDATE blog
            SET title = %s, author = %s, abstract = %s,
                category = %s, updated_at = NOW()
            WHERE id = %s AND COALESCE(is_deleted, 0) = 0
            """,
            (blog.title, blog.author, blog.abstract, blog.category, blog_id),
        )
        self.db.execute("DELETE FROM blog_tag WHERE blog_id = %s", (blog_id,))
        for tag in blog.tag:
            self.get_or_create_tag(tag, str(blog_id))

        return self.contentDB.update_one(
            "blogs",
            {"blogId": blog_id},
            {"title": blog.title, "content": blog.content},
            upsert=False,
        )

    def _public_queries(self):
        from src.modules.blog.public import create_public_queries
        return create_public_queries(self.db, self.contentDB)

    def get_blog(self, blog_id: int) -> BlogDetail | None:
        from src.core.auth import Principal
        return self._public_queries().read(Principal(), blog_id)

    def get_blog_by_page(
        self, page: int, page_size: int, keyword: Optional[str] = None,
        sort_by: Optional[str] = None, sort_order: Optional[str] = None,
    ) -> Dict[str, Any]:
        from src.core.auth import Principal
        return self._public_queries().list_page(
            Principal(), page, page_size, keyword, sort_by, sort_order,
        )
