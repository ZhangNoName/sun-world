import asyncio
import json
import sys
import tempfile
import time
import unittest
from unittest.mock import patch
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

from fastapi import HTTPException
from fastapi.testclient import TestClient
from starlette.requests import Request


ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "apps/api"))
sys.path.insert(0, str(ROOT / "tools/dsh-blog-local"))
from dataset import create_dataset
from src.module_composition import create_module_registry
from runtime import Runtime
from server import create_app, RunInput
from store import Store


async def empty_runner(run, payload):
    return {"answer": "test", "sourceIds": [], "finish": "completed", "session_id": "blog-qa-" + payload["run_id"], "turn_id": "t"}


def call(call_id, **arguments):
    return SimpleNamespace(call_id=call_id, generation=1, tool_version="1", arguments=arguments)


def completed(ids, run_id):
    return {"answer": "引用的答案", "sourceIds": ids, "finish": "completed", "session_id": "blog-qa-" + run_id, "turn_id": "t"}


class BlogQaLocalHttpTests(unittest.TestCase):
    def setUp(self):
        self.app = create_app(database_path=":memory:", runner=empty_runner)
        self.client = TestClient(self.app, base_url="http://127.0.0.1:8011")
        self.headers = {"Origin": "http://127.0.0.1:3031"}

    def test_authentication_origin_host_and_synthetic_session(self):
        self.assertEqual(self.client.get("/local/session").status_code, 401)
        self.assertEqual(self.client.post("/local/session", json={}).status_code, 403)
        self.assertEqual(self.client.post("/local/session", json={}, headers={"Origin": "https://example.invalid"}).status_code, 403)
        self.assertEqual(self.client.get("/healthz", headers={"Host": "public.invalid"}).status_code, 403)
        response = self.client.post("/local/session", json={}, headers=self.headers)
        self.assertEqual(response.status_code, 200)
        self.assertIn("HttpOnly", response.headers["set-cookie"])
        self.assertEqual(self.client.get("/local/session").json()["user_id"], 1)
        self.assertEqual(self.client.get("/local/articles/1").status_code, 200)

    def test_stream_persists_state_and_idempotency_returns_original_run(self):
        self.client.post("/local/session", json={}, headers=self.headers)
        body = {"question": "未命中问题", "idempotency_key": str(uuid4())}
        # Inject a runner which performs an empty public search, without a model fixture.
        async def run(row, payload):
            rt = self.app.state.runtime
            rt.tool(row["id"], "blog.search_public", call("empty", query="zzzz"))
            return completed([], row["id"])
        self.app.state.runtime.runner = run
        response = self.client.post("/ai/v1/blog-qa/runs/stream", json=body, headers=self.headers)
        self.assertEqual(response.status_code, 200)
        events = [json.loads(line[6:]) for line in response.text.splitlines() if line.startswith("data: ")]
        run_id = events[0]["data"]["run_id"]
        self.assertEqual(events[-1]["data"]["answer"], "未找到相关公开文章")
        self.assertEqual(self.client.get(f"/ai/v1/blog-qa/runs/{run_id}").json()["status"], "completed")
        duplicate = self.client.post("/ai/v1/blog-qa/runs/stream", json=body, headers=self.headers)
        self.assertEqual(duplicate.status_code, 409)
        self.assertEqual(duplicate.json()["detail"]["run_id"], run_id)
        self.client.post("/local/session", json={"user_id": 2}, headers=self.headers)
        self.assertEqual(self.client.get(f"/ai/v1/blog-qa/runs/{run_id}").status_code, 404)
        self.assertEqual(self.client.post(f"/ai/v1/blog-qa/runs/{run_id}/cancel", headers=self.headers).status_code, 404)

    def test_logout_http_revokes_current_users_active_run(self):
        self.client.post("/local/session", json={}, headers=self.headers)
        runtime = self.app.state.runtime
        run_id, _ = runtime.store.create(1, str(uuid4()), "logout")
        runtime.active[run_id] = {"sid": self.client.cookies.get("dsh_local_sid"),
                                  "deadline": time.monotonic() + 45, "run_token": "test"}
        self.assertEqual(self.client.delete("/local/session", headers=self.headers).status_code, 200)
        self.assertEqual(runtime.store.get(run_id)["status"], "cancelled")
        self.assertEqual(self.client.get("/local/session").status_code, 401)


class BlogQaLocalRuntimeTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.store = Store(":memory:")
        self.repository, tools = create_dataset()
        self.runtime = Runtime(self.store, tools, registry=create_module_registry(), runner=empty_runner)
        self.sid = self.runtime.login(1)
        self.run_id, _ = self.store.create(1, str(uuid4()), "来源测试")
        self.store.transition(self.run_id, "running")
        self.runtime.active[self.run_id] = {"sid": self.sid, "deadline": time.monotonic() + 45,
                                            "run_token": "test-token"}

    async def asyncTearDown(self):
        self.store.db.close()

    def read(self, article_id=1, call_id="read"):
        return self.runtime.tool(self.run_id, "blog.read_public", call(call_id, article_id=article_id))

    def receipt(self, result):
        self.assertTrue(self.store.receipt(self.run_id, result["call_id"], result["result_hash"]))

    async def test_unread_forged_and_undelivered_citations_fail(self):
        for ids in ([999], [1]):
            with self.assertRaises(HTTPException):
                self.runtime.complete(self.run_id, completed(ids, self.run_id))
        result = self.read()
        with self.assertRaises(HTTPException):
            self.runtime.complete(self.run_id, completed([1], self.run_id))
        self.assertFalse(self.store.receipt(self.run_id, "read", "0" * 64))
        self.receipt(result)
        self.receipt(result)
        self.runtime.complete(self.run_id, completed([1], self.run_id))
        self.assertEqual(self.store.get(self.run_id)["status"], "completed")

    async def test_cancel_aborts_inflight_model_request(self):
        entered = asyncio.Event()
        cancelled = asyncio.Event()
        async def proxy(_body):
            entered.set()
            try:
                await asyncio.Event().wait()
            finally:
                cancelled.set()
        self.runtime.model_proxy = proxy
        task = asyncio.create_task(self.runtime.model(self.run_id, {}))
        await entered.wait()
        await self.runtime.cancel(self.run_id)
        with self.assertRaises(HTTPException):
            await task
        self.assertTrue(cancelled.is_set())

    async def test_changed_source_cannot_complete(self):
        self.receipt(self.read())
        self.repository.articles[1].content += "修改"
        with self.assertRaisesRegex(HTTPException, "source_changed"):
            self.runtime.complete(self.run_id, completed([1], self.run_id))

    async def test_cancel_wins_against_late_result_and_private_calls(self):
        self.receipt(self.read())
        await self.runtime.cancel(self.run_id)
        with self.assertRaises(HTTPException):
            self.runtime.complete(self.run_id, completed([1], self.run_id))
        with self.assertRaises(HTTPException):
            self.runtime.private(self.run_id, "Bearer test-token", self.runtime.service_token)
        self.assertEqual(self.store.get(self.run_id)["status"], "cancelled")

    async def test_logout_revokes_active_run(self):
        await self.runtime.logout(self.sid)
        self.assertEqual(self.store.get(self.run_id)["status"], "cancelled")
        with self.assertRaises(HTTPException):
            self.runtime.user(self.sid)

    async def test_tool_and_model_budgets_and_duplicate_call(self):
        result = self.read()
        self.assertEqual(self.read(), result)
        self.assertEqual(self.store.get(self.run_id)["tool_count"], 1)
        with self.assertRaises(HTTPException):
            self.runtime.tool(self.run_id, "blog.read_public", call("read", article_id=2))
        for index in range(3):
            self.read(call_id=f"r{index}")
        with self.assertRaises(HTTPException):
            self.read(call_id="fifth")
        self.assertTrue(all(self.store.increment_model(self.run_id) for _ in range(4)))
        self.assertFalse(self.store.increment_model(self.run_id))

    async def test_cumulative_64kib_is_a_hard_limit(self):
        self.repository.articles[1].content = "x" * 20000
        for index in range(3):
            self.read(call_id=f"r{index}")
        with self.assertRaisesRegex(HTTPException, "tool_budget_exhausted"):
            self.read(call_id="fourth")
        self.assertLessEqual(self.store.get(self.run_id)["result_bytes"], 65536)

    async def test_private_identity_requires_both_credentials(self):
        for bearer, service in (("Bearer test-token", "bad"), ("Bearer bad", self.runtime.service_token)):
            with self.assertRaises(HTTPException):
                self.runtime.private(self.run_id, bearer, service)

    async def test_restart_interrupts_and_never_replays(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "ledger.sqlite3"
            first = Store(path)
            run_id, _ = first.create(1, "same", "question")
            first.transition(run_id, "running")
            first.db.close()
            second = Store(path)
            self.assertEqual(second.get(run_id)["status"], "interrupted")
            self.assertEqual(second.create(1, "same", "question"), (run_id, "duplicate"))
            second.db.close()

    async def test_session_root_and_plain_text_are_enforced(self):
        self.receipt(self.read())
        for wrong in ("other-session", None, ""):
            result = {**completed([1], self.run_id), "session_id": wrong}
            with self.assertRaises(HTTPException):
                self.runtime.complete(self.run_id, result)
        for answer in ("https://example.invalid", "<b>text</b>", "[text](relative)", "www.example.invalid"):
            result = {**completed([1], self.run_id), "answer": answer}
            with self.assertRaisesRegex(HTTPException, "answer_must_be_plain_text"):
                self.runtime.complete(self.run_id, result)

    async def test_historical_links_hide_changed_or_deleted_articles(self):
        self.receipt(self.read())
        self.runtime.complete(self.run_id, completed([1], self.run_id))
        self.assertEqual(len(self.runtime.public_state(self.run_id)["sources"]), 1)
        original = self.repository.articles[1].content
        self.repository.articles[1].content += "updated"
        self.assertEqual(self.runtime.public_state(self.run_id)["sources"], [])
        self.repository.articles[1].content = original
        del self.repository.articles[1]
        self.assertEqual(self.runtime.public_state(self.run_id)["sources"], [])

    async def test_stream_generator_disconnect_revokes_run(self):
        async def wait_forever(_row, _payload):
            await asyncio.Event().wait()
        app = create_app(database_path=":memory:", runner=wait_forever)
        runtime = app.state.runtime
        sid = runtime.login(1)
        endpoint = next(route.endpoint for route in app.routes
                        if getattr(route, "path", "") == "/ai/v1/blog-qa/runs/stream")
        request = Request({"type": "http", "headers": [(b"cookie", f"dsh_local_sid={sid}".encode())]})
        response = await endpoint(RunInput(question="disconnect", idempotency_key=uuid4()), request)
        first = await anext(response.body_iterator)
        run_id = json.loads(first[6:])["data"]["run_id"]
        tasks = list(runtime.tasks.values())
        await response.body_iterator.aclose()
        await asyncio.gather(*tasks, return_exceptions=True)
        self.assertEqual(runtime.store.get(run_id)["status"], "cancelled")
        self.assertEqual(runtime.store.get(run_id)["error_code"], "client_disconnected")
        runtime.store.db.close()

    async def test_worker_workspace_is_cleaned_even_if_spawn_fails(self):
        with tempfile.TemporaryDirectory() as temp:
            workspace = Path(temp) / "tmp" / ("run-" + self.run_id)
            workspace.mkdir(parents=True)
            (workspace / "partial-state").write_text("synthetic")
            with patch.dict("os.environ", {"DSH_LOCAL_WORKER_DIR": temp, "DSH_LOCAL_NODE": "/usr/bin/false"}):
                with patch("asyncio.create_subprocess_exec", side_effect=OSError("synthetic spawn failure")):
                    with self.assertRaises(OSError):
                        await self.runtime.run_worker({"id": self.run_id}, {})
            self.assertFalse(workspace.exists())


if __name__ == "__main__":
    unittest.main()
