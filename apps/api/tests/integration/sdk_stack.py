"""Explicit real SDK/MySQL/Redis/MongoDB/mTLS suite, with synthetic model data.

Only scripts/test-agent-sdk-stack.py may supply the owned-server attestations.
Not collected by the default unit gate; no business config or real provider.
"""

import asyncio
from contextlib import contextmanager
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import secrets
import shutil
import signal
import socket
import ssl
import stat
import subprocess
import sys
import tempfile
import time
from uuid import UUID, uuid4

import httpx
import pymysql
import uvicorn
from fastapi import FastAPI
from uvicorn.protocols.http.h11_impl import H11Protocol

ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT / 'apps/api'))
sys.path.insert(0, str(ROOT / 'apps/api/tests/integration'))
from test_agent_stack import AgentStackTests, OwnedSessionRedis
from test_agent_mysql import SocketManager
from src.controller.auth_manager import AuthManager
from src.controller.user_manage import UserManager
from src.database.mongo.mongodb_manage import MongoDBManager
from src.database.mysql.schema_migration import MYSQL_SCHEMA, build_create_table_sql
from src.module_composition import create_blog_qa_application
from src.modules.agent_runtime.private_router import create_private_run_router
from src.modules.agent_runtime.public_router import create_public_run_router
from src.modules.agent_runtime.worker_transport import WorkerHttpTransport

PROTOCOL = 'sun-world-sdk-stack-fixture/1'
MODEL = 'sdk-stack-synthetic-model'
QUESTION = '合成问题：文章怎样说明后端权限？'
ANSWER = '合成文章说明：界面可见性不能代替后端权限检查。'
CONTENT = '合成公开正文：权限需要在后端检查，界面可见性不能代替授权。'


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class PeerProtocol(H11Protocol):
    """Test-only transport attestation, taken from verified SSL, never headers."""
    def connection_made(self, transport):
        super().connection_made(transport)
        connection = transport.get_extra_info('ssl_object')
        peer = connection.getpeercert(binary_form=True) if connection else None
        verified = connection and connection.context.verify_mode == ssl.CERT_REQUIRED and peer
        fingerprint = hashlib.sha256(peer).hexdigest() if verified else None
        original = self.app

        async def attested(scope, receive, send):
            scope = {**scope, 'sunworld.test.tls_peer_sha256': fingerprint}
            await original(scope, receive, send)
        self.app = attested


class TestServer(uvicorn.Server):
    @contextmanager
    def capture_signals(self):
        # The single async suite owns cancellation and all child teardown.
        yield


class Host:
    def __init__(self):
        self.target = None
        self.private_paths = []

    async def __call__(self, scope, receive, send):
        if self.target is None:
            await send({'type': 'http.response.start', 'status': 503, 'headers': []})
            await send({'type': 'http.response.body', 'body': b''})
            return
        if scope['path'].startswith('/internal/agent/v2/'):
            self.private_paths.append(scope['path'].rsplit('/', 1)[-1])
        await self.target(scope, receive, send)


class ContentMongo(MongoDBManager):
    """Use the real repository adapter with an attested, bounded MongoClient."""
    def __init__(self, database):
        self.db = database

    def connect(self):
        raise RuntimeError('Owned Mongo fixture must never connect elsewhere')


class Stream:
    def __init__(self, fixture, *, key=None):
        self.fixture = fixture
        self.key, self.events = key or str(uuid4()), []
        self.started = asyncio.get_running_loop().create_future()
        self.task = asyncio.create_task(self.consume())
        fixture.streams.append(self)

    async def consume(self):
        async with self.fixture.client.stream('POST', '/ai/v1/blog-qa/runs/stream',
                json={'question': QUESTION, 'idempotency_key': self.key},
                headers=self.fixture.headers()) as response:
            assert response.status_code == 200, 'SSE request was not accepted'
            async for line in response.aiter_lines():
                if not line.startswith('data: '):
                    continue
                event = json.loads(line[6:])
                self.events.append(event)
                if event['type'] == 'run.started' and not self.started.done():
                    self.started.set_result(event['data']['run_id'])

    async def run_id(self):
        return await asyncio.wait_for(asyncio.shield(self.started), 8)

    async def finish(self):
        await asyncio.wait_for(asyncio.shield(self.task), 25)

    async def disconnect(self):
        self.task.cancel()
        await asyncio.gather(self.task, return_exceptions=True)


