import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from jose import jwt

API_ROOT = Path(__file__).resolve().parents[1]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))

TEST_DEVICE_ID = "11111111-1111-4111-8111-111111111111"


class FakeRedis:
    def hset(self, **_kwargs):
        return None

    def hget(self, *_args):
        return None

    def exist(self, *_args):
        return False

    def hdelete(self, *_args):
        return 0

    def setex(self, *_args):
        return True

    def store_session_tokens(self, **_kwargs):
        return None

    def revoke_session_tokens(self, **_kwargs):
        return 1

    def get_session_token_snapshot(self, **_kwargs):
        return None


class RedisUnavailable(FakeRedis):
    def exist(self, *_args):
        raise TimeoutError("redis unavailable")


class StatefulRedis(FakeRedis):
    def __init__(self):
        self.hashes = {}
        self.values = {}
        self.used_refreshes = {}
        self.revoked_families = set()
        self.session_snapshot_calls = []

    def hset(self, name, key, value, **_kwargs):
        self.hashes.setdefault(name, {})[key] = value

    def hget(self, name, key):
        return self.hashes.get(name, {}).get(key)

    def setex(self, key, _ttl, value):
        self.values[key] = value

    def exist(self, key):
        return key in self.values

    def delete(self, name):
        self.hashes.pop(name, None)

    def hdelete(self, name, key):
        self.hashes.get(name, {}).pop(key, None)

    def rotate_session_tokens(
        self,
        *,
        user_id,
        device_id,
        expected_refresh_token,
        new_access_token,
        new_refresh_token,
        used_refresh_key,
        session_family_id,
        reuse_grace_seconds=0,
        **_kwargs,
    ):
        refresh_name = f"user:{user_id}:refresh_tokens"
        access_name = f"user:{user_id}:access_tokens"
        if session_family_id in self.revoked_families:
            return 4
        if self.hget(refresh_name, device_id) != expected_refresh_token:
            if self.used_refreshes.get(used_refresh_key) != session_family_id:
                return 0
            if reuse_grace_seconds > 0:
                return 3
            self.hdelete(access_name, device_id)
            self.hdelete(refresh_name, device_id)
            self.hdelete(f"user:{user_id}:session_families", device_id)
            self.revoked_families.add(session_family_id)
            return 2
        self.hset(access_name, device_id, new_access_token)
        self.hset(refresh_name, device_id, new_refresh_token)
        self.used_refreshes[used_refresh_key] = session_family_id
        return 1

    def store_session_tokens(
        self,
        *,
        user_id,
        device_id,
        session_family_id,
        access_token,
        refresh_token,
        **_kwargs,
    ):
        self.hset(f"user:{user_id}:access_tokens", device_id, access_token)
        self.hset(f"user:{user_id}:refresh_tokens", device_id, refresh_token)
        self.hset(f"user:{user_id}:session_families", device_id, session_family_id)

    def get_session_token_snapshot(self, *, user_id, device_id):
        self.session_snapshot_calls.append((str(user_id), device_id))
        values = (
            self.hashes.get(f"user:{user_id}:access_tokens", {}).get(device_id),
            self.hashes.get(f"user:{user_id}:refresh_tokens", {}).get(device_id),
            self.hashes.get(f"user:{user_id}:session_families", {}).get(device_id),
        )
        return values if all(values) else None

    def revoke_session_tokens(
        self,
        *,
        user_id,
        device_id,
        session_family_id,
        candidate_token,
        all_devices=False,
        **_kwargs,
    ):
        family_name = f"user:{user_id}:session_families"
        active_family = self.hget(family_name, device_id)
        if active_family and active_family != session_family_id:
            return 0
        if not active_family and candidate_token not in {
            self.hget(f"user:{user_id}:access_tokens", device_id),
            self.hget(f"user:{user_id}:refresh_tokens", device_id),
        }:
            return 1 if session_family_id in self.revoked_families else 0
        if all_devices:
            self.delete(f"user:{user_id}:access_tokens")
            self.delete(f"user:{user_id}:refresh_tokens")
            self.delete(family_name)
        else:
            self.hdelete(f"user:{user_id}:access_tokens", device_id)
            self.hdelete(f"user:{user_id}:refresh_tokens", device_id)
            self.hdelete(family_name, device_id)
        self.revoked_families.add(session_family_id)
        return 1


