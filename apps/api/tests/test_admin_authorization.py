import sys
import unittest
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient


API_ROOT = Path(__file__).resolve().parents[1]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))


class FakeService:
    async def list_provider_catalog(self):
        return []


class AdminAuthorizationTests(unittest.TestCase):
    def test_authenticated_non_admin_cannot_read_admin_provider_catalog(self):
        from src.routers.admin.admin import get_admin_ai_service, router
        from src.routers.auth.auth import get_current_user

        app = FastAPI()
        app.include_router(router)
        app.dependency_overrides[get_admin_ai_service] = lambda: FakeService()
        app.dependency_overrides[get_current_user] = lambda: {
            "id": 13,
            "roles": [{"id": 2, "code": "normal"}],
        }

        response = TestClient(app).get("/admin/ai/providers")

        self.assertEqual(response.status_code, 403)


if __name__ == "__main__":
    unittest.main()
