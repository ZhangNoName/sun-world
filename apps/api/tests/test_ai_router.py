import sys
import unittest
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient


API_ROOT = Path(__file__).resolve().parents[1]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))


class FakeService:
    def __init__(self):
        self.seen_user_id = "unset"

    def list_providers(self):
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

    def test_lists_builtin_providers_without_authentication(self):
        response = self.client.get("/ai/v1/providers")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["data"][0]["id"], "deepseek")

    def test_guest_stream_does_not_forge_a_persistent_user_id(self):
        response = self.client.post("/ai/v1/runs/stream", json={"message": "hello"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.service.seen_user_id, None)
        self.assertIn('"version":"1"', response.text)
        self.assertEqual(response.text.count("data:"), 2)


if __name__ == "__main__":
    unittest.main()
