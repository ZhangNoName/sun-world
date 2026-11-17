"""Binding references and replacement on owned SQL/Redis and real HTTP."""

from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
import threading
import time
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
import pymysql

import test_admin_recent_stack as previous
from test_agent_mysql import SocketManager
from src.controller.role_manager import RoleManager
from src.controller.user_manage import UserManager
from src.core.auth import AuthorizationDenied
from src.modules.management.public import AdminManagementService


class AdminBindingStackTests(previous.AdminRecentStackTests):
    def setUp(self):
        super().setUp()
        self.pool.execute('INSERT INTO role_resources(role_id,resource_id) VALUES(4,2)')

    def links(self):
        return self.pool.fetch_all('SELECT role_id,resource_id FROM role_resources ORDER BY role_id,resource_id')

    def events(self):
        return self.pool.fetch_all('SELECT * FROM admin_change_audit ORDER BY id')

    def bind(self, ids, role=4):
        return self.http.post(f'/role/{role}/bind_resources', json={'resource_ids': ids})

    def assert_missing(self, response):
        self.assertEqual((response.status_code, response.json()['code']), (404, 'MANAGEMENT_REFERENCE_NOT_FOUND'), response.text)
        self.assertNotIn('999', response.text)

    def assert_no_write(self, before):
        self.assertEqual(self.state(), before)
        self.assertEqual(self.events(), [])

    def test_missing_role_and_any_missing_resource_reject_whole_replacement(self):
        self.install()
        before = self.state()
        for role, ids in [(999, [1]), (999, []), (4, [999]), (4, [1, 999]), (4, [999, 1])]:
            with self.subTest(role=role, ids=ids):
                self.assert_missing(self.bind(ids, role))
                self.assert_no_write(before)

    def test_invalid_id_types_and_ranges_are_422_without_any_writes(self):
        self.install()
        before = self.state()
        for bad in (0, -1, True, False, 1.0, '1', None, 2_147_483_648, 9_223_372_036_854_775_808, [], {}):
            with self.subTest(kind=type(bad).__name__, value=bad):
                self.assertEqual(self.bind([bad]).status_code, 422)
                self.assert_no_write(before)

    def test_exact_signed_int_resource_upper_bound_is_accepted(self):
        self.install()
        types = self.pool.fetch_all("SELECT COLUMN_TYPE AS column_type FROM information_schema.COLUMNS "
            "WHERE TABLE_SCHEMA=DATABASE() AND ((TABLE_NAME='resources' AND COLUMN_NAME='id') "
            "OR (TABLE_NAME='role_resources' AND COLUMN_NAME='resource_id'))")
        self.assertEqual([row['column_type'] for row in types], ['int', 'int'])
        self.pool.execute("INSERT INTO resources(id,name,code,type,path) VALUES(2147483647,'upper','upper','page','/upper')")
        response = self.bind([2_147_483_647])
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(self.links(), [{'role_id': 4, 'resource_id': 2_147_483_647}])
        self.assertEqual(len(self.events()), 1)

    def test_duplicate_ids_are_one_set_and_preserve_first_seen_order_for_execution(self):
        self.install()
        seen = []
        original = RoleManager.bind_resources
        def observe(manager, role, ids, **kwargs):
            seen.append(tuple(ids))
            return original(manager, role, ids, **kwargs)
        with patch.object(RoleManager, 'bind_resources', observe):
            response = self.bind([2, 1, 2, 1])
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(seen, [(2, 1)])
        self.assertEqual(self.links(), [{'role_id': 4, 'resource_id': 1}, {'role_id': 4, 'resource_id': 2}])
        self.assertEqual([(row['action'], row['target_id'], row['affected_rows']) for row in self.events()], [('role.bind_resources', 4, 3)])

    def test_empty_existing_role_clears_and_empty_missing_role_still_rejects(self):
        self.install()
        self.assertEqual(self.bind([]).status_code, 200)
        self.assertEqual(self.links(), [])
        self.assertEqual(self.bind([]).status_code, 200)
        self.assertEqual([row['affected_rows'] for row in self.events()], [1, 0])
        before = self.state()
        self.assert_missing(self.bind([], 999))
        self.assertEqual(self.state(), before)
        self.assertEqual(len(self.events()), 2)

    def test_original_500_entry_bound_is_checked_before_deduplication(self):
        self.install()
        self.assertEqual(self.bind([1] * 500).status_code, 200)
        self.assertEqual(self.links(), [{'role_id': 4, 'resource_id': 1}])
        before = self.state()
        self.assertEqual(self.bind([1] * 501).status_code, 422)
        self.assertEqual(self.state(), before)
        self.assertEqual(len(self.events()), 1)

    def test_unauthorized_missing_references_do_not_reveal_existence(self):
        before = self.state()
        for options, expected in [(None, 401), ({'user': '2'}, 403), ({'age': 700}, 403)]:
            self.http.cookies.clear()
            if options is not None:
                self.install(**options)
            for role, ids in [(4, [999]), (999, []), (999, [999])]:
                self.assertEqual(self.bind(ids, role).status_code, expected)
                self.assert_no_write(before)

    def test_direct_service_enforces_same_reference_and_strict_input_rules(self):
        token = self.install().access_token
        before = self.state()
        service = AdminManagementService(self.auth)
        for target, ids, expected in [(999, [], 404), (4, [1, 999], 404), (4, [True], 422), (4, ['1'], 422)]:
            with self.subTest(target=target, ids=ids):
                with self.assertRaises(AuthorizationDenied) as caught:
                    service.execute(token, 'role.bind_resources', {'resource_ids': ids}, target_id=target)
                self.assertEqual(caught.exception.status_code, expected)
                self.assert_no_write(before)

    @contextmanager
    def observed_transactions(self, observer):
        original = self.pool.unit_of_work
        @contextmanager
        def transaction(**kwargs):
            with original(**kwargs) as uow:
                execute = uow.execute
                fetch_all = uow.fetch_all
                def run(sql, params=None):
                    observer('before_execute', uow, sql, params)
                    result = execute(sql, params)
                    observer('after_execute', uow, sql, params)
                    return result
                def fetch(sql, params=None):
                    observer('before_fetch', uow, sql, params)
                    return fetch_all(sql, params)
                uow.execute = run
                uow.fetch_all = fetch
                yield uow
        with patch.object(self.pool, 'unit_of_work', transaction):
            yield

    def test_caller_list_mutation_cannot_change_the_validated_reference_set(self):
        token = self.install().access_token
        original_input = {'resource_ids': [1, 2]}
        original = RoleManager.bind_resources
        def mutate_caller(manager, role, ids, **kwargs):
            original_input['resource_ids'].append(999)
            self.assertIs(type(ids), tuple)
            self.assertEqual(ids, (1, 2))
            return original(manager, role, ids, **kwargs)
        with patch.object(RoleManager, 'bind_resources', mutate_caller):
            AdminManagementService(self.auth).execute(token, 'role.bind_resources', original_input, target_id=4)
        self.assertEqual(len(self.links()), 2)
        self.assertEqual(len(self.events()), 1)

    def test_actual_second_insert_failure_restores_links_after_first_insert_succeeded(self):
        self.install()
        before = self.state()
        inserted = []
        self.pool.execute("CREATE TRIGGER binding_second_failure BEFORE INSERT ON role_resources FOR EACH ROW "
                          "BEGIN IF NEW.resource_id=2 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='synthetic-second-insert'; END IF; END")
        def observe(stage, _uow, sql, params):
            if stage == 'after_execute' and sql.startswith('INSERT INTO role_resources'):
                inserted.append(params[1])
        try:
            with self.observed_transactions(observe):
                response = self.bind([1, 2])
            self.assertEqual(response.status_code, 503, response.text)
            self.assertNotIn('synthetic-second-insert', response.text)
            self.assertEqual(inserted, [1])
            self.assert_no_write(before)
        finally:
            self.pool.execute('DROP TRIGGER binding_second_failure')

    def test_real_audit_failure_rolls_back_valid_replacement(self):
        self.install()
        before = self.state()
        self.pool.execute("CREATE TRIGGER binding_audit_failure BEFORE INSERT ON admin_change_audit "
                          "FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='synthetic-binding-audit'")
        try:
            self.assertEqual(self.bind([1]).status_code, 503)
            self.assert_no_write(before)
        finally:
            self.pool.execute('DROP TRIGGER binding_audit_failure')

    def test_logout_after_validated_replacement_rolls_back_business_and_audit(self):
        import src.controller.role_manager as roles
        token = self.install().access_token
        before = self.state()
        original = roles.record_admin_change
        def logout(*args, **kwargs):
            result = original(*args, **kwargs)
            self.assertTrue(self.auth.logout(token))
            return result
        with patch.object(roles, 'record_admin_change', logout):
            self.assertEqual(self.bind([1]).status_code, 401)
        self.assert_no_write(before)

    def test_recent_window_expiry_after_replacement_rolls_back_both(self):
        import src.controller.role_manager as roles
        token = self.install().access_token
        before = self.state()
        now = [time.time()]
        service = AdminManagementService(self.auth, clock=lambda: now[0])
        original = roles.record_admin_change
        def expire(*args, **kwargs):
            result = original(*args, **kwargs)
            now[0] += 700
            return result
        with patch.object(roles, 'record_admin_change', expire):
            with self.assertRaises(AuthorizationDenied) as caught:
                service.execute(token, 'role.bind_resources', {'resource_ids': [1]}, target_id=4)
        self.assertEqual(caught.exception.status_code, 403)
        self.assert_no_write(before)

    def test_commit_failure_before_submission_rolls_back_validated_replacement(self):
        self.install()
        before = self.state()
        original = self.pool.unit_of_work
        @contextmanager
        def transaction(**kwargs):
            with original(**kwargs) as uow:
                def fail_commit():
                    raise ConnectionError('synthetic-before-binding-commit')
                uow.commit = fail_commit
                yield uow
        with patch.object(self.pool, 'unit_of_work', transaction):
            response = self.bind([1])
        self.assertEqual(response.status_code, 503, response.text)
        self.assertNotIn('synthetic-before-binding-commit', response.text)
        self.assert_no_write(before)

    def test_single_connection_pool_reference_queries_do_not_borrow_again(self):
        self.pool.close()
        self.pool = SocketManager(self.socket, self.database, pool_size=1)
        self.addCleanup(self.pool.close)
        self.auth.user_manager = UserManager(self.pool)
        self.install()
        self.assertEqual(self.bind([2, 1, 2]).status_code, 200)
        self.assertEqual(len(self.links()), 2)
        self.assertEqual(len(self.events()), 1)

    def test_committed_replacement_then_lost_ack_is_not_replayed(self):
        self.install()
        original = self.pool.unit_of_work
        inserts = []
        @contextmanager
        def transaction(**kwargs):
            with original(**kwargs) as uow:
                commit = uow.commit
                execute = uow.execute
                def run(sql, params=None):
                    result = execute(sql, params)
                    if sql.startswith('INSERT INTO role_resources'):
                        inserts.append(params[1])
                    return result
                def lost_ack():
                    commit()
                    raise ConnectionError('synthetic-binding-commit-ack')
                uow.execute = run
                uow.commit = lost_ack
                yield uow
        with patch.object(self.pool, 'unit_of_work', transaction):
            response = self.bind([1])
        self.assertEqual(response.status_code, 503, response.text)
        self.assertNotIn('synthetic-binding-commit-ack', response.text)
        self.assertEqual(inserts, [1])
        self.assertEqual(self.links(), [{'role_id': 4, 'resource_id': 1}])
        self.assertEqual(len(self.events()), 1)

    def wait_for_thread_lock(self, thread_id, future):
        until = time.monotonic() + 3
        while time.monotonic() < until:
            with self.connection.cursor() as cursor:
                cursor.execute('SELECT trx_state FROM information_schema.innodb_trx WHERE trx_mysql_thread_id=%s', (thread_id,))
                row = cursor.fetchone()
            if row and row[0] == 'LOCK WAIT':
                self.assertFalse(future.done())
                return
            if future.done():
                future.result()
                break
            time.sleep(.15)
        self.fail('Expected the specified concurrent transaction in actual InnoDB LOCK WAIT')

    def concurrent_after_reference_validation(self, action):
        self.install()
        entered, release, second_started = threading.Event(), threading.Event(), threading.Event()
        first_id, second_id, reference_reads = [], [], []
        def observe(stage, uow, sql, params):
            if stage == 'before_fetch' and 'FROM resources' in sql and 'FOR UPDATE' in sql:
                reference_reads.append((sql, params))
            if (stage == 'before_execute' and sql.strip().startswith('DELETE FROM role_resources')
                    and 'role_id=' in sql and not entered.is_set()):
                first_id.append(uow.connection.thread_id())
                entered.set()
                if not release.wait(8):
                    raise TimeoutError('Binding test release missing')
            if (stage == 'before_fetch' and sql.startswith('SELECT id, code FROM roles') and entered.is_set()
                    and uow.connection.thread_id() not in first_id):
                second_id.append(uow.connection.thread_id())
                second_started.set()
        other = TestClient(self.http.app, base_url='https://' + previous.HOST, raise_server_exceptions=False)
        self.addCleanup(other.close)
        other.cookies.update(dict(self.http.cookies))
        def second():
            if action == 'direct_resource_update':
                with pymysql.connect(unix_socket=self.socket, user='root', password='', database=self.database,
                                     connect_timeout=2, read_timeout=10, autocommit=False) as connection:
                    second_id.append(connection.thread_id())
                    second_started.set()
                    with connection.cursor() as cursor:
                        cursor.execute("UPDATE resources SET name='after-reference-lock' WHERE id=1")
                    connection.commit()
                return None
            return other.delete('/resource/1' if action == 'resource_delete' else '/role/4')
        with self.observed_transactions(observe), ThreadPoolExecutor(max_workers=2) as executor:
            setter = executor.submit(self.bind, [2, 1])
            try:
                self.assertTrue(entered.wait(5))
                self.assertTrue(reference_reads, 'No locking resource existence read before DELETE')
                self.assertIn('ORDER BY id', reference_reads[0][0])
                self.assertEqual(tuple(reference_reads[0][1]), (1, 2))
                remover = executor.submit(second)
                self.assertTrue(second_started.wait(3))
                self.wait_for_thread_lock(second_id[0], remover)
            finally:
                release.set()
            self.assertEqual(setter.result(timeout=8).status_code, 200)
            result = remover.result(timeout=8)
        if action == 'direct_resource_update':
            self.assertIsNone(result)
            self.assertEqual(self.pool.fetch_one('SELECT name FROM resources WHERE id=1')['name'], 'after-reference-lock')
            self.assertEqual(len(self.links()), 2)
            self.assertEqual(len(self.events()), 1)
        else:
            self.assertEqual(result.status_code, 200, result.text)
            self.assertEqual(len(self.events()), 2)
            self.assertEqual(self.links(), [{'role_id': 4, 'resource_id': 2}] if action == 'resource_delete' else [])
        orphans = self.pool.fetch_all('SELECT rr.role_id FROM role_resources rr LEFT JOIN roles r ON r.id=rr.role_id '
                                     'LEFT JOIN resources s ON s.id=rr.resource_id WHERE r.id IS NULL OR s.id IS NULL')
        self.assertEqual(orphans, [])

    def test_resources_are_locked_before_any_binding_mutation(self):
        self.concurrent_after_reference_validation('direct_resource_update')

    def test_participating_resource_delete_waits_and_cleans_committed_binding(self):
        self.concurrent_after_reference_validation('resource_delete')

    def test_participating_role_delete_waits_and_cleans_committed_binding(self):
        self.concurrent_after_reference_validation('role_delete')

    def test_visible_resource_deletion_before_reference_read_rejects(self):
        self.install()
        before_links = self.links()
        original = RoleManager.bind_resources
        def withdraw(manager, *args, **kwargs):
            self.pool.execute('DELETE FROM resources WHERE id=1')
            return original(manager, *args, **kwargs)
        with patch.object(RoleManager, 'bind_resources', withdraw):
            self.assert_missing(self.bind([1, 2]))
        self.assertEqual(self.links(), before_links)
        self.assertEqual(self.events(), [])


def load_tests(loader, _tests, _pattern):
    return unittest.TestSuite(AdminBindingStackTests(name) for name in sorted(AdminBindingStackTests.__dict__)
                              if name.startswith('test_'))


if __name__ == '__main__':
    unittest.main()
