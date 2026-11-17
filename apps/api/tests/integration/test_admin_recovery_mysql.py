"""Administrator write invariants on an owned, disposable MySQL server only."""

import json
import os
import sys
import threading
import time
import unittest
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from pathlib import Path
from uuid import uuid4

import pymysql

ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT / 'apps/api'))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from test_agent_mysql import SocketManager
from src.controller.role_manager import RoleManager
from src.controller.user_manage import UserManager
from src.database.mysql.schema_migration import MYSQL_SCHEMA, build_create_table_sql


class InterceptedDatabase:
    """Retain real SQL/transactions; intercept one statement for fault or timing."""

    def __init__(self, database, intercept):
        self.database = database
        self.intercept = intercept

    @contextmanager
    def unit_of_work(self, **kwargs):
        with self.database.unit_of_work(**kwargs) as transaction:
            original = transaction.execute

            def execute(sql, params=None):
                self.intercept(transaction, sql, params)
                return original(sql, params)

            transaction.execute = execute
            yield transaction


@unittest.skipUnless(os.getenv('SUN_WORLD_AGENT_MYSQL_ROOT'), 'Use the owned MySQL launcher')
class AdminRecoveryMySQLTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        directory = Path(os.environ['SUN_WORLD_AGENT_MYSQL_ROOT']).resolve()
        marker = json.loads((directory / 'owner.json').read_text())
        if (marker['nonce'] != os.getenv('SUN_WORLD_AGENT_MYSQL_NONCE')
                or not directory.name.startswith('sunworld-agent-mysql-')):
            raise RuntimeError('Missing owned MySQL launcher proof')
        cls.socket = str(directory / 'mysql.sock')
        with pymysql.connect(unix_socket=cls.socket, user='root', password='', connect_timeout=2) as connection:
            with connection.cursor() as cursor:
                cursor.execute('SELECT @@datadir,@@socket,@@skip_networking')
                data, socket, networking = cursor.fetchone()
                if (Path(data).resolve() != directory / 'data'
                        or Path(socket).resolve() != Path(cls.socket) or networking != 1):
                    raise RuntimeError('Refusing a shared or TCP-enabled server')

    def setUp(self):
        from src.core.auth.admin_recovery import LastAdministratorError
        self.denied = LastAdministratorError
        self.database = 'admin_recovery_' + uuid4().hex
        self.connection = pymysql.connect(unix_socket=self.socket, user='root', password='', autocommit=True)
        self.addCleanup(self.connection.close)
        with self.connection.cursor() as cursor:
            cursor.execute(f'CREATE DATABASE `{self.database}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci')
        self.addCleanup(self.drop_database)
        with self.connection.cursor() as cursor:
            cursor.execute(f'USE `{self.database}`')
            for name in ('users', 'roles', 'user_roles', 'resources', 'role_resources'):
                cursor.execute(build_create_table_sql(name, MYSQL_SCHEMA[name]))
        self.pool = SocketManager(self.socket, self.database)
        self.addCleanup(self.pool.close)
        self.pool.execute("INSERT INTO users(id,name,email,password,status) VALUES"
                          "(1,'synthetic-one','one@example.invalid','not-real',1),"
                          "(2,'synthetic-two','two@example.invalid','not-real',1)")
        self.pool.execute("INSERT INTO roles(id,name,code) VALUES(1,'administrator','admin'),(2,'normal','normal')")
        self.pool.execute('INSERT INTO user_roles(user_id,role_id) VALUES(1,1),(2,2)')
        self.users = UserManager(self.pool)
        self.roles = RoleManager(self.pool)

    def drop_database(self):
        if not self.database.startswith('admin_recovery_') or len(self.database) != 47:
            raise RuntimeError('Unexpected disposable database name')
        with self.connection.cursor() as cursor:
            cursor.execute(f'DROP DATABASE `{self.database}`')

    def state(self):
        return {name: self.pool.fetch_all(f'SELECT * FROM {name} ORDER BY 1,2')
                for name in ('users', 'roles', 'user_roles', 'role_resources')}

    def second_administrator(self):
        self.pool.execute('INSERT INTO user_roles(user_id,role_id) VALUES(2,1)')

    def test_last_administrator_disable_rolls_back(self):
        before = self.state()
        for operation in (lambda: self.users.delete_user('1'),
                          lambda: self.users.update_user('1', name='changed', status=0)):
            with self.assertRaises(self.denied):
                operation()
            self.assertEqual(self.state(), before)

    def test_last_administrator_role_rename_rolls_back(self):
        before = self.state()
        with self.assertRaises(self.denied):
            self.roles.update_role(1, name='changed', code='former-admin')
        self.assertEqual(self.state(), before)

    def test_last_administrator_role_delete_rolls_back_all_bindings(self):
        self.pool.execute("INSERT INTO resources(id,name,code,type) VALUES(1,'synthetic','test','page')")
        self.pool.execute('INSERT INTO role_resources(role_id,resource_id) VALUES(1,1)')
        before = self.state()
        with self.assertRaises(self.denied):
            self.roles.delete_role(1)
        self.assertEqual(self.state(), before)

    def test_last_administrator_role_replacement_rolls_back(self):
        before = self.state()
        for roles in ([], [2]):
            with self.assertRaises(self.denied):
                self.users.set_role_by_id('1', roles)
            self.assertEqual(self.state(), before)

    def test_second_enabled_administrator_allows_only_first_disable(self):
        self.second_administrator()
        self.assertTrue(self.users.delete_user('1'))
        with self.assertRaises(self.denied):
            self.users.delete_user('2')
        self.assertEqual(self.pool.fetch_one('SELECT status FROM users WHERE id=2')['status'], 1)

    def test_disabled_administrators_do_not_preserve_recovery(self):
        self.second_administrator()
        self.pool.execute('UPDATE users SET status=0 WHERE id=2')
        with self.assertRaises(self.denied):
            self.users.delete_user('1')

    def test_python_role_normalization_and_distinct_candidates(self):
        self.pool.execute("INSERT INTO roles(id,name,code) VALUES(3,'alternate',%s)", ('\tAdMiN\u2003',))
        self.pool.execute('INSERT INTO user_roles(user_id,role_id) VALUES(1,3),(2,3)')
        self.assertTrue(self.roles.delete_role(1))
        self.assertTrue(self.users.delete_user('1'))
        with self.assertRaises(self.denied):
            self.roles.update_role(3, code='ordinary')

    def test_successful_role_delete_cleans_both_associations(self):
        self.pool.execute("INSERT INTO roles(id,name,code) VALUES(3,'alternate',%s)", ('\tadmin',))
        self.pool.execute('INSERT INTO user_roles(user_id,role_id) VALUES(2,3)')
        self.pool.execute('INSERT INTO role_resources(role_id,resource_id) VALUES(1,99)')
        self.assertTrue(self.roles.delete_role(1))
        self.assertEqual(self.pool.fetch_all('SELECT * FROM user_roles WHERE role_id=1'), [])
        self.assertEqual(self.pool.fetch_all('SELECT * FROM role_resources WHERE role_id=1'), [])

    def test_role_replacement_deduplicates_and_validates_before_delete(self):
        self.assertTrue(self.users.set_role_by_id('1', [1, 1, 2]))
        self.assertEqual(self.pool.fetch_all('SELECT role_id FROM user_roles WHERE user_id=1 ORDER BY role_id'),
                         [{'role_id': 1}, {'role_id': 2}])
        before = self.state()
        with self.assertRaises(ValueError):
            self.users.set_role_by_id('1', [999])
        self.assertEqual(self.state(), before)

    def test_database_failure_restores_original_user_roles(self):
        self.second_administrator()
        before = self.state()

        def fail(transaction, sql, params):
            if sql.strip().upper().startswith('INSERT INTO USER_ROLES'):
                transaction.fetch_one('SELECT * FROM deliberately_missing_admin_recovery_table')

        with self.assertRaises(pymysql.Error):
            UserManager(InterceptedDatabase(self.pool, fail)).set_role_by_id('1', [2])
        self.assertEqual(self.state(), before)

    def test_empty_administrator_set_can_be_repaired(self):
        self.pool.execute('DELETE FROM user_roles WHERE role_id=1')
        self.assertTrue(self.users.set_role_by_id('2', [1, 2]))
        with self.assertRaises(self.denied):
            self.users.delete_user('2')

    def test_empty_role_directory_fails_closed_then_allows_repair(self):
        self.pool.execute('DELETE FROM user_roles')
        self.pool.execute('DELETE FROM roles')
        before = self.state()
        with self.assertRaises(self.denied):
            self.users.delete_user('1')
        self.assertEqual(self.state(), before)
        role_id = self.roles.create_role({'name': 'repaired', 'code': 'admin'})
        self.assertTrue(self.users.set_role_by_id('1', [role_id]))

    def test_existing_role_code_can_repair_zero_administrators(self):
        self.pool.execute("UPDATE roles SET code='former-admin' WHERE id=1")
        self.assertEqual(self.roles.update_role(1, code='\tAdMiN\u2003'), 1)
        with self.assertRaises(self.denied):
            self.users.delete_user('1')

    def test_concurrent_unbound_role_creation_does_not_allow_last_disable(self):
        entered, release = threading.Event(), threading.Event()

        def pause(_transaction, sql, _params):
            if sql.strip().upper().startswith('UPDATE USERS'):
                entered.set()
                if not release.wait(5):
                    raise TimeoutError('Fixture did not release the writer')

        with ThreadPoolExecutor(max_workers=1) as executor:
            first = executor.submit(UserManager(InterceptedDatabase(self.pool, pause)).delete_user, '1')
            try:
                self.assertTrue(entered.wait(3))
                role_id = self.roles.create_role({'name': 'concurrent-candidate', 'code': '\tADMIN'})
                self.assertGreater(role_id, 2)
                self.assertFalse(first.done())
            finally:
                release.set()
            with self.assertRaises(self.denied):
                first.result(timeout=5)
        self.assertEqual(self.pool.fetch_one('SELECT status FROM users WHERE id=1')['status'], 1)
        self.assertIsNotNone(self.roles.get_role_by_id(role_id))

    def test_pool_one_and_non_authority_edits(self):
        pool = SocketManager(self.socket, self.database, pool_size=1)
        try:
            users, roles = UserManager(pool), RoleManager(pool)
            self.assertEqual(users.update_user('1', name='edited'), 1)
            self.assertEqual(roles.update_role(1, description='edited'), 1)
            self.assertTrue(users.set_role_by_id('1', [1, 2]))
            with self.assertRaises(self.denied):
                users.delete_user('1')
            self.assertEqual(pool.fetch_one('SELECT status FROM users WHERE id=1')['status'], 1)
        finally:
            pool.close()

    def test_concurrent_mixed_withdrawals_wait_then_recheck(self):
        self.second_administrator()
        entered, release = threading.Event(), threading.Event()

        def pause(_transaction, sql, _params):
            if sql.strip().upper().startswith('UPDATE USERS'):
                entered.set()
                if not release.wait(5):
                    raise TimeoutError('Fixture did not release the first writer')

        def second():
            try:
                self.users.set_role_by_id('2', [2])
                return 'unexpected_success'
            except self.denied:
                return 'protected'

        with ThreadPoolExecutor(max_workers=2) as executor:
            first = executor.submit(UserManager(InterceptedDatabase(self.pool, pause)).delete_user, '1')
            try:
                self.assertTrue(entered.wait(3), 'First writer did not reach its locked transaction')
                later = executor.submit(second)
                deadline = time.monotonic() + 2
                waiting = 0
                while time.monotonic() < deadline:
                    with self.connection.cursor() as cursor:
                        cursor.execute("SELECT COUNT(*) FROM information_schema.innodb_trx WHERE trx_state='LOCK WAIT'")
                        waiting = cursor.fetchone()[0]
                    if waiting:
                        break
                    # Allow transaction metadata to refresh between observations.
                    time.sleep(.15)
                self.assertGreater(waiting, 0, 'Second transaction never waited on an InnoDB lock; '
                                   f'finished={later.done()}, result={later.result() if later.done() else "pending"}')
                self.assertFalse(later.done())
            finally:
                release.set()
            self.assertTrue(first.result(timeout=5))
            self.assertEqual(later.result(timeout=5), 'protected')
        self.assertEqual(self.pool.fetch_one('SELECT status FROM users WHERE id=1')['status'], 0)
        self.assertEqual(self.pool.fetch_one('SELECT COUNT(*) AS n FROM user_roles WHERE user_id=2 AND role_id=1')['n'], 1)


if __name__ == '__main__':
    unittest.main()
