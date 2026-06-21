from typing import Any, Dict, List, Optional, Union
import uuid
from datetime import datetime

from bson import ObjectId
from loguru import logger
from pymongo.cursor import Cursor
from src.database.mongo.mongodb_manage import MongoDBManager
from src.database.mysql.mysql_manage import MySQLManager
from src.type.blog_type import Blog, BlogBase, BlogCreate, BlogDetail, TagNew


BLOG_LIST_SORT_COLUMNS = {
    "created_at": "created_at",
    "updated_at": "updated_at",
    "view_num": "view_num",
}


def _normalize_sort_by(sort_by: Optional[str]) -> str:
    return BLOG_LIST_SORT_COLUMNS.get(sort_by or "", "updated_at")


def _normalize_sort_order(sort_order: Optional[str]) -> str:
    return "ASC" if (sort_order or "").lower() == "asc" else "DESC"


def _normalize_keyword(keyword: Optional[str]) -> str:
    return (keyword or "").strip()


def build_blog_list_query(
    page: int,
    page_size: int,
    keyword: Optional[str] = None,
    sort_by: Optional[str] = None,
    sort_order: Optional[str] = None,
) -> tuple[str, list[Any]]:
    safe_page = max(page, 1)
    safe_page_size = max(min(page_size, 100), 1)
    skip = (safe_page - 1) * safe_page_size
    params: list[Any] = []
    where_clauses = ["COALESCE(is_deleted, 0) = 0"]

    normalized_keyword = _normalize_keyword(keyword)
    if normalized_keyword:
        where_clauses.append("(title LIKE %s OR abstract LIKE %s)")
        like_keyword = f"%{normalized_keyword}%"
        params.extend([like_keyword, like_keyword])

    order_column = _normalize_sort_by(sort_by)
    order_direction = _normalize_sort_order(sort_order)
    where_sql = " AND ".join(where_clauses)
    sql = f"""
        SELECT *
        FROM blog
        WHERE {where_sql}
        ORDER BY {order_column} {order_direction}, id {order_direction}
        LIMIT %s OFFSET %s
    """
    params.extend([safe_page_size, skip])
    return sql, params


def build_blog_list_count_query(keyword: Optional[str] = None) -> tuple[str, list[Any]]:
    params: list[Any] = []
    where_clauses = ["COALESCE(is_deleted, 0) = 0"]

    normalized_keyword = _normalize_keyword(keyword)
    if normalized_keyword:
        where_clauses.append("(title LIKE %s OR abstract LIKE %s)")
        like_keyword = f"%{normalized_keyword}%"
        params.extend([like_keyword, like_keyword])

    where_sql = " AND ".join(where_clauses)
    return f"SELECT COUNT(*) AS count FROM blog WHERE {where_sql}", params



