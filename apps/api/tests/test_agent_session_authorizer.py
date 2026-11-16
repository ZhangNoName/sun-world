import hashlib
import io
import sqlite3
import sys
import time
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
from uuid import uuid4

from jose import jwt
from loguru import logger

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from src.controller.auth_manager import AuthManager
from src.controller.user_manage import UserManager
from src.core.auth import AuthorizationDenied, Principal
from src.core.auth.session import SessionAuthenticator
from src.modules.agent_runtime.ledger import family_hash
from src.modules.agent_runtime.session_authorizer import RunAllowlistPolicy, RunSessionAuthorizer


class IdentityDatabase:
    """Real SQLite statement reads; not a MySQL isolation conformance test."""
    def __init__(self):
        self.connection = sqlite3.connect(':memory:', isolation_level=None)
        self.connection.row_factory = sqlite3.Row
        self.legacy_calls = 0
        self.deny_legacy = False
        self.connection.executescript('''
            CREATE TABLE users(id INTEGER PRIMARY KEY, status INTEGER, username TEXT, name TEXT,
              age INTEGER, phone TEXT, email TEXT, birth_day TEXT, create_time TEXT, sex INTEGER);
            CREATE TABLE roles(id INTEGER PRIMARY KEY,name TEXT,code TEXT);
            CREATE TABLE user_roles(user_id INTEGER, role_id INTEGER);
            CREATE TABLE resources(id INTEGER PRIMARY KEY,name TEXT,code TEXT,type TEXT,path TEXT);
            CREATE TABLE role_resources(role_id INTEGER,resource_id INTEGER);
            INSERT INTO users(id,status) VALUES(1,1),(2,1),(3,0);
            INSERT INTO roles VALUES(1,'管理员',' admin '),(2,'普通','normal');
            INSERT INTO user_roles VALUES(1,1),(2,2);
        ''')

    def query(self, sql, params):
        params = params if isinstance(params, tuple) else (params,)
        return self.connection.execute(sql.replace('%s', '?'), params)

    def fetch_one(self, sql, params):
        self.legacy_calls += 1
        if self.deny_legacy:
            raise AssertionError('Authorization borrowed an extra database connection')
        row = self.query(sql, params).fetchone()
        return dict(row) if row else None

    def fetch_all(self, sql, params):
        self.legacy_calls += 1
        if self.deny_legacy:
            raise AssertionError('Authorization borrowed an extra database connection')
        return [dict(row) for row in self.query(sql, params).fetchall()]

    def current_uow(self, isolation_level='READ COMMITTED'):
        database = self
        class CurrentReadUow:
            def __init__(self):
                self.isolation_level = isolation_level
                self.connection = database.connection
                self.statements = []

            def fetch_all(self, sql, params):
                self.statements.append(sql)
                return [dict(row) for row in database.query(sql, params).fetchall()]
        return CurrentReadUow()


class RedisSessions:
    def __init__(self):
        self.sessions = {}
        self.blocked = set()
        self.unavailable = False

    def _check(self):
        if self.unavailable:
            raise TimeoutError('synthetic Redis unavailable')

    def hget(self, name, device):
        self._check()
        user_id = name.split(':')[1]
        snapshot = self.sessions.get((user_id, device))
        return snapshot[0] if snapshot else None

    def exist(self, key):
        self._check()
        return key in self.blocked

    def get_session_token_snapshot(self, *, user_id, device_id):
        self._check()
        return self.sessions.get((user_id, device_id))


