"""Offline catalogue wire/CLI tests using real Provider DNS/pin/response hooks."""

import asyncio
import contextlib
import copy
from datetime import date, datetime, timedelta
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import unittest
from unittest.mock import patch

import httpx

API = Path(__file__).resolve().parents[1]
ROOT = API.parents[1]
sys.path.insert(0, str(API))
sys.path.insert(0, str(API / 'tests'))
from integration import openai_inventory as inventory
from src.modules.ai import local_openai
import test_openai_responses as wire

PRIVATE = 'SYNTHETIC_PRIVATE_KEY_OWNER_ROOT_HEADER_EXCEPTION'
SCRIPT = ROOT / 'scripts/inspect-agent-openai-model.py'


def record(model=None):
    return {'id': model or inventory.MODEL, 'object': 'model', 'created': 0, 'owned_by': PRIVATE,
            'root': PRIVATE, PRIVATE: {'text': PRIVATE}}


def catalogue():
    return {'object': 'list', 'data': [record(), record('unrelated-' + PRIVATE)], PRIVATE: PRIVATE}


def load_cli():
    spec = importlib.util.spec_from_file_location('inspect_agent_openai_model', SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class OpenAiInventoryTests(unittest.IsolatedAsyncioTestCase):
    def configured(self, handler):
        factory = wire.OfficialWire(handler)
        proxy = inventory.OpenAiResponsesProxy(wire.config(), provider_factory=factory)
        return proxy, factory

    async def inspect(self, handler, *, proxy_url=None):
        proxy, factory = self.configured(handler)
        with patch.object(inventory, 'create_local_openai_proxy', return_value=proxy) as create:
            report = await inventory.inspect_inventory(proxy_url=proxy_url)
        create.assert_called_once_with(proxy_url=proxy_url)
        return report, factory

    def assert_fixed_failure(self, error):
        self.assertEqual(str(error), inventory.FAILED)
        self.assertNotIn(PRIVATE, str(error))

    async def test_valid_wire_uses_fixed_get_real_policy_limits_and_safe_projection(self):
        body = catalogue()
        body['data'] += [record(inventory.MODEL + '-2024-02-29'), record(inventory.MODEL + '-2026-11-16'),
                         record(inventory.MODEL + '-2025-02-29'), record(inventory.MODEL + '-latest')]
        report, factory = await self.inspect(lambda _: httpx.Response(200, json=body),
                                            proxy_url='http://127.0.0.1:7890')
        self.assertEqual(set(report), {'version', 'checked_at', 'profile', 'model', 'visible',
            'dated_candidate_ids', 'generation_requests', 'immutable_model_revision_verified'})
        self.assertTrue(report['visible'])
        self.assertEqual(report['dated_candidate_ids'], [inventory.MODEL + '-2024-02-29', inventory.MODEL + '-2026-11-16'])
        self.assertEqual(report['generation_requests'], 0)
        self.assertIs(report['immutable_model_revision_verified'], False)
        self.assertEqual(report['profile'], 'openai-local')
        self.assertEqual(report['model'], inventory.MODEL)
        self.assertNotIn(PRIVATE, json.dumps(report))
        self.assertTrue(report['checked_at'].endswith('Z'))
        self.assertEqual(datetime.fromisoformat(report['checked_at']).utcoffset(), timedelta(0))
        self.assertEqual(factory.dns, [('api.openai.com', 443)])
        self.assertEqual(len(factory.requests), 1)
        request = factory.requests[0]
        self.assertEqual((request.method, request.url.scheme, request.url.host, request.url.raw_path),
                         ('GET', 'https', '1.1.1.1', b'/v1/models'))
        self.assertEqual(request.content, b'')
        self.assertEqual(request.headers['host'], 'api.openai.com')
        self.assertEqual(request.headers['accept-encoding'], 'identity')
        self.assertEqual(request.extensions['sni_hostname'], 'api.openai.com')
        options = factory.options[0]
        self.assertIs(options['trust_env'], False)
        self.assertIs(options['follow_redirects'], False)
        self.assertEqual((options['timeout'].connect, options['timeout'].read,
                          options['timeout'].write, options['timeout'].pool), (3, 8, 3, 1))
        self.assertEqual(factory.constructed[0]['max_stream_bytes'], 262144)
        self.assertEqual(factory.constructed[0]['total_timeout_seconds'], 15)
        self.assertTrue(factory.closed and factory.clients[0].is_closed)
        self.assertEqual(factory.generation_requests + factory.count_requests, [])

    async def test_unknown_model_and_missing_fixed_model_never_change_selection(self):
        report, _ = await self.inspect(lambda _: httpx.Response(200, json={'object': 'list',
            'data': [record('other-' + PRIVATE), record(inventory.MODEL + '-2026-11-17-extra')]}))
        self.assertFalse(report['visible'])
        self.assertEqual(report['model'], inventory.MODEL)
        self.assertEqual(report['dated_candidate_ids'], [])
        self.assertNotIn(PRIVATE, json.dumps(report))

    async def test_invalid_whole_catalogue_or_basic_field_rejects_a_single_wire_response(self):
        baseline = catalogue()
        mutations = [(('object',), 'model'), (('data',), {}), (('data', 0, 'id'), ''),
            (('data', 0, 'id'), ' '), (('data', 0, 'id'), 'x'*257), (('data', 0, 'id'), True),
            (('data', 0, 'object'), 'list'), (('data', 0, 'created'), True),
            (('data', 0, 'created'), -1), (('data', 0, 'created'), 1.0),
            (('data', 0, 'created'), '0'), (('data', 0, 'owned_by'), None),
            (('data', 0, 'owned_by'), 'x'*257), (('data', 1, 'id'), inventory.MODEL)]
        for path, value in mutations:
            with self.subTest(path=path, value_type=type(value).__name__):
                body = copy.deepcopy(baseline)
                target = body
                for key in path[:-1]:
                    target = target[key]
                target[path[-1]] = value
                proxy, factory = self.configured(lambda _: httpx.Response(200, json=body))
                with patch.object(inventory, 'create_local_openai_proxy', return_value=proxy):
                    with self.assertRaises(ValueError) as caught:
                        await inventory.inspect_inventory()
                self.assert_fixed_failure(caught.exception)
                self.assertEqual(len(factory.requests), 1)
                self.assertTrue(factory.closed)

    async def test_duplicate_json_utf8_nonfinite_and_depth_faults_are_fixed_errors(self):
        raw = json.dumps(catalogue()).encode()
        payloads = [raw.replace(b'"created": 0', b'"created": 0,"created": 1', 1),
            raw.replace(b'"created": 0', b'"created": NaN', 1),
            raw.replace(b'"created": 0', b'"created": 1e999', 1),
            raw.replace(PRIVATE.encode(), b'\xff', 1),
            raw[:-1] + b',"nested":' + b'['*34 + b'0' + b']'*34 + b'}',
            raw.replace(PRIVATE.encode(), b'\\ud800', 1)]
        for payload in payloads:
            with self.subTest(length=len(payload)):
                proxy, factory = self.configured(lambda _: httpx.Response(200, content=payload))
                with patch.object(inventory, 'create_local_openai_proxy', return_value=proxy):
                    with self.assertRaises(ValueError) as caught:
                        await inventory.inspect_inventory()
                self.assert_fixed_failure(caught.exception)
                self.assertTrue(factory.closed)

    async def test_models_and_candidate_boundaries_accept_maximum_and_reject_one_more(self):
        models = [{'id': f'other-{i}', 'object': 'model', 'created': 0, 'owned_by': 'system'} for i in range(2048)]
        report, _ = await self.inspect(lambda _: httpx.Response(200, json={'object': 'list', 'data': models}))
        self.assertFalse(report['visible'])
        dates = [record(inventory.MODEL + '-' + (date(2026, 1, 1) + timedelta(days=i)).isoformat()) for i in range(33)]
        report, _ = await self.inspect(lambda _: httpx.Response(200, json={'object': 'list', 'data': dates[:32]}))
        self.assertEqual(len(report['dated_candidate_ids']), 32)
        for records in (models + [record()], dates):
            with self.subTest(count=len(records)):
                with self.assertRaises(ValueError) as caught:
                    await self.inspect(lambda _: httpx.Response(200, json={'object': 'list', 'data': records}))
                self.assert_fixed_failure(caught.exception)

    async def test_redirect_non200_timeout_compression_and_oversize_never_retry(self):
        responses = [httpx.Response(302, headers={'Location': 'https://private.invalid/' + PRIVATE}),
            httpx.Response(503, content=PRIVATE.encode()),
            httpx.Response(200, headers={'content-encoding': 'unsupported'}, content=PRIVATE.encode()),
            httpx.Response(200, content=b' '*262145)]
        for response in responses:
            with self.subTest(status=response.status_code, size=len(response.content)):
                proxy, factory = self.configured(lambda _: response)
                with patch.object(inventory, 'create_local_openai_proxy', return_value=proxy):
                    with self.assertRaises(ValueError) as caught:
                        await inventory.inspect_inventory()
                self.assert_fixed_failure(caught.exception)
                self.assertEqual(len(factory.requests), 1)
                self.assertTrue(factory.closed)
        def timeout(_):
            raise httpx.ReadTimeout(PRIVATE)
        with self.assertRaises(ValueError) as caught:
            await self.inspect(timeout)
        self.assert_fixed_failure(caught.exception)

    async def test_blocked_dns_and_altered_factory_config_are_rejected_before_http(self):
        proxy, factory = self.configured(lambda _: httpx.Response(200, json=catalogue()))
        factory.addresses = ('1.1.1.1', '127.0.0.1')
        with patch.object(inventory, 'create_local_openai_proxy', return_value=proxy):
            with self.assertRaises(ValueError) as caught:
                await inventory.inspect_inventory()
        self.assert_fixed_failure(caught.exception)
        self.assertEqual(factory.requests, [])
        from dataclasses import replace
        proxy.config = replace(proxy.config, base_url='https://private.invalid/' + PRIVATE)
        factory.constructed.clear()
        with patch.object(inventory, 'create_local_openai_proxy', return_value=proxy):
            with self.assertRaises(ValueError):
                await inventory.inspect_inventory()
        self.assertEqual(factory.constructed, [])

    async def test_production_and_invalid_proxy_fail_before_any_key_read_or_dns(self):
        for runtime, proxy in [('production', None), ('test', 'http://user:' + PRIVATE + '@127.0.0.1:7890'),
                               ('test', 'https://127.0.0.1:7890'), ('test', 'http://example.invalid:7890')]:
            with self.subTest(runtime=runtime, proxy_type=type(proxy).__name__), \
                    patch.dict(os.environ, BLOG_RUNTIME_ENV=runtime), \
                    patch.object(local_openai, 'read_key') as read_key, patch('socket.getaddrinfo') as dns:
                with self.assertRaises(ValueError) as caught:
                    await inventory.inspect_inventory(proxy_url=proxy)
                self.assert_fixed_failure(caught.exception)
                read_key.assert_not_called()
                dns.assert_not_called()

    async def test_success_waits_for_close_and_close_failure_cannot_return_report(self):
        proxy, factory = self.configured(lambda _: httpx.Response(200, json=catalogue()))
        factory.close_gate = asyncio.Event()
        with patch.object(inventory, 'create_local_openai_proxy', return_value=proxy):
            task = asyncio.create_task(inventory.inspect_inventory())
            try:
                await asyncio.wait_for(factory.close_started.wait(), 2)
                self.assertFalse(task.done())
            finally:
                factory.close_gate.set()
            self.assertTrue((await task)['visible'])
        proxy, factory = self.configured(lambda _: httpx.Response(200, json=catalogue()))
        original = proxy._factory
        def close_failure(*args, **kwargs):
            provider = original(*args, **kwargs)
            build = provider._build_http_client
            def client(*args, **kwargs):
                result = build(*args, **kwargs)
                owned_close = result.aclose
                async def aclose():
                    await owned_close()
                    raise RuntimeError(PRIVATE)
                result.aclose = aclose
                return result
            provider._build_http_client = client
            return provider
        proxy._factory = close_failure
        with patch.object(inventory, 'create_local_openai_proxy', return_value=proxy):
            with self.assertRaises(ValueError) as caught:
                await inventory.inspect_inventory()
        self.assert_fixed_failure(caught.exception)
        self.assertTrue(factory.closed)

    async def test_repeated_cancellation_during_request_or_successful_close_drains_owned_client(self):
        for during_request in (False, True):
            entered = asyncio.Event()
            async def handler(_):
                client = factory.clients[-1]
                owned_close = client.aclose
                async def close_failure():
                    await owned_close()
                    raise RuntimeError(PRIVATE)
                client.aclose = close_failure
                entered.set()
                if during_request:
                    await asyncio.Event().wait()
                return httpx.Response(200, json=catalogue())
            proxy, factory = self.configured(handler)
            factory.close_gate = asyncio.Event()
            with patch.object(inventory, 'create_local_openai_proxy', return_value=proxy):
                task = asyncio.create_task(inventory.inspect_inventory())
                try:
                    await asyncio.wait_for(entered.wait(), 2)
                    if during_request:
                        task.cancel()
                    await asyncio.wait_for(factory.close_started.wait(), 2)
                    task.cancel()
                    await asyncio.sleep(0)
                    task.cancel()
                    await asyncio.sleep(0)
                    self.assertFalse(task.done())
                finally:
                    factory.close_gate.set()
                with self.assertRaises(asyncio.CancelledError):
                    await task
            self.assertTrue(factory.closed)

    async def test_keyboard_interrupt_is_not_replaced_by_cleanup_failure(self):
        def interrupted(_):
            raise KeyboardInterrupt()
        proxy, factory = self.configured(interrupted)
        owned_close = inventory._close
        async def close_failure(client):
            await owned_close(client)
            raise RuntimeError(PRIVATE)
        with patch.object(inventory, 'create_local_openai_proxy', return_value=proxy), \
                patch.object(inventory, '_close', side_effect=close_failure):
            with self.assertRaises(KeyboardInterrupt):
                await inventory.inspect_inventory()
        self.assertTrue(factory.closed)


class OpenAiInventoryCliTests(unittest.TestCase):
    def test_help_and_bad_arguments_never_load_factory_or_echo_sensitive_argv(self):
        for arguments, expected in [(['--help'], 0), (['--key', PRIVATE], 2),
                                    (['--model', PRIVATE], 2), (['--origin', PRIVATE], 2), (['--proxy-url'], 2)]:
            result = subprocess.run([sys.executable, str(SCRIPT), *arguments], capture_output=True,
                text=True, timeout=5, env={'PATH': os.defpath, 'BLOG_RUNTIME_ENV': 'production'})
            self.assertEqual(result.returncode, expected)
            self.assertNotIn(PRIVATE, result.stdout + result.stderr)
            if expected:
                self.assertEqual(result.stdout, '')
                self.assertEqual(result.stderr, 'AGENT_OPENAI_INVENTORY_ARGUMENT_INVALID\n')

    def test_cli_success_is_only_json_and_failures_or_cancel_never_print_a_success_report(self):
        cli = load_cli()
        for outcome, expected in [('ok', 0), ('error', 1), ('cancel', 130)]:
            async def inspect(**kwargs):
                if outcome == 'error':
                    raise RuntimeError(PRIVATE)
                if outcome == 'cancel':
                    raise asyncio.CancelledError()
                return {'immutable_model_revision_verified': False, 'generation_requests': 0}
            output, diagnostic = io.StringIO(), io.StringIO()
            with patch.object(inventory, 'inspect_inventory', side_effect=inspect), \
                    contextlib.redirect_stdout(output), contextlib.redirect_stderr(diagnostic):
                result = cli.main(['--proxy-url', 'http://127.0.0.1:7890'])
            self.assertEqual(result, expected)
            self.assertNotIn(PRIVATE, output.getvalue() + diagnostic.getvalue())
            if outcome == 'ok':
                self.assertIs(json.loads(output.getvalue())['immutable_model_revision_verified'], False)
                self.assertEqual(diagnostic.getvalue(), '')
            else:
                self.assertEqual(output.getvalue(), '')
                self.assertEqual(diagnostic.getvalue(), 'AGENT_OPENAI_INVENTORY_' +
                                 ('CANCELLED' if outcome == 'cancel' else 'FAILED') + '\n')
