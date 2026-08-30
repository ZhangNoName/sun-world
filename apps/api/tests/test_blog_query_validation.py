import sys
import unittest
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient


API_ROOT = Path(__file__).resolve().parents[1]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))


class BlogQueryValidationTests(unittest.TestCase):
    def test_list_query_rejects_unbounded_or_unknown_values(self):
        from src.routers.blog.blog import get_blog_manager, router

        app = FastAPI()
        app.include_router(router)
        app.dependency_overrides[get_blog_manager] = lambda: object()
        client = TestClient(app, raise_server_exceptions=False)

        for query in (
            "page=0",
            "pageSize=101",
            "sortBy=content",
            "sortOrder=sideways",
            f"keyword={'x' * 201}",
        ):
            with self.subTest(query=query):
                response = client.get(f"/blogs/?{query}")
                self.assertEqual(response.status_code, 422)


if __name__ == "__main__":
    unittest.main()
