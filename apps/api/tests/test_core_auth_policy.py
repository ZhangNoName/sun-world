import sys
import time
import unittest
from pathlib import Path
from unittest.mock import Mock

from jose import jwt

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.core.auth import AuthorizationDenied, Principal, PublicReadPolicy, TargetContext
from src.core.auth.session import SessionAuthenticator


class CoreAuthPolicyTests(unittest.TestCase):
    def test_public_policy_never_infers_write_from_admin_role(self):
        policy = PublicReadPolicy()
        principal = Principal(kind="user", user_id=1, roles=("admin",))
        policy.require(principal, "blog.article.read_public", TargetContext())
        for capability in ("blog.article.publish", "unknown", "agent.run.create"):
            with self.subTest(capability=capability), self.assertRaises(AuthorizationDenied):
                policy.require(principal, capability, TargetContext())

    def test_session_adapter_rechecks_revocation_and_current_roles(self):
        manager = Mock(secret_key="synthetic-test-key")
        manager.get_user_from_token.return_value = {"id": 7, "roles": [{"code": "normal"}]}
        token = jwt.encode({"sub": "7", "typ": "access", "sid": "family",
                            "auth_time": int(time.time()), "exp": int(time.time()) + 60},
                           manager.secret_key, algorithm="HS256")
        authenticator = SessionAuthenticator(manager)
        principal = authenticator.authenticate(token)
        self.assertEqual(principal.user_id, 7)
        self.assertEqual(principal.session_family, "family")
        self.assertEqual(principal.roles, ("normal",))
        manager.get_user_from_token.assert_called_with(token, check_redis=True)
        manager.get_user_from_token.return_value = None
        with self.assertRaises(AuthorizationDenied):
            authenticator.authenticate(token)
        manager.get_user_from_token.side_effect = RuntimeError("dependency unavailable")
        with self.assertRaises(AuthorizationDenied):
            authenticator.authenticate(token)
        self.assertEqual(manager.get_user_from_token.call_count, 3)

    def test_signed_subject_must_match_account(self):
        manager = Mock(secret_key="synthetic-test-key")
        manager.get_user_from_token.return_value = {"id": 8, "roles": []}
        token = jwt.encode({"sub": "7", "typ": "access", "sid": "family", "auth_time": 1},
                           manager.secret_key, algorithm="HS256")
        with self.assertRaises(AuthorizationDenied):
            SessionAuthenticator(manager).authenticate(token)
