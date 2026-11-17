import asyncio
import json
import threading

import httpx
import os
import sys
import tempfile
import time
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
from uuid import uuid4

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from jose import jwt


ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "apps/api"))
sys.path.insert(0, str(ROOT / "tools/dsh-blog-local"))
from dataset import create_dataset
from src.modules.agent_runtime.router import CredentialVault, create_blog_qa_router
from src.module_composition import create_module_registry
from src.modules.agent_runtime.runtime import Runtime
from src.modules.agent_runtime.store import Store
from src.modules.agent_runtime.schemas import ToolCall


class AuthStub:
    secret_key = "synthetic-test-signing-key-only"

    def __init__(self):
        self.revoked = set()
        self.disabled = set()
        self.roles = {1: ["admin"], 2: ["normal"]}
        self.checks = []
        self.db = self
        self.snapshots = {}

    def token(self, user_id=1, family="family-one"):
        token = jwt.encode({"sub": str(user_id), "sid": family, "typ": "access", "device": "synthetic-device",
                           "jti": str(uuid4()),
                           "auth_time": int(time.time()),
                           "exp": datetime.now(timezone.utc) + timedelta(hours=1)}, self.secret_key, algorithm="HS256")
        self.snapshots[(str(user_id), "synthetic-device")] = (token, "synthetic-refresh", family)
        return token

    def get_session_token_snapshot(self, *, user_id, device_id):
        return self.snapshots.get((user_id, device_id))

    def get_user_from_token(self, token, check_redis):
        self.checks.append(check_redis)
        claims = jwt.decode(token, self.secret_key, algorithms=["HS256"])
        user_id = int(claims["sub"])
        snapshot = self.get_session_token_snapshot(user_id=str(user_id), device_id=claims["device"])
        if token in self.revoked or user_id in self.disabled or not snapshot or snapshot[0] != token:
            return None
        return {"id": user_id, "roles": [{"code": role} for role in self.roles[user_id]]}


class RedisStub:
    def __init__(self):
        self.available = True
        self.calls = []

    def consume_multi_fixed_window(self, limits, prefix):
        self.calls.append((limits, prefix))
        if not self.available:
            raise ConnectionError("synthetic unavailable")
        return True, 0


class AuthenticatedBlogQaTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.database = Path(self.temp.name) / "site.sqlite3"
        self.environment = patch.dict(os.environ, {"BLOG_RUNTIME_ENV": "local", "DSH_SITE_BLOG_QA_ENABLED": "1",
            "DSH_SITE_BLOG_QA_USER_IDS": "1,2", "DSH_SITE_BLOG_QA_REQUIRE_ADMIN": "0"})
        self.environment.start()
        self.app = FastAPI()
        self.app.auth = AuthStub()
        self.app.redis = RedisStub()
        self.app.mysql, self.app.mongo = object(), object()
        self.repository, self.tools = create_dataset()
        async def model(_body):
            return {}
        self.app.blog_qa_model_proxy = model
        async def runner(row, payload):
            current = self.app.state.blog_qa_runtime
            result = await asyncio.to_thread(current.tool, row["id"], "blog.read_public",
                ToolCall(call_id="read", generation=1, tool_version="1", arguments={"article_id": 1}))
            current.store.receipt(row["id"], "read", result["result_hash"])
            return {"finish": "completed", "session_id": "blog-qa-" + row["id"], "turn_id": "turn",
                    "answer": "公开博客引用链路经过核验。", "sourceIds": [1]}
        self.app.include_router(create_blog_qa_router(self.app, registry=create_module_registry(), runner=runner,
            database_path=self.database, tools_factory=lambda: self.tools))
        self.client = TestClient(self.app, base_url="http://127.0.0.1:8032", client=("127.0.0.1", 50000))
        self.headers = {"Origin": "http://127.0.0.1:3030"}
        self.token = self.app.auth.token()
        self.client.cookies.set("access_token", self.token)

    def tearDown(self):
        current = getattr(self.app.state, "blog_qa_runtime", None)
        if current:
            current.store.db.close()
        self.environment.stop()
        self.temp.cleanup()

    def run_question(self, key=None):
        return self.client.post("/ai/v1/blog-qa/runs/stream", headers=self.headers,
            json={"question": "如何核对引用", "idempotency_key": str(key or uuid4())})

    def latest_run(self, response):
        events = [json.loads(line[6:]) for line in response.text.splitlines() if line.startswith("data: ")]
        self.assertEqual(response.status_code, 200)
        return events[0]["data"]["run_id"], events[-1]["data"]

    def test_real_cookie_claims_and_redis_account_rechecks_use_existing_authenticator(self):
        run_id, state = self.latest_run(self.run_question())
        self.assertEqual(state["status"], "completed")
        self.assertEqual(state["sources"][0]["url"], "/blog/1")
        self.assertGreater(len(self.app.auth.checks), 4)
        self.assertTrue(all(self.app.auth.checks))
        self.assertEqual(self.app.state.blog_qa_runtime.store.get(run_id)["session_family"], "family-one")
        self.assertEqual(self.app.redis.calls[0][1], "blog_qa_dev")
        self.app.auth.revoked.add(self.token)
        self.assertEqual(self.client.get(f"/ai/v1/blog-qa/runs/{run_id}").status_code, 401)

    def test_cross_user_and_other_session_family_cannot_restore_or_cancel(self):
        run_id, _ = self.latest_run(self.run_question())
        for token in (self.app.auth.token(2), self.app.auth.token(1, "other-family")):
            self.client.cookies.set("access_token", token)
            self.assertEqual(self.client.get(f"/ai/v1/blog-qa/runs/{run_id}").status_code, 404)
            self.assertEqual(self.client.post(f"/ai/v1/blog-qa/runs/{run_id}/cancel", headers=self.headers).status_code, 404)

    def test_csrf_and_authentication_are_not_optional(self):
        body = {"question": "question", "idempotency_key": str(uuid4())}
        self.assertEqual(self.client.post("/ai/v1/blog-qa/runs/stream", json=body).status_code, 403)
        self.client.cookies.clear()
        self.assertEqual(self.run_question().status_code, 401)
        self.assertFalse(self.database.exists())

    def test_allowlist_and_admin_revocation_are_checked_on_history(self):
        run_id, _ = self.latest_run(self.run_question())
        with patch.dict(os.environ, {"DSH_SITE_BLOG_QA_USER_IDS": "2"}):
            self.assertEqual(self.client.get(f"/ai/v1/blog-qa/runs/{run_id}").status_code, 403)
        with patch.dict(os.environ, {"DSH_SITE_BLOG_QA_REQUIRE_ADMIN": "1"}):
            self.app.auth.roles[1] = ["normal"]
            self.assertEqual(self.client.get(f"/ai/v1/blog-qa/runs/{run_id}").status_code, 403)

    def test_production_and_empty_allowlist_never_initialize_sqlite(self):
        for override in ({"BLOG_RUNTIME_ENV": "production"}, {"DSH_SITE_BLOG_QA_USER_IDS": ""},
                         {"DSH_SITE_BLOG_QA_ENABLED": "0"}):
            with patch.dict(os.environ, override):
                response = self.client.get("/ai/v1/blog-qa/capabilities")
                self.assertFalse(response.json()["data"]["enabled"])
                self.assertEqual(response.json()["data"]["mode"], "site")
                self.assertNotEqual(self.run_question().status_code, 200)
                self.assertFalse(self.database.exists())
                self.assertEqual(self.app.state.blog_qa_credential_vault.entries, {})

    def test_invalid_cookies_never_accumulate_and_capabilities_do_not_retain_credentials(self):
        for index in range(20):
            self.client.cookies.set("access_token", "invalid-cookie-" + str(index))
            self.client.get("/ai/v1/blog-qa/capabilities")
            self.assertEqual(self.run_question().status_code, 401)
        self.assertEqual(self.app.state.blog_qa_credential_vault.entries, {})
        self.assertFalse(self.database.exists())
        self.client.cookies.set("access_token", self.token)
        self.client.get("/ai/v1/blog-qa/capabilities")
        self.assertEqual(self.app.state.blog_qa_credential_vault.entries, {})

    def test_verified_refresh_updates_same_family_reference_without_new_slot(self):
        self.client.get("/ai/v1/blog-qa/capabilities")
        runtime = self.app.state.blog_qa_runtime
        vault = self.app.state.blog_qa_credential_vault
        from src.core.auth.session import SessionAuthenticator
        subject = SessionAuthenticator(self.app.auth).authenticate(self.token)
        reference = vault.put(subject, self.token)
        run_id, _ = runtime.store.create(1, str(uuid4()), "refresh", subject.session_family)
        runtime.store.transition(run_id, "running")
        runtime.active[run_id] = {"sid": reference, "run_token": "synthetic", "deadline": time.monotonic() + 45}
        claims = jwt.decode(self.token, self.app.auth.secret_key, algorithms=["HS256"])
        fresh = jwt.encode({**claims, "jti": str(uuid4())}, self.app.auth.secret_key, algorithm="HS256")
        self.app.auth.snapshots[("1", "synthetic-device")] = (fresh, "synthetic-refresh", "family-one")
        self.app.auth.revoked.add(self.token)
        self.client.cookies.set("access_token", fresh)
        self.client.get("/ai/v1/blog-qa/capabilities")
        self.assertEqual(len(vault.entries), 1)
        self.assertEqual(vault.get(reference), fresh)
        self.assertEqual(runtime.ensure_active(run_id)[0]["id"], run_id)
        self.client.cookies.set("access_token", "forged")
        self.client.get("/ai/v1/blog-qa/capabilities")
        self.assertEqual(vault.get(reference), fresh)

    def test_bound_run_follows_redis_rotation_without_another_qa_request(self):
        self.client.get("/ai/v1/blog-qa/capabilities")
        runtime = self.app.state.blog_qa_runtime
        vault = self.app.state.blog_qa_credential_vault
        from src.core.auth.session import SessionAuthenticator
        subject = SessionAuthenticator(self.app.auth).authenticate(self.token)
        reference = vault.put(subject, self.token)
        run_id, _ = runtime.store.create(1, str(uuid4()), "rotation", subject.session_family)
        runtime.store.transition(run_id, "running")
        deadline = time.monotonic() + 45
        runtime.active[run_id] = {"sid": reference, "run_token": "synthetic", "deadline": deadline}
        fresh = self.app.auth.token()
        self.assertNotEqual(fresh, self.token)
        self.assertEqual(runtime.ensure_active(run_id)[0]["id"], run_id)
        self.assertEqual(vault.get(reference), fresh)
        self.assertEqual(runtime.active[run_id]["deadline"], deadline)
        # Expired signed cached identity remains only a lookup hint. Current
        # Redis access must independently pass strict expiration and account checks.
        claims = jwt.decode(self.token, self.app.auth.secret_key, algorithms=["HS256"])
        expired = jwt.encode({**claims, "exp": int(time.time()) - 10}, self.app.auth.secret_key, algorithm="HS256")
        vault.put(subject, expired)
        self.assertEqual(runtime.ensure_active(run_id)[0]["id"], run_id)
        self.client.cookies.set("access_token", expired)
        self.assertEqual(self.client.get(f"/ai/v1/blog-qa/runs/{run_id}").status_code, 401)
        for invalid in ("logout", "disabled", "new-family"):
            self.app.auth.disabled.clear()
            self.app.auth.snapshots[("1", "synthetic-device")] = (fresh, "synthetic-refresh", "family-one")
            vault.put(subject, fresh)
            if invalid == "logout":
                self.app.auth.snapshots.clear()
            elif invalid == "disabled":
                self.app.auth.disabled.add(1)
            else:
                self.app.auth.token(1, "replacement-family")
            with self.subTest(invalid=invalid), self.assertRaises(HTTPException):
                runtime.ensure_active(run_id)

    def test_get_release_cannot_remove_a_pinned_sse_credential_after_worker_finishes(self):
        self.client.get("/ai/v1/blog-qa/capabilities")
        runtime = self.app.state.blog_qa_runtime
        vault = self.app.state.blog_qa_credential_vault
        from src.core.auth.session import SessionAuthenticator
        subject = SessionAuthenticator(self.app.auth).authenticate(self.token)
        reference = vault.put(subject, self.token)
        run_id, _ = runtime.store.create(1, str(uuid4()), "finished", subject.session_family)
        runtime.store.transition(run_id, "completed")
        vault.pin(reference)
        vault.pin(reference)
        self.assertEqual(self.client.get(f"/ai/v1/blog-qa/runs/{run_id}").status_code, 200)
        self.assertEqual(vault.get(reference), self.token)
        vault.unpin(reference)
        self.assertEqual(vault.get(reference), self.token)
        vault.unpin(reference)
        self.assertIsNone(vault.get(reference))

    def test_redis_admission_failure_is_closed(self):
        self.app.redis.available = False
        self.assertEqual(self.run_question().status_code, 503)
        self.assertEqual(self.app.state.blog_qa_runtime.store.db.execute("SELECT count(*) FROM runs").fetchone()[0], 0)

    def test_concurrent_completed_get_and_get_or_cancel_keep_request_credentials(self):
        run_id, _ = self.latest_run(self.run_question())
        runtime = self.app.state.blog_qa_runtime
        vault = self.app.state.blog_qa_credential_vault
        original = runtime.public_state

        async def requests(second_method):
            entered = threading.Event()
            second_entered = threading.Event()
            first_returned = threading.Event()
            counter_lock = threading.Lock()
            calls = 0
            def controlled_state(current_id):
                nonlocal calls
                with counter_lock:
                    calls += 1
                    position = calls
                if position == 1:
                    entered.set()
                    if not second_entered.wait(5):
                        raise AssertionError("second request did not reach state lookup")
                else:
                    second_entered.set()
                    if not first_returned.wait(5):
                        raise AssertionError("first request did not finish")
                return original(current_id)
            transport = httpx.ASGITransport(app=self.app)
            async with httpx.AsyncClient(transport=transport, base_url="http://127.0.0.1:8032",
                                         cookies={"access_token": self.token}, headers=self.headers) as client:
                with patch.object(runtime, "public_state", controlled_state):
                    first = asyncio.create_task(client.get(f"/ai/v1/blog-qa/runs/{run_id}"))
                    self.assertTrue(await asyncio.to_thread(entered.wait, 5))
                    path = f"/ai/v1/blog-qa/runs/{run_id}" + ("/cancel" if second_method == "POST" else "")
                    second = asyncio.create_task(client.request(second_method, path))
                    try:
                        response = await asyncio.wait_for(first, 10)
                        self.assertEqual(response.status_code, 200)
                        self.assertTrue(vault.pins)
                    finally:
                        first_returned.set()
                    response = await asyncio.wait_for(second, 10)
                    self.assertEqual(response.status_code, 200)
                    self.assertEqual(response.json()["data"]["status"], "completed")
            self.assertFalse(vault.pins)
            self.assertFalse(vault.entries)
        for method in ("GET", "POST"):
            with self.subTest(second_method=method):
                asyncio.run(requests(method))

    def test_asgi_disconnect_releases_credentials_and_runtime_tasks(self):
        self.client.get("/ai/v1/blog-qa/capabilities")
        runtime = self.app.state.blog_qa_runtime
        vault = self.app.state.blog_qa_credential_vault

        async def disconnect_request():
            first_body = asyncio.Event()
            proxy_entered = asyncio.Event()
            runner_cleaned = asyncio.Event()
            proxy_cleaned = asyncio.Event()
            execution_tasks = []
            run_ids = []

            async def proxy(_body):
                try:
                    proxy_entered.set()
                    await asyncio.Event().wait()
                finally:
                    await asyncio.sleep(.01)
                    proxy_cleaned.set()

            async def runner(row, _payload):
                run_ids.append(row["id"])
                execution_tasks.append(asyncio.current_task())
                try:
                    await runtime.model(row["id"], {})
                finally:
                    await asyncio.sleep(.05)
                    runner_cleaned.set()

            runtime.model_proxy = proxy
            runtime.runner = runner
            body = json.dumps({"question": "synthetic disconnect", "idempotency_key": str(uuid4())}).encode()
            received_body = False

            async def receive():
                nonlocal received_body
                if not received_body:
                    received_body = True
                    return {"type": "http.request", "body": body, "more_body": False}
                await first_body.wait()
                await proxy_entered.wait()
                return {"type": "http.disconnect"}

            async def send(message):
                if message["type"] == "http.response.body":
                    first_body.set()

            scope = {
                "type": "http", "asgi": {"version": "3.0", "spec_version": "2.3"},
                "http_version": "1.1", "method": "POST", "scheme": "http",
                "path": "/ai/v1/blog-qa/runs/stream", "raw_path": b"/ai/v1/blog-qa/runs/stream",
                "query_string": b"", "root_path": "", "server": ("127.0.0.1", 8032),
                "client": ("127.0.0.1", 50000), "headers": [
                    (b"host", b"127.0.0.1:8032"), (b"content-type", b"application/json"),
                    (b"origin", b"http://127.0.0.1:3030"),
                    (b"cookie", ("access_token=" + self.token).encode()),
                ],
            }
            try:
                await asyncio.wait_for(self.app(scope, receive, send), 5)
                # Drain only already-started synthetic work, so assertions do not
                # depend on a fixed scheduler delay or hide leaked registry entries.
                await asyncio.wait_for(asyncio.gather(*execution_tasks, return_exceptions=True), 2)
                self.assertFalse(vault.pins, "disconnect leaked a credential pin")
                self.assertFalse(vault.entries, "disconnect retained an access token")
                self.assertFalse(runtime.active, "disconnect retained an active run")
                self.assertFalse(runtime.tasks, "disconnect retained a worker task")
                self.assertFalse(runtime.model_tasks, "disconnect retained model tasks")
                self.assertTrue(runner_cleaned.is_set(), "runner cleanup was interrupted")
                self.assertTrue(proxy_cleaned.is_set(), "model cleanup was interrupted")
                self.assertEqual(len(run_ids), 1)
                self.assertEqual(runtime.store.get(run_ids[0])["status"], "cancelled")
            finally:
                # Keep a failing regression isolated from other tests. This is
                # cleanup after the assertions, never a substitute for disconnect.
                for task in list(runtime.tasks.values()):
                    task.cancel()
                await asyncio.gather(*runtime.tasks.values(), return_exceptions=True)
                runtime.active.clear()
                runtime.tasks.clear()
                runtime.model_tasks.clear()
                vault.clear()

        asyncio.run(disconnect_request())

    def test_idempotency_returns_original_id_and_internal_routes_are_private(self):
        key = uuid4()
        run_id, _ = self.latest_run(self.run_question(key))
        duplicate = self.run_question(key)
        self.assertEqual(duplicate.status_code, 409)
        self.assertEqual(duplicate.json()["data"]["run_id"], run_id)
        self.assertEqual(len(self.app.redis.calls), 1)
        self.assertFalse(any(path.startswith("/internal/agent") for path in self.app.openapi()["paths"]))
        response = self.client.post(f"/internal/agent/v1/runs/{run_id}/receipts", headers={"Host": "public.invalid"},
            json={"call_id": "read", "result_hash": "0" * 64})
        self.assertEqual(response.status_code, 403)

    def test_session_invalidated_during_model_wait_cancels_without_answer(self):
        # Replace the installed callback before lazy initialization.
        async def proxy(_body):
            self.app.auth.revoked.add(self.token)
            await asyncio.sleep(1)
            return {}
        self.app.blog_qa_model_proxy = proxy
        self.client.get("/ai/v1/blog-qa/capabilities")
        runtime = self.app.state.blog_qa_runtime
        async def runner(row, _payload):
            await runtime.model(row["id"], {})
            raise AssertionError("revoked model must not deliver")
        runtime.runner = runner
        _, state = self.latest_run(self.run_question())
        self.assertEqual(state["status"], "cancelled")
        self.assertNotIn("answer", state)


