"""Offline recent-authentication boundaries; Redis/SQL integration is separate."""

import importlib.util
import os
import subprocess
import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

from fastapi import Depends, FastAPI, HTTPException
from fastapi.testclient import TestClient
from jose import jwt

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'apps/api'))
from src.controller.auth_manager import ALGORITHM, AuthManager
from src.core.auth.recent import ADMIN_STEP_UP_OPERATIONS, step_up_max_age_seconds
from test_auth_manager import StatefulRedis, TEST_DEVICE_ID


class RecentAuthenticationTests(unittest.TestCase):
    def setUp(self):
        self.user = {'id': 2, 'status': 1, 'roles': [{'code': 'admin'}]}
        self.redis = StatefulRedis()
        self.auth = AuthManager(SimpleNamespace(get_user_by_id=lambda _: self.user), self.redis,
                                secret_key='synthetic-recent-authentication-secret')
        issued = self.auth.create_tokens_for_user('2', TEST_DEVICE_ID)
        self.payload = jwt.decode(issued.access_token, self.auth.secret_key, algorithms=[ALGORITHM])
        self.now = self.payload['auth_time']

    def signed(self, **changes):
        payload = {**self.payload, **changes}
        token = jwt.encode(payload, self.auth.secret_key, algorithm=ALGORITHM)
        self.redis.hset('user:2:access_tokens', TEST_DEVICE_ID, token)
        return token

    def context(self, token, age=600):
        with patch('src.controller.auth_manager.datetime') as clock:
            clock.now.return_value = datetime.fromtimestamp(self.now, timezone.utc)
            return self.auth.get_recent_session_context(token, max_age_seconds=age)

    def test_only_positive_integer_auth_time_with_exact_time_boundaries_is_accepted(self):
        for value in [str(self.now), float(self.now), True, False, None, 0, -1,
                      self.now - 601, self.now + 61]:
            with self.subTest(value=value):
                self.assertIsNone(self.context(self.signed(auth_time=value)))
        for value in [self.now, self.now - 600, self.now + 60]:
            with self.subTest(value=value):
                self.assertEqual(self.context(self.signed(auth_time=value))[0], 2)

    def test_sid_is_a_bounded_nonblank_string_and_subject_is_canonical(self):
        for sid in ['', '  \t\n', 12, [], None, 'x' * 129]:
            with self.subTest(sid=sid):
                self.assertIsNone(self.context(self.signed(sid=sid)))
        self.assertEqual(self.context(self.signed(sid='x' * 128))[1], 'x' * 128)
        for subject in ['02', '0', '-2', ' 2', '２', '9223372036854775808']:
            with self.subTest(subject=subject):
                self.assertIsNone(self.context(self.signed(sub=subject)))
        token = self.signed()
        with patch.object(self.auth, 'verify_token', return_value='3'):
            self.assertIsNone(self.context(token))

    def test_invalid_caller_windows_fail_before_token_validation(self):
        for age in [True, False, '600', 600.0, None, 59, 3601]:
            with self.subTest(age=age), patch.object(self.auth, 'verify_token') as verify:
                with self.assertRaises(ValueError):
                    self.context('not-a-token', age)
                verify.assert_not_called()
        self.assertEqual(self.context(self.signed(), 60)[0], 2)
        self.assertEqual(self.context(self.signed(), 3600)[0], 2)

    def test_refresh_inherits_old_primary_authentication_time(self):
        issued = self.auth.create_tokens_for_user('2', TEST_DEVICE_ID)
        refresh_payload = jwt.decode(issued.refresh_token, self.auth.secret_key, algorithms=[ALGORITHM])
        refresh_payload['auth_time'] = self.now - 700
        refresh = jwt.encode(refresh_payload, self.auth.secret_key, algorithm=ALGORITHM)
        self.redis.hset('user:2:refresh_tokens', TEST_DEVICE_ID, refresh)
        rotated = self.auth.refresh_access_token(refresh)
        self.assertIsNotNone(rotated)
        self.assertEqual(jwt.decode(rotated.access_token, self.auth.secret_key,
                                    algorithms=[ALGORITHM])['auth_time'], self.now - 700)
        self.assertIsNone(self.context(rotated.access_token))
        fresh = self.auth.create_tokens_for_user('2', TEST_DEVICE_ID)
        self.assertEqual(self.context(fresh.access_token)[0], 2)

    def test_revoked_access_cookie_never_proves_recency(self):
        token = self.signed()
        self.redis.hdelete('user:2:access_tokens', TEST_DEVICE_ID)
        self.assertIsNone(self.context(token))

    def test_refresh_cannot_normalize_invalid_primary_authentication_into_recent_proof(self):
        missing = object()
        for value in [missing, None, True, False, str(self.now), float(self.now), 0, -1, self.now + 61]:
            with self.subTest(kind='missing' if value is missing else type(value).__name__):
                issued = self.auth.create_tokens_for_user('2', TEST_DEVICE_ID)
                tokens = []
                for token in (issued.access_token, issued.refresh_token):
                    payload = jwt.decode(token, self.auth.secret_key, algorithms=[ALGORITHM])
                    if value is missing:
                        payload.pop('auth_time')
                    else:
                        payload['auth_time'] = value
                    tokens.append(jwt.encode(payload, self.auth.secret_key, algorithm=ALGORITHM))
                self.redis.hset('user:2:access_tokens', TEST_DEVICE_ID, tokens[0])
                self.redis.hset('user:2:refresh_tokens', TEST_DEVICE_ID, tokens[1])
                self.assertIsNone(self.context(tokens[0]))
                with patch('src.controller.auth_manager.datetime') as clock:
                    clock.now.return_value = datetime.fromtimestamp(self.now, timezone.utc)
                    rotated = self.auth.refresh_access_token(tokens[1])
                self.assertIsNotNone(rotated)
                payload = jwt.decode(rotated.access_token, self.auth.secret_key, algorithms=[ALGORITHM])
                self.assertEqual(payload['auth_time'], 0)
                self.assertIsNone(self.context(rotated.access_token))


