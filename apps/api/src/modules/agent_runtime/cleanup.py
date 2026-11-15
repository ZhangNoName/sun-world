"""Cancellation-safe cleanup shared by local and formal runtime adapters."""

import asyncio

import anyio


async def finish_cleanup(cleanup):
    """Drain cleanup despite request-scope or repeated asyncio cancellation.

    The separate task keeps direct Task.cancel() calls from interrupting process
    teardown. AnyIO shielding prevents a disconnected response's level-triggered
    cancel scope from repeatedly cancelling each await. Cancellation is propagated
    again once owned resources have been reclaimed.
    """
    task = asyncio.create_task(cleanup)
    cancelled = False
    with anyio.CancelScope(shield=True):
        while not task.done():
            try:
                await asyncio.shield(task)
            except asyncio.CancelledError:
                cancelled = True
        task.result()
    if cancelled:
        raise asyncio.CancelledError
