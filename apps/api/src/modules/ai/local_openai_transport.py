"""Explicit loopback CONNECT for the local official-OpenAI validation profile.

The Provider still validates every DNS address and pins IP/Host/SNI. This pool
is direct TLS over a restricted CONNECT backend, never httpcore's proxy TLS.
"""

import asyncio
import ipaddress
import math
import ssl
import sys
from time import monotonic
from urllib.parse import urlsplit

import anyio
import httpcore
import httpx

from .mcp_gateway import _address_is_blocked
from .model_proxy import _decode_json
from .providers import ProviderConnectionOptions

HOST = 'api.openai.com'
DOH_URL = 'https://cloudflare-dns.com/dns-query?name=api.openai.com&type=A'
FAILED = 'LOCAL_OPENAI_TRANSPORT_FAILED'
DNS_FAILED = 'LOCAL_OPENAI_DNS_FAILED'


def validate_proxy(proxy_url):
    """No environment inheritance, credentials, hostname lookup or URL suffix."""
    try:
        if (type(proxy_url) is not str or not 1 <= len(proxy_url) <= 128
                or any(ord(char) <= 32 or ord(char) >= 127 for char in proxy_url)):
            raise ValueError
        parsed = urlsplit(proxy_url)
        if (parsed.scheme != 'http' or parsed.username is not None or parsed.password is not None
                or parsed.path not in ('', '/') or parsed.query or parsed.fragment
                or '%' in parsed.netloc or parsed.port is None or not 1 <= parsed.port <= 65535):
            raise ValueError
        address = ipaddress.ip_address(parsed.hostname)
        if not address.is_loopback:
            raise ValueError
        host = f'[{address}]' if address.version == 6 else str(address)
        return f'http://{host}:{parsed.port}'
    except Exception:
        raise ValueError(FAILED) from None


def _secure(context):
    if (not isinstance(context, ssl.SSLContext) or not context.check_hostname
            or context.verify_mode != ssl.CERT_REQUIRED):
        raise ValueError(FAILED)
    return context


def _mapped(error, message=FAILED):
    for core, client in ((httpcore.ConnectTimeout, httpx.ConnectTimeout),
            (httpcore.ReadTimeout, httpx.ReadTimeout), (httpcore.WriteTimeout, httpx.WriteTimeout),
            (httpcore.PoolTimeout, httpx.PoolTimeout), (httpcore.ReadError, httpx.ReadError),
            (httpcore.WriteError, httpx.WriteError), (httpcore.RemoteProtocolError, httpx.RemoteProtocolError)):
        if isinstance(error, (core, client)):
            return client(message)
    if isinstance(error, (TimeoutError, httpx.TimeoutException)):
        return httpx.ConnectTimeout(message)
    return httpx.ConnectError(message)


async def _close(resource):
    task, cancelled = asyncio.create_task(resource.aclose()), False
    with anyio.CancelScope(shield=True):
        while not task.done():
            try:
                await asyncio.shield(task)
            except asyncio.CancelledError:
                cancelled = True
            except Exception:
                break  # Read the terminal error below and discard its text.
        try:
            task.result()
        except Exception:
            if cancelled:
                raise asyncio.CancelledError from None
            raise httpx.CloseError(FAILED) from None
    if cancelled:
        raise asyncio.CancelledError


async def _release(resource, failed=False):
    try:
        await _close(resource)
    except asyncio.CancelledError:
        raise
    except Exception:
        if not failed:
            raise httpx.CloseError(FAILED) from None


class _OwnedStream(httpcore.AsyncNetworkStream):
    def __init__(self, stream):
        self._stream = stream

    async def read(self, max_bytes, timeout=None):
        return await self._stream.read(max_bytes, timeout)

    async def write(self, buffer, timeout=None):
        await self._stream.write(buffer, timeout)

    async def aclose(self):
        await _close(self._stream)

    async def start_tls(self, ssl_context, server_hostname=None, timeout=None):
        try:
            _secure(ssl_context)
            if server_hostname != HOST:
                raise ValueError(FAILED)
            self._stream = await self._stream.start_tls(ssl_context, server_hostname, timeout)
            return self
        except BaseException:
            await _release(self, True)
            raise

    def get_extra_info(self, info):
        return self._stream.get_extra_info(info)


