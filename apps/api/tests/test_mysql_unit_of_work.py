import sys
import unittest
from contextlib import contextmanager
from pathlib import Path


API_ROOT = Path(__file__).resolve().parents[1]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))


class Cursor:
    def __init__(self):
        self.calls = []
        self.rowcount = 1
        self.lastrowid = 7

    def execute(self, sql, params=None):
        self.calls.append((sql, params))

    def fetchone(self):
        return {"id": 1}

    def fetchall(self):
        return [{"id": 1}]


class Connection:
    def __init__(self):
        self.commits = 0
        self.rollbacks = 0

    def commit(self):
        self.commits += 1

    def rollback(self):
        self.rollbacks += 1


class Manager:
    def __init__(self):
        self.connection = Connection()
        self.cursor = Cursor()
        self.returned = 0

    @contextmanager
    def _borrow(self):
        try:
            yield self.connection, self.cursor
        finally:
            self.returned += 1


class MySQLUnitOfWorkTests(unittest.TestCase):
    def test_two_writes_commit_once_and_return_connection(self):
        from src.database.mysql.unit_of_work import MySQLUnitOfWork

        manager = Manager()
        with MySQLUnitOfWork(manager) as uow:
            uow.execute("UPDATE first SET value = %s", (1,))
            uow.execute("UPDATE second SET value = %s", (2,))
            uow.commit()

        self.assertEqual(manager.connection.commits, 1)
        self.assertEqual(manager.connection.rollbacks, 0)
        self.assertEqual(manager.returned, 1)

    def test_exception_rolls_back_and_returns_connection(self):
        from src.database.mysql.unit_of_work import MySQLUnitOfWork

        manager = Manager()
        with self.assertRaises(RuntimeError):
            with MySQLUnitOfWork(manager) as uow:
                uow.execute("UPDATE first SET value = %s", (1,))
                raise RuntimeError("injected failure")

        self.assertEqual(manager.connection.commits, 0)
        self.assertEqual(manager.connection.rollbacks, 1)
        self.assertEqual(manager.returned, 1)

    def test_missing_explicit_commit_rolls_back(self):
        from src.database.mysql.unit_of_work import MySQLUnitOfWork

        manager = Manager()
        with MySQLUnitOfWork(manager) as uow:
            uow.execute("DELETE FROM relation")

        self.assertEqual(manager.connection.commits, 0)
        self.assertEqual(manager.connection.rollbacks, 1)


if __name__ == "__main__":
    unittest.main()
