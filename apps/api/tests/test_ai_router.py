import asyncio
import sys
import threading
import unittest
from os import environ
from pathlib import Path
from unittest.mock import patch

from fastapi import FastAPI
from starlette.requests import Request
from fastapi.testclient import TestClient


API_ROOT = Path(__file__).resolve().parents[1]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))


class FakeService:
    def __init__(self):
        self.seen_user_id = "unset"
        self.seen_guest_session_id = None
        self.seen_request = None

    async def list_providers(self):
        from src.modules.ai.schemas import AiProviderDescriptor

        return [AiProviderDescriptor(id="deepseek", name="DeepSeek")]

    async def resolve_run_conversation_id(self, _user_id, request):
        self.event_loop_thread_id = threading.get_ident()
        return request.conversation_id

    async def stream_run(self, user_id, request, *, guest_session_id=None):
        from src.modules.ai.schemas import AiStreamEvent

        self.seen_user_id = user_id
        self.seen_guest_session_id = guest_session_id
        self.seen_request = request
        yield AiStreamEvent(
            event_id="evt-1",
            type="run.started",
            conversation_id="guest-1",
            message_id="msg-1",
            sequence=0,
            data={},
        )
        yield AiStreamEvent(
            event_id="evt-2",
            type="message.completed",
            conversation_id="guest-1",
            message_id="msg-1",
            sequence=1,
            data={"blocks": [{"type": "text", "text": "ok", "format": "markdown"}]},
        )


class FakeAuthenticatedService(FakeService):
    async def save_provider_profile(self, user_id, profile):
        from src.modules.ai.schemas import AiProviderProfile

        self.seen_user_id = user_id
        return AiProviderProfile(
            id="profile-1",
            provider=profile.provider,
            name=profile.name,
            base_url=profile.base_url,
            model=profile.model,
            is_default=profile.is_default,
            has_api_key=False,
        )


class FakeAuth:
    def get_user_from_token(self, _token, check_redis=False):
        return {"id": "2"}


class BrokenAuth:
    def get_user_from_token(self, _token, check_redis=False):
        raise TimeoutError("redis unavailable")