class _ConnectBackend(httpcore.AsyncNetworkBackend):
    def __init__(self, addresses, proxy_url, connect_timeout):
        parsed = urlsplit(validate_proxy(proxy_url))
        self._proxy = (parsed.hostname, parsed.port)
        self._addresses, self._timeout = frozenset(addresses), min(connect_timeout, 5.0)
        self._backend = httpcore.AnyIOBackend()

    async def connect_tcp(self, host, port, timeout=None, local_address=None, socket_options=None):
        stream = None
        try:
            address = ipaddress.ip_address(host)
            if (str(address) not in self._addresses or type(port) is not int or port != 443
                    or local_address is not None or socket_options):
                raise ValueError(FAILED)
            limit = self._timeout
            if timeout is not None:
                if type(timeout) not in (int, float) or not math.isfinite(timeout) or timeout <= 0:
                    raise ValueError(FAILED)
                limit = min(limit, timeout)
            authority = f'[{address}]:443' if address.version == 6 else f'{address}:443'
            async with asyncio.timeout(limit):
                raw = await self._backend.connect_tcp(*self._proxy, timeout=limit)
                stream = _OwnedStream(raw)
                await stream.write(f'CONNECT {authority} HTTP/1.1\r\nHost: {authority}\r\n\r\n'.encode('ascii'), limit)
                response = bytearray()
                while b'\r\n\r\n' not in response:
                    chunk = await stream.read(4097 - len(response), limit)
                    if not chunk:
                        raise ValueError(FAILED)
                    response.extend(chunk)
                    if len(response) > 4096:
                        raise ValueError(FAILED)
                header, extra = bytes(response).split(b'\r\n\r\n', 1)
                lines = header.split(b'\r\n')
                if (extra or not lines[0].startswith((b'HTTP/1.1 200 ', b'HTTP/1.0 200 '))
                        or any(byte < 32 or byte > 126 for byte in lines[0])):
                    raise ValueError(FAILED)
                names = set()
                for line in lines[1:]:
                    name, separator, value = line.partition(b':')
                    if (not separator or not name or any(char not in b"!#$%&'*+-.^_`|~0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz" for char in name)
                            or any(byte < 32 or byte > 126 for byte in value) or name.lower() in names):
                        raise ValueError(FAILED)
                    names.add(name.lower())
                    if name.lower() in (b'transfer-encoding', b'content-encoding'):
                        raise ValueError(FAILED)
                    if name.lower() == b'content-length' and value.strip() != b'0':
                        raise ValueError(FAILED)
                return stream
        except BaseException as error:
            if stream is not None:
                await _release(stream, True)
            if isinstance(error, asyncio.CancelledError):
                raise
            raise _mapped(error) from None

    async def connect_unix_socket(self, *args, **kwargs):
        raise httpx.ConnectError(FAILED)

    async def sleep(self, seconds):
        raise httpx.ConnectError(FAILED)  # retries=0; no fallback/reconnect policy.


class _ResponseStream(httpx.AsyncByteStream):
    def __init__(self, stream):
        self._stream = stream

    async def __aiter__(self):
        try:
            async for part in self._stream:
                yield part
        except BaseException as error:
            await _release(self, True)
            if isinstance(error, asyncio.CancelledError):
                raise
            raise _mapped(error) from None

    async def aclose(self):
        await _close(self._stream)


class _LoopbackTransport(httpx.AsyncBaseTransport):
    def __init__(self, options, proxy_url, ssl_context):
        try:
            if (not isinstance(options, ProviderConnectionOptions) or options.scheme != 'https'
                    or options.host != HOST or options.port != 443 or not options.resolved_addresses
                    or len(options.resolved_addresses) > 32 or type(options.connect_timeout_seconds) not in (int, float)
                    or not math.isfinite(options.connect_timeout_seconds) or options.connect_timeout_seconds <= 0):
                raise ValueError(FAILED)
            addresses = []
            for value in options.resolved_addresses:
                if type(value) is not str or '%' in value or _address_is_blocked(value):
                    raise ValueError(FAILED)
                addresses.append(str(ipaddress.ip_address(value)))
            self._addresses = frozenset(addresses)
            self._pool = httpcore.AsyncConnectionPool(ssl_context=_secure(ssl_context),
                max_connections=1, max_keepalive_connections=0, keepalive_expiry=0,
                http1=True, http2=False, retries=0,
                network_backend=_ConnectBackend(addresses, proxy_url, options.connect_timeout_seconds))
        except Exception:
            raise ValueError(FAILED) from None

    async def handle_async_request(self, request):
        try:
            if (request.url.scheme != 'https' or request.url.port not in (None, 443)
                    or request.url.host not in self._addresses or request.headers.get('host') != HOST
                    or request.extensions.get('sni_hostname') != HOST or request.url.fragment
                    or (request.method, request.url.raw_path) not in
                        (('GET', b'/v1/models'), ('POST', b'/v1/responses'),
                         ('POST', b'/v1/responses/input_tokens'))):
                raise ValueError(FAILED)
            response = await self._pool.handle_async_request(httpcore.Request(method=request.method,
                url=httpcore.URL(scheme=request.url.raw_scheme, host=request.url.raw_host,
                    port=request.url.port, target=request.url.raw_path),
                headers=request.headers.raw, content=request.stream, extensions=request.extensions))
            return httpx.Response(response.status, headers=response.headers,
                stream=_ResponseStream(response.stream), extensions=response.extensions)
        except asyncio.CancelledError:
            raise
        except Exception as error:
            raise _mapped(error) from None

    async def aclose(self):
        await _close(self._pool)


