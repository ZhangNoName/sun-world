from __future__ import annotations

import json
from typing import Callable, Protocol
from uuid import uuid4

import pymysql

from .errors import IdentityDomainError
from .normalization import mask_contact
from .schemas import (
    AccountConnections,
    ExternalIdentityProfile,
    IdentityResolution,
    LinkedIdentity,
    VerifiedContact,
)


VerifiedContactValue = tuple[str, str]
PasswordHashSource = str | Callable[[], str]


class IdentityRepository(Protocol):
    def resolve_provider_identity(
        self,
        profile: ExternalIdentityProfile,
        verified_contacts: list[VerifiedContactValue],
        password_hash: PasswordHashSource,
    ) -> IdentityResolution: ...

    def resolve_verified_contact(
        self,
        kind: str,
        value: str,
        password_hash: PasswordHashSource,
    ) -> IdentityResolution: ...

    def list_connections(self, user_id: int) -> AccountConnections: ...

    def attach_verified_contact(
        self,
        user_id: int,
        kind: str,
        value: str,
        source: str,
    ) -> None: ...

    def attach_provider_identity(
        self,
        user_id: int,
        profile: ExternalIdentityProfile,
        verified_contacts: list[VerifiedContactValue],
    ) -> IdentityResolution: ...


def _identifier(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex}"


