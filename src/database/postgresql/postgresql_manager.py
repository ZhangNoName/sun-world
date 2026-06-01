import psycopg2
from psycopg2.extras import RealDictCursor
from loguru import logger
import time
from typing import Any, List, Optional, Tuple


class PostgreSQLManager:
    """
    PostgreSQL连接管理类，基于psycopg2库实现。

    该类提供了一个健壮的PostgreSQL连接，支持自动重连、上下文管理、异常处理等功能。

    Attributes:
        ip: PostgreSQL服务器IP地址
        port: PostgreSQL服务器端口
        db: PostgreSQL数据库名称
        user: PostgreSQL用户名
        password: PostgreSQL密码
        max_retry_times: 最大重试次数，默认为3
        retry_interval: 重试间隔时间（秒），默认为5
    """

    def __init__(self, ip: str, port: int, db: str, user: str,
                 password: Optional[str] = None, max_retry_times: int = 3,
                 retry_interval: int = 5):
        self.ip = ip
        self.port = port
        self.db = db
        self.user = user
        self.password = password
        self.max_retry_times = max_retry_times
        self.retry_interval = retry_interval
        self.conn = None
        self.cursor = None
        self.connect()

    def connect(self):
        """建立数据库连接"""
        logger.info(
            f"尝试连接PostgreSQL数据库 {self.ip}:{self.port}/{self.db},用户: {self.user}")
        try:
            self.conn = psycopg2.connect(
                host=self.ip,
                port=self.port,
                database=self.db,
                user=self.user,
                password=self.password,
                cursor_factory=RealDictCursor  # 使用字典游标，返回字典格式的结果
            )
            self.cursor = self.conn.cursor()
            logger.info(f"成功连接到PostgreSQL数据库 {self.ip}:{self.port}/{self.db}")
        except psycopg2.Error as e:
            logger.error(f"连接PostgreSQL数据库失败: {e}")
            raise

    def is_alive(self) -> bool:
        """检查连接是否存活"""
        try:
            if self.conn and self.cursor:
                self.cursor.execute("SELECT 1")
                return True
        except psycopg2.Error as e:
            logger.error(f"数据库连接检查失败: {e}")
        return False

    def reconnect(self):
        """重试连接数据库"""
        for attempt in range(1, self.max_retry_times + 1):
            logger.warning(f"尝试重新连接PostgreSQL数据库, 第 {attempt} 次...")
            try:
                self.close()
            except:
                pass
            self.connect()
            if self.is_alive():
                logger.info("重连PostgreSQL数据库成功")
                return
            time.sleep(self.retry_interval)
        logger.error(f"重试 {self.max_retry_times} 次后仍无法连接PostgreSQL数据库")
        raise ConnectionError("无法连接到PostgreSQL数据库")

    def execute(self, sql: str, params: Optional[Tuple[Any, ...]] = None) -> Optional[int]:
        """
        执行SQL语句，支持参数化查询

        Args:
            sql (str): 要执行的SQL语句
            params (tuple): SQL语句的参数

        Returns:
            Optional[int]: 返回受影响的行数
        """
        if not self.is_alive():
            self.reconnect()

        try:
            logger.debug(f"执行SQL: {sql} | 参数数量: {0 if params is None else len(params)}")
            self.cursor.execute(sql, params)
            self.conn.commit()

            # 对于非SELECT语句，返回受影响的行数
            if not sql.strip().upper().startswith("SELECT"):
                return self.cursor.rowcount
            return None
        except psycopg2.Error as e:
            logger.error(f"执行SQL失败: {e}")
            self.conn.rollback()
            raise

    def fetch_one(self, sql: str, params: Optional[Tuple[Any, ...]] = None) -> Optional[dict]:
        """
        查询一条记录

        Args:
            sql (str): SQL查询语句
            params (tuple): SQL语句的参数

        Returns:
            Optional[dict]: 查询结果的第一条记录（字典格式），如果没有结果则返回None
        """
        if not self.is_alive():
            self.reconnect()

        try:
            logger.debug(f"查询一条记录: {sql} | 参数数量: {0 if params is None else len(params)}")
            self.cursor.execute(sql, params)
            result = self.cursor.fetchone()
            if result:
                logger.debug("查询一条记录命中")
            return dict(result) if result else None
        except psycopg2.Error as e:
            logger.error(f"查询失败: {e}")
            raise

    def fetch_all(self, sql: str, params: Optional[Tuple[Any, ...]] = None) -> List[dict]:
        """
        查询多条记录

        Args:
            sql (str): SQL查询语句
            params (tuple): SQL语句的参数

        Returns:
            List[dict]: 查询结果列表（字典格式）
        """
        if not self.is_alive():
            self.reconnect()

        try:
            logger.debug(f"查询多条记录: {sql} | 参数数量: {0 if params is None else len(params)}")
            self.cursor.execute(sql, params)
            results = self.cursor.fetchall()
            result_list = [dict(row) for row in results]
            logger.debug(f"结果条数: {len(result_list)}")
            return result_list
        except psycopg2.Error as e:
            logger.error(f"查询失败: {e}")
            raise

    def commit(self):
        """提交事务"""
        try:
            self.conn.commit()
            logger.debug("事务提交成功")
        except psycopg2.Error as e:
            logger.error(f"提交事务失败: {e}")
            raise

    def rollback(self):
        """回滚事务"""
        try:
            self.conn.rollback()
            logger.debug("事务回滚成功")
        except psycopg2.Error as e:
            logger.error(f"回滚事务失败: {e}")
            raise

    def close(self):
        """关闭数据库连接"""
        try:
            if self.cursor:
                self.cursor.close()
            if self.conn:
                self.conn.close()
            logger.info("关闭PostgreSQL数据库连接")
        except psycopg2.Error as e:
            logger.error(f"关闭连接时出错: {e}")

    def __enter__(self):
        """上下文管理器入口"""
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """上下文管理器出口"""
        if exc_type:
            self.rollback()
        else:
            self.commit()
        self.close()
