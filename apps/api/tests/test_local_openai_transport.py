"""Only owned loopback CONNECT/TLS and MockTransport; no official API traffic."""

import asyncio
from dataclasses import replace
import json
import os
from pathlib import Path
import ssl
import subprocess
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import httpcore
import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from src.modules.ai import local_openai_transport as transport
from src.modules.ai.providers import OpenAiCompatibleProvider, ProviderConnectionOptions

PRIVATE = 'SYNTHETIC_PRIVATE_PROXY_ERROR_CREDENTIAL'


def options(**changes):
    return replace(ProviderConnectionOptions(endpoint='https://api.openai.com/v1/responses',
        scheme='https', host='api.openai.com', port=443, resolved_addresses=('1.1.1.1',)), **changes)


class Stream(httpcore.AsyncNetworkStream):
    def __init__(self, chunks=()):
        self.chunks, self.written, self.closed = list(chunks), [], False
        self.read_started, self.close_started = asyncio.Event(), asyncio.Event()
        self.read_gate = self.close_gate = None

    async def read(self, max_bytes, timeout=None):
        self.read_started.set()
        if self.read_gate:
            await self.read_gate.wait()
        if not self.chunks:
            return b''
        value = self.chunks.pop(0)
        self.assertion = max_bytes
        if len(value) > max_bytes:
            self.chunks.insert(0, value[max_bytes:])
        return value[:max_bytes]

    async def write(self, buffer, timeout=None):
        self.written.append(buffer)

    async def aclose(self):
        self.close_started.set()
        if self.close_gate:
            await self.close_gate.wait()
        self.closed = True


class Network:
    def __init__(self, stream):
        self.stream, self.calls = stream, []

    async def connect_tcp(self, *args, **kwargs):
        self.calls.append((args, kwargs))
        return self.stream


def dns_value(addresses=('1.1.1.1', '8.8.8.8')):
    return {'Status': 0, 'TC': False, 'Question': [{'name': 'api.openai.com.', 'type': 1}],
        'Answer': [{'name': 'api.openai.com.', 'type': 1, 'TTL': 300, 'data': address} for address in addresses]}


class DnsClients:
    def __init__(self, handler):
        self.handler, self.options, self.requests, self.clients = handler, [], [], []
        self.close_started = asyncio.Event()
        self.close_gate = None

    def __call__(self, **kwargs):
        self.options.append(dict(kwargs))
        kwargs.pop('proxy')  # Preserve all HTTP behavior; only replace the socket transport.
        owner = self
        class Mock(httpx.MockTransport):
            async def aclose(self):
                owner.close_started.set()
                if owner.close_gate:
                    await owner.close_gate.wait()
                await super().aclose()
        async def handler(request):
            self.requests.append(request)
            value = self.handler(request)
            response = await value if hasattr(value, '__await__') else value
            if response.is_stream_consumed:
                # Match real stream=True ownership, rather than failing early
                # with StreamConsumed before the parser can inspect the wire.
                response = httpx.Response(response.status_code, headers=response.headers,
                    stream=httpx.ByteStream(response.content))
            return response
        client = REAL_CLIENT(transport=Mock(handler), **kwargs)
        self.clients.append(client)
        return client


REAL_CLIENT = httpx.AsyncClient


