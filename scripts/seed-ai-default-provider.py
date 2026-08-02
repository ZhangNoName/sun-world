"""Seed the single public AI provider configuration.

The provider API key is accepted only through DEEPSEEK_API_KEY, encrypted
before it is stored, and never printed. Run without --apply to inspect the
affected provider rows without changing the database.
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

from app_instance import get_credential_encryption_key  # noqa: E402
from src.modules.ai.credentials import CredentialCipher  # noqa: E402


PROVIDER_ID = "deepseek"
PROVIDER_NAME = "DeepSeek"
PROVIDER_BASE_URL = "https://api.deepseek.com"
PROVIDER_MODEL = "deepseek-chat"


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


def ensure_secret_columns(connection) -> None:
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT TABLE_NAME, COLUMN_NAME
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'ai_provider_catalog'
              AND COLUMN_NAME IN ('api_key_ciphertext', 'api_key_hint')
            """
        )
        found = {(row["TABLE_NAME"], row["COLUMN_NAME"]) for row in cursor.fetchall()}
    missing = {
        ("ai_provider_catalog", "api_key_ciphertext"),
        ("ai_provider_catalog", "api_key_hint"),
    } - found
    if missing:
        names = ", ".join(column for _table, column in sorted(missing))
        raise RuntimeError(
            f"ai_provider_catalog is missing required columns: {names}. "
            "Apply the narrow AI provider schema migration first."
        )


def apply_seed(connection, api_key: str, encryption_key: str) -> None:
    cipher = CredentialCipher(encryption_key)
    encrypted_key = cipher.encrypt(api_key)
    key_hint = cipher.hint(api_key)
    with connection.cursor() as cursor:
        cursor.execute("DELETE FROM ai_provider_profiles")
        cursor.execute("DELETE FROM ai_provider_catalog")
        cursor.execute(
            """
            INSERT INTO ai_provider_catalog
              (id, name, default_base_url, default_model,
               api_key_ciphertext, api_key_hint, is_enabled, sort_order)
            VALUES (%s, %s, %s, %s, %s, %s, 1, 0)
            """,
            (
                PROVIDER_ID,
                PROVIDER_NAME,
                PROVIDER_BASE_URL,
                PROVIDER_MODEL,
                encrypted_key,
                key_hint,
            ),
        )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Delete existing provider profiles/catalog entries and seed DeepSeek.",
    )
    args = parser.parse_args()

    config = load_config()
    connection = connect_mysql(config)
    try:
        ensure_secret_columns(connection)
        profiles = provider_row_count(connection, "ai_provider_profiles")
        catalog = provider_row_count(connection, "ai_provider_catalog")
        if not args.apply:
            print(
                "Dry run: would remove "
                f"{profiles} provider profile(s) and {catalog} catalog entry(ies), "
                "then seed one enabled DeepSeek provider."
            )
            return 0

        api_key = os.getenv("DEEPSEEK_API_KEY")
        if not api_key:
            raise RuntimeError("DEEPSEEK_API_KEY is required with --apply.")
        encryption_key = get_credential_encryption_key(config)
        if not encryption_key:
            raise RuntimeError("AI credential encryption is not configured.")

        apply_seed(connection, api_key, encryption_key)
        connection.commit()
        print("Seeded one enabled DeepSeek provider; provider profiles were cleared.")
        return 0
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


if __name__ == "__main__":
    raise SystemExit(main())
