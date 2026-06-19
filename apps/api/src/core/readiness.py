import asyncio
import time
from collections.abc import Callable
from datetime import datetime, timezone
from typing import Any

from loguru import logger

from src.type.health_type import DependencyReadiness, ReadinessSnapshot

_DEFAULT_TIMEOUT_SECONDS = 1.0


def _check_mysql(app: Any) -> bool:
    manager = getattr(app, "mysql", None)
    return bool(manager and manager.is_alive())


def _check_mongo(app: Any) -> bool:
    manager = getattr(app, "mongo", None)
    if not manager:
        return False

    db = getattr(manager, "db", None)
    if db is not None:
        db.command("ping")
        return True

    return bool(manager.ping())


def _check_redis(app: Any) -> bool:
    manager = getattr(app, "redis", None)
    return bool(manager and manager.ping())


def _check_postgresql(app: Any) -> bool:
    manager = getattr(app, "postgresql", None)
    return bool(manager and manager.is_alive())


async def _run_probe(
    name: str,
    probe: Callable[[], bool],
    timeout_seconds: float = _DEFAULT_TIMEOUT_SECONDS,
) -> DependencyReadiness:
    start = time.monotonic()
    status = "not_ready"

    try:
        is_ready = await asyncio.wait_for(
            asyncio.to_thread(probe),
            timeout=timeout_seconds,
        )
        status = "ready" if is_ready else "not_ready"
    except TimeoutError:
        logger.warning(f"readiness_check name={name} status=timeout")
    except Exception as exc:
        logger.warning(
            f"readiness_check name={name} "
            f"status=error error_type={type(exc).__name__}"
        )

    duration_ms = round((time.monotonic() - start) * 1000, 2)
    return DependencyReadiness(
        name=name,
        status=status,
        duration_ms=duration_ms,
    )


async def build_readiness_snapshot(app: Any) -> ReadinessSnapshot:
    checks = await asyncio.gather(
        _run_probe("mysql", lambda: _check_mysql(app)),
        _run_probe("mongo", lambda: _check_mongo(app)),
        _run_probe("redis", lambda: _check_redis(app)),
        _run_probe("postgresql", lambda: _check_postgresql(app)),
    )
    overall_status = (
        "ready"
        if all(check.status == "ready" for check in checks)
        else "not_ready"
    )

    return ReadinessSnapshot(
        status=overall_status,
        generated_at=datetime.now(timezone.utc),
        checks=list(checks),
    )
