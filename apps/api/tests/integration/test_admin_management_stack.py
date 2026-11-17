"""Management authority on owned MySQL/Redis, including real lock waits."""

from concurrent.futures import ThreadPoolExecutor
import threading
import time
import unittest
from unittest.mock import patch

import pymysql

import test_admin_recent_stack as previous
from test_agent_mysql import SocketManager
from src.controller.role_manager import RoleManager
from src.controller.user_manage import UserManager
from src.core.auth import AuthorizationDenied, Principal
from src.core.auth.admin_audit import create_admin_audit_context


class AdminManagementStackTests(previous.AdminRecentStackTests):
    def service(self, **kwargs):
        from src.modules.management.public import AdminManagementService
        return AdminManagementService(self.auth, **kwargs)

    def events(self):
        return self.pool.fetch_all('SELECT * FROM admin_change_audit ORDER BY id')

    def direct(self, token, *, service=None, **kwargs):
        return (service or self.service()).execute(token, 'role.create',
            {'name': 'direct-service', 'code': 'direct-service'}, **kwargs)

    def assert_no_change(self, before):
        self.assertEqual(self.state(), before)
        self.assertEqual(self.events(), [])

    def add_other_administrator(self, *, distinct_role=False):
        self.pool.execute("INSERT INTO users(id,username,name,sex,age,phone,email,password,birth_day,status) "
            "VALUES(3,'other-admin','other-admin',0,20,'','other@example.invalid','synthetic','2000-01-01',1)")
        if distinct_role:
            self.pool.execute("INSERT INTO roles(id,name,code) VALUES(5,'other administrator',' ADMIN ')")
        self.pool.execute('INSERT INTO user_roles(user_id,role_id) VALUES(3,%s)', (5 if distinct_role else 1,))

    def test_direct_service_without_http_authenticates_all_nine_actions(self):
        token = self.install().access_token
        actions = ['user.create', 'user.disable', 'role.create', 'role.update', 'role.delete',
                   'role.bind_resources', 'resource.create', 'resource.update', 'resource.delete']
        targets = [None, 2, None, 3, 3, 4, None, 1, 2]
        for action, target, (_, _, body) in zip(actions, targets, self.mutations(), strict=True):
            with self.subTest(action=action):
                self.service().execute(token, action, body, target_id=target)
        self.assertEqual([row['action'] for row in self.events()], actions)
        self.assertEqual({row['actor_user_id'] for row in self.events()}, {1})
        self.assertEqual(self.pool.fetch_one('SELECT status FROM users WHERE id=2')['status'], 0)

    def test_direct_service_missing_normal_stale_revoked_and_forged_proof_deny(self):
        before = self.state()
        for value in (None, '', 'synthetic-invalid-token',
                      Principal(kind='user', user_id=1, session_family='forged', authenticated_at=9999999999, roles=('admin',))):
            with self.subTest(proof=type(value).__name__):
                with self.assertRaises(AuthorizationDenied):
                    self.direct(value)
                self.assert_no_change(before)
        for arguments in ({'user': '2'}, {'user': '2', 'claims': {'roles': ['admin'], 'owner_user_id': 1}},
                          {'age': 700}, {'claims': {'auth_time': 'future'}}):
            with self.subTest(arguments=arguments):
                token = self.install(**arguments).access_token
                with self.assertRaises(AuthorizationDenied):
                    self.direct(token)
                self.assert_no_change(before)
        token = self.install().access_token
        self.assertTrue(self.auth.logout(token))
        with self.assertRaises(AuthorizationDenied):
            self.direct(token)
        self.assert_no_change(before)

    def test_each_of_nine_service_operations_rejects_missing_normal_and_stale_credentials(self):
        actions = ['user.create', 'user.disable', 'role.create', 'role.update', 'role.delete',
                   'role.bind_resources', 'resource.create', 'resource.update', 'resource.delete']
        targets = [None, 2, None, 3, 3, 4, None, 1, 2]
        before = self.state()
        for options in (None, {'user': '2'}, {'age': 700}):
            token = None if options is None else self.install(**options).access_token
            for action, target, (_, _, body) in zip(actions, targets, self.mutations(), strict=True):
                with self.subTest(credential=options, action=action):
                    with self.assertRaises(AuthorizationDenied):
                        self.service().execute(token, action, body, target_id=target)
                    self.assert_no_change(before)

    def test_noncanonical_enabled_status_cannot_enter_service(self):
        token = self.install().access_token
        self.pool.execute('UPDATE users SET status=2 WHERE id=1')
        before = self.state()
        with self.assertRaises(AuthorizationDenied):
            self.direct(token)
        self.assert_no_change(before)

    def test_direct_service_rejects_forged_audit_and_scope_without_target_probe(self):
        from src.modules.management.public import ManagementScope
        token = self.install().access_token
        before = self.state()
        for audit in (create_admin_audit_context(actor_user_id=2, session_family_id='forged'),
                      create_admin_audit_context(actor_user_id=1, session_family_id='wrong-family')):
            with self.subTest(actor=audit.actor_user_id):
                with self.assertRaises(AuthorizationDenied):
                    self.direct(token, audit=audit)
                self.assert_no_change(before)
        for scope in (ManagementScope('another-app', 'role'), ManagementScope('sun-world', 'resource')):
            with self.assertRaises(AuthorizationDenied):
                self.direct(token, scope=scope)
            self.assert_no_change(before)
        with self.assertRaises(AuthorizationDenied):
            self.service().execute(token, 'identity.unknown', {}, target_id=999999)
        self.assert_no_change(before)

    def test_direct_service_does_not_accept_role_owner_or_callback_parameters(self):
        from pydantic import ValidationError
        token = self.install().access_token
        before = self.state()
        for field, value in [('owner_user_id', 1), ('principal', {'roles': ['admin']}),
                             ('authorization', lambda: True), ('audit', {'actor_user_id': 1})]:
            with self.subTest(field=field):
                with self.assertRaises((AuthorizationDenied, ValidationError, ValueError)):
                    self.service().execute(token, 'role.create', {'name': 'bad', 'code': 'bad', field: value})
                self.assert_no_change(before)

    def test_direct_service_redis_and_database_failures_are_fixed_unavailable(self):
        token = self.install().access_token
        before = self.state()
        for target, name in ((self.auth.db, 'hget'), (self.auth.user_manager, 'get_auth_context')):
            with self.subTest(dependency=name), patch.object(target, name, side_effect=ConnectionError('private-storage-sentinel')):
                with self.assertRaises(AuthorizationDenied) as caught:
                    self.direct(token)
                self.assertEqual(getattr(caught.exception, 'status_code', None), 503)
                self.assertNotIn('private-storage-sentinel', str(caught.exception))
            self.assert_no_change(before)

    def test_visible_role_binding_or_status_revocation_before_mutation_rejects(self):
        original = RoleManager.create_role
        for sql, undo in [
            ("UPDATE roles SET code='former-admin' WHERE id=1", "UPDATE roles SET code='admin' WHERE id=1"),
            ('DELETE FROM user_roles WHERE user_id=1 AND role_id=1', 'INSERT INTO user_roles(user_id,role_id) VALUES(1,1)'),
            ('UPDATE users SET status=0 WHERE id=1', 'UPDATE users SET status=1 WHERE id=1')]:
            self.install()
            before = self.state()
            def revoke(manager, *args, **kwargs):
                self.pool.execute(sql)
                return original(manager, *args, **kwargs)
            try:
                with patch.object(RoleManager, 'create_role', revoke):
                    response = self.http.post('/role/', json={'name': 'revoked', 'code': 'revoked'})
                self.assertIn(response.status_code, (401, 403), response.text)
                self.assertEqual(self.events(), [])
                self.assertIsNone(self.pool.fetch_one("SELECT id FROM roles WHERE code='revoked'"))
            finally:
                self.pool.execute(undo)
            self.assert_no_change(before)

    def test_logout_after_business_and_audit_rolls_back_both(self):
        import src.controller.role_manager as roles
        token = self.install().access_token
        before = self.state()
        original = roles.record_admin_change
        def revoke_after_write(*args, **kwargs):
            result = original(*args, **kwargs)
            self.assertTrue(self.auth.logout(token))
            return result
        with patch.object(roles, 'record_admin_change', revoke_after_write):
            response = self.http.post('/role/', json={'name': 'logged-out', 'code': 'logged-out'})
        self.assertEqual(response.status_code, 401, response.text)
        self.assert_no_change(before)

    def test_protected_mutations_recheck_logout_before_actual_commit(self):
        import src.controller.user_manage as users
        import src.controller.role_manager as roles
        for module, method, path, body in [
            (users, 'DELETE', '/user/2', None),
            (roles, 'PUT', '/role/3', {'code': 'new-code'}),
            (roles, 'DELETE', '/role/3', None)]:
            with self.subTest(method=method, path=path):
                token = self.install().access_token
                before = self.state()
                original = module.record_admin_change
                def revoke_after_write(*args, **kwargs):
                    result = original(*args, **kwargs)
                    self.assertTrue(self.auth.logout(token))
                    return result
                with patch.object(module, 'record_admin_change', revoke_after_write):
                    response = self.http.request(method, path, json=body)
                self.assertEqual(response.status_code, 401, response.text)
                self.assert_no_change(before)

    def test_final_session_dependency_failure_rolls_back_both(self):
        import src.controller.role_manager as roles
        token = self.install().access_token
        before = self.state()
        original = roles.record_admin_change
        failing = []
        def fail_after_write(*args, **kwargs):
            result = original(*args, **kwargs)
            dependency = patch.object(self.auth.db, 'hget', side_effect=ConnectionError('private-final-sentinel'))
            dependency.start()
            failing.append(dependency)
            return result
        try:
            with patch.object(roles, 'record_admin_change', fail_after_write):
                with self.assertRaises(AuthorizationDenied) as caught:
                    self.direct(token)
            self.assertEqual(getattr(caught.exception, 'status_code', None), 503)
            self.assertNotIn('private-final-sentinel', str(caught.exception))
        finally:
            for dependency in failing:
                dependency.stop()
        self.assert_no_change(before)

    def test_recent_window_expiring_after_write_rolls_back_business_and_audit(self):
        import src.controller.role_manager as roles
        token = self.install().access_token
        clock = [time.time()]
        service = self.service(clock=lambda: clock[0])
        before = self.state()
        original = roles.record_admin_change
        def expire_after_write(*args, **kwargs):
            result = original(*args, **kwargs)
            clock[0] += 700
            return result
        with patch.object(roles, 'record_admin_change', expire_after_write):
            with self.assertRaises(AuthorizationDenied) as caught:
                self.direct(token, service=service)
        self.assertEqual(getattr(caught.exception, 'status_code', None), 403)
        self.assert_no_change(before)

    def test_self_disable_with_another_enabled_administrator_commits(self):
        self.add_other_administrator()
        self.install()
        response = self.http.delete('/user/1')
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(self.pool.fetch_one('SELECT status FROM users WHERE id=1')['status'], 0)
        self.assertEqual([(row['actor_user_id'], row['action'], row['target_id']) for row in self.events()], [(1, 'user.disable', 1)])

    def test_self_role_demotion_with_other_admin_role_commits(self):
        self.add_other_administrator(distinct_role=True)
        self.install()
        response = self.http.put('/role/1', json={'code': 'ordinary-after-demotion'})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(self.pool.fetch_one('SELECT code FROM roles WHERE id=1')['code'], 'ordinary-after-demotion')
        self.assertEqual([(row['actor_user_id'], row['action'], row['target_id']) for row in self.events()], [(1, 'role.update', 1)])

    def test_delete_own_admin_role_with_other_admin_role_commits(self):
        self.add_other_administrator(distinct_role=True)
        self.install()
        response = self.http.delete('/role/1')
        self.assertEqual(response.status_code, 200, response.text)
        self.assertIsNone(self.pool.fetch_one('SELECT id FROM roles WHERE id=1'))
        self.assertEqual(self.pool.fetch_all('SELECT * FROM user_roles WHERE user_id=1'), [])
        self.assertEqual([(row['actor_user_id'], row['action'], row['target_id']) for row in self.events()], [(1, 'role.delete', 1)])

    def test_single_connection_pool_service_create_user_has_no_nested_borrow(self):
        self.pool.close()
        self.pool = SocketManager(self.socket, self.database, pool_size=1)
        self.addCleanup(self.pool.close)
        self.auth.user_manager = UserManager(self.pool)
        token = self.install().access_token
        result = self.service().execute(token, 'user.create', self.mutations()[0][2])
        self.assertTrue(result)
        self.assertEqual(len(self.events()), 1)

    def locked_operation_and_revocation(self, sql):
        import src.controller.role_manager as roles
        self.install()
        entered, release, revoking = threading.Event(), threading.Event(), threading.Event()
        original = roles.record_admin_change
        worker_id = []
        def pause_after_write(*args, **kwargs):
            result = original(*args, **kwargs)
            entered.set()
            if not release.wait(8):
                raise RuntimeError('Owned lock test release timeout')
            return result
        def revoke():
            with pymysql.connect(unix_socket=self.socket, user='root', password='', database=self.database,
                                 connect_timeout=2, read_timeout=10, autocommit=False) as connection:
                with connection.cursor() as cursor:
                    cursor.execute('SET SESSION innodb_lock_wait_timeout=8')
                    worker_id.append(connection.thread_id())
                    revoking.set()
                    cursor.execute(sql)
                connection.commit()
        with patch.object(roles, 'record_admin_change', pause_after_write), ThreadPoolExecutor(max_workers=2) as executor:
            mutation = executor.submit(self.http.post, '/role/', json={'name': 'locked-authority', 'code': 'locked-authority'})
            try:
                self.assertTrue(entered.wait(5), 'mutation did not reach real audit')
                withdrawal = executor.submit(revoke)
                self.assertTrue(revoking.wait(3))
                waiting = False
                observations = []
                until = time.monotonic() + 4
                while time.monotonic() < until:
                    with self.connection.cursor() as cursor:
                        cursor.execute('SELECT trx_state FROM information_schema.innodb_trx WHERE trx_mysql_thread_id=%s', (worker_id[0],))
                        row = cursor.fetchone()
                    observations.append(row)
                    if row and row[0] == 'LOCK WAIT':
                        waiting = True
                        break
                    if withdrawal.done():
                        withdrawal.result()
                        break
                    # Match the established native recovery observer cadence.
                    time.sleep(0.15)
                self.assertTrue(waiting, 'revocation must actually wait on the held authorization rows; '
                                f'thread={worker_id[0]}, finished={withdrawal.done()}, samples={observations[-6:]}')
            finally:
                release.set()
            response = mutation.result(timeout=8)
            self.assertEqual(response.status_code, 201, response.text)
            withdrawal.result(timeout=8)
        self.assertEqual(len(self.events()), 1)
        self.assertEqual(self.events()[0]['actor_user_id'], 1)
        after = self.http.post('/role/', json={'name': 'after-revocation', 'code': 'after-revocation'})
        self.assertIn(after.status_code, (401, 403), after.text)
        self.assertEqual(len(self.events()), 1)

    def test_role_catalog_revocation_really_waits_until_authorized_commit(self):
        self.locked_operation_and_revocation("UPDATE roles SET code='revoked-admin' WHERE id=1")

    def test_actor_status_revocation_really_waits_until_authorized_commit(self):
        self.locked_operation_and_revocation('UPDATE users SET status=0 WHERE id=1')

    def test_actor_binding_revocation_really_waits_until_authorized_commit(self):
        self.locked_operation_and_revocation('DELETE FROM user_roles WHERE user_id=1 AND role_id=1')


def load_tests(loader, _tests, _pattern):
    """Reuse the owned fixture without doubling the original acceptance suite."""
    return unittest.TestSuite(AdminManagementStackTests(name) for name in sorted(AdminManagementStackTests.__dict__)
                              if name.startswith('test_'))


if __name__ == '__main__':
    unittest.main()
