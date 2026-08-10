import sys
import unittest
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient


API_ROOT = Path(__file__).resolve().parents[1]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))


USER_PAYLOAD = {
    "username": "managed-user",
    "name": "Managed User",
    "sex": 0,
    "age": 18,
    "phone": "",
    "email": "managed@example.com",
    "password": "not-persisted-by-this-test",
    "birth_day": "2000-01-01",
}

ROLE_PAYLOAD = {"name": "Editor", "code": "editor", "description": ""}
RESOURCE_PAYLOAD = {
    "name": "Posts",
    "code": "posts",
    "type": "api",
    "path": "/blogs",
    "description": "",
}


class ManagementAuthorizationTests(unittest.TestCase):
    def _client(self, actor):
        from src.routers.auth.auth import get_current_user
        from src.routers.file.file import get_file_manager, router as file_router
        from src.routers.resource.resource import (
            get_resource_manager,
            resource_router,
        )
        from src.routers.role.role import get_role_manager, router as role_router
        from src.routers.user.user import get_user_manager, router as user_router

        app = FastAPI()
        app.include_router(user_router)
        app.include_router(role_router)
        app.include_router(resource_router)
        app.include_router(file_router)

        if actor is None:

            def reject_anonymous():
                raise HTTPException(status_code=401, detail="authentication required")

            app.dependency_overrides[get_current_user] = reject_anonymous
        else:
            app.dependency_overrides[get_current_user] = lambda: actor

        inert_manager = object()
        app.dependency_overrides[get_user_manager] = lambda: inert_manager
        app.dependency_overrides[get_role_manager] = lambda: inert_manager
        app.dependency_overrides[get_resource_manager] = lambda: inert_manager
        app.dependency_overrides[get_file_manager] = lambda: inert_manager
        return TestClient(app, raise_server_exceptions=False)

    def _management_requests(self):
        return [
            ("post", "/user/", {"json": USER_PAYLOAD}),
            ("get", "/user/", {}),
            ("get", "/user/42", {}),
            ("delete", "/user/42", {}),
            ("post", "/role/", {"json": ROLE_PAYLOAD}),
            ("get", "/role/", {}),
            ("get", "/role/1", {}),
            ("put", "/role/1", {"json": ROLE_PAYLOAD}),
            ("delete", "/role/1", {}),
            ("post", "/role/1/bind_resources", {"json": {"resource_ids": [1]}}),
            ("post", "/resource/", {"json": RESOURCE_PAYLOAD}),
            ("get", "/resource/", {}),
            ("get", "/resource/1", {}),
            ("put", "/resource/1", {"json": RESOURCE_PAYLOAD}),
            ("delete", "/resource/1", {}),
            (
                "post",
                "/file/image/upload",
                {"files": {"file": ("image.png", b"not-an-image", "image/png")}},
            ),
            (
                "post",
                "/file/video/upload",
                {"files": {"file": ("video.mp4", b"not-a-video", "video/mp4")}},
            ),
        ]

    def test_management_routes_reject_anonymous_users(self):
        client = self._client(None)

        for method, path, kwargs in self._management_requests():
            with self.subTest(method=method, path=path):
                response = client.request(method, path, **kwargs)
                self.assertEqual(response.status_code, 401)

    def test_management_routes_reject_authenticated_non_admin_users(self):
        client = self._client({"id": 13, "roles": [{"code": "normal"}]})

        for method, path, kwargs in self._management_requests():
            with self.subTest(method=method, path=path):
                response = client.request(method, path, **kwargs)
                self.assertEqual(response.status_code, 403)


if __name__ == "__main__":
    unittest.main()
