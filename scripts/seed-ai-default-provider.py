"""Upsert the public Qwen default without deleting other provider data.

The upstream is an explicitly approved, keyless OpenAI-compatible endpoint.
Run without --apply to inspect the intended change without mutating MySQL.
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path
from typing import Any

import yaml


REPO_ROOT = Path(__file__).resolve().parents[1]
API_ROOT = REPO_ROOT / "apps" / "api"
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))

from src.database.mysql.default_ai_provider_seed import (  # noqa: E402
    PROVIDER_BASE_URL,
    PROVIDER_ID,
    PROVIDER_MODEL,
    PROVIDER_NAME,
    upsert_default_provider,
)


def resolve_config_path(raw_path: str) -> Path:
    path = Path(raw_path).expanduser()
    return path if path.is_absolute() else API_ROOT / path


def load_config() -> dict[str, Any]:
    env = os.getenv("ENV", "local")
    base_path = API_ROOT / "src" / "conf" / f"{env}.yml"
    with base_path.open("r", encoding="utf-8") as handle:
        config = yaml.safe_load(handle) or {}

    override_path = resolve_config_path(
        os.getenv("BLOG_CONFIG_OVERRIDE", f"./src/conf/{env}.override.yml")
    )
    if override_path.exists():
        with override_path.open("r", encoding="utf-8") as handle:
            config = deep_merge(config, yaml.safe_load(handle) or {})

    credentials_path = API_ROOT / "src" / "conf" / f"{env}.ai-credentials.yml"
    if credentials_path.exists():
        with credentials_path.open("r", encoding="utf-8") as handle:
            config = deep_merge(config, yaml.safe_load(handle) or {})
    return config


def deep_merge(base: Any, override: Any) -> Any:
    if not isinstance(base, dict) or not isinstance(override, dict):
        return override
    merged = dict(base)
    for key, value in override.items():
        merged[key] = deep_merge(merged[key], value) if key in merged else value
    return merged


def connect_mysql(config: dict[str, Any]):
    import pymysql
    from pymysql.cursors import DictCursor

    mysql = config["mysql"]
    return pymysql.connect(
        host=mysql["ip"],
        port=int(mysql["port"]),
        user=mysql["user"],
        password=mysql["password"],
        db=mysql["db"],
        charset="utf8mb4",
        autocommit=False,
        cursorclass=DictCursor,
    )


def provider_row_count(connection, table: str) -> int:
    with connection.cursor() as cursor:
        cursor.execute(f"SELECT COUNT(*) AS count FROM `{table}`")
        return int(cursor.fetchone()["count"])


def ensure_provider_columns(connection) -> None:
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT TABLE_NAME, COLUMN_NAME
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'ai_provider_catalog'
              AND COLUMN_NAME IN ('auth_mode', 'is_default')
            """
        )
        found = {(row["TABLE_NAME"], row["COLUMN_NAME"]) for row in cursor.fetchall()}
    missing = {
        ("ai_provider_catalog", "auth_mode"),
        ("ai_provider_catalog", "is_default"),
    } - found
    if missing:
        names = ", ".join(column for _table, column in sorted(missing))
        raise RuntimeError(
            f"ai_provider_catalog is missing required columns: {names}. "
            "Apply the narrow AI provider schema migration first."
        )


def apply_seed(connection) -> bool:
    return upsert_default_provider(connection)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Upsert and select the keyless public Qwen provider.",
    )
    args = parser.parse_args()

    config = load_config()
    connection = connect_mysql(config)
    try:
        ensure_provider_columns(connection)
        profiles = provider_row_count(connection, "ai_provider_profiles")
        catalog = provider_row_count(connection, "ai_provider_catalog")
        if not args.apply:
            print(
                "Dry run: would preserve "
                f"{profiles} provider profile(s) and {catalog} catalog entry(ies), "
                f"then ensure {PROVIDER_ID} exists and select it only when no "
                "enabled default exists."
            )
            return 0

        selected_as_default = apply_seed(connection)
        connection.commit()
        outcome = "the default" if selected_as_default else "an enabled model"
        print(f"Upserted {PROVIDER_ID} as {outcome}.")
        return 0
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


if __name__ == "__main__":
    raise SystemExit(main())