def create_loopback_transport(options, proxy_url, *, ssl_context=None):
    return _LoopbackTransport(options, proxy_url, ssl.create_default_context() if ssl_context is None else ssl_context)


class OfficialOpenAiDnsResolver:
    def __init__(self, proxy_url):
        self._proxy_url = validate_proxy(proxy_url)
        self._lock = asyncio.Lock()
        self._cached_addresses, self._cache_expires = None, 0

    async def resolve(self, host, port):
        if type(host) is not str or host != HOST or type(port) is not int or port != 443:
            raise ValueError(DNS_FAILED)
        async with self._lock:
            started = monotonic()
            if self._cached_addresses is not None and started < self._cache_expires:
                return self._cached_addresses
            # Never fall back to stale or partially parsed answers.
            self._cached_addresses, self._cache_expires = None, 0
            addresses, ttl = await self._query()
            if asyncio.current_task().cancelling():
                raise asyncio.CancelledError
            expires = started + min(ttl, 60)
            if (ttl > 0 and monotonic() < expires
                    and all(_address_is_blocked(address) is False for address in addresses)):
                self._cached_addresses, self._cache_expires = addresses, expires
            return addresses  # Every address still goes through Provider validation.

    async def _query(self):
        client = response = None
        failed = False
        try:
            async with asyncio.timeout(5):
                client = httpx.AsyncClient(proxy=self._proxy_url, verify=True, trust_env=False,
                    follow_redirects=False, http2=False, timeout=httpx.Timeout(5, connect=3, pool=1),
                    limits=httpx.Limits(max_connections=1, max_keepalive_connections=0),
                    headers={'Accept': 'application/dns-json', 'Accept-Encoding': 'identity'})
                response = await client.send(client.build_request('GET', DOH_URL), stream=True)
                if (response.status_code != 200 or response.headers.get('content-encoding', 'identity').lower() not in ('', 'identity')
                        or response.headers.get('content-type', '').split(';')[0].lower() not in ('application/dns-json', 'application/json')):
                    raise ValueError(DNS_FAILED)
                length = response.headers.get('content-length')
                if length is not None and (not length.isascii() or not length.isdecimal() or int(length) > 16384):
                    raise ValueError(DNS_FAILED)
                raw = bytearray()
                # The raw owned stream avoids aiter_raw's implicit unshielded
                # response close; both response/client close are drained below.
                async for chunk in response.stream:
                    if len(raw) + len(chunk) > 16384:
                        raise ValueError(DNS_FAILED)
                    raw.extend(chunk)
                value = _decode_json(bytes(raw), 16384, DNS_FAILED)
                if (type(value) is not dict or type(value.get('Status')) is not int or value['Status'] != 0
                        or type(value.get('Question')) is not list or len(value['Question']) != 1
                        or type(value.get('Answer')) is not list or not 1 <= len(value['Answer']) <= 32):
                    raise ValueError(DNS_FAILED)
                if any(key in value and type(value[key]) is not bool for key in ('TC', 'RD', 'RA', 'AD', 'CD')) or value.get('TC', False):
                    raise ValueError(DNS_FAILED)
                question = value['Question'][0]
                if (type(question) is not dict or set(question) != {'name', 'type'}
                        or question['name'] not in (HOST, HOST + '.') or type(question['type']) is not int or question['type'] != 1):
                    raise ValueError(DNS_FAILED)
                addresses, ttl = [], 60
                for answer in value['Answer']:
                    if (type(answer) is not dict or set(answer) != {'name', 'type', 'TTL', 'data'}
                            or answer['name'] not in (HOST, HOST + '.') or type(answer['type']) is not int or answer['type'] != 1
                            or type(answer['TTL']) is not int or not 0 <= answer['TTL'] <= 2**31 - 1
                            or type(answer['data']) is not str):
                        raise ValueError(DNS_FAILED)
                    address = str(ipaddress.IPv4Address(answer['data']))
                    ttl = min(ttl, answer['TTL'])
                    if address not in addresses:
                        addresses.append(address)
        except BaseException as error:
            failed = True
            if isinstance(error, asyncio.CancelledError):
                raise
            raise _mapped(error, DNS_FAILED) from None
        finally:
            try:
                if response is not None:
                    await _release(response, failed)
            finally:
                if client is not None:
                    await _release(client, failed or sys.exc_info()[0] is not None)
        # Publication is outside both owned closes; an unknown close cannot
        # return a candidate to resolve(), even after a valid HTTP response.
        return tuple(addresses), ttl
