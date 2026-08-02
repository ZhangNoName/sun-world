import sys
import unittest
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient


API_ROOT = Path(__file__).resolve().parents[1]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))


class BlogAuthorizationTests(unittest.TestCase):
    def test_normal_user_cannot_create_blog(self):
        from src.routers.auth.auth import get_current_user
        from src.routers.blog.blog import get_blog_manager, router

        app = FastAPI()
        app.include_router(router)
        app.dependency_overrides[get_current_user] = lambda: {
            "id": 13,
            "roles": [{"code": "normal"}],
        }
        app.dependency_overrides[get_blog_manager] = lambda: object()

        response = TestClient(app).post(
            "/blogs/",
            json={
                "title": "x",
                "abstract": "x",
                "content": "x",
                "tag": [],
                "category": 1,
            },
        )

        self.assertEqual(response.status_code, 403)

    def test_normal_user_cannot_update_blog(self):
        from src.routers.auth.auth import get_current_user
        from src.routers.blog.blog import get_blog_manager, router

        app = FastAPI()
        app.include_router(router)
        app.dependency_overrides[get_current_user] = lambda: {
            "id": 13,
            "roles": [{"code": "normal"}],
        }
        app.dependency_overrides[get_blog_manager] = lambda: object()

        response = TestClient(app).put(
            "/blogs/42",
            json={
                "title": "x",
                "abstract": "x",
                "content": "x",
                "tag": [],
                "category": 1,
            },
        )

        self.assertEqual(response.status_code, 403)


if __name__ == "__main__":
    unittest.main()
