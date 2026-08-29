import sys
import unittest
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient


API_ROOT = Path(__file__).resolve().parents[1]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))


class UserPaginationTests(unittest.TestCase):
    def test_manager_batches_role_and_resource_lookups(self):
        from src.controller.user_manage import UserManager

        class Db:
            def __init__(self):
                self.fetch_all_calls = []

            def fetch_all(self, sql, params):
                self.fetch_all_calls.append((sql, params))
                if "FROM users" in sql:
                    return [
                        {"id": 1, "name": "One"},
                        {"id": 2, "name": "Two"},
                    ]
                if "FROM roles" in sql:
                    return [{"user_id": 1, "id": 8, "name": "Admin", "code": "admin"}]
                return [
                    {
                        "user_id": 2,
                        "id": 9,
                        "name": "Posts",
                        "code": "posts",
                        "type": "api",
                        "path": "/blogs",
                    }
                ]

        db = Db()
        users = UserManager(db).get_user_by_name("", page=2, per_page=2)

        self.assertEqual(len(db.fetch_all_calls), 3)
        self.assertEqual(db.fetch_all_calls[0][1], ("%%", 2, 2))
        self.assertEqual(users[0]["roles"][0]["code"], "admin")
        self.assertEqual(users[0]["resources"], [])
        self.assertEqual(users[1]["roles"], [])
        self.assertEqual(users[1]["resources"][0]["code"], "posts")

    def test_endpoint_returns_database_total_and_bounds_page_size(self):
        from src.routers.auth.auth import get_current_user
        from src.routers.user.user import get_user_manager, router

        class Manager:
            def get_user_by_name(self, _name, _page, _page_size):
                return []

            def count_users_by_name(self, _name):
                return 24

        app = FastAPI()
        app.include_router(router)
        app.dependency_overrides[get_current_user] = lambda: {
            "id": 1,
            "roles": [{"code": "admin"}],
        }
        app.dependency_overrides[get_user_manager] = Manager
        client = TestClient(app)

        response = client.get("/user/?page=3&page_size=10")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["data"]["total"], 24)

        invalid = client.get("/user/?page=0&page_size=101")
        self.assertEqual(invalid.status_code, 422)


if __name__ == "__main__":
    unittest.main()
