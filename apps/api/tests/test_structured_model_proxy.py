"""Real Provider policy/hooks with httpx MockTransport, never an external model."""

import asyncio
import json
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import test_blog_qa_model_proxy as fixtures
from src.modules.ai import model_proxy
from src.modules.ai.mcp_gateway import McpSdkDependencies
from src.modules.ai.model_proxy import INPUT_INVALID, RESPONSE_INVALID, StructuredModelProxy
from src.modules.ai.providers import OpenAiCompatibleProvider, ProviderConfig


class WireFactory:
    """Inject the transport/dependencies, never replace production policy hooks."""
    def __init__(self, handler, *, addresses=('1.1.1.1',)):
        self.handler, self.addresses = handler, addresses
        self.constructed, self.requests, self.clients, self.options, self.dns = [], [], [], [], []
        self.close_started, self.closed = asyncio.Event(), False
        self.entry_started = asyncio.Event()
        self.close_gate = self.entry_gate = None

    async def resolve(self, host, port):
        self.dns.append((host, port))
        return self.addresses

    def __call__(self, config, **limits):
        self.constructed.append(limits)
        factory = self
        class Transport(httpx.MockTransport):
            async def aclose(self):
                factory.close_started.set()
                if factory.close_gate:
                    await factory.close_gate.wait()
                await super().aclose()
                factory.closed = True
        async def send(request):
            self.requests.append(request)
            value = self.handler(request)
            return await value if hasattr(value, '__await__') else value
        class Client(httpx.AsyncClient):
            async def __aenter__(self):
                await super().__aenter__()
                factory.entry_started.set()
                if factory.entry_gate:
                    await factory.entry_gate.wait()
                return self
        def client(**options):
            self.options.append(options)
            result = Client(transport=Transport(send), **options)
            self.clients.append(result)
            return result
        dependencies = McpSdkDependencies(httpx2=SimpleNamespace(
            AsyncClient=client, AsyncByteStream=httpx.AsyncByteStream, Timeout=httpx.Timeout,
            TimeoutException=httpx.TimeoutException), client_class=object, streamable_http_client=object)
        return OpenAiCompatibleProvider(config, allowed_hosts=('models.example.com',), resolver=self,
                                        dependency_loader=lambda: dependencies, **limits)


def config(**changes):
    values = dict(provider='synthetic', model='fixture-model', base_url='https://models.example.com/v1',
                  auth_mode='bearer', api_key='synthetic-private-model-key')
    return ProviderConfig(**{**values, **changes})


def response(value=None):
    return httpx.Response(200, json=fixtures.valid_response() if value is None else value)


