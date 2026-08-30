"""Controlled migration for the canonical unique username index.

This is intentionally separate from the conservative additive schema migrator.
It performs a read-only preflight by default and requires an explicit locking
acknowledgement before replacing the historical non-unique index.
"""

from __future__ import annotations

import argparse
import sys
from typing import Any

from .schema_migration import (
    apply_plan,
    connect_mysql,
    fetch_ambiguous_username_count,
    fetch_existing_columns,
    fetch_existing_indexes,
    fetch_existing_tables,
    load_api_config,
)


MIGRATION_ID = "20260829_unique_username"
INDEX_NAME = "idx_users_username"
ADD_UNIQUE_SQL = (
    "ALTER TABLE `users` ADD UNIQUE KEY `idx_users_username` (`username`)"
)
REPLACE_INDEX_SQL = (
    "ALTER TABLE `users` DROP INDEX `idx_users_username`, "
    "ADD UNIQUE KEY `idx_users_username` (`username`)"
)
ROLLBACK_SQL = (
    "ALTER TABLE `users` DROP INDEX `idx_users_username`, "
    "ADD KEY `idx_users_username` (`username`)"
)


def fetch_duplicate_username_group_count(connection: Any) -> int:
    """Count duplicate groups under the column's active MySQL collation."""
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT COUNT(*) AS total
            FROM (
                SELECT username
                FROM users
                WHERE username IS NOT NULL
                GROUP BY username
                HAVING COUNT(*) > 1
            ) AS duplicate_usernames
            """
        )
        row = cursor.fetchone() or {}
        return int(row.get("total", 0))


def build_username_index_plan(
    connection: Any,
    database: str,
) -> tuple[list[str], list[str]]:
    tables = fetch_existing_tables(connection, database)
    if "users" not in tables:
        return [], ["users table does not exist"]
    columns = fetch_existing_columns(connection, database, "users")
    if "username" not in columns:
        return [], ["users.username does not exist"]

    errors: list[str] = []
    incompatible = fetch_ambiguous_username_count(connection, database)
    if incompatible:
        errors.append(
            f"users contains {incompatible} unsupported or contact-shaped username(s)"
        )
    duplicates = fetch_duplicate_username_group_count(connection)
    if duplicates:
        errors.append(
            f"users contains {duplicates} duplicate username group(s) under its active collation"
        )

    indexes = fetch_existing_indexes(connection, database, "users")
    existing = indexes.get(INDEX_NAME)
    if existing is None:
        action = ADD_UNIQUE_SQL
    else:
        columns_with_prefix = existing.get("columns", [])
        if columns_with_prefix != [("username", None)]:
            errors.append(
                f"{INDEX_NAME} has unexpected columns or prefix lengths: "
                f"{columns_with_prefix!r}"
            )
            action = ""
        elif bool(existing.get("unique")):
            action = ""
        else:
            action = REPLACE_INDEX_SQL
    return ([action] if action and not errors else []), errors


def run(mode: str, *, acknowledge_locking: bool = False) -> int:
    config = load_api_config()
    database = config["mysql"]["db"]
    connection = connect_mysql(config)
    try:
        actions, errors = build_username_index_plan(connection, database)
        if errors:
            print(f"{MIGRATION_ID} preflight failed:")
            for error in errors:
                print(f"- {error}")
            return 1
        if not actions:
            print(f"{MIGRATION_ID} already applied.")
            return 0
        print(f"{MIGRATION_ID} planned statement:")
        print(actions[0])
        print(f"Rollback statement (only if explicitly required): {ROLLBACK_SQL}")
        if mode == "check":
            print("Migration is required before the general schema apply.")
            return 1
        if mode == "plan":
            return 0
        if not acknowledge_locking:
            print("Apply refused: pass --acknowledge-locking in a maintenance window.")
            return 2
        apply_plan(connection, actions)
        remaining, validation_errors = build_username_index_plan(connection, database)
        if validation_errors or remaining:
            print(f"{MIGRATION_ID} validation failed after apply.")
            return 1
        print(f"{MIGRATION_ID} applied and validated.")
        return 0
    finally:
        connection.close()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--mode",
        choices=["check", "plan", "apply"],
        default="check",
    )
    parser.add_argument(
        "--acknowledge-locking",
        action="store_true",
        help="Required for apply; confirms a backup and maintenance window.",
    )
    args = parser.parse_args(argv)
    return run(args.mode, acknowledge_locking=args.acknowledge_locking)


if __name__ == "__main__":
    sys.exit(main())
