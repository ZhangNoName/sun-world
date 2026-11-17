"""Signed sessions/current SQLite reads; not native MySQL isolation evidence."""

import hashlib
import sqlite3
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from src.controller.auth_manager import AuthManager
from src.controller.user_manage import UserManager
from src.module_composition import create_module_registry
from src.modules.management.projection import (
    CapabilityProjection, CapabilityProjectionService, PROJECTION_KEYS,
)
from src.modules.management.policy import ManagementLoginRequired, ManagementUnavailable
from test_management_service import ServiceDatabase
from test_auth_manager import StatefulRedis, TEST_DEVICE_ID


class ProjectionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.db = ServiceDatabase(str(Path(self.temp.name) / 'projection.sqlite'))
        self.redis = StatefulRedis()
        self.auth = AuthManager(UserManager(self.db), self.redis, secret_key='synthetic-projection-secret')
        self.token = self.auth.create_tokens_for_user('1', TEST_DEVICE_ID).access_token
        self.now = time.time()
        self.service = CapabilityProjectionService(self.auth, registry=create_module_registry(), clock=lambda: self.now)

    def mutate(self, statement):
        with sqlite3.connect(self.db.path) as connection:
            connection.execute(statement)

    def test_anonymous_has_public_read_without_auth_or_database(self):
        result = CapabilityProjectionService(registry=create_module_registry()).project()
        self.assertIsNone(result.account_id)
        self.assertIsNone(result.session_ref)
        self.assertEqual(result.capabilities, ['blog.article.read_public'])
        self.assertEqual(result.max_age_seconds, 15)
        self.assertEqual(self.db.statements, [])

    def test_fresh_admin_uses_current_read_and_has_no_business_or_audit_write(self):
        before = self.db.snapshot()
        result = self.service.project(self.token)
        principal = self.service.auth.get_recent_session_context(self.token, max_age_seconds=600)
        self.assertEqual(result.capabilities, list(PROJECTION_KEYS))
        self.assertEqual(result.account_id, '1')
        self.assertEqual(result.session_ref, hashlib.sha256(f'1:{principal[1]}'.encode()).hexdigest())
        self.assertEqual(result.max_age_seconds, 15)
        self.assertEqual(self.db.snapshot(), before)
        self.assertEqual(self.db.commits, 0)
        self.assertEqual(set(self.db.isolations), {'READ COMMITTED'})

    def test_current_role_and_recent_window_project_only_public(self):
        self.now += 700
        self.assertEqual(self.service.project(self.token).capabilities, ['blog.article.read_public'])
        self.now -= 700
        self.mutate('DELETE FROM user_roles WHERE user_id=1')
        self.assertEqual(self.service.project(self.token).capabilities, ['blog.article.read_public'])

    def test_invalid_empty_revoked_disabled_and_status_two_do_not_downgrade(self):
        for token in ('', 'invalid'):
            with self.assertRaises(ManagementLoginRequired):
                self.service.project(token)
        for status in (0, 2):
            self.mutate(f'UPDATE users SET status={status} WHERE id=1')
            with self.assertRaises(ManagementLoginRequired):
                self.service.project(self.token)
        self.mutate('UPDATE users SET status=1 WHERE id=1')
        self.auth.logout(self.token)
        with self.assertRaises(ManagementLoginRequired):
            self.service.project(self.token)

    def test_ttl_is_bounded_by_access_and_recent_window(self):
        expiry = self.auth.get_token_expiry(self.token, 'access')
        self.now = expiry.timestamp() - 2.1
        self.assertEqual(self.service.project(self.token).max_age_seconds, 2)
        context = self.auth.get_recent_session_context(self.token, max_age_seconds=600)
        from jose import jwt
        payload = jwt.decode(self.token, self.auth.secret_key, algorithms=['HS256'])
        self.now = payload['auth_time'] + 599.1
        self.assertEqual(self.service.project(self.token).max_age_seconds, 0)
        self.assertIsNotNone(context)

    def test_same_user_new_family_has_distinct_reference(self):
        original = self.service.project(self.token)
        new = self.auth.create_tokens_for_user('1', TEST_DEVICE_ID).access_token
        self.assertNotEqual(original.session_ref, self.service.project(new).session_ref)

    def test_dependency_and_configuration_errors_fail_closed(self):
        with patch.object(self.auth.user_manager, 'get_auth_context', side_effect=RuntimeError('private')):
            with self.assertRaises(ManagementUnavailable) as error:
                self.service.project(self.token)
            self.assertNotIn('private', str(error.exception))
        with patch('src.modules.management.projection.step_up_max_age_seconds', side_effect=ValueError()):
            with self.assertRaises(ManagementUnavailable):
                self.service.project(self.token)

    def test_schema_rejects_unknown_keys_duplicates_and_out_of_range_ttl(self):
        valid = self.service.project(self.token).model_dump()
        for changes in ({'roles': []}, {'capabilities': ['unregistered']},
                        {'capabilities': ['blog.article.read_public'] * 2},
                        {'max_age_seconds': True}, {'max_age_seconds': 16}):
            with self.assertRaises(ValueError):
                CapabilityProjection.model_validate(valid | changes)

    def test_dto_rejects_anonymous_management_grants_and_unpaired_identity(self):
        valid = self.service.project(self.token).model_dump()
        for changes in ({'account_id': None}, {'session_ref': None},
                        {'account_id': None, 'session_ref': None,
                         'capabilities': ['identity.role.create']}):
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                CapabilityProjection.model_validate(valid | changes)
        for capabilities in ([], ['blog.article.read_public']):
            projection = CapabilityProjection.model_validate(valid | {
                'account_id': None, 'session_ref': None, 'capabilities': capabilities})
            self.assertEqual(projection.capabilities, capabilities)

    def test_http_cookie_boundary_and_cache_headers(self):
        from src.routers.auth.auth import router, get_optional_capability_auth
        application = FastAPI()
        application.include_router(router)
        application.dependency_overrides[get_optional_capability_auth] = lambda: self.auth
        with TestClient(application) as client:
            for cookie, status in [(None, 200), ('access_token=', 401),
                                   ('access_token=invalid', 401),
                                   ('access_token=' + self.token, 200)]:
                response = client.get('/auth/capabilities', headers={'Cookie': cookie} if cookie else {})
                self.assertEqual(response.status_code, status)
                self.assertEqual(response.headers['cache-control'], 'no-store')
                self.assertEqual(response.headers['vary'], 'Cookie')
            with patch.object(self.auth.user_manager, 'get_auth_context', side_effect=RuntimeError('private')):
                response = client.get('/auth/capabilities', headers={'Cookie': 'access_token=' + self.token})
                self.assertEqual(response.status_code, 503)
                self.assertNotIn('private', response.text)

    def test_registry_factory_dependency_failure_is_fixed_503_without_storage(self):
        from src.routers.auth.auth import router, get_optional_capability_auth
        application = FastAPI()
        application.include_router(router)
        application.dependency_overrides[get_optional_capability_auth] = lambda: self.auth
        with (TestClient(application) as client,
              patch('src.module_composition.create_module_registry', side_effect=ValueError('private')),
              patch.object(self.db, 'unit_of_work') as storage):
            response = client.get('/auth/capabilities')
            self.assertEqual(response.status_code, 503)
            self.assertEqual(response.headers['cache-control'], 'no-store')
            self.assertEqual(response.headers['vary'], 'Cookie')
            self.assertEqual(response.json()['detail']['code'], 'AUTH_SERVICE_UNAVAILABLE')
            self.assertNotIn('private', response.text)
            storage.assert_not_called()

    def test_schema_gate_runs_in_isolated_process(self):
        root = Path(__file__).resolve().parents[3]
        result = subprocess.run([sys.executable, 'scripts/check-admin-policy.py'], cwd=root,
                                timeout=20, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('40 guarded', result.stdout)


if __name__ == '__main__':
    unittest.main()
