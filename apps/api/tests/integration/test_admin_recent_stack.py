"""Real owned MySQL/Redis, AuthManager, signed cookies and management HTTP."""

import hashlib
import json
import os
import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4

import pymysql
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient
from jose import jwt
from starlette.exceptions import HTTPException as StarletteHTTPException

ROOT = Path(__file__).resolve().parents[4]
sys.path[:0] = [str(ROOT / 'apps/api'), str(Path(__file__).resolve().parent)]

from test_agent_mysql import SocketManager
from test_agent_stack import OwnedSessionRedis, redis_launcher
from src.controller.auth_manager import AuthManager
from src.controller.resource_manager import ResourceManager
from src.controller.role_manager import RoleManager
from src.controller.user_manage import UserManager
from src.core.response import fail
from src.database.mysql.schema_migration import MYSQL_SCHEMA, build_create_table_sql
from src.routers.auth.auth import get_auth_manager, router as auth_router
from src.routers.resource.resource import get_resource_manager, resource_router
from src.routers.role.role import get_role_manager, router as role_router
from src.routers.user.user import get_user_manager, router as user_router

HOST = 'admin-recent.example.test'
PASSWORD = 'synthetic-only-password'


@unittest.skipUnless(os.getenv('SUN_WORLD_AGENT_MYSQL_ROOT') and os.getenv('SUN_WORLD_AGENT_REDIS_ROOT'),
                     'Use scripts/test-admin-recent-stack.py with owned servers')
class AdminRecentStackTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        directory = Path(os.environ['SUN_WORLD_AGENT_MYSQL_ROOT']).resolve()
        marker = json.loads((directory / 'owner.json').read_text())
        if (marker['nonce'] != os.getenv('SUN_WORLD_AGENT_MYSQL_NONCE')
                or not directory.name.startswith('sunworld-agent-mysql-')):
            raise RuntimeError('Missing owned MySQL proof')
        cls.socket = str(directory / 'mysql.sock')
        with pymysql.connect(unix_socket=cls.socket, user='root', password='', connect_timeout=2) as connection:
            with connection.cursor() as cursor:
                cursor.execute('SELECT @@datadir,@@socket,@@skip_networking')
                data, socket, networking = cursor.fetchone()
                if (Path(data).resolve() != directory / 'data'
                        or Path(socket).resolve() != Path(cls.socket) or networking != 1):
                    raise RuntimeError('Refusing a shared or TCP-enabled server')

    def setUp(self):
        environment = patch.dict(os.environ, {'AUTH_STEP_UP_MAX_AGE_SECONDS': '600', 'BLOG_RUNTIME_ENV': 'test'})
        environment.start()
        self.addCleanup(environment.stop)
        self.database = 'admin_recent_' + uuid4().hex
        self.connection = pymysql.connect(unix_socket=self.socket, user='root', password='', autocommit=True)
        self.addCleanup(self.connection.close)
        with self.connection.cursor() as cursor:
            cursor.execute(f'CREATE DATABASE `{self.database}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci')
        self.addCleanup(self.drop_database)
        with self.connection.cursor() as cursor:
            cursor.execute(f'USE `{self.database}`')
            for name, definition in MYSQL_SCHEMA.items():
                cursor.execute(build_create_table_sql(name, definition))
        self.pool = SocketManager(self.socket, self.database)
        self.addCleanup(self.pool.close)
        self.redis = redis_launcher.verified_client(os.environ)
        self.addCleanup(self.redis.connection_pool.disconnect)
        self.addCleanup(self.redis.close)
        session = OwnedSessionRedis(self.redis, 'admin-recent:' + uuid4().hex + ':')
        self.auth = AuthManager(UserManager(self.pool), session, secret_key='synthetic-recent-stack-secret')
        # Existing legacy hash is deliberately upgraded by the real login case.
        password_hash = hashlib.sha256(PASSWORD.encode()).hexdigest()
        self.pool.execute("INSERT INTO users(id,username,name,sex,age,phone,email,password,birth_day,status) VALUES"
                          "(1,'recent-admin-one','synthetic-one',0,20,'','one@example.invalid',%s,'2000-01-01',1),"
                          "(2,'recent-normal-two','synthetic-two',0,20,'','two@example.invalid',%s,'2000-01-01',1)",
                          (password_hash, password_hash))
        self.pool.execute("INSERT INTO roles(id,name,code) VALUES"
                          "(1,'administrator','admin'),(2,'normal','normal'),"
                          "(3,'mutable','editor'),(4,'binding','binding')")
        self.pool.execute('INSERT INTO user_roles(user_id,role_id) VALUES(1,1),(2,2)')
        self.pool.execute("INSERT INTO resources(id,name,code,type,path) VALUES"
                          "(1,'keep','keep','page','/keep'),(2,'remove','remove','page','/remove')")
        application = FastAPI()
        for router in (auth_router, user_router, role_router, resource_router):
            application.include_router(router)
        application.dependency_overrides[get_auth_manager] = lambda: self.auth
        application.dependency_overrides[get_user_manager] = lambda: UserManager(self.pool)
        application.dependency_overrides[get_role_manager] = lambda: RoleManager(self.pool)
        application.dependency_overrides[get_resource_manager] = lambda: ResourceManager(self.pool)

        @application.exception_handler(StarletteHTTPException)
        async def http_error(_request, error):
            detail = error.detail if isinstance(error.detail, dict) else {}
            return JSONResponse(status_code=error.status_code, content=fail(
                code=detail.get('code', error.status_code),
                msg=detail.get('message', '请求失败')).model_dump())

        @application.exception_handler(Exception)
        async def unavailable(_request, _error):
            return JSONResponse(status_code=500, content={'code': 'COMMON_INTERNAL_ERROR', 'data': None, 'msg': '请求失败'})

        self.http = TestClient(application, base_url='https://' + HOST, raise_server_exceptions=False)
        self.addCleanup(self.http.close)
        self.device = str(uuid4())

    def drop_database(self):
        if not self.database.startswith('admin_recent_') or len(self.database) != 45:
            raise RuntimeError('Unexpected disposable database name')
        with self.connection.cursor() as cursor:
            cursor.execute(f'DROP DATABASE `{self.database}`')

    def install(self, *, age=0, user='1', claims=None, mirror_proof=False, omit_proof=False):
        pair = self.auth._build_tokens(user, self.device,
            auth_time=int(datetime.now(timezone.utc).timestamp()) - age)
        payload = jwt.decode(pair.access_token, self.auth.secret_key, algorithms=['HS256'])
        if claims:
            payload.update(claims)
            pair.access_token = jwt.encode(payload, self.auth.secret_key, algorithm='HS256')
        if mirror_proof or omit_proof:
            refresh = jwt.decode(pair.refresh_token, self.auth.secret_key, algorithms=['HS256'])
            if mirror_proof:
                refresh.update(claims or {})
            if omit_proof:
                payload.pop('auth_time', None)
                refresh.pop('auth_time', None)
                pair.access_token = jwt.encode(payload, self.auth.secret_key, algorithm='HS256')
            pair.refresh_token = jwt.encode(refresh, self.auth.secret_key, algorithm='HS256')
        self.auth._store_tokens(user, self.device, payload['sid'], pair)
        self.http.cookies.clear()
        for name, value in (('access_token', pair.access_token), ('refresh_token', pair.refresh_token), ('device_id', self.device)):
            self.http.cookies.set(name, value, domain=HOST, path='/')
        return pair

    def state(self):
        return {name: self.pool.fetch_all(f'SELECT * FROM {name} ORDER BY 1,2')
                for name in ('users', 'roles', 'user_roles', 'resources', 'role_resources')}

    def mutations(self):
        return [
            ('POST', '/user/', {'username': 'new-managed-user', 'name': 'New User', 'sex': 0,
                'age': 20, 'phone': '', 'email': 'new@example.invalid', 'password': PASSWORD, 'birth_day': '2000-01-01'}),
            ('DELETE', '/user/2', None),
            ('POST', '/role/', {'name': 'new-role', 'code': 'new-role'}),
            ('PUT', '/role/3', {'code': 'updated-editor'}),
            ('DELETE', '/role/3', None),
            ('POST', '/role/4/bind_resources', {'resource_ids': [1]}),
            ('POST', '/resource/', {'name': 'new-resource', 'code': 'new-resource', 'type': 'page'}),
            ('PUT', '/resource/1', {'name': 'updated-resource'}),
            ('DELETE', '/resource/2', None),
        ]

    def test_all_nine_stale_writes_reject_without_database_changes(self):
        self.install(age=700)
        before = self.state()
        for method, path, body in self.mutations():
            with self.subTest(method=method, path=path):
                response = self.http.request(method, path, json=body)
                self.assertEqual((response.status_code, response.json()['code']), (403, 'AUTH_STEP_UP_REQUIRED'))
                self.assertEqual(self.state(), before)

    def test_all_nine_recent_writes_reach_the_real_managers(self):
        self.install()
        for method, path, body in self.mutations():
            with self.subTest(method=method, path=path):
                response = self.http.request(method, path, json=body)
                self.assertEqual(response.status_code, 201 if method == 'POST' and path in ('/user/', '/role/', '/resource/') else 200,
                                 response.text)
        self.assertEqual(self.pool.fetch_one("SELECT COUNT(*) AS n FROM users WHERE username='new-managed-user'")['n'], 1)
        self.assertEqual(self.pool.fetch_one('SELECT status FROM users WHERE id=2')['status'], 0)
        self.assertIsNone(self.pool.fetch_one('SELECT id FROM roles WHERE id=3'))
        self.assertEqual(self.pool.fetch_all('SELECT resource_id FROM role_resources WHERE role_id=4'), [{'resource_id': 1}])
        self.assertEqual(self.pool.fetch_one('SELECT name FROM resources WHERE id=1')['name'], 'updated-resource')
        self.assertIsNone(self.pool.fetch_one('SELECT id FROM resources WHERE id=2'))

    def test_stale_login_keeps_all_management_reads(self):
        self.install(age=700)
        before = self.state()
        for path in ('/user/', '/user/1', '/role/', '/role/1', '/resource/', '/resource/1'):
            with self.subTest(path=path):
                self.assertEqual(self.http.get(path).status_code, 200)
        self.assertEqual(self.state(), before)

    def test_refresh_keeps_original_auth_time_and_cannot_unlock_a_write(self):
        pair = self.install(age=700)
        original = jwt.decode(pair.access_token, self.auth.secret_key, algorithms=['HS256'])['auth_time']
        before = self.state()
        response = self.http.post('/auth/refresh_token')
        self.assertEqual(response.status_code, 200, response.text)
        current = self.http.cookies.get('access_token')
        self.assertNotEqual(current, pair.access_token)
        self.assertEqual(jwt.decode(current, self.auth.secret_key, algorithms=['HS256'])['auth_time'], original)
        self.assertEqual(self.http.post('/role/', json={'name': 'denied', 'code': 'denied'}).status_code, 403)
        self.assertEqual(self.state(), before)

    def test_real_password_login_restores_recent_write_then_logout_revokes(self):
        old = self.install(age=700)
        response = self.http.post('/auth/login', json={'username': 'recent-admin-one', 'password': PASSWORD})
        self.assertEqual(response.status_code, 200, response.text)
        current = self.http.cookies.get('access_token')
        self.assertNotEqual(current, old.access_token)
        self.assertLess(abs(datetime.now(timezone.utc).timestamp()
            - jwt.decode(current, self.auth.secret_key, algorithms=['HS256'])['auth_time']), 5)
        self.assertEqual(self.http.post('/role/', json={'name': 'allowed', 'code': 'allowed'}).status_code, 201)
        before = self.state()
        self.assertEqual(self.http.post('/auth/logout').status_code, 200)
        self.http.cookies.set('access_token', current, domain=HOST, path='/')
        self.assertEqual(self.http.post('/role/', json={'name': 'revoked', 'code': 'revoked'}).status_code, 401)
        self.assertEqual(self.state(), before)

    def test_current_account_disable_and_role_withdrawal_still_reject(self):
        self.install()
        # Deliberate fixture SQL models an externally visible revocation.
        self.pool.execute('UPDATE users SET status=0 WHERE id=1')
        before = self.state()
        self.assertEqual(self.http.post('/role/', json={'name': 'disabled', 'code': 'disabled'}).status_code, 401)
        self.assertEqual(self.state(), before)
        self.pool.execute('UPDATE users SET status=1 WHERE id=1')
        self.pool.execute('DELETE FROM user_roles WHERE user_id=1')
        before = self.state()
        self.assertEqual(self.http.post('/role/', json={'name': 'unbound', 'code': 'unbound'}).status_code, 403)
        self.assertEqual(self.state(), before)

    def test_anonymous_and_normal_user_cannot_gain_write_from_recent_time(self):
        before = self.state()
        self.assertEqual(self.http.post('/role/', json={'name': 'anonymous', 'code': 'anonymous'}).status_code, 401)
        self.install(user='2')
        self.assertEqual(self.http.post('/role/', json={'name': 'normal', 'code': 'normal'}).status_code, 403)
        self.assertEqual(self.state(), before)

    def test_body_header_time_and_header_token_cannot_replace_the_cookie(self):
        self.install(age=700)
        before = self.state()
        response = self.http.post('/role/', json={'name': 'spoofed', 'code': 'spoofed', 'auth_time': 9_999_999_999},
                                  headers={'x-auth-time': '9999999999', 'Authorization': 'Bearer synthetic-untrusted'})
        self.assertEqual((response.status_code, response.json()['code']), (403, 'AUTH_STEP_UP_REQUIRED'))
        self.assertEqual(self.state(), before)

    def test_signed_noninteger_proof_is_rejected_with_no_write(self):
        before = self.state()
        for value in (str(int(datetime.now(timezone.utc).timestamp())), float(datetime.now(timezone.utc).timestamp()), True, 0):
            self.install(claims={'auth_time': value})
            response = self.http.post('/role/', json={'name': 'invalid-proof', 'code': 'invalid-proof'})
            self.assertEqual((response.status_code, response.json()['code']), (403, 'AUTH_STEP_UP_REQUIRED'))
            self.assertEqual(self.state(), before)

    def test_refresh_cannot_launder_missing_or_malformed_primary_proof(self):
        before = self.state()
        cases = [('missing', None), ('null', None), ('string', str(int(datetime.now(timezone.utc).timestamp()))),
                 ('float', datetime.now(timezone.utc).timestamp()), ('boolean', True), ('zero', 0),
                 ('negative', -1), ('future', int(datetime.now(timezone.utc).timestamp()) + 7200)]
        for label, value in cases:
            with self.subTest(proof=label):
                self.install(claims={'auth_time': value}, mirror_proof=True, omit_proof=label == 'missing')
                response = self.http.post('/role/', json={'name': 'before-refresh', 'code': 'before-refresh'})
                self.assertEqual((response.status_code, response.json()['code']), (403, 'AUTH_STEP_UP_REQUIRED'))
                refreshed = self.http.post('/auth/refresh_token')
                self.assertEqual(refreshed.status_code, 200, refreshed.text)
                current = self.http.cookies.get('access_token')
                self.assertEqual(jwt.decode(current, self.auth.secret_key, algorithms=['HS256'])['auth_time'], 0)
                response = self.http.post('/role/', json={'name': 'after-refresh', 'code': 'after-refresh'})
                self.assertEqual((response.status_code, response.json()['code']), (403, 'AUTH_STEP_UP_REQUIRED'))
                self.assertEqual(self.state(), before)

    def test_invalid_configuration_and_dependencies_fail_closed(self):
        self.install()
        before = self.state()
        with patch.dict(os.environ, {'AUTH_STEP_UP_MAX_AGE_SECONDS': 'synthetic-invalid-config'}):
            response = self.http.post('/role/', json={'name': 'bad-config', 'code': 'bad-config'})
        self.assertEqual(response.status_code, 503)
        self.assertNotIn('synthetic-invalid-config', response.text)
        with patch.object(self.auth.db, 'hget', side_effect=ConnectionError('synthetic-redis-failure')):
            response = self.http.post('/role/', json={'name': 'bad-redis', 'code': 'bad-redis'})
        self.assertGreaterEqual(response.status_code, 500)
        self.assertNotIn('synthetic-redis-failure', response.text)
        with patch.object(self.auth.user_manager, 'get_user_by_id', side_effect=ConnectionError('synthetic-mysql-failure')):
            response = self.http.post('/role/', json={'name': 'bad-mysql', 'code': 'bad-mysql'})
        self.assertGreaterEqual(response.status_code, 500)
        self.assertNotIn('synthetic-mysql-failure', response.text)
        self.assertEqual(self.state(), before)

    def test_recent_proof_does_not_override_last_administrator_invariant(self):
        self.install()
        before = self.state()
        for method, path, body in (('DELETE', '/user/1', None), ('PUT', '/role/1', {'code': 'ordinary'}),
                                   ('DELETE', '/role/1', None)):
            response = self.http.request(method, path, json=body)
            self.assertEqual((response.status_code, response.json()['code']), (409, 'AUTH_LAST_ADMINISTRATOR'))
            self.assertEqual(self.state(), before)


if __name__ == '__main__':
    unittest.main()
