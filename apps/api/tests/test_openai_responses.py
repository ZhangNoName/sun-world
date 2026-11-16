"""Offline official Responses conversion, transport ownership and key boundaries."""

import asyncio
import copy
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import test_blog_qa_model_proxy as fixtures
import test_structured_model_proxy as wire
from src.modules.ai import local_openai, openai_responses as adapter
from src.modules.ai.public import create_blog_qa_proxy

PRIVATE = 'synthetic_private_reasoning_or_key'


def messages(*, history=False):
    value = fixtures.valid_messages()
    if history:
        value['messages'][1]['content'].pop(0)
    else:
        value['messages'] = value['messages'][:1]
    return value


def result(*, tools=False):
    output = [{'type': 'reasoning', 'id': 'rs_synthetic', 'summary': [{'type': 'summary_text', 'text': PRIVATE}]}]
    output.append({'type': 'message', 'id': 'msg_synthetic', 'status': 'completed',
        'role': 'assistant', 'phase': 'commentary' if tools else 'final_answer',
        'content': [{'type': 'output_text', 'text': PRIVATE if tools else '公开答案。',
                     'annotations': [], 'logprobs': []}]})
    if tools:
        output.append({'type': 'function_call', 'id': 'fc_synthetic', 'status': 'completed',
            'call_id': 'call_synthetic_2', 'name': 'blog_read_public', 'arguments': '{"article_id":1}'})
    return {'id': 'resp_synthetic', 'object': 'response', 'status': 'completed',
        'error': None, 'incomplete_details': None, 'model': adapter.MODEL, 'output': output,
        'usage': {'input_tokens': 20, 'output_tokens': 12, 'total_tokens': 32,
                  'output_tokens_details': {'reasoning_tokens': 8}}}


def config():
    return adapter.ProviderConfig(provider='openai-local', model=adapter.MODEL,
        base_url='https://api.openai.com/v1', auth_mode='bearer', api_key='sk-synthetic_private_key_value')


class OfficialWire(wire.WireFactory):
    def __init__(self, handler, *, count_handler=None):
        count_handler = count_handler or (lambda _: httpx.Response(200,
            json={'object': 'response.input_tokens', 'input_tokens': 20}))
        super().__init__(lambda request: count_handler(request)
            if request.url.path == '/v1/responses/input_tokens' else handler(request))

    @property
    def count_requests(self):
        return [request for request in self.requests if request.url.path == '/v1/responses/input_tokens']

    @property
    def generation_requests(self):
        return [request for request in self.requests if request.url.path == '/v1/responses']

    def __call__(self, selected, **limits):
        provider = super().__call__(selected, **limits)
        provider._allowed_hosts = ('api.openai.com',)
        return provider


class ResponsesAdapterTests(unittest.TestCase):
    def test_full_history_tool_identity_and_fixed_controls(self):
        payload = adapter.responses_payload(messages(history=True))
        self.assertEqual(adapter.MODEL, payload['model'])
        self.assertEqual(['system', 'user', None, None, 'user'], [row.get('role') for row in payload['input']])
        self.assertEqual('c1', payload['input'][2]['call_id'])
        self.assertEqual('c1', payload['input'][3]['call_id'])
        self.assertEqual('公开文章', payload['input'][3]['output'])
        self.assertEqual({'effort': 'low'}, payload['reasoning'])
        self.assertEqual('disabled', payload['truncation'])
        self.assertFalse(payload['store'])
        self.assertFalse(payload['stream'])
        self.assertFalse(payload['parallel_tool_calls'])
        self.assertEqual(1024, payload['max_output_tokens'])
        self.assertEqual({'blog_search_public', 'blog_read_public'}, {row['name'] for row in payload['tools']})
        for forbidden in ('previous_response_id', 'conversation', 'temperature', 'top_p', 'max_tokens'):
            self.assertNotIn(forbidden, payload)

    def test_phase_losing_history_and_unsupported_sampling_are_rejected(self):
        values = [fixtures.valid_messages()]
        for key, value in [('temperature', 1), ('top_p', .5), ('max_tokens', 1025), ('thinking', {'type': 'enabled'})]:
            body = messages()
            body[key] = value
            values.append(body)
        for body in values:
            with self.subTest(body_key_count=len(body)):
                with self.assertRaisesRegex(ValueError, '^AGENT_MODEL_INPUT_INVALID$'):
                    adapter.responses_payload(body)

    def test_tool_and_final_responses_never_forward_reasoning_or_commentary(self):
        for tools in (False, True):
            value = adapter.responses_result(result(tools=tools))
            self.assertNotIn(PRIVATE, json.dumps(value))
            self.assertEqual('tool_use' if tools else 'end_turn', value['stop_reason'])
            self.assertEqual({'input_tokens': 20, 'output_tokens': 12}, value['usage'])
            self.assertEqual(['tool_use' if tools else 'text'], [row['type'] for row in value['content']])

    def test_single_response_faults_cannot_invent_usage_or_execute_other_tools(self):
        mutations = [(('usage', 'input_tokens'), True), (('usage', 'output_tokens'), 1025),
            (('usage', 'total_tokens'), 1), (('model',), 'other-model'), (('status',), 'failed'),
            (('output', 2, 'name'), 'shell'), (('output', 2, 'arguments'), '{"a":1,"a":2}'),
            (('output', 2, 'arguments'), '{"a":NaN}'), (('output', 2, 'status'), 'in_progress'),
            (('output', 2, 'call_id'), False), (('output', 2, 'type'), 'web_search_call')]
        for path, replacement in mutations:
            value = result(tools=True)
            fixtures.set_path(value, path, replacement)
            with self.subTest(path=path):
                with self.assertRaisesRegex(ValueError, '^AGENT_MODEL_RESPONSE_INVALID$'):
                    adapter.responses_result(value)
        value = result()
        value.pop('usage')
        with self.assertRaises(ValueError):
            adapter.responses_result(value)

    def test_incomplete_response_never_executes_partial_call(self):
        value = result(tools=True)
        value.update(status='incomplete', incomplete_details={'reason': 'max_output_tokens'})
        with self.assertRaises(ValueError):
            adapter.responses_result(value)
        value = result()
        value.update(status='incomplete', incomplete_details={'reason': 'max_output_tokens'})
        value['output'] = []
        self.assertEqual('max_tokens', adapter.responses_result(value)['stop_reason'])


