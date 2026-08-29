import sys
import unittest
from contextlib import contextmanager
from pathlib import Path


API_ROOT = Path(__file__).resolve().parents[1]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))


class ScriptedUnitOfWork:
    def __init__(
        self,
        *,
        identity=None,
        identity_rows=None,
        contacts=None,
        legacy_contacts=None,
        role=None,
        account=None,
    ):
        self.identity = identity
        self.identity_rows = identity_rows
        self.contacts = contacts or {}
        self.legacy_contacts = legacy_contacts or {}
        self.role = {"id": 2} if role is None else role
        self.account = {"id": 5, "status": 1} if account is None else account
        self.calls = []
        self.committed = False

    def fetch_one(self, sql, params=None):
        self.calls.append(("fetch_one", sql, params))
        if "FROM auth_identities" in sql:
            return self.identity
        if "FROM auth_verified_contacts" in sql:
            kind, value = params
            return self.contacts.get((kind, value))
        if "id AS user_id" in sql and "FROM users" in sql:
            if "LOWER(email)" in sql:
                return self.legacy_contacts.get(("email", params[0]))
            return (
                self.legacy_contacts.get(("phone", params[0]))
                or self.legacy_contacts.get(("phone", params[1]))
            )
        if "FROM roles" in sql:
            return self.role
        if "FROM users WHERE id" in sql:
            return self.account
        return None

    def execute(self, sql, params=None):
        self.calls.append(("execute", sql, params))
        if "INSERT INTO users" in sql:
            return 42
        if "INSERT INTO auth_verified_contacts" in sql:
            _id, user_id, kind, value, _display, _source = params
            self.contacts[(kind, value)] = {
                "id": _id,
                "user_id": user_id,
                "status": 1,
            }
            return 1
        return 1

    def fetch_all(self, sql, params=None):
        self.calls.append(("fetch_all", sql, params))
        if "FROM auth_identities" in sql:
            return self.identity_rows or []
        return []

    def commit(self):
        self.committed = True


class ScriptedDb:
    def __init__(self, uow):
        self.uow = uow

    @contextmanager
    def unit_of_work(self):
        yield self.uow

    def fetch_all(self, *_args):
        return []


def profile(**updates):
    from src.modules.identity.schemas import ExternalIdentityProfile

    values = {
        "provider": "google",
        "issuer": "https://accounts.google.com",
        "subject": "subject-1",
        "display_name": "Person",
    }
    values.update(updates)
    return ExternalIdentityProfile(**values)


def wechat_profile(*, unionid="wechat-unionid"):
    updates = {
        "provider": "wechat",
        "issuer": "https://open.weixin.qq.com/app/wechat-app",
        "subject": "wechat-openid",
        "display_name": "WeChat Person",
    }
    if unionid:
        updates["legacy_identity_keys"] = [
            {
                "issuer": "https://open.weixin.qq.com/unionid",
                "subject": unionid,
            }
        ]
    return profile(**updates)


