import sys
import unittest
from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path
from unittest.mock import patch


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
        self.connection.calls.append((sql, params))
        if "INFORMATION_SCHEMA.TABLES" in sql:
            self.rows = [
                {"TABLE_NAME": table_name}
                for table_name in self.connection.tables
            ]
        elif "INFORMATION_SCHEMA.COLUMNS" in sql:
            self.rows = list(self.connection.columns.get(params[1], []))
        elif "INFORMATION_SCHEMA.STATISTICS" in sql:
            self.rows = list(self.connection.indexes.get(params[1], []))
        elif "INFORMATION_SCHEMA.KEY_COLUMN_USAGE" in sql:
            self.rows = list(self.connection.foreign_keys.get(params[1], []))
        elif "duplicate_usernames" in sql:
            self.row = {"total": self.connection.duplicate_usernames}
        elif "COUNT(*) AS total" in sql and "FROM users" in sql:
            self.row = {"total": self.connection.ambiguous_usernames}
        else:
            raise AssertionError(f"Unexpected SQL: {sql}; params={params}")

    def fetchall(self):
        return self.rows

    def fetchone(self):
        return self.row


class FakeConnection:
    def __init__(self, *, username_unique=False):
        self.tables = {
            "users",
            "roles",
            "resources",
            "user_roles",
            "role_resources",
            "tag",
            "category",
            "blog",
            "blog_tag",
        }
        self.columns = {"users": [{"COLUMN_NAME": "username"}]}
        self.indexes = {
            "users": [
                {
                    "INDEX_NAME": "idx_users_username",
                    "NON_UNIQUE": 0 if username_unique else 1,
                    "SEQ_IN_INDEX": 1,
                    "COLUMN_NAME": "username",
                    "SUB_PART": None,
                }
            ]
        }
        self.foreign_keys = {}
        self.duplicate_usernames = 0
        self.ambiguous_usernames = 0
        self.calls = []
        self.closed = False

    def cursor(self):
        return FakeCursor(self)

    def close(self):
        self.closed = True


def _actual_column(column):
    from src.database.mysql.schema_migration import expected_column_contract

    expected = expected_column_contract(column)
    extras = []
    if expected["auto_increment"]:
        extras.append("auto_increment")
    if expected["on_update"]:
        extras.append(f"on update {expected['on_update']}")
    return {
        "COLUMN_NAME": column["name"],
        "DATA_TYPE": expected["data_type"],
        "COLUMN_TYPE": expected["data_type"],
        "IS_NULLABLE": "YES" if expected["nullable"] else "NO",
        "CHARACTER_MAXIMUM_LENGTH": expected["character_maximum_length"],
        "DATETIME_PRECISION": expected["datetime_precision"],
        "COLLATION_NAME": expected["collation"],
        "COLUMN_DEFAULT": expected["default"],
        "EXTRA": " ".join(extras),
    }


def _actual_indexes(table_schema):
    from src.database.mysql.schema_migration import parse_index_definition

    indexes = []
    primary_key = table_schema.get("primary_key", [])
    for sequence, column_name in enumerate(primary_key, start=1):
        indexes.append(
            {
                "INDEX_NAME": "PRIMARY",
                "NON_UNIQUE": 0,
                "SEQ_IN_INDEX": sequence,
                "COLUMN_NAME": column_name,
                "SUB_PART": None,
            }
        )
    for definition in table_schema.get("indexes", []):
        index = parse_index_definition(definition)
        for sequence, column_name in enumerate(index["columns"], start=1):
            indexes.append(
                {
                    "INDEX_NAME": index["name"],
                    "NON_UNIQUE": 0 if index["unique"] else 1,
                    "SEQ_IN_INDEX": sequence,
                    "COLUMN_NAME": column_name,
                    "SUB_PART": None,
                }
            )
    return indexes


def _add_ready_identity_tables(connection):
    from src.database.mysql.identity_schema_migration import IDENTITY_SCHEMA

    for table_name, table_schema in IDENTITY_SCHEMA.items():
        connection.tables.add(table_name)
        connection.columns[table_name] = [
            _actual_column(column) for column in table_schema["columns"]
        ]
        connection.indexes[table_name] = _actual_indexes(table_schema)
        connection.foreign_keys[table_name] = []


