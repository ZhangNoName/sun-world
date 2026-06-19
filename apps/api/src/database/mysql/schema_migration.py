"""Conservative MySQL schema migration for the Sun World API.

The migrator is intentionally narrow:
- create missing application tables,
- add missing application columns,
- reject incompatible existing column types,
- never drop, rename, or rewrite existing columns.

Run without database access:
    python -m src.database.mysql.schema_migration --mode check

Run on the server with production environment/config:
    python -m src.database.mysql.schema_migration --mode apply
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from pathlib import Path
from typing import Any, Iterable

import pymysql
import yaml
from pymysql.cursors import DictCursor


MYSQL_SCHEMA: dict[str, dict[str, Any]] = {
    "users": {
        "columns": [
            {"name": "id", "definition": "INT NOT NULL AUTO_INCREMENT", "type": "int"},
            {"name": "name", "definition": "VARCHAR(255) NOT NULL", "type": "varchar"},
            {"name": "sex", "definition": "INT NOT NULL DEFAULT 0", "type": "int"},
            {"name": "age", "definition": "INT NOT NULL DEFAULT 0", "type": "int"},
            {"name": "phone", "definition": "VARCHAR(64) NOT NULL DEFAULT ''", "type": "varchar"},
            {"name": "email", "definition": "VARCHAR(255) NOT NULL", "type": "varchar"},
            {"name": "password", "definition": "VARCHAR(255) NOT NULL", "type": "varchar"},
            {"name": "birth_day", "definition": "DATE NULL", "type": "date"},
            {"name": "create_time", "definition": "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP", "type": "datetime"},
            {"name": "status", "definition": "TINYINT(1) NOT NULL DEFAULT 1", "type": "tinyint"},
        ],
        "primary_key": ["id"],
        "indexes": ["UNIQUE KEY `idx_users_email` (`email`)"],
    },
    "roles": {
        "columns": [
            {"name": "id", "definition": "INT NOT NULL AUTO_INCREMENT", "type": "int"},
            {"name": "name", "definition": "VARCHAR(255) NOT NULL", "type": "varchar"},
            {"name": "code", "definition": "VARCHAR(128) NOT NULL", "type": "varchar"},
            {"name": "description", "definition": "VARCHAR(500) NULL", "type": "varchar"},
            {"name": "create_time", "definition": "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP", "type": "datetime"},
        ],
        "primary_key": ["id"],
        "indexes": ["UNIQUE KEY `idx_roles_code` (`code`)"],
    },
    "resources": {
        "columns": [
            {"name": "id", "definition": "INT NOT NULL AUTO_INCREMENT", "type": "int"},
            {"name": "name", "definition": "VARCHAR(255) NOT NULL", "type": "varchar"},
            {"name": "code", "definition": "VARCHAR(128) NOT NULL", "type": "varchar"},
            {"name": "type", "definition": "VARCHAR(64) NOT NULL", "type": "varchar"},
            {"name": "path", "definition": "VARCHAR(500) NOT NULL DEFAULT ''", "type": "varchar"},
            {"name": "description", "definition": "VARCHAR(500) NULL", "type": "varchar"},
            {"name": "create_time", "definition": "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP", "type": "datetime"},
        ],
        "primary_key": ["id"],
        "indexes": ["UNIQUE KEY `idx_resources_code` (`code`)"],
    },
    "user_roles": {
        "columns": [
            {"name": "user_id", "definition": "INT NOT NULL", "type": "int"},
            {"name": "role_id", "definition": "INT NOT NULL", "type": "int"},
        ],
        "primary_key": ["user_id", "role_id"],
        "indexes": ["KEY `idx_user_roles_role_id` (`role_id`)"],
    },
    "role_resources": {
        "columns": [
            {"name": "role_id", "definition": "INT NOT NULL", "type": "int"},
            {"name": "resource_id", "definition": "INT NOT NULL", "type": "int"},
        ],
        "primary_key": ["role_id", "resource_id"],
        "indexes": ["KEY `idx_role_resources_resource_id` (`resource_id`)"],
    },
    "tag": {
        "columns": [
            {"name": "id", "definition": "INT NOT NULL AUTO_INCREMENT", "type": "int"},
            {"name": "name", "definition": "VARCHAR(255) NOT NULL", "type": "varchar"},
        ],
        "primary_key": ["id"],
        "indexes": ["UNIQUE KEY `idx_tag_name` (`name`)"],
    },
    "category": {
        "columns": [
            {"name": "id", "definition": "INT NOT NULL AUTO_INCREMENT", "type": "int"},
            {"name": "name", "definition": "VARCHAR(255) NOT NULL", "type": "varchar"},
        ],
        "primary_key": ["id"],
        "indexes": ["UNIQUE KEY `idx_category_name` (`name`)"],
    },
    "blog": {
        "columns": [
            {"name": "id", "definition": "INT NOT NULL AUTO_INCREMENT", "type": "int"},
            {"name": "title", "definition": "VARCHAR(255) NOT NULL", "type": "varchar"},
            {"name": "author", "definition": "VARCHAR(255) NULL", "type": "varchar"},
            {"name": "abstract", "definition": "VARCHAR(1000) NOT NULL DEFAULT ''", "type": "varchar"},
            {"name": "category", "definition": "INT NULL", "type": "int"},
            {"name": "created_at", "definition": "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP", "type": "datetime"},
            {"name": "updated_at", "definition": "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP", "type": "datetime"},
            {"name": "is_deleted", "definition": "TINYINT(1) NOT NULL DEFAULT 0", "type": "tinyint"},
            {"name": "view_num", "definition": "INT NOT NULL DEFAULT 0", "type": "int"},
            {"name": "comment_num", "definition": "INT NOT NULL DEFAULT 0", "type": "int"},
            {"name": "byte_num", "definition": "INT NOT NULL DEFAULT 0", "type": "int"},
        ],
        "primary_key": ["id"],
        "indexes": ["KEY `idx_blog_category` (`category`)"],
    },
    "blog_tag": {
        "columns": [
            {"name": "blog_id", "definition": "INT NOT NULL", "type": "int"},
            {"name": "tag_id", "definition": "INT NOT NULL", "type": "int"},
        ],
        "primary_key": ["blog_id", "tag_id"],
        "indexes": ["KEY `idx_blog_tag_tag_id` (`tag_id`)"],
    },
}

IDENTIFIER_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


def repo_root() -> Path:
    return Path(__file__).resolve().parents[5]


def quote_identifier(identifier: str) -> str:
    if not IDENTIFIER_RE.match(identifier):
        raise ValueError(f"Unsafe MySQL identifier: {identifier}")
    return f"`{identifier}`"


def expected_column_names(table_schema: dict[str, Any]) -> list[str]:
    return [column["name"] for column in table_schema["columns"]]


def validate_contract(schema: dict[str, dict[str, Any]] = MYSQL_SCHEMA) -> list[str]:
    errors: list[str] = []
    for table_name, table_schema in schema.items():
        try:
            quote_identifier(table_name)
        except ValueError as exc:
            errors.append(str(exc))

        seen_columns: set[str] = set()
        for column in table_schema.get("columns", []):
            name = column.get("name")
            definition = column.get("definition")
            expected_type = column.get("type")
            if not name or not definition or not expected_type:
                errors.append(f"{table_name} has an incomplete column spec: {column!r}")
                continue
            if name in seen_columns:
                errors.append(f"{table_name} declares duplicate column: {name}")
            seen_columns.add(name)
            try:
                quote_identifier(name)
            except ValueError as exc:
                errors.append(str(exc))

        primary_key = table_schema.get("primary_key", [])
        for column_name in primary_key:
            if column_name not in seen_columns:
                errors.append(f"{table_name} primary key references missing column: {column_name}")
    return errors


def normalize_column_type(column_type: str) -> str:
    return column_type.lower().split("(", 1)[0].strip()


def column_type_matches(actual_type: str, expected_type: str) -> bool:
    normalized = normalize_column_type(actual_type)
    aliases = {
        "int": {"int", "integer", "mediumint", "bigint"},
        "tinyint": {"tinyint"},
        "varchar": {"varchar", "char", "text", "mediumtext", "longtext"},
        "datetime": {"datetime", "timestamp"},
        "date": {"date", "datetime", "timestamp"},
    }
    return normalized in aliases.get(expected_type, {expected_type})


def build_create_table_sql(table_name: str, table_schema: dict[str, Any]) -> str:
    lines = [
        f"{quote_identifier(column['name'])} {column['definition']}"
        for column in table_schema["columns"]
    ]
    primary_key = table_schema.get("primary_key", [])
    if primary_key:
        key_columns = ", ".join(quote_identifier(column) for column in primary_key)
        lines.append(f"PRIMARY KEY ({key_columns})")
    lines.extend(table_schema.get("indexes", []))
    body = ",\n  ".join(lines)
    return (
        f"CREATE TABLE IF NOT EXISTS {quote_identifier(table_name)} (\n"
        f"  {body}\n"
        ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    )


def build_add_column_sql(table_name: str, column: dict[str, str]) -> str:
    return (
        f"ALTER TABLE {quote_identifier(table_name)} "
        f"ADD COLUMN {quote_identifier(column['name'])} {column['definition']}"
    )


def fetch_existing_tables(connection: Any, database: str) -> set[str]:
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT TABLE_NAME
            FROM INFORMATION_SCHEMA.TABLES
            WHERE TABLE_SCHEMA = %s
            """,
            (database,),
        )
        return {row["TABLE_NAME"] for row in cursor.fetchall()}


