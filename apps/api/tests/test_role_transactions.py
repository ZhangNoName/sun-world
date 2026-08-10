import sys
import unittest
from pathlib import Path


API_ROOT = Path(__file__).resolve().parents[1]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))


class Transaction:
    def __init__(self, fail_on=None):
        self.fail_on = fail_on
        self.calls = []
        self.commits = 0
        self.rollbacks = 0

    def __enter__(self):
        return self

    def execute(self, sql, params):
        self.calls.append((sql, params))
        if self.fail_on == len(self.calls):
            raise RuntimeError("injected write failure")
        return 1

    def commit(self):
        self.commits += 1

    def __exit__(self, exc_type, *_args):
        if exc_type is not None or self.commits == 0:
            self.rollbacks += 1
        return False


class Db:
    def __init__(self, transaction):
        self.transaction = transaction
        self.direct_execute_calls = 0

    def unit_of_work(self):
        return self.transaction

    def execute(self, *_args):
        self.direct_execute_calls += 1
        raise AssertionError("multi-statement writes must use a unit of work")


class RoleTransactionTests(unittest.TestCase):
    def test_resource_replacement_rolls_back_when_an_insert_fails(self):
        from src.controller.role_manager import RoleManager

        transaction = Transaction(fail_on=3)
        manager = RoleManager(Db(transaction))

        with self.assertRaises(RuntimeError):
            manager.bind_resources(4, [10, 11])

        self.assertEqual(transaction.commits, 0)
        self.assertEqual(transaction.rollbacks, 1)
        self.assertEqual(manager.db.direct_execute_calls, 0)

    def test_resource_replacement_commits_all_writes_once(self):
        from src.controller.role_manager import RoleManager

        transaction = Transaction()
        manager = RoleManager(Db(transaction))

        manager.bind_resources(4, [10, 11])

        self.assertEqual(len(transaction.calls), 3)
        self.assertEqual(transaction.commits, 1)
        self.assertEqual(transaction.rollbacks, 0)


if __name__ == "__main__":
    unittest.main()
