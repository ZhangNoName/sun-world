import sys
import unittest
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient


API_ROOT = Path(__file__).resolve().parents[1]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))


class ManagementBoundaryTests(unittest.TestCase):
    def test_update_managers_reject_empty_and_unknown_fields(self):
        from src.controller.resource_manager import ResourceManager
        from src.controller.role_manager import RoleManager
        from src.controller.user_manage import UserManager

        for manager, unknown in (
            (RoleManager(object()), {"is_admin": True}),
            (ResourceManager(object()), {"owner_id": 2}),
            (UserManager(object()), {"is_admin": True}),
        ):
            with self.subTest(manager=type(manager).__name__, case="empty"):
                with self.assertRaises(ValueError):
                    manager.update_role(1) if isinstance(manager, RoleManager) else (
                        manager.update_resource(1)
                        if isinstance(manager, ResourceManager)
                        else manager.update_user("1")
                    )
            with self.subTest(manager=type(manager).__name__, case="unknown"):
                with self.assertRaises(ValueError):
                    if isinstance(manager, RoleManager):
                        manager.update_role(1, **unknown)
                    elif isinstance(manager, ResourceManager):
                        manager.update_resource(1, **unknown)
                    else:
                        manager.update_user("1", **unknown)

    def test_role_list_batches_resource_relations(self):
        from src.controller.role_manager import RoleManager

        class Db:
            def __init__(self):
                self.calls = []

            def fetch_all(self, sql, params):
                self.calls.append((sql, params))
                if "FROM roles" in sql:
                    return [{"id": 1}, {"id": 2}]
                return [
                    {"role_id": 1, "resource_id": 10},
                    {"role_id": 1, "resource_id": 11},
                ]

        db = Db()
        roles = RoleManager(db).get_roles_with_resources()

        self.assertEqual(len(db.calls), 2)
        self.assertEqual(roles[0]["resource_ids"], [10, 11])
        self.assertEqual(roles[1]["resource_ids"], [])

    def test_partial_updates_are_optional_but_empty_payloads_are_rejected(self):
        from src.routers.auth.auth import get_current_user
        from src.routers.resource.resource import (
            get_resource_manager,
            resource_router,
        )
        from src.routers.role.role import get_role_manager, router as role_router

        app = FastAPI()
        app.include_router(role_router)
        app.include_router(resource_router)
        app.dependency_overrides[get_current_user] = lambda: {
            "id": 1,
            "roles": [{"code": "admin"}],
        }
        app.dependency_overrides[get_role_manager] = lambda: object()
        app.dependency_overrides[get_resource_manager] = lambda: object()
        client = TestClient(app, raise_server_exceptions=False)

        self.assertEqual(client.put("/role/1", json={}).status_code, 422)
        self.assertEqual(client.put("/resource/1", json={}).status_code, 422)
        self.assertEqual(client.get("/role/?page_size=101").status_code, 422)
        self.assertEqual(client.get("/resource/?page=0").status_code, 422)


if __name__ == "__main__":
    unittest.main()
