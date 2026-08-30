import sys
import unittest
from pathlib import Path


API_ROOT = Path(__file__).resolve().parents[1]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))


USERS_SCHEMA = {
    "users": {
        "columns": [
            {
                "name": "id",
                "definition": "INT NOT NULL AUTO_INCREMENT",
                "type": "int",
            },
            {
                "name": "username",
                "definition": "VARCHAR(128) NULL",
                "type": "varchar",
            },
        ],
        "primary_key": ["id"],
        "indexes": ["UNIQUE KEY `idx_users_username` (`username`)"],
    }
}


def column(
    name,
    data_type,
    column_type,
    *,
    nullable=False,
    length=None,
    precision=None,
    collation=None,
    default=None,
    extra="",
):
    return {
        "COLUMN_NAME": name,
        "DATA_TYPE": data_type,
        "COLUMN_TYPE": column_type,
        "IS_NULLABLE": "YES" if nullable else "NO",
        "CHARACTER_MAXIMUM_LENGTH": length,
        "DATETIME_PRECISION": precision,
        "COLLATION_NAME": collation,
        "COLUMN_DEFAULT": default,
        "EXTRA": extra,
    }


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
            self.rows = [{"TABLE_NAME": name} for name in self.connection.tables]
        elif "INFORMATION_SCHEMA.COLUMNS" in sql:
            self.rows = list(self.connection.columns.get(params[1], []))
        elif "INFORMATION_SCHEMA.STATISTICS" in sql:
            self.rows = list(self.connection.indexes.get(params[1], []))
        elif "INFORMATION_SCHEMA.KEY_COLUMN_USAGE" in sql:
            self.rows = list(self.connection.foreign_keys.get(params[1], []))
        elif "COUNT(*) AS total" in sql and "FROM users" in sql:
            self.row = {"total": self.connection.ambiguous_usernames}
        else:
            raise AssertionError(f"Unexpected SQL: {sql}")

    def fetchall(self):
        return self.rows

    def fetchone(self):
        return self.row


class FakeConnection:
    def __init__(self):
        self.tables = {"users"}
        self.columns = {
            "users": [
                column("id", "int", "int", extra="auto_increment"),
                column(
                    "username",
                    "varchar",
                    "varchar(128)",
                    nullable=True,
                    length=128,
                ),
            ]
        }
        self.indexes = {
            "users": [
                {
                    "INDEX_NAME": "PRIMARY",
                    "NON_UNIQUE": 0,
                    "SEQ_IN_INDEX": 1,
                    "COLUMN_NAME": "id",
                    "SUB_PART": None,
                },
                {
                    "INDEX_NAME": "idx_users_username",
                    "NON_UNIQUE": 0,
                    "SEQ_IN_INDEX": 1,
                    "COLUMN_NAME": "username",
                    "SUB_PART": None,
                },
            ]
        }
        self.foreign_keys = {"users": []}
        self.ambiguous_usernames = 0
        self.calls = []

    def cursor(self):
        return FakeCursor(self)