class RecentConfigurationTests(unittest.TestCase):
    def test_shared_parser_keeps_default_and_identity_error_contract(self):
        from src.modules.identity.router import _step_up_max_age_seconds
        from src.modules.identity.errors import IdentityDomainError
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(step_up_max_age_seconds(), 600)
        for value, expected in [('60', 60), ('3600', 3600), (' +600 ', 600)]:
            with patch.dict(os.environ, {'AUTH_STEP_UP_MAX_AGE_SECONDS': value}):
                self.assertEqual(step_up_max_age_seconds(), expected)
                self.assertEqual(_step_up_max_age_seconds(), expected)
        for value in ['59', '3601', '600.0', '', 'PRIVATE_CONFIGURATION_TEXT']:
            with patch.dict(os.environ, {'AUTH_STEP_UP_MAX_AGE_SECONDS': value}):
                with self.assertRaises(ValueError) as caught:
                    step_up_max_age_seconds()
                if value:
                    self.assertNotIn(value, str(caught.exception))
                with self.assertRaises(IdentityDomainError) as identity:
                    _step_up_max_age_seconds()
                self.assertEqual(identity.exception.code, 'AUTH_CONFIGURATION_ERROR')
                self.assertEqual(identity.exception.status_code, 503)
                self.assertEqual(identity.exception.message, '安全验证配置无效。')


