"""Real signed sessions and SQLite transactions; no MySQL lock proof here."""

import json
import sqlite3
import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import FastAPI
from fastapi import Depends
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from src.controller.auth_manager import AuthManager
from src.controller.user_manage import UserManager
from src.controller.role_manager import RoleManager
from src.core.auth import AuthorizationDenied, Principal
from src.core.auth.admin_audit import create_admin_audit_context, AdminAuditUnavailableError
from src.core.auth.admin_recovery import LastAdministratorError
from src.modules.management.public import AdminManagementService, ManagementScope
from src.modules.management.policy import ManagementPolicy, ManagementDenied, ManagementUnavailable
from src.modules.management.manifest import MANAGEMENT_MANIFEST
from src.module_composition import create_module_registry
from test_auth_manager import StatefulRedis, TEST_DEVICE_ID
from test_admin_audit import AuditDatabase, AuditUow


class ServiceUow(AuditUow):
    def commit(self):
        self.db.commit_attempts += 1
        return super().commit()


class ServiceDatabase(AuditDatabase):
    def __init__(self, path):
        super().__init__(path)
        self.commit_attempts = 0
        with sqlite3.connect(path) as db:
            db.execute('CREATE TABLE auth_verified_contacts(kind TEXT,normalized_value TEXT,user_id INTEGER)')

    def unit_of_work(self, *, isolation_level=None):
        self.isolations.append(isolation_level)
        return ServiceUow(self, isolation_level)

    def fetch_all(self, sql, params=None):
        with self.unit_of_work(isolation_level='READ COMMITTED') as uow:
            return uow.fetch_all(sql, (params,) if isinstance(params, (str, int)) else params)

    def fetch_one(self, sql, params=None):
        with self.unit_of_work(isolation_level='READ COMMITTED') as uow:
            return uow.fetch_one(sql, (params,) if isinstance(params, (str, int)) else params)


class ManagementServiceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.db = ServiceDatabase(str(Path(self.temp.name) / 'service.sqlite'))
        self.users = UserManager(self.db)
        self.redis = StatefulRedis()
        self.auth = AuthManager(self.users, self.redis, secret_key='synthetic-management-secret')
        self.token = self.auth.create_tokens_for_user('1', TEST_DEVICE_ID).access_token
        self.now = time.time()
        self.service = AdminManagementService(self.auth, clock=lambda: self.now)

    def seed(self, sql):
        with sqlite3.connect(self.db.path) as db:
            db.execute(sql)

    def test_service_reconstructs_identity_and_audit_on_all_nine_operations(self):
        from src.type.user_type import User
        user = User(username='synthetic', name='Synthetic', sex=0, age=18, phone='',
                    email='synthetic@example.test', password='synthetic-password', birth_day='2000-01-01')
        operations = [
            ('user.create', user, None), ('user.disable', None, '0002'),
            ('role.create', {'name': 'Added', 'code': 'added'}, None),
            ('role.update', {'name': 'Updated'}, 2), ('role.delete', None, 2),
            ('role.bind_resources', {'resource_ids': [1]}, 3),
            ('resource.create', {'name': 'Added', 'code': 'added', 'type': 'api'}, None),
            ('resource.update', {'path': '/changed'}, 1), ('resource.delete', None, 1),
        ]
        for action, parameters, target in operations:
            self.service.execute(self.token, action, parameters, target_id=target)
        rows = self.db.rows('admin_change_audit')
        self.assertEqual([row[4] for row in rows], [item[0] for item in operations])
        self.assertTrue(all(row[1] == 1 for row in rows))
        self.assertIs(type(user.id), int)
        self.assertGreater(user.id, 0)
        self.assertEqual(self.db.commits, 9)
        self.assertEqual(self.db.commit_attempts, 9)
        self.assertEqual(self.db.active, 0)

    def test_no_cookie_principal_or_plain_user_can_trigger_business(self):
        before = self.db.snapshot()
        normal = self.auth.create_tokens_for_user('2', TEST_DEVICE_ID).access_token
        for token in ('', None, Principal(kind='user', user_id=1, roles=('admin',)), normal):
            with self.subTest(token_type=type(token).__name__), patch.object(self.auth, 'register_user') as write:
                with self.assertRaises(AuthorizationDenied):
                    self.service.execute(token, 'user.create', {'owner': 1})
                write.assert_not_called()
        self.assertEqual(self.db.snapshot(), before)

    def test_unknown_action_scope_and_undeclared_parameters_fail_without_writes(self):
        before = self.db.snapshot()
        for action, scope in [('unknown', None), ('role.create', ManagementScope('other', 'role')),
                              ('role.create', ManagementScope('sun-world', 'user'))]:
            with self.assertRaises(AuthorizationDenied):
                self.service.execute(self.token, action, {}, scope=scope)
        for field in ('owner', 'principal', 'authorization', 'roles', 'audit'):
            with self.assertRaises(AuthorizationDenied):
                self.service.execute(self.token, 'role.create', {'name': 'N', 'code': 'c', field: 'forged'})
        self.assertEqual(self.db.snapshot(), before)

    def test_well_formed_audit_does_not_grant_or_substitute_session(self):
        before = self.db.snapshot()
        for actor, family in [(2, 'anything'), (1, 'wrong-family')]:
            audit = create_admin_audit_context(actor_user_id=actor, session_family_id=family)
            with self.assertRaises(AuthorizationDenied):
                self.service.execute(self.token, 'role.update', {'name': 'never'}, target_id=2, audit=audit)
        self.assertEqual(self.db.snapshot(), before)

    def test_current_database_revalidation_sees_disable_or_role_removal_after_initial_read(self):
        original = self.service.roles.update_role
        for mutation in ('UPDATE users SET status=0 WHERE id=1',
                         'DELETE FROM user_roles WHERE user_id=1'):
            def changed(*args, **kwargs):
                self.seed(mutation)
                return original(*args, **kwargs)
            with patch.object(self.service.roles, 'update_role', side_effect=changed):
                with self.assertRaises(AuthorizationDenied):
                    self.service.execute(self.token, 'role.update', {'name': 'must not write'}, target_id=2)
            self.assertEqual(self.db.rows('roles')[1][2], 'Normal')
            self.assertEqual(self.db.rows('admin_change_audit'), [])
            self.seed('UPDATE users SET status=1 WHERE id=1')
            self.seed('INSERT OR IGNORE INTO user_roles VALUES(1,1)')

    def test_actor_lock_order_and_same_connection_current_authorization_precede_dml(self):
        self.service.execute(self.token, 'role.update', {'name': 'Updated'}, target_id=2)
        statements = self.db.statements
        role_lock = next(index for index, sql in enumerate(statements) if 'FORCE INDEX' in sql)
        user_lock = next(index for index, sql in enumerate(statements) if sql.startswith('SELECT id FROM users WHERE') and 'FOR UPDATE' in sql)
        binding_lock = next(index for index, sql in enumerate(statements) if sql.startswith('SELECT role_id FROM user_roles') and 'FOR UPDATE' in sql)
        write = next(index for index, sql in enumerate(statements) if sql.startswith('UPDATE roles'))
        self.assertLess(role_lock, user_lock)
        self.assertLess(user_lock, binding_lock)
        self.assertLess(binding_lock, write)
        self.assertTrue(any(sql.startswith('SELECT u.id, u.status') for sql in statements[binding_lock:write]))
        self.assertEqual(self.db.commits, 1)

    def test_logout_after_business_audit_rolls_back_before_actual_commit(self):
        import src.controller.role_manager as role_module
        original = role_module.record_admin_change
        before = self.db.snapshot()
        def revoke(*args, **kwargs):
            result = original(*args, **kwargs)
            self.redis.hdelete('user:1:access_tokens', TEST_DEVICE_ID)
            return result
        with patch.object(role_module, 'record_admin_change', side_effect=revoke):
            with self.assertRaises(AuthorizationDenied):
                self.service.execute(self.token, 'role.update', {'name': 'never committed'}, target_id=2)
        self.assertEqual(self.db.snapshot(), before)
        self.assertEqual(self.db.commit_attempts, 0)

    def test_protected_paths_run_final_auth_after_last_admin_check_before_commit(self):
        import src.controller.role_manager as role_module
        import src.controller.user_manage as user_module
        self.seed('INSERT INTO user_roles VALUES(2,3)')
        for action, parameters, target, module in [
            ('user.disable', None, 1, user_module),
            ('role.update', {'code': 'editor'}, 1, role_module),
            ('role.delete', None, 1, role_module),
        ]:
            self.token = self.auth.create_tokens_for_user('1', TEST_DEVICE_ID).access_token
            before = self.db.snapshot()
            original = module.record_admin_change
            def revoke(*args, **kwargs):
                result = original(*args, **kwargs)
                self.redis.hdelete('user:1:access_tokens', TEST_DEVICE_ID)
                return result
            with patch.object(module, 'record_admin_change', side_effect=revoke):
                with self.assertRaises(AuthorizationDenied):
                    self.service.execute(self.token, action, parameters, target_id=target)
            self.assertEqual(self.db.snapshot(), before)
            self.assertEqual(self.db.commit_attempts, 0)

    def test_time_expiry_and_final_redis_failure_keep_the_original_failure_type(self):
        import src.controller.role_manager as role_module
        original = role_module.record_admin_change
        before = self.db.snapshot()
        for failure in ('clock', 'redis'):
            self.now = time.time()
            def invalidate(*args, **kwargs):
                result = original(*args, **kwargs)
                if failure == 'clock':
                    self.now += 700
                else:
                    self.redis.exist = lambda *_: (_ for _ in ()).throw(TimeoutError('PRIVATE'))
                return result
            with patch.object(role_module, 'record_admin_change', side_effect=invalidate):
                with self.assertRaises(AuthorizationDenied) as caught:
                    self.service.execute(self.token, 'role.update', {'name': 'never committed'}, target_id=2)
            self.assertEqual(caught.exception.status_code, 403 if failure == 'clock' else 503)
            self.assertNotIn('PRIVATE', str(caught.exception))
            self.assertEqual(self.db.snapshot(), before)

    def test_legal_self_demotion_and_disable_commit_using_pre_write_locked_permissions(self):
        self.seed('INSERT INTO user_roles VALUES(2,3)')
        self.assertEqual(self.service.execute(self.token, 'role.update', {'code': 'editor'}, target_id=1), 1)
        with self.assertRaises(AuthorizationDenied):
            self.service.execute(self.token, 'role.create', {'name': 'N', 'code': 'n'})
        self.seed("UPDATE roles SET code='admin' WHERE id=1")
        self.assertTrue(self.service.execute(self.token, 'user.disable', target_id=1))
        self.assertEqual(self.db.commits, 2)

    def test_last_admin_and_audit_storage_failure_are_not_converted_to_success(self):
        before = self.db.snapshot()
        with self.assertRaises(LastAdministratorError):
            self.service.execute(self.token, 'user.disable', target_id=1)
        self.db.fail_on = lambda sql: sql.startswith('INSERT INTO admin_change_audit')
        with self.assertRaises(AdminAuditUnavailableError):
            self.service.execute(self.token, 'role.update', {'name': 'never'}, target_id=2)
        self.assertEqual(self.db.snapshot(), before)

    def test_dependency_failure_is_503_and_commit_ack_unknown_is_never_replayed(self):
        with patch.object(self.users, 'get_auth_context', side_effect=RuntimeError('PRIVATE DB')):
            with self.assertRaises(ManagementUnavailable):
                self.service.execute(self.token, 'role.create', {'name': 'N', 'code': 'n'})
        self.db.ack_loss = True
        with self.assertRaises(AdminAuditUnavailableError):
            self.service.execute(self.token, 'role.update', {'name': 'committed unknown'}, target_id=2)
        self.assertEqual(self.db.commit_attempts, 1)
        self.assertEqual(len(self.db.rows('admin_change_audit')), 1)

    def test_http_uses_real_service_and_returns_the_created_user_id(self):
        from src.routers.auth.auth import get_auth_manager
        from src.routers.user.user import get_user_manager, router
        app = FastAPI()
        app.include_router(router)
        app.dependency_overrides[get_auth_manager] = lambda: self.auth
        app.dependency_overrides[get_user_manager] = lambda: UserManager(self.db)
        client = TestClient(app, raise_server_exceptions=False)
        client.cookies.set('access_token', self.token)
        response = client.post('/user/', json={'username': 'http-created', 'name': 'Synthetic', 'sex': 0,
            'age': 18, 'phone': '', 'email': 'synthetic@example.test', 'password': 'not-printed', 'birth_day': '2000-01-01'})
        self.assertEqual(response.status_code, 201)
        self.assertIs(type(response.json()['data']['id']), int)
        self.assertEqual(len(self.db.rows('admin_change_audit')), 1)
        self.assertEqual(client.delete('/user/2oops').status_code, 422)


