"""Real SQLite transactions; metadata emulation is not MySQL engine proof."""

import json
import sqlite3
import sys
import tempfile
import unittest
from dataclasses import FrozenInstanceError
from datetime import datetime
from hashlib import sha256
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from src.controller.resource_manager import ResourceManager
from src.controller.role_manager import RoleManager
from src.controller.user_manage import UserManager
from src.core.auth.admin_audit import (
    ADMIN_AUDIT_ACTIONS, AUDIT_TRANSACTION_TABLES, AdminAuditContext,
    AdminAuditTargetError, AdminAuditUnavailableError, admin_audit_target,
    create_admin_audit_context, record_admin_change,
)
from src.core.auth.admin_recovery import LastAdministratorError
from src.type.user_type import User
from test_admin_recovery import Database, SqliteUow
import test_admin_recent_auth as recent_tests


class AuditUow(SqliteUow):
    def __enter__(self):
        if self.db.active:
            raise AssertionError('nested pool borrow')
        self.db.active += 1
        return super().__enter__()

    def __exit__(self, *args):
        try:
            return super().__exit__(*args)
        finally:
            self.db.active -= 1

    def query(self, sql, params=None):
        params = tuple(value.isoformat(' ') if isinstance(value, datetime) else value
                       for value in params) if params else params
        return super().query(sql.replace('NOW()', 'CURRENT_TIMESTAMP'), params)

    def fetch_all(self, sql, params=None):
        if 'FROM information_schema.TABLES' in sql:
            self.db.statements.append(sql)
            return [{'table_name': name, 'engine': engine} for name, engine in self.db.engines.items()]
        return super().fetch_all(sql, params)

    def execute(self, sql, params=None):
        result = super().execute(sql, params)
        if sql.startswith('INSERT INTO admin_change_audit') and self.db.bad_audit_id is not None:
            return self.db.bad_audit_id
        return result

    def commit(self):
        super().commit()
        if self.db.ack_loss:
            raise RuntimeError('private commit acknowledgement diagnostic')


class AuditDatabase(Database):
    def __init__(self, path):
        super().__init__(path)
        self.active, self.bad_audit_id, self.ack_loss = 0, None, False
        self.engines = {name: 'InnoDB' for name in AUDIT_TRANSACTION_TABLES}
        with sqlite3.connect(path) as db:
            for definition in ['username TEXT', 'sex INTEGER', 'age INTEGER', 'phone TEXT',
                               'email TEXT', 'birth_day TEXT', 'create_time TIMESTAMP']:
                db.execute('ALTER TABLE users ADD COLUMN ' + definition)
            db.execute('ALTER TABLE roles ADD COLUMN create_time TIMESTAMP')
            for field in ['name', 'code', 'type', 'path', 'description', 'create_time']:
                db.execute('ALTER TABLE resources ADD COLUMN ' + field + ' TEXT')

    def unit_of_work(self, *, isolation_level=None):
        self.isolations.append(isolation_level)
        return AuditUow(self, isolation_level)

    def rows(self, table):
        with sqlite3.connect(self.path) as db:
            return db.execute(f'SELECT * FROM {table} ORDER BY 1').fetchall()

    def snapshot(self):
        return {name: self.rows(name) for name in AUDIT_TRANSACTION_TABLES}


class AdminAuditTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.db = AuditDatabase(str(Path(self.temp.name) / 'audit.sqlite'))
        self.users, self.roles, self.resources = UserManager(self.db), RoleManager(self.db), ResourceManager(self.db)
        self.audit = create_admin_audit_context(actor_user_id=1, session_family_id='private-family', request_id='private-request')

    @staticmethod
    def user():
        return User(username='synthetic', name='PRIVATE NAME', sex=0, age=18, phone='',
                    email='private@example.test', password='PRIVATE PASSWORD', birth_day='2000-01-01')

    def writes(self):
        return [
            ('user.create', lambda: self.users.create_user(self.user(), audit=self.audit)),
            ('user.disable', lambda: self.users.delete_user('0002', audit=self.audit)),
            ('role.create', lambda: self.roles.create_role({'name': 'PRIVATE ROLE', 'code': 'editor'}, audit=self.audit)),
            ('role.update', lambda: self.roles.update_role(2, name='PRIVATE UPDATE', audit=self.audit)),
            ('role.delete', lambda: self.roles.delete_role(2, audit=self.audit)),
            ('role.bind_resources', lambda: self.roles.bind_resources(3, [1], audit=self.audit)),
            ('resource.create', lambda: self.resources.create_resource({'name': 'PRIVATE RESOURCE', 'code': 'read', 'type': 'api', 'path': '/PRIVATE'}, audit=self.audit)),
            ('resource.update', lambda: self.resources.update_resource(1, path='/PRIVATE PATH', audit=self.audit)),
            ('resource.delete', lambda: self.resources.delete_resource(1, audit=self.audit)),
        ]

    def test_all_nine_business_and_safe_audit_rows_commit_once_on_one_connection(self):
        for index, (action, write) in enumerate(self.writes(), 1):
            write()
            self.assertEqual(self.db.borrows, index)
            self.assertEqual(self.db.commits, index)
            row = self.db.rows('admin_change_audit')[-1]
            self.assertEqual(row[1:6], (1, self.audit.session_ref, self.audit.request_ref,
                                       action, action.split('.')[0]))
            self.assertGreater(row[6], 0)
            self.assertGreater(row[7], 0)
            self.assertNotIn('PRIVATE', json.dumps(row))
            self.assertNotIn('private-family', json.dumps(row))
        self.assertEqual({row[4] for row in self.db.rows('admin_change_audit')}, ADMIN_AUDIT_ACTIONS)
        self.assertEqual(self.db.rows('admin_change_audit')[0][7], 2)
        self.assertEqual(self.db.direct_writes, 0)
        self.assertEqual(self.db.isolations, ['READ COMMITTED'] * 9)

    def test_missing_audit_table_never_returns_success_or_leaves_partial_business(self):
        with sqlite3.connect(self.db.path) as db:
            db.execute('DROP TABLE admin_change_audit')
        before = {name: self.db.rows(name) for name in AUDIT_TRANSACTION_TABLES if name != 'admin_change_audit'}
        for action, write in self.writes():
            with self.subTest(action=action), self.assertRaises(AdminAuditUnavailableError):
                write()
            self.assertEqual({name: self.db.rows(name) for name in before}, before)
        self.assertEqual(self.db.commits, 0)

    def test_metadata_requires_all_six_innodb_tables_before_dml_each_time(self):
        before = self.db.snapshot()
        for name in AUDIT_TRANSACTION_TABLES:
            self.db.engines[name] = 'MyISAM'
            start = len(self.db.statements)
            with self.assertRaises(AdminAuditUnavailableError):
                self.roles.update_role(2, name='not applied', audit=self.audit)
            self.assertFalse(any(sql.lstrip().startswith(('UPDATE', 'INSERT', 'DELETE')) for sql in self.db.statements[start:]))
            self.db.engines[name] = 'InnoDB'
        self.db.engines.pop('admin_change_audit')
        with self.assertRaises(AdminAuditUnavailableError):
            self.roles.delete_role(2, audit=self.audit)
        self.assertEqual(self.db.snapshot(), before)

    def test_bad_audit_insert_identity_rolls_back_both_parts(self):
        before = self.db.snapshot()
        for identity in (0, True, -1, '1'):
            self.db.bad_audit_id = identity
            with self.assertRaises(AdminAuditUnavailableError):
                self.users.create_user(self.user(), audit=self.audit)
            self.assertEqual(self.db.snapshot(), before)

    def test_commit_before_failure_has_neither_but_ack_loss_keeps_both_without_retry(self):
        before = self.db.snapshot()
        self.db.fail_commit = True
        with self.assertRaises(AdminAuditUnavailableError):
            self.roles.update_role(2, name='not committed', audit=self.audit)
        self.assertEqual(self.db.snapshot(), before)
        self.db.fail_commit, self.db.ack_loss = False, True
        with self.assertRaises(AdminAuditUnavailableError):
            self.roles.update_role(2, name='committed but unknown', audit=self.audit)
        self.assertEqual(self.db.rows('roles')[1][2], 'committed but unknown')
        self.assertEqual(len(self.db.rows('admin_change_audit')), 1)
        self.assertEqual(self.db.borrows, 2)

    def test_last_admin_conflict_rolls_back_already_inserted_audit(self):
        before = self.db.snapshot()
        with self.assertRaises(LastAdministratorError):
            self.users.delete_user('1', audit=self.audit)
        self.assertEqual(self.db.snapshot(), before)
        with self.assertRaises(LastAdministratorError):
            self.roles.update_role(1, code='editor', audit=self.audit)
        self.assertEqual(self.db.snapshot(), before)

    def test_binding_empty_records_one_action_and_second_insert_error_restores_old_links(self):
        self.roles.bind_resources(2, [], audit=self.audit)
        self.assertEqual(self.db.rows('admin_change_audit')[-1][7], 1)
        self.roles.bind_resources(2, [], audit=self.audit)
        self.assertEqual(self.db.rows('admin_change_audit')[-1][7], 0)
        before = self.db.snapshot()
        with self.assertRaises(AdminAuditUnavailableError):
            self.roles.bind_resources(1, [1, 999], audit=self.audit)
        self.assertEqual(self.db.snapshot(), before)

    def test_deleting_only_dangling_links_is_audited_while_returning_false(self):
        with sqlite3.connect(self.db.path) as db:
            db.execute('INSERT INTO user_roles VALUES(2,99)')
            db.execute('INSERT INTO role_resources VALUES(99,1)')
            db.execute('INSERT INTO role_resources VALUES(1,99)')
        self.assertFalse(self.roles.delete_role(99, audit=self.audit))
        self.assertEqual(self.db.rows('admin_change_audit')[-1][4:8], ('role.delete', 'role', 99, 2))
        self.assertFalse(self.resources.delete_resource(99, audit=self.audit))
        self.assertEqual(self.db.rows('admin_change_audit')[-1][4:8], ('resource.delete', 'resource', 99, 1))

    def test_nonexistent_single_crud_does_not_fabricate_change_records(self):
        self.assertEqual(self.roles.update_role(99, name='unused', audit=self.audit), 0)
        self.assertFalse(self.roles.delete_role(99, audit=self.audit))
        self.assertEqual(self.resources.update_resource(99, path='/unused', audit=self.audit), 0)
        self.assertFalse(self.resources.delete_resource(99, audit=self.audit))
        self.assertFalse(self.users.delete_user('99', audit=self.audit))
        self.assertEqual(self.db.rows('admin_change_audit'), [])

    def test_explicit_invalid_context_or_user_target_fails_before_borrowing(self):
        for context in ({}, AdminAuditContext(True, 'a' * 64, 'b' * 64),
                        AdminAuditContext(1, 'PRIVATE', 'b' * 64)):
            with self.assertRaises(AdminAuditUnavailableError):
                self.users.create_user(self.user(), audit=context)
        for target in ['2oops', ' 2', '2 ', '２', '0', '', '-1', True]:
            with self.assertRaises(AdminAuditTargetError):
                self.users.delete_user(target, audit=self.audit)
        self.assertEqual(self.db.borrows, 0)
        self.assertEqual(admin_audit_target('0002'), 2)

    def test_context_is_immutable_and_contains_only_hashes_not_raw_session_or_request(self):
        self.assertEqual(self.audit.session_ref, sha256(b'1:private-family').hexdigest())
        self.assertEqual(self.audit.request_ref, sha256(b'private-request').hexdigest())
        with self.assertRaises(FrozenInstanceError):
            self.audit.actor_user_id = 2
        self.assertNotIn('private-', repr(self.audit))
        first = create_admin_audit_context(actor_user_id=1, session_family_id='family')
        second = create_admin_audit_context(actor_user_id=1, session_family_id='family')
        self.assertNotEqual(first.request_ref, second.request_ref)
        for action in ('role.NEW', 'PRIVATE', {}, None):
            with self.assertRaises(AdminAuditUnavailableError):
                record_admin_change(None, self.audit, action=action, target_id=1, affected_rows=1)

    def test_internal_none_remains_explicitly_unaudited(self):
        self.assertEqual(self.roles.update_role(2, name='internal'), 1)
        self.assertEqual(self.db.rows('admin_change_audit'), [])
        self.assertEqual(self.db.borrows, 0)

    def test_http_passes_server_context_to_nine_handlers_and_ignores_client_audit_values(self):
        helper = recent_tests.AdminRecentHttpTests()
        client, _ = helper.client()
        with patch('src.routers.auth.auth.get_request_id', return_value='server-request'):
            for method, path, body in helper.operations():
                body = {**body, 'audit': {'actor_user_id': 999}} if body else body
                self.assertIn(client.request(method, path, json=body,
                    headers={'X-Actor-ID': '999', 'X-Request-ID': 'PRIVATE'}).status_code, (200, 201))
        for call in helper.writes.mock_calls:
            audit = call.kwargs['audit']
            self.assertIs(type(audit), AdminAuditContext)
            self.assertEqual(audit.actor_user_id, 2)
            self.assertEqual(audit.session_ref, sha256(b'2:synthetic-family').hexdigest())
            self.assertEqual(audit.request_ref, sha256(b'server-request').hexdigest())

    def test_yield_dependency_maps_storage_failure_and_invalid_target_without_weak_fallback(self):
        from src.routers.auth.auth import get_auth_manager
        from src.routers.user.user import get_user_manager
        helper = recent_tests.AdminRecentHttpTests()
        client, app = helper.client()
        app.dependency_overrides[get_user_manager] = lambda: self.users
        app.dependency_overrides[get_auth_manager] = lambda: SimpleNamespace(
            get_recent_session_context=lambda *args, **kwargs: (2, 'family'))
        response = client.delete('/user/2oops')
        self.assertEqual(response.status_code, 422)
        self.assertEqual(self.db.borrows, 0)
        self.db.fail_on = lambda sql: sql.startswith('INSERT INTO admin_change_audit')
        before = self.db.snapshot()
        response = client.delete('/user/2')
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()['detail']['code'], 'ADMIN_AUDIT_UNAVAILABLE')
        self.assertNotIn('synthetic database', response.text)
        self.assertEqual(self.db.snapshot(), before)

    def test_missing_server_tuple_never_fabricates_audit_context(self):
        from src.routers.auth.auth import require_recent_admin
        helper = recent_tests.AdminRecentHttpTests()
        client, app = helper.client()
        app.dependency_overrides[require_recent_admin] = lambda: {'id': 2}
        response = client.delete('/user/2')
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()['detail']['code'], 'ADMIN_AUDIT_UNAVAILABLE')
        self.assertEqual(helper.writes.mock_calls, [])

    def test_checker_enforces_audit_set_in_addition_to_legacy_and_recent_sets(self):
        from fastapi import Depends, FastAPI
        from src.core.auth.admin_shadow import ADMIN_OPERATIONS
        from src.core.auth.recent import ADMIN_STEP_UP_OPERATIONS
        from src.routers.auth.auth import require_admin, require_recent_admin, require_admin_audit
        checker = recent_tests.RecentPolicyInventoryTests().checker()
        for fault in (None, 'missing', 'extra'):
            app = FastAPI()
            for method, path in sorted(ADMIN_OPERATIONS):
                guard = require_admin_audit if (method, path) in ADMIN_STEP_UP_OPERATIONS else require_admin
                if fault == 'missing' and (method, path) == ('POST', '/role/'):
                    guard = require_recent_admin
                if fault == 'extra' and (method, path) == ('GET', '/role/'):
                    guard = require_admin_audit
                app.add_api_route(path, lambda: True, methods=[method], dependencies=[Depends(guard)])
            if fault is None:
                checker.verify_admin_policy(app.routes)
            else:
                with self.assertRaises(ValueError):
                    checker.verify_admin_policy(app.routes)
                self.assertEqual(checker.guarded_operations(app.routes, require_admin), ADMIN_OPERATIONS)
                self.assertNotEqual(checker.guarded_operations(app.routes, require_admin_audit), ADMIN_STEP_UP_OPERATIONS)
                if fault == 'missing':
                    self.assertEqual(checker.guarded_operations(app.routes, require_recent_admin), ADMIN_STEP_UP_OPERATIONS)


if __name__ == '__main__':
    unittest.main()
