"""Idempotently select the keyless public Qwen model as the system default."""

from __future__ import annotations

import argparse

from .schema_migration import connect_mysql, load_api_config


PROVIDER_ID = "qwen-public"
PROVIDER_NAME = "Qwen Public"
PROVIDER_BASE_URL = "http://211.141.18.165:6195/v1"
PROVIDER_MODEL = "qwen38_27b"


def upsert_default_provider(connection) -> bool:
    """Ensure Qwen exists and select it only when no enabled default exists."""
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT id FROM ai_provider_catalog ORDER BY id FOR UPDATE"
        )
        cursor.fetchall()
        cursor.execute(
            "SELECT id FROM ai_provider_catalog "
            "WHERE is_enabled = 1 AND is_default = 1 "
            "ORDER BY id LIMIT 1"
        )
        current_default = cursor.fetchone()
        should_be_default = (
            current_default is None
            or str(current_default["id"]) == PROVIDER_ID
        )
        if should_be_default:
            cursor.execute(
                "UPDATE ai_provider_catalog SET is_default = 0 "
                "WHERE is_default = 1 AND id <> %s",
                (PROVIDER_ID,),
            )
        cursor.execute(
            """
            INSERT INTO ai_provider_catalog
              (id, name, default_base_url, default_model, auth_mode,
               api_key_ciphertext, api_key_hint, is_enabled, is_default, sort_order)
            VALUES (%s, %s, %s, %s, 'none', NULL, NULL, 1, %s, 0)
            ON DUPLICATE KEY UPDATE
              name = VALUES(name),
              default_base_url = VALUES(default_base_url),
              default_model = VALUES(default_model),
              auth_mode = 'none',
              api_key_ciphertext = NULL,
              api_key_hint = NULL,
              is_enabled = 1,
              is_default = VALUES(is_default),
              sort_order = 0
            """,
            (
                PROVIDER_ID,
                PROVIDER_NAME,
                PROVIDER_BASE_URL,
                PROVIDER_MODEL,
                should_be_default,
            ),
        )
    return should_be_default


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Apply the non-destructive Qwen default upsert.",
    )
    args = parser.parse_args(argv)
    if not args.apply:
        print(
            f"Dry run: would ensure {PROVIDER_ID}/{PROVIDER_MODEL} exists "
            "and select it only when no enabled default exists."
        )
        return 0

    connection = connect_mysql(load_api_config())
    try:
        selected_as_default = upsert_default_provider(connection)
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()
    outcome = "the default" if selected_as_default else "an enabled model"
    print(f"Upserted {PROVIDER_ID}/{PROVIDER_MODEL} as {outcome}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
