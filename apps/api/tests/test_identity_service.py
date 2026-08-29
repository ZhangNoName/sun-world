import asyncio
import sys
import threading
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path


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


class FakeAuth:
    def hash_password(self, value):
        self.hash_thread_id = threading.get_ident()
        return f"hash:{len(value)}"

    def create_tokens_for_user(self, user_id, device_id):
        from src.type.auth_type import TokenModel

        now = datetime.now(timezone.utc)
        self.created = (user_id, device_id)
        return TokenModel(
            access_token="access",
            refresh_token="refresh",
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
        return ExternalIdentityProfile(
            provider="google",
            issuer="https://accounts.google.com",
            subject="google-subject",
            display_name="Person",
            email="person@example.com",
            email_verified=True,
            phone="13800138000",
            phone_verified=True,
        )


class FakeDeliveries:
    def is_enabled(self, channel):
        return channel == "phone"


class FakeVerification:
    deliveries = FakeDeliveries()

    def consume_challenge(self, challenge_id, code, **kwargs):
        self.consumed = (challenge_id, code, kwargs)
        return "phone", "+8613800138000"


class FakeRepository:
    def __init__(self):
        self.provider_calls = []
        self.contact_calls = []

    def resolve_provider_identity(self, profile, contacts, password_hash):
        from src.modules.identity.schemas import IdentityResolution

        self.provider_thread_id = threading.get_ident()
        resolved_password_hash = (
            password_hash() if callable(password_hash) else password_hash
        )
        self.provider_calls.append((profile, contacts, resolved_password_hash))
        return IdentityResolution(
            user_id=7,
            account_created=False,
            linked_by="verified_phone",
        )

    def resolve_verified_contact(self, kind, value, password_hash):
        from src.modules.identity.schemas import IdentityResolution

        resolved_password_hash = (
            password_hash() if callable(password_hash) else password_hash
        )
        self.contact_calls.append((kind, value, resolved_password_hash))
        return IdentityResolution(
            user_id=8,
            account_created=True,
            linked_by="new_account",
        )

    def attach_provider_identity(self, user_id, profile, contacts):
        from src.modules.identity.schemas import IdentityResolution

        self.provider_attach_calls = getattr(self, "provider_attach_calls", [])
        self.provider_attach_calls.append((user_id, profile, contacts))
        return IdentityResolution(
            user_id=user_id,
            account_created=False,
            linked_by="identity",
        )

    def list_connections(self, _user_id):
        from src.modules.identity.schemas import AccountConnections

        return AccountConnections()

    def attach_verified_contact(self, user_id, kind, value, source):
        self.attached = (user_id, kind, value, source)


class IdentityServiceTests(unittest.TestCase):
    def setUp(self):
        from src.modules.identity.providers import OAuthProviderRegistry
        from src.modules.identity.service import IdentityService

        self.redis = MemoryRedis()
        self.provider = FakeProvider()
        self.repository = FakeRepository()
        self.auth = FakeAuth()
        self.service = IdentityService(
            repository=self.repository,
            auth_manager=self.auth,
            redis=self.redis,
            providers=OAuthProviderRegistry({"google": self.provider}),
            verification=FakeVerification(),
            public_api_origin="https://api.sunworld.site",
            public_web_origin="https://sunworld.site",
        )

    def test_oauth_state_pkce_and_nonce_are_one_time_and_phone_drives_linking(self):
        event_loop_thread_id = threading.get_ident()
        attempt = self.service.begin_oauth("google", "/aigc?from=login")

        self.assertEqual(attempt.authorization_url, "https://accounts.example/authorize")
        self.assertEqual(
            self.provider.authorization["redirect_uri"],
            "https://api.sunworld.site/auth/oauth/google/callback",
        )
        self.assertTrue(self.provider.authorization["code_challenge"])
        self.assertTrue(self.provider.authorization["nonce"])

        resolution, return_to = asyncio.run(
            self.service.complete_oauth(
                provider_name="google",
                state=attempt.state,
                state_cookie=attempt.state,
                code="one-time-code",
            )
        )

        self.assertEqual(resolution.user_id, 7)
        self.assertEqual(return_to, "/aigc?from=login")
        _profile, contacts, _password_hash = self.repository.provider_calls[0]
        self.assertEqual(
            contacts,
            [("phone", "+8613800138000"), ("email", "person@example.com")],
        )
        self.assertEqual(self.provider.exchange_args["code_verifier"][:1] != "", True)
        self.assertNotEqual(self.repository.provider_thread_id, event_loop_thread_id)
        self.assertEqual(self.auth.hash_thread_id, self.repository.provider_thread_id)
        with self.assertRaisesRegex(Exception, "登录状态无效或已过期"):
            asyncio.run(
                self.service.complete_oauth(
                    provider_name="google",
                    state=attempt.state,
                    state_cookie=attempt.state,
                    code="replayed-code",
                )
            )

    def test_connect_state_binds_authenticated_owner_and_never_uses_phone_login(self):
        attempt = self.service.begin_oauth(
            "google",
            "/me?panel=connections",
            flow="connect",
            target_user_id=19,
            target_session_id="family-19",
        )

        resolution, return_to = asyncio.run(
            self.service.complete_oauth(
                provider_name="google",
                state=attempt.state,
                state_cookie=attempt.state,
                code="one-time-code",
                connect_guard=lambda _attempt: None,
            )
        )

        self.assertEqual(
            (resolution.user_id, return_to, attempt.flow),
            (19, "/me?panel=connections", "connect"),
        )
        attached_user_id, _profile, contacts = self.repository.provider_attach_calls[0]
        self.assertEqual(attached_user_id, 19)
        self.assertEqual(
            contacts,
            [("phone", "+8613800138000"), ("email", "person@example.com")],
        )
        self.assertEqual(self.repository.provider_calls, [])

    def test_connect_requires_an_owner_before_state_is_created(self):
        with self.assertRaisesRegex(Exception, "请先登录"):
            self.service.begin_oauth("google", "/me", flow="connect")

        self.assertEqual(self.redis.values, {})

    def test_oauth_return_target_must_be_a_local_path(self):
        with self.assertRaisesRegex(Exception, "登录返回地址无效"):
            self.service.begin_oauth("google", "https://evil.example/steal")
        with self.assertRaisesRegex(Exception, "登录返回地址无效"):
            self.service.begin_oauth("google", "//evil.example/steal")

        unsafe_paths = (
            "/\\evil.example/steal",
            "/%5C%5Cevil.example/steal",
            "/%2F%2Fevil.example/steal",
            "/%252F%252Fevil.example/steal",
            "/aigc%0Aevil",
            "/aigc\tevil",
            "/aigc evil",
        )
        for unsafe_path in unsafe_paths:
            with self.subTest(unsafe_path=unsafe_path):
                with self.assertRaisesRegex(Exception, "登录返回地址无效"):
                    self.service.begin_oauth("google", unsafe_path)

    def test_verification_login_resolves_only_the_consumed_verified_contact(self):
        resolution, channel = self.service.complete_verification(
            "verify_challenge_identifier",
            "123456",
        )

        self.assertEqual(channel, "phone")
        self.assertEqual(resolution.user_id, 8)
        self.assertEqual(self.repository.contact_calls[0][:2], ("phone", "+8613800138000"))

    def test_disabled_methods_are_described_instead_of_pretending_success(self):
        methods = {method.id: method for method in self.service.list_methods()}

        self.assertTrue(methods["password"].enabled)
        self.assertTrue(methods["phone"].enabled)
        self.assertFalse(methods["email"].enabled)
        self.assertTrue(methods["google"].enabled)
        self.assertFalse(methods["qq"].enabled)

    def test_authenticated_user_can_claim_a_contact_after_otp_verification(self):
        connections = self.service.complete_connection_verification(
            user_id=11,
            challenge_id="verify_challenge_identifier",
            code="123456",
            session_id="family-11",
        )

        self.assertEqual(
            self.repository.attached,
            (11, "phone", "+8613800138000", "site_otp"),
        )
        self.assertEqual(connections.identities, [])
        self.assertEqual(
            self.service.verification.consumed[2],
            {
                "expected_purpose": "connect",
                "target_user_id": 11,
                "session_id": "family-11",
            },
        )


if __name__ == "__main__":
    unittest.main()