class MySqlIdentityRepository:
    """Identity persistence and account-link decisions in one MySQL UoW."""

    def __init__(self, db):
        self.db = db

    @staticmethod
    def _materialize_password_hash(source: PasswordHashSource) -> str:
        value = source() if callable(source) else source
        if not isinstance(value, str) or not value:
            raise IdentityDomainError(
                "AUTH_CONFIGURATION_ERROR",
                "账户密码初始化失败。",
                status_code=503,
            )
        return value

    @staticmethod
    def _ensure_active(row: dict | None) -> dict | None:
        if row and not bool(row.get("status")):
            raise IdentityDomainError(
                "AUTH_ACCOUNT_DISABLED",
                "该账户已停用。",
                status_code=403,
            )
        return row

    @staticmethod
    def _create_account(uow, display_name: str, password_hash: str) -> int:
        suffix = uuid4().hex
        name = " ".join(str(display_name or "Sun World User").split())[:255]
        user_id = uow.execute(
            "INSERT INTO users "
            "(username, name, sex, age, phone, email, password, birth_day, create_time, status) "
            "VALUES (%s, %s, 0, 0, '', %s, %s, %s, NOW(), 1)",
            (
                f"user_{suffix[:20]}",
                name or "Sun World User",
                f"identity-{suffix}@users.invalid",
                password_hash,
                "1970-01-01",
            ),
        )
        role = uow.fetch_one(
            "SELECT id FROM roles WHERE code = %s LIMIT 1 FOR UPDATE",
            ("normal",),
        )
        if not role:
            raise IdentityDomainError(
                "AUTH_CONFIGURATION_ERROR",
                "账户默认角色尚未配置。",
                status_code=503,
            )
        uow.execute(
            "INSERT INTO user_roles (user_id, role_id) VALUES (%s, %s)",
            (user_id, role["id"]),
        )
        return int(user_id)

    @staticmethod
    def _record_event(
        uow,
        *,
        user_id: int | None,
        event_type: str,
        provider: str | None,
        outcome: str,
        metadata: dict | None = None,
    ) -> None:
        uow.execute(
            "INSERT INTO auth_security_events "
            "(id, user_id, event_type, provider, outcome, metadata_json) "
            "VALUES (%s, %s, %s, %s, %s, %s)",
            (
                _identifier("evt"),
                user_id,
                event_type,
                provider,
                outcome,
                json.dumps(metadata or {}, ensure_ascii=True, separators=(",", ":")),
            ),
        )

    @staticmethod
    def _find_contact(uow, kind: str, value: str) -> dict | None:
        return uow.fetch_one(
            "SELECT c.id, c.user_id, u.status "
            "FROM auth_verified_contacts c "
            "JOIN users u ON u.id = c.user_id "
            "WHERE c.kind = %s AND c.normalized_value = %s "
            "LIMIT 1 FOR UPDATE",
            (kind, value),
        )

    @staticmethod
    def _find_legacy_contact(uow, kind: str, value: str) -> dict | None:
        """Find pre-canonical raw contacts without treating them as verified."""
        if kind == "email":
            return uow.fetch_one(
                "SELECT id AS user_id, status FROM users "
                "WHERE LOWER(email) = %s AND email NOT LIKE %s "
                "LIMIT 1 FOR UPDATE",
                (value.lower(), "%@users.invalid"),
            )
        candidates = [value]
        if value.startswith("+86") and len(value) == 14:
            candidates.append(value[3:])
        return uow.fetch_one(
            "SELECT id AS user_id, status FROM users "
            "WHERE phone IN (%s, %s) AND phone <> '' "
            "LIMIT 1 FOR UPDATE",
            (candidates[0], candidates[-1]),
        )

    def _attach_contacts(
        self,
        uow,
        *,
        user_id: int,
        contacts: list[VerifiedContactValue],
        source: str,
    ) -> None:
        for kind, value in contacts:
            existing = self._find_contact(uow, kind, value)
            if existing:
                if int(existing["user_id"]) != user_id:
                    self._record_event(
                        uow,
                        user_id=user_id,
                        event_type="contact_link_conflict",
                        provider=source,
                        outcome="blocked",
                        metadata={"kind": kind},
                    )
                continue
            legacy = self._find_legacy_contact(uow, kind, value)
            if legacy and int(legacy["user_id"]) != user_id:
                self._record_event(
                    uow,
                    user_id=user_id,
                    event_type="contact_link_conflict",
                    provider=source,
                    outcome="blocked",
                    metadata={"kind": kind, "reason": "legacy_contact"},
                )
                continue
            uow.execute(
                "INSERT INTO auth_verified_contacts "
                "(id, user_id, kind, normalized_value, display_value, verification_source, verified_at) "
                "VALUES (%s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP(6))",
                (_identifier("contact"), user_id, kind, value, value, source),
            )

    @staticmethod
    def _provider_identity_keys(
        profile: ExternalIdentityProfile,
    ) -> list[tuple[str, str]]:
        keys = [(profile.issuer, profile.subject)]
        for legacy_key in profile.legacy_identity_keys:
            candidate = (legacy_key.issuer, legacy_key.subject)
            if candidate not in keys:
                keys.append(candidate)
        return keys

    def _find_and_migrate_provider_identity(
        self,
        uow,
        profile: ExternalIdentityProfile,
        *,
        conflict_event_type: str,
        actor_user_id: int | None = None,
    ) -> dict | None:
        """Lock the primary/legacy keys and converge a legacy row atomically.

        Most providers have one key and retain the original single-index query.
        WeChat profiles can also carry the former UnionID key.  In that case an
        existing UnionID row is rewritten to the stable app/OpenID key before
        the caller makes its login/connect decision.
        """
        keys = self._provider_identity_keys(profile)
        select = (
            "SELECT i.id, i.user_id, i.issuer, i.subject, "
            "i.status AS identity_status, u.status AS user_status "
            "FROM auth_identities i JOIN users u ON u.id = i.user_id "
        )
        if len(keys) == 1:
            return uow.fetch_one(
                select
                + "WHERE i.provider = %s AND i.issuer = %s AND i.subject = %s "
                "LIMIT 1 FOR UPDATE",
                (profile.provider, profile.issuer, profile.subject),
            )

        predicates = " OR ".join(
            "(i.issuer = %s AND i.subject = %s)" for _key in keys
        )
        params: list[str] = [profile.provider]
        for issuer, subject in keys:
            params.extend((issuer, subject))
        rows = uow.fetch_all(
            select
            + f"WHERE i.provider = %s AND ({predicates}) "
            "ORDER BY i.id FOR UPDATE",
            tuple(params),
        )
        if not rows:
            return None

        owner_ids = {int(row["user_id"]) for row in rows}
        if len(owner_ids) != 1:
            self._record_event(
                uow,
                user_id=actor_user_id,
                event_type=conflict_event_type,
                provider=profile.provider,
                outcome="blocked",
                metadata={"reason": "legacy_identity_owned_by_another_account"},
            )
            uow.commit()
            raise IdentityDomainError(
                "AUTH_IDENTITY_CONFLICT",
                "该第三方身份存在历史关联冲突，请联系管理员处理。",
                status_code=409,
            )

        primary = next(
            (
                row
                for row in rows
                if row.get("issuer") == profile.issuer
                and row.get("subject") == profile.subject
            ),
            None,
        )
        user_id = next(iter(owner_ids))
        if primary:
            legacy_rows = [row for row in rows if row["id"] != primary["id"]]
            for legacy_row in legacy_rows:
                uow.execute(
                    "DELETE FROM auth_identities WHERE id = %s AND user_id = %s",
                    (legacy_row["id"], user_id),
                )
            if legacy_rows:
                self._record_event(
                    uow,
                    user_id=user_id,
                    event_type="oauth_identity_key_consolidated",
                    provider=profile.provider,
                    outcome="success",
                    metadata={"legacy_key_count": len(legacy_rows)},
                )
            return primary

        legacy = rows[0]
        uow.execute(
            "UPDATE auth_identities SET issuer = %s, subject = %s "
            "WHERE id = %s AND user_id = %s",
            (profile.issuer, profile.subject, legacy["id"], user_id),
        )
        self._record_event(
            uow,
            user_id=user_id,
            event_type="oauth_identity_key_migrated",
            provider=profile.provider,
            outcome="success",
            metadata={"from": "legacy_provider_key"},
        )
        migrated = dict(legacy)
        migrated["issuer"] = profile.issuer
        migrated["subject"] = profile.subject
        return migrated

    def _resolve_provider_once(
        self,
        profile: ExternalIdentityProfile,
        verified_contacts: list[VerifiedContactValue],
        password_hash: PasswordHashSource,
    ) -> IdentityResolution:
        with self.db.unit_of_work() as uow:
            identity = self._find_and_migrate_provider_identity(
                uow,
                profile,
                conflict_event_type="oauth_identity_key_conflict",
            )
            if identity:
                user_id = int(identity["user_id"])
                user_status = identity.get("user_status", identity.get("status"))
                identity_status = identity.get(
                    "identity_status",
                    identity.get("status"),
                )
                if not bool(user_status) or not bool(identity_status):
                    reason = (
                        "account_disabled"
                        if not bool(user_status)
                        else "identity_disabled"
                    )
                    self._record_event(
                        uow,
                        user_id=user_id,
                        event_type="oauth_login",
                        provider=profile.provider,
                        outcome="blocked",
                        metadata={"reason": reason},
                    )
                    uow.commit()
                    raise IdentityDomainError(
                        "AUTH_ACCOUNT_DISABLED"
                        if reason == "account_disabled"
                        else "AUTH_IDENTITY_DISABLED",
                        "该账户已停用。"
                        if reason == "account_disabled"
                        else "该第三方登录身份已停用。",
                        status_code=403,
                    )
                uow.execute(
                    "UPDATE auth_identities SET display_name = %s, avatar_url = %s, "
                    "last_authenticated_at = CURRENT_TIMESTAMP(6) WHERE id = %s",
                    (profile.display_name, profile.avatar_url, identity["id"]),
                )
                self._attach_contacts(
                    uow,
                    user_id=user_id,
                    contacts=verified_contacts,
                    source=profile.provider,
                )
                self._record_event(
                    uow,
                    user_id=user_id,
                    event_type="oauth_login",
                    provider=profile.provider,
                    outcome="success",
                    metadata={"linked_by": "identity"},
                )
                uow.commit()
                return IdentityResolution(
                    user_id=user_id,
                    account_created=False,
                    linked_by="identity",
                )

            verified_phone = next(
                (value for kind, value in verified_contacts if kind == "phone"),
                None,
            )
            contact = (
                self._ensure_active(self._find_contact(uow, "phone", verified_phone))
                if verified_phone
                else None
            )
            if contact:
                user_id = int(contact["user_id"])
                account_created = False
                linked_by = "verified_phone"
            else:
                for kind, value in verified_contacts:
                    legacy = self._find_legacy_contact(uow, kind, value)
                    if legacy:
                        self._record_event(
                            uow,
                            user_id=int(legacy["user_id"]),
                            event_type="oauth_login",
                            provider=profile.provider,
                            outcome="blocked",
                            metadata={
                                "kind": kind,
                                "reason": "legacy_contact_requires_verification",
                            },
                        )
                        uow.commit()
                        raise IdentityDomainError(
                            "AUTH_LEGACY_CONTACT_REQUIRES_VERIFICATION",
                            "该联系方式属于旧账户，请先使用用户名和密码登录原账户，再在账户中心完成验证。",
                            status_code=409,
                        )
                user_id = self._create_account(
                    uow,
                    profile.display_name,
                    self._materialize_password_hash(password_hash),
                )
                account_created = True
                linked_by = "new_account"

            uow.execute(
                "INSERT INTO auth_identities "
                "(id, user_id, provider, issuer, subject, display_name, avatar_url, profile_json, "
                "linked_at, last_authenticated_at, status) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP(6), CURRENT_TIMESTAMP(6), 1)",
                (
                    _identifier("identity"),
                    user_id,
                    profile.provider,
                    profile.issuer,
                    profile.subject,
                    profile.display_name,
                    profile.avatar_url,
                    json.dumps(
                        {
                            "email_verified": profile.email_verified,
                            "phone_verified": profile.phone_verified,
                        },
                        ensure_ascii=True,
                        separators=(",", ":"),
                    ),
                ),
            )
            self._attach_contacts(
                uow,
                user_id=user_id,
                contacts=verified_contacts,
                source=profile.provider,
            )
            self._record_event(
                uow,
                user_id=user_id,
                event_type="oauth_identity_linked" if not account_created else "oauth_account_created",
                provider=profile.provider,
                outcome="success",
                metadata={"linked_by": linked_by},
            )
            uow.commit()
            return IdentityResolution(
                user_id=user_id,
                account_created=account_created,
                linked_by=linked_by,
            )

    def resolve_provider_identity(
        self,
        profile: ExternalIdentityProfile,
        verified_contacts: list[VerifiedContactValue],
        password_hash: PasswordHashSource,
    ) -> IdentityResolution:
        for attempt in range(2):
            try:
                return self._resolve_provider_once(
                    profile,
                    verified_contacts,
                    password_hash,
                )
            except pymysql.err.IntegrityError:
                if attempt:
                    raise IdentityDomainError(
                        "AUTH_IDENTITY_CONFLICT",
                        "该登录身份或联系方式已关联其他账户。",
                        status_code=409,
                    )
        raise AssertionError("unreachable")

    def _attach_provider_identity_once(
        self,
        user_id: int,
        profile: ExternalIdentityProfile,
        verified_contacts: list[VerifiedContactValue],
    ) -> IdentityResolution:
        """Attach one provider subject to an authenticated owner without merging."""
        with self.db.unit_of_work() as uow:
            account = self._ensure_active(
                uow.fetch_one(
                    "SELECT id, status FROM users WHERE id = %s LIMIT 1 FOR UPDATE",
                    (user_id,),
                )
            )
            if not account:
                raise IdentityDomainError(
                    "AUTH_ACCOUNT_NOT_FOUND",
                    "账户不存在。",
                    status_code=404,
                )

            identity = self._find_and_migrate_provider_identity(
                uow,
                profile,
                conflict_event_type="oauth_identity_connect_conflict",
                actor_user_id=user_id,
            )
            if identity and int(identity["user_id"]) != user_id:
                self._record_event(
                    uow,
                    user_id=user_id,
                    event_type="oauth_identity_connect_conflict",
                    provider=profile.provider,
                    outcome="blocked",
                    metadata={"reason": "identity_owned_by_another_account"},
                )
                uow.commit()
                raise IdentityDomainError(
                    "AUTH_IDENTITY_CONFLICT",
                    "该第三方身份已关联其他账户。请先登录原账户处理。",
                    status_code=409,
                )

            if identity and not bool(
                identity.get("identity_status", identity.get("status"))
            ):
                self._record_event(
                    uow,
                    user_id=user_id,
                    event_type="oauth_identity_connect",
                    provider=profile.provider,
                    outcome="blocked",
                    metadata={"reason": "identity_disabled"},
                )
                uow.commit()
                raise IdentityDomainError(
                    "AUTH_IDENTITY_DISABLED",
                    "该第三方登录身份已停用，无法自行重新启用。",
                    status_code=403,
                )

            contact_rows: list[tuple[str, str, dict | None]] = []
            for kind, value in verified_contacts:
                existing = self._find_contact(uow, kind, value)
                if existing and int(existing["user_id"]) != user_id:
                    self._record_event(
                        uow,
                        user_id=user_id,
                        event_type="oauth_contact_connect_conflict",
                        provider=profile.provider,
                        outcome="blocked",
                        metadata={"kind": kind},
                    )
                    uow.commit()
                    raise IdentityDomainError(
                        "AUTH_CONTACT_CONFLICT",
                        "第三方身份返回的已验证联系方式已关联其他账户。请先登录原账户处理。",
                        status_code=409,
                    )
                legacy = self._find_legacy_contact(uow, kind, value)
                if legacy and int(legacy["user_id"]) != user_id:
                    self._record_event(
                        uow,
                        user_id=user_id,
                        event_type="oauth_contact_connect_conflict",
                        provider=profile.provider,
                        outcome="blocked",
                        metadata={"kind": kind, "reason": "legacy_contact"},
                    )
                    uow.commit()
                    raise IdentityDomainError(
                        "AUTH_CONTACT_CONFLICT",
                        "第三方身份返回的联系方式属于其他旧账户。请先登录原账户处理。",
                        status_code=409,
                    )
                contact_rows.append((kind, value, existing))

            profile_json = json.dumps(
                {
                    "email_verified": profile.email_verified,
                    "phone_verified": profile.phone_verified,
                },
                ensure_ascii=True,
                separators=(",", ":"),
            )
            if identity:
                uow.execute(
                    "UPDATE auth_identities SET display_name = %s, avatar_url = %s, "
                    "profile_json = %s, last_authenticated_at = CURRENT_TIMESTAMP(6) "
                    "WHERE id = %s AND user_id = %s AND status = 1",
                    (
                        profile.display_name,
                        profile.avatar_url,
                        profile_json,
                        identity["id"],
                        user_id,
                    ),
                )
            else:
                uow.execute(
                    "INSERT INTO auth_identities "
                    "(id, user_id, provider, issuer, subject, display_name, avatar_url, profile_json, "
                    "linked_at, last_authenticated_at, status) "
                    "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, "
                    "CURRENT_TIMESTAMP(6), CURRENT_TIMESTAMP(6), 1)",
                    (
                        _identifier("identity"),
                        user_id,
                        profile.provider,
                        profile.issuer,
                        profile.subject,
                        profile.display_name,
                        profile.avatar_url,
                        profile_json,
                    ),
                )

            for kind, value, existing in contact_rows:
                if existing:
                    continue
                uow.execute(
                    "INSERT INTO auth_verified_contacts "
                    "(id, user_id, kind, normalized_value, display_value, "
                    "verification_source, verified_at) "
                    "VALUES (%s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP(6))",
                    (
                        _identifier("contact"),
                        user_id,
                        kind,
                        value,
                        value,
                        profile.provider,
                    ),
                )

            self._record_event(
                uow,
                user_id=user_id,
                event_type="oauth_identity_connected",
                provider=profile.provider,
                outcome="success",
                metadata={
                    "identity_existing": bool(identity),
                    "contact_kinds": [kind for kind, _value, _row in contact_rows],
                },
            )
            uow.commit()
            return IdentityResolution(
                user_id=user_id,
                account_created=False,
                linked_by="identity",
            )

    def attach_provider_identity(
        self,
        user_id: int,
        profile: ExternalIdentityProfile,
        verified_contacts: list[VerifiedContactValue],
    ) -> IdentityResolution:
        for attempt in range(2):
            try:
                return self._attach_provider_identity_once(
                    user_id,
                    profile,
                    verified_contacts,
                )
            except pymysql.err.IntegrityError:
                if attempt:
                    raise IdentityDomainError(
                        "AUTH_IDENTITY_CONFLICT",
                        "该第三方身份或联系方式已关联其他账户。",
                        status_code=409,
                    )
        raise AssertionError("unreachable")

    def _resolve_contact_once(
        self,
        kind: str,
        value: str,
        password_hash: PasswordHashSource,
    ) -> IdentityResolution:
        with self.db.unit_of_work() as uow:
            contact = self._ensure_active(self._find_contact(uow, kind, value))
            if contact:
                user_id = int(contact["user_id"])
                account_created = False
            else:
                legacy = self._find_legacy_contact(uow, kind, value)
                if legacy:
                    self._record_event(
                        uow,
                        user_id=int(legacy["user_id"]),
                        event_type="verification_login",
                        provider=kind,
                        outcome="blocked",
                        metadata={"reason": "legacy_contact_requires_verification"},
                    )
                    uow.commit()
                    raise IdentityDomainError(
                        "AUTH_LEGACY_CONTACT_REQUIRES_VERIFICATION",
                        "该联系方式属于旧账户，请先使用用户名和密码登录原账户，再在账户中心完成验证。",
                        status_code=409,
                    )
                display_name = "Phone User" if kind == "phone" else "Email User"
                user_id = self._create_account(
                    uow,
                    display_name,
                    self._materialize_password_hash(password_hash),
                )
                uow.execute(
                    "INSERT INTO auth_verified_contacts "
                    "(id, user_id, kind, normalized_value, display_value, verification_source, verified_at) "
                    "VALUES (%s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP(6))",
                    (_identifier("contact"), user_id, kind, value, value, "site_otp"),
                )
                account_created = True
            self._record_event(
                uow,
                user_id=user_id,
                event_type="verification_login",
                provider=kind,
                outcome="success",
                metadata={"account_created": account_created},
            )
            uow.commit()
            return IdentityResolution(
                user_id=user_id,
                account_created=account_created,
                linked_by=("new_account" if account_created else f"verified_{kind}"),
            )

    def resolve_verified_contact(
        self,
        kind: str,
        value: str,
        password_hash: PasswordHashSource,
    ) -> IdentityResolution:
        for attempt in range(2):
            try:
                return self._resolve_contact_once(kind, value, password_hash)
            except pymysql.err.IntegrityError:
                if attempt:
                    raise IdentityDomainError(
                        "AUTH_CONTACT_CONFLICT",
                        "该联系方式已关联其他账户。",
                        status_code=409,
                    )
        raise AssertionError("unreachable")

    def _attach_verified_contact_once(
        self,
        user_id: int,
        kind: str,
        value: str,
        source: str,
    ) -> None:
        with self.db.unit_of_work() as uow:
            account = self._ensure_active(
                uow.fetch_one(
                    "SELECT id, status FROM users WHERE id = %s LIMIT 1 FOR UPDATE",
                    (user_id,),
                )
            )
            if not account:
                raise IdentityDomainError(
                    "AUTH_ACCOUNT_NOT_FOUND",
                    "账户不存在。",
                    status_code=404,
                )
            existing = self._find_contact(uow, kind, value)
            if existing:
                if int(existing["user_id"]) != user_id:
                    self._record_event(
                        uow,
                        user_id=user_id,
                        event_type="contact_link_conflict",
                        provider=source,
                        outcome="blocked",
                        metadata={"kind": kind},
                    )
                    uow.commit()
                    raise IdentityDomainError(
                        "AUTH_CONTACT_CONFLICT",
                        "该联系方式已关联其他账户。请先登录原账户处理。",
                        status_code=409,
                    )
                return

            legacy = self._find_legacy_contact(uow, kind, value)
            if legacy and int(legacy["user_id"]) != user_id:
                self._record_event(
                    uow,
                    user_id=user_id,
                    event_type="contact_link_conflict",
                    provider=source,
                    outcome="blocked",
                    metadata={"kind": kind, "reason": "legacy_contact"},
                )
                uow.commit()
                raise IdentityDomainError(
                    "AUTH_CONTACT_CONFLICT",
                    "该联系方式属于其他旧账户。请先登录原账户处理。",
                    status_code=409,
                )

            uow.execute(
                "INSERT INTO auth_verified_contacts "
                "(id, user_id, kind, normalized_value, display_value, verification_source, verified_at) "
                "VALUES (%s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP(6))",
                (_identifier("contact"), user_id, kind, value, value, source),
            )
            self._record_event(
                uow,
                user_id=user_id,
                event_type="verified_contact_linked",
                provider=source,
                outcome="success",
                metadata={"kind": kind},
            )
            uow.commit()

    def attach_verified_contact(
        self,
        user_id: int,
        kind: str,
        value: str,
        source: str,
    ) -> None:
        for attempt in range(2):
            try:
                self._attach_verified_contact_once(user_id, kind, value, source)
                return
            except pymysql.err.IntegrityError:
                if attempt:
                    raise IdentityDomainError(
                        "AUTH_CONTACT_CONFLICT",
                        "该联系方式已关联其他账户。",
                        status_code=409,
                    )

    def list_connections(self, user_id: int) -> AccountConnections:
        identity_rows = self.db.fetch_all(
            "SELECT id, provider, display_name, avatar_url, linked_at, last_authenticated_at "
            "FROM auth_identities WHERE user_id = %s AND status = 1 "
            "ORDER BY linked_at ASC, id ASC",
            (user_id,),
        )
        contact_rows = self.db.fetch_all(
            "SELECT id, kind, normalized_value, verification_source, verified_at "
            "FROM auth_verified_contacts WHERE user_id = %s "
            "ORDER BY verified_at ASC, id ASC",
            (user_id,),
        )
        return AccountConnections(
            identities=[LinkedIdentity(**row) for row in identity_rows],
            contacts=[
                VerifiedContact(
                    id=row["id"],
                    kind=row["kind"],
                    value_hint=mask_contact(row["kind"], row["normalized_value"]),
                    verification_source=row["verification_source"],
                    verified_at=row["verified_at"],
                )
                for row in contact_rows
            ],
        )
