"""Display snapshots on owned MySQL/Redis and signed Cookie HTTP."""

from datetime import datetime, timezone
from hashlib import sha256
import json
import time
import unittest
from unittest.mock import patch

from fastapi.responses import JSONResponse
from jose import jwt
from starlette.exceptions import HTTPException as StarletteHTTPException

import test_admin_recent_stack as previous
from test_agent_mysql import SocketManager
from src.controller.user_manage import UserManager
from src.core.auth import AuthorizationDenied, Principal
from src.core.response import fail
from src.module_composition import create_module_registry
from src.modules.management.projection import CapabilityProjectionService, PROJECTION_KEYS
from src.modules.management.public import AdminManagementService
from src.routers.auth.auth import get_optional_capability_auth


class CapabilityProjectionStackTests(previous.AdminRecentStackTests):
    def setUp(self):
        super().setUp()
        self.http.app.dependency_overrides[get_optional_capability_auth] = lambda: self.auth
        # Match main.py: the older fixture omitted standard HTTPException headers.
        @self.http.app.exception_handler(StarletteHTTPException)
        async def error(_request, exception):
            detail = exception.detail if isinstance(exception.detail, dict) else {}
            return JSONResponse(status_code=exception.status_code, headers=exception.headers,
                content=fail(code=detail.get('code', exception.status_code),
                             msg=detail.get('message', '请求失败')).model_dump())

    def events(self):
        return self.pool.fetch_all('SELECT * FROM admin_change_audit ORDER BY id')

    def projection(self, **kwargs):
        response = self.http.get('/auth/capabilities', **kwargs)
        self.assertEqual(response.headers.get('cache-control'), 'no-store')
        self.assertIn('Cookie', response.headers.get('vary', '').split(', '))
        return response

    def snapshot(self, response):
        self.assertEqual(response.status_code, 200, response.text)
        data = response.json()['data']
        self.assertEqual(set(data), {'app_id', 'account_id', 'session_ref', 'capabilities', 'max_age_seconds'})
        self.assertEqual(data['app_id'], 'sun-world')
        self.assertEqual(data['capabilities'], sorted(set(data['capabilities'])))
        self.assertIs(type(data['max_age_seconds']), int)
        self.assertGreaterEqual(data['max_age_seconds'], 0)
        self.assertLessEqual(data['max_age_seconds'], 15)
        return data

    def assert_no_business_writes(self, before):
        self.assertEqual(self.state(), before)
        self.assertEqual(self.events(), [])

    def test_guest_never_reads_auth_storage_and_returns_only_public_predicate(self):
        before = self.state()
        with patch.object(self.auth.user_manager, 'get_auth_context', side_effect=AssertionError('Unexpected account read')), \
             patch.object(self.auth.db, 'hget', side_effect=AssertionError('Unexpected Redis read')), \
             patch.object(self.auth, 'get_token_expiry', side_effect=AssertionError('Unexpected token read')):
            data = self.snapshot(self.projection())
        self.assertEqual(data, {'app_id': 'sun-world', 'account_id': None, 'session_ref': None,
                               'capabilities': ['blog.article.read_public'], 'max_age_seconds': 15})
        self.assert_no_business_writes(before)

    def test_actual_optional_auth_dependency_is_not_invoked_for_guest(self):
        import src.routers.auth.auth as auth_router
        del self.http.app.dependency_overrides[get_optional_capability_auth]
        with patch.object(auth_router, 'get_auth_manager', side_effect=AssertionError('Unexpected auth lookup')):
            data = self.snapshot(self.projection())
        self.assertIsNone(data['account_id'])

    def test_fresh_admin_gets_current_known_predicates_with_hashed_family_and_no_secrets(self):
        pair = self.install()
        before = self.state()
        payload = jwt.decode(pair.access_token, self.auth.secret_key, algorithms=['HS256'])
        response = self.projection()
        data = self.snapshot(response)
        self.assertEqual(data['account_id'], '1')
        self.assertEqual(data['session_ref'], sha256(f"1:{payload['sid']}".encode()).hexdigest())
        self.assertEqual(data['capabilities'], list(PROJECTION_KEYS))
        for forbidden in (pair.access_token, pair.refresh_token, payload['sid'], self.auth.secret_key,
                          'one@example.invalid', 'recent-admin-one', 'roles', 'password', 'provider'):
            self.assertNotIn(forbidden, response.text)
        self.assert_no_business_writes(before)

    def test_normal_forged_role_claim_and_stale_admin_have_only_public_predicate(self):
        before = self.state()
        for kwargs in ({'user': '2'}, {'user': '2', 'claims': {'roles': ['admin'], 'owner_user_id': 1}}, {'age': 700}):
            with self.subTest(kwargs=kwargs):
                self.install(**kwargs)
                data = self.snapshot(self.projection())
                self.assertEqual(data['capabilities'], ['blog.article.read_public'])
                self.assertEqual(data['account_id'], kwargs.get('user', '1'))
                self.assert_no_business_writes(before)

    def test_empty_invalid_missing_proof_and_logged_out_cookies_never_downgrade_guest(self):
        before = self.state()
        for token in ('', 'synthetic-invalid-token'):
            self.http.cookies.clear()
            self.http.cookies.set('access_token', token, domain=previous.HOST, path='/')
            response = self.projection()
            self.assertEqual(response.status_code, 401, response.text)
        self.install(omit_proof=True)
        self.assertEqual(self.projection().status_code, 401)
        pair = self.install()
        self.assertTrue(self.auth.logout(pair.access_token))
        self.assertEqual(self.projection().status_code, 401)
        self.assert_no_business_writes(before)

    def test_disabled_and_noncanonical_enabled_accounts_are_rejected(self):
        self.install()
        for status in (0, 2):
            self.pool.execute('UPDATE users SET status=%s WHERE id=1', (status,))
            before = self.state()
            response = self.projection()
            self.assertEqual(response.status_code, 401, response.text)
            self.assert_no_business_writes(before)

    def test_mysql_redis_configuration_failures_are_fixed_503_without_credentials(self):
        self.install()
        before = self.state()
        for target, method in ((self.auth.user_manager, 'get_auth_context'), (self.auth.db, 'hget')):
            with self.subTest(method=method), patch.object(target, method, side_effect=ConnectionError('private-projection-storage-sentinel')):
                response = self.projection()
                self.assertEqual(response.status_code, 503, response.text)
                self.assertNotIn('private-projection-storage-sentinel', response.text)
        with patch.dict('os.environ', {'AUTH_STEP_UP_MAX_AGE_SECONDS': 'invalid'}):
            self.assertEqual(self.projection().status_code, 503)
        self.assert_no_business_writes(before)

    def test_scope_actor_headers_and_query_cannot_select_another_subject(self):
        self.install(user='2')
        response = self.projection(headers={'x-user-id': '1', 'x-role': 'admin', 'x-project-id': 'other'},
                                   params={'user_id': '1', 'roles': 'admin', 'app_id': 'other'})
        data = self.snapshot(response)
        self.assertEqual(data['account_id'], '2')
        self.assertEqual(data['app_id'], 'sun-world')
        self.assertEqual(data['capabilities'], ['blog.article.read_public'])

    def test_same_account_new_family_changes_reference_ordinary_refresh_keeps_it(self):
        first = self.install()
        one = self.snapshot(self.projection())
        rotated = self.auth.refresh_access_token(first.refresh_token)
        self.assertIsNotNone(rotated)
        self.http.cookies.set('access_token', rotated.access_token, domain=previous.HOST, path='/')
        two = self.snapshot(self.projection())
        self.assertEqual(two['session_ref'], one['session_ref'])
        self.install()
        three = self.snapshot(self.projection())
        self.assertNotEqual(three['session_ref'], one['session_ref'])
        self.assertEqual(three['account_id'], one['account_id'])

    def test_projection_expiry_is_bounded_by_signed_access_and_primary_authentication(self):
        self.install(claims={'exp': int(time.time()) + 12})
        self.assertLessEqual(self.snapshot(self.projection())['max_age_seconds'], 12)
        self.install(age=598)
        data = self.snapshot(self.projection())
        self.assertEqual(data['capabilities'], list(PROJECTION_KEYS))
        self.assertLessEqual(data['max_age_seconds'], 3)

    def test_snapshot_is_never_a_credential_for_a_later_revoked_write(self):
        self.install()
        old = self.snapshot(self.projection())
        self.pool.execute("UPDATE roles SET code='former-admin' WHERE id=1")
        before = self.state()
        fresh = self.snapshot(self.projection())
        self.assertEqual(fresh['capabilities'], ['blog.article.read_public'])
        self.assertEqual(old['capabilities'], list(PROJECTION_KEYS))
        response = self.http.post('/role/', json={'name': 'not-authorized', 'code': 'not-authorized', 'capabilities': old['capabilities']})
        self.assertEqual(response.status_code, 403)
        self.assert_no_business_writes(before)

    def test_snapshot_cannot_authorize_a_write_after_logout(self):
        pair = self.install()
        old = self.snapshot(self.projection())
        self.assertEqual(old['account_id'], '1')
        self.assertTrue(self.auth.logout(pair.access_token))
        before = self.state()
        self.assertEqual(self.projection().status_code, 401)
        self.assertEqual(self.http.post('/role/', json={'name': 'after-logout', 'code': 'after-logout'}).status_code, 401)
        self.assert_no_business_writes(before)

    def test_clock_is_resampled_after_storage_before_grants_and_expiry(self):
        pair = self.install()
        before = self.state()
        initial = int(time.time())
        reads = []
        def elapsed_clock():
            reads.append(True)
            return initial if len(reads) == 1 else initial + 601
        # Controlled server clock models a long read, without sleeping or
        # changing signed-token verification's real system clock.
        data = CapabilityProjectionService(self.auth, registry=create_module_registry(), clock=elapsed_clock).project(pair.access_token).model_dump()
        self.assertGreaterEqual(len(reads), 2)
        self.assertEqual(data['capabilities'], ['blog.article.read_public'])
        self.assert_no_business_writes(before)

    def test_logout_visible_before_expiry_recheck_does_not_return_stale_grants(self):
        pair = self.install()
        before = self.state()
        original = self.auth.get_token_expiry
        def withdraw_then_check(*args, **kwargs):
            self.assertTrue(self.auth.logout(pair.access_token))
            return original(*args, **kwargs)
        with patch.object(self.auth, 'get_token_expiry', withdraw_then_check):
            response = self.projection()
        self.assertEqual(response.status_code, 401, response.text)
        self.assert_no_business_writes(before)

    def test_single_connection_pool_projection_does_not_borrow_a_second_connection(self):
        self.pool.close()
        self.pool = SocketManager(self.socket, self.database, pool_size=1)
        self.addCleanup(self.pool.close)
        self.auth.user_manager = UserManager(self.pool)
        self.install()
        before = self.state()
        self.assertEqual(len(self.snapshot(self.projection())['capabilities']), 10)
        self.assert_no_business_writes(before)

    def test_direct_service_rejects_caller_principal_and_bad_registry_with_fixed_errors(self):
        service = CapabilityProjectionService(self.auth, registry=create_module_registry())
        before = self.state()
        with self.assertRaises(AuthorizationDenied):
            service.project(Principal(kind='user', user_id=1, roles=('admin',)))
        class BrokenRegistry:
            @property
            def capabilities(self):
                raise ValueError('private-manifest-sentinel')
        with patch.object(service, 'registry', BrokenRegistry()):
            with self.assertRaises(AuthorizationDenied) as caught:
                service.project(None)
        self.assertEqual(caught.exception.status_code, 503)
        self.assertNotIn('private-manifest-sentinel', str(caught.exception))
        self.assert_no_business_writes(before)


    def test_registry_factory_failure_through_real_http_keeps_fixed_503_and_no_writes(self):
        before = self.state()
        with patch('src.module_composition.create_module_registry', side_effect=ValueError('private-manifest-sentinel')):
            response = self.projection()
        self.assertEqual(response.status_code, 503)
        self.assertNotIn('private-manifest-sentinel', response.text)
        self.assertEqual(response.json()['code'], 'AUTH_SERVICE_UNAVAILABLE')
        self.assert_no_business_writes(before)


def load_tests(loader, _tests, _pattern):
    return unittest.TestSuite(CapabilityProjectionStackTests(name) for name in sorted(CapabilityProjectionStackTests.__dict__)
                              if name.startswith('test_'))


if __name__ == '__main__':
    unittest.main()
