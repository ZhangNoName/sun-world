"""Explicitly enabled local-site adapter, using real account and public blog services."""

import asyncio
import hashlib
import os
import time
from threading import RLock
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request, Security
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.routing import APIRoute
from starlette.concurrency import run_in_threadpool

from src.core.auth import AuthorizationDenied
from src.core.auth.session import SessionAuthenticator
from src.core.csrf import canonical_origin
from src.core.response import ApiResponse, fail, ok
from src.core.runtime_env import is_local_runtime
from src.core.security_schemes import access_token_cookie
from src.modules.ai.public import AiStreamEvent, encode_sse_event
from src.modules.blog.public import create_public_tools
from .runtime import Runtime, finish_cleanup
from .schemas import BlogQaCapabilities, BlogQaRun, Receipt, RunInput, ToolCall
from .store import Store, TERMINAL


def allowed_users():
    try:
        values = {int(value.strip()) for value in os.getenv("DSH_SITE_BLOG_QA_USER_IDS", "").split(",") if value.strip()}
        return values if values and all(value > 0 for value in values) else set()
    except ValueError:
        return set()


def enabled():
    return is_local_runtime() and os.getenv("DSH_SITE_BLOG_QA_ENABLED") == "1" and bool(allowed_users())


def require_origin(request):
    # The existing CookieCsrfMiddleware remains authoritative for the whole app;
    # this adapter also enforces its narrow development origins in isolation.
    origin = canonical_origin(request.headers.get("origin") or request.headers.get("referer"))
    if origin not in {"http://127.0.0.1:3030", "http://localhost:3030"}:
        raise HTTPException(403, "请求来源校验失败")


class CredentialVault:
    """Bounded, short-lived server memory; only verified session families enter."""

    def __init__(self, active_references, *, capacity=128, ttl=60):
        self.entries = {}
        self.pins = {}
        self.active_references = active_references
        self.capacity, self.ttl = capacity, ttl
        self.lock = RLock()

    def _prune(self):
        active = self.active_references() | self.pins.keys()
        now = time.monotonic()
        for reference, (_, expiry) in list(self.entries.items()):
            if expiry <= now and reference not in active:
                self.entries.pop(reference, None)

    def put(self, subject, token, *, existing_only=False, pin=False):
        reference = hashlib.sha256(f"{subject.user_id}:{subject.session_family}".encode()).hexdigest()
        with self.lock:
            self._prune()
            if existing_only and reference not in self.entries:
                return None
            if reference not in self.entries and len(self.entries) >= self.capacity:
                active = self.active_references() | self.pins.keys()
                removable = next((key for key in self.entries if key not in active), None)
                if removable is None:
                    raise HTTPException(429, "credential_capacity_exhausted")
                self.entries.pop(removable)
            self.entries[reference] = (token, time.monotonic() + self.ttl)
            if pin:
                self.pins[reference] = self.pins.get(reference, 0) + 1
        return reference

    def get(self, reference):
        with self.lock:
            self._prune()
            entry = self.entries.get(reference)
            return entry[0] if entry and entry[1] > time.monotonic() else None

    def release(self, reference):
        with self.lock:
            if reference not in self.active_references() and not self.pins.get(reference):
                self.entries.pop(reference, None)

    def pin(self, reference):
        with self.lock:
            self.pins[reference] = self.pins.get(reference, 0) + 1

    def unpin(self, reference):
        with self.lock:
            count = self.pins.get(reference, 0)
            if count <= 1:
                self.pins.pop(reference, None)
            else:
                self.pins[reference] = count - 1
            self.release(reference)

    def clear(self):
        with self.lock:
            self.entries.clear()
            self.pins.clear()


class BoundedRoute(APIRoute):
    def get_route_handler(self):
        original = super().get_route_handler()

        async def handler(request):
            if request.url.path.startswith("/internal/agent/"):
                if (request.url.hostname not in {"localhost", "127.0.0.1"}
                        or not request.client or request.client.host not in {"127.0.0.1", "::1"}):
                    raise HTTPException(403, "private_loopback_only")
            body = bytearray()
            async for chunk in request.stream():
                body.extend(chunk)
                if len(body) > 256 * 1024:
                    raise HTTPException(413, "request_body_too_large")
            request._body = bytes(body)
            return await original(request)
        return handler


