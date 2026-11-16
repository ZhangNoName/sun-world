"""Offline counted Responses capabilities and two-request wire/ownership checks."""

import asyncio
import copy
from dataclasses import FrozenInstanceError
import gc
import hashlib
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
import weakref

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import test_openai_responses as fixtures
from src.modules.ai import openai_responses as adapter
from src.modules.ai.model_proxy import StructuredModelProxy
from src.modules.ai.public import MODEL_INPUT_LIMITS, ModelInputMetadata, is_counted_model_proxy

PRIVATE = fixtures.PRIVATE


def counted(tokens=20):
    return httpx.Response(200, json={'object': 'response.input_tokens', 'input_tokens': tokens})


def proxy(*, count_handler=None, handler=None):
    factory = fixtures.OfficialWire(handler or (lambda _: httpx.Response(200, json=fixtures.result())),
        count_handler=count_handler)
    return adapter.OpenAiResponsesProxy(fixtures.config(), provider_factory=factory), factory


class InputMetadataTests(unittest.TestCase):
    def test_limits_and_metadata_are_exact_frozen_and_legacy_proxies_cannot_claim_counting(self):
        self.assertEqual((16384, 32768, 8, 4096), (MODEL_INPUT_LIMITS.max_input_tokens,
            MODEL_INPUT_LIMITS.max_run_input_tokens, MODEL_INPUT_LIMITS.count_timeout_seconds,
            MODEL_INPUT_LIMITS.max_count_response_bytes))
        value = ModelInputMetadata(2147483647, 'a' * 64, 'b' * 64)
        self.assertEqual(['input_tokens', 'wire_request_hash', 'count_request_hash'], list(value.__dataclass_fields__))
        with self.assertRaises(FrozenInstanceError):
            value.input_tokens = 0
        with self.assertRaises(FrozenInstanceError):
            MODEL_INPUT_LIMITS.max_input_tokens = 99999
        for tokens in (True, 0, -1, 2147483648):
            with self.assertRaises(ValueError):
                ModelInputMetadata(tokens, 'a' * 64, 'b' * 64)
        for digest in ('a' * 63, 'A' * 64, PRIVATE):
            with self.assertRaises(ValueError):
                ModelInputMetadata(20, digest, 'a' * 64)
        class Fake:
            async def prepare(self, body):
                return object()
        self.assertFalse(is_counted_model_proxy(Fake()))
        self.assertFalse(is_counted_model_proxy(StructuredModelProxy(fixtures.config())))
        self.assertFalse(is_counted_model_proxy(adapter.OpenAiCompatibleProvider(fixtures.config(), max_output_tokens=1024)))
        self.assertTrue(is_counted_model_proxy(proxy()[0]))


