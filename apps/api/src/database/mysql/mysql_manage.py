from __future__ import annotations

import os
import queue
import threading
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


class _PendingClose:
    """One occupied position whose old physical handle is not yet released."""

    def __init__(self, connection):
        self.connection = connection


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
        connect_timeout: int | None = None,
        read_timeout: int | None = None,
        write_timeout: int | None = None,
    ):
        self.host = host
        self.port = port
        self.user = user
        self.password = password
        self.db = db
        self.charset = charset
        self.max_retry_times = max_retry_times
        self.retry_interval = retry_interval
        self.connect_timeout = self._bounded_timeout(
            "MYSQL_CONNECT_TIMEOUT_SECONDS",
            connect_timeout,
            3,
        )
        self.read_timeout = self._bounded_timeout(
            "MYSQL_READ_TIMEOUT_SECONDS",
            read_timeout,
            5,
        )
        self.write_timeout = self._bounded_timeout(
            "MYSQL_WRITE_TIMEOUT_SECONDS",
            write_timeout,
            5,
        )
        configured_size = pool_size or int(os.getenv("MYSQL_POOL_SIZE", "2"))
        self.pool_size = max(1, min(configured_size, 4))
        self._pool: queue.Queue[Any] = queue.Queue(maxsize=self.pool_size)
        self._connections: set[Any] = set()
        self._closed_pending: set[Any] = set()
        self._state = threading.Condition()
        self._borrowers = self._waiters = 0
        self._resetting = False
        self._closed = False
        self.cnx = None
        self.cursor = None
        self.connect()

    @staticmethod
    def _bounded_timeout(name: str, explicit: int | None, default: int) -> int:
        try:
            value = int(explicit if explicit is not None else os.getenv(name, str(default)))
        except (TypeError, ValueError) as exc:
            raise ValueError(f"{name} must be an integer") from exc
        if value < 1 or value > 60:
            raise ValueError(f"{name} must be between 1 and 60")
        return value

    def _create_connection(self):
        # Factory hooks return a handle only; lifecycle registration is central.
        return pymysql.connect(
            host=self.host,
            port=self.port,
            user=self.user,
            password=self.password,
            db=self.db,
            charset=self.charset,
            autocommit=False,
            cursorclass=DictCursor,
            connect_timeout=self.connect_timeout,
            read_timeout=self.read_timeout,
            write_timeout=self.write_timeout,
        )

    def connect(self):
        self._reset_pool(attempts=1)

    def _close_handles(self, handles):
        """Attempt the whole owned batch, retain unknowns, return its first error."""
        pending, first_error = [], None
        for connection in handles:
            confirmed = False
            try:
                connection.close()
                confirmed = True
            except BaseException as exc:
                if first_error is None:
                    first_error = exc
                # Only an explicit driver fact can confirm close after an
                # exception. Unknown test/adapter objects are never guessed.
                try:
                    confirmed = (isinstance(connection, pymysql.connections.Connection)
                                 and connection.open is False)
                except BaseException:
                    confirmed = False
            with self._state:
                if confirmed:
                    self._connections.discard(connection)
                else:
                    self._connections.add(connection)
                    pending.append(connection)
        return pending, first_error

    def _reset_pool(self, *, attempts):
        with self._state:
            if self._closed:
                raise ConnectionError("MySQL manager is closed")
            if self._resetting or self._borrowers or self._waiters:
                raise ConnectionError("MySQL pool is busy")
            self._resetting = True
            previous = []
            while not self._pool.empty():
                slot = self._pool.get_nowait()
                if slot is not None:
                    previous.append(slot.connection if isinstance(slot, _PendingClose) else slot)
        created, pending = [], []
        try:
            pending, error = self._close_handles(previous)
            if error is not None:
                raise error
            for attempt in range(attempts):
                try:
                    for _ in range(self.pool_size):
                        with self._state:
                            if self._closed:
                                raise ConnectionError("MySQL manager is closed")
                        connection = self._create_connection()
                        created.append(connection)
                        with self._state:
                            self._connections.add(connection)
                    with self._state:
                        if self._closed:
                            raise ConnectionError("MySQL manager is closed")
                        for connection in created:
                            self._pool.put_nowait(connection)
                        created = []
                    return
                except pymysql.Error:
                    pending, error = self._close_handles(created)
                    created = []
                    if error is not None:
                        raise error
                    if attempt + 1 == attempts:
                        raise
                    with self._state:
                        if not self._closed:
                            self._state.wait(timeout=max(0, self.retry_interval))
        finally:
            remaining, cleanup_error = self._close_handles(created)
            pending.extend(remaining)
            # Batch cleanup never prevents state finalization, even when a
            # driver raises KeyboardInterrupt before physically closing.
            with self._state:
                if self._closed:
                    self._closed_pending.update(pending)
                elif self._pool.empty():
                    for connection in pending:
                        self._pool.put_nowait(_PendingClose(connection))
                    for _ in range(self.pool_size - len(pending)):
                        self._pool.put_nowait(None)
                self._resetting = False
                self._state.notify_all()
            if cleanup_error is not None:
                raise cleanup_error

    def _take_slot(self):
        deadline = time.monotonic() + max(1, self.retry_interval)
        with self._state:
            self._waiters += 1
            try:
                while True:
                    if self._closed:
                        raise ConnectionError("MySQL manager is closed")
                    if self._resetting:
                        raise ConnectionError("MySQL pool is busy")
                    try:
                        connection = self._pool.get_nowait()
                    except queue.Empty:
                        remaining = deadline - time.monotonic()
                        if remaining <= 0:
                            raise ConnectionError("No MySQL connection available") from None
                        self._state.wait(timeout=remaining)
                    else:
                        self._borrowers += 1
                        return connection
            finally:
                self._waiters -= 1

    @contextmanager
    def _borrow(self) -> Iterator[tuple[Any, Any]]:
        slot = self._take_slot()
        connection = slot.connection if isinstance(slot, _PendingClose) else slot
        cursor, healthy, close_attempted = None, False, False
        created = False
        try:
            if isinstance(slot, _PendingClose):
                close_attempted = True
                pending, error = self._close_handles([connection])
                if not pending:
                    connection = None
                if error is not None:
                    raise error
                close_attempted = False
            if connection is None:
                created = True
                connection = self._create_connection()
                with self._state:
                    self._connections.add(connection)
                    if self._closed:
                        raise ConnectionError("MySQL manager is closed")
            try:
                connection.ping(reconnect=False)
            except pymysql.Error:
                # No caller SQL has run yet. One controlled replacement is
                # permitted only after the previous handle is confirmed gone.
                if created:
                    raise
                close_attempted = True
                pending, error = self._close_handles([connection])
                if not pending:
                    connection = None
                if error is not None:
                    raise error
                close_attempted = False
                with self._state:
                    if self._closed:
                        raise ConnectionError("MySQL manager is closed")
                created = True
                connection = self._create_connection()
                with self._state:
                    self._connections.add(connection)
                    if self._closed:
                        raise ConnectionError("MySQL manager is closed")
                connection.ping(reconnect=False)
            healthy = True
            cursor = connection.cursor()
            with self._state:
                if self._closed:
                    raise ConnectionError("MySQL manager is closed")
            yield connection, cursor
        except pymysql.Error:
            if healthy:
                try:
                    connection.ping(reconnect=False)
                except BaseException as exc:
                    healthy = False
                    if not isinstance(exc, Exception):
                        raise
            raise
        finally:
            cleanup_error = None
            # autocommit=False: end implicit snapshots/locks before reuse.
            if healthy:
                try:
                    connection.rollback()
                except BaseException as exc:
                    healthy = False
                    if not isinstance(exc, Exception):
                        cleanup_error = exc
            if cursor is not None:
                try:
                    cursor.close()
                except BaseException as exc:
                    healthy = False
                    if cleanup_error is None and not isinstance(exc, Exception):
                        cleanup_error = exc
            with self._state:
                keep = healthy and not self._closed
            pending = []
            if not keep and connection is not None:
                if close_attempted:
                    pending = [connection]
                else:
                    pending, error = self._close_handles([connection])
                    if cleanup_error is None:
                        cleanup_error = error
            # close may race the healthy decision. Publishing or transferring
            # ownership to closed cleanup is atomic with that lifecycle check.
            late_close = None
            with self._state:
                if self._closed:
                    self._closed_pending.update(pending)
                    if keep:
                        late_close = connection
                else:
                    self._pool.put_nowait(connection if keep else
                                          _PendingClose(pending[0]) if pending else None)
                self._borrowers -= 1
                self._state.notify_all()
            if late_close is not None:
                pending, error = self._close_handles([late_close])
                with self._state:
                    self._closed_pending.update(pending)
                if cleanup_error is None:
                    cleanup_error = error
            if cleanup_error is not None:
                raise cleanup_error

    def is_alive(self) -> bool:
        try:
            with self._borrow() as (_connection, cursor):
                cursor.execute("SELECT 1")
            return True
        except (pymysql.Error, ConnectionError) as exc:
            logger.error("MySQL readiness check failed: {}", exc)
            return False

    def reconnect(self):
        try:
            self._reset_pool(attempts=max(1, self.max_retry_times))
        except pymysql.Error:
            raise ConnectionError("Unable to reconnect to MySQL") from None

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

    def unit_of_work(self, *, isolation_level: str | None = None):
        """Create a connection-scoped transaction for related statements."""
        from src.database.mysql.unit_of_work import MySQLUnitOfWork

        return MySQLUnitOfWork(self, isolation_level=isolation_level)

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
        with self._state:
            self._closed = True
            idle = list(self._closed_pending)
            self._closed_pending.clear()
            while not self._pool.empty():
                slot = self._pool.get_nowait()
                if slot is not None:
                    idle.append(slot.connection if isinstance(slot, _PendingClose) else slot)
            self.cnx = self.cursor = None
            self._state.notify_all()
        # Never seize a borrowed/reset-owned handle. Unknown idle closes stay
        # registered and are explicitly retryable by another close call.
        pending, error = self._close_handles(idle)
        with self._state:
            self._closed_pending.update(pending)
        if error is not None:
            raise error

    def __enter__(self):
        if not self.is_alive():
            self.reconnect()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()
