"""Same-database audit acceptance; owned MySQL/Redis and real management HTTP."""

from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from datetime import datetime, timezone
from hashlib import sha256
import re
import threading
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
from jose import jwt

import test_admin_recent_stack as previous
from test_agent_mysql import SocketManager
from src.controller.user_manage import UserManager
from src.database.mysql.schema_migration import apply_plan, build_plan, validate_schema


class AdminAuditStackTests(previous.AdminRecentStackTests):
    def events(self):
        return self.pool.fetch_all('SELECT * FROM admin_change_audit ORDER BY id')

    def assert_unavailable(self, response):
        self.assertEqual((response.status_code, response.json()['code']), (503, 'ADMIN_AUDIT_UNAVAILABLE'), response.text)
        self.assertNotIn('synthetic-audit-storage-failure', response.text)

    def test_all_nine_changes_have_exact_server_actor_action_and_target(self):
        pair = self.install()
        sid = jwt.decode(pair.access_token, self.auth.secret_key, algorithms=['HS256'])['sid']
        expected = [('user.create', 3, 2), ('user.disable', 2, 1), ('role.create', 5, 1),
                    ('role.update', 3, 1), ('role.delete', 3, 1), ('role.bind_resources', 4, 1),
                    ('resource.create', 3, 1), ('resource.update', 1, 1), ('resource.delete', 2, 1)]
        for (method, path, body), (action, target, affected) in zip(self.mutations(), expected, strict=True):
            with self.subTest(action=action):
                count = len(self.events())
                response = self.http.request(method, path, json=body)
                self.assertIn(response.status_code, (200, 201), response.text)
                events = self.events()
                self.assertEqual(len(events), count + 1)
                event = events[-1]
                self.assertEqual((event['actor_user_id'], event['action'], event['target_type'], event['target_id'], event['affected_rows']),
                                 (1, action, action.split('.')[0], target, affected))
                self.assertEqual(event['session_ref'], sha256(f'1:{sid}'.encode()).hexdigest())
                self.assertRegex(event['request_ref'], r'^[0-9a-f]{64}$')
                self.assertGreater(event['id'], 0)
                self.assertLess(abs((datetime.now(timezone.utc).replace(tzinfo=None) - event['recorded_at']).total_seconds()), 10)

    def test_missing_audit_table_rejects_all_nine_without_business_writes(self):
        self.install()
        before = self.state()
        self.pool.execute('RENAME TABLE admin_change_audit TO saved_admin_audit')
        try:
            for method, path, body in self.mutations():
                with self.subTest(method=method, path=path):
                    self.assert_unavailable(self.http.request(method, path, json=body))
                    self.assertEqual(self.state(), before)
        finally:
            self.pool.execute('RENAME TABLE saved_admin_audit TO admin_change_audit')
        self.assertEqual(self.events(), [])
        self.assertEqual(self.http.post('/role/', json={'name': 'restored', 'code': 'restored'}).status_code, 201)
        self.assertEqual(len(self.events()), 1)

    def test_real_audit_insert_failure_rolls_back_all_nine_complete_changes(self):
        self.install()
        before = self.state()
        self.pool.execute("CREATE TRIGGER audit_storage_failure BEFORE INSERT ON admin_change_audit "
                          "FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='synthetic-audit-storage-failure'")
        try:
            for method, path, body in self.mutations():
                with self.subTest(method=method, path=path):
                    self.assert_unavailable(self.http.request(method, path, json=body))
                    self.assertEqual(self.state(), before)
                    self.assertEqual(self.events(), [])
        finally:
            self.pool.execute('DROP TRIGGER audit_storage_failure')

    def test_actual_nontransactional_engine_is_rejected_before_writing(self):
        self.install()
        before = self.state()
        self.pool.execute('ALTER TABLE admin_change_audit ENGINE=MyISAM')
        try:
            self.assertEqual(self.pool.fetch_one("SELECT ENGINE AS engine FROM information_schema.TABLES "
                "WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='admin_change_audit'")['engine'], 'MyISAM')
            self.assert_unavailable(self.http.post('/role/', json={'name': 'bad-engine', 'code': 'bad-engine'}))
            self.assertEqual(self.state(), before)
            self.assertEqual(self.events(), [])
        finally:
            self.pool.execute('ALTER TABLE admin_change_audit ENGINE=InnoDB')

    def test_denied_authentication_and_last_administrator_leave_no_audit(self):
        before = self.state()
        self.install(age=700)
        self.assertEqual(self.http.post('/role/', json={'name': 'stale', 'code': 'stale'}).status_code, 403)
        self.http.cookies.clear()
        self.assertEqual(self.http.post('/role/', json={'name': 'anonymous', 'code': 'anonymous'}).status_code, 401)
        self.install(user='2')
        self.assertEqual(self.http.post('/role/', json={'name': 'normal', 'code': 'normal'}).status_code, 403)
        self.install()
        for method, path, body in [('DELETE', '/user/1', None), ('PUT', '/role/1', {'code': 'ordinary'}), ('DELETE', '/role/1', None)]:
            response = self.http.request(method, path, json=body)
            self.assertEqual((response.status_code, response.json()['code']), (409, 'AUTH_LAST_ADMINISTRATOR'))
        self.assertEqual(self.state(), before)
        self.assertEqual(self.events(), [])

    def test_noop_primary_writes_and_reading_do_not_invent_changes(self):
        self.install()
        before = self.state()
        for method, path, body in [('PUT', '/role/3', {'code': 'editor'}),
                                    ('PUT', '/resource/1', {'name': 'keep'}), ('DELETE', '/user/999', None),
                                    ('DELETE', '/role/999', None), ('DELETE', '/resource/999', None)]:
            self.http.request(method, path, json=body)
        for path in ('/user/', '/user/1', '/role/', '/role/1', '/resource/', '/resource/1'):
            self.assertEqual(self.http.get(path).status_code, 200)
        self.assertEqual(self.state(), before)
        self.assertEqual(self.events(), [])

    def test_completed_empty_binding_is_recorded_once(self):
        self.install()
        response = self.http.post('/role/4/bind_resources', json={'resource_ids': []})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(self.events()), 1)
        self.assertEqual((self.events()[0]['action'], self.events()[0]['affected_rows']), ('role.bind_resources', 0))

    def test_cleaning_orphan_associations_is_audited_even_without_primary_row(self):
        self.install()
        self.pool.execute('INSERT INTO user_roles(user_id,role_id) VALUES(2,99)')
        self.pool.execute('INSERT INTO role_resources(role_id,resource_id) VALUES(99,1),(4,99)')
        self.http.delete('/role/99')
        self.http.delete('/resource/99')
        events = self.events()
        self.assertEqual([(row['action'], row['target_id'], row['affected_rows']) for row in events],
                         [('role.delete', 99, 2), ('resource.delete', 99, 1)])
        self.assertEqual(self.pool.fetch_all('SELECT * FROM user_roles WHERE role_id=99'), [])
        self.assertEqual(self.pool.fetch_all('SELECT * FROM role_resources WHERE role_id=99 OR resource_id=99'), [])

    def test_mid_binding_failure_restores_original_associations_and_audit(self):
        self.install()
        self.pool.execute('INSERT INTO role_resources(role_id,resource_id) VALUES(4,2)')
        before = self.state()
        # Inputs are now a deduplicated valid set. Preserve the original real
        # second-INSERT failure after DELETE and one successful INSERT.
        self.pool.execute("CREATE TRIGGER binding_mid_failure BEFORE INSERT ON role_resources FOR EACH ROW "
                          "BEGIN IF NEW.resource_id=2 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='synthetic-binding-mid'; END IF; END")
        try:
            response = self.http.post('/role/4/bind_resources', json={'resource_ids': [1, 2]})
            self.assert_unavailable(response)
            self.assertEqual(self.state(), before)
            self.assertEqual(self.events(), [])
        finally:
            self.pool.execute('DROP TRIGGER binding_mid_failure')

    def test_client_actor_headers_and_business_values_never_enter_audit(self):
        pair = self.install()
        payload = jwt.decode(pair.access_token, self.auth.secret_key, algorithms=['HS256'])
        response = self.http.post('/role/', json={'name': 'private-name-sentinel', 'code': 'private-code-sentinel',
            'description': 'private-description-sentinel', 'audit': {'actor_user_id': 999, 'session_ref': 'forged'}},
            headers={'x-admin-actor': '999', 'x-request-id': 'private-header-sentinel'})
        self.assertEqual(response.status_code, 201)
        event = self.events()[0]
        self.assertEqual(event['actor_user_id'], 1)
        self.assertEqual(event['session_ref'], sha256(f"1:{payload['sid']}".encode()).hexdigest())
        for forbidden in ('private-', payload['sid'], pair.access_token, pair.refresh_token, self.auth.secret_key, 'forged'):
            self.assertNotIn(forbidden, str(event))

    def test_invalid_user_target_is_422_and_ascii_leading_zero_stays_compatible(self):
        self.install()
        before = self.state()
        for target in ('2oops', '0', '-2', '%202', '%EF%BC%92'):
            response = self.http.delete('/user/' + target)
            self.assertEqual((response.status_code, response.json()['code']), (422, 'ADMIN_AUDIT_TARGET_INVALID'))
            self.assertEqual(self.state(), before)
            self.assertEqual(self.events(), [])
        self.assertEqual(self.http.delete('/user/02').status_code, 200)
        self.assertEqual((self.events()[0]['target_id'], self.events()[0]['affected_rows']), (2, 1))

    @contextmanager
    def intercepted_commit(self, *, committed):
        original_uow = self.pool.unit_of_work

        @contextmanager
        def transaction(**kwargs):
            with original_uow(**kwargs) as uow:
                original_commit = uow.commit

                def commit():
                    if committed:
                        original_commit()
                    raise ConnectionError('synthetic-commit-acknowledgment-failure')

                uow.commit = commit
                yield uow

        with patch.object(self.pool, 'unit_of_work', transaction):
            yield

    def test_commit_before_failure_rolls_back_both_records(self):
        self.install()
        before = self.state()
        with self.intercepted_commit(committed=False):
            self.assert_unavailable(self.http.post('/role/', json={'name': 'not-committed', 'code': 'not-committed'}))
        self.assertEqual(self.state(), before)
        self.assertEqual(self.events(), [])

    def test_actual_commit_then_lost_ack_keeps_both_and_returns_unknown_failure(self):
        self.install()
        with self.intercepted_commit(committed=True):
            self.assert_unavailable(self.http.post('/role/', json={'name': 'committed-unknown', 'code': 'committed-unknown'}))
        role = self.pool.fetch_one("SELECT id FROM roles WHERE code='committed-unknown'")
        self.assertIsNotNone(role)
        self.assertEqual(len(self.events()), 1)
        self.assertEqual((self.events()[0]['action'], self.events()[0]['target_id']), ('role.create', role['id']))

    def test_single_connection_pool_does_not_borrow_a_second_connection_for_audit(self):
        self.pool.close()
        self.pool = SocketManager(self.socket, self.database, pool_size=1)
        self.addCleanup(self.pool.close)
        self.auth.user_manager = UserManager(self.pool)
        self.install()
        self.assertEqual(self.http.post('/role/', json={'name': 'single', 'code': 'single'}).status_code, 201)
        self.assertEqual(len(self.events()), 1)

    def test_concurrent_actors_keep_distinct_context_in_actual_transactions(self):
        self.pool.execute("INSERT INTO users(id,username,name,sex,age,phone,email,password,birth_day,status) "
            "VALUES(3,'other-admin','other-admin',0,20,'','other@example.invalid','synthetic','2000-01-01',1)")
        self.pool.execute('INSERT INTO user_roles(user_id,role_id) VALUES(3,1)')
        first = self.install()
        first_cookies = dict(self.http.cookies)
        second = self.install(user='3')
        other = TestClient(self.http.app, base_url='https://' + previous.HOST, raise_server_exceptions=False)
        self.addCleanup(other.close)
        other.cookies.update(dict(self.http.cookies))
        self.http.cookies.clear()
        self.http.cookies.update(first_cookies)
        import src.controller.role_manager as roles
        original = roles.record_admin_change
        rendezvous = threading.Barrier(2, timeout=5)
        entered = []
        lock = threading.Lock()

        def pause(uow, audit, **kwargs):
            with lock:
                entered.append(audit.actor_user_id)
            return original(uow, audit, **kwargs)

        def submit_actor(client, code):
            # Authorization locks deliberately serialize actual DML; rendezvous
            # before entering HTTP verifies simultaneous independent callers.
            rendezvous.wait()
            return client.post('/role/', json={'name': code, 'code': code})

        with patch.object(roles, 'record_admin_change', pause), ThreadPoolExecutor(max_workers=2) as executor:
            one = executor.submit(submit_actor, self.http, 'actor-one')
            two = executor.submit(submit_actor, other, 'actor-three')
            self.assertEqual(one.result(timeout=10).status_code, 201)
            self.assertEqual(two.result(timeout=10).status_code, 201)
        self.assertCountEqual(entered, [1, 3])
        expected = {}
        for actor, pair, code in [(1, first, 'actor-one'), (3, second, 'actor-three')]:
            sid = jwt.decode(pair.access_token, self.auth.secret_key, algorithms=['HS256'])['sid']
            expected[actor] = (self.pool.fetch_one('SELECT id FROM roles WHERE code=%s', (code,))['id'],
                               sha256(f'{actor}:{sid}'.encode()).hexdigest())
        self.assertEqual(len(self.events()), 2)
        for event in self.events():
            self.assertEqual((event['target_id'], event['session_ref']), expected[event['actor_user_id']])
        self.assertEqual(len({row['request_ref'] for row in self.events()}), 2)

    def test_old_schema_migration_only_adds_the_missing_audit_table(self):
        before = self.state()
        self.pool.execute('DROP TABLE admin_change_audit')
        with self.pool._create_connection() as connection:
            actions, errors = build_plan(connection, self.database)
            self.assertEqual(errors, [])
            self.assertEqual(len(actions), 1)
            self.assertIn('CREATE TABLE IF NOT EXISTS `admin_change_audit`', actions[0])
            apply_plan(connection, actions)
            self.assertEqual(validate_schema(connection, self.database), [])
            self.assertEqual(build_plan(connection, self.database), ([], []))
        self.assertEqual(self.state(), before)
        self.assertEqual(self.events(), [])


def load_tests(loader, _tests, _pattern):
    """Reuse the previous owned fixture without duplicating inherited tests."""
    return unittest.TestSuite(AdminAuditStackTests(name) for name in sorted(AdminAuditStackTests.__dict__)
                              if name.startswith('test_'))


if __name__ == '__main__':
    unittest.main()
