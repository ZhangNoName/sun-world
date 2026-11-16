"""Real owned MySQL/Redis + real auth/application/browser router.

The Worker transport/process, model provider and article bodies are deliberately
synthetic. No production application/configuration or external provider is loaded.
"""

import asyncio
import contextlib
import importlib.util
import json
import os
import secrets
import stat
import sys
import threading
import unittest
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4

import httpx
import pymysql
from fastapi import FastAPI

ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT / 'apps/api'))
sys.path.insert(0, str(ROOT / 'apps/api/tests/integration'))
from test_agent_mysql import SocketManager
from src.controller.auth_manager import AuthManager
from src.controller.user_manage import UserManager
from src.database.mysql.schema_migration import MYSQL_SCHEMA, build_create_table_sql
from src.database.redis.redis_manage import RedisManager
from src.module_composition import create_module_registry
from src.modules.agent_runtime.admission import RedisRunAdmission
from src.modules.agent_runtime.application import RunApplication
from src.modules.agent_runtime.gateway import RunCall
from src.modules.agent_runtime.ledger import LedgerError, MySqlRunLedger, digest
from src.modules.agent_runtime.public_router import create_public_run_router

ORIGIN = 'https://stack.example.test'
BASE = '/ai/v1/blog-qa'
SECRET = 'S' * 43  # Synthetic Worker service credential, never a real credential.

spec = importlib.util.spec_from_file_location('stack_owned_redis', ROOT / 'scripts/test-agent-redis.py')
redis_launcher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(redis_launcher)


class OwnedSessionRedis(RedisManager):
    """Keep real session Lua methods, injecting only the attested local client."""
    def __init__(self, client, prefix):
        self.r, self.key_prefix = client, prefix

    def connect(self):
        raise RuntimeError('Owned fixture must never connect to another Redis')


class SyntheticWorker:
    """No SDK/process/HTTPS claim: direct formal Gateway calls are the fixture."""
    def __init__(self, pool):
        self.pool, self.application = pool, None
        self.mode, self.quiescent = 'complete', True
        self.payloads, self.states, self.tasks, self.cancels = {}, {}, {}, []

    async def probe(self, **_):
        return True

    @staticmethod
    def binding(payload):
        return {key: payload[key] for key in ('protocol', 'run_id', 'execution_id', 'generation', 'bundle_hash')}

    def call(self, payload, audience):
        return RunCall(payload['run_id'], payload['execution_id'], payload['generation'],
                       SECRET, payload['credentials'][audience])

    async def start(self, payload):
        run_id = payload['run_id']
        if run_id in self.payloads:
            raise RuntimeError('Synthetic Worker observed replayed start')
        self.payloads[run_id], self.states[run_id] = payload, 'running'
        self.tasks[run_id] = asyncio.create_task(self.work(payload))
        return {**self.binding(payload), 'status': 'running'}

    async def work(self, payload):
        run_id, gateway = payload['run_id'], self.application.gateway
        try:
            if self.mode == 'hold':
                await asyncio.Event().wait()
            result = self.call(payload, 'result')
            tool = self.call(payload, 'tool')
            await asyncio.to_thread(gateway.bind_root_turn, result, 'native-root-turn', root_request_id='native-root-request')
            await gateway.model(self.call(payload, 'model'), {'messages': []})
            await asyncio.to_thread(gateway.tool, tool, call_id='search', tool_id='blog.search_public',
                                    tool_version='1', arguments={'query': '合成公开文章'})
            response = await asyncio.to_thread(gateway.tool, tool, call_id='read', tool_id='blog.read_public',
                                               tool_version='1', arguments={'article_id': 1})
            await asyncio.to_thread(gateway.receipt, tool, call_id='read', result_hash=response['result_hash'])
            await asyncio.to_thread(gateway.finish, result, root_session_id=payload['root_session_id'],
                root_turn_id='native-root-turn', root_request_id='native-root-request',
                answer='依据合成公开文章的回答。', source_ids=[response['source_id']])
            self.states[run_id] = 'completed'
        except asyncio.CancelledError:
            raise
        except Exception:
            self.states[run_id] = 'failed'

    async def inspect(self, binding):
        return {**binding, 'status': self.states.get(binding['run_id'], 'cancelled')}

    async def cancel(self, binding):
        run_id = binding['run_id']
        row = await asyncio.to_thread(self.pool.fetch_one, 'SELECT status FROM agent_runs WHERE id=%s', (run_id,))
        self.cancels.append((run_id, row['status']))
        task = self.tasks.get(run_id)
        if task and not task.done():
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
        if self.states.get(run_id) != 'completed':
            self.states[run_id] = 'cancelled' if self.quiescent else 'running'
        return await self.inspect(binding)

    async def close(self):
        for task in self.tasks.values():
            task.cancel()
        await asyncio.gather(*self.tasks.values(), return_exceptions=True)