class ManagementPolicyTests(unittest.TestCase):
    def test_host_gate_requires_the_called_receiver_to_be_the_injected_service(self):
        import importlib.util
        from src.routers.role.role import get_role_management_service
        from src.routers.user.user import get_user_management_service
        root = Path(__file__).resolve().parents[3]
        spec = importlib.util.spec_from_file_location('management_gate_tests', root / 'scripts/check-admin-policy.py')
        checker = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(checker)
        def correct(service=Depends(get_role_management_service)):
            return service.execute('', 'role.create', {})
        def other_receiver(service=Depends(get_role_management_service)):
            return other.execute('', 'role.create', {})
        def wrong_dependency(service=Depends(get_user_management_service)):
            return service.execute('', 'role.create', {})
        def unused_dependency(unused=Depends(get_role_management_service), service=None):
            return service.execute('', 'role.create', {})
        def wrong_action(service=Depends(get_role_management_service)):
            return service.execute('', 'role.delete', {})
        checker.verify_management_endpoint(correct, 'role.create', get_role_management_service)
        for endpoint in (other_receiver, wrong_dependency, unused_dependency, wrong_action):
            with self.subTest(endpoint=endpoint.__name__), self.assertRaises(ValueError):
                checker.verify_management_endpoint(endpoint, 'role.create', get_role_management_service)

    def test_policy_rejects_unknown_capability_scope_and_nonuser_without_grant_inference(self):
        policy = ManagementPolicy()
        principal = Principal(kind='user', user_id=1, session_family='family', authenticated_at=1000, roles=('admin',))
        scope = ManagementScope('sun-world', 'role')
        policy.require(principal, 'role.create', scope, None, now=1000, max_age=600)
        for action, target_scope, subject in [('unknown', scope, principal),
                ('role.create', ManagementScope('other', 'role'), principal),
                ('role.create', scope, Principal(kind='service', roles=('admin',))),
                ('role.create', scope, Principal(kind='user', roles=('normal',)))]:
            with self.assertRaises(AuthorizationDenied):
                policy.require(subject, action, target_scope, None, now=1000, max_age=600)

    def test_registry_adds_only_the_reviewed_module_and_no_agent_write_tools(self):
        registry = create_module_registry()
        self.assertEqual(set(registry.tools), {'blog.search_public', 'blog.read_public'})
        self.assertEqual(registry.modules['identity-management'], MANAGEMENT_MANIFEST)
        from src.core.auth.recent import ADMIN_STEP_UP_OPERATIONS
        self.assertEqual({(entry.method, entry.path) for entry in MANAGEMENT_MANIFEST.http_entries},
                         ADMIN_STEP_UP_OPERATIONS | {('GET', '/auth/capabilities')})
        self.assertEqual(len(MANAGEMENT_MANIFEST.capabilities), 9)
        self.assertEqual(MANAGEMENT_MANIFEST.tools, ())
        self.assertEqual(MANAGEMENT_MANIFEST.skills, ())


if __name__ == '__main__':
    unittest.main()