def fetch_existing_columns(connection: Any, database: str, table_name: str) -> dict[str, dict[str, Any]]:
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = %s AND TABLE_NAME = %s
            """,
            (database, table_name),
        )
        return {row["COLUMN_NAME"]: row for row in cursor.fetchall()}


def build_plan(connection: Any, database: str) -> tuple[list[str], list[str]]:
    actions: list[str] = []
    errors: list[str] = []
    existing_tables = fetch_existing_tables(connection, database)

    for table_name, table_schema in MYSQL_SCHEMA.items():
        if table_name not in existing_tables:
            actions.append(build_create_table_sql(table_name, table_schema))
            continue

        existing_columns = fetch_existing_columns(connection, database, table_name)
        for column in table_schema["columns"]:
            existing_column = existing_columns.get(column["name"])
            if existing_column is None:
                actions.append(build_add_column_sql(table_name, column))
                continue
            if not column_type_matches(existing_column["COLUMN_TYPE"], column["type"]):
                errors.append(
                    f"{table_name}.{column['name']} has type "
                    f"{existing_column['COLUMN_TYPE']}, expected {column['type']}"
                )

    return actions, errors


def apply_plan(connection: Any, actions: Iterable[str]) -> None:
    with connection.cursor() as cursor:
        for sql in actions:
            cursor.execute(sql)
    connection.commit()


def validate_schema(connection: Any, database: str) -> list[str]:
    actions, errors = build_plan(connection, database)
    if actions:
        errors.extend(f"pending schema action: {action.splitlines()[0]}" for action in actions)
    return errors


def resolve_config_path(raw_path: str) -> Path:
    path = Path(raw_path).expanduser()
    if path.is_absolute():
        return path
    return (repo_root() / "apps" / "api" / path).resolve()


def load_api_config() -> dict[str, Any]:
    env = os.getenv("ENV", "local")
    base_path = resolve_config_path(f"./src/conf/{env}.yml")
    if not base_path.exists():
        raise FileNotFoundError(f"API config file not found for ENV={env}: {base_path}")

    with base_path.open("r", encoding="utf-8") as handle:
        config = yaml.safe_load(handle) or {}

    override_raw = os.getenv("BLOG_CONFIG_OVERRIDE", f"./src/conf/{env}.override.yml")
    override_path = resolve_config_path(override_raw)
    if override_path.exists():
        with override_path.open("r", encoding="utf-8") as handle:
            override = yaml.safe_load(handle) or {}
        config = deep_merge(config, override)

    return config


def deep_merge(base: Any, override: Any) -> Any:
    if not isinstance(base, dict) or not isinstance(override, dict):
        return override
    merged = dict(base)
    for key, value in override.items():
        merged[key] = deep_merge(merged.get(key), value) if key in merged else value
    return merged


def connect_mysql(config: dict[str, Any]) -> Any:
    mysql_config = config["mysql"]
    return pymysql.connect(
        host=mysql_config["ip"],
        port=int(mysql_config["port"]),
        user=mysql_config["user"],
        password=mysql_config["password"],
        db=mysql_config["db"],
        charset="utf8mb4",
        autocommit=False,
        cursorclass=DictCursor,
    )


def run_static_check() -> int:
    errors = validate_contract()
    if errors:
        print("MySQL schema contract check failed:")
        for error in errors:
            print(f"- {error}")
        return 1
    table_count = len(MYSQL_SCHEMA)
    column_count = sum(len(table["columns"]) for table in MYSQL_SCHEMA.values())
    print(f"MySQL schema contract check passed: {table_count} tables, {column_count} columns.")
    return 0


def run_database_mode(mode: str) -> int:
    config = load_api_config()
    database = config["mysql"]["db"]
    connection = connect_mysql(config)
    try:
        actions, errors = build_plan(connection, database)
        if errors:
            print("MySQL schema validation failed:")
            for error in errors:
                print(f"- {error}")
            return 1

        if mode == "validate":
            if actions:
                print("MySQL schema validation failed:")
                for action in actions:
                    print(f"- pending schema action: {action.splitlines()[0]}")
                return 1
            print("MySQL schema validation passed: no pending actions.")
            return 0

        if mode == "plan":
            if not actions:
                print("MySQL schema plan is empty: no changes needed.")
                return 0
            print("MySQL schema plan:")
            for action in actions:
                print(f"- {action.splitlines()[0]}")
            return 0

        apply_plan(connection, actions)
        validation_errors = validate_schema(connection, database)
        if validation_errors:
            print("MySQL schema validation failed after apply:")
            for error in validation_errors:
                print(f"- {error}")
            return 1
        print(f"MySQL schema apply passed: {len(actions)} action(s).")
        return 0
    finally:
        connection.close()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Validate or apply the Sun World MySQL schema")
    parser.add_argument(
        "--mode",
        choices=["check", "plan", "validate", "apply"],
        default="check",
        help="check is static; plan/validate/apply connect to MySQL",
    )
    args = parser.parse_args(argv)

    if args.mode == "check":
        return run_static_check()
    return run_database_mode(args.mode)


if __name__ == "__main__":
    sys.exit(main())
