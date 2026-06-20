from __future__ import annotations

from pathlib import Path
import sys


def repo_root() -> Path:
    return Path(__file__).resolve().parents[1]


ROOT = repo_root()
sys.path.insert(0, str(ROOT / "apps" / "api"))

from src.database.mysql import schema_migration  # noqa: E402


def main() -> int:
    compatible_cases = [
        ("int", "int"),
        ("int(11)", "int"),
        ("bigint unsigned", "int"),
        ("bigint(20) unsigned", "int"),
        ("timestamp", "datetime"),
        ("mediumtext", "varchar"),
    ]
    incompatible_cases = [
        ("varchar(255)", "int"),
        ("datetime", "tinyint"),
    ]

    for actual, expected in compatible_cases:
        if not schema_migration.column_type_matches(actual, expected):
            raise AssertionError(f"{actual!r} should match {expected!r}")

    for actual, expected in incompatible_cases:
        if schema_migration.column_type_matches(actual, expected):
            raise AssertionError(f"{actual!r} should not match {expected!r}")

    legacy_cases = [
        ("resources", "type", "tinyint"),
        ("blog", "category", "varchar(255)"),
    ]
    for table_name, column_name, actual in legacy_cases:
        if not schema_migration.legacy_column_type_matches(table_name, column_name, actual):
            raise AssertionError(f"{table_name}.{column_name} should allow legacy {actual!r}")

    if schema_migration.legacy_column_type_matches("users", "id", "varchar(255)"):
        raise AssertionError("unexpected legacy schema type exception")

    print("API schema type compatibility check passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
