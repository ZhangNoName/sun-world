"""HTTP contract tests; native stack separately verifies real storage/auth."""
import sys
import json
import unittest
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

import httpx
from fastapi import FastAPI

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from src.modules.agent_runtime.application import RequestExists
from src.modules.agent_runtime.ledger import LedgerError
from src.modules.agent_runtime.public_router import create_public_run_router


class Application:
    def __init__(self):
        self.starts, self.stops, self.erased = [], [], []
        self.error = None
        self.run_id = str(uuid4())

    async def ready(self): pass
    async def close(self): pass

    async def start(self, token, **values):
        if self.error:
            raise self.error
        self.starts.append((token, values))
        return SimpleNamespace(run_id=self.run_id)

    async def stream_view(self, accepted):
        return dict(id=accepted.run_id, status='completed', question='问题', answer='回答', sources=[])

    async def abandon(self, accepted):
        self.stops.append(accepted.run_id)

    async def erase_history(self, token, run_id):
        if self.error:
            raise self.error
        self.erased.append((token, run_id))
        return True


class PublicRouterTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.service = Application()
        self.app = FastAPI()
        self.app.include_router(create_public_run_router(self.service, allowed_origins={'https://site.test'}))
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=self.app), base_url='https://site.test')
        self.addAsyncCleanup(self.client.aclose)
        self.body = dict(question='问题', idempotency_key=str(uuid4()))
        self.headers = {'origin': 'https://site.test', 'cookie': 'access_token=synthetic'}
        self.path = '/ai/v1/blog-qa/runs/stream'

    async def test_stream_contract_events_and_cleanup(self):
        response = await self.client.post(self.path, json=self.body, headers=self.headers)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.headers['content-type'].startswith('text/event-stream'))
        self.assertEqual(response.headers['cache-control'], 'no-store')
        events = [json.loads(line[6:]) for line in response.text.splitlines() if line.startswith('data: ')]
        self.assertEqual([event['type'] for event in events], ['run.started', 'message.completed'])
        self.assertEqual(self.service.stops, [self.service.run_id])
        self.assertEqual(self.service.starts, [('synthetic', self.body)])
        schema = self.app.openapi()['paths'][self.path]['post']['requestBody']['content']['application/json']['schema']
        self.assertEqual(set(schema['required']), {'question', 'idempotency_key'})
        self.assertFalse(schema['additionalProperties'])

    async def test_origin_duplicate_json_oversize_and_unknown_fields_do_not_start(self):
        response = await self.client.post(self.path, json=self.body)
        self.assertEqual(response.status_code, 403)
        for raw, status in [(b'{"question":"a","question":"b","idempotency_key":"' + self.body['idempotency_key'].encode() + b'"}', 422),
                (b' ' * 16385, 413), (b'{"question":"a","extra":1}', 422), (b'[]', 422)]:
            with self.subTest(status=status):
                response = await self.client.post(self.path, content=raw, headers=self.headers)
                self.assertEqual(response.status_code, status)
        self.assertEqual(self.service.starts, [])

    async def test_duplicate_rate_auth_and_internal_errors_have_safe_public_shape(self):
        rate = LedgerError('AGENT_RATE_LIMITED')
        rate.retry_after = 12
        for error, status in [(RequestExists(self.service.run_id), 409), (rate, 429),
                (LedgerError('AGENT_ACTIVE_SESSION_REQUIRED'), 401),
                (LedgerError('AGENT_NOT_ALLOWLISTED'), 403),
                (RuntimeError('private secret diagnostic'), 503)]:
            self.service.error = error
            response = await self.client.post(self.path, json=self.body, headers=self.headers)
            self.assertEqual(response.status_code, status)
            self.assertNotIn('private secret', response.text)
            if status == 429:
                self.assertEqual(response.headers['retry-after'], '12')
            if isinstance(error, RequestExists):
                self.assertEqual(response.json()['data'], {'run_id': self.service.run_id})

    async def test_history_delete_requires_origin_and_empty_body(self):
        path = '/ai/v1/blog-qa/runs/' + self.service.run_id
        self.assertEqual((await self.client.delete(path)).status_code, 403)
        for raw in (b'null', b'[]', b'{"force":true}', b' ' * 16385):
            response = await self.client.request('DELETE', path, content=raw, headers=self.headers)
            self.assertEqual(response.status_code, 413 if len(raw) > 16384 else 422)
        self.assertFalse(self.service.erased)
        for raw in (b'', b'{}'):
            response = await self.client.request('DELETE', path, content=raw, headers=self.headers)
            self.assertEqual(response.status_code, 200)
            self.assertIs(response.json()['data'], True)
        self.assertEqual(self.service.erased, [('synthetic', self.service.run_id)] * 2)
        schema = self.app.openapi()['paths']['/ai/v1/blog-qa/runs/{run_id}']['delete']
        self.assertIn('security', schema)

    async def test_history_delete_has_safe_errors_and_never_starts_execution(self):
        path = '/ai/v1/blog-qa/runs/' + self.service.run_id
        for code, status in [('AGENT_HISTORY_NOT_TERMINAL', 409), ('AGENT_HISTORY_DELETED', 409),
                             ('AGENT_RUN_NOT_FOUND', 404), ('AGENT_ACTIVE_SESSION_REQUIRED', 401)]:
            self.service.error = LedgerError(code)
            response = await self.client.delete(path, headers=self.headers)
            self.assertEqual(response.status_code, status)
            self.assertEqual(response.json()['code'], code)
        self.service.error = RuntimeError('private erase diagnostic')
        response = await self.client.delete(path, headers=self.headers)
        self.assertEqual(response.status_code, 503)
        self.assertNotIn('private erase', response.text)
        self.assertFalse(self.service.starts or self.service.stops or self.service.erased)