class BrowserStream:
    """Exercise actual ASGI http.disconnect, without httpx stream buffering."""
    def __init__(self, host, token, key, question='合成问题'):
        self.queue, self.messages = asyncio.Queue(), []
        self.started = asyncio.get_running_loop().create_future()
        body = json.dumps({'question': question, 'idempotency_key': key}).encode()
        self.queue.put_nowait({'type': 'http.request', 'body': body, 'more_body': False})
        headers = [(b'host', b'stack.example.test'), (b'origin', ORIGIN.encode()),
                   (b'content-type', b'application/json'), (b'cookie', ('access_token=' + token).encode())]
        scope = dict(type='http', asgi={'version': '3.0', 'spec_version': '2.3'},
            http_version='1.1', method='POST', scheme='https', path=BASE + '/runs/stream',
            raw_path=(BASE + '/runs/stream').encode(), query_string=b'', headers=headers,
            root_path='', server=('stack.example.test', 443), client=('127.0.0.1', 1))
        async def send(message):
            self.messages.append(message)
            if message['type'] == 'http.response.body':
                for line in message.get('body', b'').decode().splitlines():
                    if line.startswith('data:'):
                        event = json.loads(line[5:])
                        if event['type'] == 'run.started' and not self.started.done():
                            self.started.set_result(event['data']['run_id'])
        self.task = asyncio.create_task(host(scope, self.queue.get, send))

    async def run_id(self):
        return await asyncio.wait_for(asyncio.shield(self.started), 8)

    async def finish(self):
        await asyncio.wait_for(asyncio.shield(self.task), 12)

    async def disconnect(self):
        self.queue.put_nowait({'type': 'http.disconnect'})
        await self.finish()

    def events(self):
        body = b''.join(message.get('body', b'') for message in self.messages
                        if message['type'] == 'http.response.body').decode()
        return [json.loads(line[5:]) for line in body.splitlines() if line.startswith('data:')]


@unittest.skipUnless(os.getenv('SUN_WORLD_AGENT_MYSQL_ROOT') and os.getenv('SUN_WORLD_AGENT_REDIS_ROOT'),
                     'Use scripts/test-agent-stack.py with both owned servers')
