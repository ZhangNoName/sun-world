import sys
import unittest
from dataclasses import replace
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'apps/api'))
import test_agent_run_gateway as fixtures
from src.modules.agent_runtime.private_router import create_private_run_router
from src.modules.agent_runtime.rpc import PROTOCOL


class PrivateRunRouterTests(unittest.TestCase):
    def setUp(self):
        self.fixture = fixtures.AgentRunGatewayTests()
        self.fixture.setUp()
        self.addCleanup(self.fixture.doCleanups)
        self.app = FastAPI()
        self.app.include_router(create_private_run_router(self.fixture.gateway,
            verify_peer=lambda request: request.client.host == 'trusted-worker'))
        self.client = TestClient(self.app, base_url='https://api.example.test', client=('trusted-worker', 42000))
        self.addCleanup(self.client.close)
        self.base = '/internal/agent/v2/runs/' + self.fixture.run['id']

    def headers(self, audience='result', **updates):
        return {'x-agent-protocol': PROTOCOL, 'x-agent-execution': self.fixture.run['execution_id'],
                'x-agent-generation': '1', 'x-worker-service': self.fixture.service_secret,
                'authorization': 'Bearer ' + getattr(self.fixture.credentials, audience), **updates}

    def post(self, path, body, audience='result', **headers):
        return self.client.post(self.base + path, json=body, headers=self.headers(audience, **headers))

    def test_real_gateway_round_trip_receipt_uuid_source_and_root_request(self):
        root = {'root_turn_id': 'root-turn', 'root_request_id': 'request-1'}
        self.assertEqual(self.post('/root', root).json(), {'registered': True})
        response = self.post('/tools/blog.read_public', {'call_id': 'read-v2',
            'tool_version': '1', 'arguments': {'article_id': 1}}, 'tool')
        self.assertEqual(response.status_code, 200)
        source = response.json()
        final = {**root, 'root_session_id': self.fixture.run['root_session_id'], 'finish': 'completed',
                 'answer': '依据公开文章回答。', 'source_ids': [source['source_id']]}
        self.assertEqual(self.post('/result', final).status_code, 409)
        self.assertEqual(self.post('/receipts', {'call_id': 'read-v2',
            'result_hash': source['result_hash']}, 'tool').json(), {'delivered': True})
        self.assertEqual(self.post('/result', {**final, 'root_request_id': 'wrong'}).status_code, 409)
        self.assertEqual(self.post('/result', final).json(), {'committed': True})
        self.assertEqual(self.post('/result', final).json(), {'committed': False})
        self.assertEqual(self.fixture.db.count('ai_messages'), 2)
        self.assertFalse(any(path.startswith('/internal/') for path in self.app.openapi()['paths']))

    def test_tls_peer_and_version_fail_before_database_and_ignore_forwarded_headers(self):
        for base, peer, updates, status in [
            ('http://api.example.test', 'trusted-worker', {'x-forwarded-proto': 'https'}, 403),
            ('https://api.example.test', 'untrusted', {'x-worker-peer': 'trusted-worker'}, 403),
            ('https://api.example.test', 'trusted-worker', {'x-agent-protocol': 'sun-world-agent/1'}, 409),
        ]:
            with self.subTest(base=base, peer=peer), TestClient(self.app, base_url=base, client=(peer, 42000)) as client:
                result = client.post(self.base + '/heartbeat', json={}, headers=self.headers(**updates))
                self.assertEqual(result.status_code, status)
        self.assertEqual(self.fixture.db.count('ai_messages'), 1)

    def test_wrong_audience_service_execution_and_generation_are_rejected(self):
        for updates in [{'x-worker-service': 'T'*43}, {'x-agent-execution': self.fixture.run['id']},
                        {'x-agent-generation': '2'}, {'authorization': 'Bearer ' + self.fixture.credentials.tool},
                        {'authorization': 'Bearer invalid'}]:
            with self.subTest(updates=list(updates)):
                self.assertIn(self.post('/heartbeat', {}, **updates).status_code, (401, 409))

    def test_unknown_fields_duplicate_json_nonfinite_and_body_limit(self):
        self.assertEqual(self.post('/root', {'root_turn_id': 'root-turn',
            'root_request_id': 'request-1', 'owner': 1}).status_code, 422)
        for raw in ['{"root_turn_id":"root-turn","root_turn_id":"other","root_request_id":"r"}',
                    '{"value":NaN}', '{"value":Infinity}', '[]', '{']:
            response = self.client.post(self.base + '/root', content=raw, headers=self.headers())
            self.assertEqual(response.status_code, 422)
        response = self.client.post(self.base + '/root', content=' '*131073, headers=self.headers())
        self.assertEqual(response.status_code, 413)
        self.assertNotIn(' '*100, response.text)

    def test_live_session_revocation_cancellation_and_model_audience(self):
        self.assertEqual(self.post('/heartbeat', {}).status_code, 200)
        self.assertEqual(self.post('/model/messages', {'messages': []}, 'model').status_code, 200)
        self.assertEqual(self.post('/model/messages', {'messages': []}, 'tool').status_code, 401)
        self.fixture.current = replace(self.fixture.owner, session_family='revoked')
        self.assertEqual(self.post('/heartbeat', {}).status_code, 403)
        self.fixture.current = self.fixture.owner
        self.fixture.ledger.cancel(self.fixture.owner, self.fixture.run['id'])
        self.assertEqual(self.post('/heartbeat', {}).status_code, 409)

    def test_dependency_diagnostic_is_never_returned(self):
        def fail(*_args):
            raise RuntimeError('private token diagnostic must stay hidden')
        self.fixture.gateway.heartbeat = fail
        response = self.post('/heartbeat', {})
        self.assertEqual(response.status_code, 503)
        self.assertNotIn('diagnostic', response.text)

    def test_scientific_notation_overflow_never_reaches_model_or_charges_budget(self):
        for raw in ['{"messages":[],"temperature":1e999}',
                    '{"messages":[{"nested":[-1e999]}]}']:
            response = self.client.post(self.base + '/model/messages', content=raw,
                                        headers=self.headers('model'))
            self.assertEqual(response.status_code, 422)
        row = self.fixture.ledger.get_owned(self.fixture.owner, self.fixture.run['id'])
        self.assertEqual(row['model_count'], 0)
