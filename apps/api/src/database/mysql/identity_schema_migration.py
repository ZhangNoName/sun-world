"""Scoped, operator-acknowledged MySQL migration for optional identity.

The generic ``schema_migration`` module remains the strict full-application
contract. This module is a deliberately smaller cutover path for the four
database changes required by identity login:

- make ``users.idx_users_username`` unique after the existing data preflight,
- create or conservatively complete the three ``auth_*`` identity tables.

The default ``check`` mode is static and does not connect to MySQL. ``plan``
and ``validate`` are read-only. ``apply`` requires the exact migration ID as an
acknowledgement and never drops data or rewrites columns.
"""

from __future__ import annotations

import argparse
import sys
from typing import Any, Iterable

from .schema_migration import (
    MYSQL_SCHEMA,
    apply_plan,
    build_add_column_sql,
    build_create_table_sql,
    build_plan,
    connect_mysql,
    load_api_config,
    validate_contract,
)
from .username_index_migration import build_username_index_plan


MIGRATION_ID = "20260829_identity_schema"
IDENTITY_TABLE_NAMES = (
    "auth_identities",
    "auth_verified_contacts",
    "auth_security_events",
)
IDENTITY_SCHEMA = {
    table_name: MYSQL_SCHEMA[table_name] for table_name in IDENTITY_TABLE_NAMES
}

# Keep the only allowed ``users`` mutations literal and reviewable. Do not
# derive this allowlist from the username migration constants: a future change
# there must be reviewed here before this narrower tool can execute it.
ALLOWED_USERNAME_ACTIONS = frozenset(
    {
        "ALTER TABLE `users` ADD UNIQUE KEY `idx_users_username` (`username`)",
        (
            "ALTER TABLE `users` DROP INDEX `idx_users_username`, "
            "ADD UNIQUE KEY `idx_users_username` (`username`)"
        ),
    }
)


def allowed_identity_actions() -> frozenset[str]:
    """Return every exact DDL statement this migration is allowed to apply."""
    actions = set(ALLOWED_USERNAME_ACTIONS)
    for table_name, table_schema in IDENTITY_SCHEMA.items():
        actions.add(build_create_table_sql(table_name, table_schema))
        actions.update(
            build_add_column_sql(table_name, column)
            for column in table_schema["columns"]
        )
    return frozenset(actions)


def validate_identity_scope() -> list[str]:
    """Validate the immutable three-table scope without touching a database."""
    errors = validate_contract(IDENTITY_SCHEMA)
    if tuple(IDENTITY_SCHEMA) != IDENTITY_TABLE_NAMES:
        errors.append(
            "identity migration schema must contain exactly: "
            + ", ".join(IDENTITY_TABLE_NAMES)
        )
    if any(not table_name.startswith("auth_") for table_name in IDENTITY_SCHEMA):
        errors.append("identity migration schema may contain only auth_* tables")
    return errors


def validate_scoped_actions(actions: Iterable[str]) -> list[str]:
    """Reject any statement outside the exact reviewed DDL allowlist."""
    allowed = allowed_identity_actions()
    errors: list[str] = []
    for action in actions:
        if action not in allowed:
            first_line = str(action).splitlines()[0]
            errors.append(
                f"identity migration produced an out-of-scope action: {first_line}"
            )
    return errors


def build_identity_plan(
    connection: Any,
    database: str,
) -> tuple[list[str], list[str]]:
    """Plan only the username index and the three identity tables."""
    scope_errors = validate_identity_scope()
    if scope_errors:
        return [], scope_errors

    username_actions, username_errors = build_username_index_plan(
        connection,
        database,
    )
    table_actions, table_errors = build_plan(
        connection,
        database,
        IDENTITY_SCHEMA,
    )
    actions = [*username_actions, *table_actions]
    errors = [*username_errors, *table_errors]
    errors.extend(validate_scoped_actions(actions))
    return actions, errors


def _print_actions(actions: list[str]) -> None:
    if not actions:
        print(f"{MIGRATION_ID} plan is empty: identity schema is ready.")
        return
    print(f"{MIGRATION_ID} plan ({len(actions)} action(s)):")
    for index, action in enumerate(actions, start=1):
        print(f"[{index}] {action}")


def run_static_check() -> int:
    errors = validate_identity_scope()
    if errors:
        print(f"{MIGRATION_ID} static scope check failed:")
        for error in errors:
            print(f"- {error}")
        return 1
    column_count = sum(
        len(table_schema["columns"])
        for table_schema in IDENTITY_SCHEMA.values()
    )
    print(
        f"{MIGRATION_ID} static scope check passed: "
        f"{len(IDENTITY_SCHEMA)} auth tables, {column_count} columns; no database access."
    )
    return 0


def run_database_mode(
    mode: str,
    *,
    acknowledgement: str | None = None,
) -> int:
    if mode == "apply" and acknowledgement != MIGRATION_ID:
        print(
            "Apply refused before database access: pass "
            f"--acknowledge {MIGRATION_ID} after backup and maintenance-window review."
        )
        return 2

    scope_errors = validate_identity_scope()
    if scope_errors:
        print(f"{MIGRATION_ID} static scope check failed:")
        for error in scope_errors:
            print(f"- {error}")
        return 1

    config = load_api_config()
    database = config["mysql"]["db"]
    connection = connect_mysql(config)
    try:
        actions, errors = build_identity_plan(connection, database)
        # Validate at the execution boundary as defense in depth, even though
        # the planner also validates its own output.
        errors.extend(validate_scoped_actions(actions))
        if errors:
            print(f"{MIGRATION_ID} preflight failed:")
            for error in errors:
                print(f"- {error}")
            return 1

        if mode == "plan":
            _print_actions(actions)
            return 0

        if mode == "validate":
            if actions:
                print(f"{MIGRATION_ID} validation failed:")
                for action in actions:
                    print(f"- pending action: {action.splitlines()[0]}")
                return 1
            print(f"{MIGRATION_ID} validation passed: no pending actions.")
            return 0

        # The preflight above validates both the live target and every exact
        # statement immediately before execution.
        apply_plan(connection, actions)

        remaining, validation_errors = build_identity_plan(connection, database)
        validation_errors.extend(validate_scoped_actions(remaining))
        if validation_errors or remaining:
            print(f"{MIGRATION_ID} validation failed after apply:")
            for error in validation_errors:
                print(f"- {error}")
            for action in remaining:
                print(f"- pending action: {action.splitlines()[0]}")
            return 1
        print(f"{MIGRATION_ID} applied and validated: {len(actions)} action(s).")
        return 0
    finally:
        connection.close()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--mode",
        choices=["check", "plan", "validate", "apply"],
        default="check",
        help="check is static; plan/validate are read-only; apply mutates the scoped DDL",
    )
    parser.add_argument(
        "--acknowledge",
        metavar="MIGRATION_ID",
        help=f"Required for apply and must equal {MIGRATION_ID}",
    )
    args = parser.parse_args(argv)
    if args.mode == "check":
        return run_static_check()
    return run_database_mode(args.mode, acknowledgement=args.acknowledge)


if __name__ == "__main__":
    sys.exit(main())
