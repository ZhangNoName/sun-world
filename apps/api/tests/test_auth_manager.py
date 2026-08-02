import sys
import unittest
from pathlib import Path
from types import SimpleNamespace


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


if __name__ == "__main__":
    unittest.main()
