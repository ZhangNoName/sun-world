#!/usr/bin/env python3
"""Verify middleware emits central audit events without controller coupling."""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

from starlette.requests import Request
from starlette.responses import Response


class _FakeAuditLog:
    def __init__(self) -> None:
        self.events: list[tuple[str, str, dict]] = []

    def record(self, event_type: str, *, severity: str = "info", **fields):
        self.events.append((event_type, severity, fields))


def _request(method: str, path: str, route_template: str) -> Request:
    return Request(
        {
            "type": "http",
            "method": method,
            "path": path,
            "query_string": b"token=must-not-be-audited",
            "headers": [],
            "client": ("127.0.0.1", 1234),
            "scheme": "http",
            "server": ("testserver", 80),
            "route": type("Route", (), {"path": route_template})(),
        }
    )


async def _exercise_middleware() -> list[tuple[str, str, dict]]:
    from src.core import observability

    sink = _FakeAuditLog()
    observability.audit_log = sink
    middleware = observability.ObservabilityMiddleware(app=lambda scope, receive, send: None)

    response = await middleware.dispatch(
        _request("POST", "/blogs/42", "/blogs/{blog_id}"),
        lambda _request: _completed_response(Response(status_code=201)),
    )
    assert response.status_code == 201

    rejected = await middleware.dispatch(
        _request("POST", "/blogs/invalid", "/blogs/{blog_id}"),
        lambda _request: _completed_response(Response(status_code=422)),
    )
    assert rejected.status_code == 422

    try:
        await middleware.dispatch(
            _request("GET", "/blogs/42", "/blogs/{blog_id}"),
            _raise_failure,
        )
    except RuntimeError:
        pass
    else:
        raise AssertionError("middleware must re-raise application errors")

    return sink.events


async def _completed_response(response: Response) -> Response:
    return response


async def _raise_failure(_request: Request) -> Response:
    raise RuntimeError("expected test failure")


def main() -> int:
    repo_root = Path(__file__).resolve().parents[1]
    sys.path.insert(0, str(repo_root / "apps" / "api"))

    events = asyncio.run(_exercise_middleware())
    mutated = next(event for event in events if event[0] == "request_mutated")
    failed = next(event for event in events if event[0] == "request_failed")

    assert mutated[1] == "info"
    assert mutated[2]["method"] == "POST"
    assert mutated[2]["route"] == "/blogs/{blog_id}"
    assert mutated[2]["status_code"] == 201
    assert "query" not in mutated[2]
    assert failed[1] == "error"
    assert failed[2]["status_code"] == 500
    assert failed[2]["route"] == "/blogs/{blog_id}"
    assert len([event for event in events if event[0] == "request_mutated"]) == 1

    print("Audit log integration check passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
