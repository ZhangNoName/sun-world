import sys
import unittest
from pathlib import Path


API_ROOT = Path(__file__).resolve().parents[1]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))


class FakeCursor:
    def __init__(self, connection):
        self.connection = connection
        self.rows = []
        self.row = None

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def execute(self, sql, params=None):
        if "INFORMATION_SCHEMA.TABLES" in sql:
            self.rows = [{"TABLE_NAME": "users"}]
        elif "INFORMATION_SCHEMA.COLUMNS" in sql:
            self.rows = [{"COLUMN_NAME": "username"}]
        elif "INFORMATION_SCHEMA.STATISTICS" in sql:
            self.rows = [
                {
                    "INDEX_NAME": "idx_users_username",
                    "NON_UNIQUE": 0 if self.connection.unique else 1,
                    "SEQ_IN_INDEX": 1,
                    "COLUMN_NAME": "username",
                    "SUB_PART": None,
                }
            ]
        elif "duplicate_usernames" in sql:
            self.row = {"total": self.connection.duplicates}
        elif "COUNT(*) AS total" in sql and "FROM users" in sql:
            self.row = {"total": self.connection.incompatible}
        else:
            raise AssertionError(f"Unexpected SQL: {sql}; params={params}")

    def fetchall(self):
        return self.rows

    def fetchone(self):
        return self.row


class FakeConnection:
    def __init__(self, *, unique=False, duplicates=0, incompatible=0):
        self.unique = unique
        self.duplicates = duplicates
        self.incompatible = incompatible

    def cursor(self):
        return FakeCursor(self)


class UsernameIndexMigrationTests(unittest.TestCase):
    def test_non_unique_historical_index_has_one_atomic_replacement(self):
        from src.database.mysql.username_index_migration import (
            REPLACE_INDEX_SQL,
            build_username_index_plan,
        )

        actions, errors = build_username_index_plan(FakeConnection(), "blog")

        self.assertEqual(errors, [])
        self.assertEqual(actions, [REPLACE_INDEX_SQL])
        self.assertIn("DROP INDEX", actions[0])
        self.assertIn("ADD UNIQUE KEY", actions[0])

    def test_existing_unique_index_is_idempotent(self):
        from src.database.mysql.username_index_migration import (
            build_username_index_plan,
        )

        actions, errors = build_username_index_plan(
            FakeConnection(unique=True),
            "blog",
        )

        self.assertEqual(actions, [])
        self.assertEqual(errors, [])

    def test_duplicate_or_incompatible_usernames_fail_closed(self):
        from src.database.mysql.username_index_migration import (
            build_username_index_plan,
        )

        actions, errors = build_username_index_plan(
            FakeConnection(duplicates=2, incompatible=3),
            "blog",
        )

        self.assertEqual(actions, [])
        self.assertTrue(any("duplicate username group" in error for error in errors))
        self.assertTrue(any("unsupported or contact-shaped" in error for error in errors))


if __name__ == "__main__":
    unittest.main()