def create_blog_qa_router(application, *, registry=None, runner=None, database_path=None, tools_factory=None):
    router = APIRouter(tags=["blog-qa"], route_class=BoundedRoute)
    lock = asyncio.Lock()
    runtime = None
    credentials = CredentialVault(lambda: {state["sid"] for state in list(runtime.active.values())} if runtime else set())
    application.state.blog_qa_credential_vault = credentials

    def verify_token(token):
        if not enabled():
            raise HTTPException(403, "site_blog_qa_disabled")
        if not token:
            raise HTTPException(401, "active_session_required")
        if getattr(application, "auth", None) is None:
            raise HTTPException(503, "site_dependencies_not_ready")
        try:
            principal = SessionAuthenticator(application.auth).authenticate(token)
        except AuthorizationDenied:
            raise HTTPException(401, "active_session_required") from None
        return check_subject(principal)

    def check_subject(principal):
        if principal.user_id not in allowed_users():
            raise HTTPException(403, "blog_qa_not_allowlisted")
        if os.getenv("DSH_SITE_BLOG_QA_REQUIRE_ADMIN") == "1" and "admin" not in principal.roles:
            raise HTTPException(403, "blog_qa_admin_required")
        return principal

    def authenticate(reference):
        if not enabled():
            raise HTTPException(403, "site_blog_qa_disabled")
        token = credentials.get(reference)
        if not token:
            raise HTTPException(401, "active_session_required")
        try:
            subject, current = SessionAuthenticator(application.auth).revalidate_bound_session(token, reference)
        except AuthorizationDenied:
            raise HTTPException(401, "active_session_required") from None
        check_subject(subject)
        credentials.put(subject, current, existing_only=True)
        return subject

    async def principal(request, *, retain=True):
        if not enabled():
            raise HTTPException(403, "site_blog_qa_disabled")
        token = request.cookies.get("access_token")
        subject = await run_in_threadpool(verify_token, token)
        return credentials.put(subject, token, existing_only=not retain, pin=retain), subject

    async def service():
        nonlocal runtime
        if not enabled():
            raise HTTPException(503, "site_blog_qa_disabled")
        if runtime is not None:
            return runtime
        async with lock:
            if runtime is not None:
                return runtime
            if any(getattr(application, field, None) is None for field in ("auth", "mysql", "mongo", "redis")):
                raise HTTPException(503, "site_dependencies_not_ready")
            proxy = getattr(application, "blog_qa_model_proxy", None)
            if proxy is None:
                from src.modules.ai.public import create_blog_qa_proxy
                proxy = await create_blog_qa_proxy(application.ai_service, local_model=os.getenv("DSH_SITE_BLOG_QA_MODEL") or None)
            tools = tools_factory() if tools_factory else create_public_tools(application.mysql, application.mongo)
            # Only this explicitly local path creates the independent development ledger.
            root = Path(__file__).resolve().parents[5]
            path = database_path or root / ".tmp/dsh-blog-site/ledger.sqlite3"
            candidate = Runtime(Store(path), tools, registry=registry if registry is not None else application.module_registry, runner=runner, model_proxy=proxy,
                                model_label=getattr(proxy, "model_label", getattr(application, "blog_qa_model_label", "本站默认模型")),
                                authenticate=authenticate, article_url=lambda value: f"/blog/{value}",
                                api_origin="http://127.0.0.1:8032")
            runtime = candidate
            runtime.release_credentials = credentials.release
            runtime.clear_credentials = credentials.clear
            application.state.blog_qa_runtime = runtime
            return runtime

    def admit(user_id):
        try:
            hook = getattr(application, "blog_qa_admit", None)
            if hook:
                admitted = hook(user_id)
            else:
                admitted, _retry = application.redis.consume_multi_fixed_window([
                    (f"blog_qa:site:user:{user_id}:minute", 6, 60),
                    ("blog_qa:site:global:minute", 10, 60),
                ], prefix="blog_qa_dev")
        except Exception:
            raise HTTPException(503, "admission_unavailable") from None
        if not admitted:
            raise HTTPException(429, "blog_qa_rate_limited")

    async def active_private(request, run_id):
        current = await service()
        await run_in_threadpool(current.private, run_id, request.headers.get("authorization"),
                                request.headers.get("x-worker-service"))
        return current

    @router.get("/ai/v1/blog-qa/capabilities", response_model=ApiResponse[BlogQaCapabilities])
    async def capabilities(request: Request):
        authenticated = False
        token = request.cookies.get("access_token")
        if enabled() and token and getattr(application, "auth", None) is not None:
            try:
                await run_in_threadpool(SessionAuthenticator(application.auth).authenticate, token)
                authenticated = True
            except AuthorizationDenied:
                pass
        try:
            await principal(request, retain=False)
            current = await service()
            available = current.available
            reason = None if available else "本地沙盒或模型未就绪"
            label = current.model_label
        except HTTPException as exc:
            available, reason, label = False, str(exc.detail), "本站默认模型"
        return ok(data={"enabled": available, "mode": "site", "local_validation": False,
                        "dataset": "本站公开博客", "model": label,
                        "authenticated": authenticated, "reason": reason})

    @router.post("/ai/v1/blog-qa/runs/stream", response_class=StreamingResponse,
                 dependencies=[Security(access_token_cookie)],
                 responses={200: {"content": {"text/event-stream": {"schema": {"type": "string"}}}}})
    async def start(body: RunInput, request: Request):
        require_origin(request)
        _, subject = await principal(request, retain=False)
        current = await service()
        if not current.available:
            raise HTTPException(503, "site_runtime_unavailable")
        if not body.question.strip():
            raise HTTPException(422, "question_required")
        # Check ownership/idempotency before charging another admission attempt.
        existing = current.store.find_idempotent_run(subject.user_id, str(body.idempotency_key))
        if existing:
            return JSONResponse(status_code=409, content=fail(code="idempotency_conflict",
                msg="此请求已受理", data={"run_id": existing}).model_dump())
        await run_in_threadpool(admit, subject.user_id)
        run_id, error = current.store.create(subject.user_id, str(body.idempotency_key),
                                             body.question.strip(), subject.session_family)
        if error == "duplicate":
            return JSONResponse(status_code=409, content=fail(code="idempotency_conflict",
                msg="此请求已受理", data={"run_id": run_id}).model_dump())
        if error:
            raise HTTPException(429, "site_concurrency_limit")
        reference = credentials.put(subject, request.cookies.get("access_token"), pin=True)
        current.start(run_id, reference)

        async def events():
            try:
                yield encode_sse_event(AiStreamEvent(event_id=f"{run_id}:0", type="run.started",
                    conversation_id=run_id, message_id=run_id, sequence=0, data={"run_id": run_id, "mode": "site"}))
                while current.store.get(run_id)["status"] not in TERMINAL:
                    await asyncio.sleep(.1)
                # Never disclose a late answer to an expired/logged-out session.
                await run_in_threadpool(current.owned, run_id, reference)
                state = await run_in_threadpool(current.public_state, run_id)
                await run_in_threadpool(current.owned, run_id, reference)
                yield encode_sse_event(AiStreamEvent(event_id=f"{run_id}:1",
                    type="message.completed" if state["status"] == "completed" else "run.failed",
                    conversation_id=run_id, message_id=run_id, sequence=1, data=state))
            except HTTPException:
                yield encode_sse_event(AiStreamEvent(event_id=f"{run_id}:1", type="run.failed",
                    conversation_id=run_id, message_id=run_id, sequence=1,
                    data={"id": run_id, "status": "cancelled", "question": "", "sources": [],
                          "error_code": "session_revoked"}))
            finally:
                async def cleanup():
                    try:
                        task = current.tasks.get(run_id)
                        if current.store.get(run_id)["status"] not in TERMINAL:
                            await current.cancel(run_id, "client_disconnected")
                        if task:
                            await asyncio.gather(task, return_exceptions=True)
                    finally:
                        credentials.unpin(reference)
                await finish_cleanup(cleanup())
        return StreamingResponse(events(), media_type="text/event-stream", headers={"Cache-Control": "no-store"})

    @router.get("/ai/v1/blog-qa/runs/{run_id}", response_model=ApiResponse[BlogQaRun], dependencies=[Security(access_token_cookie)])
    async def get_run(run_id: str, request: Request):
        reference, _ = await principal(request)
        try:
            current = await service()
            await run_in_threadpool(current.owned, run_id, reference)
            state = await run_in_threadpool(current.public_state, run_id)
            await run_in_threadpool(current.owned, run_id, reference)
            return ok(data=state)
        finally:
            credentials.unpin(reference)

    @router.post("/ai/v1/blog-qa/runs/{run_id}/cancel", response_model=ApiResponse[BlogQaRun], dependencies=[Security(access_token_cookie)])
    async def cancel(run_id: str, request: Request):
        require_origin(request)
        reference, _ = await principal(request)
        try:
            current = await service()
            await run_in_threadpool(current.owned, run_id, reference)
            await current.cancel(run_id)
            state = await run_in_threadpool(current.public_state, run_id)
            await run_in_threadpool(current.owned, run_id, reference)
            return ok(data=state)
        finally:
            credentials.unpin(reference)

    @router.post("/internal/agent/v1/runs/{run_id}/tools/{tool_id}", include_in_schema=False)
    async def tool(run_id: str, tool_id: str, body: ToolCall, request: Request):
        current = await active_private(request, run_id)
        return await run_in_threadpool(current.tool, run_id, tool_id, body)

    @router.post("/internal/agent/v1/runs/{run_id}/receipts", include_in_schema=False)
    async def receipt(run_id: str, body: Receipt, request: Request):
        current = await active_private(request, run_id)
        if not current.store.receipt(run_id, body.call_id, body.result_hash):
            raise HTTPException(409, "receipt_hash_mismatch")
        return {"delivered": True}

    @router.post("/internal/agent/v1/runs/{run_id}/model/messages", include_in_schema=False)
    async def model(run_id: str, request: Request):
        current = await active_private(request, run_id)
        body = await request.json()
        if not isinstance(body, dict):
            raise HTTPException(422, "model_object_required")
        return await current.model(run_id, body)

    return router
