"""No external network: real Provider policy/client hooks, synthetic HTTP wire."""

import asyncio
import contextlib
from dataclasses import replace
import importlib.util
import io
import json
import os
from pathlib import Path
import stat
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

import httpx

API = Path(__file__).resolve().parents[1]
ROOT = API.parents[1]
sys.path.insert(0, str(API))
sys.path.insert(0, str(API / 'tests'))
from integration import tokenizer_probe as probe
import test_structured_model_proxy as wire

PRIVATE = 'SYNTHETIC_PRIVATE_PROVIDER_FIELD_PATH_TOKEN_TEMPLATE'
CONFIG = probe.ProviderConfig(provider='qwen-public', model=probe.MODEL,
    base_url=probe.ORIGIN + '/v1', auth_mode='none')


def tokenized():
    return {'count': 3, 'max_model_len': 262144, 'tokens': [0, 1, 2**63 - 1], 'token_strs': None}


def metadata(request):
    if request.url.path == '/v1/models':
        return httpx.Response(200, json={'object': 'list', 'data': [{'id': probe.MODEL,
            'max_model_len': 262144, 'root': PRIVATE, PRIVATE: PRIVATE}], PRIVATE: PRIVATE})
    if request.url.path == '/version':
        return httpx.Response(200, json={'version': '0.28.0', PRIVATE: PRIVATE})
    if request.url.path == '/tokenizer_info':
        return httpx.Response(404, content=PRIVATE.encode())
    return None


def success(request):
    return metadata(request) or httpx.Response(200, json=tokenized())


class TokenizerProbeTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory(prefix='sun-world-tokenizer-unit-')
        self.addCleanup(directory.cleanup)
        self.directory = Path(directory.name)
        self.report = self.directory / 'evidence.json'
        runtime = patch.dict(os.environ, BLOG_RUNTIME_ENV='test')
        runtime.start()
        self.addCleanup(runtime.stop)

    async def run_wire(self, handler=success, **options):
        factory = wire.WireFactory(handler, **options)
        with patch.object(probe, 'OpenAiCompatibleProvider', factory):
            result = await probe.probe(self.report)
        return result, factory, json.loads(self.report.read_text())

    def assert_private(self, report):
        serialized = json.dumps(report)
        self.assertNotIn(PRIVATE, serialized)
        for key in ('tokenizer_verified', 'immutable_model_revision_verified', 'input_token_hard_limit_verified', 'inference_performed'):
            self.assertIs(False, report[key])
        for observation in report['observations']:
            self.assertNotIn('tokens', observation)
            self.assertNotIn('token_strs', observation)

    async def test_valid_six_requests_use_fixed_projection_real_policy_and_private_report(self):
        with patch.dict(os.environ, AI_PROVIDER_ALLOWED_INSECURE_ORIGINS=PRIVATE):
            result, factory, report = await self.run_wire()
            self.assertEqual(PRIVATE, os.environ['AI_PROVIDER_ALLOWED_INSECURE_ORIGINS'])
        self.assertEqual(0, result)
        self.assertEqual('ok', report['status'])
        self.assertIsNone(report['active_case'])
        self.assertEqual(probe.MODEL, report['model_alias'])
        self.assert_private(report)
        self.assertEqual(0o600, stat.S_IMODE(self.report.stat().st_mode))
        self.assertLess(self.report.stat().st_size, probe.REPORT_LIMIT)
        self.assertEqual([('GET', '/v1/models'), ('GET', '/version'), ('GET', '/tokenizer_info'),
            ('POST', '/tokenize'), ('POST', '/tokenize'), ('POST', '/tokenize')],
            [(request.method, request.url.path) for request in factory.requests])
        self.assertEqual(['models', 'version', 'tokenizer_info', *probe.CASES],
            [record['case'] for record in report['observations']])
        self.assertEqual('unavailable', report['observations'][2]['status'])
        self.assertEqual('0.28.0', report['observations'][1]['server_version'])
        self.assertEqual(3, report['observations'][3]['count'])
        for request, options, limits in zip(factory.requests, factory.options, factory.constructed):
            self.assertEqual(('http', '1.1.1.1'), (request.url.scheme, request.url.host))
            self.assertEqual('211.141.18.165:6195', request.headers['host'])
            self.assertEqual('identity', request.headers['accept-encoding'])
            self.assertNotIn('authorization', request.headers)
            self.assertIs(False, options['trust_env'])
            self.assertIs(False, options['follow_redirects'])
            self.assertEqual(8, options['timeout'].read)
            self.assertEqual(65536, limits['max_stream_bytes'])
        self.assertTrue(all(client.is_closed for client in factory.clients))
        payloads = [json.loads(request.content) for request in factory.requests[3:]]
        for payload in payloads:
            self.assertEqual(probe.MODEL, payload['model'])
            self.assertIs(True, payload['add_generation_prompt'])
            for key in ('continue_final_message', 'add_special_tokens', 'return_token_strs'):
                self.assertIs(False, payload[key])
            for key in ('thinking', 'max_tokens', 'stream', 'chat_template', 'chat_template_kwargs'):
                self.assertNotIn(key, payload)
        self.assertNotIn('tools', payloads[0])
        self.assertEqual({'blog_search_public', 'blog_read_public'},
            {tool['function']['name'] for tool in payloads[1]['tools']})
        self.assertEqual(['user', 'assistant', 'tool'], [item['role'] for item in payloads[2]['messages']])
        self.assertEqual(payloads[2]['messages'][1]['tool_calls'][0]['id'], payloads[2]['messages'][2]['tool_call_id'])

    async def test_invalid_counting_response_faults_preserve_only_safe_failure_evidence(self):
        mutations = [('count', True), ('count', -1), ('count', 2), ('tokens', [False, 1, 2]),
            ('tokens', [0, -1, 2]), ('tokens', [0, 1, 2**63]), ('tokens', 'not-an-array'),
            ('token_strs', []), ('max_model_len', True), (PRIVATE, PRIVATE)]
        for index, (key, value) in enumerate(mutations):
            with self.subTest(key=key, index=index):
                self.report = self.directory / f'fault-{index}.json'
                response = tokenized()
                response[key] = value
                result, factory, report = await self.run_wire(lambda request: metadata(request)
                    or httpx.Response(200, json=response))
                self.assertEqual(1, result)
                self.assertEqual('failed', report['status'])
                self.assertEqual('unicode', report['active_case'])
                self.assertEqual(probe.INVALID, report['error'])
                self.assertEqual(4, len(factory.requests))
                self.assertTrue(all(client.is_closed for client in factory.clients))
                self.assert_private(report)

    async def test_duplicate_utf8_nonfinite_nested_and_oversized_json_fail_closed(self):
        raw = json.dumps(tokenized()).encode()
        malformed = [b'{"count":3,' + raw[1:], raw.replace(b'262144', b'NaN'),
            raw[:-1] + b',"unknown":"\xff"}', b'[' * 40 + raw + b']' * 40,
            json.dumps({'count': 3, 'tokens': [0, 1, 2], 'max_model_len': 262144,
                PRIVATE: PRIVATE * 3000}).encode()]
        for index, body in enumerate(malformed):
            with self.subTest(index=index):
                self.report = self.directory / f'malformed-{index}.json'
                result, factory, report = await self.run_wire(lambda request: metadata(request)
                    or httpx.Response(200, content=body))
                self.assertEqual(1, result)
                self.assertIn(report['error'], (probe.INVALID, 'AGENT_TOKENIZER_RESPONSE_TOO_LARGE'))
                self.assertEqual(4, len(factory.requests))
                self.assert_private(report)

    async def test_metadata_unknown_names_are_ignored_but_untrusted_version_is_never_saved(self):
        result, _, report = await self.run_wire(lambda request: httpx.Response(200,
            json={'version': PRIVATE, PRIVATE: PRIVATE}) if request.url.path == '/version' else success(request))
        self.assertEqual(1, result)
        self.assertEqual(probe.INVALID, report['error'])
        self.assert_private(report)

    async def test_network_errors_redirect_and_compression_never_retry_or_leak(self):
        def driver_error(_):
            raise OSError(PRIVATE)
        def timeout(_):
            raise httpx.ReadTimeout(PRIVATE)
        handlers = [lambda _: httpx.Response(302, headers={'location': 'http://127.0.0.1/'}, content=PRIVATE.encode()),
            lambda _: httpx.Response(429, content=PRIVATE.encode()),
            lambda _: httpx.Response(200, headers={'content-encoding': 'gzip'}, content=b'not-gzip'),
            driver_error, timeout]
        for index, handler in enumerate(handlers):
            with self.subTest(index=index):
                self.report = self.directory / f'network-{index}.json'
                result, factory, report = await self.run_wire(handler)
                self.assertEqual(1, result)
                self.assertEqual(1, len(factory.requests))
                self.assertTrue(factory.clients[0].is_closed)
                self.assert_private(report)
        self.assertEqual('AGENT_TOKENIZER_TIMEOUT', report['error'])

    async def test_shared_provider_rejects_blocked_resolution_before_client(self):
        result, factory, report = await self.run_wire(addresses=('127.0.0.1',))
        self.assertEqual(1, result)
        self.assertEqual('AGENT_TOKENIZER_POLICY_REJECTED', report['error'])
        self.assertEqual([], factory.requests)
        self.assertEqual([], factory.clients)

    async def test_fixed_request_allowlist_and_config_reject_before_provider_construction(self):
        wire_bytes = next(probe.requests())[1]
        cases = [('POST', '/v1/chat/completions', wire_bytes), ('GET', '//private.invalid', None),
            ('GET', '/v1/models?url=private', None), ('POST', '/tokenize', b'{}'),
            ('GET', '/version', wire_bytes), ('POST', '/tokenize', wire_bytes.decode())]
        with patch.object(probe, 'OpenAiCompatibleProvider') as factory:
            for method, path, body in cases:
                with self.assertRaisesRegex(ValueError, '^AGENT_TOKENIZER_POLICY_REJECTED$'):
                    await probe.request(CONFIG, method, path, body)
            for config in (replace(CONFIG, base_url='http://127.0.0.1/v1'),
                    replace(CONFIG, auth_mode='bearer', api_key=PRIVATE), replace(CONFIG, api_key=PRIVATE)):
                with self.assertRaises(ValueError):
                    await probe.request(config, 'GET', '/version')
            factory.assert_not_called()

    async def test_production_and_exclusive_report_fail_before_any_network(self):
        factory = wire.WireFactory(success)
        with patch.object(probe, 'OpenAiCompatibleProvider', factory), patch.dict(os.environ, BLOG_RUNTIME_ENV='production'):
            with patch.object(probe.os, 'open') as opened:
                with self.assertRaisesRegex(ValueError, '^AGENT_TOKENIZER_POLICY_REJECTED$'):
                    await probe.probe(self.report)
                opened.assert_not_called()
        self.assertFalse(self.report.exists())
        self.report.write_text(PRIVATE)
        with patch.object(probe, 'OpenAiCompatibleProvider', factory):
            with self.assertRaises(FileExistsError):
                await probe.probe(self.report)
        self.assertEqual(PRIVATE, self.report.read_text())
        link = self.directory / 'link.json'
        link.symlink_to(self.report)
        with patch.object(probe, 'OpenAiCompatibleProvider', factory):
            with self.assertRaises(OSError):
                await probe.probe(link)
        self.assertEqual([], factory.constructed)
        self.assertEqual([], factory.dns)

    async def test_report_fstat_failure_closes_its_owned_descriptor(self):
        with patch.object(probe.os, 'fstat', side_effect=OSError(PRIVATE)), patch.object(probe.os, 'close', wraps=os.close) as closed:
            with self.assertRaises(OSError):
                probe.create_report(self.report)
            self.assertEqual(1, closed.call_count)

    async def test_fsync_and_close_failures_always_restore_process_origin_policy(self):
        real_sync, real_close = os.fsync, os.close
        calls = 0
        def fail_second_sync(descriptor):
            nonlocal calls
            calls += 1
            if calls == 2:
                raise OSError(PRIVATE)
            return real_sync(descriptor)
        factory = wire.WireFactory(success)
        with patch.dict(os.environ, AI_PROVIDER_ALLOWED_INSECURE_ORIGINS=PRIVATE), \
                patch.object(probe, 'OpenAiCompatibleProvider', factory), \
                patch.object(probe.os, 'fsync', side_effect=fail_second_sync):
            self.assertEqual(1, await probe.probe(self.report))
            self.assertEqual(PRIVATE, os.environ['AI_PROVIDER_ALLOWED_INSECURE_ORIGINS'])
        self.assertEqual([], factory.requests)
        self.assert_private(json.loads(self.report.read_text()))
        self.report = self.directory / 'close-error.json'
        def closed_with_error(descriptor):
            real_close(descriptor)
            raise OSError(PRIVATE)
        with patch.dict(os.environ, AI_PROVIDER_ALLOWED_INSECURE_ORIGINS=PRIVATE), \
                patch.object(probe, 'OpenAiCompatibleProvider', factory), \
                patch.object(probe.os, 'close', side_effect=closed_with_error):
            with self.assertRaises(OSError):
                await probe.probe(self.report)
            self.assertEqual(PRIVATE, os.environ['AI_PROVIDER_ALLOWED_INSECURE_ORIGINS'])
        self.assertTrue(all(client.is_closed for client in factory.clients))
        self.assert_private(json.loads(self.report.read_text()))

    async def test_request_and_total_timeouts_are_safe_and_close_clients(self):
        async def stalled(_):
            await asyncio.Event().wait()
        factory = wire.WireFactory(stalled)
        real_timeout = asyncio.timeout
        with patch.object(probe, 'OpenAiCompatibleProvider', factory), patch.object(probe.asyncio, 'timeout',
                side_effect=lambda seconds: real_timeout(.02 if seconds == 8 else 1)):
            self.assertEqual(1, await probe.probe(self.report))
        self.assertEqual('AGENT_TOKENIZER_TIMEOUT', json.loads(self.report.read_text())['error'])
        self.assertTrue(factory.clients[0].is_closed)
        self.report = self.directory / 'total.json'
        factory = wire.WireFactory(stalled)
        with patch.object(probe, 'OpenAiCompatibleProvider', factory), patch.object(probe.asyncio, 'timeout',
                side_effect=lambda seconds: real_timeout(.02 if seconds == 45 else 1)):
            self.assertEqual(1, await probe.probe(self.report))
        self.assertTrue(factory.clients[0].is_closed)
        self.assertEqual('AGENT_TOKENIZER_TIMEOUT', json.loads(self.report.read_text())['error'])

    async def test_successful_and_invalid_response_cancelled_twice_during_close_drain_as_cancelled(self):
        for index, handler in enumerate((success, lambda _: httpx.Response(200, content=b'{'))):
            self.report = self.directory / f'close-cancel-{index}.json'
            factory = wire.WireFactory(handler)
            factory.close_gate = asyncio.Event()
            with patch.object(probe, 'OpenAiCompatibleProvider', factory):
                task = asyncio.create_task(probe.probe(self.report))
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
                    if not task.done():
                        task.cancel()
                    await asyncio.gather(task, return_exceptions=True)
            self.assertTrue(factory.clients[0].is_closed)
            self.assertEqual(1, len(factory.requests))
            report = json.loads(self.report.read_text())
            self.assertEqual('cancelled', report['status'])
            self.assertEqual('AGENT_TOKENIZER_CANCELLED', report['error'])
            self.assert_private(report)

    async def test_cancellation_during_entry_closes_and_close_failure_cannot_mask_original_error(self):
        factory = wire.WireFactory(success)
        factory.entry_gate = asyncio.Event()
        with patch.object(probe, 'OpenAiCompatibleProvider', factory):
            task = asyncio.create_task(probe.probe(self.report))
            try:
                await asyncio.wait_for(factory.entry_started.wait(), 1)
                task.cancel()
                with self.assertRaises(asyncio.CancelledError):
                    await asyncio.wait_for(task, 1)
            finally:
                factory.entry_gate.set()
                await asyncio.gather(task, return_exceptions=True)
        self.assertTrue(factory.clients[0].is_closed)
        self.assertEqual([], factory.requests)
        self.report = self.directory / 'close-failed.json'
        def invalid_response(_):
            original = factory.clients[0].aclose
            async def broken_close():
                await original()
                raise OSError(PRIVATE)
            factory.clients[0].aclose = broken_close
            return httpx.Response(200, content=b'{')
        factory = wire.WireFactory(invalid_response)
        with patch.object(probe, 'OpenAiCompatibleProvider', factory):
            self.assertEqual(1, await probe.probe(self.report))
        self.assertEqual(probe.INVALID, json.loads(self.report.read_text())['error'])
        self.assertTrue(factory.clients[0].is_closed)


