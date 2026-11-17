"""Offline transaction behavior, not proof of MySQL/InnoDB locking semantics."""

import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.controller.role_manager import RoleManager
from src.controller.user_manage import UserManager
from src.core.auth.admin_recovery import LastAdministratorError


class SqliteUow:
    def __init__(self, db, isolation_level):
        self.db = db
        self.isolation_level = isolation_level
        self.committed = False

    def __enter__(self):
        self.connection = sqlite3.connect(self.db.path)
        self.connection.row_factory = sqlite3.Row
        self.connection.execute('PRAGMA foreign_keys = ON')
        self.connection.execute('BEGIN')
        self.db.borrows += 1
        return self

    def query(self, sql, params=None):
        self.db.statements.append(sql)
        if self.db.fail_on and self.db.fail_on(sql):
            raise sqlite3.OperationalError('synthetic database failure')
        # These two clauses have no SQLite equivalent. They are not lock proof.
        sql = sql.replace(' FORCE INDEX (PRIMARY)', '').replace(' FOR UPDATE', '')
        return self.connection.execute(sql.replace('%s', '?'), params or ())

    def fetch_all(self, sql, params=None):
        if 'FROM information_schema.TABLES' in sql:
            from src.core.auth.admin_audit import AUDIT_TRANSACTION_TABLES
            return [{'table_name': name, 'engine': 'InnoDB'} for name in AUDIT_TRANSACTION_TABLES]
        return [dict(row) for row in self.query(sql, params).fetchall()]

    def fetch_one(self, sql, params=None):
        row = self.query(sql, params).fetchone()
        return dict(row) if row else None

    def execute(self, sql, params=None):
        cursor = self.query(sql, params)
        return cursor.lastrowid if sql.strip().upper().startswith('INSERT') else cursor.rowcount

    def commit(self):
        if self.db.fail_commit:
            raise sqlite3.OperationalError('synthetic commit failure')
        self.connection.commit()
        self.committed = True
        self.db.commits += 1

    def __exit__(self, kind, *_):
        try:
            if kind or not self.committed:
                self.connection.rollback()
                self.db.rollbacks += 1
        finally:
            self.connection.close()


class Database:
    def __init__(self, path):
        self.path = path
        self.borrows = self.commits = self.rollbacks = self.direct_writes = 0
        self.isolations, self.statements = [], []
        self.fail_on, self.fail_commit = None, False
        with sqlite3.connect(path) as db:
            db.executescript('''
                CREATE TABLE users(id INTEGER PRIMARY KEY, status INTEGER, name TEXT, password TEXT);
                CREATE TABLE roles(id INTEGER PRIMARY KEY, code TEXT, name TEXT, description TEXT);
                CREATE TABLE resources(id INTEGER PRIMARY KEY);
                CREATE TABLE user_roles(user_id INTEGER REFERENCES users(id),
                    role_id INTEGER REFERENCES roles(id), PRIMARY KEY(user_id,role_id));
                CREATE TABLE role_resources(role_id INTEGER REFERENCES roles(id),
                    resource_id INTEGER REFERENCES resources(id), PRIMARY KEY(role_id,resource_id));
                CREATE TABLE admin_change_audit(id INTEGER PRIMARY KEY AUTOINCREMENT,
                    actor_user_id INTEGER, session_ref TEXT, request_ref TEXT, action TEXT,
                    target_type TEXT, target_id INTEGER, affected_rows INTEGER, recorded_at TIMESTAMP);
                INSERT INTO users VALUES(1,1,'administrator',''),(2,1,'normal',''),(3,0,'disabled','');
                INSERT INTO roles VALUES(1,'admin','Admin',''),(2,'normal','Normal',''),
                    (3,'  AdMiN' || char(9),'Alternate','');
                INSERT INTO resources VALUES(1);
                INSERT INTO user_roles VALUES(1,1),(2,2),(3,3);
                INSERT INTO role_resources VALUES(1,1),(2,1);
            ''')

    def unit_of_work(self, *, isolation_level=None):
        self.isolations.append(isolation_level)
        return SqliteUow(self, isolation_level)

    def execute(self, sql, params):
        self.direct_writes += 1
        with sqlite3.connect(self.path) as db:
            return db.execute(sql.replace('%s', '?'), params).rowcount

    def rows(self, table):
        with sqlite3.connect(self.path) as db:
            return db.execute(f'SELECT * FROM {table} ORDER BY 1,2').fetchall()

    def snapshot(self):
        return {table: self.rows(table) for table in ('users', 'roles', 'user_roles', 'role_resources')}


class AdminRecoveryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.db = Database(str(Path(self.temp.name) / 'admin.sqlite'))
        self.users, self.roles = UserManager(self.db), RoleManager(self.db)

    def seed(self, sql):
        with sqlite3.connect(self.db.path) as db:
            db.execute(sql)

    def test_all_four_reducing_paths_preserve_last_administrator(self):
        writes = [lambda: self.users.update_user('1', status=0),
                  lambda: self.users.delete_user('1'),
                  lambda: self.users.set_role_by_id('1', [2]),
                  lambda: self.roles.update_role(1, code='editor'),
                  lambda: self.roles.delete_role(1)]
        before = self.db.snapshot()
        for write in writes:
            with self.subTest(write=write):
                with self.assertRaises(LastAdministratorError) as caught:
                    write()
                self.assertEqual(caught.exception.code, 'AUTH_LAST_ADMINISTRATOR')
                self.assertEqual(str(caught.exception), '必须保留至少一个启用的管理员账号')
                self.assertEqual(self.db.snapshot(), before)
        self.assertEqual(self.db.commits, 0)
        self.assertEqual(self.db.borrows, 5)
        self.assertEqual(self.db.isolations, ['READ COMMITTED'] * 5)
        self.assertEqual(self.db.direct_writes, 0)

    def test_python_normalized_alternate_admin_survives_and_disabled_does_not_count(self):
        # Initially this role belongs only to a disabled account and cannot save
        # the last-admin writes above. An enabled binding makes it sufficient.
        self.seed('INSERT INTO user_roles VALUES(2,3)')
        self.assertTrue(self.users.delete_user('1'))
        self.assertEqual(self.db.commits, 1)
        with self.assertRaises(LastAdministratorError):
            self.users.delete_user('2')

    def test_code_change_and_role_deletion_are_allowed_with_another_enabled_admin(self):
        self.seed('INSERT INTO user_roles VALUES(2,3)')
        self.assertEqual(self.roles.update_role(1, code='editor'), 1)
        self.assertTrue(self.roles.delete_role(1))
        self.assertNotIn((1, 1), self.db.rows('user_roles'))
        self.assertNotIn((1, 1), self.db.rows('role_resources'))

    def test_normal_role_delete_removes_both_associations(self):
        self.assertTrue(self.roles.delete_role(2))
        self.assertNotIn((2, 2), self.db.rows('user_roles'))
        self.assertNotIn((2, 1), self.db.rows('role_resources'))
        self.assertEqual(self.db.borrows, 1)
        self.assertEqual(self.db.commits, 1)

    def test_role_replacement_deduplicates_and_commits_on_one_connection(self):
        self.assertTrue(self.users.set_role_by_id('2', [2, 3, 2, 3]))
        self.assertEqual(self.db.rows('user_roles'), [(1, 1), (2, 2), (2, 3), (3, 3)])
        self.assertEqual(self.db.borrows, 1)
        self.assertEqual(self.db.commits, 1)
        directory_reads = [sql for sql in self.db.statements if 'FORCE INDEX' in sql]
        self.assertEqual(len(directory_reads), 2)

    def test_missing_role_or_user_never_changes_bindings(self):
        before = self.db.snapshot()
        for user, roles in [('2', [2, 999]), ('999', [2])]:
            with self.assertRaises(ValueError):
                self.users.set_role_by_id(user, roles)
            self.assertEqual(self.db.snapshot(), before)

    def test_empty_roles_can_clear_normal_user_but_not_last_admin(self):
        self.assertTrue(self.users.set_role_by_id('2', []))
        with self.assertRaises(LastAdministratorError):
            self.users.set_role_by_id('1', [])
        self.assertEqual(self.db.rows('user_roles'), [(1, 1), (3, 3)])

    def test_role_replacement_insert_failure_rolls_back_entire_old_binding_set(self):
        before = self.db.snapshot()
        inserts = 0
        def fail_second_insert(sql):
            nonlocal inserts
            if sql.startswith('INSERT INTO user_roles'):
                inserts += 1
            return inserts == 2
        self.db.fail_on = fail_second_insert
        with self.assertRaises(sqlite3.OperationalError):
            self.users.set_role_by_id('2', [1, 2])
        self.assertEqual(self.db.snapshot(), before)
        self.assertEqual(self.db.commits, 0)
        self.assertEqual(inserts, 2)

    def test_final_directory_or_existence_read_failure_rolls_back_the_write(self):
        before = self.db.snapshot()
        for stage in ('directory', 'existence'):
            directory_reads = 0
            def fail_read(sql):
                nonlocal directory_reads
                if 'FORCE INDEX' in sql:
                    directory_reads += 1
                    return stage == 'directory' and directory_reads == 2
                return stage == 'existence' and sql.startswith('SELECT 1 AS has_admin')
            self.db.fail_on = fail_read
            with self.assertRaises(sqlite3.OperationalError):
                self.users.set_role_by_id('2', [1])
            self.assertEqual(self.db.snapshot(), before)
        self.assertEqual(self.db.commits, 0)

    def test_boolean_or_missing_role_identifiers_are_rejected_before_borrowing(self):
        for roles in ([True], [0], [-1], ['1'], None):
            with self.subTest(roles=roles), self.assertRaises(ValueError):
                self.users.set_role_by_id('2', roles)
        self.assertEqual(self.db.borrows, 0)

    def test_role_delete_late_failure_restores_both_associations(self):
        before = self.db.snapshot()
        self.db.fail_on = lambda sql: sql.startswith('DELETE FROM roles')
        with self.assertRaises(sqlite3.OperationalError):
            self.roles.delete_role(2)
        self.assertEqual(self.db.snapshot(), before)

    def test_commit_failure_propagates_and_does_not_repeat_the_write(self):
        self.db.fail_commit = True
        before = self.db.snapshot()
        with self.assertRaises(sqlite3.OperationalError):
            self.users.set_role_by_id('2', [1])
        self.assertEqual(self.db.snapshot(), before)
        self.assertEqual(self.db.borrows, 1)
        self.assertEqual(sum(sql.startswith('INSERT INTO user_roles') for sql in self.db.statements), 1)

    def test_zero_admin_can_be_repaired_but_sensitive_writes_cannot_leave_it_zero(self):
        self.seed('UPDATE users SET status=0 WHERE id=1')
        with self.assertRaises(LastAdministratorError):
            self.roles.update_role(2, code='editor')
        self.assertEqual(self.users.update_user('1', status=1), 1)
        self.seed('UPDATE users SET status=0 WHERE id=1')
        self.assertTrue(self.users.set_role_by_id('2', [1]))

    def test_profile_password_and_role_description_updates_keep_the_original_path(self):
        self.seed('UPDATE users SET status=0')
        self.assertEqual(self.users.update_user('1', name='updated', password='synthetic'), 1)
        self.assertEqual(self.roles.update_role(1, name='updated', description='synthetic'), 1)
        self.assertEqual(self.db.direct_writes, 2)
        self.assertEqual(self.db.borrows, 0)

    def test_http_conflicts_are_fixed_and_nonadmins_remain_denied(self):
        from src.routers.auth.auth import get_auth_manager, get_current_user
        from src.routers.role.role import get_role_manager, get_role_management_service, router as role_router
        from src.routers.user.user import get_user_manager, get_user_management_service, router as user_router
        from management_service_stub import persistence_service
        app = FastAPI()
        app.include_router(role_router)
        app.include_router(user_router)
        app.dependency_overrides[get_current_user] = lambda: {'id': 1, 'roles': [{'code': 'admin'}]}
        app.dependency_overrides[get_auth_manager] = lambda: SimpleNamespace(
            get_recent_session_context=lambda token, **kwargs: (1, 'synthetic-family')
        )
        app.dependency_overrides[get_role_manager] = lambda: self.roles
        app.dependency_overrides[get_user_manager] = lambda: self.users
        stub = persistence_service(users=self.users, roles=self.roles)
        app.dependency_overrides[get_role_management_service] = lambda: stub
        app.dependency_overrides[get_user_management_service] = lambda: stub
        client = TestClient(app, raise_server_exceptions=False)
        client.cookies.set('access_token', 'synthetic-access-cookie')
        for method, url, data in [('DELETE', '/user/1', None), ('DELETE', '/role/1', None),
                                  ('PUT', '/role/1', {'code': 'editor'})]:
            response = client.request(method, url, json=data)
            self.assertEqual(response.status_code, 409)
            self.assertEqual(response.json(), {'code': 'AUTH_LAST_ADMINISTRATOR', 'data': None,
                                               'msg': '必须保留至少一个启用的管理员账号'})
        app.dependency_overrides[get_current_user] = lambda: {'id': 2, 'roles': [{'code': 'normal'}]}
        self.assertEqual(client.delete('/user/1').status_code, 403)


if __name__ == '__main__':
    unittest.main()