class LoopbackTransportTests(unittest.IsolatedAsyncioTestCase):
    async def test_proxy_configuration_and_all_validated_addresses_fail_closed(self):
        for url in ('http://user:pass@127.0.0.1:7890', 'https://127.0.0.1:7890',
                'http://localhost:7890', 'http://1.1.1.1:7890', 'http://127.0.0.1',
                'http://127.0.0.1:0', 'http://127.0.0.1:7890/path', 'http://127.0.0.1:7890?key=' + PRIVATE,
                'http://127.0.0.1:7890\r\n', None):
            with self.subTest(url=url), self.assertRaisesRegex(ValueError, '^LOCAL_OPENAI_TRANSPORT_FAILED$'):
                transport.validate_proxy(url)
        self.assertEqual('http://[::1]:7890', transport.validate_proxy('http://[::1]:7890/'))
        for changes in ({'resolved_addresses': ('1.1.1.1', '127.0.0.1')}, {'resolved_addresses': ()},
                {'host': 'other.invalid'}, {'port': 80}, {'scheme': 'http'}):
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                transport.create_loopback_transport(options(**changes), 'http://127.0.0.1:7890')
        context = ssl.create_default_context()
        context.check_hostname = False
        with self.assertRaises(ValueError):
            transport.create_loopback_transport(options(), 'http://127.0.0.1:7890', ssl_context=context)

    async def test_connect_header_parser_bounds_and_owned_stream_close(self):
        malformed = [b'HTTP/1.1 407 ' + PRIVATE.encode() + b'\r\n\r\n',
            b'HTTP/1.1 200 OK\r\n\r\nextra', b'HTTP/1.1 200 OK\r\nContent-Length: 1\r\n\r\n',
            b'HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n',
            b'HTTP/1.1 200 OK\r\nContent-Encoding: gzip\r\n\r\n',
            b'HTTP/1.1 200 OK\r\nX: a\r\nX: b\r\n\r\n', b'HTTP/1.1 200 OK\r\ninvalid\r\n\r\n',
            b'HTTP/1.1 200 OK\r\nX: ' + b'x' * 4096 + b'\r\n\r\n', b'']
        for header in malformed:
            stream = Stream([header])
            backend = transport._ConnectBackend(('1.1.1.1',), 'http://127.0.0.1:7890', 2)
            backend._backend = Network(stream)
            with self.assertRaises(httpx.ConnectError) as caught:
                await backend.connect_tcp('1.1.1.1', 443, timeout=30)
            self.assertEqual(transport.FAILED, str(caught.exception))
            self.assertNotIn(PRIVATE, repr(caught.exception))
            self.assertTrue(stream.closed)
        stream = Stream([b'HTTP/1.1 200 Connection ', b'established\r\nContent-Length: 0\r\n\r\n'])
        backend = transport._ConnectBackend(('1.1.1.1',), 'http://127.0.0.1:7890', 2)
        backend._backend = Network(stream)
        owned = await backend.connect_tcp('1.1.1.1', 443)
        self.assertEqual([b'CONNECT 1.1.1.1:443 HTTP/1.1\r\nHost: 1.1.1.1:443\r\n\r\n'], stream.written)
        self.assertEqual(('127.0.0.1', 7890), backend._backend.calls[0][0])
        await owned.aclose()
        self.assertTrue(stream.closed)

    async def test_destination_unix_and_retry_paths_cannot_reach_proxy(self):
        backend = transport._ConnectBackend(('1.1.1.1',), 'http://127.0.0.1:7890', 2)
        backend._backend = Network(Stream())
        for host, port in (('api.openai.com', 443), ('8.8.8.8', 443), ('1.1.1.1', 80), ('127.0.0.1', 443)):
            with self.assertRaises(httpx.ConnectError):
                await backend.connect_tcp(host, port)
        with self.assertRaises(httpx.ConnectError):
            await backend.connect_unix_socket('/synthetic/private')
        with self.assertRaises(httpx.ConnectError):
            await backend.sleep(1)
        self.assertEqual([], backend._backend.calls)

    async def test_transport_close_failure_has_fixed_text_and_cannot_mask_cancellation(self):
        entered, gate = asyncio.Event(), asyncio.Event()
        class BrokenPool:
            async def aclose(self):
                entered.set()
                await gate.wait()
                raise OSError(PRIVATE)
        tunnel = transport.create_loopback_transport(options(), 'http://127.0.0.1:7890')
        await tunnel.aclose()
        tunnel._pool = BrokenPool()
        gate.set()
        with self.assertRaises(httpx.CloseError) as caught:
            await tunnel.aclose()
        self.assertEqual(transport.FAILED, str(caught.exception))
        gate.clear()
        entered.clear()
        task = asyncio.create_task(tunnel.aclose())
        try:
            await asyncio.wait_for(entered.wait(), 1)
            task.cancel()
            await asyncio.sleep(0)
            task.cancel()
            await asyncio.sleep(0)
            self.assertFalse(task.done())
            gate.set()
            with self.assertRaises(asyncio.CancelledError):
                await asyncio.wait_for(task, 1)
        finally:
            gate.set()
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)

    async def test_cancelled_connect_drains_owned_stream_even_with_repeated_cancel(self):
        stream = Stream()
        stream.read_gate, stream.close_gate = asyncio.Event(), asyncio.Event()
        backend = transport._ConnectBackend(('1.1.1.1',), 'http://127.0.0.1:7890', 2)
        backend._backend = Network(stream)
        task = asyncio.create_task(backend.connect_tcp('1.1.1.1', 443))
        try:
            await asyncio.wait_for(stream.read_started.wait(), 1)
            task.cancel()
            await asyncio.wait_for(stream.close_started.wait(), 1)
            task.cancel()
            await asyncio.sleep(0)
            self.assertFalse(task.done())
            stream.close_gate.set()
            with self.assertRaises(asyncio.CancelledError):
                await asyncio.wait_for(task, 1)
            self.assertTrue(stream.closed)
        finally:
            stream.close_gate.set()
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)

    async def test_connect_deadline_and_tls_cancellation_close_owned_streams(self):
        stream = Stream()
        stream.read_gate = asyncio.Event()
        backend = transport._ConnectBackend(('1.1.1.1',), 'http://127.0.0.1:7890', 2)
        backend._backend = Network(stream)
        real_timeout = asyncio.timeout
        with patch.object(transport.asyncio, 'timeout', side_effect=lambda _: real_timeout(.02)):
            with self.assertRaises(httpx.ConnectTimeout):
                await backend.connect_tcp('1.1.1.1', 443)
        self.assertTrue(stream.closed)
        self.assertEqual(1, len(backend._backend.calls))
        entered = asyncio.Event()
        class PendingTls(Stream):
            async def start_tls(self, *args):
                entered.set()
                await asyncio.Event().wait()
        stream = PendingTls()
        stream.close_gate = asyncio.Event()
        task = asyncio.create_task(transport._OwnedStream(stream).start_tls(ssl.create_default_context(), 'api.openai.com', 1))
        try:
            await asyncio.wait_for(entered.wait(), 1)
            task.cancel()
            await asyncio.wait_for(stream.close_started.wait(), 1)
            task.cancel()
            await asyncio.sleep(0)
            self.assertFalse(task.done())
            stream.close_gate.set()
            with self.assertRaises(asyncio.CancelledError):
                await asyncio.wait_for(task, 1)
            self.assertTrue(stream.closed)
        finally:
            stream.close_gate.set()
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)

    async def tls_proxy(self, name='api.openai.com'):
        directory = tempfile.TemporaryDirectory(prefix='sun-world-official-tls-')
        self.addCleanup(directory.cleanup)
        root = Path(directory.name)
        config, key, cert = root / 'openssl.cnf', root / 'key.pem', root / 'cert.pem'
        config.write_text('[req]\nprompt=no\ndistinguished_name=dn\nx509_extensions=ext\n'
            f'[dn]\nCN={name}\n[ext]\nsubjectAltName=DNS:{name}\nbasicConstraints=critical,CA:TRUE\n')
        subprocess.run(['/usr/bin/openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
            '-config', str(config), '-keyout', str(key), '-out', str(cert)], check=True,
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=5, env={'PATH': '/usr/bin:/bin'})
        os.chmod(key, 0o600)
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        context.load_cert_chain(cert, key)
        seen, tasks, writers = [], set(), set()
        context.set_servername_callback(lambda _, host, __: seen.append(('sni', host)))
        async def accepted(reader, writer):
            task = asyncio.current_task()
            tasks.add(task)
            writers.add(writer)
            try:
                async with asyncio.timeout(3):
                    seen.append(('connect', await reader.readuntil(b'\r\n\r\n')))
                    writer.write(b'HTTP/1.1 200 Connection established\r\n\r\n')
                    await writer.drain()
                    await writer.start_tls(context, ssl_handshake_timeout=2)
                    seen.append(('request', await reader.readuntil(b'\r\n\r\n')))
                    writer.write(b'HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}')
                    await writer.drain()
            except (Exception, asyncio.CancelledError):
                pass
            finally:
                writer.close()
                try:
                    await writer.wait_closed()
                except Exception:
                    pass
                writers.discard(writer)
                tasks.discard(task)
        server = await asyncio.start_server(accepted, '127.0.0.1', 0)
        async def close():
            server.close()
            await server.wait_closed()
            for writer in list(writers):
                writer.close()
            for task in list(tasks):
                task.cancel()
            await asyncio.gather(*list(tasks), return_exceptions=True)
        self.addAsyncCleanup(close)
        return f'http://127.0.0.1:{server.sockets[0].getsockname()[1]}', ssl.create_default_context(cafile=cert), seen

    async def test_actual_connect_tls_preserves_provider_ip_pin_host_sni_and_certificate_verification(self):
        proxy, context, seen = await self.tls_proxy()
        tunnel = transport.create_loopback_transport(options(), proxy, ssl_context=context)
        dependencies = SimpleNamespace(httpx2=SimpleNamespace(Timeout=httpx.Timeout, AsyncByteStream=httpx.AsyncByteStream,
            AsyncClient=lambda **kwargs: REAL_CLIENT(transport=tunnel, **kwargs)))
        client = OpenAiCompatibleProvider._build_http_client(dependencies, options())
        async with client:
            response = await client.get('https://api.openai.com/v1/models')
            self.assertEqual(200, response.status_code)
        self.assertIn(('sni', 'api.openai.com'), seen)
        self.assertIn(('connect', b'CONNECT 1.1.1.1:443 HTTP/1.1\r\nHost: 1.1.1.1:443\r\n\r\n'), seen)
        self.assertIn(b'Host: api.openai.com\r\n', next(value for kind, value in seen if kind == 'request'))
        self.assertEqual('1.1.1.1', response.request.url.host)
        for supplied in (None, context):
            bad_proxy, wrong_context, _ = await self.tls_proxy('wrong.example')
            # A trusted wrong hostname and an untrusted certificate both fail.
            selected = wrong_context if supplied is not None else None
            bad = transport.create_loopback_transport(options(), bad_proxy, ssl_context=selected)
            async with REAL_CLIENT(transport=bad, trust_env=False, timeout=2) as denied:
                with self.assertRaises(httpx.ConnectError) as caught:
                    await denied.get('https://1.1.1.1/v1/models', headers={'Host': 'api.openai.com'}, extensions={'sni_hostname': 'api.openai.com'})
                self.assertEqual(transport.FAILED, str(caught.exception))

    async def test_wrong_pin_host_sni_method_and_path_are_rejected_before_connect(self):
        proxy, context, seen = await self.tls_proxy()
        tunnel = transport.create_loopback_transport(options(), proxy, ssl_context=context)
        async with REAL_CLIENT(transport=tunnel, trust_env=False, timeout=1) as client:
            cases = [('GET', 'https://api.openai.com/v1/models', 'api.openai.com', 'api.openai.com'),
                ('GET', 'https://1.1.1.1/v1/models', 'wrong.invalid', 'api.openai.com'),
                ('GET', 'https://1.1.1.1/v1/models', 'api.openai.com', 'wrong.invalid'),
                ('DELETE', 'https://1.1.1.1/v1/models', 'api.openai.com', 'api.openai.com'),
                ('GET', 'https://1.1.1.1/v1/files', 'api.openai.com', 'api.openai.com'),
                ('GET', 'https://1.1.1.1/v1/models?key=x', 'api.openai.com', 'api.openai.com'),
                ('GET', 'https://1.1.1.1/v1/models#private', 'api.openai.com', 'api.openai.com')]
            for method, url, host, sni in cases:
                with self.assertRaises(httpx.ConnectError):
                    await client.request(method, url, headers={'Host': host}, extensions={'sni_hostname': sni})
        self.assertEqual([], seen)


