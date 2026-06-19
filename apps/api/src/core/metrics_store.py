"""Replaceable metrics snapshot storage.

The collectors remain responsible for aggregation. This module only persists
sanitised snapshots so the admin surface can gain history without coupling
routers to a concrete database.
"""

from __future__ import annotations

import json
import os
from collections import deque
from datetime import date, datetime
from pathlib import Path
from threading import Lock
from typing import Any, Mapping, Protocol

from loguru import logger


DEFAULT_MAX_HISTORY = 120


class MetricsSnapshotStore(Protocol):
    """Persistence protocol for metrics snapshots."""

    def save_snapshot(self, kind: str, snapshot: Mapping[str, Any]) -> None:
        """Persist one snapshot under a bounded metric kind."""

    def load_latest(self, kind: str) -> dict[str, Any] | None:
        """Return the latest snapshot for a kind, if present."""

    def load_history(self, kind: str) -> list[dict[str, Any]]:
        """Return bounded snapshots for a kind in oldest-to-newest order."""


class InMemoryMetricsSnapshotStore:
    """Process-local snapshot history store."""

    def __init__(self, max_history: int = DEFAULT_MAX_HISTORY) -> None:
        self._lock = Lock()
        self._max_history = max(1, max_history)
        self._history: dict[str, deque[dict[str, Any]]] = {}

    def save_snapshot(self, kind: str, snapshot: Mapping[str, Any]) -> None:
        key = _normalise_kind(kind)
        safe_snapshot = _json_safe(snapshot)
        with self._lock:
            history = self._history.setdefault(
                key,
                deque(maxlen=self._max_history),
            )
            history.append(safe_snapshot)

    def load_latest(self, kind: str) -> dict[str, Any] | None:
        history = self.load_history(kind)
        if not history:
            return None
        return history[-1]

    def load_history(self, kind: str) -> list[dict[str, Any]]:
        key = _normalise_kind(kind)
        with self._lock:
            return [dict(item) for item in self._history.get(key, [])]


class JsonFileMetricsSnapshotStore:
    """Single-node JSON file snapshot history store."""

    def __init__(
        self,
        path: str | Path,
        max_history: int = DEFAULT_MAX_HISTORY,
    ) -> None:
        self._path = Path(path)
        self._max_history = max(1, max_history)
        self._lock = Lock()

    def save_snapshot(self, kind: str, snapshot: Mapping[str, Any]) -> None:
        key = _normalise_kind(kind)
        safe_snapshot = _json_safe(snapshot)
        with self._lock:
            payload = self._read_payload()
            snapshots = payload.setdefault("snapshots", {})
            history = list(snapshots.get(key, []))
            history.append(safe_snapshot)
            snapshots[key] = history[-self._max_history :]
            self._write_payload(payload)

    def load_latest(self, kind: str) -> dict[str, Any] | None:
        history = self.load_history(kind)
        if not history:
            return None
        return history[-1]

    def load_history(self, kind: str) -> list[dict[str, Any]]:
        key = _normalise_kind(kind)
        with self._lock:
            payload = self._read_payload()
        history = payload.get("snapshots", {}).get(key, [])
        return [dict(item) for item in history if isinstance(item, dict)]

    def _read_payload(self) -> dict[str, Any]:
        if not self._path.exists():
            return _empty_payload()
        try:
            data = json.loads(self._path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            logger.warning("metrics snapshot store read failed: {}", exc)
            return _empty_payload()
        if not isinstance(data, dict):
            return _empty_payload()
        if not isinstance(data.get("snapshots"), dict):
            data["snapshots"] = {}
        data["version"] = 1
        return data

    def _write_payload(self, payload: Mapping[str, Any]) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        temp_path = self._path.with_suffix(f"{self._path.suffix}.tmp")
        temp_path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True),
            encoding="utf-8",
        )
        temp_path.replace(self._path)


def build_metrics_snapshot_store(
    env: Mapping[str, str] | None = None,
) -> MetricsSnapshotStore:
    source = os.environ if env is None else env
    mode = str(source.get("BLOG_METRICS_STORE", "memory")).strip().lower()
    max_history = _read_positive_int(source.get("BLOG_METRICS_STORE_HISTORY"))

    if mode in {"json", "file", "json-file"}:
        path = source.get("BLOG_METRICS_STORE_PATH") or "data/metrics-snapshots.json"
        return JsonFileMetricsSnapshotStore(path, max_history=max_history)

    return InMemoryMetricsSnapshotStore(max_history=max_history)


def _empty_payload() -> dict[str, Any]:
    return {"version": 1, "snapshots": {}}


def _normalise_kind(kind: str) -> str:
    key = str(kind or "").strip().lower()
    return key[:48] or "unknown"


def _read_positive_int(value: str | None) -> int:
    try:
        parsed = int(str(value or "").strip())
    except ValueError:
        return DEFAULT_MAX_HISTORY
    return parsed if parsed > 0 else DEFAULT_MAX_HISTORY


def _json_safe(value: Any) -> Any:
    if isinstance(value, Mapping):
        return {str(key): _json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple, deque)):
        return [_json_safe(item) for item in value]
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return str(value)


metrics_snapshot_store = build_metrics_snapshot_store()


def save_metrics_snapshot(kind: str, snapshot: Mapping[str, Any]) -> None:
    try:
        metrics_snapshot_store.save_snapshot(kind, snapshot)
    except Exception as exc:  # pragma: no cover - defensive guardrail
        logger.warning("metrics snapshot store save failed: {}", exc)


def load_latest_metrics_snapshot(kind: str) -> dict[str, Any] | None:
    try:
        return metrics_snapshot_store.load_latest(kind)
    except Exception as exc:  # pragma: no cover - defensive guardrail
        logger.warning("metrics snapshot store load failed: {}", exc)
        return None


def load_metrics_snapshot_history(kind: str) -> list[dict[str, Any]]:
    try:
        return metrics_snapshot_store.load_history(kind)
    except Exception as exc:  # pragma: no cover - defensive guardrail
        logger.warning("metrics snapshot store history load failed: {}", exc)
        return []
