"""Explicit formal browser router; host must replace, never duplicate, v1 dev routes."""

import asyncio
from contextlib import asynccontextmanager

from fastapi import APIRouter, HTTPException, Request, Security
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.routing import APIRoute

from src.core.csrf import canonical_origin
from src.core.response import ApiResponse, fail, ok
from src.core.security_schemes import access_token_cookie
from src.modules.ai.schemas import AiStreamEvent, encode_sse_event
from .application import RequestExists
from .cleanup import finish_cleanup
from .ledger import LedgerError, TERMINAL
from .rpc import strict_json
from .schemas import BlogQaCapabilities, BlogQaRun, RunInput


def create_public_run_router(application, *, allowed_origins):
    origins = frozenset(allowed_origins)
    if not origins or any(not isinstance(origin, str) or canonical_origin(origin) != origin for origin in origins):
        raise ValueError('Explicit canonical browser origins required')

    @asynccontextmanager
    async def lifespan(_host):
        await application.ready()
        try:
            yield
        finally:
            await application.close()

    class BoundedRoute(APIRoute):
        def get_route_handler(self):
            handler = super().get_route_handler()
            async def bounded(request):
                raw = bytearray()
                async for chunk in request.stream():
                    if len(raw) + len(chunk) > 16384:
                        raise HTTPException(413, 'AGENT_INPUT_INVALID')
                    raw.extend(chunk)
                request._body = bytes(raw)
                try:
                    return await handler(request)
                except RequestExists as error:
                    return JSONResponse(status_code=409, content=fail(code=error.code,
                        msg='此请求已受理', data={'run_id': error.run_id}).model_dump())
                except LedgerError as error:
                    status = (401 if error.code == 'AGENT_ACTIVE_SESSION_REQUIRED' else
                              403 if error.code == 'AGENT_NOT_ALLOWLISTED' else
                              404 if error.code == 'AGENT_RUN_NOT_FOUND' else
                              429 if error.code == 'AGENT_RATE_LIMITED' else
                              422 if error.code == 'AGENT_INPUT_INVALID' else
                              409 if error.code in {'AGENT_IDEMPOTENCY_CONFLICT', 'AGENT_ADMISSION_PENDING'} else 503)
                    headers = {'Retry-After': str(error.retry_after)} if type(getattr(error, 'retry_after', None)) is int else {}
                    return JSONResponse(status_code=status, headers=headers,
                        content=fail(code=error.code, msg=error.code).model_dump())
                except HTTPException:
                    raise
                except Exception:
                    return JSONResponse(status_code=503,
                        content=fail(code='AGENT_RUNTIME_UNAVAILABLE', msg='问答暂不可用').model_dump())
            return bounded

    router = APIRouter(tags=['blog-qa'], route_class=BoundedRoute, lifespan=lifespan)

    def require_origin(request):
        origin = canonical_origin(request.headers.get('origin') or request.headers.get('referer'))
        if origin not in origins:
            raise HTTPException(403, '请求来源校验失败')

    @router.get('/ai/v1/blog-qa/capabilities', response_model=ApiResponse[BlogQaCapabilities])
    async def capabilities(request: Request):
        return ok(data=await application.capabilities(request.cookies.get('access_token')))

    @router.post('/ai/v1/blog-qa/runs/stream', response_class=StreamingResponse,
                 dependencies=[Security(access_token_cookie)],
                 openapi_extra={'requestBody': {'required': True, 'content': {'application/json': {
                     'schema': RunInput.model_json_schema()}}}},
                 responses={200: {'content': {'text/event-stream': {'schema': {'type': 'string'}}}}})
    async def start(request: Request):
        require_origin(request)
        try:
            body = RunInput.model_validate(strict_json(await request.body()))
        except Exception:
            raise LedgerError('AGENT_INPUT_INVALID') from None
        accepted = await application.start(request.cookies.get('access_token'),
            question=body.question, idempotency_key=str(body.idempotency_key))

        async def events():
            yield encode_sse_event(AiStreamEvent(event_id=f'{accepted.run_id}:0', type='run.started',
                conversation_id=accepted.run_id, message_id=accepted.run_id, sequence=0,
                data={'run_id': accepted.run_id, 'mode': 'formal'}))
            try:
                while True:
                    state = await application.stream_view(accepted)
                    if state['status'] in TERMINAL:
                        yield encode_sse_event(AiStreamEvent(event_id=f'{accepted.run_id}:1',
                            type='message.completed' if state['status'] == 'completed' else 'run.failed',
                            conversation_id=accepted.run_id, message_id=accepted.run_id, sequence=1, data=state))
                        return
                    await asyncio.sleep(.1)
            except Exception:
                yield encode_sse_event(AiStreamEvent(event_id=f'{accepted.run_id}:1', type='run.failed',
                    conversation_id=accepted.run_id, message_id=accepted.run_id, sequence=1,
                    data={'id': accepted.run_id, 'status': 'interrupted', 'question': '', 'sources': [],
                          'error_code': 'AGENT_RUNTIME_UNAVAILABLE'}))

        class OwnedStream(StreamingResponse):
            async def __call__(self, scope, receive, send):
                try:
                    await super().__call__(scope, receive, send)
                finally:
                    async def cleanup():
                        try:
                            await application.abandon(accepted)
                        except Exception:
                            pass
                    await finish_cleanup(cleanup())
        return OwnedStream(events(), media_type='text/event-stream', headers={'Cache-Control': 'no-store'})

    @router.get('/ai/v1/blog-qa/runs/{run_id}', response_model=ApiResponse[BlogQaRun],
                dependencies=[Security(access_token_cookie)])
    async def get_run(run_id: str, request: Request):
        return ok(data=await application.view(request.cookies.get('access_token'), run_id))

    @router.post('/ai/v1/blog-qa/runs/{run_id}/cancel', response_model=ApiResponse[BlogQaRun],
                 dependencies=[Security(access_token_cookie)])
    async def cancel(run_id: str, request: Request):
        require_origin(request)
        if await request.body() not in {b'', b'{}'}:
            raise LedgerError('AGENT_INPUT_INVALID')
        return ok(data=await application.cancel(request.cookies.get('access_token'), run_id))

    return router