class AgentStackTests(unittest.IsolatedAsyncioTestCase):
    @classmethod
    def setUpClass(cls):
        cls.redis = redis_launcher.verified_client(os.environ)
        directory = Path(os.environ['SUN_WORLD_AGENT_MYSQL_ROOT'])
        if (directory.resolve() != directory or not directory.name.startswith('sunworld-agent-mysql-')
                or directory.is_symlink() or stat.S_IMODE(directory.stat().st_mode) != 0o700
                or directory.stat().st_uid != os.getuid()):
            raise RuntimeError('Owned MySQL directory required')
        marker = directory / 'owner.json'
        info = marker.lstat()
        if (not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or info.st_size > 4096
                or stat.S_IMODE(info.st_mode) != 0o600 or info.st_uid != os.getuid()):
            raise RuntimeError('Owned MySQL marker required')
        proof = json.loads(marker.read_text())
        if (not secrets.compare_digest(proof['nonce'], os.environ['SUN_WORLD_AGENT_MYSQL_NONCE'])
                or Path(proof['data']) != directory / 'data' or Path(proof['socket']) != directory / 'mysql.sock'):
            raise RuntimeError('Owned MySQL attestation required')
        cls.socket = str(directory / 'mysql.sock')
        with pymysql.connect(unix_socket=cls.socket, user='root', password='', connect_timeout=2) as connection:
            with connection.cursor() as cursor:
                cursor.execute('SELECT @@datadir,@@socket,@@skip_networking')
                data, socket, network_disabled = cursor.fetchone()
                if Path(data).resolve() != directory / 'data' or socket != cls.socket or network_disabled != 1:
                    raise RuntimeError('Owned MySQL configuration mismatch')

    @classmethod
    def tearDownClass(cls):
        cls.redis.close()
        cls.redis.connection_pool.disconnect()

    async def asyncSetUp(self):
        self.database = 'sunworld_stack_' + uuid4().hex
        self.prefix = 'agent:stack:' + uuid4().hex
        self.streams = []
        self.admin = pymysql.connect(unix_socket=self.socket, user='root', password='', autocommit=True)
        with self.admin.cursor() as cursor:
            cursor.execute(f'CREATE DATABASE `{self.database}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci')
            cursor.execute(f'USE `{self.database}`')
            for name, definition in MYSQL_SCHEMA.items():
                cursor.execute(build_create_table_sql(name, definition))
        self.pool = SocketManager(self.socket, self.database, pool_size=4)
        self.pool.execute("INSERT INTO users(id,name,email,password,status) VALUES"
            "(1,'synthetic-one','one@example.invalid','synthetic-unused',1),"
            "(2,'synthetic-two','two@example.invalid','synthetic-unused',1),"
            "(3,'synthetic-outsider','three@example.invalid','synthetic-unused',1)")
        self.pool.execute("INSERT INTO roles(id,name,code) VALUES(1,'synthetic-admin','admin')")
        self.pool.execute('INSERT INTO user_roles(user_id,role_id) VALUES(1,1),(2,1),(3,1)')
        self.session_store = OwnedSessionRedis(self.redis, self.prefix + ':auth')
        self.auth = AuthManager(UserManager(self.pool), self.session_store,
                               secret_key=secrets.token_urlsafe(32), refresh_reuse_grace_seconds=0)
        self.device = str(uuid4())
        self.tokens = self.auth.create_tokens_for_user('1', self.device)
        self.token = self.tokens.access_token
        self.other = self.auth.create_tokens_for_user('2', str(uuid4())).access_token
        self.ledger = MySqlRunLedger(self.pool)
        self.admission = RedisRunAdmission(self.redis, namespace=self.prefix + ':{sun-world}')
        self.worker, self.model_calls, self.reads = SyntheticWorker(self.pool), 0, 0
        self.application = self.make_application()
        self.make_host()

    def make_application(self):
        async def model(body):
            self.model_calls += 1
            return {'model': body['model'], 'stop_reason': 'end_turn', 'content': []}
        application = RunApplication(self.ledger, auth_manager=self.auth, admission=self.admission,
            worker=self.worker, registry=create_module_registry(),
            handlers={'blog.search_public': lambda *_: {'items': []}, 'blog.read_public': self.read},
            source_reader=lambda uow, principal, article_id: self.read(principal, {'article_id': article_id}),
            model_proxy=model, worker_credential=SECRET, bundle_hash='a' * 64, model_id='synthetic',
            site_origin=ORIGIN, user_ids=[1, 2], enabled=lambda: True)
        self.worker.application = application
        return application

    def make_host(self):
        self.host = FastAPI()
        self.host.include_router(create_public_run_router(self.application, allowed_origins=[ORIGIN]))
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=self.host), base_url=ORIGIN)

    def read(self, principal, arguments):
        self.reads += 1
        content, title = '明确标记为合成的公开正文。', '合成文章'
        return dict(article_id=arguments['article_id'], title=title, content=content,
            content_hash=digest({'article_id': arguments['article_id'], 'title': title, 'content': content}),
            returned_bytes=len(content.encode()), content_bytes=len(content.encode()), truncated=False)

    async def asyncTearDown(self):
        for stream in self.streams:
            if not stream.task.done():
                await stream.disconnect()
        await self.application.close()
        await self.worker.close()
        await self.client.aclose()
        self.pool.close()
        with self.admin.cursor() as cursor:
            cursor.execute(f'DROP DATABASE `{self.database}`')
        self.admin.close()
        keys = list(self.redis.scan_iter(match=self.prefix + ':*'))
        if keys:
            self.assertTrue(all(key.startswith(self.prefix + ':') for key in keys))
            self.redis.delete(*keys)

    async def request(self, method, path, *, token=None, **kwargs):
        return await self.client.request(method, BASE + path,
            headers={'origin': ORIGIN, 'cookie': 'access_token=' + (token or self.token)}, **kwargs)

    async def stream(self, *, key=None, token=None):
        key = key or str(uuid4())
        stream = BrowserStream(self.host, token or self.token, key)
        self.streams.append(stream)
        return stream, await stream.run_id(), key

    async def wait_started(self, run_id):
        async with asyncio.timeout(5):
            while run_id not in self.worker.payloads:
                await asyncio.sleep(.01)

    def row(self, run_id):
        return self.pool.fetch_one('SELECT * FROM agent_runs WHERE id=%s', (run_id,))

    def rate(self):
        return self.redis.get(self.admission._namespace + ':rate:global')

    async def test_real_identity_current_roles_account_and_server_allowlist(self):
        connection = self.redis.connection_pool.get_connection()
        try:
            self.assertEqual(1, connection.socket_connect_timeout)
            self.assertEqual(2, connection.socket_timeout)
            self.assertEqual(2, connection._sock.gettimeout())
        finally:
            self.redis.connection_pool.release(connection)
        body = {'question': '合成问题', 'idempotency_key': str(uuid4())}
        for token, status in (('invalid-jwt', 401),
                              (self.auth.create_tokens_for_user('3', str(uuid4())).access_token, 403)):
            response = await self.request('POST', '/runs/stream', token=token, json=body)
            self.assertEqual(status, response.status_code)
        self.pool.execute('UPDATE users SET status=0 WHERE id=1')
        response = await self.request('POST', '/runs/stream', json=body)
        self.assertEqual(401, response.status_code)
        self.pool.execute('UPDATE users SET status=1 WHERE id=1')
        self.pool.execute('DELETE FROM user_roles WHERE user_id=1')
        response = await self.request('POST', '/runs/stream', json=body)
        self.assertEqual(403, response.status_code)
        self.assertIsNone(self.rate())
        self.assertEqual(0, self.pool.fetch_one('SELECT COUNT(*) n FROM agent_runs')['n'])

    async def test_completed_sse_duplicate_no_charge_refresh_and_restart_get(self):
        stream, run_id, key = await self.stream()
        await stream.finish()
        row = self.row(run_id)
        self.assertEqual('completed', row['status'])
        self.assertEqual(['run.started', 'message.completed'], [event['type'] for event in stream.events()])
        self.assertEqual((2, 1), (row['tool_count'], row['model_count']))
        self.assertEqual(1, self.model_calls)
        self.assertEqual('1', self.rate())
        response = await self.request('POST', '/runs/stream', json={'question': '合成问题', 'idempotency_key': key})
        self.assertEqual((409, 'AGENT_REQUEST_EXISTS', run_id),
            (response.status_code, response.json()['code'], response.json()['data']['run_id']))
        conflict = await self.request('POST', '/runs/stream', json={'question': '不同问题', 'idempotency_key': key})
        self.assertEqual((409, 'AGENT_IDEMPOTENCY_CONFLICT'), (conflict.status_code, conflict.json()['code']))
        self.assertEqual('1', self.rate())
        replacement = self.auth.refresh_access_token(self.tokens.refresh_token)
        self.assertIsNotNone(replacement)
        self.assertTrue(self.token != replacement.access_token)
        self.token = replacement.access_token  # Same family, a different browser cookie.
        await self.application.close()
        await self.client.aclose()
        self.application = self.make_application()
        self.make_host()
        response = await self.request('GET', '/runs/' + run_id)
        self.assertEqual(200, response.status_code)
        self.assertEqual('依据合成公开文章的回答。', response.json()['data']['answer'])
        self.assertEqual(1, len(response.json()['data']['sources']))
        self.assertEqual(1, len(self.worker.payloads))
        self.assertEqual('1', self.rate())
        duplicate = await self.request('POST', '/runs/stream', json={'question': '合成问题', 'idempotency_key': key})
        self.assertEqual(409, duplicate.status_code)
        foreign = await self.request('GET', '/runs/' + run_id, token=self.other)
        self.assertEqual(404, foreign.status_code)
        wrong_family = self.auth.create_tokens_for_user('1', self.device).access_token
        hidden = await self.request('GET', '/runs/' + run_id, token=wrong_family)
        self.assertEqual((404, 'AGENT_RUN_NOT_FOUND'), (hidden.status_code, hidden.json()['code']))
        hidden = await self.request('POST', '/runs/stream', token=wrong_family,
            json={'question': '合成问题', 'idempotency_key': key})
        self.assertEqual((404, 'AGENT_RUN_NOT_FOUND'), (hidden.status_code, hidden.json()['code']))
        self.assertNotIn(run_id, hidden.text)
        self.assertEqual('1', self.rate())

    async def test_active_duplicate_global_slot_cancel_then_release(self):
        self.worker.mode = 'hold'
        stream, run_id, key = await self.stream()
        await self.wait_started(run_id)
        lease = self.application._leases[run_id]
        duplicate = await self.request('POST', '/runs/stream', json={'question': '合成问题', 'idempotency_key': key})
        self.assertEqual(409, duplicate.status_code)
        blocked = await self.request('POST', '/runs/stream', token=self.other,
            json={'question': '合成问题', 'idempotency_key': str(uuid4())})
        self.assertEqual((429, 'AGENT_RATE_LIMITED'), (blocked.status_code, blocked.json()['code']))
        self.assertTrue(1 <= int(blocked.headers['retry-after']) <= 60)
        self.assertEqual('1', self.rate())
        cancelled = await self.request('POST', '/runs/' + run_id + '/cancel', json={})
        self.assertEqual(200, cancelled.status_code)
        self.assertEqual('cancelled', cancelled.json()['data']['status'])
        await stream.finish()
        self.assertFalse(self.admission.owned(lease))
        self.assertTrue(all(status != 'running' for target, status in self.worker.cancels if target == run_id))
        self.assertEqual('1', self.rate())
        self.worker.mode = 'complete'
        following, _, _ = await self.stream(token=self.other)
        await following.finish()
        self.assertEqual('2', self.rate())

    async def test_user_and_global_minute_quotas_after_terminal_release(self):
        self.admission = RedisRunAdmission(self.redis, namespace=self.admission._namespace,
                                         user_per_minute=2, global_per_minute=3)
        self.application.admission = self.admission
        for _ in range(2):
            stream, _, _ = await self.stream()
            await stream.finish()
        blocked = await self.request('POST', '/runs/stream',
            json={'question': '合成问题', 'idempotency_key': str(uuid4())})
        self.assertEqual(429, blocked.status_code)
        stream, _, _ = await self.stream(token=self.other)
        await stream.finish()
        blocked = await self.request('POST', '/runs/stream', token=self.other,
            json={'question': '合成问题', 'idempotency_key': str(uuid4())})
        self.assertEqual(429, blocked.status_code)
        self.assertEqual('3', self.rate())
        self.assertEqual(3, self.pool.fetch_one('SELECT COUNT(*) n FROM agent_runs')['n'])

    async def test_actual_sse_disconnect_revokes_before_worker_stop_and_releases(self):
        self.worker.mode = 'hold'
        stream, run_id, _ = await self.stream()
        await self.wait_started(run_id)
        lease = self.application._leases[run_id]
        await stream.disconnect()
        row = self.row(run_id)
        self.assertEqual('cancelled', row['status'])
        with self.assertRaises(LedgerError):
            await asyncio.to_thread(self.application.gateway.heartbeat,
                                    self.worker.call(self.worker.payloads[run_id], 'result'))
        self.assertTrue(self.worker.cancels)
        self.assertTrue(all(status == 'cancelled' for target, status in self.worker.cancels if target == run_id))
        self.assertFalse(self.admission.owned(lease))
        self.assertEqual('1', self.rate())
        self.assertTrue(self.redis.exists(lease.keys[1]))
        self.assertEqual(1, self.pool.fetch_one('SELECT COUNT(*) n FROM ai_messages')['n'])

    async def test_real_redis_revocation_and_missing_admission_key_stop_authority(self):
        self.worker.mode = 'hold'
        stream, run_id, _ = await self.stream()
        await self.wait_started(run_id)
        lease = self.application._leases[run_id]
        self.redis.delete(lease.keys[4])
        with self.assertRaises(LedgerError):
            await asyncio.to_thread(self.application.gateway.tool,
                self.worker.call(self.worker.payloads[run_id], 'tool'), call_id='lost-slot',
                tool_id='blog.read_public', tool_version='1', arguments={'article_id': 1})
        self.assertEqual(0, self.reads)
        self.assertEqual(0, self.row(run_id)['tool_count'])
        self.session_store.hdelete('user:1:access_tokens', self.device)
        denied = await self.request('GET', '/runs/' + run_id)
        self.assertEqual(401, denied.status_code)
        await stream.finish()
        self.assertIn(self.row(run_id)['status'], {'cancelled', 'interrupted'})
        self.assertFalse(self.admission.owned(lease))
        self.assertEqual(1, self.pool.fetch_one('SELECT COUNT(*) n FROM ai_messages')['n'])

    async def test_unknown_accept_commit_ack_holds_slot_and_does_not_replay(self):
        key, original = str(uuid4()), self.ledger.accept
        def lost_ack(*args, **kwargs):
            original(*args, **kwargs)  # Real transaction committed, ACK is injected as lost.
            raise OSError('Synthetic private SQL acknowledgement diagnostic')
        with patch.object(self.ledger, 'accept', lost_ack):
            response = await self.request('POST', '/runs/stream',
                json={'question': '合成问题', 'idempotency_key': key})
        self.assertEqual(503, response.status_code)
        self.assertNotIn('diagnostic', response.text)
        row = self.pool.fetch_one('SELECT * FROM agent_runs')
        self.assertEqual('accepted', row['status'])
        self.assertEqual(0, len(self.worker.payloads))
        self.assertEqual('1', self.rate())
        keys = self.admission._keys(1, key)
        self.assertEqual(3, self.redis.exists(keys[1], keys[4], keys[5]))
        duplicate = await self.request('POST', '/runs/stream',
            json={'question': '合成问题', 'idempotency_key': key})
        self.assertEqual(409, duplicate.status_code)
        self.assertEqual(row['id'], duplicate.json()['data']['run_id'])
        self.assertEqual('1', self.rate())
        recovered = await self.request('GET', '/runs/' + row['id'])
        self.assertEqual((200, 'accepted'), (recovered.status_code, recovered.json()['data']['status']))

    async def test_nonquiescent_worker_does_not_release_concurrency_early(self):
        self.worker.mode, self.worker.quiescent = 'hold', False
        stream, run_id, _ = await self.stream()
        await self.wait_started(run_id)
        lease = self.application._leases[run_id]
        response = await self.request('POST', '/runs/' + run_id + '/cancel', json={})
        self.assertEqual(200, response.status_code)
        self.assertEqual('cancelled', self.row(run_id)['status'])
        self.assertTrue(self.admission.owned(lease))
        await stream.finish()  # Settle times out; it must retain Redis occupancy.
        self.assertTrue(self.admission.owned(lease))
        blocked = await self.request('POST', '/runs/stream', token=self.other,
            json={'question': '合成问题', 'idempotency_key': str(uuid4())})
        self.assertEqual(429, blocked.status_code)

    async def test_close_drains_unclaimed_execute_read_then_cancels_and_releases(self):
        entered, release, gate = threading.Event(), threading.Event(), threading.Lock()
        original = self.ledger.get_owned
        def paused_first_read(*args, **kwargs):
            with gate:
                first = not entered.is_set()
                if first:
                    entered.set()
            if first and not release.wait(5):
                raise RuntimeError('Synthetic execute read fence timed out')
            return original(*args, **kwargs)
        close_task = None
        with patch.object(self.ledger, 'get_owned', paused_first_read):
            try:
                accepted = await self.application.start(self.token, question='合成问题', idempotency_key=str(uuid4()))
                run_id = accepted.run_id  # Admission already returned successfully.
                lease = self.application._leases[run_id]
                job = self.application._jobs[run_id]
                self.assertTrue(await asyncio.to_thread(entered.wait, 2))
                self.assertEqual('accepted', self.row(run_id)['status'])
                self.assertIsNone(self.row(run_id)['execution_id'])
                self.assertTrue(self.admission.owned(lease))
                close_task = asyncio.create_task(self.application.close())
                async with asyncio.timeout(2):
                    while not job.cancelling():
                        await asyncio.sleep(.01)
                self.assertFalse(close_task.done())
                self.assertEqual(0, len(self.worker.payloads))
            finally:
                release.set()
                if close_task is not None:
                    await asyncio.wait_for(asyncio.shield(close_task), 8)
        row = self.row(run_id)
        self.assertEqual('cancelled', row['status'])
        self.assertIsNone(row['execution_id'])
        self.assertEqual('AGENT_RUN_CANCELLED', row['error_code'])
        self.assertEqual('1', self.rate())
        self.assertEqual('1', self.redis.get(lease.keys[2]))
        self.assertTrue(self.redis.exists(lease.keys[1]))
        self.assertEqual(0, self.redis.exists(lease.keys[4], lease.keys[5]))
        self.assertFalse(self.admission.owned(lease))
        self.assertEqual(0, len(self.worker.payloads))
        self.assertEqual(0, len(self.application._jobs))
        self.assertEqual(0, len(self.application._leases))
        self.assertEqual(0, len(self.application.sessions._bindings))
        self.assertEqual(0, len(self.application.dispatcher._slots))
        self.assertEqual(1, self.pool.fetch_one('SELECT COUNT(*) n FROM ai_messages')['n'])

    async def test_locked_projection_and_completion_have_consistent_mysql_history(self):
        self.worker.mode = 'hold'
        accepted = await self.application.start(self.token, question='合成问题', idempotency_key=str(uuid4()))
        run_id = accepted.run_id
        await self.wait_started(run_id)
        payload = self.worker.payloads[run_id]
        result = self.worker.call(payload, 'result')
        await asyncio.to_thread(self.application.gateway.bind_root_turn, result,
                                'native-root-turn', root_request_id='native-root-request')
        entered, release, connection_ready = threading.Event(), threading.Event(), threading.Event()
        local, connection_id, lengths = threading.local(), [], []
        original_read, original_uow = self.ledger.history.read, self.pool.unit_of_work
        def paused_read(*args, **kwargs):
            entered.set()
            if not release.wait(3):
                raise RuntimeError('Synthetic projection fence timed out')
            messages = original_read(*args, **kwargs)
            lengths.append(len(messages))
            return messages
        @contextlib.contextmanager
        def observed_uow(*args, **kwargs):
            with original_uow(*args, **kwargs) as uow:
                if getattr(local, 'finishing', False):
                    connection_id.append(uow.fetch_one('SELECT CONNECTION_ID() AS id')['id'])
                    connection_ready.set()
                yield uow
        def finish():
            local.finishing = True
            return self.application.gateway.finish(result, root_session_id=payload['root_session_id'],
                root_turn_id='native-root-turn', root_request_id='native-root-request', answer='合成回答', source_ids=[])
        def lock_state():
            with self.admin.cursor() as cursor:
                cursor.execute('SELECT trx_state FROM information_schema.innodb_trx WHERE trx_mysql_thread_id=%s',
                               (connection_id[0],))
                row = cursor.fetchone()
                return row[0] if row else None
        view_task, finish_task = None, None
        with patch.object(self.ledger.history, 'read', paused_read), patch.object(self.pool, 'unit_of_work', observed_uow):
            try:
                view_task = asyncio.create_task(self.application.view(self.token, run_id))
                self.assertTrue(await asyncio.to_thread(entered.wait, 2))
                finish_task = asyncio.create_task(asyncio.to_thread(finish))
                self.assertTrue(await asyncio.to_thread(connection_ready.wait, 1))
                async with asyncio.timeout(1):
                    while await asyncio.to_thread(lock_state) != 'LOCK WAIT':
                        await asyncio.sleep(.01)
                self.assertFalse(finish_task.done())
            finally:
                release.set()
                tasks = [task for task in (view_task, finish_task) if task is not None]
                results = await asyncio.gather(*tasks, return_exceptions=True)
        for result_value in results:
            if isinstance(result_value, BaseException):
                raise result_value
        self.assertEqual('running', results[0]['status'])
        self.assertEqual([1], lengths)
        self.assertTrue(results[1])
        self.worker.states[run_id] = 'completed'
        self.worker.tasks[run_id].cancel()
        await asyncio.gather(self.worker.tasks[run_id], return_exceptions=True)
        recovered = await self.application.view(self.token, run_id)
        self.assertEqual('completed', recovered['status'])
        self.assertEqual(2, self.pool.fetch_one('SELECT COUNT(*) n FROM ai_messages')['n'])


if __name__ == '__main__':
    unittest.main()
