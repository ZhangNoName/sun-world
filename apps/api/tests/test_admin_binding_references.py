"""Reference/input behavior on SQLite; real InnoDB lock proof is separate."""

import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from src.controller.auth_manager import AuthManager
from src.controller.user_manage import UserManager
from src.controller.role_manager import RoleManager
from src.core.auth import AuthorizationDenied
from src.core.auth.admin_audit import AdminAuditUnavailableError
from src.modules.management.public import AdminManagementService
from src.modules.management.schemas import RoleBind
from src.modules.management.targets import BindingReferences
from src.type.management_type import BindResourcesModel
from test_auth_manager import StatefulRedis, TEST_DEVICE_ID
from test_management_service import ServiceDatabase, ServiceUow


class BindingSchemaTests(unittest.TestCase):
    def test_both_schemas_preserve_first_order_set_semantics_and_empty_clear(self):
        for schema in (BindResourcesModel, RoleBind):
            self.assertEqual(schema(resource_ids=[3, 1, 3, 2, 1]).resource_ids, [3, 1, 2])
            self.assertEqual(schema(resource_ids=[]).resource_ids, [])
            self.assertEqual(schema().resource_ids, [])
            self.assertEqual(schema(resource_ids=[1] * 500).resource_ids, [1])
            self.assertEqual(schema(resource_ids=list(range(1, 501))).resource_ids, list(range(1, 501)))
            self.assertEqual(schema(resource_ids=[2_147_483_647]).resource_ids, [2_147_483_647])
            self.assertEqual(schema.model_json_schema()['properties']['resource_ids']['items']['maximum'], 2_147_483_647)

    def test_strict_positive_ids_and_original_list_size_are_checked_before_dedup(self):
        for schema in (BindResourcesModel, RoleBind):
            for value in (0, -1, True, False, 1.0, '1', None, 2_147_483_648, 9_223_372_036_854_775_807):
                with self.subTest(schema=schema.__name__, value=value), self.assertRaises(ValidationError):
                    schema(resource_ids=[value])
            for values in ((1,), {1}, None, [1] * 501):
                with self.subTest(schema=schema.__name__, kind=type(values).__name__), self.assertRaises(ValidationError):
                    schema(resource_ids=values)


class BindingReferenceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.db = ServiceDatabase(str(Path(self.temp.name) / 'bindings.sqlite'))
        self.users = UserManager(self.db)
        self.redis = StatefulRedis()
        self.auth = AuthManager(self.users, self.redis, secret_key='synthetic-binding-secret')
        self.token = self.auth.create_tokens_for_user('1', TEST_DEVICE_ID).access_token
        self.service = AdminManagementService(self.auth)
        with sqlite3.connect(self.db.path) as db:
            db.executemany('INSERT INTO resources(id) VALUES(?)', [(2,), (3,)])

    def execute(self, ids, role=2, token=None):
        return self.service.execute(self.token if token is None else token,
            'role.bind_resources', {'resource_ids': ids}, target_id=role)

    def bindings(self):
        return sorted(self.db.rows('role_resources'))

    def test_unique_resources_and_role_are_locked_after_auth_before_any_dml(self):
        original = ServiceUow.fetch_all
        resource_parameters = []
        def read(uow, sql, params=None):
            if sql.startswith('SELECT id FROM resources FORCE INDEX'):
                resource_parameters.append(params)
            return original(uow, sql, params)
        with patch.object(ServiceUow, 'fetch_all', read):
            self.execute([3, 1, 3, 2])
        statements = self.db.statements
        role_ref = next(i for i, sql in enumerate(statements) if sql == 'SELECT id FROM roles WHERE id = %s FOR UPDATE')
        resource_ref = next(i for i, sql in enumerate(statements) if sql.startswith('SELECT id FROM resources FORCE INDEX'))
        actor_binding = next(i for i, sql in enumerate(statements) if sql.startswith('SELECT role_id FROM user_roles'))
        dml = next(i for i, sql in enumerate(statements) if sql.startswith('DELETE FROM role_resources'))
        self.assertLess(actor_binding, role_ref)
        self.assertLess(role_ref, resource_ref)
        self.assertLess(resource_ref, dml)
        self.assertIn('ORDER BY id FOR UPDATE', statements[resource_ref])
        self.assertEqual(resource_parameters, [(1, 2, 3)])
        self.assertEqual([row for row in self.bindings() if row[0] == 2], [(2, 1), (2, 2), (2, 3)])
        self.assertEqual(self.db.rows('admin_change_audit')[-1][7], 4)
        self.assertEqual(self.db.commit_attempts, 1)
        self.assertEqual(self.db.active, 0)

    def test_missing_role_including_empty_or_any_missing_resource_is_uniform_404(self):
        before = self.db.snapshot()
        for role, ids in ((999, []), (999, [1]), (2, [1, 999]), (2, [2_147_483_647])):
            with self.subTest(role=role, ids=ids), self.assertRaises(AuthorizationDenied) as caught:
                self.execute(ids, role)
            self.assertEqual(caught.exception.status_code, 404)
            self.assertEqual(caught.exception.code, 'MANAGEMENT_REFERENCE_NOT_FOUND')
            self.assertEqual(str(caught.exception), '管理操作引用不存在。')
            self.assertEqual(self.db.snapshot(), before)
        self.assertEqual(self.db.commit_attempts, 0)
        self.assertFalse(any(sql.lstrip().startswith(('DELETE', 'INSERT', 'UPDATE')) for sql in self.db.statements))

    def test_empty_list_checks_role_then_clears_once_without_resource_query(self):
        self.execute([])
        self.assertNotIn((2, 1), self.bindings())
        self.assertEqual(self.db.rows('admin_change_audit')[-1][7], 1)
        self.assertFalse(any(sql.startswith('SELECT id FROM resources') for sql in self.db.statements))

    def test_500_real_references_are_accepted_without_nested_borrowing(self):
        with sqlite3.connect(self.db.path) as db:
            db.executemany('INSERT INTO resources(id) VALUES(?)', [(i,) for i in range(4, 501)])
        self.execute(list(range(500, 0, -1)))
        self.assertEqual(len([row for row in self.bindings() if row[0] == 2]), 500)
        self.assertEqual(self.db.rows('admin_change_audit')[-1][7], 501)
        self.assertEqual(self.db.commit_attempts, 1)
        self.assertEqual(self.db.active, 0)

    def test_physical_signed_int_resource_boundary_succeeds_and_next_value_is_rejected(self):
        with sqlite3.connect(self.db.path) as db:
            db.execute('INSERT INTO resources(id) VALUES(?)', (2_147_483_647,))
        self.execute([2_147_483_647])
        self.assertIn((2, 2_147_483_647), self.bindings())
        before = self.db.snapshot()
        with self.assertRaises(AuthorizationDenied) as caught:
            self.execute([2_147_483_648])
        self.assertEqual(caught.exception.status_code, 422)
        self.assertEqual(self.db.snapshot(), before)
        with self.assertRaises(AuthorizationDenied):
            BindingReferences(2, (2_147_483_648,))
        # The role target format has not been narrowed with resource IDs.
        self.assertEqual(BindingReferences(9_223_372_036_854_775_807, ()).role_id, 9_223_372_036_854_775_807)

    def test_unauthorized_missing_targets_do_not_reach_reference_lookup(self):
        normal = self.auth.create_tokens_for_user('2', TEST_DEVICE_ID).access_token
        for token in ('', normal):
            with self.assertRaises(AuthorizationDenied):
                self.execute([999], role=999, token=token)
        self.assertFalse(any(sql.startswith(('SELECT id FROM roles WHERE', 'SELECT id FROM resources'))
                             for sql in self.db.statements))
        self.assertEqual(self.db.commit_attempts, 0)

    def test_verified_references_and_manager_share_an_immutable_server_copy(self):
        original_check = BindingReferences.require_existing
        original_bind = self.service.roles.bind_resources
        for as_model in (False, True):
            caller_ids = [3, 1, 3, 2]
            parameters = BindResourcesModel(resource_ids=caller_ids) if as_model else {'resource_ids': caller_ids}
            captured = {}
            def validate(refs, uow):
                original_check(refs, uow)
                captured['validated'] = refs.resource_ids
                caller_ids[:] = [999]
                if as_model:
                    parameters.resource_ids[:] = [999]
            def bind(role_id, resource_ids, **kwargs):
                captured['manager'] = resource_ids
                return original_bind(role_id, resource_ids, **kwargs)
            with patch.object(BindingReferences, 'require_existing', validate), \
                    patch.object(self.service.roles, 'bind_resources', side_effect=bind):
                self.service.execute(self.token, 'role.bind_resources', parameters, target_id=2)
            self.assertIs(captured['validated'], captured['manager'])
            self.assertIs(type(captured['manager']), tuple)
            self.assertEqual(captured['manager'], (3, 1, 2))
            self.assertEqual([row for row in self.bindings() if row[0] == 2], [(2, 1), (2, 2), (2, 3)])

    def test_intermediate_insert_and_audit_failures_preserve_complete_old_set(self):
        before = self.db.snapshot()
        inserts = 0
        def second_insert(sql):
            nonlocal inserts
            if sql.startswith('INSERT INTO role_resources'):
                inserts += 1
                return inserts == 2
            return False
        self.db.fail_on = second_insert
        with self.assertRaises(AdminAuditUnavailableError):
            self.execute([2, 3])
        self.assertEqual(inserts, 2)
        self.assertEqual(self.db.snapshot(), before)
        self.db.fail_on = lambda sql: sql.startswith('INSERT INTO admin_change_audit')
        with self.assertRaises(AdminAuditUnavailableError):
            self.execute([2, 3])
        self.assertEqual(self.db.snapshot(), before)

    def test_final_session_revocation_rolls_back_both_bindings_and_audit(self):
        import src.controller.role_manager as role_module
        original = role_module.record_admin_change
        before = self.db.snapshot()
        def revoke(*args, **kwargs):
            result = original(*args, **kwargs)
            self.redis.hdelete('user:1:access_tokens', TEST_DEVICE_ID)
            return result
        with patch.object(role_module, 'record_admin_change', side_effect=revoke):
            with self.assertRaises(AuthorizationDenied):
                self.execute([2, 3])
        self.assertEqual(self.db.snapshot(), before)
        self.assertEqual(self.db.commit_attempts, 0)

    def test_commit_ack_unknown_keeps_both_and_never_repeats_the_operation(self):
        self.db.ack_loss = True
        with self.assertRaises(AdminAuditUnavailableError):
            self.execute([2, 3])
        self.assertEqual([row for row in self.bindings() if row[0] == 2], [(2, 2), (2, 3)])
        self.assertEqual(len(self.db.rows('admin_change_audit')), 1)
        self.assertEqual(self.db.commit_attempts, 1)

    def test_http_model_and_current_service_return_strict_422_or_fixed_404(self):
        from src.routers.auth.auth import get_auth_manager
        from src.routers.role.role import get_role_manager, router
        app = FastAPI()
        app.include_router(router)
        app.dependency_overrides[get_auth_manager] = lambda: self.auth
        app.dependency_overrides[get_role_manager] = lambda: RoleManager(self.db)
        client = TestClient(app, raise_server_exceptions=False)
        client.cookies.set('access_token', self.token)
        for value in (0, -1, True, '1', 1.0):
            self.assertEqual(client.post('/role/2/bind_resources', json={'resource_ids': [value]}).status_code, 422)
            with self.assertRaises(AuthorizationDenied) as caught:
                self.execute([value])
            self.assertEqual(caught.exception.status_code, 422)
        response = client.post('/role/999/bind_resources', json={'resource_ids': []})
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()['detail'], {'code': 'MANAGEMENT_REFERENCE_NOT_FOUND', 'message': '管理操作引用不存在。'})
        response = client.post('/role/2/bind_resources', json={'resource_ids': [1, 1]})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(self.db.rows('admin_change_audit')), 1)

    def test_trusted_raw_none_path_does_not_claim_service_reference_validation(self):
        with patch.object(BindingReferences, 'require_existing', side_effect=AssertionError('not called')):
            self.service.roles.bind_resources(2, [1])
        self.assertEqual(self.db.rows('admin_change_audit'), [])


if __name__ == '__main__':
    unittest.main()