class AiRouterTests(unittest.TestCase):
    def setUp(self):
        from src.modules.ai.router import (
            get_ai_service,
            get_optional_ai_user_id,
            router,
        )

        self.service = FakeService()
        class LeaseRedis:
            def __init__(inner_self):
                inner_self.acquired = 0
                inner_self.released = 0
                inner_self.rate_consumed = 0
                inner_self.acquire_calls = []
                inner_self.release_calls = []
                inner_self.thread_ids = []

            def consume_multi_fixed_window(inner_self, _limits):
                inner_self.thread_ids.append(threading.get_ident())
                inner_self.rate_consumed += 1
                return True, 600

            def get(inner_self, name):
                inner_self.thread_ids.append(threading.get_ident())
                return 1 if name.startswith("ai:run_rate:") else None

            def acquire_bounded_lease(inner_self, **kwargs):
                inner_self.thread_ids.append(threading.get_ident())
                inner_self.acquired += 1
                inner_self.acquire_calls.append(kwargs)
                return True

            def release_bounded_lease(inner_self, **kwargs):
                inner_self.thread_ids.append(threading.get_ident())
                inner_self.released += 1
                inner_self.release_calls.append(kwargs)
                return 1

        self.lease_redis = LeaseRedis()
        self.redis_patch = patch.object(
            __import__("src.modules.ai.router", fromlist=["app"]).app,
            "redis",
            self.lease_redis,
            create=True,
        )
        self.redis_patch.start()
        app = FastAPI()
        app.include_router(router)
        app.dependency_overrides[get_ai_service] = lambda: self.service
        app.dependency_overrides[get_optional_ai_user_id] = lambda: None
        self.client = TestClient(app)

    def tearDown(self):
        self.redis_patch.stop()

    def test_lists_database_providers_without_authentication(self):
        response = self.client.get("/ai/v1/providers")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["data"][0]["id"], "deepseek")

    def test_guest_stream_does_not_forge_a_persistent_user_id(self):
        response = self.client.post("/ai/v1/runs/stream", json={"message": "hello"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.service.seen_user_id, None)
        self.assertIn('"version":"1"', response.text)
        self.assertEqual(response.text.count("data:"), 2)
        self.assertEqual(response.headers["x-ratelimit-remaining"], "19")
        self.assertRegex(self.service.seen_guest_session_id, r"^[A-Za-z0-9_-]{32,128}$")
        self.assertIn("ai_guest_session=", response.headers["set-cookie"])
        self.assertIn("HttpOnly", response.headers["set-cookie"])
        self.assertEqual(self.lease_redis.acquired, 1)
        self.assertEqual(self.lease_redis.released, 1)
        self.assertEqual(self.lease_redis.rate_consumed, 1)
        self.assertTrue(self.lease_redis.thread_ids)
        self.assertTrue(
            all(
                thread_id != self.service.event_loop_thread_id
                for thread_id in self.lease_redis.thread_ids
            )
        )

    def test_invalid_body_never_acquires_a_concurrency_lease(self):
        response = self.client.post("/ai/v1/runs/stream", json={})

        self.assertEqual(response.status_code, 422)
        self.assertEqual(self.lease_redis.rate_consumed, 0)
        self.assertEqual(self.lease_redis.acquired, 0)
        self.assertEqual(self.lease_redis.released, 0)

    def test_global_concurrency_lease_ttl_cannot_expire_before_provider_deadline(self):
        from fastapi import HTTPException
        from src.modules.ai import router as ai_router

        with patch.dict(
            environ,
            {"AI_RUN_CONCURRENCY_TTL_SECONDS": "179"},
        ):
            with self.assertRaises(HTTPException) as caught:
                ai_router.acquire_ai_run_lease()

        self.assertEqual(caught.exception.status_code, 503)
        self.assertEqual(
            caught.exception.detail["code"],
            "AI_RATE_LIMIT_CONFIGURATION_INVALID",
        )
        self.assertEqual(self.lease_redis.acquired, 0)

    def test_existing_conversation_uses_a_hashed_distributed_run_lease(self):
        response = self.client.post(
            "/ai/v1/runs/stream",
            json={"conversation_id": "private-conversation", "message": "hello"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.lease_redis.acquired, 2)
        conversation_call = self.lease_redis.acquire_calls[1]
        self.assertTrue(conversation_call["name"].startswith("ai:conversation_run:"))
        self.assertNotIn("private-conversation", conversation_call["name"])
        self.assertEqual(conversation_call["limit"], 1)
        self.assertGreaterEqual(conversation_call["ttl"], 240)
        self.assertEqual(self.lease_redis.released, 2)
        self.assertEqual(
            self.lease_redis.release_calls[0]["name"],
            conversation_call["name"],
        )
        self.assertTrue(
            all(
                thread_id != self.service.event_loop_thread_id
                for thread_id in self.lease_redis.thread_ids
            )
        )

    def test_overlapping_conversation_run_returns_standard_failed_event(self):
        original_acquire = self.lease_redis.acquire_bounded_lease

        def reject_conversation(**kwargs):
            if kwargs["name"].startswith("ai:conversation_run:"):
                self.lease_redis.acquired += 1
                self.lease_redis.acquire_calls.append(kwargs)
                return False
            return original_acquire(**kwargs)

        self.lease_redis.acquire_bounded_lease = reject_conversation
        response = self.client.post(
            "/ai/v1/runs/stream",
            json={"conversation_id": "conv-busy", "message": "hello"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertIn('"type":"run.failed"', response.text)
        self.assertIn('"code":"AI_CONVERSATION_BUSY"', response.text)
        self.assertEqual(self.service.seen_user_id, "unset")
        self.assertEqual(self.lease_redis.released, 1)
        self.assertEqual(self.lease_redis.release_calls[0]["name"], "ai:run_concurrency")

    def test_parent_regeneration_lease_uses_server_resolved_conversation(self):
        from src.modules.ai import router as ai_router

        class ResolvingService(FakeService):
            async def resolve_run_conversation_id(self, _user_id, _request):
                return "server-owned-conversation"

        self.service = ResolvingService()
        self.client.app.dependency_overrides[ai_router.get_ai_service] = (
            lambda: self.service
        )
        self.client.app.dependency_overrides[ai_router.get_optional_ai_user_id] = (
            lambda: 7
        )

        response = self.client.post(
            "/ai/v1/runs/stream",
            json={
                "conversation_id": "client-tampered-conversation",
                "parent_message_id": "parent-one",
                "message": "retry",
            },
        )

        self.assertEqual(response.status_code, 200)
        conversation_call = self.lease_redis.acquire_calls[1]
        expected_name = ai_router.ai_conversation_lease_name(
            "server-owned-conversation",
            7,
            None,
        )
        self.assertEqual(conversation_call["name"], expected_name)
        self.assertEqual(
            self.service.seen_request.conversation_id,
            "server-owned-conversation",
        )
        self.assertNotIn("client-tampered-conversation", conversation_call["name"])

    def test_parent_conversation_mismatch_returns_failed_before_lock_or_stream(self):
        from src.modules.ai import router as ai_router
        from src.modules.ai.errors import AiDomainError

        class RejectingService(FakeService):
            async def resolve_run_conversation_id(self, _user_id, _request):
                raise AiDomainError(
                    "AI_CONVERSATION_MISMATCH",
                    "Parent mismatch.",
                    status_code=409,
                )

        self.service = RejectingService()
        self.client.app.dependency_overrides[ai_router.get_ai_service] = (
            lambda: self.service
        )
        self.client.app.dependency_overrides[ai_router.get_optional_ai_user_id] = (
            lambda: 7
        )

        response = self.client.post(
            "/ai/v1/runs/stream",
            json={
                "conversation_id": "fake",
                "parent_message_id": "parent",
                "message": "retry",
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertIn('"code":"AI_CONVERSATION_MISMATCH"', response.text)
        self.assertEqual(self.service.seen_user_id, "unset")
        self.assertEqual(self.lease_redis.acquired, 1)
        self.assertEqual(self.lease_redis.released, 1)

    def test_rate_limit_uses_hashed_guest_principal_and_fails_closed(self):
        from fastapi import HTTPException
        from src.modules.ai import router as ai_router

        class RateRedis:
            def __init__(self, result, counts=None):
                self.result = result
                self.calls = []
                self.counts = counts or {}

            def consume_multi_fixed_window(self, limits):
                self.calls.append(limits)
                return self.result

            def get(self, name):
                return self.counts.get(name, 0)

        request = Request(
            {
                "type": "http",
                "method": "POST",
                "path": "/ai/v1/runs/stream",
                "headers": [],
                "client": ("203.0.113.10", 1234),
            }
        )
        redis = RateRedis((True, 55))
        with patch.object(ai_router.app, "redis", redis, create=True):
            decision = ai_router.enforce_ai_run_rate_limit(request, user_id=None)

        self.assertEqual(decision.remaining, 20)
        self.assertNotIn("203.0.113.10", str(redis.calls[0]))
        self.assertEqual(len(redis.calls[0]), 5)
        self.assertIn(("ai:run_daily:guest_global", 500, 86_400), redis.calls[0])
        self.assertIn(("ai:run_daily:global", 2_000, 86_400), redis.calls[0])

        principal_key = redis.calls[0][0][0]
        blocked = RateRedis((False, 44), {principal_key: 20})
        with patch.object(ai_router.app, "redis", blocked, create=True):
            with self.assertRaises(HTTPException) as caught:
                ai_router.enforce_ai_run_rate_limit(request, user_id=None)
        self.assertEqual(caught.exception.status_code, 429)
        self.assertEqual(caught.exception.detail["code"], "AI_RATE_LIMITED")
        self.assertEqual(caught.exception.headers["Retry-After"], "44")

        global_blocked = RateRedis(
            (False, 33),
            {principal_key: 1, "ai:run_rate:global": 200},
        )
        with patch.object(ai_router.app, "redis", global_blocked, create=True):
            with self.assertRaises(HTTPException) as caught:
                ai_router.enforce_ai_run_rate_limit(request, user_id=None)
        self.assertEqual(caught.exception.status_code, 503)
        self.assertEqual(
            caught.exception.detail["code"],
            "AI_GLOBAL_BUDGET_EXHAUSTED",
        )

        daily_blocked = RateRedis(
            (False, 32_000),
            {
                principal_key: 1,
                "ai:run_rate:global": 1,
                "ai:run_daily:guest_global": 500,
            },
        )
        with patch.object(ai_router.app, "redis", daily_blocked, create=True):
            with self.assertRaises(HTTPException) as caught:
                ai_router.enforce_ai_run_rate_limit(request, user_id=None)
        self.assertEqual(caught.exception.status_code, 503)
        self.assertEqual(
            caught.exception.detail["code"],
            "AI_DAILY_BUDGET_EXHAUSTED",
        )
        self.assertEqual(caught.exception.headers["Retry-After"], "32000")

    def test_optional_auth_downgrades_redis_failures_to_guest_access(self):
        from src.modules.ai import router as ai_router

        request = Request(
            {
                "type": "http",
                "method": "POST",
                "path": "/ai/v1/runs/stream",
                "headers": [(b"cookie", b"access_token=stale-token")],
            }
        )
        with patch.object(ai_router.app, "auth", BrokenAuth(), create=True):
            self.assertIsNone(ai_router.get_optional_ai_user_id(request))

    def test_saves_provider_profile_for_a_dict_backed_authenticated_user(self):
        from src.modules.ai import router as ai_router

        self.service = FakeAuthenticatedService()
        self.client.app.dependency_overrides[ai_router.get_ai_service] = (
            lambda: self.service
        )
        self.client.app.dependency_overrides.pop(ai_router.get_optional_ai_user_id)

        with patch.object(ai_router.app, "auth", FakeAuth(), create=True):
            response = self.client.post(
                "/ai/v1/provider-profiles",
                headers={"Cookie": "access_token=test-token"},
                json={
                    "provider": "deepseek",
                    "name": "DeepSeek",
                    "base_url": "https://api.deepseek.com",
                    "model": "deepseek-chat",
                    "is_default": True,
                },
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.service.seen_user_id, 2)
        self.assertEqual(response.json()["data"]["id"], "profile-1")


class AiRouterCleanupTests(unittest.IsolatedAsyncioTestCase):
    async def test_redis_cleanup_finishes_before_cancellation_propagates(self):
        from src.modules.ai import router as ai_router

        release_started = threading.Event()
        allow_release = threading.Event()
        release_finished = threading.Event()

        def slow_release():
            release_started.set()
            allow_release.wait(timeout=2)
            release_finished.set()

        task = asyncio.create_task(ai_router._await_sync_cleanup(slow_release))
        for _attempt in range(100):
            if release_started.is_set():
                break
            await asyncio.sleep(0.01)
        self.assertTrue(release_started.is_set())
        task.cancel()
        await asyncio.sleep(0)

        self.assertFalse(task.done())
        allow_release.set()
        with self.assertRaises(asyncio.CancelledError):
            await task
        self.assertTrue(release_finished.is_set())


if __name__ == "__main__":
    unittest.main()