class AuthManagerTests(unittest.TestCase):
    def setUp(self):
        from src.controller.auth_manager import AuthManager

        self.user = SimpleNamespace(
            id=2,
            username="admin",
            name="admin",
            email="admin@example.com",
            phone="17683242528",
            password="password-hash",
            status=True,
        )
        self.lookups = []

        class UserManager:
            def get_user_by_login_identifier(inner_self, identifier):
                self.lookups.append(identifier)
                return [self.user]

        self.manager = AuthManager(UserManager(), FakeRedis(), secret_key="test-secret")
        self.manager.verify_password = lambda _plain, _hashed: True

    def test_authentication_uses_exact_username_email_or_phone_identifier_lookup(self):
        for identifier in ("admin", "admin@example.com", "17683242528"):
            token = self.manager.authenticate_user(
                identifier,
                "password",
                TEST_DEVICE_ID,
            )
            self.assertIsNotNone(token)

        self.assertEqual(
            self.lookups,
            ["admin", "admin@example.com", "+8617683242528"],
        )

    def test_malformed_jwt_returns_none_instead_of_raising_from_invalid_exception_name(self):
        self.assertIsNone(self.manager.verify_token("not-a-jwt"))

    def test_new_session_replaces_untrusted_device_value_with_canonical_uuid(self):
        from src.controller.auth_manager import ALGORITHM, AuthManager

        redis = StatefulRedis()
        manager = AuthManager(
            self.manager.user_manager,
            redis,
            secret_key="test-secret",
        )

        tokens = manager.create_tokens_for_user("2", "attacker-controlled-device")
        payload = jwt.decode(
            tokens.refresh_token,
            "test-secret",
            algorithms=[ALGORITHM],
        )
        device_id = payload["device"]

        self.assertNotEqual(device_id, "attacker-controlled-device")
        self.assertEqual(AuthManager.validated_device_id(device_id), device_id)
        self.assertEqual(
            manager.get_refresh_token_context(tokens.refresh_token),
            ("2", device_id),
        )
        self.assertEqual(
            redis.hget("user:2:refresh_tokens", device_id),
            tokens.refresh_token,
        )

    def test_refresh_context_rejects_wrong_type_invalid_device_and_oversized_token(self):
        from src.controller.auth_manager import (
            ALGORITHM,
            MAX_SESSION_TOKEN_LENGTH,
            AuthManager,
        )

        manager = AuthManager(
            self.manager.user_manager,
            StatefulRedis(),
            secret_key="test-secret",
        )
        tokens = manager.create_tokens_for_user("2", TEST_DEVICE_ID)
        now = datetime.now(timezone.utc)
        invalid_device_token = jwt.encode(
            {
                "sub": "2",
                "device": "not-a-uuid",
                "typ": "refresh",
                "iat": int(now.timestamp()),
                "exp": int((now + timedelta(hours=1)).timestamp()),
            },
            "test-secret",
            algorithm=ALGORITHM,
        )

        self.assertEqual(
            manager.get_refresh_token_context(tokens.refresh_token),
            ("2", TEST_DEVICE_ID),
        )
        self.assertIsNone(manager.get_refresh_token_context(tokens.access_token))
        self.assertIsNone(manager.get_refresh_token_context(invalid_device_token))
        self.assertIsNone(manager.refresh_access_token(invalid_device_token))
        oversized = "x" * (MAX_SESSION_TOKEN_LENGTH + 1)
        self.assertIsNone(manager.get_refresh_token_context(oversized))
        self.assertIsNone(manager.verify_token(oversized))
        self.assertFalse(manager.logout(oversized))

    def test_skips_redis_blacklist_check_when_requested(self):
        from src.controller.auth_manager import AuthManager

        manager = AuthManager(
            self.manager.user_manager,
            RedisUnavailable(),
            secret_key="test-secret",
        )
        token = manager.create_tokens_for_user("2", TEST_DEVICE_ID).access_token

        self.assertEqual(manager.verify_token(token, check_redis=False), "2")

    def test_refresh_accepts_the_dictionary_returned_by_user_manager(self):
        from src.controller.auth_manager import AuthManager

        redis = StatefulRedis()

        class UserManager:
            def get_user_by_id(self, _user_id):
                return {"id": 2, "status": 1}

        manager = AuthManager(
            UserManager(),
            redis,
            secret_key="test-secret",
            refresh_reuse_grace_seconds=0,
        )
        refresh_token = manager.create_tokens_for_user(
            "2",
            TEST_DEVICE_ID,
        ).refresh_token

        self.assertIsNotNone(manager.refresh_access_token(refresh_token))

    def test_refresh_reuse_revokes_the_rotated_token_family(self):
        from src.controller.auth_manager import AuthManager

        redis = StatefulRedis()

        class UserManager:
            def get_user_by_id(self, _user_id):
                return {"id": 2, "status": 1}

        manager = AuthManager(
            UserManager(),
            redis,
            secret_key="test-secret",
            refresh_reuse_grace_seconds=0,
        )
        first = manager.create_tokens_for_user("2", TEST_DEVICE_ID)
        rotated = manager.refresh_access_token(first.refresh_token)

        self.assertIsNotNone(rotated)
        self.assertNotEqual(first.refresh_token, rotated.refresh_token)
        self.assertIsNone(manager.refresh_access_token(first.refresh_token))
        self.assertIsNone(redis.hget("user:2:refresh_tokens", TEST_DEVICE_ID))
        self.assertIsNone(manager.refresh_access_token(rotated.refresh_token))

    def test_immediate_duplicate_refresh_returns_the_same_successor_without_revocation(self):
        from src.controller.auth_manager import AuthManager

        redis = StatefulRedis()

        class UserManager:
            def get_user_by_id(self, _user_id):
                return {"id": 2, "status": 1}

        with patch(
            "src.controller.auth_manager.is_local_runtime",
            return_value=True,
        ):
            manager = AuthManager(
                UserManager(),
                redis,
                secret_key="test-secret",
                refresh_reuse_grace_seconds=3,
            )
        first = manager.create_tokens_for_user("2", TEST_DEVICE_ID)
        rotated = manager.refresh_access_token(first.refresh_token)
        duplicate = manager.refresh_access_token(first.refresh_token)

        self.assertIsNotNone(rotated)
        self.assertIsNotNone(duplicate)
        self.assertEqual(duplicate.access_token, rotated.access_token)
        self.assertEqual(duplicate.refresh_token, rotated.refresh_token)
        self.assertEqual(
            redis.session_snapshot_calls,
            [("2", TEST_DEVICE_ID)],
        )
        self.assertEqual(
            manager.verify_token(rotated.access_token, check_redis=True),
            "2",
        )

    def test_duplicate_refresh_rejects_successor_from_a_replaced_session_family(self):
        from src.controller.auth_manager import AuthManager

        redis = StatefulRedis()

        class UserManager:
            def get_user_by_id(self, _user_id):
                return {"id": 2, "status": 1}

        with patch(
            "src.controller.auth_manager.is_local_runtime",
            return_value=True,
        ):
            manager = AuthManager(
                UserManager(),
                redis,
                secret_key="test-secret",
                refresh_reuse_grace_seconds=3,
            )
        first = manager.create_tokens_for_user("2", TEST_DEVICE_ID)
        self.assertIsNotNone(manager.refresh_access_token(first.refresh_token))
        read_snapshot = redis.get_session_token_snapshot

        def replaced_family_snapshot(*, user_id, device_id):
            snapshot = read_snapshot(user_id=user_id, device_id=device_id)
            assert snapshot is not None
            access_token, refresh_token, _family = snapshot
            return access_token, refresh_token, "replacement-family"

        redis.get_session_token_snapshot = replaced_family_snapshot

        self.assertIsNone(manager.refresh_access_token(first.refresh_token))

    def test_refresh_tokens_keep_a_stable_session_family_id(self):
        from src.controller.auth_manager import ALGORITHM, AuthManager

        redis = StatefulRedis()

        class UserManager:
            def get_user_by_id(self, _user_id):
                return {"id": 2, "status": 1}

        manager = AuthManager(UserManager(), redis, secret_key="test-secret")
        first = manager.create_tokens_for_user("2", TEST_DEVICE_ID)
        rotated = manager.refresh_access_token(first.refresh_token)

        first_payload = jwt.decode(first.refresh_token, "test-secret", algorithms=[ALGORITHM])
        rotated_payload = jwt.decode(rotated.refresh_token, "test-secret", algorithms=[ALGORITHM])
        self.assertEqual(first_payload["sid"], rotated_payload["sid"])
        self.assertEqual(first_payload["auth_time"], rotated_payload["auth_time"])

    def test_recent_session_context_requires_auth_time_and_active_redis_session(self):
        from src.controller.auth_manager import ALGORITHM, AuthManager

        redis = StatefulRedis()

        class UserManager:
            def get_user_by_id(self, _user_id):
                return {"id": 2, "status": 1}

        manager = AuthManager(UserManager(), redis, secret_key="test-secret")
        tokens = manager.create_tokens_for_user("2", TEST_DEVICE_ID)

        self.assertEqual(
            manager.get_recent_session_context(
                tokens.access_token,
                max_age_seconds=600,
            )[0],
            2,
        )

        payload = jwt.decode(tokens.access_token, "test-secret", algorithms=[ALGORITHM])
        payload.pop("auth_time")
        legacy_access = jwt.encode(payload, "test-secret", algorithm=ALGORITHM)
        redis.hset("user:2:access_tokens", TEST_DEVICE_ID, legacy_access)
        self.assertIsNone(
            manager.get_recent_session_context(
                legacy_access,
                max_age_seconds=600,
            )
        )

    def test_access_and_refresh_tokens_are_not_interchangeable(self):
        from src.controller.auth_manager import AuthManager

        redis = StatefulRedis()
        manager = AuthManager(self.manager.user_manager, redis, secret_key="test-secret")
        tokens = manager.create_tokens_for_user("2", TEST_DEVICE_ID)

        self.assertIsNone(manager.verify_token(tokens.refresh_token, token_type="access"))
        self.assertIsNone(manager.verify_token(tokens.access_token, token_type="refresh"))

    def test_logout_revokes_the_current_device_access_and_refresh_tokens(self):
        from src.controller.auth_manager import AuthManager

        redis = StatefulRedis()

        class UserManager:
            def get_user_by_id(self, _user_id):
                return {"id": 2, "status": 1}

        manager = AuthManager(UserManager(), redis, secret_key="test-secret")
        tokens = manager.create_tokens_for_user("2", TEST_DEVICE_ID)

        self.assertTrue(manager.logout(tokens.access_token))
        self.assertIsNone(manager.verify_token(tokens.access_token))
        self.assertIsNone(manager.refresh_access_token(tokens.refresh_token))

    def test_logout_can_revoke_an_expired_but_still_active_refresh_token(self):
        from src.controller.auth_manager import ALGORITHM, AuthManager

        redis = StatefulRedis()
        manager = AuthManager(self.manager.user_manager, redis, secret_key="test-secret")
        expired_refresh = jwt.encode(
            {
                "sub": "2",
                "device": TEST_DEVICE_ID,
                "typ": "refresh",
                "jti": "expired-refresh",
                "iat": int((datetime.now(timezone.utc) - timedelta(days=2)).timestamp()),
                "exp": int((datetime.now(timezone.utc) - timedelta(days=1)).timestamp()),
            },
            "test-secret",
            algorithm=ALGORITHM,
        )
        redis.hset(
            name="user:2:refresh_tokens",
            key=TEST_DEVICE_ID,
            value=expired_refresh,
        )

        self.assertTrue(manager.logout(expired_refresh))
        self.assertIsNone(redis.hget("user:2:refresh_tokens", TEST_DEVICE_ID))

    def test_token_from_an_old_family_cannot_revoke_a_newer_device_session(self):
        from src.controller.auth_manager import AuthManager

        redis = StatefulRedis()

        class UserManager:
            def get_user_by_id(self, _user_id):
                return {"id": 2, "status": 1}

        manager = AuthManager(UserManager(), redis, secret_key="test-secret")
        first = manager.create_tokens_for_user("2", TEST_DEVICE_ID)
        replacement = manager.create_tokens_for_user("2", TEST_DEVICE_ID)

        self.assertFalse(manager.logout(first.refresh_token))
        self.assertEqual(
            redis.hget("user:2:access_tokens", TEST_DEVICE_ID),
            replacement.access_token,
        )
        self.assertEqual(
            redis.hget("user:2:refresh_tokens", TEST_DEVICE_ID),
            replacement.refresh_token,
        )

    def test_stale_token_from_current_family_revokes_its_rotated_session(self):
        from src.controller.auth_manager import AuthManager

        redis = StatefulRedis()

        class UserManager:
            def get_user_by_id(self, _user_id):
                return {"id": 2, "status": 1}

        manager = AuthManager(UserManager(), redis, secret_key="test-secret")
        first = manager.create_tokens_for_user("2", TEST_DEVICE_ID)
        rotated = manager.refresh_access_token(first.refresh_token)
        self.assertIsNotNone(rotated)

        self.assertTrue(manager.logout(first.refresh_token))
        self.assertIsNone(redis.hget("user:2:access_tokens", TEST_DEVICE_ID))
        self.assertIsNone(redis.hget("user:2:refresh_tokens", TEST_DEVICE_ID))
        self.assertIsNone(manager.refresh_access_token(rotated.refresh_token))

    def test_default_access_token_lifetime_is_thirty_minutes(self):
        from src.controller.auth_manager import AuthManager

        manager = AuthManager(self.manager.user_manager, FakeRedis(), secret_key="test-secret")

        self.assertEqual(manager.access_token_expire_minutes, 30)

    def test_refresh_reuse_grace_defaults_to_strict_revocation(self):
        from src.controller.auth_manager import AuthManager

        with patch("src.controller.auth_manager.os.getenv", side_effect=lambda _name, default=None: default):
            manager = AuthManager(
                self.manager.user_manager,
                FakeRedis(),
                secret_key="test-secret",
            )

        self.assertEqual(manager.refresh_reuse_grace_seconds, 0)

    def test_non_local_runtime_rejects_refresh_reuse_grace(self):
        from src.controller.auth_manager import AuthManager

        with patch(
            "src.controller.auth_manager.os.getenv",
            side_effect=lambda name, default=None: (
                "1"
                if name == "AUTH_REFRESH_REUSE_GRACE_SECONDS"
                else default
            ),
        ), patch(
            "src.controller.auth_manager.is_local_runtime", return_value=False
        ):
            with self.assertRaisesRegex(
                ValueError,
                "must be 0 outside local runtime",
            ):
                AuthManager(
                    self.manager.user_manager,
                    FakeRedis(),
                    secret_key="test-secret",
                )

    def test_current_user_checks_token_revocation_state(self):
        from fastapi import Response
        from starlette.requests import Request

        from src.routers.auth.auth import get_current_user

        class Auth:
            def __init__(self):
                self.check_redis = None

            def get_user_from_token(self, _token, check_redis):
                self.check_redis = check_redis
                return {"id": 2, "status": 1}

        auth = Auth()
        request = Request(
            {
                "type": "http",
                "method": "GET",
                "path": "/user/me",
                "headers": [(b"cookie", b"access_token=revoked-token")],
            }
        )

        get_current_user(request, Response(), auth)

        self.assertTrue(auth.check_redis)

    def test_registration_rejects_existing_login_identifier_without_deleting_legacy_rows(self):
        existing = self.user
        self.manager.user_manager.get_user_by_login_identifier = lambda _value: [existing]
        candidate = SimpleNamespace(
            username="admin",
            name="Admin copy",
            email="duplicate@example.test",
            phone="13800138000",
            password="secret",
        )

        self.assertFalse(self.manager.register_user(candidate))

    def test_registration_service_rejects_contact_shaped_admin_usernames(self):
        self.manager.user_manager.get_user_by_login_identifier = lambda _value: []
        self.manager.user_manager.create_user = lambda _user: self.fail(
            "contact-shaped usernames must be rejected before persistence"
        )
        for username in ("victim@example.com", "13800138000", "+14155552671"):
            with self.subTest(username=username):
                candidate = SimpleNamespace(
                    username=username,
                    name=username,
                    email="placeholder@example.test",
                    phone="",
                    password="secret123",
                )
                self.assertFalse(self.manager.register_user(candidate))

    def test_user_creation_keeps_inserted_id_for_registration_tokens(self):
        from src.controller.user_manage import UserManager
        from src.type.user_type import User

        class Db:
            def unit_of_work(self):
                return self

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def fetch_one(self, sql, _params):
                return {"id": 2} if "FROM roles" in sql else None

            def execute(self, *_args):
                return 42 if "INSERT INTO users" in _args[0] else 1

            def commit(self):
                pass

        manager = UserManager(Db())
        manager.set_role_by_id = lambda *_args: True
        user = User(
            username="new-user",
            name="New User",
            sex=0,
            age=0,
            phone="13800138000",
            email="new@example.test",
            password="hash",
            birth_day="1970-01-01",
        )

        self.assertTrue(manager.create_user(user))
        self.assertEqual(user.id, 42)

    def test_login_identifier_query_keeps_username_and_contact_namespaces_separate(self):
        from src.controller.user_manage import UserManager

        class Db:
            def __init__(self):
                self.calls = []

            def fetch_all(self, sql, params):
                self.calls.append((sql, params))
                if "FROM users" in sql:
                    return []
                return []

        db = Db()
        manager = UserManager(db)
        self.assertEqual(manager.get_user_by_login_identifier("admin"), [])
        sql, params = db.calls[0]
        self.assertIn("u.username = %s", sql)
        self.assertNotIn("auth_verified_contacts", sql)
        self.assertNotIn("u.email = %s", sql)
        self.assertNotIn("u.phone = %s", sql)
        self.assertNotIn("LIKE", sql.upper())
        self.assertEqual(params, ("admin",))

        self.assertEqual(manager.get_user_by_login_identifier("Ádmin"), [])
        self.assertEqual(len(db.calls), 1)

        self.assertEqual(
            manager.get_user_by_login_identifier("Victim@Example.com"),
            [],
        )
        contact_sql, contact_params = db.calls[1]
        self.assertIn("auth_verified_contacts", contact_sql)
        self.assertNotIn("u.username = %s", contact_sql)
        self.assertEqual(contact_params, ("email", "victim@example.com"))

        self.assertEqual(
            manager.get_user_by_login_identifier("13800138000"),
            [],
        )
        phone_sql, phone_params = db.calls[2]
        self.assertIn("auth_verified_contacts", phone_sql)
        self.assertNotIn("u.username = %s", phone_sql)
        self.assertEqual(phone_params, ("phone", "+8613800138000"))

    def test_admin_user_creation_hashes_password_before_persistence(self):
        from src.controller.auth_manager import AuthManager
        from src.controller.user_manage import UserManager
        from src.routers.auth.auth import get_auth_manager, get_current_user
        from src.routers.user.user import get_user_manager, router

        class Db:
            def __init__(self):
                self.insert_values = None

            def fetch_all(self, *_args):
                return []

            def unit_of_work(self):
                return self

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def fetch_one(self, sql, _params):
                return {"id": 2} if "FROM roles" in sql else None

            def execute(self, sql, values):
                if "INSERT INTO users" in sql:
                    self.insert_values = values
                    return 77
                return 1

            def commit(self):
                pass

        db = Db()
        user_manager = UserManager(db)
        auth_manager = AuthManager(user_manager, FakeRedis(), secret_key="test-secret")
        test_app = FastAPI()
        test_app.include_router(router)
        test_app.dependency_overrides[get_current_user] = lambda: {
            "id": 1,
            "roles": [{"code": "admin"}],
        }
        test_app.dependency_overrides[get_user_manager] = lambda: user_manager
        test_app.dependency_overrides[get_auth_manager] = lambda: auth_manager

        with TestClient(test_app, raise_server_exceptions=False) as client:
            response = client.post(
                "/user/",
                json={
                    "username": "managed-user",
                    "name": "Managed User",
                    "sex": 0,
                    "age": 18,
                    "phone": "",
                    "email": "managed@example.test",
                    "password": "plaintext-secret",
                    "birth_day": "2000-01-01",
                },
            )

        self.assertEqual(response.status_code, 201)
        self.assertIsNotNone(db.insert_values)
        stored_password = db.insert_values[6]
        self.assertNotEqual(stored_password, "plaintext-secret")
        self.assertTrue(auth_manager.verify_password("plaintext-secret", stored_password))

    def test_unimplemented_auth_flows_do_not_report_false_success(self):
        from src.routers.auth.auth import get_auth_manager, router

        test_app = FastAPI()
        test_app.include_router(router)
        test_app.dependency_overrides[get_auth_manager] = lambda: object()

        requests = [
            (
                "/auth/reset_password/request",
                {"email": "person@example.com"},
            ),
            (
                "/auth/reset_password",
                {"token": "unused-token", "new_password": "new-secret"},
            ),
        ]
        with TestClient(test_app, raise_server_exceptions=False) as client:
            for path, payload in requests:
                with self.subTest(path=path):
                    response = client.post(path, json=payload)
                    self.assertEqual(response.status_code, 501)
                    self.assertEqual(
                        response.json()["detail"]["code"],
                        "AUTH_NOT_IMPLEMENTED",
                    )


if __name__ == "__main__":
    unittest.main()