class IdentitySchemaMigrationTests(unittest.TestCase):
    def test_default_check_is_static_and_does_not_load_database_config(self):
        from src.database.mysql import identity_schema_migration as migration

        with (
            patch.object(migration, "load_api_config") as load_config,
            redirect_stdout(StringIO()),
        ):
            result = migration.main([])

        self.assertEqual(result, 0)
        load_config.assert_not_called()

    def test_plan_ignores_unrelated_incompatible_legacy_tables(self):
        from src.database.mysql.identity_schema_migration import (
            IDENTITY_TABLE_NAMES,
            build_identity_plan,
            validate_scoped_actions,
        )

        connection = FakeConnection()
        actions, errors = build_identity_plan(connection, "blog")

        self.assertEqual(errors, [])
        self.assertEqual(len(actions), 4)
        self.assertEqual(validate_scoped_actions(actions), [])
        self.assertIn("ALTER TABLE `users` DROP INDEX", actions[0])
        for table_name in IDENTITY_TABLE_NAMES:
            self.assertTrue(
                any(
                    action.startswith(f"CREATE TABLE IF NOT EXISTS `{table_name}`")
                    for action in actions
                )
            )

        queried_tables = {
            params[1]
            for _sql, params in connection.calls
            if params is not None and len(params) > 1
        }
        self.assertEqual(queried_tables, {"users"})

    def test_ready_identity_scope_is_idempotent(self):
        from src.database.mysql.identity_schema_migration import build_identity_plan

        connection = FakeConnection(username_unique=True)
        _add_ready_identity_tables(connection)

        actions, errors = build_identity_plan(connection, "blog")

        self.assertEqual(actions, [])
        self.assertEqual(errors, [])

    def test_incompatible_identity_contract_fails_closed(self):
        from src.database.mysql.identity_schema_migration import build_identity_plan

        connection = FakeConnection(username_unique=True)
        _add_ready_identity_tables(connection)
        subject = next(
            column
            for column in connection.columns["auth_identities"]
            if column["COLUMN_NAME"] == "subject"
        )
        subject["COLLATION_NAME"] = "utf8mb4_unicode_ci"

        actions, errors = build_identity_plan(connection, "blog")

        self.assertEqual(actions, [])
        self.assertTrue(any("expected utf8mb4_bin" in error for error in errors))

    def test_exact_allowlist_rejects_unrelated_ddl(self):
        from src.database.mysql.identity_schema_migration import (
            validate_scoped_actions,
        )

        errors = validate_scoped_actions(
            ["ALTER TABLE `roles` ADD COLUMN `unexpected` INT NULL"]
        )

        self.assertEqual(len(errors), 1)
        self.assertIn("out-of-scope action", errors[0])

    def test_apply_without_exact_acknowledgement_refuses_before_database_access(self):
        from src.database.mysql import identity_schema_migration as migration

        with (
            patch.object(migration, "load_api_config") as load_config,
            redirect_stdout(StringIO()),
        ):
            result = migration.run_database_mode(
                "apply", acknowledgement="wrong-migration"
            )

        self.assertEqual(result, 2)
        load_config.assert_not_called()

    def test_acknowledged_apply_validates_scope_before_and_after(self):
        from src.database.mysql import identity_schema_migration as migration

        connection = FakeConnection(username_unique=True)
        safe_action = next(iter(migration.ALLOWED_USERNAME_ACTIONS))
        with (
            patch.object(
                migration,
                "load_api_config",
                return_value={"mysql": {"db": "blog"}},
            ),
            patch.object(migration, "connect_mysql", return_value=connection),
            patch.object(
                migration,
                "build_identity_plan",
                side_effect=[([safe_action], []), ([], [])],
            ) as build_plan,
            patch.object(migration, "apply_plan") as apply_plan,
            redirect_stdout(StringIO()),
        ):
            result = migration.run_database_mode(
                "apply",
                acknowledgement=migration.MIGRATION_ID,
            )

        self.assertEqual(result, 0)
        self.assertEqual(build_plan.call_count, 2)
        apply_plan.assert_called_once_with(connection, [safe_action])
        self.assertTrue(connection.closed)

    def test_acknowledged_apply_still_rejects_out_of_scope_planner_output(self):
        from src.database.mysql import identity_schema_migration as migration

        connection = FakeConnection(username_unique=True)
        unsafe_action = "ALTER TABLE `users` MODIFY COLUMN `name` TEXT NULL"
        with (
            patch.object(
                migration,
                "load_api_config",
                return_value={"mysql": {"db": "blog"}},
            ),
            patch.object(migration, "connect_mysql", return_value=connection),
            patch.object(
                migration,
                "build_identity_plan",
                return_value=([unsafe_action], []),
            ),
            patch.object(migration, "apply_plan") as apply_plan,
            redirect_stdout(StringIO()),
        ):
            result = migration.run_database_mode(
                "apply",
                acknowledgement=migration.MIGRATION_ID,
            )

        self.assertEqual(result, 1)
        apply_plan.assert_not_called()
        self.assertTrue(connection.closed)


if __name__ == "__main__":
    unittest.main()
