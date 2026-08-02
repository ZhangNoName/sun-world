import sys
from concurrent.futures import ThreadPoolExecutor
import unittest
from pathlib import Path
from unittest.mock import patch


API_ROOT = Path(__file__).resolve().parents[1]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))


class BrokenCursor:
    def __init__(self, execute_error=None):
        self.execute_error = execute_error

    def execute(self, *_args):
        if self.execute_error:
            raise self.execute_error
        return 1

    def fetchall(self):
        return []

    def fetchone(self):
        return {"count": 1}

    def close(self):
        return None


class BrokenConnection:
    def __init__(self, execute_error=None, ping_error=None):
        self.cursor_obj = BrokenCursor(execute_error)
        self.ping_error = ping_error
        self.closed = False

    def ping(self, reconnect=False):
        if self.ping_error:
            raise self.ping_error
        return True

    def cursor(self):
        return self.cursor_obj

    def commit(self):
        return None

    def close(self):
        self.closed = True


class MySQLManagerTests(unittest.TestCase):
    def test_fetch_all_propagates_database_errors_instead_of_returning_empty(self):
        import pymysql
        from src.database.mysql.mysql_manage import MySQLManager

        connections = [
            BrokenConnection(pymysql.err.OperationalError(1146, "table does not exist")),
            BrokenConnection(),
        ]
        with patch("pymysql.connect", side_effect=connections):
            manager = MySQLManager("localhost", 3306, "test", pool_size=2, retry_interval=1)

            with self.assertRaises(pymysql.err.OperationalError):
                manager.fetch_all("SELECT * FROM missing_table")
            self.assertEqual(manager._pool.qsize(), 2)
            manager.close()

    def test_pool_reuses_connections_for_concurrent_operations(self):
        from src.database.mysql.mysql_manage import MySQLManager

        connections = [BrokenConnection(), BrokenConnection()]
        with patch("pymysql.connect", side_effect=connections):
            manager = MySQLManager("localhost", 3306, "test", pool_size=2, retry_interval=1)
            with ThreadPoolExecutor(max_workers=4) as executor:
                results = list(
                    executor.map(lambda _: manager.fetch_all("SELECT 1"), range(8))
                )
            self.assertEqual(len(results), 8)
            self.assertEqual(manager._pool.qsize(), 2)
            manager.close()

    def test_unhealthy_connection_is_discarded_and_replaced(self):
        import pymysql
        from src.database.mysql.mysql_manage import MySQLManager

        unhealthy = BrokenConnection(ping_error=pymysql.err.OperationalError(2006, "gone away"))
        healthy = BrokenConnection()
        replacement = BrokenConnection()
        with patch("pymysql.connect", side_effect=[unhealthy, healthy, replacement]):
            manager = MySQLManager("localhost", 3306, "test", pool_size=2, retry_interval=1)
            with self.assertRaises(pymysql.err.OperationalError):
                manager.fetch_all("SELECT 1")
            self.assertEqual(manager._pool.qsize(), 2)
            manager.close()


if __name__ == "__main__":
    unittest.main()