class AgentSessionAuthorizerTests(unittest.TestCase):
    def setUp(self):
        self.database = IdentityDatabase()
        self.addCleanup(self.database.connection.close)
        self.redis = RedisSessions()
        self.user_manager = UserManager(self.database)
        with patch.object(AuthManager, 'hash_password', return_value='synthetic-unused-password-hash'):
            self.auth = AuthManager(self.user_manager, self.redis, secret_key='synthetic-signing-key-only')
        self.device = str(uuid4())
        self.family = 'synthetic-session-family'
        self.token = self.make_token()
        self.clock = 10.0
        self.authorizer = RunSessionAuthorizer(self.auth, ttl=5, clock=lambda: self.clock)
        self.uow = self.database.current_uow()
        self.owner = Principal(kind='user', user_id=1, session_family=self.family, roles=('admin',))
        self.row = self.run_row()

    def make_token(self, *, user_id=1, family=None, device=None, expires=None):
        family, device = family or self.family, device or self.device
        payload = dict(sub=str(user_id), typ='access', sid=family, device=device,
                       auth_time=int(time.time()), exp=expires or int(time.time()) + 600, jti=str(uuid4()))
        token = jwt.encode(payload, self.auth.secret_key, algorithm='HS256')
        self.redis.sessions[(str(user_id), device)] = (token, 'synthetic-refresh', family)
        return token

    def run_row(self, user_id=1, family=None):
        principal = Principal(kind='user', user_id=user_id, session_family=family or self.family)
        return dict(id=str(uuid4()), user_id=user_id, session_family_hash=family_hash(principal),
                    deadline=datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(seconds=45), app_id='sun-world', scenario='blog-qa')

    def bind(self):
        self.authorizer.bind(self.row, self.token)
        self.database.deny_legacy = True

    def test_revalidates_real_jwt_and_current_minimal_context_on_same_uow(self):
        self.bind()
        borrowed = self.database.legacy_calls
        principal = self.authorizer(self.uow, self.row)
        self.assertEqual(principal.user_id, 1)
        self.assertEqual(principal.roles, ('admin',))
        self.assertEqual(self.database.legacy_calls, borrowed)
        self.assertIs(self.uow.connection, self.database.connection)
        self.assertEqual(len(self.uow.statements), 1)
        statement = self.uow.statements[0]
        self.assertIn('u.id, u.status, r.code', statement)
        self.assertNotIn('FOR UPDATE', statement)
        self.assertNotIn('password', statement)
        self.assertNotIn('resources', statement)
        self.assertTrue(RunAllowlistPolicy([1])(principal, self.row, self.uow))

    def test_same_uow_observes_disabled_account_and_current_role_changes(self):
        self.bind()
        self.assertTrue(RunAllowlistPolicy([1])(self.authorizer(self.uow, self.row), self.row, self.uow))
        self.database.connection.execute('UPDATE users SET status=0 WHERE id=1')
        with self.assertRaises(AuthorizationDenied):
            self.authorizer(self.uow, self.row)
        self.database.connection.execute('UPDATE users SET status=2 WHERE id=1')
        with self.assertRaises(AuthorizationDenied):
            self.authorizer(self.uow, self.row)
        self.database.connection.execute('UPDATE users SET status=1 WHERE id=1')
        self.database.connection.execute('DELETE FROM user_roles WHERE user_id=1')
        principal = self.authorizer(self.uow, self.row)
        self.assertEqual(principal.roles, ())
        with self.assertRaises(AuthorizationDenied):
            RunAllowlistPolicy([1])(principal, self.row, self.uow)
        self.assertTrue(RunAllowlistPolicy([1], require_admin=False)(principal, self.row, self.uow))

    def test_role_query_failure_and_redis_revocation_or_failure_deny(self):
        self.bind()
        self.redis.unavailable = True
        with self.assertRaises(AuthorizationDenied):
            self.authorizer(self.uow, self.row)
        self.redis.unavailable = False
        snapshot = self.redis.sessions.pop(('1', self.device))
        with self.assertRaises(AuthorizationDenied):
            self.authorizer(self.uow, self.row)
        self.redis.sessions[('1', self.device)] = snapshot
        self.database.connection.execute('DROP TABLE roles')
        with self.assertRaises(AuthorizationDenied):
            self.authorizer(self.uow, self.row)

    def test_refresh_in_same_family_updates_token_without_extending_cache_or_deadline(self):
        self.bind()
        entry = self.authorizer._bindings[self.row['id']]
        original_expiry = entry.expires_at
        original_deadline = self.row['deadline']
        self.clock += 2
        fresh = self.make_token()
        self.assertNotEqual(fresh, self.token)
        principal = self.authorizer(self.uow, self.row)
        self.assertEqual(principal.session_family, self.family)
        self.assertEqual(entry.token, fresh)
        self.assertEqual(entry.expires_at, original_expiry)
        self.assertEqual(self.row['deadline'], original_deadline)
        self.clock += 3
        with self.assertRaises(AuthorizationDenied):
            self.authorizer(self.uow, self.row)
        self.assertFalse(self.authorizer._bindings)

    def test_different_family_device_owner_or_hash_cannot_reuse_binding(self):
        self.bind()
        for modified in [dict(user_id=2), dict(session_family_hash='0' * 64),
                         dict(deadline=self.row['deadline'] + timedelta(seconds=1)), dict(id=str(uuid4()))]:
            with self.subTest(modified=modified), self.assertRaises(AuthorizationDenied):
                self.authorizer(self.uow, {**self.row, **modified})
        self.make_token(family='different-family')
        with self.assertRaises(AuthorizationDenied):
            self.authorizer(self.uow, self.row)
        self.make_token()
        wrong_device = self.make_token(device=str(uuid4()))
        # Redis must not return a successor for another device under this binding.
        self.redis.sessions[('1', self.device)] = (wrong_device, 'synthetic-refresh', self.family)
        with self.assertRaises(AuthorizationDenied):
            self.authorizer(self.uow, self.row)

    def test_repeatable_read_or_missing_isolation_denied_without_legacy_fallback(self):
        self.bind()
        for uow in [self.database.current_uow('REPEATABLE READ'), SimpleNamespace()]:
            with self.subTest(uow=uow), self.assertRaises(AuthorizationDenied):
                self.authorizer(uow, self.row)
            with self.assertRaises(AuthorizationDenied):
                SessionAuthenticator(self.auth).authenticate(self.token, uow=uow)
            with self.assertRaises(ValueError):
                self.auth.get_user_from_token(self.token, check_redis=True, uow=uow)
            with self.assertRaises(ValueError):
                self.user_manager.get_auth_context(1, uow=uow)

    def test_missing_binding_restart_close_and_concurrent_revoke_fail_closed(self):
        self.bind()
        restarted = RunSessionAuthorizer(self.auth)
        with self.assertRaises(AuthorizationDenied):
            restarted(self.uow, self.row)
        original = self.authorizer._authenticator.revalidate_bound_session
        def revoke_after_validation(*args, **kwargs):
            result = original(*args, **kwargs)
            self.authorizer.revoke(self.row['id'])
            return result
        with patch.object(self.authorizer._authenticator, 'revalidate_bound_session', side_effect=revoke_after_validation):
            with self.assertRaises(AuthorizationDenied):
                self.authorizer(self.uow, self.row)
        self.assertFalse(self.authorizer._bindings)
        self.database.deny_legacy = False
        self.authorizer.bind(self.row, self.token)
        self.authorizer.close()
        self.assertFalse(self.authorizer._bindings)
        with self.assertRaises(AuthorizationDenied):
            self.authorizer(self.uow, self.row)
        with self.assertRaises(AuthorizationDenied):
            self.authorizer.bind(self.row, self.token)

    def test_capacity_ttl_and_rebind_keep_original_expiry(self):
        authorizer = RunSessionAuthorizer(self.auth, capacity=1, ttl=5, clock=lambda: self.clock)
        authorizer.bind(self.row, self.token)
        original_expiry = authorizer._bindings[self.row['id']].expires_at
        self.clock += 2
        fresh = self.make_token()
        authorizer.bind(self.row, fresh)
        self.assertEqual(authorizer._bindings[self.row['id']].expires_at, original_expiry)
        second = self.run_row()
        with self.assertRaises(AuthorizationDenied):
            authorizer.bind(second, fresh)
        self.clock += 3
        with self.assertRaises(AuthorizationDenied):
            authorizer(self.uow, self.row)
        authorizer.bind(second, fresh)
        self.assertEqual(len(authorizer._bindings), 1)
        self.assertIn(second['id'], authorizer._bindings)

    def test_no_token_or_prefix_in_repr_exceptions_or_blacklist_logging(self):
        self.bind()
        rendered = repr(self.authorizer) + repr(self.authorizer._bindings)
        self.assertNotIn(self.token, rendered)
        self.assertNotIn(self.token[:20], rendered)
        errors = []
        with self.assertRaises(AuthorizationDenied) as caught:
            self.authorizer(self.uow, {**self.row, 'session_family_hash': self.token})
        errors.append(str(caught.exception) + repr(caught.exception))
        output = io.StringIO()
        sink = logger.add(output, format='{message}')
        try:
            self.redis.blocked.add('blacklist:' + hashlib.sha256(self.token.encode()).hexdigest())
            with self.assertRaises(AuthorizationDenied) as caught:
                self.authorizer(self.uow, self.row)
            errors.append(str(caught.exception) + repr(caught.exception))
        finally:
            logger.remove(sink)
        rendered = output.getvalue() + ''.join(errors)
        self.assertNotIn(self.token, rendered)
        self.assertNotIn(self.token[:20], rendered)
        self.assertIn('Token is blacklisted', rendered)

    def test_forged_hash_expired_cached_token_and_allowlist_validation(self):
        with self.assertRaises(AuthorizationDenied):
            self.authorizer.bind({**self.row, 'session_family_hash': 'a' * 64}, self.token)
        self.bind()
        payload = jwt.decode(self.token, self.auth.secret_key, algorithms=['HS256'])
        expired = jwt.encode({**payload, 'exp': int(time.time()) - 1}, self.auth.secret_key, algorithm='HS256')
        self.authorizer._bindings[self.row['id']].token = expired
        fresh = self.make_token()
        self.assertEqual(self.authorizer(self.uow, self.row).user_id, 1)
        self.assertEqual(self.authorizer._bindings[self.row['id']].token, fresh)
        for invalid in [[], [True], [0], ['1'], '1,2', {'id': 1}, None]:
            with self.subTest(invalid=invalid), self.assertRaises(ValueError):
                RunAllowlistPolicy(invalid)
        for invalid in [dict(capacity=True), dict(capacity=0), dict(capacity=129),
                        dict(ttl=True), dict(ttl=0), dict(ttl=float('nan')), dict(ttl=61)]:
            with self.subTest(invalid=invalid), self.assertRaises(ValueError):
                RunSessionAuthorizer(self.auth, **invalid)
        principal = self.authorizer(self.uow, self.row)
        for wrong in [dict(app_id='other-project'), dict(scenario='blog-write')]:
            with self.subTest(wrong=wrong), self.assertRaises(AuthorizationDenied):
                RunAllowlistPolicy([1])(principal, {**self.row, **wrong}, self.uow)
        with self.assertRaises(AuthorizationDenied):
            RunAllowlistPolicy([2])(principal, self.row, self.uow)
        malformed = Principal(kind='user', user_id=1, session_family=self.family, roles='not-admin')
        with self.assertRaises(AuthorizationDenied):
            RunAllowlistPolicy([1])(malformed, self.row, self.uow)
