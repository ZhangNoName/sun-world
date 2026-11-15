#!/usr/bin/env python3
"""Aggregate the configured local profile's legacy roles/resources without writes.

Only local.yml and its exact local.override.yml are loaded. No application
startup, arbitrary override, AI credentials, production configuration or env file.
"""

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps/api"))


def load_mysql_settings(root=ROOT):
    import yaml
    from src.core.runtime_env import is_local_runtime
    if not is_local_runtime():
        raise ValueError("Local permission inventory is disabled outside local runtime")
    settings = {}
    for name in ("local.yml", "local.override.yml"):
        path = root / "apps/api/src/conf" / name
        if not path.exists() and name == "local.override.yml":
            continue
        document = yaml.safe_load(path.read_text())
        if not isinstance(document, dict):
            raise ValueError("Invalid local configuration")
        mysql = document.get("mysql", {})
        if not isinstance(mysql, dict):
            raise ValueError("Invalid MySQL configuration")
        settings.update(mysql)
    return {"host": settings["ip"], "port": int(settings["port"]), "database": settings["db"],
            "user": settings["user"], "password": settings["password"]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--local", action="store_true", required=True,
                        help="Explicitly audit the configured local profile using a read-only snapshot")
    parser.parse_args()
    connection = None
    try:
        import pymysql
        from src.core.auth.permissions_inventory import audit_read_only_connection
        settings = load_mysql_settings()
        connection = pymysql.connect(**settings, cursorclass=pymysql.cursors.DictCursor,
                                     autocommit=False, connect_timeout=3, read_timeout=5, write_timeout=5)
        report = audit_read_only_connection(connection)
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 2 if report["findings"] else 0
    except Exception:
        # Do not print driver/config errors: they can contain hosts or secrets.
        print("Local permissions inventory failed; no report was produced. Check local configuration and database availability.", file=sys.stderr)
        return 1
    finally:
        if connection is not None:
            try:
                connection.close()
            except Exception:
                pass


if __name__ == "__main__":
    sys.exit(main())
