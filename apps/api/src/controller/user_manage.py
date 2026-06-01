from datetime import datetime
from typing import Optional, List
from loguru import logger
from src.database.mysql.mysql_manage import MySQLManager
from src.type.user_type import User


class UserManager:
    """
    用户管理类，提供用户的增删改查功能，同时支持获取用户的角色和资源权限。
    """
    table_name = "users"
    all_attr = [
        'id', 'name',  'age', 'phone', 'email',
        'password', 'birth_day', 'create_time', 'status',"sex"
    ]
    
    def __init__(self, db: MySQLManager):
        """
        初始化 UserManager

        Args:
            db (MySQLManager): 数据库操作对象
        """
        self.db = db

    def get_all_user_attr(self) -> str:
        """
        获取所有用户表字段，以逗号分隔

        Returns:
            str: 字段字符串
        """
        return ",".join(self.all_attr)

    def create_user(self, user: User) -> bool:
        """
        创建用户

        Args:
            user (User): 用户对象，包含用户名、昵称、性别、年龄、手机号、邮箱、密码、生日等信息

        Returns:
            bool: 创建成功返回 True，失败返回 False
        """
        sql = f"""
        INSERT INTO {self.table_name} 
        ( name, sex, age, phone, email, password, birth_day, create_time) 
        VALUES (%s,%s,%s,%s,%s,%s,%s,NOW())
        """
        val = (user.name, user.sex, user.age, user.phone, user.email, user.password, user.birth_day)
        try:
            res = self.db.execute(sql, val)
            logger.info(f"用户创建成功 {res}")
             # 默认分配角色 id=2
            self.set_role_by_id(res, [2])
            return True
        except Exception as e:
            logger.error(f"创建用户失败: {e}")
            return False


    def get_user_by_id(self, user_id: int) -> Optional[User]:
        """
        根据用户ID获取用户信息，同时获取角色列表和资源权限列表

        Args:
            user_id (int): 用户ID

        Returns:
            Optional[User]: 用户信息字典，如果不存在则返回 None
        """
        # 查询用户基本信息
        sql = f"SELECT {self.get_all_user_attr()} FROM {self.table_name} WHERE id = %s"
        result = self.db.fetch_one(sql, user_id)
        if not result:
            return None

        # 构造用户字典
        user_data = result if isinstance(result, dict) else dict(zip(self.all_attr, result))

        # 查询用户角色
        role_sql = """
        SELECT r.id, r.name, r.code 
        FROM roles r
        INNER JOIN user_roles ur ON r.id = ur.role_id
        WHERE ur.user_id = %s
        """
        roles = self.db.fetch_all(role_sql, user_id)
        user_data['roles'] = roles or []

        # 查询用户资源权限（通过角色关联）
        resource_sql = """
        SELECT DISTINCT res.id, res.name, res.code, res.type, res.path
        FROM resources res
        INNER JOIN role_resources rr ON res.id = rr.resource_id
        INNER JOIN user_roles ur ON rr.role_id = ur.role_id
        WHERE ur.user_id = %s
        """
        resources = self.db.fetch_all(resource_sql, user_id)
        user_data['resources'] = resources or []

        return user_data

    def get_user_by_name(self, name: str, page: int = 1, per_page: int = 10) -> List[User]:
        """
        根据用户名模糊查询用户信息，支持分页，同时获取每个用户的角色和资源列表

        Args:
            name (str): 用户名模糊匹配
            page (int): 页码，从1开始
            per_page (int): 每页显示记录数量

        Returns:
            List[User]: 用户列表，每个用户包含基本信息、角色列表、资源列表
        """
        offset = (page - 1) * per_page
        sql = f"""
        SELECT {self.get_all_user_attr()} 
        FROM {self.table_name} 
        WHERE name LIKE %s 
        ORDER BY id ASC 
        LIMIT %s OFFSET %s
        """
        params = (f"%{name}%", per_page, offset)
        result = self.db.execute(sql, params)
        return result
        users = []
        for row in result:
            # 构造用户基本信息字典
            user_data = dict(zip(self.all_attr, row))
            user_id = user_data['id']

            # 查询用户角色
            role_sql = """
            SELECT r.id, r.name, r.code 
            FROM roles r
            INNER JOIN user_roles ur ON r.id = ur.role_id
            WHERE ur.user_id = %s
            """
            roles = self.db.fetch_all(role_sql, user_id)
            user_data['roles'] = roles or []

            # 查询用户资源权限
            resource_sql = """
            SELECT DISTINCT res.id, res.name, res.code, res.type, res.path
            FROM resources res
            INNER JOIN role_resources rr ON res.id = rr.resource_id
            INNER JOIN user_roles ur ON rr.role_id = ur.role_id
            WHERE ur.user_id = %s
            """
            resources = self.db.fetch_all(resource_sql, user_id)
            user_data['resources'] = resources or []

            users.append(user_data)

        return users

    def get_user_by_email(self, name: str, page: int = 1, per_page: int = 10) -> List[User]:
        """
        根据用户名模糊查询用户信息，支持分页，同时获取每个用户的角色和资源列表

        Args:
            name (str): 用户名模糊匹配
            page (int): 页码，从1开始
            per_page (int): 每页显示记录数量

        Returns:
            List[User]: 用户列表，每个用户包含基本信息、角色列表、资源列表
        """
        offset = (page - 1) * per_page
        sql = f"""
        SELECT {self.get_all_user_attr()} 
        FROM {self.table_name} 
        WHERE email LIKE %s 
        ORDER BY id ASC 
        LIMIT %s OFFSET %s
        """
        params = (f"%{name}%", per_page, offset)
        result = self.db.fetch_all(sql, params)

        users = []
        for row in result:
            # 构造用户基本信息字典
            user_data = row
            user_id = user_data["id"]
            logger.debug(f"获取的id{row}{user_data}")

            # 查询用户角色
            role_sql = """
            SELECT r.id, r.name, r.code 
            FROM roles r
            INNER JOIN user_roles ur ON r.id = ur.role_id
            WHERE ur.user_id = %s
            """
            roles = self.db.fetch_all(role_sql, user_id)
            user_data['roles'] = roles or []

            # 查询用户资源权限
            resource_sql = """
            SELECT DISTINCT res.id, res.name, res.code, res.type, res.path
            FROM resources res
            INNER JOIN role_resources rr ON res.id = rr.resource_id
            INNER JOIN user_roles ur ON rr.role_id = ur.role_id
            WHERE ur.user_id = %s
            """
            resources = self.db.fetch_all(resource_sql, user_id)
            user_data['resources'] = resources or []

            users.append(User(**user_data))

        return users

    def update_user(self, user_id: str, **kwargs) -> int:
        """
        更新用户信息

        Args:
            user_id (str): 用户ID
            kwargs: 要更新的字段和值，例如 name='new_name', age=30

        Returns:
            int: 受影响的行数
        """
        set_clause = ', '.join(f"{key} = %s" for key in kwargs)
        sql = f"UPDATE {self.table_name} SET {set_clause} WHERE id = %s"
        values = tuple(kwargs.values()) + (user_id,)
        return self.db.execute(sql, values)

    def delete_user(self, user_id: str) -> bool:
        """
        逻辑删除用户（停用账号），通过设置 is_active=0

        Args:
            user_id (str): 用户ID

        Returns:
            bool: 成功返回 True，否则 False
        """
        result = self.update_user(user_id, status=0)
        return result > 0

    def set_role_by_id(self, user_id: str, role_ids: List[int]) -> bool:
        """
        为用户分配角色，一个用户可以有多个角色

        Args:
            user_id (str): 用户ID
            role_ids (List[int]): 角色ID列表

        Returns:
            bool: 分配成功返回 True，否则 False
        """
    
        try:
            # 先删除该用户已有的角色关联
            delete_sql = "DELETE FROM user_roles WHERE user_id = %s"
            self.db.execute(delete_sql, (user_id,))
            # 再插入新的角色关联
            insert_sql = "INSERT INTO user_roles (user_id, role_id) VALUES (%s, %s)"
            for role_id in role_ids:
                self.db.execute(insert_sql, (user_id, role_id))
            return True
        except Exception as e:
            logger.error(f"为用户分配角色失败: {e}")
            return False