class SchemaMigrationContractTests(unittest.TestCase):
    def test_existing_table_must_match_columns_primary_key_and_unique_index(self):
        from src.database.mysql.schema_migration import build_plan

        connection = FakeConnection()
        actions, errors = build_plan(connection, "blog", USERS_SCHEMA)

        self.assertEqual(actions, [])
        self.assertEqual(errors, [])

    def test_missing_or_non_unique_username_index_fails_closed(self):
        from src.database.mysql.schema_migration import build_plan

        missing = FakeConnection()
        missing.indexes["users"] = missing.indexes["users"][:1]
        _actions, missing_errors = build_plan(missing, "blog", USERS_SCHEMA)
        self.assertTrue(
            any("missing required index idx_users_username" in item for item in missing_errors)
        )

        non_unique = FakeConnection()
        non_unique.indexes["users"][1]["NON_UNIQUE"] = 1
        _actions, uniqueness_errors = build_plan(non_unique, "blog", USERS_SCHEMA)
        self.assertTrue(any("uniqueness" in item for item in uniqueness_errors))

    def test_column_length_nullability_and_auto_increment_are_exact(self):
        from src.database.mysql.schema_migration import build_plan

        connection = FakeConnection()
        connection.columns["users"][0]["EXTRA"] = ""
        connection.columns["users"][1]["CHARACTER_MAXIMUM_LENGTH"] = 255
        connection.columns["users"][1]["IS_NULLABLE"] = "NO"

        _actions, errors = build_plan(connection, "blog", USERS_SCHEMA)

        self.assertTrue(any("auto_increment" in item for item in errors))
        self.assertTrue(any("has length 255" in item for item in errors))
        self.assertTrue(any("nullability" in item for item in errors))

    def test_contact_shaped_historical_usernames_block_migration(self):
        from src.database.mysql.schema_migration import build_plan

        connection = FakeConnection()
        connection.ambiguous_usernames = 2

        _actions, errors = build_plan(connection, "blog", USERS_SCHEMA)

        self.assertTrue(
            any("unsupported or contact-shaped username" in item for item in errors)
        )

    def test_opaque_identity_subject_requires_binary_collation(self):
        from src.database.mysql.schema_migration import build_plan

        schema = {
            "auth_identities": {
                "columns": [
                    {
                        "name": "subject",
                        "definition": (
                            "VARCHAR(255) CHARACTER SET utf8mb4 "
                            "COLLATE utf8mb4_bin NOT NULL"
                        ),
                        "type": "varchar",
                    }
                ],
                "primary_key": [],
                "indexes": [],
            }
        }
        connection = FakeConnection()
        connection.tables = {"auth_identities"}
        connection.columns = {
            "auth_identities": [
                column(
                    "subject",
                    "varchar",
                    "varchar(255)",
                    length=255,
                    collation="utf8mb4_unicode_ci",
                )
            ]
        }
        connection.indexes = {"auth_identities": []}
        connection.foreign_keys = {"auth_identities": []}

        _actions, errors = build_plan(connection, "blog", schema)

        self.assertTrue(any("expected utf8mb4_bin" in item for item in errors))

    def test_security_defaults_and_on_update_are_exact(self):
        from src.database.mysql.schema_migration import build_plan

        schema = {
            "security_state": {
                "columns": [
                    {
                        "name": "status",
                        "definition": "TINYINT(1) NOT NULL DEFAULT 1",
                        "type": "tinyint",
                    },
                    {
                        "name": "updated_at",
                        "definition": (
                            "DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) "
                            "ON UPDATE CURRENT_TIMESTAMP(6)"
                        ),
                        "type": "datetime",
                    },
                ],
                "primary_key": [],
                "indexes": [],
            }
        }
        connection = FakeConnection()
        connection.tables = {"security_state"}
        connection.columns = {
            "security_state": [
                column("status", "tinyint", "tinyint(1)", default="0"),
                column(
                    "updated_at",
                    "datetime",
                    "datetime(6)",
                    precision=6,
                    default="current_timestamp(6)",
                    extra="DEFAULT_GENERATED",
                ),
            ]
        }
        connection.indexes = {"security_state": []}
        connection.foreign_keys = {"security_state": []}

        _actions, errors = build_plan(connection, "blog", schema)

        self.assertTrue(any("status default is '0', expected '1'" in item for item in errors))
        self.assertTrue(any("updated_at ON UPDATE" in item for item in errors))

    def test_foreign_key_columns_and_rules_are_validated(self):
        from src.database.mysql.schema_migration import build_plan

        schema = {
            "child": {
                "columns": [
                    {"name": "id", "definition": "INT NOT NULL", "type": "int"},
                    {
                        "name": "parent_id",
                        "definition": "INT NOT NULL",
                        "type": "int",
                    },
                ],
                "primary_key": ["id"],
                "indexes": ["KEY `idx_child_parent` (`parent_id`)"],
                "constraints": [
                    "CONSTRAINT `fk_child_parent` FOREIGN KEY (`parent_id`) "
                    "REFERENCES `parent` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE"
                ],
            }
        }
        connection = FakeConnection()
        connection.tables = {"child"}
        connection.columns = {
            "child": [
                column("id", "int", "int"),
                column("parent_id", "int", "int"),
            ]
        }
        connection.indexes = {
            "child": [
                {
                    "INDEX_NAME": "PRIMARY",
                    "NON_UNIQUE": 0,
                    "SEQ_IN_INDEX": 1,
                    "COLUMN_NAME": "id",
                    "SUB_PART": None,
                },
                {
                    "INDEX_NAME": "idx_child_parent",
                    "NON_UNIQUE": 1,
                    "SEQ_IN_INDEX": 1,
                    "COLUMN_NAME": "parent_id",
                    "SUB_PART": None,
                },
            ]
        }
        connection.foreign_keys = {"child": []}

        _actions, errors = build_plan(connection, "blog", schema)

        self.assertTrue(any("missing required foreign key" in item for item in errors))


if __name__ == "__main__":
    unittest.main()
