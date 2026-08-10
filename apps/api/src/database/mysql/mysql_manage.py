from __future__ import annotations

import os
import queue
import time
from contextlib import contextmanager
from typing import Any, Iterator, List, Optional, Tuple

import pymysql
from loguru import logger
from pymysql.cursors import DictCursor


def _param_count(params) -> int:
    if params is None:
        return 0
    if isinstance(params, dict):
        return len(params)
    if isinstance(params, (list, tuple)):
        return len(params)
    return 1


class MySQLManager:
    """Small bounded MySQL connection pool with explicit error propagation."""

    def __init__(
        self,
        host: str,
        port: int,
        db: str,
        user: Optional[str] = None,
        password: Optional[str] = None,
        charset: str = "utf8mb4",
        max_retry_times: int = 3,
        retry_interval: int = 5,
        pool_size: int | None = None,
    ):
        self.host = host
        self.port = port
        self.user = user
        self.password = password
        self.db = db
        self.charset = charset
        self.max_retry_times = max_retry_times
        self.retry_interval = retry_interval
        configured_size = pool_size or int(os.getenv("MYSQL_POOL_SIZE", "2"))
        self.pool_size = max(1, min(configured_size, 4))
        self._pool: queue.Queue[Any] = queue.Queue(maxsize=self.pool_size)
        self._connections: set[Any] = set()
        self._closed = False
        self.cnx = None
        self.cursor = None
        self.connect()

    def _create_connection(self):
        connection = pymysql.connect(
            host=self.host,
            port=self.port,
            user=self.user,
            password=self.password,
            db=self.db,
            charset=self.charset,
            autocommit=False,
            cursorclass=DictCursor,
        )
        self._connections.add(connection)
        return connection

    def connect(self):
        self._closed = False
        for _ in range(self.pool_size):
            connection = self._create_connection()
            self._pool.put(connection)
        logger.info("Connected to MySQL with pool size {}", self.pool_size)

    def _discard_connection(self, connection) -> None:
        self._connections.discard(connection)
        try:
            connection.close()
        except Exception:
            pass

    @contextmanager
    def _borrow(self) -> Iterator[tuple[Any, Any]]:
        if self._closed:
            raise ConnectionError("MySQL manager is closed")
        try:
            connection = self._pool.get(timeout=max(1, self.retry_interval))
        except queue.Empty as exc:
            raise ConnectionError("No MySQL connection available") from exc
        cursor = None
        healthy = True
        try:
            connection.ping(reconnect=True)
            cursor = connection.cursor()
            yield connection, cursor
        except pymysql.Error:
            try:
                connection.ping(reconnect=False)
            except pymysql.Error:
                healthy = False
                self._discard_connection(connection)
            raise
        finally:
            if cursor is not None:
                try:
                    cursor.close()
                except Exception:
                    pass
            if healthy and not self._closed:
                self._pool.put(connection)
            elif not self._closed:
                try:
                    replacement = self._create_connection()
                    self._pool.put(replacement)
                except pymysql.Error as exc:
                    logger.warning("Failed to replace unhealthy MySQL connection: {}", exc)

    def is_alive(self) -> bool:
        try:
            with self._borrow() as (_connection, cursor):
                cursor.execute("SELECT 1")
            return True
        except (pymysql.Error, ConnectionError) as exc:
            logger.error("MySQL readiness check failed: {}", exc)
            return False

    def reconnect(self):
        for connection in list(self._connections):
            self._discard_connection(connection)
        self._pool = queue.Queue(maxsize=self.pool_size)
        for attempt in range(1, self.max_retry_times + 1):
            try:
                self.connect()
                if self.is_alive():
                    return
            except pymysql.Error as exc:
                logger.warning("MySQL reconnect attempt {} failed: {}", attempt, exc)
            if attempt < self.max_retry_times:
                time.sleep(self.retry_interval)
        raise ConnectionError("Unable to reconnect to MySQL")

    def execute(self, sql: str, params: Optional[Tuple[Any, ...]] = None) -> Optional[int]:
        try:
            with self._borrow() as (connection, cursor):
                logger.debug("Executing SQL: {} | params={}", sql, _param_count(params))
                cursor.execute(sql, params)
                connection.commit()
                lowered = sql.strip().lower()
                if lowered.startswith("select"):
                    return cursor.fetchall()
                if lowered.startswith("insert"):
                    return cursor.lastrowid
                return cursor.rowcount
        except pymysql.Error:
            raise

    def unit_of_work(self):
        """Create a connection-scoped transaction for related statements."""
        from src.database.mysql.unit_of_work import MySQLUnitOfWork

        return MySQLUnitOfWork(self)

    def fetch_one(self, sql: str, params: Tuple[Any, ...] = ()) -> Optional[dict]:
        with self._borrow() as (_connection, cursor):
            cursor.execute(sql, params)
            return cursor.fetchone()

    def fetch_all(self, sql: str, params: Tuple[Any, ...] = ()) -> List[dict]:
        with self._borrow() as (_connection, cursor):
            cursor.execute(sql, params)
            return cursor.fetchall() or []

    def find_page_query(
        self,
        table: str,
        filter: Optional[dict] = None,
        skip: int = 0,
        page_size: int = 10,
    ) -> List[dict]:
        filters = filter or {}
        where_clause = " AND ".join(f"{key} = %s" for key in filters)
        where_clause = f"WHERE {where_clause}" if where_clause else ""
        sql = f"SELECT * FROM {table} {where_clause} LIMIT %s OFFSET %s"
        params = list(filters.values()) + [page_size, skip]
        with self._borrow() as (_connection, cursor):
            cursor.execute(sql, params)
            return cursor.fetchall() or []

    def count(self, table: str, filter: Optional[dict] = None) -> int:
        filters = filter or {}
        where_clause = " AND ".join(f"{key} = %s" for key in filters)
        where_clause = f"WHERE {where_clause}" if where_clause else ""
        sql = f"SELECT COUNT(*) as count FROM {table} {where_clause}"
        with self._borrow() as (_connection, cursor):
            cursor.execute(sql, list(filters.values()))
            result = cursor.fetchone()
            return int(result["count"]) if result else 0

    def close(self):
        self._closed = True
        while True:
            try:
                self._pool.get_nowait()
            except queue.Empty:
                break
        for connection in list(self._connections):
            self._discard_connection(connection)
        self._connections.clear()
        self.cnx = None
        self.cursor = None

    def __enter__(self):
        if not self.is_alive():
            self.reconnect()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()
