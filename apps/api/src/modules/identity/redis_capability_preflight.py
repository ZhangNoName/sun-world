"""Read-only Redis capability gate for one-time identity state consumption."""

from __future__ import annotations

import re
import sys
from typing import Any

from redis import Redis

from src.database.mysql.schema_migration import load_api_config


MINIMUM_GETDEL_VERSION = (6, 2)


def parse_redis_version(raw_value: Any) -> tuple[int, int, int] | None:
    match = re.fullmatch(r"(\d+)\.(\d+)(?:\.(\d+))?.*", str(raw_value or ""))
    if match is None:
        return None
    return (
        int(match.group(1)),
        int(match.group(2)),
        int(match.group(3) or 0),
    )


def supports_getdel(raw_value: Any) -> bool:
    version = parse_redis_version(raw_value)
    return version is not None and version[:2] >= MINIMUM_GETDEL_VERSION


def run_preflight() -> int:
    client: Redis | None = None
    try:
        config = load_api_config()["redis"]
        client = Redis(
            host=config["ip"],
            port=int(config["port"]),
            db=int(config["db"]),
            password=config.get("auth") or None,
            decode_responses=True,
            socket_connect_timeout=3,
            socket_timeout=3,
        )
        server_version = client.info("server").get("redis_version")
    except Exception:
        print("Identity Redis capability preflight failed.", file=sys.stderr)
        return 1
    finally:
        if client is not None:
            try:
                client.close()
            except Exception:
                pass

    if not supports_getdel(server_version):
        print(
            "Identity Redis capability preflight failed: GETDEL requires Redis 6.2 or newer.",
            file=sys.stderr,
        )
        return 1
    print("Identity Redis capability preflight passed: GETDEL is available.")
    return 0


def main() -> int:
    return run_preflight()


if __name__ == "__main__":
    raise SystemExit(main())
