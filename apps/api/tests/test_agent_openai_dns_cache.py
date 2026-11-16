"""Offline resolver lifetime/TTL/close ownership; no credentials or live DNS."""

import asyncio
from pathlib import Path
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, patch

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import test_local_openai_transport as fixtures
from src.modules.ai import local_openai as local
from src.modules.ai import local_openai_transport as transport
from src.modules.ai.providers import OpenAiCompatibleProvider, ProviderConfig
from src.modules.ai.errors import AiDomainError

HOST = 'api.openai.com'
PROXY = 'http://127.0.0.1:7890'
PRIVATE = 'SYNTHETIC_PRIVATE_DNS_ERROR'


def answer(ttls=(30, 100), addresses=('1.1.1.1', '8.8.8.8')):
    value = fixtures.dns_value(addresses)
    for item, ttl in zip(value['Answer'], ttls, strict=True):
        item['TTL'] = ttl
    return value


class Clock:
    value = 100.0
    def __call__(self):
        return self.value


class ClosingStream(httpx.AsyncByteStream):
    def __init__(self, value):
        import json
        self.raw = json.dumps(value).encode()
        self.started, self.release = asyncio.Event(), asyncio.Event()
        self.closed = False
        self.error = None

    async def __aiter__(self):
        yield self.raw

    async def aclose(self):
        self.started.set()
        await self.release.wait()
        if self.error is not None:
            raise self.error
        self.closed = True


