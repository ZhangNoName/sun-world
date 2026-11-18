"""Content-free, bounded process-lifetime AI run metrics; never a billing ledger."""
from collections import deque
from datetime import datetime, timezone
from threading import Lock
from time import monotonic
from contextlib import aclosing

from pydantic import BaseModel

from src.core.audit_log import audit_log
from src.core.request_context import get_request_id


class AiRunMetricsSnapshot(BaseModel):
    started_at: str
    started: int
    active: int
    completed: int
    failed: int
    cancelled: int
    sample_count: int
    p95_duration_ms: float


class AiRunMetrics:
    def __init__(self):
        self.lock = Lock()
        self.started_at = datetime.now(timezone.utc).isoformat()
        self.counts = dict(started=0, active=0, completed=0, failed=0, cancelled=0)
        self.durations = deque(maxlen=500)

    def start(self):
        with self.lock:
            self.counts["started"] += 1
            self.counts["active"] += 1

    def finish(self, outcome, duration):
        with self.lock:
            self.counts["active"] -= 1
            self.counts[outcome] += 1
            self.durations.append(round(duration, 2))

    def snapshot(self):
        with self.lock:
            values = sorted(self.durations)
            return AiRunMetricsSnapshot(
                started_at=self.started_at, **self.counts, sample_count=len(values),
                p95_duration_ms=values[max(0, (len(values) * 95 + 99) // 100 - 1)] if values else 0,
            )


ai_run_metrics = AiRunMetrics()


async def observe_run(events, metrics=None):
    metrics = metrics or ai_run_metrics
    metrics.start()
    started = monotonic()
    outcome = "cancelled"
    finished = False

    def finish() -> float:
        duration = (monotonic() - started) * 1000
        metrics.finish(outcome, duration)
        audit_log.record(
            "ai_run_" + outcome,
            severity="error" if outcome == "failed" else "info",
            request_id=get_request_id(), duration_ms=duration,
        )
        return duration

    try:
        async with aclosing(events):
            async for event in events:
                if not finished and event.type in {"message.completed", "run.failed"}:
                    outcome = "completed" if event.type == "message.completed" else "failed"
                    duration = finish()
                    finished = True
                    if outcome == "completed":
                        event.data["duration_ms"] = round(duration)
                yield event
    except Exception:
        outcome = "failed"
        raise
    finally:
        if not finished:
            finish()
