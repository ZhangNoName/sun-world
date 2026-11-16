"""Explicit private v2 factory, never mounted by the public application.

The host must run a separately protected TLS listener and supply a verifier of
the authenticated network peer (e.g. a certificate attestation in ASGI scope).
Forwarded headers alone are not a peer identity. The gateway separately checks
the Worker credential, run token, audience and current authorization.
"""

import asyncio
from uuid import UUID

from fastapi import APIRouter, HTTPException, Request
from fastapi.routing import APIRoute

from .gateway import RunCall, token_hash
from .ledger import LedgerError
from .rpc import DeliveryReceipt, FinalResult, PROTOCOL, RootRegistration, ToolInvocation, strict_json


def create_private_run_router(gateway, *, verify_peer):
    if not callable(verify_peer):
        raise ValueError('Authenticated private peer verifier required')

    class PrivateRoute(APIRoute):
        def get_route_handler(self):
            handler = super().get_route_handler()
            async def bounded(request):
                try:
                    trusted = request.scope.get('scheme') == 'https' and verify_peer(request) is True
                except Exception:
                    trusted = False
                if not trusted:
                    raise HTTPException(403, 'AGENT_PRIVATE_PEER_REQUIRED')
                if request.headers.get('x-agent-protocol') != PROTOCOL:
                    raise HTTPException(409, 'AGENT_PROTOCOL_MISMATCH')
                raw = bytearray()
                async for chunk in request.stream():
                    if len(raw) + len(chunk) > 131072:
                        raise HTTPException(413, 'AGENT_INPUT_INVALID')
                    raw.extend(chunk)
                request._body = bytes(raw)
                try:
                    return await handler(request)
                except LedgerError as error:
                    code = error.code
                    status = (401 if code == 'AGENT_CREDENTIAL_INVALID' else
                              403 if code == 'AGENT_ACTIVE_SESSION_REQUIRED' else
                              404 if code == 'AGENT_RUN_NOT_FOUND' else
                              422 if code in {'AGENT_INPUT_INVALID', 'AGENT_OUTPUT_INVALID', 'AGENT_TOOL_INVALID'} else
                              429 if code == 'AGENT_BUDGET_EXCEEDED' else
                              503 if code in {'AGENT_DISABLED', 'AGENT_RUNTIME_UNAVAILABLE', 'AGENT_ADMISSION_UNAVAILABLE', 'AGENT_MODEL_FAILED', 'AGENT_MODEL_TIMEOUT'} else 409)
                    raise HTTPException(status, code) from None
                except HTTPException:
                    raise
                except Exception:
                    raise HTTPException(503, 'AGENT_RUNTIME_UNAVAILABLE') from None
            return bounded

    router = APIRouter(prefix='/internal/agent/v2/runs', route_class=PrivateRoute,
                       include_in_schema=False)

    def call(request, run_id):
        try:
            execution = request.headers.get('x-agent-execution', '')
            if (str(UUID(run_id)) != run_id or str(UUID(execution)) != execution
                    or request.headers.get('x-agent-generation') != '1'):
                raise ValueError('Invalid execution binding')
            authorization = request.headers.get('authorization', '')
            if not authorization.startswith('Bearer '):
                raise ValueError('Bearer credential required')
            token, service = authorization[7:], request.headers.get('x-worker-service', '')
            token_hash(token)
            token_hash(service)
            return RunCall(run_id, execution, 1, service, token)
        except Exception:
            raise LedgerError('AGENT_CREDENTIAL_INVALID') from None

    async def body(request, schema=None):
        try:
            value = strict_json(await request.body())
            if not isinstance(value, dict):
                raise ValueError('Object required')
            return schema.model_validate(value) if schema else value
        except Exception:
            raise LedgerError('AGENT_INPUT_INVALID') from None

    @router.post('/{run_id}/root')
    async def root(run_id: str, request: Request):
        binding = call(request, run_id)
        value = await body(request, RootRegistration)
        await asyncio.to_thread(gateway.bind_root_turn, binding, value.root_turn_id,
                                root_request_id=value.root_request_id)
        return {'registered': True}

    @router.post('/{run_id}/heartbeat')
    async def heartbeat(run_id: str, request: Request):
        binding = call(request, run_id)
        if await body(request) != {}:
            raise LedgerError('AGENT_INPUT_INVALID')
        lease = await asyncio.to_thread(gateway.heartbeat, binding)
        return {'lease_expires_at': lease.isoformat(timespec='microseconds') + 'Z'}

    @router.post('/{run_id}/tools/{tool_id}')
    async def tool(run_id: str, tool_id: str, request: Request):
        binding = call(request, run_id)
        value = await body(request, ToolInvocation)
        return await asyncio.to_thread(gateway.tool, binding, tool_id=tool_id, **value.model_dump())

    @router.post('/{run_id}/receipts')
    async def receipt(run_id: str, request: Request):
        binding = call(request, run_id)
        value = await body(request, DeliveryReceipt)
        await asyncio.to_thread(gateway.receipt, binding, **value.model_dump())
        return {'delivered': True}

    @router.post('/{run_id}/model/messages')
    async def model(run_id: str, request: Request):
        binding = call(request, run_id)
        return await gateway.model(binding, await body(request))

    @router.post('/{run_id}/result')
    async def result(run_id: str, request: Request):
        binding = call(request, run_id)
        value = await body(request, FinalResult)
        committed = await asyncio.to_thread(gateway.finish, binding, **value.model_dump())
        return {'committed': committed}

    return router
