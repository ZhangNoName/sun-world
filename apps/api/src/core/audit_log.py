"""Bounded, privacy-safe audit logging independent of business handlers."""

from __future__ import annotations

import json
import os
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from threading import RLock
from typing import Any, Final, Mapping

from loguru import logger


DEFAULT_MAX_FILE_BYTES: Final = 1024 * 1024
DEFAULT_MAX_FILES: Final = 3
MAX_MAX_FILE_BYTES: Final = 10 * 1024 * 1024
MAX_MAX_FILES: Final = 10
_EVENT_TYPE_RE: Final = re.compile(r"^[a-z0-9_]{1,64}$")
_VALID_SEVERITIES: Final = {"debug", "info", "warning", "error", "critical"}
_SAFE_FIELDS: Final = {
    "request_id",
    "method",
    "route",
    "status_code",
    "duration_ms",
    "run_id",
}


class AuditLogService:
    """Append and query a bounded JSONL audit trail without raising to callers."""

    def __init__(
        self,
        *,
        log_dir: str | Path,
        max_file_bytes: int = DEFAULT_MAX_FILE_BYTES,
        max_files: int = DEFAULT_MAX_FILES,
    ) -> None:
        self._log_dir = Path(log_dir)
        self._max_file_bytes = _bounded_int(
            max_file_bytes,
            default=DEFAULT_MAX_FILE_BYTES,
            minimum=128,
            maximum=MAX_MAX_FILE_BYTES,
        )
        self._max_files = _bounded_int(
            max_files,
            default=DEFAULT_MAX_FILES,
            minimum=1,
            maximum=MAX_MAX_FILES,
        )
        self._lock = RLock()
        self._run_id = uuid.uuid4().hex

    @classmethod
    def from_environment(cls) -> "AuditLogService":
        return cls(
            log_dir=os.getenv("BLOG_AUDIT_LOG_DIR", "data/audit-logs"),
            max_file_bytes=_read_int_env(
                "BLOG_AUDIT_LOG_MAX_FILE_BYTES", DEFAULT_MAX_FILE_BYTES
            ),
            max_files=_read_int_env("BLOG_AUDIT_LOG_MAX_FILES", DEFAULT_MAX_FILES),
        )

    def start(self) -> None:
        """Record startup and report an earlier process that missed shutdown."""
        with self._lock:
            had_marker = self._runtime_marker_path().exists()
            if had_marker:
                self.record("service_restarted_uncleanly", severity="warning")
            self.record("service_started", severity="info", run_id=self._run_id)
            self._write_runtime_marker()

    def stop(self) -> None:
        """Record graceful shutdown before clearing this process's marker."""
        with self._lock:
            self.record("service_stopped", severity="info", run_id=self._run_id)
            try:
                self._runtime_marker_path().unlink(missing_ok=True)
            except OSError as exc:
                logger.warning("audit log runtime marker cleanup failed: {}", exc)

    def record(
        self,
        event_type: str,
        *,
        severity: str = "info",
        **fields: object,
    ) -> dict[str, Any] | None:
        """Persist one allowed audit event, returning None when storage is unavailable."""
        event = _build_event(event_type, severity, fields)
        encoded = (json.dumps(event, ensure_ascii=False, separators=(",", ":")) + "\n").encode(
            "utf-8"
        )
        if len(encoded) > self._max_file_bytes:
            return None

        try:
            with self._lock:
                self._ensure_directory()
                self._rotate_if_needed(len(encoded))
                with self._active_log_path().open("ab") as file:
                    file.write(encoded)
            return event
        except OSError as exc:
            logger.warning("audit log write failed: {}", exc)
            return None

    def list_events(
        self,
        *,
        limit: int = 50,
        severity: str | None = None,
        event_type: str | None = None,
    ) -> dict[str, Any]:
        """Return newest-first events from the bounded retention set."""
        selected_limit = _bounded_int(limit, default=50, minimum=1, maximum=100)
        selected_severity = _normalise_filter(severity, _VALID_SEVERITIES)
        selected_event_type = _normalise_event_type(event_type) if event_type else None
        events: list[dict[str, Any]] = []

        try:
            with self._lock:
                for path in self._ordered_log_paths():
                    events.extend(self._read_events_reverse(path))
                    if len(events) >= selected_limit and not (
                        selected_severity or selected_event_type
                    ):
                        break
        except OSError as exc:
            logger.warning("audit log read failed: {}", exc)

        filtered = [
            event
            for event in events
            if _is_valid_event(event)
            and (not selected_severity or event.get("severity") == selected_severity)
            and (not selected_event_type or event.get("event_type") == selected_event_type)
        ]
        filtered.sort(key=lambda event: str(event.get("timestamp", "")), reverse=True)
        selected_events = filtered[:selected_limit]
        return {
            "events": selected_events,
            "event_count": len(selected_events),
            "max_file_bytes": self._max_file_bytes,
            "retained_file_count": self._max_files,
        }

    def _ensure_directory(self) -> None:
        self._log_dir.mkdir(parents=True, exist_ok=True)

    def _active_log_path(self) -> Path:
        return self._log_dir / "audit.jsonl"

    def _runtime_marker_path(self) -> Path:
        return self._log_dir / ".audit-runtime.json"

    def _rotated_log_path(self, index: int) -> Path:
        return self._log_dir / f"audit.{index}.jsonl"

    def _rotate_if_needed(self, incoming_bytes: int) -> None:
        active = self._active_log_path()
        if not active.exists() or active.stat().st_size + incoming_bytes <= self._max_file_bytes:
            return

        oldest = self._rotated_log_path(self._max_files - 1)
        if self._max_files > 1:
            oldest.unlink(missing_ok=True)
            for index in range(self._max_files - 2, 0, -1):
                previous = self._rotated_log_path(index)
                if previous.exists():
                    previous.replace(self._rotated_log_path(index + 1))
            active.replace(self._rotated_log_path(1))
        else:
            active.unlink(missing_ok=True)

    def _ordered_log_paths(self) -> list[Path]:
        paths = [self._active_log_path()]
        paths.extend(self._rotated_log_path(index) for index in range(1, self._max_files))
        return [path for path in paths if path.exists()]

    @staticmethod
    def _read_events_reverse(path: Path) -> list[dict[str, Any]]:
        try:
            lines = path.read_text(encoding="utf-8").splitlines()
        except (OSError, UnicodeDecodeError):
            return []

        events: list[dict[str, Any]] = []
        for line in reversed(lines):
            try:
                item = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(item, dict):
                events.append(item)
        return events

    def _write_runtime_marker(self) -> None:
        try:
            self._ensure_directory()
            marker = {
                "run_id": self._run_id,
                "started_at": datetime.now(timezone.utc).isoformat(),
            }
            temporary = self._runtime_marker_path().with_suffix(".tmp")
            temporary.write_text(json.dumps(marker), encoding="utf-8")
            temporary.replace(self._runtime_marker_path())
        except OSError as exc:
            logger.warning("audit log runtime marker write failed: {}", exc)