class AdminRecentHttpTests(unittest.TestCase):
    def client(self, *, actor=None, context=(2, 'synthetic-family')):
        from src.routers.auth.auth import get_auth_manager, get_current_user
        from src.routers.role.role import get_role_manager, router as roles
        from src.routers.resource.resource import get_resource_manager, resource_router
        from src.routers.user.user import get_user_manager, router as users
        app = FastAPI()
        for router in (roles, resource_router, users):
            app.include_router(router)
        self.recent = Mock(return_value=context)
        self.writes = Mock()
        def register(user):
            self.writes.register()
            user.id = 9
            return True
        auth = SimpleNamespace(get_recent_session_context=self.recent, register_user=register)
        self.auth_dependency = Mock(return_value=auth)
        app.dependency_overrides[get_auth_manager] = lambda: self.auth_dependency()
        app.dependency_overrides[get_current_user] = lambda: actor or {'id': 2, 'roles': [{'code': 'admin'}]}
        public_user = {**self.operations()[0][2], 'id': 2}
        public_user.pop('password')
        manager = SimpleNamespace(
            create_role=self.writes.create_role, update_role=self.writes.update_role,
            delete_role=self.writes.delete_role, bind_resources=self.writes.bind_resources,
            create_resource=self.writes.create_resource, update_resource=self.writes.update_resource,
            delete_resource=self.writes.delete_resource, delete_user=self.writes.delete_user,
            get_roles_with_resources=lambda *_: [], get_role_by_id=lambda _: {'id': 1},
            get_resources_by_role=lambda _: [], list_resources=lambda **_: [],
            get_resource_by_id=lambda _: {'id': 1}, get_user_by_name=lambda *_: [],
            count_users_by_name=lambda _: 0, get_user_by_id=lambda _: public_user,
        )
        for name in ('create_role', 'update_role', 'delete_role', 'bind_resources',
                     'create_resource', 'update_resource', 'delete_resource', 'delete_user'):
            getattr(self.writes, name).return_value = True
        for dependency in (get_role_manager, get_resource_manager, get_user_manager):
            app.dependency_overrides[dependency] = lambda: manager
        client = TestClient(app, raise_server_exceptions=False)
        client.cookies.set('access_token', 'synthetic-same-access-cookie')
        return client, app

    @staticmethod
    def operations():
        return [
            ('POST', '/user/', {'username': 'synthetic', 'name': 'Synthetic', 'sex': 0, 'age': 18,
                                'phone': '', 'email': 'synthetic@example.test', 'password': 'not-persisted',
                                'birth_day': '2000-01-01'}),
            ('DELETE', '/user/2', None), ('POST', '/role/', {'name': 'Role', 'code': 'editor'}),
            ('PUT', '/role/1', {'name': 'Renamed'}), ('DELETE', '/role/1', None),
            ('POST', '/role/1/bind_resources', {'resource_ids': [1]}),
            ('POST', '/resource/', {'name': 'Resource', 'code': 'read', 'type': 'api'}),
            ('PUT', '/resource/1', {'name': 'Renamed'}), ('DELETE', '/resource/1', None),
        ]

    def test_all_nine_stale_writes_return_403_without_business_calls(self):
        client, _ = self.client(context=None)
        for method, path, data in self.operations():
            with self.subTest(method=method, path=path):
                response = client.request(method, path, json=data)
                self.assertEqual(response.status_code, 403)
                self.assertEqual(response.json()['detail'], {
                    'code': 'AUTH_STEP_UP_REQUIRED',
                    'message': '此安全操作需要近期登录，请退出后重新登录再试。',
                })
        self.assertEqual(self.writes.mock_calls, [])
        self.assertEqual(self.recent.call_count, 9)
        self.recent.assert_called_with('synthetic-same-access-cookie', max_age_seconds=600)

    def test_all_nine_recent_writes_reach_business_and_reads_skip_recency(self):
        client, _ = self.client()
        for method, path, data in self.operations():
            with self.subTest(method=method, path=path):
                self.assertIn(client.request(method, path, json=data).status_code, (200, 201))
        self.assertEqual(len(self.writes.mock_calls), 9)
        self.recent.reset_mock()
        for path in ['/role/', '/role/1', '/resource/', '/resource/1', '/user/', '/user/2']:
            self.assertEqual(client.get(path).status_code, 200)
        self.recent.assert_not_called()

    def test_missing_cookie_or_wrong_proof_identity_is_not_accepted(self):
        for context in [(3, 'family'), (True, 'family'), ('2', 'family'), (2, ''), (2, '  '), (2,), []]:
            with self.subTest(context=context):
                client, _ = self.client(context=context)
                self.assertEqual(client.delete('/user/2').status_code, 403)
                self.assertEqual(self.writes.mock_calls, [])
        client, _ = self.client()
        client.cookies.clear()
        response = client.delete('/user/2', headers={'Authorization': 'Bearer ignored-header'})
        self.assertEqual(response.status_code, 403)
        self.recent.assert_not_called()

    def test_old_admin_gate_runs_before_new_dependency(self):
        from src.routers.auth.auth import get_current_user
        client, app = self.client(actor={'id': 2, 'roles': [{'code': 'normal'}]})
        self.assertEqual(client.delete('/user/2').status_code, 403)
        self.auth_dependency.assert_not_called()
        self.recent.assert_not_called()
        def anonymous():
            raise HTTPException(status_code=401, detail='authentication required')
        app.dependency_overrides[get_current_user] = anonymous
        self.assertEqual(client.delete('/user/2').status_code, 401)
        self.auth_dependency.assert_not_called()

    def test_configuration_or_validation_exception_is_safe_503_with_no_write(self):
        client, _ = self.client()
        for kind in (RuntimeError, TimeoutError):
            self.recent.side_effect = kind('PRIVATE_COOKIE_OR_DATABASE_DIAGNOSTIC')
            response = client.delete('/user/2')
            self.assertEqual(response.status_code, 503)
            self.assertNotIn('PRIVATE', response.text)
        self.recent.reset_mock(side_effect=True)
        with patch.dict(os.environ, {'AUTH_STEP_UP_MAX_AGE_SECONDS': 'PRIVATE_CONFIGURATION'}):
            response = client.delete('/user/2')
        self.assertEqual(response.status_code, 503)
        self.assertNotIn('PRIVATE', response.text)
        self.recent.assert_not_called()
        self.assertEqual(self.writes.mock_calls, [])


