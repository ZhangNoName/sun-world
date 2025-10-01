from datetime import datetime
from typing import Optional, List, Dict, Any, Tuple
from loguru import logger
from src.database.mysql.mysql_manage import MySQLManager


class ResourceManager:
    """
    资源管理模块
    负责系统资源（页面、接口、按钮等）的增删改查
    """

    table_name = "resources"
    all_attr = ["id", "name", "code", "type", "path", "description", "create_time"]

    def __init__(self, db: MySQLManager):
        self.db = db

    def get_all_resource_attr(self) -> str:
        """获取全部字段字符串，用于SQL查询"""
        return ",".join(self.all_attr)

    def create_resource(self, resource: Dict[str, Any]) -> int:
        """
        创建资源

        Args:
            resource: 字典，包含 name, code, type, path, description
        Returns:
            int: 插入的资源ID
        """
        sql = f"""
        INSERT INTO {self.table_name} (name, code, type, path, description, create_time)
        VALUES (%s, %s, %s, %s, %s, NOW())
        """
        params = (
            resource["name"],
            resource["code"],
            resource["type"],
            resource.get("path", ""),
            resource.get("description", ""),
        )
        return self.db.execute(sql, params)

    def update_resource(self, resource_id: int, **kwargs) -> int:
        """更新资源"""
        set_clause = ", ".join(f"{key}=%s" for key in kwargs)
        sql = f"UPDATE {self.table_name} SET {set_clause} WHERE id=%s"
        params = tuple(kwargs.values()) + (resource_id,)
        return self.db.execute(sql, params)

    def delete_resource(self, resource_id: int) -> bool:
        """逻辑删除资源（可以用 is_active 字段或者直接物理删除）"""
        sql = f"DELETE FROM {self.table_name} WHERE id=%s"
        return self.db.execute(sql, (resource_id,)) > 0

    def get_resource_by_id(self, resource_id: int) -> Optional[Dict[str, Any]]:
        """根据ID获取资源"""
        sql = f"SELECT {self.get_all_resource_attr()} FROM {self.table_name} WHERE id=%s"
        return self.db.fetch_one(sql, (resource_id,))

    def list_resources(self, filter: Optional[Dict[str, Any]] = None,
                       page: int = 1, per_page: int = 10) -> List[Dict[str, Any]]:
        """分页查询资源"""
        offset = (page - 1) * per_page
        filter = filter or {}
        where_clause = " AND ".join(f"{k}=%s" for k in filter.keys())
        where_clause = f"WHERE {where_clause}" if where_clause else ""
        sql = f"SELECT {self.get_all_resource_attr()} FROM {self.table_name} {where_clause} LIMIT %s OFFSET %s"
        params = list(filter.values()) + [per_page, offset]
        return self.db.fetch_all(sql, tuple(params))

