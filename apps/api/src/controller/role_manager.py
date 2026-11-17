from datetime import datetime
from typing import Any, Dict, Optional, List
from loguru import logger
from src.database.mysql.mysql_manage import MySQLManager
from src.type.user_type import User
from src.core.auth.admin_recovery import admin_recovery_transaction
from src.core.auth.admin_audit import admin_audit_target, admin_audit_transaction, record_admin_change

class RoleManager:
    """
    角色管理模块
    负责系统角色增删改查，以及角色-资源绑定
    """

    table_name = "roles"
    role_resource_table = "role_resources"
    all_attr = ["id", "name", "code", "description", "create_time"]
    writable_attr = {"name", "code", "description"}

    def __init__(self, db: MySQLManager):
        self.db = db

    def get_all_role_attr(self) -> str:
        """获取全部字段字符串，用于SQL查询"""
        return ",".join(self.all_attr)

    def create_role(self, role: Dict[str, Any], *, audit=None, authorization=None) -> int:
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
        if audit is None and authorization is None:
            return self.db.execute(sql, params)
        with admin_audit_transaction(self.db, audit, authorization=authorization) as uow:
            role_id = uow.execute(sql, params)
            record_admin_change(uow, audit, action='role.create', target_id=role_id, affected_rows=1)
        return role_id

    def update_role(self, role_id: int, *, audit=None, authorization=None, **kwargs) -> int:
        """更新角色"""
        if not kwargs:
            raise ValueError("At least one role field is required")
        invalid = set(kwargs) - self.writable_attr
        if invalid:
            raise ValueError(f"Unsupported role fields: {sorted(invalid)}")
        if audit is not None:
            role_id = admin_audit_target(role_id)
        set_clause = ", ".join(f"{k}=%s" for k in kwargs)
        sql = f"UPDATE {self.table_name} SET {set_clause} WHERE id=%s"
        params = tuple(kwargs.values()) + (role_id,)
        if 'code' in kwargs or audit is not None or authorization is not None:
            with admin_audit_transaction(self.db, audit, protect_admin='code' in kwargs, authorization=authorization) as uow:
                changed = uow.execute(sql, params)
                if audit is not None and changed > 0:
                    record_admin_change(uow, audit, action='role.update', target_id=role_id, affected_rows=changed)
                return changed
        return self.db.execute(sql, params)

    def delete_role(self, role_id: int, *, audit=None, authorization=None) -> bool:
        """删除角色，并清理关联资源"""
        if audit is not None:
            role_id = admin_audit_target(role_id)
        with admin_audit_transaction(self.db, audit, protect_admin=True, authorization=authorization) as uow:
            associations = uow.execute("DELETE FROM user_roles WHERE role_id=%s", (role_id,))
            associations += uow.execute(
                f"DELETE FROM {self.role_resource_table} WHERE role_id=%s",
                (role_id,),
            )
            deleted = uow.execute(
                f"DELETE FROM {self.table_name} WHERE id=%s",
                (role_id,),
            )
            if audit is not None and associations + deleted > 0:
                record_admin_change(uow, audit, action='role.delete', target_id=role_id, affected_rows=associations + deleted)
        return deleted > 0

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

    def bind_resources(self, role_id: int, resource_ids: List[int], *, audit=None, authorization=None):
        """绑定角色到多个资源"""
        if audit is not None:
            role_id = admin_audit_target(role_id)
        with admin_audit_transaction(self.db, audit, authorization=authorization) as uow:
            changed = uow.execute(
                f"DELETE FROM {self.role_resource_table} WHERE role_id=%s",
                (role_id,),
            )
            for res_id in resource_ids:
                uow.execute(
                    f"INSERT INTO {self.role_resource_table} "
                    "(role_id, resource_id) VALUES (%s, %s)",
                    (role_id, res_id),
                )
                changed += 1
            if audit is not None:
                record_admin_change(uow, audit, action='role.bind_resources', target_id=role_id, affected_rows=changed)

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
        role_ids = [role["id"] for role in roles]
        if not role_ids:
            return []
        placeholders = ", ".join(["%s"] * len(role_ids))
        rows = self.db.fetch_all(
            f"SELECT role_id, resource_id FROM {self.role_resource_table} "
            f"WHERE role_id IN ({placeholders})",
            tuple(role_ids),
        ) or []
        resources_by_role = {role_id: [] for role_id in role_ids}
        for row in rows:
            resources_by_role.setdefault(row["role_id"], []).append(row["resource_id"])
        for role in roles:
            role["resource_ids"] = resources_by_role.get(role["id"], [])
        return roles
