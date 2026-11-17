"""Loopback-only validation app. This is not a production authentication entrypoint."""

import asyncio
import json
import os
from contextlib import asynccontextmanager
from pathlib import Path
from uuid import UUID

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, Field

from src.module_composition import create_module_registry
from src.modules.ai.public import AiStreamEvent, encode_sse_event
from dataset import DATASET_LABEL, create_dataset
from runtime import Runtime
from store import Store, TERMINAL


ORIGIN = "http://127.0.0.1:3031"
COOKIE = "dsh_local_sid"


class RunInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    question: str = Field(min_length=1, max_length=2000)
    idempotency_key: UUID


class LoginInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    user_id: int = Field(default=1, ge=1, le=2)


class ToolCall(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    call_id: str = Field(min_length=1, max_length=128)
    generation: int
    tool_version: str
    arguments: dict


class Receipt(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    call_id: str = Field(min_length=1, max_length=128)
    result_hash: str = Field(pattern="^[0-9a-f]{64}$")


def create_app(*, database_path=None, runner=None, model_proxy=None, model_label=None):
    repository, tools = create_dataset()
    if model_proxy is None:
        try:
            from model_proxy import model_proxy, MODEL_LABEL
            model_label = model_label or MODEL_LABEL
        except ImportError:
            model_proxy = None
    root = Path(__file__).resolve().parents[2]
    path = database_path or root / ".tmp/dsh-blog-local/ledger.sqlite3"
    store = Store(path)
    runtime = Runtime(store, tools, registry=create_module_registry(), runner=runner, model_proxy=model_proxy,
                      model_label=model_label or "未配置真实模型")

    @asynccontextmanager
    async def lifespan(_app):
        yield
        for task in list(runtime.tasks.values()):
            task.cancel()
        await asyncio.gather(*list(runtime.tasks.values()), return_exceptions=True)
        store.db.close()

    app = FastAPI(title="DSH local validation", lifespan=lifespan)
    app.state.runtime = runtime
    app.state.repository = repository
    app.add_middleware(CORSMiddleware, allow_origins=[ORIGIN], allow_credentials=True,
                       allow_methods=["GET", "POST", "DELETE"], allow_headers=["content-type"])

    @app.middleware("http")
    async def loopback_only(request, call_next):
        if request.headers.get("host", "").split(":")[0] != "127.0.0.1":
            return Response(status_code=403)
        if request.headers.get("content-length", "0").isdigit() and int(request.headers.get("content-length", "0")) > 256 * 1024:
            return Response(status_code=413)
        if request.method in {"POST", "DELETE", "PUT", "PATCH"} and not request.url.path.startswith("/internal/"):
            if request.headers.get("origin") != ORIGIN:
                return Response(status_code=403)
        # Bound bodies even for chunked requests before JSON parsing.
        body = bytearray()
        async for chunk in request.stream():
            body.extend(chunk)
            if len(body) > 256 * 1024:
                return Response(status_code=413)
        request._body = bytes(body)
        return await call_next(request)

    def sid(request):
        return request.cookies.get(COOKIE)

    def private(run_id, request):
        return runtime.private(run_id, request.headers.get("authorization"),
                               request.headers.get("x-worker-service"))

    @app.get("/healthz")
    async def health():
        return {"status": "ok", "local_validation": True}

    @app.post("/local/session")
    async def login(body: LoginInput, response: Response):
        token = runtime.login(body.user_id)
        response.set_cookie(COOKIE, token, httponly=True, samesite="strict", max_age=3600)
        return {"user_id": body.user_id, "display_name": f"本地验证用户 {body.user_id}"}

    @app.get("/local/session")
    async def session(request: Request):
        user_id = runtime.user(sid(request))
        return {"user_id": user_id, "display_name": f"本地验证用户 {user_id}"}

    @app.delete("/local/session")
    async def logout(request: Request, response: Response):
        await runtime.logout(sid(request))
        response.delete_cookie(COOKIE)
        return {"ok": True}

    @app.get("/local/articles/{article_id}")
    async def article(article_id: int):
        value = repository.get_blog(article_id)
        if not value:
            raise HTTPException(404, "article_not_found")
        return {"id": value.id, "title": value.title, "content": value.content}

    @app.get("/ai/v1/blog-qa/capabilities")
    async def capabilities(request: Request):
        try:
            runtime.user(sid(request))
            authenticated = True
        except HTTPException:
            authenticated = False
        return {"enabled": runtime.available, "local_validation": True,
                "dataset": DATASET_LABEL, "model": runtime.model_label,
                "authenticated": authenticated,
                "reason": None if runtime.available else "本地沙盒或模型未就绪"}

    @app.post("/ai/v1/blog-qa/runs/stream")
    async def start(body: RunInput, request: Request):
        user_id = runtime.user(sid(request))
        if not body.question.strip():
            raise HTTPException(422, "question_required")
        if not runtime.available:
            raise HTTPException(503, "local_runtime_unavailable")
        run_id, error = store.create(user_id, str(body.idempotency_key), body.question.strip())
        if error == "duplicate":
            raise HTTPException(409, {"code": "idempotency_conflict", "run_id": run_id})
        if error:
            raise HTTPException(429, "local_concurrency_limit")
        runtime.start(run_id, sid(request))

        async def events():
            try:
                sequence = 0
                yield encode_sse_event(AiStreamEvent(event_id=f"{run_id}:0", type="run.started",
                    conversation_id=run_id, message_id=run_id, sequence=sequence,
                    data={"run_id": run_id, "local_validation": True}))
                while store.get(run_id)["status"] not in TERMINAL:
                    await asyncio.sleep(.1)
                state = runtime.public_state(run_id)
                kind = "message.completed" if state["status"] == "completed" else "run.failed"
                yield encode_sse_event(AiStreamEvent(event_id=f"{run_id}:1", type=kind,
                    conversation_id=run_id, message_id=run_id, sequence=1, data=state))
            finally:
                if store.get(run_id)["status"] not in TERMINAL:
                    await runtime.cancel(run_id, "client_disconnected")
        return StreamingResponse(events(), media_type="text/event-stream",
                                 headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"})

    @app.get("/ai/v1/blog-qa/runs/{run_id}")
    async def get_run(run_id: str, request: Request):
        runtime.owned(run_id, sid(request))
        return runtime.public_state(run_id)

    @app.post("/ai/v1/blog-qa/runs/{run_id}/cancel")
    async def cancel(run_id: str, request: Request):
        runtime.owned(run_id, sid(request))
        await runtime.cancel(run_id)
        return runtime.public_state(run_id)

    @app.post("/internal/agent/v1/runs/{run_id}/tools/{tool_id}")
    async def tool(run_id: str, tool_id: str, body: ToolCall, request: Request):
        private(run_id, request)
        return runtime.tool(run_id, tool_id, body)

    @app.post("/internal/agent/v1/runs/{run_id}/receipts")
    async def receipt(run_id: str, body: Receipt, request: Request):
        private(run_id, request)
        if not store.receipt(run_id, body.call_id, body.result_hash):
            raise HTTPException(409, "receipt_hash_mismatch")
        return {"delivered": True}

    @app.post("/internal/agent/v1/runs/{run_id}/model/messages")
    async def model(run_id: str, request: Request):
        private(run_id, request)
        body = await request.json()
        if not isinstance(body, dict):
            raise HTTPException(422, "model_object_required")
        return await runtime.model(run_id, body)

    return app


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(create_app(), host="127.0.0.1", port=8011, access_log=False)
