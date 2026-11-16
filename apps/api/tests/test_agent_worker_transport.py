import asyncio
import json
import ssl
import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4

import httpx

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'apps/api'))
from src.modules.agent_runtime.ledger import LedgerError
from src.modules.agent_runtime.rpc import ExecutionStart, PROTOCOL
from src.modules.agent_runtime.worker_transport import WorkerHttpTransport


class Stream(httpx.AsyncByteStream):
    def __init__(self, raw):
        self.raw = raw

    async def __aiter__(self):
        yield self.raw


class WorkerTransportTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.binding = dict(protocol=PROTOCOL, run_id=str(uuid4()), execution_id=str(uuid4()),
                            generation=1, bundle_hash='a'*64)
        self.payload = {**self.binding, 'app_id': 'sun-world', 'scenario': 'blog-qa',
            'model_id': 'fixed-model', 'root_session_id': 'blog-qa-' + self.binding['run_id'],
            'deadline': (datetime.now(timezone.utc) + timedelta(seconds=40)).isoformat().replace('+00:00', 'Z'),
            'question': '公开问题', 'credentials': {key: key[0]*43 for key in ('tool', 'model', 'result')}}
        self.requests = []

    def transport(self, handler):
        return WorkerHttpTransport('https://worker.example.test', service_credential='s'*43,
                                   transport=httpx.MockTransport(handler))

    async def test_one_attempt_fixed_origin_headers_and_safe_ack(self):
        async def handler(request):
            self.requests.append(request)
            self.assertEqual(request.headers['x-worker-service'], 's'*43)
            self.assertEqual(request.headers['x-agent-protocol'], PROTOCOL)
            self.assertNotIn('authorization', request.headers)
            return httpx.Response(202, stream=Stream(json.dumps({**self.binding, 'status': 'running'}).encode()))
        transport = self.transport(handler)
        self.assertEqual((await transport.start(self.payload))['status'], 'running')
        await transport.inspect(self.binding)
        await transport.cancel(self.binding)
        self.assertEqual([r.method for r in self.requests], ['POST', 'GET', 'POST'])
        self.assertEqual(self.requests[1].content, b'')
        self.assertTrue(str(self.requests[2].url).endswith('/cancel'))
        self.assertNotIn('s'*43, repr(transport))
        for value in self.payload['credentials'].values():
            self.assertNotIn(value, repr(ExecutionStart.model_validate(self.payload)))

    async def test_redirect_wrong_binding_unknown_extra_and_oversize_fail_without_retry(self):
        for status, raw, headers in [
            (302, b'', {'location': 'https://other.example.test'}),
            (200, json.dumps({**self.binding, 'generation': 2, 'status': 'running'}).encode(), {}),
            (200, json.dumps({**self.binding, 'status': 'running', 'token': 'private'}).encode(), {}),
            (200, b' '*8193, {}), (200, b'not json with secret diagnostic', {}),
            (200, b'{}', {'content-encoding': 'gzip'}),
        ]:
            calls = []
            def handler(request):
                calls.append(request)
                return httpx.Response(status, stream=Stream(raw), headers=headers)
            with self.subTest(status=status, headers=headers), self.assertRaises(LedgerError) as error:
                await self.transport(handler).start(self.payload)
            self.assertEqual(len(calls), 1)
            self.assertEqual(str(error.exception), 'AGENT_RUNTIME_UNAVAILABLE')

    async def test_network_fault_timeout_and_cancellation_do_not_retry(self):
        calls = []
        def handler(request):
            calls.append(request)
            raise httpx.ConnectError('secret remote diagnostic', request=request)
        with self.assertRaises(LedgerError):
            await self.transport(handler).start(self.payload)
        self.assertEqual(len(calls), 1)
        entered = asyncio.Event()
        async def blocked(_request):
            entered.set()
            await asyncio.Event().wait()
        task = asyncio.create_task(self.transport(blocked).start(self.payload))
        await entered.wait()
        task.cancel()
        with self.assertRaises(asyncio.CancelledError):
            await task
        with self.assertRaises(LedgerError):
            await self.transport(blocked).start(self.payload)

    async def test_invalid_configuration_and_binding_fail_before_transport(self):
        for origin in ['http://worker.example.test', 'https://user:pass@worker.example.test',
                       'https://worker.example.test/path', 'https://worker.example.test/?url=x']:
            with self.assertRaises(ValueError):
                WorkerHttpTransport(origin, service_credential='s'*43)
        with self.assertRaises(ValueError):
            WorkerHttpTransport('https://worker.example.test', service_credential='s'*43,
                                tls_context=ssl._create_unverified_context())
        def forbidden(_request):
            self.fail('Invalid schema must not reach transport')
        for changes in [{'owner': 1}, {'generation': True}, {'run_id': 'invalid'},
                        {'deadline': '2026-99-99T00:00:00Z'},
                        {'credentials': {'tool': 'bad'}}]:
            with self.assertRaises(LedgerError):
                await self.transport(forbidden).start({**self.payload, **changes})
