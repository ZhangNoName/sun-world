"""Legacy MySQL/Mongo read adapter; no writes and no view increments."""
from typing import Any, Dict, Optional

from loguru import logger
from src.type.blog_type import BlogBase, BlogDetail


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



class BlogPublicRepository:
    def __init__(self, metadata_db, content_db):
        self.db = metadata_db
        self.contentDB = content_db

    def content_ids(self, article_ids: list[int]) -> set[int]:
        if not article_ids:
            return set()
        # Projection avoids loading entire article bodies during search/listing.
        self.contentDB._maybe_reconnect()
        rows = self.contentDB.db["blogs"].find(
            {"blogId": {"$in": article_ids}, "content": {"$type": "string"}},
            {"_id": 0, "blogId": 1},
        )
        return {row["blogId"] for row in rows}

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
        logger.debug(
            "Blog content lookup completed blog_id={} found={}",
            blog_id,
            bool(blog_data),
        )
        if blog_data and isinstance(blog_data.get("content"), str):
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

        count_query, count_params = build_blog_list_count_query(keyword=keyword)
        count_result = self.db.fetch_one(count_query, tuple(count_params))
        total_count = int(count_result.get("count", 0)) if count_result else 0

        # 获取所有博客的 ID
        blog_ids = [blog["id"] for blog in blogs_data]

        if not blog_ids:
            return {
                "total": total_count,
                "page": page,
                "page_size": page_size,
                "list": []
            }

        # 2. 查询 blog_tag 表，获取所有博客的 tag 关联关系
        placeholders = ", ".join(["%s"] * len(blog_ids))
        blog_tag_query = f"""
            SELECT blog_id, tag_id FROM blog_tag WHERE blog_id IN ({placeholders})
        """

        blog_tag_data = self.db.fetch_all(blog_tag_query, tuple(blog_ids))

        # 构建 blog_id -> tag_id 列表的映射
        blog_tag_map = {}
        for row in blog_tag_data:
            blog_id = row["blog_id"]
            tag_id = row["tag_id"]
            if blog_id not in blog_tag_map:
                blog_tag_map[blog_id] = []
            blog_tag_map[blog_id].append(tag_id)

        for blog in blogs_data:
            blog_id = blog["id"]
            blog["tag"] = [tag_id for tag_id in blog_tag_map.get(blog_id, [])]  # 关联 tag

        return {
            "total": total_count,
            "page": page,
            "page_size": page_size,
            "list": [BlogBase(**blog_data) for blog_data in blogs_data]
        }
