import json
import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

from fastapi import FastAPI
from fastapi.testclient import TestClient


API_ROOT = Path(__file__).resolve().parents[1]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))


class MemoryRedis:
    def __init__(self):
        self.values = {}

    def setex(self, name, _ttl, value):
        self.values[name] = value

    def getdel(self, name):
        return self.values.pop(name, None)

    def consume_multi_fixed_window(self, _limits):
        return True, 60


class FakeAuth:
    access_token_expire_minutes = 30

    def __init__(self):
        self.validations = []
        self.created = None
        self.recent_enabled = True

    def get_user_from_token(self, token, check_redis=False):
        self.validations.append((token, check_redis))
        users = {
            "valid-access": {"id": 17, "status": 1},
            "other-access": {"id": 23, "status": 1},
        }
        return users.get(token)

    def get_recent_session_context(self, token, *, max_age_seconds):
        if not self.recent_enabled:
            return None
        sessions = {
            "valid-access": (17, "family-17"),
            "other-access": (23, "family-23"),
        }
        return sessions.get(token)

    def hash_password(self, value):
        return f"hash:{len(value)}"

    def create_tokens_for_user(self, user_id, device_id):
        from src.type.auth_type import TokenModel

        now = datetime.now(timezone.utc)
        self.created = (user_id, device_id)
        return TokenModel(
            access_token="rotated-access",
            refresh_token="rotated-refresh",
            access_token_expire=now + timedelta(minutes=30),
            refresh_token_expire=now + timedelta(days=7),
        )


class FakeProvider:
    name = "google"

    def authorization_url(self, **kwargs):
        self.authorization = kwargs
        return "https://accounts.example/authorize"

    async def exchange(self, **kwargs):
        from src.modules.identity.schemas import ExternalIdentityProfile

        self.exchange_args = kwargs
        hook = getattr(self, "after_exchange", None)
        if hook:
            hook()
        return ExternalIdentityProfile(
            provider="google",
            issuer="https://accounts.google.com",
            subject="provider-subject",
            display_name="Person",
            email="person@example.com",
            email_verified=True,
        )


class FakeRepository:
    def __init__(self):
        self.attached = []
        self.login_resolved = []

    def attach_provider_identity(self, user_id, profile, contacts):
        from src.modules.identity.schemas import IdentityResolution

        self.attached.append((user_id, profile, contacts))
        return IdentityResolution(
            user_id=user_id,
            account_created=False,
            linked_by="identity",
        )

    def resolve_provider_identity(self, profile, contacts, password_hash):
        from src.modules.identity.schemas import IdentityResolution

        self.login_resolved.append((profile, contacts, password_hash))
        return IdentityResolution(
            user_id=41,
            account_created=True,
            linked_by="new_account",
        )


class FakeDeliveries:
    def is_enabled(self, _channel):
        return False


class FakeVerification:
    deliveries = FakeDeliveries()