class ResponsesWireTests(unittest.IsolatedAsyncioTestCase):
    async def test_responses_endpoint_keeps_real_pin_and_single_attempt_limits(self):
        factory = OfficialWire(lambda _: httpx.Response(200, json=result(tools=True)))
        value = await adapter.OpenAiResponsesProxy(config(), provider_factory=factory)(messages())
        self.assertEqual('tool_use', value['stop_reason'])
        self.assertEqual([('api.openai.com', 443)] * 2, factory.dns)
        self.assertEqual(1, len(factory.count_requests))
        self.assertEqual(1, len(factory.generation_requests))
        self.assertEqual([4096, 65536], [item['max_stream_bytes'] for item in factory.constructed])
        request = factory.generation_requests[0]
        self.assertEqual('/v1/responses', request.url.path)
        self.assertEqual('1.1.1.1', request.url.host)
        self.assertEqual('api.openai.com', request.headers['host'])
        self.assertEqual('api.openai.com', request.extensions['sni_hostname'])
        self.assertFalse(factory.options[0]['trust_env'])
        self.assertFalse(factory.options[0]['follow_redirects'])
        self.assertTrue(all(client.is_closed for client in factory.clients))

    async def test_http_and_protocol_faults_are_safe_single_attempts(self):
        responses = [httpx.Response(401, content=PRIVATE.encode()), httpx.Response(302),
            httpx.Response(200, content=b'{"object":"response","object":"response"}'),
            httpx.Response(200, json={**result(), 'usage': None})]
        for response in responses:
            factory = OfficialWire(lambda _: response)
            with self.assertRaises((RuntimeError, ValueError)) as caught:
                await adapter.OpenAiResponsesProxy(config(), provider_factory=factory)(messages())
            self.assertNotIn(PRIVATE, str(caught.exception))
            self.assertEqual(1, len(factory.count_requests))
            self.assertEqual(1, len(factory.generation_requests))
            self.assertTrue(all(client.is_closed for client in factory.clients))

    async def test_diagnostics_preserve_category_without_private_error_text(self):
        def timed_out(_):
            raise httpx.ReadTimeout(PRIVATE)
        for handler, category, status in [
            (timed_out, 'AGENT_MODEL_TIMEOUT', 'status=None'),
            (lambda _: httpx.Response(429, content=PRIVATE.encode()), 'AGENT_MODEL_FAILED', 'status=429'),
        ]:
            factory = OfficialWire(handler)
            with self.assertLogs(adapter.LOGGER, level='WARNING') as logs:
                with self.assertRaisesRegex(RuntimeError, '^' + category + '$'):
                    await adapter.OpenAiResponsesProxy(config(), provider_factory=factory)(messages())
            output = '\n'.join(logs.output)
            self.assertNotIn(PRIVATE, output)
            self.assertIn('stage=request', output)
            self.assertIn(category, output)
            self.assertIn(status, output)

    async def test_existing_call_ids_and_lower_output_budget_are_checked(self):
        value = result(tools=True)
        value['output'][2]['call_id'] = 'c1'
        factory = OfficialWire(lambda _: httpx.Response(200, json=value))
        with self.assertRaises(ValueError):
            await adapter.OpenAiResponsesProxy(config(), provider_factory=factory)(messages(history=True))
        factory = OfficialWire(lambda _: httpx.Response(200, json=result()))
        body = messages()
        body['max_tokens'] = 5
        with self.assertRaises(ValueError):
            await adapter.OpenAiResponsesProxy(config(), provider_factory=factory)(body)

    async def test_forced_tool_cannot_be_replaced_by_prose_or_a_different_call(self):
        for response in (result(), result(tools=True)):
            factory = OfficialWire(lambda _: httpx.Response(200, json=response))
            body = messages()
            body['tool_choice'] = {'type': 'tool', 'name': 'blog_search_public'}
            with self.assertRaisesRegex(ValueError, '^AGENT_MODEL_RESPONSE_INVALID$'):
                await adapter.OpenAiResponsesProxy(config(), provider_factory=factory)(body)
            self.assertEqual(1, len(factory.count_requests))
            self.assertEqual(1, len(factory.generation_requests))
            self.assertTrue(all(client.is_closed for client in factory.clients))
        factory = OfficialWire(lambda _: httpx.Response(200, json=result(tools=True)))
        body = messages()
        body['tool_choice'] = {'type': 'none'}
        with self.assertRaises(ValueError):
            await adapter.OpenAiResponsesProxy(config(), provider_factory=factory)(body)

    async def test_cancellation_during_close_drains_before_propagating(self):
        factory = OfficialWire(lambda _: httpx.Response(200, json=result()))
        proxy = adapter.OpenAiResponsesProxy(config(), provider_factory=factory)
        handle = await proxy.prepare(messages())
        factory.close_started.clear()
        factory.close_gate = asyncio.Event()
        task = asyncio.create_task(proxy.generate(handle))
        try:
            await asyncio.wait_for(factory.close_started.wait(), 1)
            task.cancel()
            await asyncio.sleep(0)
            task.cancel()
            await asyncio.sleep(0)
            self.assertFalse(task.done())
            factory.close_gate.set()
            with self.assertRaises(asyncio.CancelledError):
                await asyncio.wait_for(task, 1)
        finally:
            factory.close_gate.set()
            await asyncio.gather(task, return_exceptions=True)
        self.assertTrue(all(client.is_closed for client in factory.clients))
        with self.assertRaisesRegex(ValueError, '^AGENT_MODEL_INPUT_INVALID$'):
            await proxy.generate(handle)
        self.assertEqual(1, len(factory.count_requests))
        self.assertEqual(1, len(factory.generation_requests))


class LocalOpenAiProfileTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory(prefix='sun-world-openai-key-unit-')
        self.addCleanup(directory.cleanup)
        self.root = Path(directory.name)
        self.key = self.root / 'key'
        self.key.write_text('sk-synthetic_private_key_value')
        self.key.chmod(0o600)

    async def test_local_explicit_factory_and_existing_qwen_boundary(self):
        with patch.dict(os.environ, BLOG_RUNTIME_ENV='test', DSH_OPENAI_API_KEY_FILE=str(self.key), DSH_OPENAI_PROXY_URL='http://127.0.0.1:7890'):
            value = await create_blog_qa_proxy(None, local_model='openai-local')
        self.assertIsInstance(value, adapter.OpenAiResponsesProxy)
        self.assertEqual(adapter.MODEL, value.config.model)
        self.assertNotIn('synthetic_private_key', repr(value.config))
        self.assertEqual(1024, value.limits.max_output_tokens)

    async def test_production_rejects_before_any_file_or_transport(self):
        with patch.dict(os.environ, BLOG_RUNTIME_ENV='production'), patch.object(local_openai, 'read_key') as reader:
            with self.assertRaisesRegex(ValueError, '^AGENT_OPENAI_CONFIG_INVALID$'):
                await create_blog_qa_proxy(None, local_model='openai-local')
            reader.assert_not_called()

    def test_key_file_type_permissions_links_and_contents_fail_closed(self):
        self.assertEqual('sk-synthetic_private_key_value', local_openai.read_key(self.key))
        link = self.root / 'link'
        link.symlink_to(self.key)
        hardlink = self.root / 'hardlink'
        os.link(self.key, hardlink)
        for path in (self.key, link, hardlink, self.root, Path('relative')):
            with self.assertRaisesRegex(ValueError, '^AGENT_OPENAI_CONFIG_INVALID$'):
                local_openai.read_key(path)
        hardlink.unlink()
        self.key.chmod(0o644)
        with self.assertRaises(ValueError):
            local_openai.read_key(self.key)
        self.key.chmod(0o600)
        self.key.write_text(PRIVATE + '\n')
        with self.assertRaises(ValueError):
            local_openai.read_key(self.key)


if __name__ == '__main__':
    unittest.main()