class BlogManager:
    def __init__(self,baseDB:MySQLManager, contentDB: MongoDBManager):
        self.db = baseDB
        self.contentDB = contentDB

    def get_or_create_tag(self, tag: Union[str, TagNew],blog_id:str) -> int:
        """检查标签是否存在，不存在则创建"""

        if isinstance(tag, str):
            # 已有标签，直接返回 ID
            logger.info('已有id',tag)
            id =  tag
        elif isinstance(tag, TagNew):
            # 查询是否存在该标签
            tag_name = tag.name.strip()
            sql = "SELECT id FROM tag WHERE name = %s"
            id = self.db.fetch_one(sql, tag_name)
            if id is None:
                create_sql = """
                    INSERT INTO tag (name) VALUES (%s)
                """
                # 不存在，插入新标签
                id = self.db.execute(create_sql, tag_name)
        # 插入博客标签关联表
        if id:
            # 插入 blog_tag 关系表
            blog_tag_sql = "INSERT IGNORE INTO blog_tag (blog_id, tag_id) VALUES (%s, %s)"
            self.db.execute(blog_tag_sql, (blog_id, id))
        return id


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

    def get_blog(self, blog_id:int) -> BlogDetail:
        """
        获取指定ID的博客。

        Args:
            blog_id (str): 博客的 ID

        Returns:
            Blog: 博客对象，如果不存在则返回 None
        """
        metadata = self.db.fetch_one(
            """
            SELECT id, title, author, abstract, category, created_at,
                   updated_at, view_num, comment_num, byte_num
            FROM blog
            WHERE id = %s AND COALESCE(is_deleted, 0) = 0
            """,
            (blog_id,),
        )
        if not metadata:
            return None

        blog_data = self.contentDB.find_one("blogs", {"blogId": blog_id})
        logger.info(f'查询到的结果{blog_id}{blog_data}')
        if blog_data:
            tag_rows = self.db.fetch_all(
                "SELECT tag_id FROM blog_tag WHERE blog_id = %s",
                (blog_id,),
            )
            metadata["tag"] = [row["tag_id"] for row in tag_rows]
            metadata["content"] = blog_data.get("content", "")
            return BlogDetail(**metadata)
        return None


    def get_blog_by_page(
        self,
        page: int,
        page_size: int,
        keyword: Optional[str] = None,
        sort_by: Optional[str] = None,
        sort_order: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        分页获取博客列表，并附加标签信息。

        Args:
            page (int): 页码，从1开始
            page_size (int): 每页显示的博客数量

        Returns:
            Dict[str, Any]: 包含博客列表、总数、分页信息的字典
        """

        # 1. 查询博客数据
        logger.debug(f'分页获取数据 {page}{page_size}')
        query, query_params = build_blog_list_query(
            page=page,
            page_size=page_size,
            keyword=keyword,
            sort_by=sort_by,
            sort_order=sort_order,
        )
        blogs_data = self.db.fetch_all(query, tuple(query_params))

        # 获取所有博客的 ID
        blog_ids = [blog["id"] for blog in blogs_data]

        if not blog_ids:
            return {
                "total": 0,
                "page": page,
                "page_size": page_size,
                "list": []
            }

        # 2. 查询 blog_tag 表，获取所有博客的 tag 关联关系
        placeholders = ", ".join(["%s"] * len(blog_ids))
        blog_tag_query = f"""
            SELECT blog_id, tag_id FROM blog_tag WHERE blog_id IN ({placeholders})
        """

        blog_tag_data = self.db.execute(blog_tag_query, tuple(blog_ids))  # 结果: [{'blog_id': 1, 'tag_id': 2}, ...]

        # 构建 blog_id -> tag_id 列表的映射
        blog_tag_map = {}
        tag_ids = set()  # 收集所有的 tag_id
        for row in blog_tag_data:
            blog_id = row["blog_id"]
            tag_id = row["tag_id"]
            tag_ids.add(tag_id)
            if blog_id not in blog_tag_map:
                blog_tag_map[blog_id] = []
            blog_tag_map[blog_id].append(tag_id)

        # 3. 查询 tag 表，获取所有 tag_id 对应的 tag_name
        # if tag_ids:
        #     tag_query = """
        #         SELECT id, name FROM tag WHERE id IN (%s)
        #     """ % (", ".join(map(str, tag_ids)))
        #     tag_data = self.db.execute(tag_query)  # 结果: [{'id': 2, 'name': 'Python'}, ...]

        #     # 构建 tag_id -> tag_name 映射
        #     tag_map = {row["id"]: row["name"] for row in tag_data}
        # else:
        #     tag_map = {}

        # # 4. 组装最终的博客数据
        for blog in blogs_data:
            blog_id = blog["id"]
            blog["tag"] = [tag_id for tag_id in blog_tag_map.get(blog_id, [])]  # 关联 tag

        count_query, count_params = build_blog_list_count_query(keyword=keyword)
        count_result = self.db.execute(count_query, tuple(count_params))
        total_count = count_result[0].get("count", 0) if count_result else 0
        # total_count = 10
        # logger.info(f'查询到的结果{blogs_data}')
        return {
            "total": total_count,
            "page": page,
            "page_size": page_size,
            "list": [BlogBase(**blog_data) for blog_data in blogs_data]
        }
