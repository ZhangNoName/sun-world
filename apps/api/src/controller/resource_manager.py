from datetime import datetime
from typing import Optional, List, Dict, Any, Tuple
from loguru import logger
from src.database.mysql.mysql_manage import MySQLManager
from src.core.auth.admin_audit import admin_audit_target, admin_audit_transaction, record_admin_change


class ResourceManager:
    """
    资源管理模块
    负责系统资源（页面、接口、按钮等）的增删改查
    """

    table_name = "resources"
    all_attr = ["id", "name", "code", "type", "path", "description", "create_time"]
    writable_attr = {"name", "code", "type", "path", "description"}

    def __init__(self, db: MySQLManager):
        self.db = db

    def get_all_resource_attr(self) -> str:
        """获取全部字段字符串，用于SQL查询"""
        return ",".join(self.all_attr)

    def create_resource(self, resource: Dict[str, Any], *, audit=None, authorization=None) -> int:
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
        if audit is None and authorization is None:
            return self.db.execute(sql, params)
        with admin_audit_transaction(self.db, audit, authorization=authorization) as uow:
            resource_id = uow.execute(sql, params)
            record_admin_change(uow, audit, action='resource.create', target_id=resource_id, affected_rows=1)
        return resource_id

    def update_resource(self, resource_id: int, *, audit=None, authorization=None, **kwargs) -> int:
        """更新资源"""
        if not kwargs:
            raise ValueError("At least one resource field is required")
        invalid = set(kwargs) - self.writable_attr
        if invalid:
            raise ValueError(f"Unsupported resource fields: {sorted(invalid)}")
        if audit is not None:
            resource_id = admin_audit_target(resource_id)
        set_clause = ", ".join(f"{key}=%s" for key in kwargs)
        sql = f"UPDATE {self.table_name} SET {set_clause} WHERE id=%s"
        params = tuple(kwargs.values()) + (resource_id,)
        if audit is None and authorization is None:
            return self.db.execute(sql, params)
        with admin_audit_transaction(self.db, audit, authorization=authorization) as uow:
            changed = uow.execute(sql, params)
            if changed > 0:
                record_admin_change(uow, audit, action='resource.update', target_id=resource_id, affected_rows=changed)
        return changed

    def delete_resource(self, resource_id: int, *, audit=None, authorization=None) -> bool:
        """Delete a resource and its role associations atomically."""
        if audit is not None:
            resource_id = admin_audit_target(resource_id)
        with admin_audit_transaction(self.db, audit, authorization=authorization) as uow:
            associations = uow.execute(
                "DELETE FROM role_resources WHERE resource_id=%s",
                (resource_id,),
            )
            deleted = uow.execute(
                f"DELETE FROM {self.table_name} WHERE id=%s",
                (resource_id,),
            )
            if audit is not None and associations + deleted > 0:
                record_admin_change(uow, audit, action='resource.delete', target_id=resource_id, affected_rows=associations + deleted)
        return deleted > 0

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
