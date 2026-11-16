"""Real anonymous pipes/PTY; synthetic proxy only, no provider/config discovery."""

import asyncio
import hashlib
import json
import logging
import os
from pathlib import Path
import struct
import sys
import tempfile
import termios
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'apps/api'))
sys.path.insert(0, str(ROOT / 'apps/api/tests/integration'))
import official_channel_codec as codec
import official_channel_broker as broker_module
from official_channel_guest import OfficialChannelGuest, configure_raw_terminal, drain
from official_channel_broker import serve_official_channel
from src.modules.ai.openai_responses import responses_payload

MARKER = 'SYNTHETIC_PRIVATE_REASONING_NEVER_IN_SUMMARY'
ERROR = '^AGENT_OFFICIAL_CHANNEL_FAILED$'


def wires():
    body = {'max_tokens': 1024, 'thinking': {'type': 'disabled'}, 'stream': False,
        'system': 'Synthetic public sources only.', 'messages': [
            {'role': 'user', 'content': 'Question'},
            {'role': 'assistant', 'content': [{'type': 'tool_use', 'id': 'call_1',
                'name': 'blog_read_public', 'input': {'article_id': 1}}]},
            {'role': 'user', 'content': [{'type': 'tool_result', 'tool_use_id': 'call_1',
                'content': 'Synthetic article'}, {'type': 'text', 'text': 'Answer'}]}],
        'tools': [{'name': name, 'description': 'Public read only.',
            'input_schema': {'type': 'object', 'properties': {key: {'type': kind}}, 'required': [key]}}
            for name, key, kind in [('blog_search_public', 'query', 'string'),
                ('blog_read_public', 'article_id', 'integer')]]}
    generation = responses_payload(body)
    counting = {key: value for key, value in generation.items()
        if key not in ('max_output_tokens', 'store', 'stream')}
    return codec.canonical(counting), codec.canonical(generation)


def result(tokens=20):
    return {'id': 'resp_synthetic', 'object': 'response', 'model': 'gpt-6.1-sol',
        'status': 'completed', 'error': None, 'incomplete_details': None,
        'output': [{'type': 'reasoning', 'summary': [{'text': MARKER}]},
            {'type': 'message', 'role': 'assistant', 'status': 'completed',
                'phase': 'final_answer', 'content': [{'type': 'output_text', 'text': 'Public answer.'}]}],
        'usage': {'input_tokens': tokens, 'output_tokens': 12, 'total_tokens': tokens + 12}}


class FakeProxy:
    def __init__(self):
        self.calls = []
        self.started, self.closing, self.release = asyncio.Event(), asyncio.Event(), asyncio.Event()
        self.block = False
        self.tokens = 20

    async def _post(self, raw, *, counting):
        self.calls.append((raw, counting))
        self.started.set()
        if self.block:
            try:
                await asyncio.Future()
            finally:
                self.closing.set()
                await self.release.wait()
        return {'object': 'response.input_tokens', 'input_tokens': 20} if counting else result(self.tokens)


