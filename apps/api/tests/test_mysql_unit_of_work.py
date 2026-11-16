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


class MySQLTransactionIsolationTests(unittest.TestCase):
    def test_isolation_is_set_before_first_operation_and_not_on_default_path(self):
        from src.database.mysql.unit_of_work import MySQLUnitOfWork
        manager = Manager()
        with MySQLUnitOfWork(manager, isolation_level='READ COMMITTED') as uow:
            self.assertEqual(uow.isolation_level, 'READ COMMITTED')
            uow.fetch_one('SELECT id FROM users')
        self.assertEqual(manager.cursor.calls[0][0], 'SET TRANSACTION ISOLATION LEVEL READ COMMITTED')
        self.assertEqual(manager.cursor.calls[1][0], 'SELECT id FROM users')
        default = Manager()
        with MySQLUnitOfWork(default) as uow:
            uow.fetch_one('SELECT id FROM users')
        self.assertEqual(len(default.cursor.calls), 1)

    def test_invalid_isolation_rejected_before_borrow(self):
        from src.database.mysql.unit_of_work import MySQLUnitOfWork
        manager = Manager()
        with self.assertRaises(ValueError):
            MySQLUnitOfWork(manager, isolation_level='READ COMMITTED; DROP TABLE users')
        self.assertEqual(manager.returned, 0)

    def test_isolation_setup_failure_returns_connection_and_clears_context(self):
        from src.database.mysql.unit_of_work import MySQLUnitOfWork
        manager = Manager()
        def failed(*_args):
            raise RuntimeError('synthetic setup failure')
        manager.cursor.execute = failed
        uow = MySQLUnitOfWork(manager, isolation_level='READ COMMITTED')
        with self.assertRaises(RuntimeError):
            with uow:
                self.fail('failed setup cannot enter transaction')
        self.assertEqual(manager.returned, 1)
        self.assertIsNone(uow.cursor)
        self.assertIsNone(uow.connection)

    def test_reusing_uow_does_not_skip_second_commit(self):
        from src.database.mysql.unit_of_work import MySQLUnitOfWork
        manager = Manager()
        uow = MySQLUnitOfWork(manager)
        for _ in range(2):
            with uow:
                uow.execute('UPDATE users SET status=1')
                uow.commit()
        self.assertEqual(manager.connection.commits, 2)
        self.assertEqual(manager.returned, 2)