class OfficialDnsCacheTests(unittest.IsolatedAsyncioTestCase):
    async def test_minimum_ttl_and_sixty_second_cap(self):
        for ttls, duration in (((3, 50), 3), ((300, 500), 60)):
            clock = Clock()
            clients = fixtures.DnsClients(lambda _: httpx.Response(200, json=answer(ttls)))
            resolver = transport.OfficialOpenAiDnsResolver(PROXY)
            with patch.object(transport, 'monotonic', clock), patch.object(transport.httpx, 'AsyncClient', clients):
                self.assertEqual(await resolver.resolve(HOST, 443), ('1.1.1.1', '8.8.8.8'))
                clock.value += duration - .001
                await resolver.resolve(HOST, 443)
                self.assertEqual(len(clients.requests), 1)
                clock.value += .001
                await resolver.resolve(HOST, 443)
                self.assertEqual(len(clients.requests), 2)

    async def test_zero_ttl_on_duplicate_answer_disables_cache(self):
        value = answer()
        value['Answer'].append({**value['Answer'][0], 'TTL': 0})
        clients = fixtures.DnsClients(lambda _: httpx.Response(200, json=value))
        resolver = transport.OfficialOpenAiDnsResolver(PROXY)
        with patch.object(transport.httpx, 'AsyncClient', clients):
            for _ in range(2):
                self.assertEqual(await resolver.resolve(HOST, 443), ('1.1.1.1', '8.8.8.8'))
        self.assertEqual(len(clients.requests), 2)

    async def test_host_and_strict_port_validate_before_cache_hit(self):
        clients = fixtures.DnsClients(lambda _: httpx.Response(200, json=answer()))
        resolver = transport.OfficialOpenAiDnsResolver(PROXY)
        with patch.object(transport.httpx, 'AsyncClient', clients):
            await resolver.resolve(HOST, 443)
            for host, port in (('elsewhere.invalid', 443), (HOST + '.', 443),
                    (HOST, 80), (HOST, True), (HOST, 443.0)):
                with self.assertRaisesRegex(ValueError, '^LOCAL_OPENAI_DNS_FAILED$'):
                    await resolver.resolve(host, port)
        self.assertEqual(len(clients.requests), 1)

    async def test_expiry_failure_clears_old_value_without_fallback(self):
        clock, mode = Clock(), ['success']
        async def respond(_):
            if mode[0] == 'fail':
                raise httpx.ConnectError(PRIVATE)
            return httpx.Response(200, json=answer((2, 2)))
        clients = fixtures.DnsClients(respond)
        resolver = transport.OfficialOpenAiDnsResolver(PROXY)
        with patch.object(transport, 'monotonic', clock), patch.object(transport.httpx, 'AsyncClient', clients):
            await resolver.resolve(HOST, 443)
            clock.value += 2
            mode[0] = 'fail'
            with self.assertRaises(httpx.HTTPError) as error:
                await resolver.resolve(HOST, 443)
            self.assertNotIn(PRIVATE, str(error.exception))
            self.assertIsNone(resolver._cached_addresses)
            mode[0] = 'success'
            await resolver.resolve(HOST, 443)
        self.assertEqual(len(clients.requests), 3)
        self.assertTrue(all(client.is_closed for client in clients.clients))

    async def test_partial_parse_and_mixed_private_answers_are_never_cached_or_filtered(self):
        value = answer()
        value['Answer'][1]['data'] = 'invalid-address'
        clients = fixtures.DnsClients(lambda _: httpx.Response(200, json=value))
        resolver = transport.OfficialOpenAiDnsResolver(PROXY)
        with patch.object(transport.httpx, 'AsyncClient', clients):
            for _ in range(2):
                with self.assertRaises(httpx.HTTPError):
                    await resolver.resolve(HOST, 443)
            value = answer(addresses=('1.1.1.1', '127.0.0.1'))
            for _ in range(2):
                self.assertEqual(await resolver.resolve(HOST, 443), ('1.1.1.1', '127.0.0.1'))
            provider = OpenAiCompatibleProvider(ProviderConfig(provider='openai-local', model='gpt-6.1-sol',
                base_url='https://api.openai.com/v1', auth_mode='none'),
                allowed_hosts=(HOST,), resolver=resolver, max_output_tokens=1024)
            with self.assertRaises(AiDomainError) as error:
                await provider._connection_options('https://api.openai.com/v1/responses')
            self.assertEqual(error.exception.code, 'AI_PROVIDER_HOST_NOT_ALLOWED')
        self.assertEqual(len(clients.requests), 5)
        self.assertIsNone(resolver._cached_addresses)

    async def test_ttl_starts_at_query_start_not_response_or_close(self):
        clock = Clock()
        async def respond(_):
            clock.value += 3
            return httpx.Response(200, json=answer((2, 20)))
        clients = fixtures.DnsClients(respond)
        resolver = transport.OfficialOpenAiDnsResolver(PROXY)
        with patch.object(transport, 'monotonic', clock), patch.object(transport.httpx, 'AsyncClient', clients):
            await resolver.resolve(HOST, 443)
            await resolver.resolve(HOST, 443)
        self.assertEqual(len(clients.requests), 2)

    async def test_single_inflight_covers_both_response_and_client_close(self):
        stream = ClosingStream(answer())
        clients = fixtures.DnsClients(lambda _: httpx.Response(200,
            headers={'content-type': 'application/dns-json'}, stream=stream))
        clients.close_gate = asyncio.Event()
        resolver = transport.OfficialOpenAiDnsResolver(PROXY)
        tasks = []
        with patch.object(transport.httpx, 'AsyncClient', clients):
            try:
                tasks.append(asyncio.create_task(resolver.resolve(HOST, 443)))
                await asyncio.wait_for(stream.started.wait(), 1)
                tasks.append(asyncio.create_task(resolver.resolve(HOST, 443)))
                await asyncio.sleep(0)
                self.assertIsNone(resolver._cached_addresses)
                self.assertEqual(len(clients.requests), 1)
                stream.release.set()
                await asyncio.wait_for(clients.close_started.wait(), 1)
                self.assertIsNone(resolver._cached_addresses)
                self.assertFalse(any(task.done() for task in tasks))
                clients.close_gate.set()
                self.assertEqual(await asyncio.wait_for(asyncio.gather(*tasks), 1),
                    [('1.1.1.1', '8.8.8.8')] * 2)
                self.assertEqual(len(clients.requests), 1)
            finally:
                stream.release.set()
                clients.close_gate.set()
                for task in tasks:
                    task.cancel()
                await asyncio.gather(*tasks, return_exceptions=True)

    async def test_repeated_cancel_during_both_closes_never_publishes(self):
        stream = ClosingStream(answer())
        clients = fixtures.DnsClients(lambda _: httpx.Response(200,
            headers={'content-type': 'application/dns-json'}, stream=stream))
        clients.close_gate = asyncio.Event()
        resolver = transport.OfficialOpenAiDnsResolver(PROXY)
        with patch.object(transport.httpx, 'AsyncClient', clients):
            task = asyncio.create_task(resolver.resolve(HOST, 443))
            try:
                await asyncio.wait_for(stream.started.wait(), 1)
                task.cancel()
                task.cancel()
                await asyncio.sleep(0)
                self.assertFalse(task.done())
                stream.release.set()
                await asyncio.wait_for(clients.close_started.wait(), 1)
                task.cancel()
                await asyncio.sleep(0)
                self.assertFalse(task.done())
                self.assertIsNone(resolver._cached_addresses)
                clients.close_gate.set()
                with self.assertRaises(asyncio.CancelledError):
                    await asyncio.wait_for(task, 1)
                self.assertIsNone(resolver._cached_addresses)
            finally:
                stream.release.set()
                clients.close_gate.set()
                task.cancel()
                await asyncio.gather(task, return_exceptions=True)
            clients.handler = lambda _: httpx.Response(200, json=answer())
            await resolver.resolve(HOST, 443)
        self.assertEqual(len(clients.requests), 2)

    async def test_response_and_client_close_errors_cannot_publish(self):
        for response_failure in (True, False):
            stream = ClosingStream(answer())
            stream.release.set()
            clients = fixtures.DnsClients(lambda _: httpx.Response(200,
                headers={'content-type': 'application/dns-json'}, stream=stream))
            if response_failure:
                stream.error = OSError(PRIVATE)
            else:
                clients.close_gate = SimpleNamespace(wait=AsyncMock(side_effect=OSError(PRIVATE)))
            resolver = transport.OfficialOpenAiDnsResolver(PROXY)
            with patch.object(transport.httpx, 'AsyncClient', clients):
                with self.assertRaises(httpx.CloseError):
                    await resolver.resolve(HOST, 443)
                self.assertIsNone(resolver._cached_addresses)
                clients.close_gate = None
                clients.handler = lambda _: httpx.Response(200, json=answer())
                await resolver.resolve(HOST, 443)
            self.assertEqual(len(clients.requests), 2)

    async def test_cancelled_waiter_does_not_cancel_owner_or_trigger_second_fetch(self):
        entered, release = asyncio.Event(), asyncio.Event()
        async def respond(_):
            entered.set()
            await release.wait()
            return httpx.Response(200, json=answer())
        clients, resolver = fixtures.DnsClients(respond), transport.OfficialOpenAiDnsResolver(PROXY)
        tasks = []
        with patch.object(transport.httpx, 'AsyncClient', clients):
            try:
                tasks.append(asyncio.create_task(resolver.resolve(HOST, 443)))
                await entered.wait()
                tasks.append(asyncio.create_task(resolver.resolve(HOST, 443)))
                await asyncio.sleep(0)
                tasks[1].cancel()
                with self.assertRaises(asyncio.CancelledError):
                    await tasks[1]
                self.assertFalse(tasks[0].done())
                release.set()
                await tasks[0]
                await resolver.resolve(HOST, 443)
                self.assertEqual(len(clients.requests), 1)
            finally:
                release.set()
                for task in tasks:
                    task.cancel()
                await asyncio.gather(*tasks, return_exceptions=True)