class RecentPolicyInventoryTests(unittest.TestCase):
    def checker(self):
        spec = importlib.util.spec_from_file_location('recent_admin_check', ROOT / 'scripts/check-admin-policy.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module

    def test_actual_schema_composition_has_exact_old_40_and_new_9(self):
        self.assertEqual(len(ADMIN_STEP_UP_OPERATIONS), 9)
        original_app_module = sys.modules.get('app_instance')
        # The schema exporter installs process-wide import stubs. Its actual
        # composition check must not replace modules in the API test process.
        completed = subprocess.run(
            [sys.executable, str(ROOT / 'scripts/check-admin-policy.py')],
            cwd=ROOT, capture_output=True, text=True, timeout=30,
        )
        self.assertEqual(completed.returncode, 0)
        self.assertIn('40 guarded HTTP operations and 9 recent-authentication writes', completed.stdout)
        self.assertIs(sys.modules.get('app_instance'), original_app_module)

    def test_recent_inventory_rejects_missing_extra_duplicate_and_dynamic_shadow(self):
        from src.routers.auth.auth import require_recent_admin
        check = self.checker()
        def handler():
            return True
        for fault in ('missing', 'extra', 'duplicate', 'shadow'):
            with self.subTest(fault=fault):
                app = FastAPI()
                if fault == 'shadow':
                    app.add_api_route('/{all:path}', handler, methods=['POST'])
                for method, path in ADMIN_STEP_UP_OPERATIONS:
                    if fault == 'missing' and path == '/user/' and method == 'POST':
                        continue
                    app.add_api_route(path, handler, methods=[method], dependencies=[Depends(require_recent_admin)])
                if fault in ('extra', 'duplicate'):
                    app.add_api_route('/unreviewed' if fault == 'extra' else '/user/', handler,
                                      methods=['POST'], dependencies=[Depends(require_recent_admin)])
                if fault in ('duplicate', 'shadow'):
                    with self.assertRaises(ValueError):
                        check.guarded_operations(app.routes, require_recent_admin)
                else:
                    self.assertNotEqual(check.guarded_operations(app.routes, require_recent_admin), ADMIN_STEP_UP_OPERATIONS)
                    with self.assertRaises(ValueError):
                        check.verify_admin_policy(app.routes)


if __name__ == '__main__':
    unittest.main()