class StructuredModelWireTests(unittest.IsolatedAsyncioTestCase):
    async def test_valid_wire_keeps_real_dns_pin_limits_and_fixed_model(self):
        factory = WireFactory(lambda _: response(fixtures.valid_response(tools=True)))
        proxy = StructuredModelProxy(config(), provider_factory=factory)
        body = fixtures.valid_messages()
        self.assertEqual({'type': 'disabled'}, body['thinking'])
        body.update(model='worker-alias', tool_choice={'type': 'tool', 'name': 'blog_read_public',
                                                       'disable_parallel_tool_use': True})
        result = await proxy(body)
        self.assertEqual(result['stop_reason'], 'tool_use')
        self.assertEqual({'input_tokens': 20, 'output_tokens': 12}, result['usage'])
        self.assertFalse(any(key in result for key in ('reasoning', 'reasoning_content', 'annotations', 'audio', 'function_call')))
        self.assertFalse(fixtures.SYNTHETIC_REASONING in json.dumps(result))
        self.assertEqual([('models.example.com', 443)], factory.dns)
        self.assertEqual(1, len(factory.requests))
        request = factory.requests[0]
        self.assertEqual(('POST', 'https', '1.1.1.1', '/v1/chat/completions'),
            (request.method, request.url.scheme, request.url.host, request.url.path))
        self.assertEqual('models.example.com', request.headers['host'])
        self.assertEqual('identity', request.headers['accept-encoding'])
        self.assertEqual('models.example.com', request.extensions['sni_hostname'])
        self.assertTrue(request.headers['authorization'] == 'Bearer synthetic-private-model-key')
        payload = json.loads(request.content)
        self.assertNotIn('thinking', payload)
        self.assertNotIn('output_config', payload)
        self.assertNotIn('chat_template_kwargs', payload)
        self.assertEqual(('fixture-model', 1024, False), (payload['model'], payload['max_tokens'], payload['stream']))
        self.assertEqual({'type': 'function', 'function': {'name': 'blog_read_public'}}, payload['tool_choice'])
        self.assertFalse(payload['parallel_tool_calls'])
        self.assertEqual(['system', 'user', 'assistant', 'tool', 'user'], [row['role'] for row in payload['messages']])
        self.assertEqual({'blog_read_public', 'blog_search_public'}, {tool['function']['name'] for tool in payload['tools']})
        self.assertFalse(factory.options[0]['trust_env'])
        self.assertFalse(factory.options[0]['follow_redirects'])
        self.assertEqual(65536, factory.constructed[0]['max_stream_bytes'])
        self.assertEqual(30, factory.options[0]['timeout'].read)
        self.assertTrue(factory.closed and factory.clients[0].is_closed)

    async def test_invalid_complete_request_faults_never_construct_a_provider(self):
        faults = [
            (('tools', 1, 'name'), 'blog_search_public'),
            (('tools', 1, 'name'), 'write_file'),
            (('tools', 1, 'description'), 1),
            (('tools', 1, 'input_schema', 'type'), 'array'),
            (('tools', 1, 'input_schema', 'properties'), []),
            (('max_tokens',), True), (('max_tokens',), 0), (('max_tokens',), 1025),
            (('stream',), 'false'), (('temperature',), float('nan')),
            (('temperature',), 10**400), (('top_p',), 1.1),
            (('tool_choice',), {'type': 'tool', 'name': 'write_file'}),
            (('tool_choice',), {'type': 'auto', 'disable_parallel_tool_use': 1}),
            (('base_url',), 'https://private.invalid'), (('limits',), {'max_output_tokens': 999999}),
            (('thinking',), {'type': 'enabled'}),
            (('thinking',), {'type': 'disabled', 'budget_tokens': 0}),
            (('thinking',), None), (('thinking',), 'disabled'),
            (('output_config',), {'effort': 'off'}),
        ]
        for path, value in faults:
            with self.subTest(path=path):
                factory = WireFactory(lambda _: response())
                proxy = StructuredModelProxy(config(), provider_factory=factory)
                body = fixtures.valid_messages()
                fixtures.set_path(body, path, value)
                with self.assertRaisesRegex(ValueError, '^' + INPUT_INVALID + '$'):
                    await proxy(body)
                self.assertEqual([], factory.constructed)
                self.assertEqual([], factory.clients)
        for count in (1, 3):
            factory = WireFactory(lambda _: response())
            body = fixtures.valid_messages()
            body['tools'] = (body['tools'] * 2)[:count]
            with self.assertRaises(ValueError):
                await StructuredModelProxy(config(), provider_factory=factory)(body)
            self.assertEqual([], factory.constructed)

    async def test_wire_request_bytes_are_canonical_utf8_not_an_unbounded_json_reencoding(self):
        body = fixtures.valid_messages()
        body['system'] = '界' * 42000
        factory = WireFactory(lambda _: response())
        await StructuredModelProxy(config(), provider_factory=factory)(body)
        raw = factory.requests[0].content
        self.assertTrue(126000 <= len(raw) <= 131072)
        self.assertIn('界'.encode(), raw)
        self.assertNotIn(b'\\u754c', raw)
        self.assertEqual('application/json', factory.requests[0].headers['content-type'])

    async def test_shared_policy_rejects_blocked_dns_and_unapproved_host_before_client(self):
        for addresses, base_url in ((('127.0.0.1',), 'https://models.example.com/v1'),
                                    (('1.1.1.1', '169.254.169.254'), 'https://models.example.com/v1'),
                                    (('1.1.1.1',), 'https://unapproved.example.com/v1')):
            factory = WireFactory(lambda _: response(), addresses=addresses)
            with self.assertRaisesRegex(RuntimeError, '^AGENT_MODEL_FAILED$'):
                await StructuredModelProxy(config(base_url=base_url), provider_factory=factory)(fixtures.valid_messages())
            self.assertEqual([], factory.clients)
            self.assertEqual([], factory.requests)

    async def test_redirect_http_error_compression_and_driver_diagnostics_never_retry(self):
        def private_error(_):
            raise OSError('synthetic-private-provider-diagnostic')
        handlers = [
            lambda _: httpx.Response(302, headers={'location': 'https://other.invalid'}, content=b'{}'),
            lambda _: httpx.Response(429, content=b'synthetic-private-provider-diagnostic'),
            lambda _: httpx.Response(200, headers={'content-encoding': 'gzip'}, content=b'not-gzip'),
            private_error,
        ]
        for handler in handlers:
            factory = WireFactory(handler)
            with self.assertRaisesRegex(RuntimeError, '^AGENT_MODEL_FAILED$') as caught:
                await StructuredModelProxy(config(), provider_factory=factory)(fixtures.valid_messages())
            self.assertEqual(1, len(factory.requests))
            self.assertTrue(factory.closed and factory.clients[0].is_closed)
            self.assertNotIn('private-provider', repr(caught.exception))
            self.assertTrue(caught.exception.__suppress_context__)

    async def test_duplicate_utf8_and_nonfinite_response_faults_are_not_normalized(self):
        value = fixtures.valid_response()
        raw = json.dumps(value, ensure_ascii=False).encode()
        duplicate = b'{"id":"chatcmpl_fixture",' + raw[1:]
        invalid_utf8 = raw.replace(b'Public answer.', b'Public \xffnswer.')
        nonfinite = raw[:-1] + b',"extra":NaN}'
        for fault in (duplicate, invalid_utf8, nonfinite):
            factory = WireFactory(lambda _, fault=fault: httpx.Response(200, content=fault))
            with self.assertRaisesRegex(ValueError, '^' + RESPONSE_INVALID + '$'):
                await StructuredModelProxy(config(), provider_factory=factory)(fixtures.valid_messages())
            self.assertEqual(1, len(factory.requests))
            self.assertTrue(factory.closed)

    async def test_actual_policy_response_stream_limit_is_64k_with_and_without_content_length(self):
        value = fixtures.valid_response()
        value['extra'] = 'x' * 65536
        raw = json.dumps(value).encode()
        class Chunks(httpx.AsyncByteStream):
            def __init__(self):
                self.closed = False
            async def __aiter__(self):
                yield raw[:32768]
                yield raw[32768:]
            async def aclose(self):
                self.closed = True
        for advertised in (False, True):
            chunks = Chunks()
            headers = {'content-length': str(len(raw))} if advertised else {}
            factory = WireFactory(lambda _: httpx.Response(200, headers=headers, stream=chunks))
            with self.assertRaisesRegex(RuntimeError, '^AGENT_MODEL_RESPONSE_TOO_LARGE$'):
                await StructuredModelProxy(config(), provider_factory=factory)(fixtures.valid_messages())
            self.assertEqual(1, len(factory.requests))
            self.assertTrue(chunks.closed)
            self.assertTrue(factory.closed and factory.clients[0].is_closed)

    async def test_unknown_usage_and_exceeded_requested_output_are_rejected_after_one_attempt(self):
        for usage in ({'prompt_tokens': 20, 'completion_tokens': None},
                      {'prompt_tokens': 20}, {'prompt_tokens': 20, 'completion_tokens': 17}):
            value = fixtures.valid_response()
            value['usage'] = usage
            factory = WireFactory(lambda _: response(value))
            body = fixtures.valid_messages()
            body['max_tokens'] = 16
            with self.assertRaisesRegex(ValueError, '^' + RESPONSE_INVALID + '$'):
                await StructuredModelProxy(config(), provider_factory=factory)(body)
            self.assertEqual(1, len(factory.requests))
            self.assertTrue(factory.closed)

    async def test_response_model_and_tool_id_must_match_this_request_context(self):
        for change in ('wrong_model', 'reused_history_call'):
            value = fixtures.valid_response(tools=True)
            if change == 'wrong_model':
                value['model'] = 'another-model'
            else:
                value['choices'][0]['message']['tool_calls'][0]['id'] = 'c1'
            factory = WireFactory(lambda _: response(value))
            with self.assertRaisesRegex(ValueError, '^' + RESPONSE_INVALID + '$'):
                await StructuredModelProxy(config(), provider_factory=factory)(fixtures.valid_messages())
            self.assertEqual(1, len(factory.requests))
            self.assertTrue(factory.closed)

    async def test_neutral_metadata_wire_accepts_only_supported_shapes_and_keeps_usage(self):
        for field, value in (('annotations', [{}]), ('audio', {}),
                             ('function_call', {'name': 'blog_read_public', 'arguments': '{}'}),
                             ('reasoning', []), ('reasoning_content', 'Conflicting nonempty alias.')):
            result = fixtures.valid_response(tools=True)
            result['choices'][0]['message'][field] = value
            factory = WireFactory(lambda _: response(result))
            with self.assertRaisesRegex(ValueError, '^' + RESPONSE_INVALID + '$'):
                await StructuredModelProxy(config(), provider_factory=factory)(fixtures.valid_messages())
            self.assertEqual(1, len(factory.requests))
            self.assertTrue(factory.closed)
        for extra in ({'annotations': []}, {'reasoning_content': fixtures.SYNTHETIC_REASONING}):
            result = fixtures.valid_response(tools=True)
            result['choices'][0]['message'].update(extra)
            factory = WireFactory(lambda _: response(result))
            converted = await StructuredModelProxy(config(), provider_factory=factory)(fixtures.valid_messages())
            self.assertEqual({'input_tokens': 20, 'output_tokens': 12}, converted['usage'])
            self.assertEqual('c2', converted['content'][1]['id'])
            self.assertFalse(fixtures.SYNTHETIC_REASONING in json.dumps(converted))
            self.assertEqual(1, len(factory.requests))

    async def test_timeout_and_total_deadline_are_fixed_and_release_the_client(self):
        def timeout(_):
            raise httpx.ReadTimeout('synthetic-private-timeout')
        factory = WireFactory(timeout)
        with self.assertRaisesRegex(RuntimeError, '^AGENT_MODEL_TIMEOUT$'):
            await StructuredModelProxy(config(), provider_factory=factory)(fixtures.valid_messages())
        self.assertEqual(1, len(factory.requests))
        self.assertTrue(factory.closed)
        async def stalled(_):
            await asyncio.Event().wait()
        factory = WireFactory(stalled)
        real_timeout = asyncio.timeout
        with patch.object(model_proxy.asyncio, 'timeout', side_effect=lambda _: real_timeout(.02)):
            with self.assertRaisesRegex(RuntimeError, '^AGENT_MODEL_TIMEOUT$'):
                await StructuredModelProxy(config(), provider_factory=factory)(fixtures.valid_messages())
        self.assertEqual(1, len(factory.requests))
        self.assertTrue(factory.closed and factory.clients[0].is_closed)

    async def test_repeated_cancellation_drains_inflight_request_and_client_close(self):
        entered, aborted = asyncio.Event(), asyncio.Event()
        async def stalled(_):
            try:
                entered.set()
                await asyncio.Event().wait()
            finally:
                aborted.set()
        factory = WireFactory(stalled)
        factory.close_gate = asyncio.Event()
        task = asyncio.create_task(StructuredModelProxy(config(), provider_factory=factory)(fixtures.valid_messages()))
        try:
            await asyncio.wait_for(entered.wait(), 1)
            task.cancel()
            await asyncio.wait_for(factory.close_started.wait(), 1)
            task.cancel()
            await asyncio.sleep(0)
            self.assertFalse(task.done())
            factory.close_gate.set()
            with self.assertRaises(asyncio.CancelledError):
                await asyncio.wait_for(task, 1)
            self.assertTrue(aborted.is_set())
            self.assertTrue(factory.closed and factory.clients[0].is_closed)
            self.assertEqual(1, len(factory.requests))
        finally:
            factory.close_gate.set()
            if not task.done():
                task.cancel()
            await asyncio.gather(task, return_exceptions=True)

    async def test_cancellation_during_client_entry_still_closes_its_transport(self):
        factory = WireFactory(lambda _: response())
        factory.entry_gate = asyncio.Event()
        task = asyncio.create_task(StructuredModelProxy(config(), provider_factory=factory)(fixtures.valid_messages()))
        try:
            await asyncio.wait_for(factory.entry_started.wait(), 1)
            task.cancel()
            with self.assertRaises(asyncio.CancelledError):
                await asyncio.wait_for(task, 1)
            self.assertEqual([], factory.requests)
            self.assertTrue(factory.closed and factory.clients[0].is_closed)
        finally:
            factory.entry_gate.set()
            if not task.done():
                task.cancel()
            await asyncio.gather(task, return_exceptions=True)


if __name__ == '__main__':
    unittest.main()