class CodecTests(unittest.TestCase):
    def test_strict_envelopes_base64_and_limits(self):
        raw = b'\x00\r\n\xff'
        self.assertEqual(codec.decode_request(codec.encode_request(64, 'evaluation', raw)), (64, 'evaluation', raw))
        valid = codec.encode_request(1, 'probe')
        value = json.loads(valid)
        for bad in ({**value, 'id': True}, {**value, 'id': 0}, {**value, 'id': 65},
                {**value, 'op': ['count']}, {**value, 'url': MARKER},
                {**value, 'payload': 'AA=='}, {**value, 'version': MARKER},
                {**value, 'op': 'count', 'payload': 'AB=='},
                {**value, 'op': 'count', 'payload': 'AA==\n'}):
            with self.assertRaisesRegex(RuntimeError, ERROR):
                codec.decode_request(codec.canonical(bad))
        for bad in (b'{"id":1,"id":1}', valid.replace(b'"id":1', b'"id":NaN'), b'\xff'):
            with self.assertRaisesRegex(RuntimeError, ERROR):
                codec.decode_request(bad)
        codec.encode_request(1, 'count', b'x' * 262144)
        with self.assertRaisesRegex(RuntimeError, ERROR):
            codec.encode_request(1, 'count', b'x' * 262145)
        codec.encode_response(1, 'ok', b'x' * 65536)
        for op, size in [('count', 4097), ('generate', 65537)]:
            with self.assertRaisesRegex(RuntimeError, ERROR):
                codec.encode_response(1, 'ok', b'x' * size, op=op)
        with self.assertRaisesRegex(RuntimeError, ERROR):
            codec.encode_response(1, 'failed', b'not-empty')

    def test_diagnostic_records_are_typed_bounded_and_never_formatted(self):
        events, good = [], ('count_request', 429, 'AGENT_MODEL_TIMEOUT', 42)
        handler = broker_module._FailureDiagnostics(events)
        for message, args in [(MARKER, good), (broker_module.DIAGNOSTIC_MESSAGE, good),
                (broker_module.DIAGNOSTIC_MESSAGE, (MARKER, 200, good[2], 1)),
                (broker_module.DIAGNOSTIC_MESSAGE, (good[0], True, good[2], 1)),
                (broker_module.DIAGNOSTIC_MESSAGE, (good[0], 600, good[2], 1)),
                (broker_module.DIAGNOSTIC_MESSAGE, (good[0], None, MARKER, 1)),
                (broker_module.DIAGNOSTIC_MESSAGE, (good[0], None, good[2], True))]:
            context = {'active': True, 'candidate': None}
            token = broker_module._DIAGNOSTIC.set(context)
            record = logging.LogRecord('synthetic', logging.WARNING, '', 0, message, args, None)
            try:
                with patch.object(record, 'getMessage', side_effect=AssertionError(MARKER)) as format_record:
                    handler.emit(record)
                    format_record.assert_not_called()
                self.assertEqual(context['candidate'] == (good[0], good[2], good[1], good[3]),
                    message == broker_module.DIAGNOSTIC_MESSAGE and args == good)
            finally:
                broker_module._DIAGNOSTIC.reset(token)
        for identity in range(1, 65):
            handler.add(identity, 'count', 'upstream', 'AGENT_MODEL_FAILED')
            handler.add(identity, 'count', 'channel', 'AGENT_CHANNEL_INVALID')
        self.assertEqual(len(events), 64)
        self.assertTrue(all(set(row) == {'id', 'op', 'stage', 'category', 'status', 'line'} for row in events))
        self.assertNotIn(MARKER, json.dumps(events))


class ChannelTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.frames, self.servers = [], []
        temporary = tempfile.TemporaryDirectory(prefix='official-channel-unit-', dir=ROOT / '.tmp')
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name).resolve()

    async def asyncTearDown(self):
        for server in self.servers:
            if not server.done():
                server.cancel()
            try:
                await drain(server)
            except (Exception, asyncio.CancelledError):
                pass
        for frames in self.frames:
            try:
                await frames.aclose()
            except Exception:
                pass

    def pair(self):
        request_read, request_write = os.pipe()
        response_read, response_write = os.pipe()
        guest = codec.AsyncFdFrames(response_read, request_write)
        host = codec.AsyncFdFrames(request_read, response_write)
        self.frames.extend((guest, host))
        return guest, host

    async def broker(self, proxy=None):
        guest, host = self.pair()
        evaluation, summary = self.root / 'evaluation.json', self.root / 'summary.json'
        for path in (evaluation, summary):
            descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            os.close(descriptor)
        proxy = proxy or FakeProxy()
        server = asyncio.create_task(serve_official_channel(host,
            evaluation_path=evaluation, summary_path=summary, proxy=proxy))
        self.servers.append(server)
        return OfficialChannelGuest(frames=guest), server, proxy, evaluation, summary

    async def test_short_reads_and_short_complete_writes_use_real_pipes(self):
        guest, host = self.pair()
        data = codec.encode_request(1, 'evaluation', b'payload')
        reading = asyncio.create_task(host.read_frame())
        wire = struct.pack('!I', len(data)) + data
        for byte in wire:
            os.write(guest.write_fd, bytes([byte]))
            await asyncio.sleep(0)
        self.assertEqual(await asyncio.wait_for(reading, 2), data)
        original = os.write
        with patch.object(codec.os, 'write', side_effect=lambda fd, raw: original(fd, raw[:7])):
            data = codec.encode_request(2, 'evaluation', b'x' * 100000)
            _, actual = await asyncio.gather(guest.write_frame(data), host.read_frame())
        self.assertTrue(actual == data)
        self.assertFalse(os.get_inheritable(guest.write_fd))

    async def test_truncated_and_oversized_frames_close_without_a_reader(self):
        for raw in (b'\x00\x00', struct.pack('!I', 5) + b'ab', struct.pack('!I', 400001)):
            guest, host = self.pair()
            os.write(guest.write_fd, raw)
            await guest.aclose()
            with self.assertRaisesRegex(RuntimeError, ERROR):
                await asyncio.wait_for(host.read_frame(), 2)
            self.assertTrue(host.closed)
            self.assertEqual(host._waiters, {})

    async def test_full_write_failure_closes_owned_descriptors(self):
        guest, host = self.pair()
        await host.aclose()
        with self.assertRaisesRegex(RuntimeError, ERROR):
            await guest.write_frame(codec.encode_request(1, 'probe'))
        self.assertTrue(guest.closed)
        self.assertEqual(guest._waiters, {})

    async def test_constructor_failure_releases_owned_fds_and_nonowned_close_keeps_them(self):
        read_fd, write_fd = os.pipe()
        with patch.object(codec.os, 'set_blocking', side_effect=OSError(MARKER)):
            with self.assertRaisesRegex(RuntimeError, ERROR):
                codec.AsyncFdFrames(read_fd, write_fd)
        for fd in (read_fd, write_fd):
            with self.assertRaises(OSError):
                os.fstat(fd)
        guest, _ = self.pair()
        nonowned = codec.AsyncFdFrames(guest.read_fd, guest.write_fd, own_fds=False)
        await nonowned.aclose()
        self.assertTrue(nonowned.closed)
        self.assertGreaterEqual(os.fstat(guest.read_fd).st_size, 0)

    async def test_cancelled_pipe_reader_preserves_cancel_when_close_ack_fails(self):
        guest, _ = self.pair()
        close = guest.aclose
        async def unknown_close():
            await close()
            raise OSError(MARKER)
        with patch.object(guest, 'aclose', side_effect=unknown_close):
            reading = asyncio.create_task(guest.read_frame())
            await asyncio.sleep(0)
            reading.cancel()
            with self.assertRaises(asyncio.CancelledError):
                await reading
        self.assertTrue(guest.closed)
        self.assertEqual(guest._waiters, {})

    async def test_raw_pty_roundtrip_preserves_control_bytes_without_echo_or_crlf(self):
        master, slave = os.openpty()
        configure_raw_terminal(slave)
        attrs = termios.tcgetattr(slave)
        self.assertEqual(attrs[3] & (termios.ECHO | termios.ICANON | termios.ISIG), 0)
        self.assertEqual(attrs[0] & (termios.IXON | termios.IXOFF | termios.ICRNL | termios.INLCR), 0)
        left, right = codec.AsyncFdFrames(master, master), codec.AsyncFdFrames(slave, slave)
        self.frames.extend((left, right))
        raw = b'\x00\x03\x04\n\r\x11\x13\x7f\xff' * 500
        _, actual = await asyncio.wait_for(asyncio.gather(left.write_frame(raw), right.read_frame()), 2)
        self.assertTrue(actual == raw)
        _, actual = await asyncio.wait_for(asyncio.gather(right.write_frame(b'response'), left.read_frame()), 2)
        self.assertEqual(actual, b'response')  # No echoed upload frame preceded it.

    async def test_probe_and_large_evaluation_have_no_upstream_request(self):
        guest, server, proxy, evaluation, summary_path = await self.broker()
        self.assertEqual(json.loads(await guest.request('probe')), {'ready': True})
        raw = codec.canonical({'version': 'sun-world-agent-model-report/1', 'cases': [],
            'evaluation_status': 'structural_failed', 'synthetic': 'x' * 70000})
        ack = json.loads(await guest.request('evaluation', raw))
        self.assertEqual(ack, {'sha256': hashlib.sha256(raw).hexdigest()})
        self.assertTrue(evaluation.read_bytes() == raw)
        await guest.aclose()
        summary = await asyncio.wait_for(server, 2)
        self.assertEqual(proxy.calls, [])
        self.assertTrue(summary['channel_eof'] and summary['close_confirmed'] and summary['evaluation_saved'])
        self.assertEqual(json.loads(summary_path.read_bytes()), summary)

    async def test_original_count_and_generation_wire_hashes_and_usage_match(self):
        guest, server, proxy, _, summary_path = await self.broker()
        count, generation = wires()
        await guest.request('count', count)
        response = json.loads(await guest.request('generate', generation))
        self.assertEqual(response['usage']['input_tokens'], 20)
        self.assertTrue(proxy.calls == [(count, True), (generation, False)])
        await guest.aclose()
        summary = await server
        rows = summary['successful_requests']
        self.assertEqual([row['op'] for row in rows], ['count', 'generate'])
        self.assertEqual([row['wire_sha256'] for row in rows], [hashlib.sha256(count).hexdigest(), hashlib.sha256(generation).hexdigest()])
        self.assertEqual([row['output_tokens'] for row in rows], [0, 12])
        self.assertEqual(summary['failure_events'], [])
        self.assertNotIn(MARKER.encode(), summary_path.read_bytes())

    async def test_binding_is_exact_single_use_and_usage_mismatch_returns_no_result(self):
        guest, server, proxy, _, _ = await self.broker()
        count, generation = wires()
        with self.assertRaisesRegex(RuntimeError, ERROR):
            await guest.request('generate', generation)
        await guest.request('count', count)
        mutated = json.loads(generation)
        mutated['input'][-1]['content'] = 'Different question'
        with self.assertRaisesRegex(RuntimeError, ERROR):
            await guest.request('generate', codec.canonical(mutated))
        proxy.tokens = 21
        with self.assertRaisesRegex(RuntimeError, ERROR):
            await guest.request('generate', generation)
        with self.assertRaisesRegex(RuntimeError, ERROR):
            await guest.request('generate', generation)
        self.assertEqual(len(proxy.calls), 2)
        await guest.aclose()
        summary = await server
        self.assertEqual(len(summary['successful_requests']), 1)

    async def test_complete_baseline_single_control_tool_and_history_faults_never_reach_proxy(self):
        guest, server, proxy, _, _ = await self.broker()
        count, generation = wires()
        await guest.request('count', count)
        mutations = [lambda v: v.update(model=MARKER), lambda v: v.update(url=MARKER),
            lambda v: v.update(max_output_tokens=1025), lambda v: v.update(store=True),
            lambda v: v.update(stream=True), lambda v: v.update(reasoning={'effort': 'high'}),
            lambda v: v['tools'][0].update(name=MARKER),
            lambda v: v['tools'][0].update(parameters={'type': 'object', 'properties': []}),
            lambda v: v['tools'][1].update(name=v['tools'][0]['name']),
            lambda v: v['input'][3].update(call_id='not-issued')]
        for mutate in mutations:
            value = json.loads(generation)
            mutate(value)
            with self.assertRaisesRegex(RuntimeError, ERROR):
                await guest.request('generate', codec.canonical(value))
        self.assertEqual(len(proxy.calls), 1)
        await guest.request('generate', generation)
        self.assertEqual(len(proxy.calls), 2)
        await guest.aclose()
        await server

    async def test_vm_quota_does_not_repeat_or_refund_requests(self):
        guest, server, proxy, _, _ = await self.broker()
        count, generation = wires()
        for _ in range(16):
            await guest.request('count', count)
            await guest.request('generate', generation)
        for op, raw in [('count', count), ('generate', generation)]:
            with self.assertRaisesRegex(RuntimeError, ERROR):
                await guest.request(op, raw)
        self.assertEqual(len(proxy.calls), 32)
        await guest.aclose()
        summary = await server
        self.assertEqual((summary['count_requests'], summary['generation_requests']), (16, 16))

    async def test_repeated_caller_cancel_waits_for_close_then_channel_is_reusable(self):
        proxy = FakeProxy()
        proxy.block = True
        guest, server, _, _, _ = await self.broker(proxy)
        request = asyncio.create_task(guest.request('count', wires()[0]))
        try:
            await asyncio.wait_for(proxy.started.wait(), 2)
            request.cancel()
            await asyncio.wait_for(proxy.closing.wait(), 2)
            request.cancel()
            await asyncio.sleep(0)
            self.assertFalse(request.done())
            proxy.release.set()
            with self.assertRaises(asyncio.CancelledError):
                await asyncio.wait_for(request, 2)
            self.assertFalse(guest.poisoned)
            self.assertEqual(json.loads(await guest.request('probe')), {'ready': True})
            self.assertEqual(len(proxy.calls), 1)
        finally:
            proxy.release.set()
        await guest.aclose()
        summary = await server
        self.assertEqual(summary['count_requests'], 1)
        self.assertEqual(summary['cancel_requests'], 1)

    async def test_late_cancel_after_success_drains_original_frame_without_duplicate_reply(self):
        guest, server, proxy, _, _ = await self.broker()
        original = guest._frames.read_frame
        received, release = asyncio.Event(), asyncio.Event()
        async def delayed():
            value = await original()
            received.set()
            await release.wait()
            return value
        with patch.object(guest._frames, 'read_frame', side_effect=delayed):
            request = asyncio.create_task(guest.request('count', wires()[0]))
            try:
                await asyncio.wait_for(received.wait(), 2)
                request.cancel()
                await asyncio.sleep(0)
                release.set()
                with self.assertRaises(asyncio.CancelledError):
                    await asyncio.wait_for(request, 2)
            finally:
                release.set()
        self.assertEqual(json.loads(await guest.request('probe')), {'ready': True})
        await guest.aclose()
        summary = await server
        self.assertEqual(len(proxy.calls), 1)
        self.assertEqual(summary['cancel_requests'], 1)

    async def test_wrong_final_identity_poison_closes_without_leftover_reader(self):
        guest_frames, peer = self.pair()
        guest = OfficialChannelGuest(frames=guest_frames)
        request = asyncio.create_task(guest.request('count', wires()[0]))
        identity, op, _ = codec.decode_request(await peer.read_frame())
        request.cancel()
        cancel_id, cancel_op, _ = codec.decode_request(await peer.read_frame())
        self.assertEqual((cancel_id, cancel_op), (identity, 'cancel'))
        await peer.write_frame(codec.encode_response(identity + 1, 'cancelled', op=op))
        with self.assertRaises(asyncio.CancelledError):
            await asyncio.wait_for(request, 2)
        self.assertTrue(guest.poisoned and guest_frames.closed)
        self.assertEqual(guest_frames._waiters, {})
        self.assertFalse(guest_frames._reading)
        with self.assertRaisesRegex(RuntimeError, ERROR):
            await guest.request('probe')

    async def test_provider_request_cap_remains_128k_inside_larger_channel_envelope(self):
        guest, server, proxy, _, _ = await self.broker()
        value = json.loads(wires()[0])
        value['input'][-1]['content'] = 'x' * 132000
        raw = codec.canonical(value)
        self.assertTrue(131072 < len(raw) < 262144)
        with self.assertRaisesRegex(RuntimeError, ERROR):
            await guest.request('count', raw)
        self.assertEqual(proxy.calls, [])
        await guest.aclose()
        await server

    async def test_host_eof_and_sigterm_style_cancel_drain_active_http_before_summary(self):
        for cancel_host in (False, True):
            if cancel_host:
                # A second independent owned fixture, never overwrite sinks.
                self.root = self.root / 'next'
                self.root.mkdir(mode=0o700)
            proxy = FakeProxy()
            proxy.block = True
            guest, server, _, _, summary_path = await self.broker(proxy)
            request = asyncio.create_task(guest.request('count', wires()[0]))
            try:
                await asyncio.wait_for(proxy.started.wait(), 2)
                if cancel_host:
                    server.cancel()
                else:
                    await guest._frames.aclose()
                await asyncio.wait_for(proxy.closing.wait(), 2)
                if cancel_host:
                    server.cancel()
                self.assertFalse(server.done())
                self.assertEqual(summary_path.stat().st_size, 0)
                proxy.release.set()
                if cancel_host:
                    with self.assertRaises(asyncio.CancelledError):
                        await asyncio.wait_for(server, 2)
                else:
                    await asyncio.wait_for(server, 2)
            finally:
                proxy.release.set()
                request.cancel()
                try:
                    await drain(request)
                except (Exception, asyncio.CancelledError):
                    pass
            summary = json.loads(summary_path.read_bytes())
            self.assertTrue(summary['close_confirmed'])
            self.assertEqual(summary['channel_eof'], not cancel_host)
            self.assertEqual(len(proxy.calls), 1)

    async def test_duplicate_id_closes_channel_without_dispatching_again(self):
        guest_frames, host = self.pair()
        evaluation, summary = self.root / 'evaluation.json', self.root / 'summary.json'
        for path in (evaluation, summary):
            path.touch(mode=0o600)
        proxy = FakeProxy()
        server = asyncio.create_task(serve_official_channel(host, evaluation_path=evaluation, summary_path=summary, proxy=proxy))
        self.servers.append(server)
        request = codec.encode_request(1, 'count', wires()[0])
        await guest_frames.write_frame(request)
        await guest_frames.read_frame()
        await guest_frames.write_frame(request)
        with self.assertRaisesRegex(RuntimeError, ERROR):
            await asyncio.wait_for(server, 2)
        self.assertEqual(len(proxy.calls), 1)
        self.assertTrue(host.closed)

    async def test_replaced_evaluation_sink_cannot_receive_report_or_ack(self):
        guest, server, proxy, evaluation, _ = await self.broker()
        await guest.request('probe')
        evaluation.rename(self.root / 'original')
        evaluation.write_bytes(b'owned-replacement')
        evaluation.chmod(0o600)
        with self.assertRaisesRegex(RuntimeError, ERROR):
            await guest.request('evaluation', codec.canonical({'version': 'sun-world-agent-model-report/1'}))
        with self.assertRaisesRegex(RuntimeError, ERROR):
            await server
        self.assertEqual(evaluation.read_bytes(), b'owned-replacement')
        self.assertEqual(proxy.calls, [])

    async def test_unsafe_sinks_fail_before_default_factory(self):
        guest, host = self.pair()
        path = self.root / 'existing'
        path.write_bytes(b'not-empty')
        path.chmod(0o600)
        from src.modules.ai import local_openai
        with patch.object(local_openai, 'create_local_openai_proxy') as factory:
            with self.assertRaisesRegex(RuntimeError, ERROR):
                await serve_official_channel(host, evaluation_path=path, summary_path=path)
            factory.assert_not_called()
        self.assertTrue(host.closed)

    async def test_partial_evaluation_write_has_no_success_ack_or_saved_flag(self):
        guest, server, proxy, evaluation, summary_path = await self.broker()
        await guest.request('probe')
        inode = evaluation.stat().st_ino
        original = os.write
        def broken_write(descriptor, raw):
            if os.fstat(descriptor).st_ino == inode:
                original(descriptor, raw[:7])
                raise OSError(MARKER)
            return original(descriptor, raw)
        with patch.object(broker_module.os, 'write', side_effect=broken_write):
            with self.assertRaisesRegex(RuntimeError, ERROR):
                await guest.request('evaluation', codec.canonical({'version': 'sun-world-agent-model-report/1'}))
            with self.assertRaisesRegex(RuntimeError, ERROR):
                await server
        self.assertEqual(evaluation.stat().st_size, 7)
        self.assertFalse(json.loads(summary_path.read_bytes())['evaluation_saved'])
        self.assertEqual(proxy.calls, [])

    async def test_network_adaptation_usage_and_encoding_failures_have_safe_distinct_events(self):
        guest, server, proxy, _, summary_path = await self.broker()
        from src.modules.ai import openai_responses as adapter
        logger = adapter.LOGGER
        before = list(logger.handlers)
        original, mode = proxy._post, ['network']
        async def post(raw, *, counting):
            value = await original(raw, counting=counting)
            logger.warning(MARKER)  # Arbitrary logs are never diagnostic data.
            adapter._diagnose(RuntimeError(MARKER), 'count_request', 429, 'AGENT_MODEL_TIMEOUT')
            if mode[0] == 'network':
                raise RuntimeError('AGENT_MODEL_TIMEOUT')
            if mode[0] == 'adapt':
                value['input_tokens'] = True
            if mode[0] == 'encode':
                value['output'][1]['content'][0]['text'] = 'x' * 70000
            return value
        proxy._post = post
        count, generation = wires()
        with patch.object(logger, 'propagate', False):
            for state in ('network', 'adapt'):
                mode[0] = state
                with self.assertRaisesRegex(RuntimeError, ERROR):
                    await guest.request('count', count)
            mode[0] = 'success'
            await guest.request('count', count)
            proxy.tokens = 21
            with self.assertRaisesRegex(RuntimeError, ERROR):
                await guest.request('generate', generation)
            proxy.tokens = 20
            await guest.request('count', count)
            mode[0] = 'encode'
            with self.assertRaisesRegex(RuntimeError, ERROR):
                await guest.request('generate', generation)
            await guest.aclose()
            summary = await server
        self.assertEqual(logger.handlers, before)
        self.assertFalse(any(isinstance(handler, broker_module._FailureDiagnostics) for handler in logger.handlers))
        self.assertEqual([row['stage'] for row in summary['failure_events']],
            ['count_request', 'response_adapt', 'usage', 'response_encode'])
        self.assertEqual(summary['failure_events'][0], {'id': 1, 'op': 'count',
            'stage': 'count_request', 'category': 'AGENT_MODEL_TIMEOUT', 'status': 429, 'line': 0})
        self.assertEqual(summary['failed_requests'], 4)
        self.assertNotIn(MARKER.encode(), summary_path.read_bytes())

    async def test_diagnostic_sink_failure_keeps_original_failure_and_cleanup(self):
        guest, server, proxy, _, summary_path = await self.broker()
        from src.modules.ai import openai_responses as adapter
        async def post(raw, *, counting):
            adapter._diagnose(RuntimeError(MARKER), 'count_request', 429, 'AGENT_MODEL_TIMEOUT')
            raise RuntimeError('AGENT_MODEL_TIMEOUT')
        proxy._post = post
        with patch.object(adapter.LOGGER, 'propagate', False), \
                patch.object(broker_module._FailureDiagnostics, 'emit', side_effect=OSError(MARKER)):
            with self.assertRaisesRegex(RuntimeError, ERROR):
                await guest.request('count', wires()[0])
            await guest.aclose()
            summary = await server
        self.assertEqual(summary['failure_events'][0]['stage'], 'upstream')
        self.assertEqual(summary['failure_events'][0]['category'], 'AGENT_MODEL_TIMEOUT')
        self.assertTrue(summary['close_confirmed'])
        self.assertNotIn(MARKER.encode(), summary_path.read_bytes())


if __name__ == '__main__':
    unittest.main()
