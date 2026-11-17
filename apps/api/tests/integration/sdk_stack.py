"""Explicit real SDK/MySQL/Redis/MongoDB/mTLS suite with fixed synthetic data.

Only scripts/test-agent-sdk-stack.py may supply the owned-server attestations.
Default responses are synthetic; real mode selects an explicit maintained profile.
Not collected by the default unit gate; no business database/configuration discovery.
"""

import argparse
import asyncio
from contextlib import contextmanager
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import secrets
import signal
import socket
import ssl
import subprocess
import sys
import tempfile
import time
from uuid import UUID, uuid4
from unittest.mock import patch

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
from cleanup_diagnostics import CleanupDiagnostics
from fixture_cleanup import FixtureCleanupMixin
from model_evaluation import selected_profile, validate_options, safe_error
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


def model_response_shape(value, expected_model):
    """Bounded diagnostics: fixed field names/enums, types and counts only."""
    def mapping(item):
        return item if type(item) is dict else {}
    def kind(item):
        return {type(None): 'NoneType', bool: 'bool', int: 'int', float: 'float',
                str: 'str', list: 'list', dict: 'dict'}.get(type(item), 'unsupported')
    def keys(item, allowed):
        found = sorted(name for name in allowed if name in item)
        return found, len(item) - len(found)
    def enum(item, allowed):
        return item if type(item) is str and item in allowed else None
    def length(item):
        return len(item) if type(item) in (str, list, dict) else None
    shape = mapping(value)
    known, unknown = keys(shape, ('id', 'object', 'created', 'model', 'choices', 'usage', 'system_fingerprint', 'service_tier'))
    usage = mapping(shape.get('usage'))
    choices = shape.get('choices')
    summaries = []
    for raw_choice in choices[:2] if type(choices) is list else []:
        choice = mapping(raw_choice)
        choice_keys, choice_unknown = keys(choice, ('index', 'message', 'finish_reason', 'logprobs'))
        message = mapping(choice.get('message'))
        message_keys, message_unknown = keys(message, ('role', 'content', 'tool_calls', 'refusal',
            'annotations', 'audio', 'function_call', 'reasoning', 'reasoning_content'))
        calls = message.get('tool_calls')
        call_summaries = []
        for raw_call in calls[:5] if type(calls) is list else []:
            call = mapping(raw_call)
            call_keys, call_unknown = keys(call, ('id', 'type', 'function'))
            function = mapping(call.get('function'))
            function_keys, function_unknown = keys(function, ('name', 'arguments'))
            call_summaries.append(dict(keys=call_keys, unknown_field_count=call_unknown,
                function_keys=function_keys, function_unknown_field_count=function_unknown,
                name=enum(function.get('name'), ('blog_read_public', 'blog_search_public')),
                name_type=kind(function.get('name')), id_length=length(call.get('id'))))
        metadata = {name: dict(type=kind(message[name]), is_null=message[name] is None,
                    length=length(message[name])) for name in ('annotations', 'audio', 'function_call',
                    'reasoning', 'reasoning_content', 'refusal') if name in message}
        summaries.append(dict(keys=choice_keys, unknown_field_count=choice_unknown,
            index=0 if type(choice.get('index')) is int and choice['index'] == 0 else None,
            index_type=kind(choice.get('index')),
            finish_reason=enum(choice.get('finish_reason'), ('stop', 'tool_calls', 'length')),
            finish_reason_type=kind(choice.get('finish_reason')), message_keys=message_keys,
            message_unknown_field_count=message_unknown, metadata=metadata,
            tool_call_count=len(calls) if type(calls) is list else None, tool_calls=call_summaries))
    return dict(keys=known, unknown_field_count=unknown,
        model=expected_model if type(shape.get('model')) is str and shape['model'] == expected_model else None,
        model_type=kind(shape.get('model')), id_type=kind(shape.get('id')), id_length=length(shape.get('id')),
        usage={name: item if type(item) is int and 0 <= item <= 2_147_483_647 else kind(item)
               for name in ('prompt_tokens', 'completion_tokens', 'total_tokens') if name in usage
               for item in (usage[name],)}, choices=summaries,
        choice_count=len(choices) if type(choices) is list else None)


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
    def __init__(self, fixture, *, key=None, question=QUESTION):
        self.fixture = fixture
        self.key, self.events = key or str(uuid4()), []
        self.question = question
        self.started = asyncio.get_running_loop().create_future()
        self.task = asyncio.create_task(self.consume())
        fixture.streams.append(self)

    async def consume(self):
        async with self.fixture.client.stream('POST', '/ai/v1/blog-qa/runs/stream',
                json={'question': self.question, 'idempotency_key': self.key},
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
        await asyncio.wait_for(asyncio.shield(self.task), 55 if self.fixture.real_proxy is not None else 25)

    async def disconnect(self):
        self.task.cancel()
        await asyncio.gather(self.task, return_exceptions=True)


class Fixture(FixtureCleanupMixin):
    def __init__(self, mode, *, case=None, real_model_profile='qwen-public', linux=False, official_proxy_factory=None):
        if (type(linux) is not bool or linux and sys.platform != 'linux'
                or official_proxy_factory is not None and (not linux or mode != 'real'
                    or real_model_profile != 'openai-local' or not callable(official_proxy_factory))
                or linux and mode == 'real' and official_proxy_factory is None):
            raise ValueError('EVALUATION_OPTIONS_INVALID')
        self.linux = linux
        if mode != 'real' and real_model_profile != 'qwen-public':
            raise ValueError('EVALUATION_OPTIONS_INVALID')
        self.mode = mode
        self.case, self.real_proxy, self.model_trace, self.model_id = case, None, [], MODEL
        self.real_model_profile = None
        if mode == 'real':
            self.real_model_profile = selected_profile(real_model_profile)
            from src.modules.ai.public import create_keyless_validation_proxy
            from urllib.parse import urlsplit
            if self.real_model_profile == 'openai-local':
                from src.modules.ai.local_openai import create_local_openai_proxy
                from src.modules.ai.openai_responses import OpenAiResponsesProxy
                self.real_proxy = official_proxy_factory() if official_proxy_factory is not None else create_local_openai_proxy()
                if not isinstance(self.real_proxy, OpenAiResponsesProxy):
                    raise ValueError('EVALUATION_PROFILE_INVALID')
            else:
                self.real_proxy = create_keyless_validation_proxy()
            config = self.real_proxy.config
            parsed = urlsplit(config.base_url)
            # Explicit local test profile only; never enable a personal URL or
            # silently weaken the production Provider host policy.
            if self.real_model_profile == 'qwen-public':
                os.environ['AI_PROVIDER_ALLOWED_INSECURE_ORIGINS'] = parsed.scheme + '://' + parsed.netloc
            self.model_id = config.model

        self.root = Path(tempfile.mkdtemp(prefix='sun-world-sdk-stack-', dir='/run' if linux else '/private/tmp')).resolve()
        self.root.chmod(0o700)
        self.streams, self.model_requests, self.model_steps = [], [], 0
        self.model_started, self.model_cancelled = asyncio.Event(), asyncio.Event()
        self.worker = self.server = self.server_task = self.application = self.client = None
        self.listener = None
        self.pool = self.admin = self.mongo = self.worker_process = None
        self.worker_stopped = None
        self.expected_worker_crash = False
        self.reaped_groups = []
        self.cleanup_diagnostics = CleanupDiagnostics()
        self.worker_cleanup_diagnostics = dict(events=[], complete=False, acknowledged=False)
        self.database = 'sunworld_sdk_' + uuid4().hex
        self.namespace = 'agent:sdk:' + uuid4().hex + ':{sun-world}'
        self.gateway_secret, self.worker_secret = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
        self.auth_secret = secrets.token_urlsafe(32)
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
        articles = self.case['articles'] if self.case else [dict(id=1, title='权限检查', abstract='合成公开文章：后端权限', content=CONTENT)]
        for article in articles:
            self.pool.execute('INSERT INTO blog(id,title,author,abstract) VALUES(%s,%s,%s,%s)',
                (article['id'], article['title'], 'synthetic', article['abstract']))
            self.mongo[self.database].blogs.insert_one({'blogId': article['id'], 'content': article['content']})
        self.session_store = OwnedSessionRedis(AgentStackTests.redis, self.namespace + ':auth')
        self.auth = AuthManager(UserManager(self.pool), self.session_store,
            secret_key=self.auth_secret, refresh_reuse_grace_seconds=0)
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
        await asyncio.to_thread(subprocess.run, ['/usr/local/bin/openssl' if self.linux else '/usr/bin/openssl', 'req', '-x509', '-newkey', 'rsa:2048',
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
        await self.start_api_service()
        self.worker_process = await asyncio.create_subprocess_exec(str(self.node),
            str(ROOT / 'apps/agent-worker/tests/integration/stack-worker.mjs'),
            *(['--linux-stack'] if self.linux else []),
            stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL,
            env={'PATH': str(self.node.parent) + ':/usr/bin:/bin', 'HOME': str(Path.home()),
                 'TMPDIR': str(self.root), 'LC_ALL': 'C', 'TZ': 'UTC'})
        specification = dict(protocol=PROTOCOL, runtime_directory=str(self.runtime),
            workspace_root=str(self.root / 'workspaces'), journal_directory=str(self.root / 'journal'),
            gateway_origin=self.origin, model_id=self.model_id, gateway_credential=self.gateway_secret,
            worker_credential=self.worker_secret, tls=dict(key=str(self.key), cert=str(self.cert), ca=str(self.cert)),
            read_paths=[str(self.runtime), str(self.node.parent.parent)])
        if self.linux:
            specification.pop('read_paths')
            specification.update(protocol='sun-world-linux-sdk-stack-fixture/1', cgroup_root=str(self.containment.path))
        self.worker_process.stdin.write(json.dumps(specification).encode() + b'\n')
        await self.worker_process.stdin.drain()
        ready = await self.worker_line()
        assert ready['event'] == 'ready' and ready['bundle_hash'] == self.bundle_hash and ready['model_id'] == self.model_id
        self.worker = WorkerHttpTransport(ready['origin'], service_credential=self.worker_secret, tls_context=self.tls)
        await self.start_application(ready['origin'])
        self.client = httpx.AsyncClient(base_url=self.origin, verify=self.tls, trust_env=False,
            timeout=httpx.Timeout(55 if self.real_proxy is not None else 30, connect=2), follow_redirects=False)
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
        assert await self.worker.probe(bundle_hash=self.bundle_hash, model_id=self.model_id)

    async def start_api_service(self):
        settings = uvicorn.Config(self.host, host='127.0.0.1', port=0, http=PeerProtocol,
            ssl_keyfile=str(self.key), ssl_certfile=str(self.cert), ssl_ca_certs=str(self.cert),
            ssl_cert_reqs=ssl.CERT_REQUIRED, lifespan='off', access_log=False, log_level='warning',
            proxy_headers=False, limit_concurrency=32, timeout_keep_alive=1, timeout_graceful_shutdown=3)
        self.server = TestServer(settings)
        self.server_task = asyncio.create_task(self.server.serve(sockets=[self.listener]))
        async with asyncio.timeout(5):
            while not self.server.started:
                if self.server_task.done():
                    await self.server_task
                    raise RuntimeError('Owned TLS host did not start')
                await asyncio.sleep(.01)

    async def start_application(self, worker_origin):
        self.rebuild_application()

    async def worker_line(self):
        async with asyncio.timeout(30):
            line = await self.worker_process.stdout.readline()
        assert line and len(line) <= 16384, 'Invalid Worker fixture response'
        return json.loads(line)

    def rebuild_application(self):
        self.application = create_blog_qa_application(self.pool, ContentMongo(self.mongo[self.database]),
            auth_manager=self.auth, redis_client=AgentStackTests.redis, worker=self.worker,
            model_proxy=self.real_proxy if self.real_model_profile == 'openai-local' else self.model,
            worker_credential=self.gateway_secret, bundle_hash=self.bundle_hash,
            model_id=self.model_id, site_origin=self.origin, user_ids=[1], enabled=lambda: True,
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
        assert body['model'] == self.model_id and body['max_tokens'] == 1024 and body['stream'] is False
        assert body.get('thinking') == {'type': 'disabled'} and 'output_config' not in body
        if self.real_proxy is not None:
            from src.modules.ai.model_proxy import BODY_KEYS
            trace = dict(sequence=self.model_steps, request_keys=sorted(key for key in BODY_KEYS if key in body),
                         duration_ms=None, result=None, error=None)
            self.model_trace.append(trace)
            started = time.monotonic()
            try:
                from src.modules.ai import model_proxy as proxy_module
                convert = proxy_module.response_to_messages
                def observe_shape(value, model):
                    # Observe only structural metadata from the real bounded
                    # response, then run the exact same strict converter.
                    # Never capture reasoning text, headers or credentials.
                    trace['response_shape'] = model_response_shape(value, model)
                    return convert(value, model)
                with patch.object(proxy_module, 'response_to_messages', observe_shape):
                    result = await self.real_proxy(body)
                # All evaluation prompts/articles are explicit synthetic data.
                # No credentials/headers enter this model request or report.
                trace['result'] = result
                return result
            except asyncio.CancelledError:
                trace['error'] = 'CancelledError'
                raise
            except Exception as error:
                trace['error'] = safe_error(error)
                raise
            finally:
                trace['duration_ms'] = round((time.monotonic() - started) * 1000)
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

    @staticmethod
    def cleanup_redis():
        return AgentStackTests.redis


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
    if fixture.linux:
        fixture.containment.start_survivor()
        fixture.containment.freeze()
    else:
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


async def evaluate_real_model(report_path, *, profile='qwen-public'):
    from model_evaluation import evaluate_real_model as evaluate
    return await evaluate(report_path, profile=profile, fixture_factory=Fixture,
                          stream_factory=Stream, root=ROOT)


async def main():
    parser = argparse.ArgumentParser(description=__doc__)
    options = parser.add_mutually_exclusive_group()
    options.add_argument('--interrupt-probe', action='store_true')
    options.add_argument('--real-model', action='store_true')
    parser.add_argument('--report', type=Path)
    parser.add_argument('--real-model-profile', choices=('qwen-public', 'openai-local'))
    parser.add_argument('--linux-stack', action='store_true')
    parser.add_argument('--linux-official', action='store_true')
    arguments = parser.parse_args()
    if arguments.linux_stack and (sys.platform != 'linux' or arguments.real_model or arguments.interrupt_probe):
        raise ValueError('EVALUATION_OPTIONS_INVALID')
    fixture_factory = Fixture
    if arguments.linux_stack:
        from linux_sdk_stack import linux_fixture_class
        fixture_factory = linux_fixture_class(Fixture)
    profile = validate_options(arguments.real_model, arguments.report, arguments.real_model_profile,
                               interrupt=arguments.interrupt_probe)
    if arguments.linux_official and (sys.platform != 'linux' or arguments.linux_stack
            or not arguments.real_model or profile != 'openai-local' or arguments.interrupt_probe):
        raise ValueError('EVALUATION_OPTIONS_INVALID')
    task = asyncio.current_task()
    loop = asyncio.get_running_loop()
    for signum in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(signum, task.cancel)
    AgentStackTests.setUpClass()
    try:
        if arguments.real_model:
            if arguments.linux_official:
                from linux_official_evaluation import evaluate_linux_official
                await evaluate_linux_official(arguments.report, base=Fixture, stream_factory=Stream, root=ROOT)
            else:
                await evaluate_real_model(arguments.report, profile=profile)
            return
        if arguments.interrupt_probe:
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
        linux_observations = []
        for label, mode, action in [('success/recovery', 'complete', success),
                ('explicit cancel', 'hold', cancel),
                ('browser TLS disconnect', 'hold', lambda fixture: cancel(fixture, disconnect=True)),
                ('live Redis session revoke', 'hold', lambda fixture: cancel(fixture, revoke=True)),
                ('withdraw before final commit', 'withdraw', withdraw),
                ('Worker crash with stopped SDK group', 'hold', crash)]:
            fixture = fixture_factory(mode)
            try:
                await fixture.start()
                await action(fixture)
            finally:
                # finish_cleanup shields only teardown, not a failed assertion.
                from src.modules.agent_runtime.cleanup import finish_cleanup
                await finish_cleanup(fixture.close())
            if fixture.expected_worker_crash:
                assert fixture.worker_stopped is None
                if fixture.linux:
                    assert fixture.linux_summary()['parent_recovery_positive_control']
                else:
                    assert len(fixture.reaped_groups) == 1
            else:
                assert fixture.worker_stopped['start_count'] == 1
            if arguments.linux_stack:
                linux_observations.append(fixture.linux_summary())
            print('SDK stack passed: ' + label, flush=True)
        print('Real fixed SDK + real MySQL/Redis/MongoDB + two-way mTLS: 6 scenarios passed.', flush=True)
        print('Model/article data are synthetic; Linux cgroup/bubblewrap fixture only, no real-model acceptance.'
              if arguments.linux_stack else
              'Model/article data are synthetic; macOS sandbox only, no Linux or real-model acceptance.', flush=True)
        if arguments.linux_stack:
            from linux_sdk_stack import stack_proof
            print('SW_LINUX_STACK_RESULT ' + json.dumps(stack_proof(linux_observations)), flush=True)
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
        print('SDK stack failed: ' + safe_error(error), file=sys.stderr)
        sys.exit(1)
