from loguru import logger
import pymysql
import time
from typing import Any, List, Optional, Tuple
from pymysql.cursors import DictCursor  # 导入 DictCursor


def _param_count(params) -> int:
    if params is None:
        return 0
    if isinstance(params, dict):
        return len(params)
    if isinstance(params, (list, tuple)):
        return len(params)
    return 1


class MySQLManager:
    """
    MySQL连接管理类，基于PyMySQL库实现。

    该类提供了一个健壮的MySQL连接，支持自动重连、上下文管理、异常处理等功能。

    属性:
        host (str): MySQL服务器主机名
        port (int): MySQL服务器端口
        user (str): MySQL用户名
        password (str): MySQL密码
        db (str): MySQL数据库名
        charset (str): 字符集，默认为utf8mb4,注意和数据库的字符集一致
        max_retry_times (int): 最大重试次数，默认为3
        retry_interval (int): 重试间隔时间（秒），默认为5
    """

    def __init__(self, host: str, port: int, db: str, user: Optional[str] = None,
                 password: Optional[str] = None, charset: str = 'utf8mb4',
                 max_retry_times: int = 3, retry_interval: int = 5):
        self.host = host
        self.port = port
        self.user = user
        self.password = password
        self.db = db
        self.charset = charset
        self.max_retry_times = max_retry_times
        self.retry_interval = retry_interval
        self.cnx = None
        self.cursor = None
        self.connect()

    def connect(self):
        """建立数据库连接"""
        try:
            self.cnx = pymysql.connect(
                host=self.host,
                port=self.port,
                user=self.user,
                password=self.password,
                db=self.db,
                charset=self.charset,
                autocommit=False,  # 禁止自动提交，使用手动提交
                cursorclass=DictCursor  # 设置游标类型为字典游标
            )
            self.cursor = self.cnx.cursor()

            logger.info("成功连接到MySQL数据库")
        except pymysql.Error as e:
            logger.error(f"连接MySQL数据库失败: {e}")
            raise

    def is_alive(self) -> bool:
        """检查连接是否存活"""
        try:
            if self.cnx and self.cursor:
                self.cursor.execute("SELECT 1")
                return True
        except pymysql.Error as e:
            logger.error(f"数据库连接检查失败: {e}")
        return False

    def reconnect(self):
        """重试连接数据库"""
        for attempt in range(1, self.max_retry_times + 1):
            logger.warning(f"尝试重新连接数据库, 第 {attempt} 次...")
            self.connect()
            if self.is_alive():
                logger.info("重连MySQL数据库成功")
                return
            time.sleep(self.retry_interval)
        logger.error(f"重试 {self.max_retry_times} 次后仍无法连接MySQL数据库")
        raise ConnectionError("无法连接到MySQL数据库")

    def execute(self, sql: str, params: Optional[Tuple[Any, ...]] = None) -> Optional[int]:
        """
        执行SQL语句，支持参数化查询

        Args:
            sql (str): 要执行的SQL语句
            params (tuple): SQL语句的参数

        Returns:
            Optional[int]: 返回受影响的行数，或查询结果的第一行
        """
        if not self.is_alive():
            self.reconnect()

        try:
            logger.debug(f"执行SQL: {sql} | 参数数量: {_param_count(params)}")
            self.cursor.execute(sql, params)
            self.cnx.commit()
            if sql.strip().lower().startswith("select"):
                result = self.cursor.fetchall()
                # logger.info(f"查询结果: {result}")
                return result
            elif sql.strip().lower().startswith("insert"):
                result = self.cursor.lastrowid
                # logger.info(f"查询结果: {result}")
                return result
            return self.cursor.rowcount
        except pymysql.Error as e:
            self.cnx.rollback()
            logger.error(f"SQL执行失败: {e}")
            raise
    def fetch_one(self, sql: str, params: Tuple[Any, ...] = ()) -> Optional[dict]:
        """
        查询一条记录

        Args:
            sql (str): 要执行的SQL语句
            params (tuple): 参数

        Returns:
            Optional[dict]: 查询结果的字典，如果没有数据则返回None
        """
        if not self.is_alive():
            self.reconnect()
        try:
            self.cursor.execute(sql, params)
            result = self.cursor.fetchone()
            logger.debug(f"查询一条记录: {sql} | 参数数量: {_param_count(params)} | 命中: {bool(result)}")
            return result
        except pymysql.Error as e:
            logger.error(f"查询失败: {e}")
            return None

    def find_page_query(self, table: str, filter: Optional[dict] = None, skip: int = 0, page_size: int = 10) -> List[dict]:
        """
        分页查询 MySQL 中的记录。

        Args:
            table (str): 要查询的表名。
            filter (dict): 查询的过滤条件（WHERE 子句）。
            skip (int): 从第几条记录开始（偏移量）。
            page_size (int): 每页显示的记录数。

        Returns:
            List[dict]: 查询结果的字典列表。
        """
        if filter is None:
            filter = {}

        # 构建 WHERE 子句
        where_clause = " AND ".join([f"{key} = %s" for key in filter.keys()])
        where_clause = f"WHERE {where_clause}" if where_clause else ""

        # 构建 SQL 查询语句
        sql = f"SELECT * FROM {table} {where_clause} LIMIT %s OFFSET %s"
        params = list(filter.values()) + [page_size, skip]

        # 执行查询
        try:
            logger.debug(f"执行分页查询: {sql} | 参数数量: {_param_count(params)}")
            self.cursor.execute(sql, params)
            result = self.cursor.fetchall()
            logger.debug(f"分页查询结果条数: {len(result)}")
            return result
        except pymysql.Error as e:
            logger.error(f"分页查询失败: {e}")
            return []

    def fetch_all(self, sql: str, params: Tuple[Any, ...] = ()) -> List[dict]:
        """
        查询多条记录

        Args:
            sql (str): 要执行的SQL语句
            params (tuple): 参数

        Returns:
            List[dict]: 查询结果的字典列表，如果没有数据则返回空列表
        """
        if not self.is_alive():
            self.reconnect()
        try:
            self.cursor.execute(sql, params)
            result = self.cursor.fetchall()
            logger.debug(f"查询多条记录: {sql} | 参数数量: {_param_count(params)} | 结果条数: {len(result)}")
            return result or []
        except pymysql.Error as e:
            logger.error(f"查询失败: {e}")
            return []

    def count(self, table: str, filter: Optional[dict] = None) -> int:
        """
        获取表中符合条件的记录数

        Args:
            table (str): 表名
            filter (dict): 查询的过滤条件（WHERE 子句）

        Returns:
            int: 记录数
        """
        if filter is None:
            filter = {}

        where_clause = " AND ".join([f"{key} = %s" for key in filter.keys()])
        where_clause = f"WHERE {where_clause}" if where_clause else ""
        sql = f"SELECT COUNT(*) as count FROM {table} {where_clause}"
        params = list(filter.values())

        try:
            logger.debug(f"执行计数查询: {sql} | 参数数量: {_param_count(params)}")
            self.cursor.execute(sql, params)
            result = self.cursor.fetchone()
            return result['count'] if result else 0
        except pymysql.Error as e:
            logger.error(f"计数查询失败: {e}")
            return 0


    def close(self):
        """关闭数据库连接"""
        if self.cursor:
            self.cursor.close()
        if self.cnx:
            self.cnx.close()
        logger.info("关闭MySQL数据库连接")

    def __enter__(self):
        """支持上下文管理"""
        if not self.is_alive():
            self.reconnect()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """退出时关闭连接"""
        self.close()
