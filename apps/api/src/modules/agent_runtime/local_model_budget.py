"""Input precharge for the explicitly local SQLite compatibility runtime."""

from uuid import uuid4

from fastapi import HTTPException

from .cleanup import finish_cleanup, run_sync
from .ledger import LedgerError


async def invoke_counted_model(runtime, run_id, body, proxy):
    call_id, observed = str(uuid4()), False
    try:
        if not await run_sync(runtime.store.begin_model_attempt, run_id, call_id, runtime_body_hash(body)):
            raise HTTPException(429, 'model_budget_exhausted')
        await run_sync(runtime.ensure_active, run_id)
        prepared = await proxy.prepare({**body, 'stream': False})
        metadata = proxy.input_metadata(prepared)
        def reserve():
            runtime.ensure_active(run_id)
            runtime.store.reserve_model_input(run_id, call_id, metadata)
            runtime.ensure_active(run_id)
        await run_sync(reserve)
        result = await proxy.generate(prepared)
        await run_sync(runtime.store.observe_model_input, run_id, call_id, result['usage']['input_tokens'])
        observed = True
        await run_sync(runtime.ensure_active, run_id)
        return result
    except LedgerError as error:
        if error.code == 'AGENT_BUDGET_EXCEEDED':
            raise HTTPException(429, 'model_input_budget_exhausted') from None
        raise HTTPException(502, 'model_accounting_failed') from None
    finally:
        if not observed:
            async def settle():
                try:
                    await run_sync(runtime.store.unknown_model_input, run_id, call_id)
                except Exception:
                    pass
            await finish_cleanup(settle())


def runtime_body_hash(body):
    import hashlib
    import json
    try:
        raw = json.dumps({**body, 'stream': False}, ensure_ascii=False, allow_nan=False,
                         sort_keys=True, separators=(',', ':')).encode()
        return hashlib.sha256(raw).hexdigest()
    except Exception:
        raise HTTPException(400, 'model_input_invalid') from None