class Fixture:
    def __init__(self, mode):
        self.mode = mode
        self.root = Path(tempfile.mkdtemp(prefix='sun-world-sdk-stack-', dir='/private/tmp')).resolve()
        self.root.chmod(0o700)
        self.streams, self.model_requests, self.model_steps = [], [], 0
        self.model_started, self.model_cancelled = asyncio.Event(), asyncio.Event()
        self.worker = self.server = self.server_task = self.application = self.client = None
        self.listener = None
        self.pool = self.admin = self.mongo = self.worker_process = None
        self.worker_stopped = None
        self.expected_worker_crash = False
        self.reaped_groups = []
        self.database = 'sunworld_sdk_' + uuid4().hex
        self.namespace = 'agent:sdk:' + uuid4().hex + ':{sun-world}'
        self.gateway_secret, self.worker_secret = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
        self.host = Host()

    async def start(self):
        self.mongo = load('sdk_stack_mongo', ROOT / 'scripts/test-agent-mongo.py').verified_client(os.environ)
        self.admin = pymysql.connect(unix_socket=AgentStackTests.socket, user='root', password='', autocommit=True)
        with self.admin.cursor() as cursor:
            cursor.execute(f'CREATE DATABASE `{self.database}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci')
            cursor.execute(f'USE `{self.database}`')
            for name, definition in MYSQL_SCHEMA.items():
                cursor.execute(build_create_table_sql(name, definition))
        self.pool = SocketManager(AgentStackTests.socket, self.database, pool_size=4)
        self.pool.execute("INSERT INTO users(id,name,email,password,status) VALUES"
            "(1,'synthetic','sdk@example.invalid','synthetic-unused',1)")
        self.pool.execute("INSERT INTO roles(id,name,code) VALUES(1,'synthetic-admin','admin')")
        self.pool.execute('INSERT INTO user_roles(user_id,role_id) VALUES(1,1)')
        self.pool.execute("INSERT INTO blog(id,title,author,abstract) VALUES(1,'权限检查','synthetic','合成公开文章：后端权限')")
        self.mongo[self.database].blogs.insert_one({'blogId': 1, 'content': CONTENT})
        self.session_store = OwnedSessionRedis(AgentStackTests.redis, self.namespace + ':auth')
        self.auth = AuthManager(UserManager(self.pool), self.session_store,
            secret_key=secrets.token_urlsafe(32), refresh_reuse_grace_seconds=0)
        self.device = str(uuid4())
        self.tokens = self.auth.create_tokens_for_user('1', self.device)
        self.token = self.tokens.access_token
        self.runtime = Path(os.environ['SUN_WORLD_AGENT_SDK_RUNTIME']).resolve(strict=True)
        self.node = Path(os.environ['SUN_WORLD_AGENT_SDK_NODE']).resolve(strict=True)
        self.bundle_hash = json.loads((self.runtime / 'tool-catalog.json').read_text())['bundle_hash']
        assert self.bundle_hash == json.loads((ROOT / 'packages/contracts/agent/tool-catalog.json').read_text())['bundle_hash']
        self.key, self.cert = self.root / 'key.pem', self.root / 'cert.pem'
        config = self.root / 'openssl.cnf'
        config.write_text('[req]\nprompt=no\ndistinguished_name=dn\nx509_extensions=extensions\n'
            '[dn]\nCN=localhost\n[extensions]\nsubjectAltName=DNS:localhost,IP:127.0.0.1\n'
            'basicConstraints=critical,CA:TRUE\nkeyUsage=critical,digitalSignature,keyEncipherment,keyCertSign\n')
        await asyncio.to_thread(subprocess.run, ['/usr/bin/openssl', 'req', '-x509', '-newkey', 'rsa:2048',
            '-nodes', '-days', '1', '-config', str(config), '-keyout', str(self.key), '-out', str(self.cert)],
            check=True, timeout=10, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        self.key.chmod(0o600)
        self.cert.chmod(0o600)
        self.peer = hashlib.sha256(ssl.PEM_cert_to_DER_cert(self.cert.read_text())).hexdigest()
        self.tls = ssl.create_default_context(cafile=str(self.cert))
        self.tls.load_cert_chain(str(self.cert), str(self.key))
        self.listener = listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        listener.bind(('127.0.0.1', 0))
        listener.listen(32)
        listener.setblocking(False)
        self.origin = f'https://localhost:{listener.getsockname()[1]}'
        settings = uvicorn.Config(self.host, host='127.0.0.1', port=0, http=PeerProtocol,
            ssl_keyfile=str(self.key), ssl_certfile=str(self.cert), ssl_ca_certs=str(self.cert),
            ssl_cert_reqs=ssl.CERT_REQUIRED, lifespan='off', access_log=False, log_level='warning',
            proxy_headers=False, limit_concurrency=32, timeout_keep_alive=1, timeout_graceful_shutdown=3)
        self.server = TestServer(settings)
        self.server_task = asyncio.create_task(self.server.serve(sockets=[listener]))
        async with asyncio.timeout(5):
            while not self.server.started:
                if self.server_task.done():
                    await self.server_task
                    raise RuntimeError('Owned TLS host did not start')
                await asyncio.sleep(.01)
        self.worker_process = await asyncio.create_subprocess_exec(str(self.node),
            str(ROOT / 'apps/agent-worker/tests/integration/stack-worker.mjs'),
            stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL,
            env={'PATH': str(self.node.parent) + ':/usr/bin:/bin', 'HOME': str(Path.home()),
                 'TMPDIR': str(self.root), 'LC_ALL': 'C', 'TZ': 'UTC'})
        specification = dict(protocol=PROTOCOL, runtime_directory=str(self.runtime),
            workspace_root=str(self.root / 'workspaces'), journal_directory=str(self.root / 'journal'),
            gateway_origin=self.origin, model_id=MODEL, gateway_credential=self.gateway_secret,
            worker_credential=self.worker_secret, tls=dict(key=str(self.key), cert=str(self.cert), ca=str(self.cert)),
            read_paths=[str(self.runtime), str(self.node.parent.parent)])
        self.worker_process.stdin.write(json.dumps(specification).encode() + b'\n')
        await self.worker_process.stdin.drain()
        ready = await self.worker_line()
        assert ready['event'] == 'ready' and ready['bundle_hash'] == self.bundle_hash and ready['model_id'] == MODEL
        self.worker = WorkerHttpTransport(ready['origin'], service_credential=self.worker_secret, tls_context=self.tls)
        self.rebuild_application()
        self.client = httpx.AsyncClient(base_url=self.origin, verify=self.tls, trust_env=False,
            timeout=httpx.Timeout(30, connect=2), follow_redirects=False)
        # A spoofed peer header without a TLS client certificate cannot reach
        # either public or private routing on this test-only protected host.
        no_cert = ssl.create_default_context(cafile=str(self.cert))
        async with httpx.AsyncClient(verify=no_cert, trust_env=False, timeout=2) as denied:
            try:
                await denied.post(self.origin + '/internal/agent/v2/runs/' + str(uuid4()) + '/heartbeat',
                    headers={'x-test-peer': self.peer}, json={})
            except httpx.HTTPError:
                pass
            else:
                raise AssertionError('Missing TLS client certificate was accepted')
        assert await self.worker.probe(bundle_hash=self.bundle_hash, model_id=MODEL)

    async def worker_line(self):
        async with asyncio.timeout(30):
            line = await self.worker_process.stdout.readline()
        assert line and len(line) <= 16384, 'Invalid Worker fixture response'
        return json.loads(line)

    def rebuild_application(self):
        self.application = create_blog_qa_application(self.pool, ContentMongo(self.mongo[self.database]),
            auth_manager=self.auth, redis_client=AgentStackTests.redis, worker=self.worker,
            model_proxy=self.model, worker_credential=self.gateway_secret, bundle_hash=self.bundle_hash,
            model_id=MODEL, site_origin=self.origin, user_ids=[1], enabled=lambda: True,
            admission_namespace=self.namespace)
        host = FastAPI()
        host.include_router(create_public_run_router(self.application, allowed_origins=[self.origin]))
        host.include_router(create_private_run_router(self.application.gateway,
            verify_peer=lambda request: request.scope.get('sunworld.test.tls_peer_sha256') == self.peer))
        self.host.target = host

    def headers(self):
        return {'origin': self.origin, 'cookie': 'access_token=' + self.token}

    def row(self, run_id):
        return self.pool.fetch_one('SELECT * FROM agent_runs WHERE id=%s', (run_id,))

    async def request(self, method, path, **kwargs):
        return await self.client.request(method, '/ai/v1/blog-qa' + path, headers=self.headers(), **kwargs)

    async def model(self, body):
        self.model_steps += 1
        self.model_requests.append(body)
        assert sorted(tool['name'] for tool in body['tools']) == ['blog_read_public', 'blog_search_public']
        assert body['model'] == MODEL and body['max_tokens'] == 1024 and body['stream'] is False
        if self.mode == 'hold':
            self.model_started.set()
            try:
                await asyncio.Event().wait()
            finally:
                self.model_cancelled.set()
        assert self.model_steps <= 3, 'Unexpected hidden SDK model request'
        if self.model_steps == 1:
            content = [dict(type='tool_use', id='search-1', name='blog_search_public', input={'query': '权限'})]
        elif self.model_steps == 2:
            content = [dict(type='tool_use', id='read-1', name='blog_read_public', input={'article_id': 1})]
        else:
            # Obtain the UUID from what the actual SDK sent back as a delivered
            # tool result, never invent it or read it straight from the ledger.
            sources = []
            def visit(value):
                if isinstance(value, dict):
                    if value.get('article_id') == 1 and value.get('content') == CONTENT and value.get('source_id'):
                        source = value['source_id']
                        assert str(UUID(source)) == source
                        sources.append(source)
                    for item in value.values():
                        visit(item)
                elif isinstance(value, list):
                    for item in value:
                        visit(item)
                elif isinstance(value, str) and value.startswith(('{', '[')):
                    try:
                        parsed = json.loads(value)
                    except ValueError:
                        return
                    visit(parsed)
            visit(body['messages'])
            assert len(sources) == 1, 'SDK did not receive one verified article source'
            if self.mode == 'withdraw':
                await asyncio.to_thread(self.pool.execute, 'UPDATE blog SET is_deleted=1 WHERE id=1')
            content = [dict(type='text', text=json.dumps({'answer': ANSWER, 'sourceIds': sources}, ensure_ascii=False))]
        return dict(id='sdk-stack-' + str(self.model_steps), type='message', role='assistant', model=MODEL,
            content=content, stop_reason='end_turn' if self.model_steps == 3 else 'tool_use',
            stop_sequence=None, usage={'input_tokens': 20, 'output_tokens': 20})

    async def settled(self, run_id, *, terminal=None):
        async with asyncio.timeout(10):
            while True:
                row = await asyncio.to_thread(self.row, run_id)
                if (row['status'] in {'completed', 'cancelled', 'interrupted', 'failed'}
                        and not AgentStackTests.redis.exists(self.namespace + ':slot:user:1')
                        and run_id not in self.application._jobs):
                    break
                await asyncio.sleep(.05)
        if terminal is not None:
            assert row['status'] == terminal, 'Unexpected durable terminal state'
        binding = self.application.dispatcher._binding(row)
        observation = await self.worker.inspect(binding)
        assert observation['status'] in {'completed', 'cancelled', 'failed'}, 'Worker is not quiescent'
        assert not list((self.root / 'workspaces').glob('run-*')), 'SDK workspace was retained'
        return row

    def recorded_groups(self):
        path = self.root / 'workspaces/fixture-processes.jsonl'
        if not path.exists():
            if self.worker is not None:
                raise RuntimeError('Missing owned SDK process record')
            return []
        info = path.lstat()
        if (not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid()
                or stat.S_IMODE(info.st_mode) != 0o600 or info.st_nlink != 1 or info.st_size > 8192
                or path.parent.is_symlink() or path.parent.resolve() != self.root / 'workspaces'):
            raise RuntimeError('Unsafe owned SDK process record')
        groups = []
        for line in path.read_text().splitlines():
            item = json.loads(line)
            if (set(item) != {'pid'} or type(item['pid']) is not int or item['pid'] <= 1
                    or item['pid'] in {os.getpid(), os.getpgrp(), self.worker_process.pid}
                    or item['pid'] in groups or len(groups) >= 128):
                raise RuntimeError('Invalid owned SDK process identity')
            groups.append(item['pid'])
        return groups

    def reap_recorded_groups(self):
        # Only after the trusted Worker parent is dead: it cannot add another
        # execution after we read its owned, fsynced bootstrap PID journal.
        if self.worker_process.returncode is None:
            raise RuntimeError('Worker parent is still alive')
        groups = self.recorded_groups()
        for pid in groups:
            def alive():
                try:
                    os.killpg(pid, 0)
                    return True
                except ProcessLookupError:
                    return False
            if not alive():
                continue
            self.reaped_groups.append(pid)
            try:
                os.killpg(pid, signal.SIGTERM)
                # A deliberately stopped SDK must run its TERM cleanup rather
                # than remaining frozen with an undeliverable pending signal.
                os.killpg(pid, signal.SIGCONT)
            except ProcessLookupError:
                pass
            deadline = time.monotonic() + 2
            while alive() and time.monotonic() < deadline:
                time.sleep(.02)
            if alive():
                try:
                    os.killpg(pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                deadline = time.monotonic() + 3
                while alive() and time.monotonic() < deadline:
                    time.sleep(.02)
            if alive():
                raise RuntimeError('Owned SDK process group remains after KILL')
        return groups

    async def close(self):
        errors = []
        async def attempt(action):
            try:
                return await action()
            except BaseException as error:
                errors.append(error)
        for stream in self.streams:
            if not stream.task.done():
                await attempt(stream.disconnect)
        if self.application:
            await attempt(self.application.close)
        if self.client:
            await attempt(self.client.aclose)
        if self.worker_process:
            process = self.worker_process
            try:
                if process.returncode is None:
                    try:
                        process.stdin.write(b'{"command":"stop"}\n')
                        await process.stdin.drain()
                    except (BrokenPipeError, ConnectionResetError):
                        pass  # It may already be closing from a forwarded TERM.
                if not self.expected_worker_crash:
                    self.worker_stopped = await self.worker_line()
                    assert self.worker_stopped['event'] == 'stopped'
                async with asyncio.timeout(10):
                    await process.wait()
                assert process.returncode == (-(signal.SIGKILL) if self.expected_worker_crash else 0), 'Unexpected Worker exit'
            except BaseException as error:
                errors.append(error)
                if process.returncode is None:
                    process.terminate()
                    try:
                        async with asyncio.timeout(20):
                            await process.wait()
                    except TimeoutError:
                        process.kill()
                        await process.wait()
            groups = await attempt(lambda: asyncio.to_thread(self.reap_recorded_groups))
            if self.worker_stopped and groups is not None:
                if (not self.worker_stopped['run_directories_empty'] or not self.worker_stopped['journal_clean']
                        or self.worker_stopped['start_count'] != len(groups)
                        or self.worker_stopped['process_group_ids'] != groups or self.reaped_groups):
                    errors.append(RuntimeError('Worker cleanup observation mismatch'))
        if self.server:
            self.server.should_exit = True
            async def stop_server():
                try:
                    async with asyncio.timeout(8):
                        await asyncio.shield(self.server_task)
                finally:
                    if not self.server_task.done():
                        self.server_task.cancel()
                        await asyncio.gather(self.server_task, return_exceptions=True)
            await attempt(stop_server)
        if self.listener:
            await attempt(lambda: asyncio.to_thread(self.listener.close))
        if self.pool:
            await attempt(lambda: asyncio.to_thread(self.pool.close))
        if self.admin:
            def drop_mysql():
                try:
                    with self.admin.cursor() as cursor:
                        cursor.execute(f'DROP DATABASE IF EXISTS `{self.database}`')
                finally:
                    self.admin.close()
            await attempt(lambda: asyncio.to_thread(drop_mysql))
        if self.mongo:
            def drop_mongo():
                try:
                    self.mongo.drop_database(self.database)
                finally:
                    self.mongo.close()
            await attempt(lambda: asyncio.to_thread(drop_mongo))
        def drop_redis():
            keys = list(AgentStackTests.redis.scan_iter(match=self.namespace + '*'))
            if keys:
                assert all(key.startswith(self.namespace) for key in keys)
                AgentStackTests.redis.delete(*keys)
        await attempt(lambda: asyncio.to_thread(drop_redis))
        if errors:
            # Keep the owned evidence if process teardown is uncertain.
            raise RuntimeError('SDK stack cleanup is unconfirmed') from errors[0]
        shutil.rmtree(self.root)


async def success(fixture):
    stream = Stream(fixture)
    run_id = await stream.run_id()
    await stream.finish()
    row = await fixture.settled(run_id, terminal='completed')
    assert [event['type'] for event in stream.events] == ['run.started', 'message.completed']
    assert row['model_count'] == 3 and row['tool_count'] == 2
    assert row['root_session_id'] == 'blog-qa-' + run_id and row['root_turn_id'] and row['root_request_id']
    assert fixture.pool.fetch_one('SELECT COUNT(*) n FROM ai_messages')['n'] == 2
    assert fixture.pool.fetch_one('SELECT COUNT(*) n FROM agent_sources WHERE delivered=1')['n'] == 1
    duplicate = await fixture.request('POST', '/runs/stream', json={'question': QUESTION, 'idempotency_key': stream.key})
    assert duplicate.status_code == 409 and duplicate.json()['data']['run_id'] == run_id
    assert AgentStackTests.redis.get(fixture.namespace + ':rate:global') == '1'
    assert fixture.model_steps == 3
    replacement = fixture.auth.refresh_access_token(fixture.tokens.refresh_token)
    assert replacement and replacement.access_token != fixture.token
    fixture.token = replacement.access_token
    await fixture.application.close()
    fixture.rebuild_application()
    recovered = await fixture.request('GET', '/runs/' + run_id)
    assert recovered.status_code == 200 and recovered.json()['data']['answer'] == ANSWER
    assert recovered.json()['data']['sources'][0]['url'] == fixture.origin + '/blog/1'
    # Real Mongo content changes invalidate recovered citations too.
    fixture.mongo[fixture.database].blogs.update_one({'blogId': 1}, {'$set': {'content': CONTENT + '正文已变'}})
    changed = await fixture.request('GET', '/runs/' + run_id)
    assert changed.json()['data']['sources'] == [] and changed.json()['data']['answer'] == ANSWER
    assert {'root', 'heartbeat', 'blog.search_public', 'blog.read_public', 'receipts', 'messages', 'result'} <= set(fixture.host.private_paths)


async def cancel(fixture, *, disconnect=False, revoke=False):
    stream = Stream(fixture)
    run_id = await stream.run_id()
    await asyncio.wait_for(fixture.model_started.wait(), 15)
    if revoke:
        fixture.session_store.hdelete('user:1:access_tokens', fixture.device)
    elif disconnect:
        await stream.disconnect()
    else:
        response = await fixture.request('POST', '/runs/' + run_id + '/cancel', json={})
        assert response.status_code == 200 and response.json()['data']['status'] == 'cancelled'
    if not disconnect:
        await stream.finish()
        assert stream.events[-1]['type'] == 'run.failed'
    row = await fixture.settled(run_id)
    assert row['status'] in {'cancelled', 'interrupted'} and row['result_hash'] is None
    assert row['model_count'] == 1 and row['tool_count'] == 0
    assert fixture.pool.fetch_one('SELECT COUNT(*) n FROM ai_messages')['n'] == 1
    await asyncio.wait_for(fixture.model_cancelled.wait(), 3)
    if revoke:
        denied = await fixture.request('GET', '/runs/' + run_id)
        assert denied.status_code == 401


async def withdraw(fixture):
    stream = Stream(fixture)
    run_id = await stream.run_id()
    await stream.finish()
    row = await fixture.settled(run_id)
    assert row['status'] in {'failed', 'interrupted', 'cancelled'} and row['result_hash'] is None
    assert [event['type'] for event in stream.events] == ['run.started', 'run.failed']
    assert row['model_count'] == 3 and row['tool_count'] == 2
    assert fixture.pool.fetch_one('SELECT COUNT(*) n FROM agent_sources WHERE delivered=1')['n'] == 1
    assert fixture.pool.fetch_one('SELECT COUNT(*) n FROM ai_messages')['n'] == 1


async def crash(fixture):
    stream = Stream(fixture)
    run_id = await stream.run_id()
    await asyncio.wait_for(fixture.model_started.wait(), 15)
    groups = fixture.recorded_groups()
    assert len(groups) == 1
    # Hold the actual SDK so it cannot self-exit after the API interrupts the
    # run; the Python parent's PID-journal fallback must reclaim this orphan.
    os.killpg(groups[0], signal.SIGSTOP)
    fixture.expected_worker_crash = True
    fixture.worker_process.kill()
    await fixture.worker_process.wait()
    await stream.finish()
    row = await asyncio.to_thread(fixture.row, run_id)
    assert row['status'] in {'cancelled', 'interrupted'} and row['result_hash'] is None
    assert fixture.pool.fetch_one('SELECT COUNT(*) n FROM ai_messages')['n'] == 1
    assert AgentStackTests.redis.exists(fixture.namespace + ':slot:user:1'), 'Unconfirmed Worker stop released quota'
    assert fixture.worker_stopped is None


async def main():
    task = asyncio.current_task()
    loop = asyncio.get_running_loop()
    for signum in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(signum, task.cancel)
    AgentStackTests.setUpClass()
    try:
        if sys.argv[1:] not in ([], ['--interrupt-probe']):
            raise ValueError('Unknown explicit integration option')
        if sys.argv[1:] == ['--interrupt-probe']:
            fixture = Fixture('hold')
            try:
                await fixture.start()
                stream = Stream(fixture)
                await stream.run_id()
                await asyncio.wait_for(fixture.model_started.wait(), 15)
                print(json.dumps(dict(event='interrupt_probe_ready', sdk_root=str(fixture.root),
                    worker_pid=fixture.worker_process.pid, sdk_group_ids=fixture.recorded_groups(),
                    database_roots=[os.environ['SUN_WORLD_AGENT_' + kind + '_ROOT']
                                    for kind in ('MYSQL', 'REDIS', 'MONGO')])), flush=True)
                await asyncio.Event().wait()
            finally:
                from src.modules.agent_runtime.cleanup import finish_cleanup
                await finish_cleanup(fixture.close())
            return
        for label, mode, action in [('success/recovery', 'complete', success),
                ('explicit cancel', 'hold', cancel),
                ('browser TLS disconnect', 'hold', lambda fixture: cancel(fixture, disconnect=True)),
                ('live Redis session revoke', 'hold', lambda fixture: cancel(fixture, revoke=True)),
                ('withdraw before final commit', 'withdraw', withdraw),
                ('Worker crash with stopped SDK group', 'hold', crash)]:
            fixture = Fixture(mode)
            try:
                await fixture.start()
                await action(fixture)
            finally:
                # finish_cleanup shields only teardown, not a failed assertion.
                from src.modules.agent_runtime.cleanup import finish_cleanup
                await finish_cleanup(fixture.close())
            if fixture.expected_worker_crash:
                assert len(fixture.reaped_groups) == 1 and fixture.worker_stopped is None
            else:
                assert fixture.worker_stopped['start_count'] == 1
            print('SDK stack passed: ' + label, flush=True)
        print('Real fixed SDK + real MySQL/Redis/MongoDB + two-way mTLS: 6 scenarios passed.', flush=True)
        print('Model/article data are synthetic; macOS sandbox only, no Linux or real-model acceptance.', flush=True)
    finally:
        AgentStackTests.tearDownClass()
        for signum in (signal.SIGINT, signal.SIGTERM):
            loop.remove_signal_handler(signum)


if __name__ == '__main__':
    try:
        asyncio.run(main())
    except (KeyboardInterrupt, asyncio.CancelledError):
        print('SDK stack interrupted; owned fixture teardown drained.', file=sys.stderr)
        sys.exit(130)
    except BaseException as error:
        print('SDK stack failed (' + type(error).__name__ + '); no business configuration was loaded.', file=sys.stderr)
        sys.exit(1)
