import sys
import unittest
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient


API_ROOT = Path(__file__).resolve().parents[1]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))


class FakeAiService:
    def __init__(self):
        self.providers = []

    async def list_provider_catalog(self):
        return self.providers

    async def create_provider_catalog_entry(self, value):
        from src.modules.ai.schemas import AiProviderCatalog

        provider = AiProviderCatalog(**value.model_dump())
        self.providers.append(provider)
        return provider

    async def update_provider_catalog_entry(self, provider_id, value):
        provider = await self.create_provider_catalog_entry(value)
        self.providers = [item for item in self.providers if item.id != provider_id] + [provider]
        return provider

    async def delete_provider_catalog_entry(self, provider_id):
        self.providers = [item for item in self.providers if item.id != provider_id]


class AdminAiProviderRouterTests(unittest.TestCase):
    def setUp(self):
        from src.routers.admin.admin import get_admin_ai_service, router
        from src.routers.auth.auth import get_current_user

        self.service = FakeAiService()
        app = FastAPI()
        app.include_router(router)
        app.dependency_overrides[get_admin_ai_service] = lambda: self.service
        app.dependency_overrides[get_current_user] = lambda: {
            "id": 1,
            "roles": [{"id": 1, "code": "admin"}],
        }
        self.client = TestClient(app)

    def test_creates_lists_updates_and_deletes_provider_catalog_entries(self):
        payload = {
            "id": "team-provider",
            "name": "Team Provider",
            "default_base_url": "https://team.example.test/v1",
            "default_model": "team-chat",
            "is_enabled": True,
            "sort_order": 10,
        }
        created = self.client.post("/admin/ai/providers", json=payload)
        self.assertEqual(created.status_code, 200)
        self.assertEqual(created.json()["data"]["id"], "team-provider")
        self.assertNotIn("api_key", created.json()["data"])

        listed = self.client.get("/admin/ai/providers")
        self.assertEqual(listed.status_code, 200)
        self.assertEqual(listed.json()["data"][0]["name"], "Team Provider")

        payload["name"] = "Team Provider v2"
        updated = self.client.put("/admin/ai/providers/team-provider", json=payload)
        self.assertEqual(updated.status_code, 200)
        self.assertEqual(updated.json()["data"]["name"], "Team Provider v2")

        deleted = self.client.delete("/admin/ai/providers/team-provider")
        self.assertEqual(deleted.status_code, 200)
        self.assertEqual(self.client.get("/admin/ai/providers").json()["data"], [])


if __name__ == "__main__":
    unittest.main()