class PreparedInputTests(unittest.IsolatedAsyncioTestCase):
    async def test_actual_count_and_generation_wires_match_tools_history_and_metadata_hashes(self):
        value, factory = proxy(handler=lambda _: httpx.Response(200, json=fixtures.result(tools=True)))
        body = fixtures.messages(history=True)
        body['tool_choice'] = {'type': 'tool', 'name': 'blog_read_public'}
        handle = await value.prepare(body)
        self.assertEqual(1, len(factory.count_requests))
        self.assertEqual([], factory.generation_requests)
        self.assertTrue(factory.clients[0].is_closed)
        meta = value.input_metadata(handle)
        body['messages'][0]['content'] = PRIVATE
        body['tools'][0]['input_schema'] = {'type': 'invalid'}
        body['max_tokens'] = 1
        result = await value.generate(handle)
        self.assertEqual('tool_use', result['stop_reason'])
        count_wire, generation_wire = (factory.count_requests[0].content, factory.generation_requests[0].content)
        counting, generation = json.loads(count_wire), json.loads(generation_wire)
        self.assertEqual(counting, {key: item for key, item in generation.items()
            if key not in ('max_output_tokens', 'store', 'stream')})
        self.assertEqual({'max_output_tokens', 'store', 'stream'}, generation.keys() - counting.keys())
        self.assertEqual('disabled', counting['truncation'])
        self.assertEqual({'effort': 'low'}, counting['reasoning'])
        self.assertFalse(counting['parallel_tool_calls'])
        self.assertEqual({'type': 'function', 'name': 'blog_read_public'}, counting['tool_choice'])
        self.assertEqual({'blog_read_public', 'blog_search_public'}, {tool['name'] for tool in counting['tools']})
        self.assertEqual('c1', counting['input'][2]['call_id'])
        self.assertEqual('c1', counting['input'][3]['call_id'])
        self.assertEqual('公开文章', counting['input'][3]['output'])
        self.assertNotIn(PRIVATE, generation_wire.decode())
        self.assertEqual(1024, generation['max_output_tokens'])
        self.assertEqual(meta.wire_request_hash, hashlib.sha256(generation_wire).hexdigest())
        self.assertEqual(meta.count_request_hash, hashlib.sha256(count_wire).hexdigest())
        self.assertEqual(generation_wire, json.dumps(generation, sort_keys=True, ensure_ascii=False,
            allow_nan=False, separators=(',', ':')).encode())
        self.assertTrue(all(client.is_closed for client in factory.clients))

    async def test_count_protocol_single_faults_do_not_issue_a_handle_or_generate(self):
        valid = {'object': 'response.input_tokens', 'input_tokens': 20}
        faults = [{**valid, 'input_tokens': value} for value in (True, 0, -1, 1.5, 2147483648, None)]
        faults += [{**valid, 'object': 'response'}, {**valid, PRIVATE: PRIVATE}, {'object': 'response.input_tokens'}]
        raw = json.dumps(valid).encode()
        bodies = [json.dumps(item).encode() for item in faults] + [b'{"input_tokens":20,' + raw[1:],
            raw.replace(b'20', b'NaN'), raw.replace(b'response.input_tokens', b'\xff'), b'[' * 40 + raw + b']' * 40]
        for index, body in enumerate(bodies):
            with self.subTest(index=index):
                value, factory = proxy(count_handler=lambda _, body=body: httpx.Response(200, content=body))
                with self.assertLogs(adapter.LOGGER, level='WARNING') as logs:
                    with self.assertRaisesRegex(ValueError, '^AGENT_MODEL_RESPONSE_INVALID$'):
                        await value.prepare(fixtures.messages())
                self.assertNotIn(PRIVATE, '\n'.join(logs.output))
                self.assertEqual(1, len(factory.count_requests))
                self.assertEqual([], factory.generation_requests)
                self.assertEqual(0, len(value._prepared._states))
                self.assertTrue(factory.clients[0].is_closed)

    async def test_legal_count_over_cap_is_visible_but_generation_consumes_and_rejects_before_dns(self):
        for tokens in (16385, 2147483647):
            value, factory = proxy(count_handler=lambda _: counted(tokens))
            handle = await value.prepare(fixtures.messages())
            self.assertEqual(tokens, value.input_metadata(handle).input_tokens)
            for _ in range(2):
                with self.assertRaisesRegex(ValueError, '^AGENT_MODEL_INPUT_INVALID$'):
                    await value.generate(handle)
            self.assertEqual(1, len(factory.dns))
            self.assertEqual([], factory.generation_requests)

    async def test_forged_copied_cross_issuer_and_reused_handles_fail_before_dns(self):
        value, factory = proxy()
        handle = await value.prepare(fixtures.messages())
        self.assertFalse(hasattr(handle, '__dict__'))
        with self.assertRaises(AttributeError):
            handle.input_tokens = 20
        other, other_factory = proxy()
        for forged in (object(), value.input_metadata(handle), type(handle)(), copy.copy(handle), copy.deepcopy(handle)):
            with self.assertRaises(ValueError):
                value.input_metadata(forged)
            with self.assertRaises(ValueError):
                await value.generate(forged)
        with self.assertRaises(ValueError):
            other.input_metadata(handle)
        with self.assertRaises(ValueError):
            await other.generate(handle)
        copied_proxy = copy.copy(value)
        with self.assertRaises(ValueError):
            copied_proxy.input_metadata(handle)
        with self.assertRaises(ValueError):
            await copied_proxy.generate(handle)
        with self.assertRaises(ValueError):
            await copied_proxy.prepare(fixtures.messages())
        self.assertEqual([], other_factory.dns)
        self.assertEqual(1, len(factory.dns))
        await value.generate(handle)
        with self.assertRaises(ValueError):
            await value.generate(handle)
        self.assertEqual(1, len(factory.generation_requests))
        self.assertEqual(2, len(factory.dns))

    async def test_input_validation_precedes_count_dns_and_exact_token_cap_can_generate(self):
        value, factory = proxy()
        body = fixtures.messages()
        body['temperature'] = 1
        with self.assertRaisesRegex(ValueError, '^AGENT_MODEL_INPUT_INVALID$'):
            await value.prepare(body)
        self.assertEqual([], factory.constructed)
        self.assertEqual([], factory.dns)
        response = fixtures.result()
        response['usage'].update(input_tokens=16384, total_tokens=16396)
        value, factory = proxy(count_handler=lambda _: counted(16384),
            handler=lambda _: httpx.Response(200, json=response))
        result = await value(fixtures.messages())
        self.assertEqual(16384, result['usage']['input_tokens'])
        self.assertEqual(1, len(factory.count_requests))
        self.assertEqual(1, len(factory.generation_requests))

    async def test_handle_gc_releases_issuer_wire_state_even_when_metadata_is_retained(self):
        value, _ = proxy()
        handle = await value.prepare(fixtures.messages())
        metadata = value.input_metadata(handle)
        observed = weakref.ref(handle)
        self.assertEqual(1, len(value._prepared._states))
        del handle
        gc.collect()
        self.assertIsNone(observed())
        self.assertEqual(0, len(value._prepared._states))
        self.assertEqual(20, metadata.input_tokens)

    async def test_concurrent_generate_consumes_once_before_either_network_attempt(self):
        entered, gate = asyncio.Event(), asyncio.Event()
        async def generating(_):
            entered.set()
            await gate.wait()
            return httpx.Response(200, json=fixtures.result())
        value, factory = proxy(handler=generating)
        handle = await value.prepare(fixtures.messages())
        first = asyncio.create_task(value.generate(handle))
        try:
            await asyncio.wait_for(entered.wait(), 1)
            with self.assertRaises(ValueError):
                await value.generate(handle)
            self.assertEqual(1, len(factory.generation_requests))
            gate.set()
            await asyncio.wait_for(first, 1)
        finally:
            gate.set()
            if not first.done():
                first.cancel()
            await asyncio.gather(first, return_exceptions=True)

    async def test_usage_mismatch_and_failed_generation_never_return_or_reuse(self):
        mismatched = fixtures.result()
        mismatched['usage'].update(input_tokens=21, total_tokens=33)
        for response in (httpx.Response(200, json=mismatched), httpx.Response(401, content=PRIVATE.encode())):
            value, factory = proxy(handler=lambda _: response)
            handle = await value.prepare(fixtures.messages())
            with self.assertRaises((ValueError, RuntimeError)):
                await value.generate(handle)
            with self.assertRaises(ValueError):
                await value.generate(handle)
            self.assertEqual(1, len(factory.generation_requests))
            self.assertTrue(all(client.is_closed for client in factory.clients))

    async def test_count_response_actual_stream_cap_with_and_without_length(self):
        raw = json.dumps({'object': 'response.input_tokens', 'input_tokens': 20, 'extra': 'x' * 4096}).encode()
        class Chunks(httpx.AsyncByteStream):
            def __init__(self):
                self.closed = False
            async def __aiter__(self):
                yield raw[:2048]
                yield raw[2048:]
            async def aclose(self):
                self.closed = True
        for advertised in (True, False):
            chunks = Chunks()
            headers = {'content-length': str(len(raw))} if advertised else {}
            value, factory = proxy(count_handler=lambda _: httpx.Response(200, headers=headers, stream=chunks))
            with self.assertRaisesRegex(RuntimeError, '^AGENT_MODEL_RESPONSE_TOO_LARGE$'):
                await value.prepare(fixtures.messages())
            self.assertTrue(chunks.closed)
            self.assertTrue(factory.clients[0].is_closed)
            self.assertEqual([], factory.generation_requests)

    async def test_count_timeout_and_combined_count_generation_deadline_close_clients(self):
        async def stalled(_):
            await asyncio.Event().wait()
        value, factory = proxy(count_handler=stalled)
        real_timeout = asyncio.timeout
        with patch.object(adapter.asyncio, 'timeout', side_effect=lambda seconds: real_timeout(.02 if seconds == 8 else 1)):
            with self.assertRaisesRegex(RuntimeError, '^AGENT_MODEL_TIMEOUT$'):
                await value.prepare(fixtures.messages())
        self.assertTrue(factory.clients[0].is_closed)
        async def delayed_count(_):
            await asyncio.sleep(.02)
            return counted()
        async def delayed_generation(_):
            await asyncio.sleep(.02)
            return httpx.Response(200, json=fixtures.result())
        value, factory = proxy(count_handler=delayed_count, handler=delayed_generation)
        with patch.object(adapter.asyncio, 'timeout', side_effect=lambda seconds: real_timeout(.03 if seconds == 30 else 1)):
            with self.assertRaisesRegex(RuntimeError, '^AGENT_MODEL_TIMEOUT$'):
                await value(fixtures.messages())
        self.assertEqual(1, len(factory.count_requests))
        self.assertEqual(1, len(factory.generation_requests))
        self.assertTrue(all(client.is_closed for client in factory.clients))

    async def test_prepare_close_cancel_and_entry_cancel_never_issue_handles(self):
        for entry in (False, True):
            value, factory = proxy()
            gate = asyncio.Event()
            if entry:
                factory.entry_gate, started = gate, factory.entry_started
            else:
                factory.close_gate, started = gate, factory.close_started
            task = asyncio.create_task(value.prepare(fixtures.messages()))
            try:
                await asyncio.wait_for(started.wait(), 1)
                task.cancel()
                await asyncio.sleep(0)
                task.cancel()
                if not entry:
                    await asyncio.sleep(0)
                    self.assertFalse(task.done())
                gate.set()
                with self.assertRaises(asyncio.CancelledError):
                    await asyncio.wait_for(task, 1)
            finally:
                gate.set()
                if not task.done():
                    task.cancel()
                await asyncio.gather(task, return_exceptions=True)
            self.assertEqual(0, len(value._prepared._states))
            self.assertTrue(factory.clients[0].is_closed)
            self.assertEqual([], factory.generation_requests)

    async def test_failed_count_close_and_cancelled_failed_close_do_not_issue_handles(self):
        value, factory = proxy()
        gate, started = asyncio.Event(), asyncio.Event()
        def closing(_):
            original = factory.clients[-1].aclose
            async def failed_close():
                started.set()
                await gate.wait()
                await original()
                raise OSError(PRIVATE)
            factory.clients[-1].aclose = failed_close
            return counted()
        factory.handler = closing  # WireFactory send dynamically reads handler.
        gate.set()
        with self.assertRaisesRegex(RuntimeError, '^AGENT_MODEL_FAILED$'):
            await value.prepare(fixtures.messages())
        self.assertEqual(0, len(value._prepared._states))
        gate.clear()
        started.clear()
        task = asyncio.create_task(value.prepare(fixtures.messages()))
        try:
            await asyncio.wait_for(started.wait(), 1)
            task.cancel()
            await asyncio.sleep(0)
            task.cancel()
            gate.set()
            with self.assertRaises(asyncio.CancelledError):
                await asyncio.wait_for(task, 1)
        finally:
            gate.set()
            if not task.done():
                task.cancel()
            await asyncio.gather(task, return_exceptions=True)
        self.assertEqual(0, len(value._prepared._states))
        self.assertTrue(all(client.is_closed for client in factory.clients))


if __name__ == '__main__':
    unittest.main()
