"""Single-attempt, bounded HTTPS transport to a fixed trusted Worker service.

No retry middleware, environment proxies, redirects, arbitrary URLs or response
diagnostics enter the control path. TLS deployment/mTLS provisioning is external.
"""

import asyncio
import ssl
from urllib.parse import urlsplit

import httpx

from .gateway import encode, token_hash
from .ledger import LedgerError
from .rpc import ExecutionAck, ExecutionBinding, ExecutionStart, WorkerReadiness, PROTOCOL, strict_json


class WorkerHttpTransport:
    def __init__(self, origin, *, service_credential, tls_context=None, transport=None):
        parsed = urlsplit(origin)
        if (parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password
                or parsed.path not in ('', '/') or parsed.query or parsed.fragment):
            raise ValueError('Fixed HTTPS Worker origin required')
        # Evaluate invalid ports during configuration, before any request exists.
        parsed.port
        token_hash(service_credential)
        context = tls_context if tls_context is not None else ssl.create_default_context()
        if not isinstance(context, ssl.SSLContext) or context.verify_mode != ssl.CERT_REQUIRED or not context.check_hostname:
            raise ValueError('Verified Worker TLS context required')
        self._origin = origin.rstrip('/')
        self._credential = service_credential
        self._context, self._transport = context, transport

    async def _send(self, method, path, payload, binding, *, schema=ExecutionAck):
        try:
            raw = encode(payload) if payload is not None else None
            if raw is not None and len(raw) > 16384:
                raise ValueError('Execution request too large')
            async with asyncio.timeout(2):
                async with httpx.AsyncClient(verify=self._context, transport=self._transport,
                    trust_env=False, follow_redirects=False, timeout=httpx.Timeout(2, connect=1),
                    limits=httpx.Limits(max_connections=1, max_keepalive_connections=0)) as client:
                    async with client.stream(method, self._origin + path, content=raw, headers={
                        'content-type': 'application/json', 'accept-encoding': 'identity',
                        'x-agent-protocol': PROTOCOL, 'x-worker-service': self._credential,
                    }) as response:
                        if response.status_code not in (200, 202):
                            raise ValueError('Worker rejected execution')
                        if response.headers.get('content-encoding', 'identity') != 'identity':
                            raise ValueError('Encoded Worker response rejected')
                        body = bytearray()
                        async for chunk in response.aiter_raw(chunk_size=8193):
                            body.extend(chunk)
                            if len(body) > 8192:
                                raise ValueError('Worker response too large')
            ack = schema.model_validate(strict_json(bytes(body))).model_dump()
            if any(ack[key] != value for key, value in binding.items()):
                raise ValueError('Worker binding mismatch')
            return ack
        except Exception:
            raise LedgerError('AGENT_RUNTIME_UNAVAILABLE') from None

    async def start(self, payload):
        try:
            request = ExecutionStart.model_validate(payload).model_dump()
            binding = {key: request[key] for key in ExecutionBinding.model_fields}
        except Exception:
            raise LedgerError('AGENT_INPUT_INVALID') from None
        return await self._send('POST', '/internal/v2/executions', request, binding)

    async def inspect(self, binding):
        return await self._bound_request('GET', binding)

    async def probe(self, *, bundle_hash, model_id):
        expected = {'protocol': PROTOCOL, 'bundle_hash': bundle_hash, 'model_id': model_id}
        result = await self._send('GET', '/internal/v2/readyz', None, expected, schema=WorkerReadiness)
        return result['available'] is True

    async def cancel(self, binding):
        return await self._bound_request('POST', binding)

    async def _bound_request(self, method, binding):
        try:
            binding = ExecutionBinding.model_validate(binding).model_dump()
        except Exception:
            raise LedgerError('AGENT_INPUT_INVALID') from None
        # The path identifies the exact execution; no client-controlled host.
        path = f"/internal/v2/executions/{binding['run_id']}/{binding['execution_id']}"
        if method == 'POST':
            path += '/cancel'
        return await self._send(method, path, binding if method == 'POST' else None, binding)
