import sys
import unittest
from pathlib import Path
from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient

API_ROOT = Path(__file__).resolve().parents[1]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))


class FakeRedis:
    def hset(self, **_kwargs):
        return None

    def hget(self, *_args):
        return None

    def exist(self, *_args):
        return False


class RedisUnavailable(FakeRedis):
    def exist(self, *_args):
        raise TimeoutError("redis unavailable")


class StatefulRedis(FakeRedis):
    def __init__(self):
        self.hashes = {}
        self.values = {}

    def hset(self, name, key, value, **_kwargs):
        self.hashes.setdefault(name, {})[key] = value

    def hget(self, name, key):
        return self.hashes.get(name, {}).get(key)

    def setex(self, key, _ttl, value):
        self.values[key] = value

    def exist(self, key):
        return key in self.values

    def delete(self, name, key=None):
        if key is None:
            self.hashes.pop(name, None)
        else:
            self.hashes.get(name, {}).pop(key, None)


class AuthManagerTests(unittest.TestCase):
    def setUp(self):
        from src.controller.auth_manager import AuthManager

        self.user = SimpleNamespace(
            id=2,
            username="admin",
            name="admin",
            email="admin@example.test",
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
        for identifier in ("admin", "admin@example.test", "17683242528"):
            token = self.manager.authenticate_user(identifier, "password", "device-1")
            self.assertIsNotNone(token)

        self.assertEqual(
            self.lookups,
            ["admin", "admin@example.test", "17683242528"],
        )

    def test_malformed_jwt_returns_none_instead_of_raising_from_invalid_exception_name(self):
        self.assertIsNone(self.manager.verify_token("not-a-jwt"))

    def test_skips_redis_blacklist_check_when_requested(self):
        from src.controller.auth_manager import AuthManager

        manager = AuthManager(
            self.manager.user_manager,
            RedisUnavailable(),
            secret_key="test-secret",
        )
        token = manager.create_tokens_for_user("2", "device-1").access_token

        self.assertEqual(manager.verify_token(token, check_redis=False), "2")

    def test_refresh_accepts_the_dictionary_returned_by_user_manager(self):
        from src.controller.auth_manager import AuthManager

        redis = StatefulRedis()

        class UserManager:
            def get_user_by_id(self, _user_id):
                return {"id": 2, "status": 1}

        manager = AuthManager(UserManager(), redis, secret_key="test-secret")
        refresh_token = manager.create_tokens_for_user("2", "device-1").refresh_token

        self.assertIsNotNone(manager.refresh_access_token(refresh_token))

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

    def test_user_creation_keeps_inserted_id_for_registration_tokens(self):
        from src.controller.user_manage import UserManager
        from src.type.user_type import User

        class Db:
            def execute(self, *_args):
                return 42

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

    def test_login_identifier_query_uses_exact_matching_for_all_supported_fields(self):
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
        self.assertIn("username = %s OR email = %s OR phone = %s", sql)
        self.assertNotIn("LIKE", sql.upper())
        self.assertEqual(params, ("admin", "admin", "admin"))

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

            def execute(self, sql, values):
                if "INSERT INTO users" in sql:
                    self.insert_values = values
                    return 77
                return 1

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
            (
                "/auth/qq",
                {"access_token": "unused-token", "expires_in": 3600},
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