class OfficialDnsTests(unittest.IsolatedAsyncioTestCase):
    async def run_dns(self, handler):
        clients = DnsClients(handler)
        with patch.object(transport.httpx, 'AsyncClient', clients):
            result = await transport.OfficialOpenAiDnsResolver('http://127.0.0.1:7890').resolve('api.openai.com', 443)
        return result, clients

    async def test_fixed_doh_url_and_options_return_every_ipv4_for_provider_validation(self):
        result, clients = await self.run_dns(lambda _: httpx.Response(200, json=dns_value(('1.1.1.1', '127.0.0.1'))))
        self.assertEqual(('1.1.1.1', '127.0.0.1'), result)
        self.assertEqual(transport.DOH_URL, str(clients.requests[0].url))
        self.assertEqual('GET', clients.requests[0].method)
        self.assertNotIn('authorization', clients.requests[0].headers)
        self.assertEqual('identity', clients.requests[0].headers['accept-encoding'])
        self.assertEqual({'proxy': 'http://127.0.0.1:7890', 'verify': True, 'trust_env': False,
            'follow_redirects': False, 'http2': False}, {key: clients.options[0][key] for key in
            ('proxy', 'verify', 'trust_env', 'follow_redirects', 'http2')})
        self.assertTrue(clients.clients[0].is_closed)
        clients = DnsClients(lambda _: httpx.Response(200, json=dns_value()))
        with patch.object(transport.httpx, 'AsyncClient', clients):
            for host, port in (('other.invalid', 443), ('api.openai.com', 80), ('api.openai.com.', 443)):
                with self.assertRaises(ValueError):
                    await transport.OfficialOpenAiDnsResolver('http://127.0.0.1:7890').resolve(host, port)
        self.assertEqual([], clients.clients)

    async def test_doh_identity_status_type_duplicate_and_body_limits_fail_closed(self):
        raw = json.dumps(dns_value()).encode()
        invalid = [b'{"Status":0,' + raw[1:], raw.replace(b'300', b'NaN'), b'\xff',
            json.dumps({**dns_value(), 'Status': True}).encode(),
            json.dumps({**dns_value(), 'Question': [{'name': 'other.invalid', 'type': 1}]}).encode(),
            json.dumps({**dns_value(), 'TC': True}).encode(),
            json.dumps(dns_value(('::1',))).encode(),
            json.dumps({**dns_value(), 'Answer': [{'name': 'api.openai.com.', 'type': 5, 'TTL': 1, 'data': PRIVATE}]}).encode(),
            b'[' * 40 + raw + b']' * 40, b'x' * 16385]
        for body in invalid:
            clients = DnsClients(lambda _: httpx.Response(200, headers={'content-type': 'application/dns-json'}, content=body))
            with patch.object(transport.httpx, 'AsyncClient', clients):
                with self.assertRaises(httpx.ConnectError) as caught:
                    await transport.OfficialOpenAiDnsResolver('http://127.0.0.1:7890').resolve('api.openai.com', 443)
            self.assertEqual(transport.DNS_FAILED, str(caught.exception))
            self.assertTrue(clients.clients[0].is_closed)
            self.assertEqual(1, len(clients.requests))

    async def test_doh_redirect_compression_driver_error_timeout_never_retry(self):
        def driver(_):
            raise OSError(PRIVATE)
        def timeout(_):
            raise httpx.ReadTimeout(PRIVATE)
        for handler in (lambda _: httpx.Response(302, headers={'location': 'http://127.0.0.1/'}, content=PRIVATE.encode()),
                lambda _: httpx.Response(200, headers={'content-encoding': 'gzip'}, stream=httpx.ByteStream(b'not-gzip')), driver, timeout):
            clients = DnsClients(handler)
            with patch.object(transport.httpx, 'AsyncClient', clients):
                with self.assertRaises(httpx.TransportError) as caught:
                    await transport.OfficialOpenAiDnsResolver('http://127.0.0.1:7890').resolve('api.openai.com', 443)
            self.assertNotIn(PRIVATE, repr(caught.exception))
            self.assertEqual(1, len(clients.requests))
            self.assertTrue(clients.clients[0].is_closed)

    async def test_doh_stream_without_length_and_total_deadline_are_bounded(self):
        raw = json.dumps({**dns_value(), 'Comment': 'x' * 17000}).encode()
        class Chunks(httpx.AsyncByteStream):
            def __init__(self):
                self.closed, self.count = False, 0
            async def __aiter__(self):
                for chunk in (raw[:8192], raw[8192:]):
                    self.count += 1
                    yield chunk
            async def aclose(self):
                self.closed = True
        chunks = Chunks()
        clients = DnsClients(lambda _: httpx.Response(200, headers={'content-type': 'application/dns-json'}, stream=chunks))
        with patch.object(transport.httpx, 'AsyncClient', clients):
            with self.assertRaises(httpx.ConnectError):
                await transport.OfficialOpenAiDnsResolver('http://127.0.0.1:7890').resolve('api.openai.com', 443)
        self.assertTrue(chunks.closed)
        self.assertEqual(2, chunks.count)
        self.assertTrue(clients.clients[0].is_closed)
        async def stalled(_):
            await asyncio.Event().wait()
        clients = DnsClients(stalled)
        real_timeout = asyncio.timeout
        with patch.object(transport.httpx, 'AsyncClient', clients), patch.object(transport.asyncio, 'timeout',
                side_effect=lambda _: real_timeout(.02)):
            with self.assertRaises(httpx.ConnectTimeout):
                await transport.OfficialOpenAiDnsResolver('http://127.0.0.1:7890').resolve('api.openai.com', 443)
        self.assertTrue(clients.clients[0].is_closed)
        self.assertEqual(1, len(clients.requests))

    async def test_doh_repeated_cancel_waits_for_owned_client_close(self):
        entered = asyncio.Event()
        async def stalled(_):
            entered.set()
            await asyncio.Event().wait()
        clients = DnsClients(stalled)
        clients.close_gate = asyncio.Event()
        with patch.object(transport.httpx, 'AsyncClient', clients):
            task = asyncio.create_task(transport.OfficialOpenAiDnsResolver('http://127.0.0.1:7890').resolve('api.openai.com', 443))
            try:
                await asyncio.wait_for(entered.wait(), 1)
                task.cancel()
                await asyncio.wait_for(clients.close_started.wait(), 1)
                task.cancel()
                await asyncio.sleep(0)
                self.assertFalse(task.done())
                clients.close_gate.set()
                with self.assertRaises(asyncio.CancelledError):
                    await asyncio.wait_for(task, 1)
            finally:
                clients.close_gate.set()
                task.cancel()
                await asyncio.gather(task, return_exceptions=True)
        self.assertTrue(clients.clients[0].is_closed)

    async def test_successful_doh_cancelled_during_close_remains_cancelled(self):
        clients = DnsClients(lambda _: httpx.Response(200, json=dns_value()))
        clients.close_gate = asyncio.Event()
        with patch.object(transport.httpx, 'AsyncClient', clients):
            task = asyncio.create_task(transport.OfficialOpenAiDnsResolver('http://127.0.0.1:7890').resolve('api.openai.com', 443))
            try:
                await asyncio.wait_for(clients.close_started.wait(), 1)
                task.cancel()
                await asyncio.sleep(0)
                task.cancel()
                await asyncio.sleep(0)
                self.assertFalse(task.done())
                clients.close_gate.set()
                with self.assertRaises(asyncio.CancelledError):
                    await asyncio.wait_for(task, 1)
            finally:
                clients.close_gate.set()
                task.cancel()
                await asyncio.gather(task, return_exceptions=True)
        self.assertTrue(clients.clients[0].is_closed)


if __name__ == '__main__':
    unittest.main()