class IdentityRepositoryTests(unittest.TestCase):
    def test_wechat_historical_unionid_identity_is_migrated_to_app_openid(self):
        from src.modules.identity.repository import MySqlIdentityRepository

        uow = ScriptedUnitOfWork(
            identity_rows=[
                {
                    "id": "identity-unionid",
                    "user_id": 8,
                    "issuer": "https://open.weixin.qq.com/unionid",
                    "subject": "wechat-unionid",
                    "identity_status": 1,
                    "user_status": 1,
                }
            ]
        )
        repository = MySqlIdentityRepository(ScriptedDb(uow))

        result = repository.resolve_provider_identity(
            wechat_profile(),
            [],
            "unusable-hash",
        )

        self.assertEqual(result.user_id, 8)
        self.assertEqual(result.linked_by, "identity")
        migration = next(
            call
            for call in uow.calls
            if call[0] == "execute"
            and "UPDATE auth_identities SET issuer" in call[1]
        )
        self.assertEqual(
            migration[2],
            (
                "https://open.weixin.qq.com/app/wechat-app",
                "wechat-openid",
                "identity-unionid",
                8,
            ),
        )
        self.assertFalse(
            any("INSERT INTO users" in call[1] for call in uow.calls)
        )
        self.assertTrue(uow.committed)

    def test_wechat_same_owner_primary_and_legacy_rows_are_consolidated(self):
        from src.modules.identity.repository import MySqlIdentityRepository

        uow = ScriptedUnitOfWork(
            identity_rows=[
                {
                    "id": "identity-primary",
                    "user_id": 8,
                    "issuer": "https://open.weixin.qq.com/app/wechat-app",
                    "subject": "wechat-openid",
                    "identity_status": 1,
                    "user_status": 1,
                },
                {
                    "id": "identity-unionid",
                    "user_id": 8,
                    "issuer": "https://open.weixin.qq.com/unionid",
                    "subject": "wechat-unionid",
                    "identity_status": 1,
                    "user_status": 1,
                },
            ]
        )
        repository = MySqlIdentityRepository(ScriptedDb(uow))

        result = repository.resolve_provider_identity(
            wechat_profile(),
            [],
            "unusable-hash",
        )

        self.assertEqual(result.user_id, 8)
        deletion = next(
            call
            for call in uow.calls
            if call[0] == "execute" and "DELETE FROM auth_identities" in call[1]
        )
        self.assertEqual(deletion[2], ("identity-unionid", 8))

    def test_wechat_primary_and_legacy_keys_owned_by_different_accounts_are_blocked(self):
        from src.modules.identity.errors import IdentityDomainError
        from src.modules.identity.repository import MySqlIdentityRepository

        uow = ScriptedUnitOfWork(
            identity_rows=[
                {
                    "id": "identity-primary",
                    "user_id": 8,
                    "issuer": "https://open.weixin.qq.com/app/wechat-app",
                    "subject": "wechat-openid",
                    "identity_status": 1,
                    "user_status": 1,
                },
                {
                    "id": "identity-unionid",
                    "user_id": 9,
                    "issuer": "https://open.weixin.qq.com/unionid",
                    "subject": "wechat-unionid",
                    "identity_status": 1,
                    "user_status": 1,
                },
            ]
        )
        repository = MySqlIdentityRepository(ScriptedDb(uow))

        with self.assertRaises(IdentityDomainError) as raised:
            repository.resolve_provider_identity(
                wechat_profile(),
                [],
                "unusable-hash",
            )

        self.assertEqual(raised.exception.code, "AUTH_IDENTITY_CONFLICT")
        self.assertTrue(uow.committed)
        self.assertFalse(
            any(
                call[0] == "execute"
                and (
                    "UPDATE auth_identities SET issuer" in call[1]
                    or "DELETE FROM auth_identities" in call[1]
                )
                for call in uow.calls
            )
        )
        event = next(
            call
            for call in uow.calls
            if call[0] == "execute" and "INSERT INTO auth_security_events" in call[1]
        )
        self.assertIn("legacy_identity_owned_by_another_account", event[2][5])

    def test_verified_phone_links_a_new_provider_identity_to_the_existing_owner(self):
        from src.modules.identity.repository import MySqlIdentityRepository

        phone = "+8613800138000"
        uow = ScriptedUnitOfWork(
            contacts={("phone", phone): {"id": "contact-1", "user_id": 7, "status": 1}}
        )
        repository = MySqlIdentityRepository(ScriptedDb(uow))

        result = repository.resolve_provider_identity(
            profile(phone=phone, phone_verified=True),
            [("phone", phone)],
            "unusable-hash",
        )

        self.assertEqual(result.user_id, 7)
        self.assertFalse(result.account_created)
        self.assertEqual(result.linked_by, "verified_phone")
        self.assertFalse(any("INSERT INTO users" in call[1] for call in uow.calls))
        identity_insert = next(
            call for call in uow.calls if call[0] == "execute" and "INSERT INTO auth_identities" in call[1]
        )
        self.assertEqual(identity_insert[2][1], 7)
        self.assertTrue(uow.committed)

    def test_unverified_profile_phone_never_drives_account_linking(self):
        from src.modules.identity.repository import MySqlIdentityRepository

        phone = "+8613800138000"
        uow = ScriptedUnitOfWork(
            contacts={("phone", phone): {"id": "contact-1", "user_id": 7, "status": 1}}
        )
        repository = MySqlIdentityRepository(ScriptedDb(uow))

        result = repository.resolve_provider_identity(
            profile(phone=phone, phone_verified=False),
            [],
            "unusable-hash",
        )

        self.assertEqual(result.user_id, 42)
        self.assertTrue(result.account_created)
        self.assertEqual(result.linked_by, "new_account")
        self.assertTrue(any("INSERT INTO users" in call[1] for call in uow.calls))

    def test_existing_provider_subject_wins_and_conflicting_phone_is_not_merged(self):
        from src.modules.identity.repository import MySqlIdentityRepository

        phone = "+8613800138000"
        uow = ScriptedUnitOfWork(
            identity={"id": "identity-1", "user_id": 3, "status": 1},
            contacts={("phone", phone): {"id": "contact-1", "user_id": 7, "status": 1}},
        )
        repository = MySqlIdentityRepository(ScriptedDb(uow))

        def password_hash_must_stay_lazy():
            self.fail("existing identities must not pay the PBKDF cost")

        result = repository.resolve_provider_identity(
            profile(phone=phone, phone_verified=True),
            [("phone", phone)],
            password_hash_must_stay_lazy,
        )

        self.assertEqual(result.user_id, 3)
        self.assertEqual(result.linked_by, "identity")
        self.assertTrue(
            any(
                call[0] == "execute"
                and "INSERT INTO auth_security_events" in call[1]
                and call[2][2] == "contact_link_conflict"
                for call in uow.calls
            )
        )

    def test_disabled_provider_identity_cannot_authenticate_and_is_audited(self):
        from src.modules.identity.errors import IdentityDomainError
        from src.modules.identity.repository import MySqlIdentityRepository

        uow = ScriptedUnitOfWork(
            identity={
                "id": "identity-1",
                "user_id": 3,
                "identity_status": 0,
                "user_status": 1,
            }
        )
        repository = MySqlIdentityRepository(ScriptedDb(uow))

        with self.assertRaises(IdentityDomainError) as raised:
            repository.resolve_provider_identity(profile(), [], "unusable-hash")

        self.assertEqual(raised.exception.code, "AUTH_IDENTITY_DISABLED")
        self.assertTrue(uow.committed)
        self.assertFalse(
            any(
                call[0] == "execute" and "UPDATE auth_identities" in call[1]
                for call in uow.calls
            )
        )
        event = next(
            call
            for call in uow.calls
            if call[0] == "execute" and "INSERT INTO auth_security_events" in call[1]
        )
        self.assertEqual(event[2][4], "blocked")
        self.assertIn("identity_disabled", event[2][5])

    def test_direct_email_otp_logs_into_the_verified_contact_owner(self):
        from src.modules.identity.repository import MySqlIdentityRepository

        email = "person@example.com"
        uow = ScriptedUnitOfWork(
            contacts={("email", email): {"id": "contact-2", "user_id": 9, "status": 1}}
        )
        repository = MySqlIdentityRepository(ScriptedDb(uow))

        result = repository.resolve_verified_contact("email", email, "unusable-hash")

        self.assertEqual(result.user_id, 9)
        self.assertEqual(result.linked_by, "verified_email")
        self.assertFalse(result.account_created)

    def test_disabled_contact_owner_is_never_reactivated_or_replaced(self):
        from src.modules.identity.errors import IdentityDomainError
        from src.modules.identity.repository import MySqlIdentityRepository

        phone = "+8613800138000"
        uow = ScriptedUnitOfWork(
            contacts={("phone", phone): {"id": "contact-1", "user_id": 7, "status": 0}}
        )
        repository = MySqlIdentityRepository(ScriptedDb(uow))

        with self.assertRaises(IdentityDomainError) as raised:
            repository.resolve_verified_contact("phone", phone, "unusable-hash")

        self.assertEqual(raised.exception.code, "AUTH_ACCOUNT_DISABLED")

    def test_otp_does_not_create_a_duplicate_for_a_legacy_raw_contact(self):
        from src.modules.identity.errors import IdentityDomainError
        from src.modules.identity.repository import MySqlIdentityRepository

        email = "legacy@example.com"
        uow = ScriptedUnitOfWork(
            legacy_contacts={
                ("email", email): {"user_id": 12, "status": 1}
            }
        )
        repository = MySqlIdentityRepository(ScriptedDb(uow))

        with self.assertRaises(IdentityDomainError) as raised:
            repository.resolve_verified_contact("email", email, "unusable-hash")

        self.assertEqual(
            raised.exception.code,
            "AUTH_LEGACY_CONTACT_REQUIRES_VERIFICATION",
        )
        self.assertFalse(
            any("INSERT INTO users" in call[1] for call in uow.calls)
        )
        self.assertTrue(uow.committed)

    def test_owner_can_promote_its_legacy_raw_contact_after_step_up_otp(self):
        from src.modules.identity.repository import MySqlIdentityRepository

        phone = "+8613800138000"
        uow = ScriptedUnitOfWork(
            account={"id": 5, "status": 1},
            legacy_contacts={
                ("phone", "13800138000"): {"user_id": 5, "status": 1}
            },
        )
        repository = MySqlIdentityRepository(ScriptedDb(uow))

        repository.attach_verified_contact(5, "phone", phone, "site_otp")

        self.assertEqual(uow.contacts[("phone", phone)]["user_id"], 5)

    def test_authenticated_owner_can_attach_a_new_verified_phone(self):
        from src.modules.identity.repository import MySqlIdentityRepository

        phone = "+8613800138000"
        uow = ScriptedUnitOfWork(account={"id": 5, "status": 1})
        repository = MySqlIdentityRepository(ScriptedDb(uow))

        repository.attach_verified_contact(5, "phone", phone, "site_otp")

        self.assertEqual(uow.contacts[("phone", phone)]["user_id"], 5)
        self.assertTrue(uow.committed)
        self.assertTrue(
            any(
                call[0] == "execute"
                and "INSERT INTO auth_security_events" in call[1]
                and call[2][2] == "verified_contact_linked"
                for call in uow.calls
            )
        )

    def test_authenticated_owner_cannot_claim_another_accounts_contact(self):
        from src.modules.identity.errors import IdentityDomainError
        from src.modules.identity.repository import MySqlIdentityRepository

        email = "owner@example.com"
        uow = ScriptedUnitOfWork(
            account={"id": 5, "status": 1},
            contacts={
                ("email", email): {"id": "contact-2", "user_id": 9, "status": 1}
            },
        )
        repository = MySqlIdentityRepository(ScriptedDb(uow))

        with self.assertRaises(IdentityDomainError) as raised:
            repository.attach_verified_contact(5, "email", email, "site_otp")

        self.assertEqual(raised.exception.code, "AUTH_CONTACT_CONFLICT")

    def test_authenticated_owner_can_connect_a_new_provider_identity_and_contacts(self):
        from src.modules.identity.repository import MySqlIdentityRepository

        phone = "+8613800138000"
        email = "person@example.com"
        uow = ScriptedUnitOfWork(account={"id": 5, "status": 1})
        repository = MySqlIdentityRepository(ScriptedDb(uow))

        result = repository.attach_provider_identity(
            5,
            profile(
                phone=phone,
                phone_verified=True,
                email=email,
                email_verified=True,
            ),
            [("phone", phone), ("email", email)],
        )

        self.assertEqual(result.user_id, 5)
        self.assertEqual(result.linked_by, "identity")
        identity_insert = next(
            call
            for call in uow.calls
            if call[0] == "execute" and "INSERT INTO auth_identities" in call[1]
        )
        self.assertEqual(identity_insert[2][1], 5)
        self.assertEqual(uow.contacts[("phone", phone)]["user_id"], 5)
        self.assertEqual(uow.contacts[("email", email)]["user_id"], 5)
        self.assertTrue(uow.committed)

    def test_connecting_an_identity_owned_by_another_account_is_blocked_and_audited(self):
        from src.modules.identity.errors import IdentityDomainError
        from src.modules.identity.repository import MySqlIdentityRepository

        uow = ScriptedUnitOfWork(
            account={"id": 5, "status": 1},
            identity={"id": "identity-1", "user_id": 9, "status": 1},
        )
        repository = MySqlIdentityRepository(ScriptedDb(uow))

        with self.assertRaises(IdentityDomainError) as raised:
            repository.attach_provider_identity(5, profile(), [])

        self.assertEqual(raised.exception.code, "AUTH_IDENTITY_CONFLICT")
        self.assertEqual(raised.exception.status_code, 409)
        self.assertTrue(uow.committed)
        event = next(
            call
            for call in uow.calls
            if call[0] == "execute" and "INSERT INTO auth_security_events" in call[1]
        )
        self.assertEqual(event[2][2], "oauth_identity_connect_conflict")
        self.assertNotIn("subject-1", event[2][5])

    def test_connecting_a_provider_contact_owned_by_another_account_is_blocked(self):
        from src.modules.identity.errors import IdentityDomainError
        from src.modules.identity.repository import MySqlIdentityRepository

        email = "owner@example.com"
        uow = ScriptedUnitOfWork(
            account={"id": 5, "status": 1},
            contacts={
                ("email", email): {"id": "contact-2", "user_id": 9, "status": 1}
            },
        )
        repository = MySqlIdentityRepository(ScriptedDb(uow))

        with self.assertRaises(IdentityDomainError) as raised:
            repository.attach_provider_identity(
                5,
                profile(email=email, email_verified=True),
                [("email", email)],
            )

        self.assertEqual(raised.exception.code, "AUTH_CONTACT_CONFLICT")
        self.assertEqual(raised.exception.status_code, 409)
        event = next(
            call
            for call in uow.calls
            if call[0] == "execute" and "INSERT INTO auth_security_events" in call[1]
        )
        self.assertEqual(event[2][2], "oauth_contact_connect_conflict")
        self.assertNotIn(email, event[2][5])
        self.assertFalse(
            any(
                call[0] == "execute" and "INSERT INTO auth_identities" in call[1]
                for call in uow.calls
            )
        )

    def test_reconnecting_the_same_identity_is_an_idempotent_owner_scoped_update(self):
        from src.modules.identity.repository import MySqlIdentityRepository

        email = "person@example.com"
        uow = ScriptedUnitOfWork(
            account={"id": 5, "status": 1},
            identity={"id": "identity-1", "user_id": 5, "status": 1},
            contacts={
                ("email", email): {"id": "contact-1", "user_id": 5, "status": 1}
            },
        )
        repository = MySqlIdentityRepository(ScriptedDb(uow))

        result = repository.attach_provider_identity(
            5,
            profile(email=email, email_verified=True),
            [("email", email)],
        )

        self.assertEqual(result.user_id, 5)
        updates = [
            call
            for call in uow.calls
            if call[0] == "execute" and "UPDATE auth_identities" in call[1]
        ]
        self.assertEqual(len(updates), 1)
        self.assertEqual(updates[0][2][-1], 5)
        self.assertNotIn("status = 1", updates[0][1].split("WHERE", 1)[0])
        self.assertFalse(
            any(
                call[0] == "execute"
                and (
                    "INSERT INTO auth_identities" in call[1]
                    or "INSERT INTO auth_verified_contacts" in call[1]
                )
                for call in uow.calls
            )
        )

    def test_disabled_owner_identity_cannot_be_revived_by_connect(self):
        from src.modules.identity.errors import IdentityDomainError
        from src.modules.identity.repository import MySqlIdentityRepository

        email = "person@example.com"
        uow = ScriptedUnitOfWork(
            account={"id": 5, "status": 1},
            identity={
                "id": "identity-1",
                "user_id": 5,
                "identity_status": 0,
                "status": 1,
            },
        )
        repository = MySqlIdentityRepository(ScriptedDb(uow))

        with self.assertRaises(IdentityDomainError) as raised:
            repository.attach_provider_identity(
                5,
                profile(email=email, email_verified=True),
                [("email", email)],
            )

        self.assertEqual(raised.exception.code, "AUTH_IDENTITY_DISABLED")
        self.assertEqual(raised.exception.status_code, 403)
        self.assertTrue(uow.committed)
        self.assertFalse(
            any(
                call[0] == "execute"
                and (
                    "UPDATE auth_identities" in call[1]
                    or "INSERT INTO auth_verified_contacts" in call[1]
                )
                for call in uow.calls
            )
        )
        event = next(
            call
            for call in uow.calls
            if call[0] == "execute" and "INSERT INTO auth_security_events" in call[1]
        )
        self.assertEqual(event[2][2], "oauth_identity_connect")
        self.assertEqual(event[2][4], "blocked")
        self.assertIn("identity_disabled", event[2][5])
        self.assertNotIn(email, event[2][5])


if __name__ == "__main__":
    unittest.main()