class TokenizerCliTests(unittest.TestCase):
    def test_default_help_and_production_invocation_never_need_a_connection(self):
        script = ROOT / 'scripts/probe-agent-tokenizer.py'
        for arguments in ([], ['--help']):
            result = subprocess.run([sys.executable, str(script), *arguments], capture_output=True, timeout=5)
            self.assertEqual(0, result.returncode)
            self.assertIn(b'--probe', result.stdout)
        with tempfile.TemporaryDirectory() as directory:
            report = Path(directory) / 'report.json'
            result = subprocess.run([sys.executable, str(script), '--probe', '--report', str(report)],
                env={**os.environ, 'BLOG_RUNTIME_ENV': 'production'}, capture_output=True, timeout=5)
            self.assertEqual(1, result.returncode)
            self.assertEqual(b'AGENT_TOKENIZER_PROBE_FAILED\n', result.stderr)
            self.assertFalse(report.exists())
            result = subprocess.run([sys.executable, str(script), '--probe', '--report', str(report), '--url', PRIVATE],
                capture_output=True, timeout=5)
            self.assertEqual(2, result.returncode)
            self.assertNotIn(PRIVATE.encode(), result.stderr + result.stdout)
            self.assertFalse(report.exists())

    def test_cli_keyboard_interrupt_is_130_and_diagnostic_is_fixed(self):
        spec = importlib.util.spec_from_file_location('tokenizer_probe_cli', ROOT / 'scripts/probe-agent-tokenizer.py')
        cli = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cli)
        def interrupted(coroutine):
            coroutine.close()
            raise KeyboardInterrupt(PRIVATE)
        output = io.StringIO()
        with patch.object(cli.asyncio, 'run', side_effect=interrupted), contextlib.redirect_stderr(output):
            self.assertEqual(130, cli.main(['--probe', '--report', '/synthetic-new-report.json']))
        self.assertEqual('AGENT_TOKENIZER_PROBE_CANCELLED\n', output.getvalue())


if __name__ == '__main__':
    unittest.main()
