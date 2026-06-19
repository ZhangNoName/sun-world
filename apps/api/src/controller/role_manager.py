from datetime import datetime
from typing import Any, Dict, Optional, List
from loguru import logger
from src.database.mysql.mysql_manage import MySQLManager
from src.type.user_type import User

class RoleManager:
    """
    角色管理模块
    负责系统角色增删改查，以及角色-资源绑定
    """

    table_name = "roles"
    role_resource_table = "role_resources"
    all_attr = ["id", "name", "code", "description", "create_time"]

    def __init__(self, db: MySQLManager):
        self.db = db

    def get_all_role_attr(self) -> str:
        """获取全部字段字符串，用于SQL查询"""
        return ",".join(self.all_attr)

    def create_role(self, role: Dict[str, Any]) -> int:
        """
        创建角色

        Args:
            role: 字典，包含 name, code, description
        Returns:
            int: 插入的角色ID
        """
        sql = f"""
        INSERT INTO {self.table_name} (name, code, description, create_time)
        VALUES (%s, %s, %s, NOW())
        """
        params = (
            role["name"],
            role["code"],
            role.get("description", "")
        )
        return self.db.execute(sql, params)

    def update_role(self, role_id: int, **kwargs) -> int:
        """更新角色"""
        set_clause = ", ".join(f"{k}=%s" for k in kwargs)
        sql = f"UPDATE {self.table_name} SET {set_clause} WHERE id=%s"
        params = tuple(kwargs.values()) + (role_id,)
        return self.db.execute(sql, params)

    def delete_role(self, role_id: int) -> bool:
        """删除角色，并清理关联资源"""
        self.db.execute(f"DELETE FROM {self.role_resource_table} WHERE role_id=%s", (role_id,))
        return self.db.execute(f"DELETE FROM {self.table_name} WHERE id=%s", (role_id,)) > 0

    def get_role_by_id(self, role_id: int) -> Optional[Dict[str, Any]]:
        """根据ID获取角色"""
        sql = f"SELECT {self.get_all_role_attr()} FROM {self.table_name} WHERE id=%s"
        return self.db.fetch_one(sql, (role_id,))

    def list_roles(self, filter: Optional[Dict[str, Any]] = None,
                   page: int = 1, per_page: int = 10) -> List[Dict[str, Any]]:
        """分页查询角色"""
        offset = (page - 1) * per_page
        filter = filter or {}
        where_clause = " AND ".join(f"{k}=%s" for k in filter.keys())
        where_clause = f"WHERE {where_clause}" if where_clause else ""
        sql = f"SELECT {self.get_all_role_attr()} FROM {self.table_name} {where_clause} LIMIT %s OFFSET %s"
        params = list(filter.values()) + [per_page, offset]
        return self.db.fetch_all(sql, tuple(params))

    # ---------------------------
    # 角色-资源关联操作
    # ---------------------------

    def bind_resources(self, role_id: int, resource_ids: List[int]):
        """绑定角色到多个资源"""
        # 先删除已有关联
        self.db.execute(f"DELETE FROM {self.role_resource_table} WHERE role_id=%s", (role_id,))
        # 批量插入
        for res_id in resource_ids:
            self.db.execute(f"INSERT INTO {self.role_resource_table} (role_id, resource_id) VALUES (%s, %s)",
                            (role_id, res_id))

    def get_resources_by_role(self, role_id: int) -> List[int]:
        """获取某个角色绑定的资源ID列表"""
        sql = f"SELECT resource_id FROM {self.role_resource_table} WHERE role_id=%s"
        rows = self.db.fetch_all(sql, (role_id,))
        return [row["resource_id"] for row in rows]

    def get_roles_with_resources(self, page: int = 1, per_page: int = 10) -> List[Dict[str, Any]]:
        """
        查询角色及其绑定资源
        Returns:
            List[Dict]: 每个元素包含角色信息和对应资源ID列表
        """
        roles = self.list_roles(page=page, per_page=per_page)
        for role in roles:
            role["resource_ids"] = self.get_resources_by_role(role["id"])
        return roles