class IdentityRouterTests(unittest.TestCase):
    def setUp(self):
        from src.modules.identity.providers import OAuthProviderRegistry
        from src.modules.identity.router import get_identity_service, router
        from src.modules.identity.service import IdentityService

        self.redis = MemoryRedis()
        self.auth = FakeAuth()
        self.provider = FakeProvider()
        self.repository = FakeRepository()
        self.service = IdentityService(
            repository=self.repository,
            auth_manager=self.auth,
            redis=self.redis,
            providers=OAuthProviderRegistry({"google": self.provider}),
            verification=FakeVerification(),
            public_api_origin="https://api.sunworld.site",
            public_web_origin="https://sunworld.site",
        )
        application = FastAPI()
        application.include_router(router)
        application.dependency_overrides[get_identity_service] = lambda: self.service
        self.client = TestClient(application)

    def test_connect_start_requires_a_redis_validated_access_cookie(self):
        response = self.client.get(
            "/auth/oauth/google/start",
            params={"flow": "connect", "return_to": "/me"},
        )

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()["detail"]["code"], "AUTH_UNAUTHORIZED")
        self.assertEqual(self.redis.values, {})

        self.client.cookies.set("access_token", "invalid-access")
        response = self.client.get(
            "/auth/oauth/google/start",
            params={"flow": "connect", "return_to": "/me"},
        )
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()["detail"]["code"], "AUTH_TOKEN_EXPIRED")
        self.assertEqual(self.auth.validations[-1], ("invalid-access", True))
        self.assertEqual(self.redis.values, {})

    def test_callback_uses_connect_owner_and_flow_from_one_time_state(self):
        self.client.cookies.set("access_token", "valid-access")
        start = self.client.get(
            "/auth/oauth/google/start",
            params={"flow": "connect", "return_to": "/me?panel=connections"},
        )

        self.assertEqual(start.status_code, 200)
        self.assertEqual(start.json()["data"]["flow"], "connect")
        self.assertEqual(self.auth.validations[-1], ("valid-access", True))
        state_cookie_name = next(
            name for name in start.cookies.keys() if name.startswith("oauth_state_")
        )
        state = start.cookies.get(state_cookie_name)
        stored = json.loads(self.redis.values[f"auth:oauth:state:{state}"])
        self.assertEqual(stored["flow"], "connect")
        self.assertEqual(stored["target_user_id"], 17)
        self.assertEqual(stored["target_session_id"], "family-17")

        callback = self.client.get(
            "/auth/oauth/google/callback",
            params={
                "state": state,
                "code": "provider-code",
                "flow": "login",
                "target_user_id": "999",
            },
            follow_redirects=False,
        )

        self.assertEqual(callback.status_code, 303)
        self.assertEqual(self.repository.attached[0][0], 17)
        query = parse_qs(urlsplit(callback.headers["location"]).query)
        self.assertEqual(query["status"], ["success"])
        self.assertEqual(query["flow"], ["connect"])
        self.assertEqual(query["return_to"], ["/me?panel=connections"])
        self.assertEqual(self.auth.validations[-1], ("valid-access", True))
        self.assertIsNone(self.auth.created)
        self.assertNotIn("access_token=rotated-access", callback.headers["set-cookie"])
        self.assertNotIn(f"auth:oauth:state:{state}", self.redis.values)

        replay = self.client.get(
            "/auth/oauth/google/callback",
            params={"state": state, "code": "replayed-code"},
            follow_redirects=False,
        )
        replay_query = parse_qs(urlsplit(replay.headers["location"]).query)
        self.assertEqual(replay_query["code"], ["AUTH_OAUTH_STATE_INVALID"])
        self.assertEqual(len(self.repository.attached), 1)

    def test_connect_callback_rejects_logout_or_account_switch(self):
        self.client.cookies.set("access_token", "valid-access")
        start = self.client.get(
            "/auth/oauth/google/start",
            params={"flow": "connect", "return_to": "/me"},
        )
        state_cookie_name = next(
            name for name in start.cookies.keys() if name.startswith("oauth_state_")
        )
        state = start.cookies.get(state_cookie_name)

        self.client.cookies.set("access_token", "other-access")
        callback = self.client.get(
            "/auth/oauth/google/callback",
            params={"state": state, "code": "provider-code"},
            follow_redirects=False,
        )

        query = parse_qs(urlsplit(callback.headers["location"]).query)
        self.assertEqual(query["status"], ["error"])
        self.assertEqual(query["flow"], ["connect"])
        self.assertEqual(query["code"], ["AUTH_OAUTH_CONNECT_SESSION_CHANGED"])
        self.assertEqual(self.repository.attached, [])
        self.assertIsNone(self.auth.created)

        self.client.cookies.set("access_token", "valid-access")
        second_start = self.client.get(
            "/auth/oauth/google/start",
            params={"flow": "connect", "return_to": "/me"},
        )
        second_cookie_name = next(
            name
            for name in second_start.cookies.keys()
            if name.startswith("oauth_state_")
        )
        second_state = second_start.cookies.get(second_cookie_name)
        self.client.cookies.delete("access_token")

        logged_out_callback = self.client.get(
            "/auth/oauth/google/callback",
            params={"state": second_state, "code": "provider-code"},
            follow_redirects=False,
        )

        logged_out_query = parse_qs(
            urlsplit(logged_out_callback.headers["location"]).query
        )
        self.assertEqual(logged_out_query["code"], ["AUTH_UNAUTHORIZED"])
        self.assertEqual(self.repository.attached, [])

    def test_connect_rechecks_recent_session_after_remote_provider_exchange(self):
        self.client.cookies.set("access_token", "valid-access")
        start = self.client.get(
            "/auth/oauth/google/start",
            params={"flow": "connect", "return_to": "/me"},
        )
        state_cookie_name = next(
            name for name in start.cookies.keys() if name.startswith("oauth_state_")
        )
        state = start.cookies.get(state_cookie_name)
        self.provider.after_exchange = lambda: setattr(
            self.auth,
            "recent_enabled",
            False,
        )

        callback = self.client.get(
            "/auth/oauth/google/callback",
            params={"state": state, "code": "provider-code"},
            follow_redirects=False,
        )

        query = parse_qs(urlsplit(callback.headers["location"]).query)
        self.assertEqual(query["code"], ["AUTH_STEP_UP_REQUIRED"])
        self.assertEqual(self.repository.attached, [])

    def test_login_flow_still_works_without_an_existing_session_and_rotates_cookies(self):
        start = self.client.get(
            "/auth/oauth/google/start",
            params={"return_to": "/aigc"},
        )
        self.assertEqual(start.json()["data"]["flow"], "login")
        state_cookie_name = next(
            name for name in start.cookies.keys() if name.startswith("oauth_state_")
        )
        state = start.cookies.get(state_cookie_name)

        callback = self.client.get(
            "/auth/oauth/google/callback",
            params={"state": state, "code": "provider-code"},
            follow_redirects=False,
        )

        query = parse_qs(urlsplit(callback.headers["location"]).query)
        self.assertEqual(query["status"], ["success"])
        self.assertEqual(query["flow"], ["login"])
        self.assertEqual(self.auth.created[0], "41")
        self.assertIn("access_token=rotated-access", callback.headers["set-cookie"])
        self.assertEqual(len(self.repository.login_resolved), 1)


if __name__ == "__main__":
    unittest.main()
