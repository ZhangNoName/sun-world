import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient


API_ROOT = Path(__file__).resolve().parents[1]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))


class FakeAuth:
    access_token_expire_minutes = 10

    def __init__(self):
        from src.type.auth_type import TokenModel

        now = datetime.now(timezone.utc)
        self.tokens = TokenModel(
            access_token="access-token",
            refresh_token="refresh-token",
            access_token_expire=now + timedelta(minutes=10),
            refresh_token_expire=now + timedelta(days=1),
        )

    def authenticate_user(self, *_args):
        return self.tokens

    def refresh_access_token(self, _token):
        return self.tokens

    def logout(self, *_args, **_kwargs):
        return True


class AuthRouterTests(unittest.TestCase):
    def setUp(self):
        from src.routers.auth.auth import get_auth_manager, get_current_user, router

        self.app = FastAPI()
        self.app.include_router(router)
        self.app.dependency_overrides[get_auth_manager] = lambda: FakeAuth()
        self.app.dependency_overrides[get_current_user] = lambda: {"id": 2}
        self.client = TestClient(self.app)

    def test_login_sets_refresh_token_cookie_alongside_access_and_device_cookies(self):
        response = self.client.post(
            "/auth/login",
            json={"username": "admin", "password": "secret"},
        )

        self.assertEqual(response.status_code, 200)
        set_cookie = response.headers.get("set-cookie", "")
        self.assertIn("access_token=access-token", set_cookie)
        self.assertIn("refresh_token=refresh-token", set_cookie)
        self.assertIn("device_id=", set_cookie)

    def test_refresh_sets_rotated_refresh_token_cookie(self):
        response = self.client.post(
            "/auth/refresh_token",
            headers={"refresh-token": "refresh-token"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertIn("refresh_token=refresh-token", response.headers.get("set-cookie", ""))

    def test_auth_cookie_settings_do_not_use_secure_cookie_for_plain_http_local_requests(self):
        from app_instance import app
        from src.routers.auth.auth import get_cookie_settings

        request = self.client.build_request("POST", "/auth/login")
        previous_config = getattr(app, "config", {})
        app.config = {"auth": {"cookie_secure": True, "cookie_samesite": "none"}}
        try:
            settings = get_cookie_settings(request)
        finally:
            app.config = previous_config

        self.assertFalse(settings["secure"])
        self.assertEqual(settings["samesite"], "lax")


if __name__ == "__main__":
    unittest.main()