class FactoryResolverTests(unittest.TestCase):
    def test_same_profile_reuses_resolver_other_profiles_do_not(self):
        def proxy(config, *, provider_factory):
            return SimpleNamespace(config=config, factory=provider_factory)
        with patch.object(local, 'is_local_runtime', return_value=True), \
                patch.object(local, 'read_key', return_value=None), \
                patch.object(local, 'OpenAiResponsesProxy', side_effect=proxy):
            first = local.create_local_openai_proxy(key_file=Path('/synthetic/unread'), proxy_url=PROXY)
            second = local.create_local_openai_proxy(key_file=Path('/synthetic/unread'), proxy_url=PROXY)
            a = first.factory(first.config, max_output_tokens=1024)
            b = first.factory(first.config, max_output_tokens=1024)
            c = second.factory(second.config, max_output_tokens=1024)
        self.assertIs(a._resolver, b._resolver)
        self.assertIsNot(a._resolver, c._resolver)
        self.assertIsInstance(a._resolver, transport.OfficialOpenAiDnsResolver)

    def test_without_proxy_keeps_original_system_resolver_path(self):
        def proxy(config, *, provider_factory):
            return SimpleNamespace(config=config, factory=provider_factory)
        with patch.object(local, 'is_local_runtime', return_value=True), \
                patch.object(local, 'read_key', return_value=None), \
                patch.object(local, 'OpenAiResponsesProxy', side_effect=proxy), \
                patch.object(local.os, 'getenv', return_value=None), \
                patch.object(transport, 'OfficialOpenAiDnsResolver') as resolver:
            value = local.create_local_openai_proxy(key_file=Path('/synthetic/unread'))
            provider = value.factory(value.config, max_output_tokens=1024)
            self.assertIsNone(provider._resolver)
            resolver.assert_not_called()

    def test_production_gate_precedes_resolver_and_key_io(self):
        with patch.object(local, 'is_local_runtime', return_value=False), \
                patch.object(local, 'read_key') as key, \
                patch.object(transport, 'OfficialOpenAiDnsResolver') as resolver:
            with self.assertRaises(ValueError):
                local.create_local_openai_proxy(proxy_url=PROXY)
            key.assert_not_called()
            resolver.assert_not_called()


if __name__ == '__main__':
    unittest.main()