def _build_event(
    event_type: str,
    severity: str,
    fields: Mapping[str, object],
) -> dict[str, Any]:
    event: dict[str, Any] = {
        "id": uuid.uuid4().hex,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "event_type": _normalise_event_type(event_type),
        "severity": _normalise_filter(severity, _VALID_SEVERITIES) or "info",
    }
    for key in _SAFE_FIELDS:
        value = fields.get(key)
        sanitised = _sanitise_field(key, value)
        if sanitised is not None:
            event[key] = sanitised
    return event


def _normalise_event_type(value: object) -> str:
    candidate = str(value or "").strip().lower()
    return candidate if _EVENT_TYPE_RE.fullmatch(candidate) else "unknown"


def _normalise_filter(value: object, allowed: set[str]) -> str | None:
    candidate = str(value or "").strip().lower()
    return candidate if candidate in allowed else None


def _sanitise_field(key: str, value: object) -> str | int | float | None:
    if value is None:
        return None
    if key == "status_code":
        try:
            status = int(value)
        except (TypeError, ValueError):
            return None
        return status if 100 <= status <= 599 else None
    if key == "duration_ms":
        try:
            duration = float(value)
        except (TypeError, ValueError):
            return None
        return round(duration, 2) if 0 <= duration <= 3_600_000 else None

    text = str(value).replace("\n", " ").replace("\r", " ").strip()
    return text[:200] if text else None


def _is_valid_event(event: Mapping[str, object]) -> bool:
    if not isinstance(event.get("id"), str) or not event["id"]:
        return False
    if not isinstance(event.get("timestamp"), str) or not event["timestamp"]:
        return False
    if _normalise_event_type(event.get("event_type")) != event.get("event_type"):
        return False
    if _normalise_filter(event.get("severity"), _VALID_SEVERITIES) != event.get(
        "severity"
    ):
        return False
    for key in {"request_id", "method", "route", "run_id"}:
        if key in event and not isinstance(event[key], str):
            return False
    if "status_code" in event and (
        not isinstance(event["status_code"], int)
        or isinstance(event["status_code"], bool)
        or not 100 <= event["status_code"] <= 599
    ):
        return False
    if "duration_ms" in event and (
        not isinstance(event["duration_ms"], (int, float))
        or isinstance(event["duration_ms"], bool)
        or not 0 <= float(event["duration_ms"]) <= 3_600_000
    ):
        return False
    return True


def _bounded_int(value: object, *, default: int, minimum: int, maximum: int) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return default
    return min(max(parsed, minimum), maximum)


def _read_int_env(name: str, default: int) -> int:
    return _bounded_int(os.getenv(name), default=default, minimum=1, maximum=MAX_MAX_FILE_BYTES)


audit_log = AuditLogService.from_environment()


def get_audit_log_snapshot(
    *,
    limit: int = 50,
    severity: str | None = None,
    event_type: str | None = None,
) -> dict[str, Any]:
    """Return the current audit log read model for the admin boundary."""
    return audit_log.list_events(
        limit=limit,
        severity=severity,
        event_type=event_type,
    )
