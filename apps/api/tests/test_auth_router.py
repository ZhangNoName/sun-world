import os
import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient


API_ROOT = Path(__file__).resolve().parents[1]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))

TEST_DEVICE_ID = "11111111-1111-4111-8111-111111111111"
FORGED_DEVICE_COOKIE = "22222222-2222-4222-8222-222222222222"


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
        self.logout_calls = []
        self.refresh_calls = []
        self.rate_limit_calls = []
        self.db = self

    def consume_multi_fixed_window(self, rules):
        self.rate_limit_calls.append(rules)
        return True, 60

    def authenticate_user(self, *_args):
        return self.tokens

    def get_refresh_token_context(self, token):
        return ("2", TEST_DEVICE_ID) if token == "refresh-token" else None

    def refresh_access_token(self, token):
        self.refresh_calls.append(token)
        return self.tokens

    def logout(self, token, **_kwargs):
        self.logout_calls.append(token)
        return True


class FailingLogoutAuth(FakeAuth):
    def logout(self, token, **_kwargs):
        self.logout_calls.append(token)
        return False


class RateLimitedAuth(FakeAuth):
    def consume_multi_fixed_window(self, _rules):
        return False, 37


class AuthRouterTests(unittest.TestCase):
    def setUp(self):
        from src.routers.auth.auth import get_auth_manager, get_current_user, router

        self.fake_auth = FakeAuth()
        self.app = FastAPI()
        self.app.include_router(router)
        self.app.dependency_overrides[get_auth_manager] = lambda: self.fake_auth
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
        self.assertNotIn("refresh_token", response.json()["data"])
        self.assertIn("access_token_expire", response.json()["data"])

    def test_login_rate_limit_returns_retry_after_without_running_password_hash(self):
        from src.routers.auth.auth import get_auth_manager

        limited = RateLimitedAuth()
        limited.authenticate_user = lambda *_args: self.fail(
            "password verification must not run"
        )
        self.app.dependency_overrides[get_auth_manager] = lambda: limited

        response = self.client.post(
            "/auth/login",
            json={"username": "admin", "password": "secret"},
        )

        self.assertEqual(response.status_code, 429)
        self.assertEqual(response.headers["retry-after"], "37")

    def test_login_rate_key_uses_the_same_canonical_identifier_as_lookup(self):
        upper = self.client.post(
            "/auth/login",
            json={"username": "ADMIN", "password": "secret"},
        )
        upper_rules = self.fake_auth.rate_limit_calls[-1]
        lower = self.client.post(
            "/auth/login",
            json={"username": "admin", "password": "secret"},
        )
        lower_rules = self.fake_auth.rate_limit_calls[-1]

        self.assertEqual(upper.status_code, 200)
        self.assertEqual(lower.status_code, 200)
        self.assertEqual(upper_rules[1][0], lower_rules[1][0])

    def test_login_rejects_username_unicode_outside_registration_contract(self):
        response = self.client.post(
            "/auth/login",
            json={"username": "Ádmin", "password": "secret"},
        )

        self.assertEqual(response.status_code, 422)
        self.assertEqual(self.fake_auth.rate_limit_calls, [])

    def test_auth_payloads_have_strict_length_bounds(self):
        too_long_login = self.client.post(
            "/auth/login",
            json={"username": "a" * 256, "password": "secret"},
        )
        short_registration = self.client.post(
            "/auth/register",
            json={"name": "new-user", "password": "short"},
        )

        self.assertEqual(too_long_login.status_code, 422)
        self.assertEqual(short_registration.status_code, 422)

    def test_registration_rejects_contact_shaped_or_unsafe_usernames(self):
        for username in (
            "victim@example.com",
            "13800138000",
            "+14155552671",
            "name with spaces",
        ):
            with self.subTest(username=username):
                response = self.client.post(
                    "/auth/register",
                    json={"name": username, "password": "secret123"},
                )
                self.assertEqual(response.status_code, 422)

    def test_refresh_sets_rotated_refresh_token_cookie(self):
        self.client.cookies.set("device_id", FORGED_DEVICE_COOKIE)
        response = self.client.post(
            "/auth/refresh_token",
            headers={"refresh-token": "refresh-token"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertIn("refresh_token=refresh-token", response.headers.get("set-cookie", ""))
        issued_device_cookie = next(
            value
            for value in response.headers.get_list("set-cookie")
            if value.startswith(f"device_id={TEST_DEVICE_ID}")
        )
        self.assertIn("HttpOnly", issued_device_cookie)
        self.assertNotIn(FORGED_DEVICE_COOKIE, issued_device_cookie)
        rule_names = [rule[0] for rule in self.fake_auth.rate_limit_calls[-1]]
        from src.routers.auth.auth import _opaque_rate_key

        self.assertIn(
            f"auth:refresh:device:{_opaque_rate_key(TEST_DEVICE_ID)}",
            rule_names,
        )
        self.assertNotIn(
            f"auth:refresh:device:{_opaque_rate_key(FORGED_DEVICE_COOKIE)}",
            rule_names,
        )
        self.assertIn(
            f"auth:refresh:user:{_opaque_rate_key('2')}",
            rule_names,
        )
        self.assertIn("auth:refresh:global", rule_names)

    def test_invalid_refresh_token_is_not_bucketed_by_mutable_device_cookie(self):
        self.client.cookies.set("device_id", FORGED_DEVICE_COOKIE)

        response = self.client.post(
            "/auth/refresh_token",
            headers={"refresh-token": "not-a-signed-refresh"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["code"], "AUTH_TOKEN_EXPIRED")
        self.assertEqual(self.fake_auth.refresh_calls, [])
        rule_names = [rule[0] for rule in self.fake_auth.rate_limit_calls[-1]]
        self.assertIn("auth:refresh:global", rule_names)
        self.assertIn("auth:refresh:invalid:global", rule_names)
        self.assertFalse(any(":device:" in name for name in rule_names))
        self.assertFalse(any(":user:" in name for name in rule_names))

    def test_refresh_rate_window_rejects_unsafe_configuration_bounds(self):
        with patch.dict(
            os.environ,
            {"AUTH_REFRESH_RATE_WINDOW_SECONDS": "59"},
            clear=False,
        ):
            response = self.client.post(
                "/auth/refresh_token",
                headers={"refresh-token": "refresh-token"},
            )

        self.assertEqual(response.status_code, 503)
        self.assertEqual(
            response.json()["detail"]["code"],
            "AUTH_RATE_LIMIT_CONFIGURATION_INVALID",
        )
        self.assertEqual(self.fake_auth.refresh_calls, [])

    def test_logout_prefers_refresh_cookie_and_does_not_refresh_the_session_first(self):
        self.client.cookies.set("access_token", "expired-access")
        self.client.cookies.set("refresh_token", "active-refresh")

        response = self.client.post("/auth/logout")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            self.fake_auth.logout_calls,
            ["active-refresh", "expired-access"],
        )
        set_cookie = " ".join(response.headers.get_list("set-cookie"))
        self.assertIn("refresh_token=", set_cookie)
        self.assertIn("Max-Age=0", set_cookie)

    def test_logout_failure_still_clears_browser_credentials_on_final_response(self):
        from src.routers.auth.auth import get_auth_manager

        failing_auth = FailingLogoutAuth()
        self.app.dependency_overrides[get_auth_manager] = lambda: failing_auth
        self.client.cookies.set("access_token", "active-access")
        self.client.cookies.set("refresh_token", "active-refresh")

        response = self.client.post("/auth/logout")

        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["code"], "AUTH_LOGOUT_FAILED")
        set_cookie = " ".join(response.headers.get_list("set-cookie"))
        self.assertIn("access_token=", set_cookie)
        self.assertIn("refresh_token=", set_cookie)
        self.assertIn("Max-Age=0", set_cookie)

    def test_auth_cookie_settings_do_not_use_secure_cookie_for_plain_http_local_requests(self):
        from app_instance import app
        from src.routers.auth.auth import get_cookie_settings

        request = self.client.build_request("POST", "/auth/login")
        previous_config = getattr(app, "config", {})
        app.config = {"auth": {"cookie_secure": True, "cookie_samesite": "none"}}
        try:
            with patch.dict(
                os.environ,
                {"ENV": "local", "BLOG_RUNTIME_ENV": "local"},
                clear=False,
            ):
                settings = get_cookie_settings(request)
        finally:
            app.config = previous_config

        self.assertFalse(settings["secure"])
        self.assertEqual(settings["samesite"], "lax")

    def test_production_runtime_ignores_insecure_yaml_cookie_overrides(self):
        from app_instance import app
        from src.routers.auth.auth import get_cookie_settings

        request = self.client.build_request("POST", "/auth/login")
        previous_config = getattr(app, "config", {})
        app.config = {
            "auth": {"cookie_secure": False, "cookie_samesite": "lax"}
        }
        try:
            with patch.dict(
                os.environ,
                {"ENV": "local", "BLOG_RUNTIME_ENV": "production"},
                clear=False,
            ):
                settings = get_cookie_settings(request)
                response = self.client.post(
                    "/auth/login",
                    json={"username": "admin", "password": "secret"},
                )
        finally:
            app.config = previous_config

        self.assertTrue(settings["secure"])
        self.assertEqual(settings["samesite"], "none")
        self.assertEqual(response.status_code, 200)
        issued_cookies = [
            value
            for value in response.headers.get_list("set-cookie")
            if "Max-Age=0" not in value
        ]
        self.assertEqual(len(issued_cookies), 5)
        for cookie in issued_cookies:
            self.assertIn("Secure", cookie)
            self.assertIn("samesite=none", cookie.lower())

    def test_local_runtime_can_relax_cookie_settings(self):
        from app_instance import app
        from src.routers.auth.auth import get_cookie_settings

        request = self.client.build_request("POST", "/auth/login")
        previous_config = getattr(app, "config", {})
        app.config = {
            "auth": {"cookie_secure": False, "cookie_samesite": "lax"}
        }
        try:
            with patch.dict(
                os.environ,
                {"ENV": "production", "BLOG_RUNTIME_ENV": "local"},
                clear=False,
            ):
                settings = get_cookie_settings(request)
                response = self.client.post(
                    "/auth/login",
                    json={"username": "admin", "password": "secret"},
                )
        finally:
            app.config = previous_config

        self.assertFalse(settings["secure"])
        self.assertEqual(settings["samesite"], "lax")
        self.assertEqual(response.status_code, 200)
        issued_cookies = [
            value
            for value in response.headers.get_list("set-cookie")
            if "Max-Age=0" not in value
        ]
        self.assertEqual(len(issued_cookies), 5)
        for cookie in issued_cookies:
            self.assertNotIn("Secure", cookie)
            self.assertIn("samesite=lax", cookie.lower())

    def test_current_user_never_refreshes_during_a_protected_get(self):
        from fastapi import HTTPException
        from fastapi import Response
        from starlette.requests import Request

        from src.routers.auth.auth import get_current_user

        class RefreshingAuth:
            access_token_expire_minutes = 10

            def __init__(self, tokens):
                self.tokens = tokens
                self.refresh_calls = 0

            def refresh_access_token(self, value):
                self.refresh_calls += 1
                return self.tokens if value == "refresh-token" else None

            def get_user_from_token(self, value, check_redis):
                if value == "access-token" and check_redis:
                    return {"id": 2, "status": 1}
                return None

        request = Request(
            {
                "type": "http",
                "method": "GET",
                "scheme": "http",
                "server": ("testserver", 80),
                "path": "/user/me",
                "headers": [(b"cookie", b"refresh_token=refresh-token; device_id=device-1")],
            }
        )
        auth = RefreshingAuth(FakeAuth().tokens)
        response = Response()

        with self.assertRaises(HTTPException) as caught:
            get_current_user(request, response, auth)

        self.assertEqual(caught.exception.status_code, 401)
        self.assertEqual(auth.refresh_calls, 0)
        self.assertEqual(response.headers.getlist("set-cookie"), [])


if __name__ == "__main__":
    unittest.main()