class CredentialAndShutdownTests(unittest.IsolatedAsyncioTestCase):
    def test_vault_capacity_ttl_and_active_reference_protection(self):
        active = set()
        vault = CredentialVault(lambda: active, capacity=2, ttl=60)
        first = vault.put(SimpleNamespace(user_id=1, session_family="first"), "verified-1")
        active.add(first)
        vault.put(SimpleNamespace(user_id=2, session_family="second"), "verified-2")
        vault.put(SimpleNamespace(user_id=3, session_family="third"), "verified-3")
        self.assertEqual(len(vault.entries), 2)
        self.assertEqual(vault.get(first), "verified-1")
        vault.entries[first] = ("verified-1", 0)
        self.assertIsNone(vault.get(first))
        self.assertIn(first, vault.entries)  # An unrelated caller cannot evict an active family.
        active.clear()
        vault.get("missing")
        self.assertNotIn(first, vault.entries)

    async def test_real_application_shutdown_awaits_worker_and_model_cleanup_before_db_close(self):
        from app_instance import Application
        _, tools = create_dataset()
        proxy_entered = asyncio.Event()
        proxy_cleaned = asyncio.Event()
        worker_cleaned = asyncio.Event()
        async def proxy(_body):
            try:
                proxy_entered.set()
                await asyncio.Event().wait()
            finally:
                await asyncio.sleep(.01)
                proxy_cleaned.set()
        async def runner(row, _payload):
            try:
                await runtime.model(row["id"], {})
            finally:
                await asyncio.sleep(.01)
                worker_cleaned.set()
        runtime = Runtime(Store(":memory:"), tools, registry=create_module_registry(), runner=runner, model_proxy=proxy)
        sid = runtime.login(1)
        run_id, _ = runtime.store.create(1, str(uuid4()), "shutdown")
        runtime.start(run_id, sid)
        await proxy_entered.wait()
        order = []
        async def cleanup_ai():
            self.assertTrue(proxy_cleaned.is_set())
            self.assertTrue(worker_cleaned.is_set())
            self.assertFalse(runtime.tasks)
            self.assertFalse(runtime.model_tasks)
            order.append("ai-cleaned-after-worker")
        application = SimpleNamespace(state=SimpleNamespace(blog_qa_runtime=runtime),
                                     _Application__cleanup_ai_manager=cleanup_ai)
        await Application.shut_down(application)
        self.assertEqual(order, ["ai-cleaned-after-worker"])
        import sqlite3
        with self.assertRaises(sqlite3.ProgrammingError):
            runtime.store.db.execute("SELECT 1")


if __name__ == "__main__":
    unittest.main()
