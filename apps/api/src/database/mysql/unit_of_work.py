"""Connection-scoped MySQL transaction boundary."""

from __future__ import annotations

from typing import Any


class MySQLUnitOfWork:
    """Keep related statements on one connection and commit explicitly."""

    def __init__(self, manager) -> None:
        self.manager = manager
        self.connection = None
        self.cursor = None
        self._borrow_context = None
        self._committed = False

    def __enter__(self) -> "MySQLUnitOfWork":
        self._borrow_context = self.manager._borrow()
        self.connection, self.cursor = self._borrow_context.__enter__()
        return self

    def _require_cursor(self):
        if self.cursor is None:
            raise RuntimeError("The unit of work is not active")
        return self.cursor

    def execute(self, sql: str, params: Any = None):
        cursor = self._require_cursor()
        cursor.execute(sql, params)
        lowered = sql.strip().lower()
        if lowered.startswith("select"):
            return cursor.fetchall()
        if lowered.startswith("insert"):
            return cursor.lastrowid
        return cursor.rowcount

    def fetch_one(self, sql: str, params: Any = None):
        cursor = self._require_cursor()
        cursor.execute(sql, params)
        return cursor.fetchone()

    def fetch_all(self, sql: str, params: Any = None):
        cursor = self._require_cursor()
        cursor.execute(sql, params)
        return cursor.fetchall() or []

    def commit(self) -> None:
        if self.connection is None:
            raise RuntimeError("The unit of work is not active")
        if not self._committed:
            self.connection.commit()
            self._committed = True

    def rollback(self) -> None:
        if self.connection is not None and not self._committed:
            self.connection.rollback()

    def __exit__(self, exc_type, exc_value, traceback) -> bool:
        try:
            if exc_type is not None or not self._committed:
                self.rollback()
        finally:
            context = self._borrow_context
            self.cursor = None
            self.connection = None
            self._borrow_context = None
            if context is not None:
                context.__exit__(exc_type, exc_value, traceback)
        return False
