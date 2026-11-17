"""Credential-authenticated management writes and private commit authorization."""

import hmac
import time

from pydantic import BaseModel, ValidationError

from src.controller.role_manager import RoleManager
from src.controller.resource_manager import ResourceManager
from src.core.auth import AuthorizationDenied, AuthorizationUnavailable
from src.core.auth.session import SessionAuthenticator
from src.core.auth.recent import step_up_max_age_seconds
from src.core.auth.admin_audit import (
    AdminAuditTargetError, AdminAuditUnavailableError, admin_audit_target,
    create_admin_audit_context, validate_admin_audit_context,
)
from src.core.auth.admin_recovery import LastAdministratorError
from src.core.request_context import get_request_id
from src.type.user_type import User
from .policy import (
    CAPABILITIES, ManagementScope, ManagementPolicy, ManagementDenied,
    ManagementLoginRequired, ManagementUnavailable, ManagementInputInvalid,
)
from .schemas import PARAMETER_SCHEMAS
from .targets import BindingReferences


class _WriteAuthorization:
    def __init__(self, service, token, action, scope, target_id, audit, initial, references=None):
        self.service, self.token = service, token
        self.action, self.scope, self.target_id = action, scope, target_id
        self.audit, self.initial, self.locked = audit, initial, None
        self.references = references

    def before(self, uow):
        uow.fetch_all('SELECT id, code FROM roles FORCE INDEX (PRIMARY) ORDER BY id FOR UPDATE')
        uow.fetch_one('SELECT id FROM users WHERE id = %s FOR UPDATE', (self.initial.user_id,))
        uow.fetch_all('SELECT role_id FROM user_roles WHERE user_id = %s ORDER BY role_id FOR UPDATE',
                      (self.initial.user_id,))
        current = self.service._current(self.token, uow)
        if (current.user_id != self.initial.user_id or current.session_family != self.initial.session_family):
            raise ManagementLoginRequired()
        self.service._require(current, self.action, self.scope, self.target_id)
        self.service._audit_for(current, self.audit)
        if self.references is not None:
            self.references.require_existing(uow)
        self.locked = current

    def before_commit(self, uow):
        if self.locked is None or uow.isolation_level != 'READ COMMITTED':
            raise ManagementUnavailable()
        try:
            active = self.service.auth_manager.verify_token(self.token, 'access', check_redis=True)
        except Exception:
            raise ManagementUnavailable() from None
        if active != str(self.locked.user_id):
            raise ManagementLoginRequired()
        # Use the database snapshot already protected by our row locks. This
        # permits intentional self-demotion in this very transaction.
        self.service._require(self.locked, self.action, self.scope, self.target_id)
        self.service._audit_for(self.locked, self.audit)


class AdminManagementService:
    supported_actions = frozenset(PARAMETER_SCHEMAS)
    def __init__(self, auth_manager, *, user_manager=None, role_manager=None,
                 resource_manager=None, clock=time.time):
        self.auth_manager = auth_manager
        try:
            self.users = user_manager if user_manager is not None else auth_manager.user_manager
            self.database = self.users.db
            self.roles = role_manager if role_manager is not None else RoleManager(self.database)
            self.resources = resource_manager if resource_manager is not None else ResourceManager(self.database)
            if (self.auth_manager.user_manager.db is not self.database or self.roles.db is not self.database
                    or self.resources.db is not self.database or not callable(clock)):
                raise ManagementUnavailable()
        except Exception:
            raise ManagementUnavailable() from None
        self.clock, self.policy = clock, ManagementPolicy()
        self.authenticator = SessionAuthenticator(auth_manager)

    def _current(self, token, uow):
        try:
            return self.authenticator.authenticate(token, uow=uow, request_id=get_request_id() or None)
        except AuthorizationUnavailable:
            raise ManagementUnavailable() from None
        except AuthorizationDenied:
            raise ManagementLoginRequired() from None

    def _require(self, principal, action, scope, target_id):
        try:
            now, age = self.clock(), step_up_max_age_seconds()
        except Exception:
            raise ManagementUnavailable() from None
        self.policy.require(principal, action, scope, target_id, now=now, max_age=age)

    def _audit_for(self, principal, audit):
        expected = create_admin_audit_context(actor_user_id=principal.user_id,
            session_family_id=principal.session_family, request_id=principal.request_id)
        if audit is None:
            return expected
        try:
            validate_admin_audit_context(audit)
        except AdminAuditUnavailableError:
            raise ManagementDenied() from None
        if (audit.actor_user_id != principal.user_id
                or not hmac.compare_digest(audit.session_ref, expected.session_ref)):
            raise ManagementDenied()
        return audit

    def execute(self, access_token, action, parameters=None, *, target_id=None, scope=None, audit=None):
        if type(action) is not str or action not in CAPABILITIES:
            raise ManagementDenied()
        scope = scope if scope is not None else ManagementScope('sun-world', action.split('.')[0])
        if not action.endswith('.create'):
            if action.startswith('user.'):
                target_id = admin_audit_target(target_id)
            else:
                if type(target_id) is not int:
                    raise AdminAuditTargetError()
                target_id = admin_audit_target(target_id)
        self.policy.require_scope(action, scope, target_id)
        if type(access_token) is not str or not access_token or len(access_token) > 4096:
            raise ManagementLoginRequired()
        try:
            # This read-only UOW ends before the manager opens its write UOW.
            with self.database.unit_of_work(isolation_level='READ COMMITTED') as uow:
                principal = self._current(access_token, uow)
                self._require(principal, action, scope, target_id)
                audit = self._audit_for(principal, audit)
            raw = parameters.model_dump() if isinstance(parameters, BaseModel) else parameters
            if raw is None:
                raw = {}
            if type(raw) is not dict:
                raise ManagementInputInvalid()
            try:
                params = PARAMETER_SCHEMAS[action].model_validate(raw)
            except (ValidationError, TypeError, ValueError):
                raise ManagementInputInvalid() from None
            if action in {'role.update', 'resource.update'} and not params.model_dump(exclude_none=True):
                raise ManagementInputInvalid()
            references = BindingReferences(target_id, tuple(params.resource_ids)) if action == 'role.bind_resources' else None
            authorization = _WriteAuthorization(self, access_token, action, scope, target_id, audit, principal, references)
            kwargs = {'audit': audit, 'authorization': authorization}
            if action == 'user.create':
                created = self.auth_manager.register_user(params, **kwargs)
                if created and isinstance(parameters, User):
                    parameters.id = params.id
                return created
            if action == 'user.disable':
                return self.users.delete_user(target_id, **kwargs)
            if action == 'role.create':
                return self.roles.create_role(params.model_dump(), **kwargs)
            if action == 'role.update':
                return self.roles.update_role(target_id, **params.model_dump(exclude_none=True), **kwargs)
            if action == 'role.delete':
                return self.roles.delete_role(target_id, **kwargs)
            if action == 'role.bind_resources':
                return self.roles.bind_resources(target_id, references.resource_ids, **kwargs)
            if action == 'resource.create':
                return self.resources.create_resource(params.model_dump(), **kwargs)
            if action == 'resource.update':
                return self.resources.update_resource(target_id, **params.model_dump(exclude_none=True), **kwargs)
            if action == 'resource.delete':
                return self.resources.delete_resource(target_id, **kwargs)
            raise ManagementDenied()
        except (AuthorizationDenied, AdminAuditUnavailableError, AdminAuditTargetError, LastAdministratorError):
            raise
        except Exception:
            raise ManagementUnavailable() from None
