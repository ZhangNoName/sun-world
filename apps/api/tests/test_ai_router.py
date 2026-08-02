import sys
import unittest
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

    async def list_providers(self):
        from src.modules.ai.schemas import AiProviderDescriptor

        return [AiProviderDescriptor(id="deepseek", name="DeepSeek")]

    async def stream_run(self, user_id, request):
        from src.modules.ai.schemas import AiStreamEvent

        self.seen_user_id = user_id
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
        app = FastAPI()
        app.include_router(router)
        app.dependency_overrides[get_ai_service] = lambda: self.service
        app.dependency_overrides[get_optional_ai_user_id] = lambda: None
        self.client = TestClient(app)

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


if __name__ == "__main__":
    unittest.main()
