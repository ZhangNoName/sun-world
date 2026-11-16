"""At-most-once private dispatch; unknown outcomes never replay a start request."""

import asyncio
import hmac
from datetime import timezone
from uuid import uuid4

from .cleanup import finish_cleanup
from .gateway import token_hash
from .ledger import ENGINE, TERMINAL, LedgerError, digest, uuid_text
from .rpc import PROTOCOL, ExecutionAck, ExecutionBinding, ExecutionStart


IO_TIMEOUT = 2.0
MONITOR_INTERVAL = 0.1


class RunDispatcher:
    def __init__(self, gateway, worker, *, worker_credential, max_active=128):
        if (type(max_active) is not int or not 1 <= max_active <= 128
                or not all(callable(getattr(worker, name, None)) for name in ('start', 'inspect', 'cancel'))
                or not hmac.compare_digest(token_hash(worker_credential), gateway.worker_hash)):
            raise ValueError('Invalid private worker dispatch configuration')
        self.gateway, self.ledger, self.worker = gateway, gateway.ledger, worker
        # The transport owns its service credential. Never send it in payloads
        # or retain a second printable copy on this dispatcher.
        self._known, self._monitors, self._known_slots = {}, {}, {}
        self._slots, self._inflight_slots, self._dispatch_tasks = set(), set(), set()
        self._max_active = max_active
        self._closing = False

    def _forget(self, run_id):
        self._known.pop(run_id, None)
        slot = self._known_slots.pop(run_id, None)
        if slot is not None and slot not in self._inflight_slots:
            self._slots.discard(slot)

    async def _cancel_worker(self, binding):
        try:
            self._ack(await self._io('cancel', binding), binding)
        except Exception:
            # Best effort only; the dispatcher never labels an unconfirmed
            # process stop as confirmed. Worker cancellation must be idempotent.
            pass

    def _preflight(self, run_id, question):
        if (not isinstance(question, str) or not question.strip() or len(question) > 2000):
            raise LedgerError('AGENT_INPUT_INVALID')
        question = question.strip()
        try:
            question.encode('utf-8')
        except UnicodeError:
            raise LedgerError('AGENT_INPUT_INVALID') from None
        with self.ledger.unit_of_work() as uow:
            row = uow.fetch_one('SELECT * FROM agent_runs WHERE id=%s FOR UPDATE', (uuid_text(run_id),))
            if not row:
                raise LedgerError('AGENT_RUN_NOT_FOUND')
            self.gateway._authorize(uow, row)
            if (row['engine'] != ENGINE or row['request_hash'] != digest({'scenario': 'blog-qa', 'question': question})):
                raise LedgerError('AGENT_PROFILE_MISMATCH')
            return question

    @staticmethod
    def _binding(row):
        try:
            return ExecutionBinding.model_validate(dict(protocol=PROTOCOL, run_id=row['id'],
                execution_id=row['execution_id'], generation=row['generation'],
                bundle_hash=row['bundle_hash'])).model_dump()
        except Exception:
            raise LedgerError('AGENT_EXECUTION_INVALID') from None

    def _current(self, binding, *, allow_terminal=False):
        with self.ledger.unit_of_work() as uow:
            row = self.ledger._binding(uow, binding['run_id'], binding['execution_id'], binding['generation'])
            if row['bundle_hash'] != binding['bundle_hash']:
                raise LedgerError('AGENT_PROFILE_MISMATCH')
            if allow_terminal and row['status'] in TERMINAL:
                return row
            self.gateway._authorize(uow, row)
            self.ledger._live(row, self.ledger.now())
            return row

    @staticmethod
    def _ack(value, binding, *, initial=False):
        try:
            result = ExecutionAck.model_validate(value).model_dump()
            if any(result[key] != expected for key, expected in binding.items()):
                raise ValueError
            if initial and result['status'] not in {'running', 'completed'}:
                raise ValueError
            return result
        except Exception:
            raise LedgerError('AGENT_DISPATCH_UNCONFIRMED') from None

    @staticmethod
    async def _db(function, *args, **kwargs):
        task = asyncio.create_task(asyncio.to_thread(function, *args, **kwargs))
        try:
            return await asyncio.shield(task)
        except asyncio.CancelledError:
            async def drain():
                try:
                    await asyncio.shield(task)
                except Exception:
                    pass
            await finish_cleanup(drain())
            raise

    async def _io(self, method, payload, *, row=None):
        timeout = IO_TIMEOUT
        if row is not None:
            remaining = (min(row['deadline'], row['lease_expires_at']) - self.ledger.now()).total_seconds()
            if remaining <= 0:
                raise LedgerError('AGENT_EXECUTION_EXPIRED')
            timeout = min(timeout, remaining)
        task = asyncio.create_task(getattr(self.worker, method)(payload))
        try:
            return await asyncio.wait_for(asyncio.shield(task), timeout=timeout)
        except BaseException:
            if not task.done() and not task.cancelling():
                task.cancel()
            async def drain():
                await asyncio.gather(task, return_exceptions=True)
            await finish_cleanup(drain())
            raise

    async def _stop(self, binding, status):
        # Persist revocation first when storage is available. An unknown commit
        # remains unconfirmed even after best-effort process cancellation; the
        # gateway fails closed and the lease reconciler handles recovery.
        try:
            terminal = await self._db(self.ledger.end_execution, binding['run_id'],
                execution_id=binding['execution_id'], generation=binding['generation'], status=status)
        except Exception:
            # Database failure already makes gateway calls fail closed. Reduce
            # further work without claiming the revocation commit was confirmed.
            await self._cancel_worker(binding)
            self._forget(binding['run_id'])
            raise LedgerError('AGENT_DISPATCH_UNCONFIRMED') from None
        if terminal != 'completed':
            await self._cancel_worker(binding)
        self._forget(binding['run_id'])
        return terminal

    @staticmethod
    def _state(binding, status):
        return {key: binding[key] for key in ('run_id', 'execution_id', 'generation')} | {'status': status}

    async def _observe_ack(self, binding, ack):
        if ack['status'] in {'failed', 'cancelled', 'interrupted'}:
            return self._state(binding, await self._stop(binding, ack['status']))
        row = await self._db(self._current, binding, allow_terminal=True)
        if row['status'] in TERMINAL:
            if row['status'] != 'completed':
                await self._stop(binding, row['status'])
            self._forget(binding['run_id'])
        else:
            # Worker "completed" is only an observation. The authenticated
            # result gateway alone can commit the answer and completed state.
            self._monitors[binding['run_id']] = asyncio.create_task(self._monitor(binding))
        return self._state(binding, row['status'])

    async def _monitor(self, binding):
        try:
            while True:
                try:
                    row = await self._db(self._current, binding, allow_terminal=True)
                    if row['status'] in TERMINAL:
                        if row['status'] != 'completed':
                            await finish_cleanup(self._stop(binding, row['status']))
                        return
                except asyncio.CancelledError:
                    raise
                except Exception:
                    await finish_cleanup(self._stop(binding, 'interrupted'))
                    return
                await asyncio.sleep(MONITOR_INTERVAL)
        except asyncio.CancelledError:
            return
        except Exception:
            # No raw driver, worker error or credential reaches logs/tasks.
            return
        finally:
            self._monitors.pop(binding['run_id'], None)
            self._forget(binding['run_id'])

    async def dispatch(self, run_id, *, question):
        if self._closing:
            raise LedgerError('AGENT_DISABLED')
        if len(self._slots) >= self._max_active:
            raise LedgerError('AGENT_RUNTIME_UNAVAILABLE')
        slot, task = object(), asyncio.current_task()
        self._slots.add(slot)
        self._inflight_slots.add(slot)
        self._dispatch_tasks.add(task)
        try:
            return await self._dispatch(run_id, question=question, slot=slot)
        finally:
            self._dispatch_tasks.discard(task)
            self._inflight_slots.discard(slot)
            if slot not in self._known_slots.values():
                self._slots.discard(slot)

    async def _dispatch(self, run_id, *, question, slot):
        try:
            question = await self._db(self._preflight, run_id, question)
        except LedgerError:
            raise
        except Exception:
            raise LedgerError('AGENT_DISPATCH_UNCONFIRMED') from None
        execution_id = str(uuid4())
        claim = asyncio.create_task(asyncio.to_thread(self.gateway.claim, run_id, execution_id=execution_id))
        binding = None
        try:
            # Do not lose a successful claim if a caller cancels while the DB
            # worker thread is finishing its commit.
            claimed = await asyncio.shield(claim)
            if claimed is None:
                return None
            row, credentials = claimed
            binding = self._binding(row)
            self._known[binding['run_id']] = binding
            self._known_slots[binding['run_id']] = slot
            if self._closing:
                raise LedgerError('AGENT_DISABLED')
            row = await self._db(self._current, binding)
            try:
                payload = ExecutionStart.model_validate({**binding, 'app_id': row['app_id'],
                    'scenario': row['scenario'], 'model_id': row['model_id'],
                    'root_session_id': row['root_session_id'],
                    'deadline': row['deadline'].replace(tzinfo=timezone.utc).isoformat().replace('+00:00', 'Z'),
                    'question': question, 'credentials': {name: getattr(credentials, name)
                    for name in ('tool', 'model', 'result')}}).model_dump()
            except Exception:
                raise LedgerError('AGENT_INPUT_INVALID') from None
            try:
                ack = self._ack(await self._io('start', payload, row=row), binding, initial=True)
            except asyncio.CancelledError:
                raise
            except Exception:
                # Exactly one observation of the same binding; never resend.
                try:
                    row = await self._db(self._current, binding)
                    ack = self._ack(await self._io('inspect', binding, row=row), binding)
                except asyncio.CancelledError:
                    raise
                except Exception:
                    return self._state(binding, await self._stop(binding, 'interrupted'))
            return await self._observe_ack(binding, ack)
        except asyncio.CancelledError:
            async def cleanup():
                nonlocal binding
                if binding is None:
                    try:
                        claimed = await asyncio.shield(claim)
                        if claimed is not None:
                            binding = self._binding(claimed[0])
                    except Exception:
                        return  # Unknown claim: do not send/start/replay anything.
                if binding:
                    await self._stop(binding, 'cancelled')
            try:
                await finish_cleanup(cleanup())
            except Exception:
                pass
            raise
        except Exception as error:
            if binding is not None:
                try:
                    await finish_cleanup(self._stop(binding, 'interrupted'))
                except Exception:
                    pass
            if isinstance(error, LedgerError):
                raise error from None
            raise LedgerError('AGENT_DISPATCH_UNCONFIRMED') from None

    async def cancel(self, principal, run_id):
        result = {}
        async def cleanup():
            try:
                status = await self._db(self.ledger.cancel, principal, run_id)
                row = await self._db(self.ledger.get_owned, principal, run_id)
                if row['execution_id'] is not None and status != 'completed':
                    binding = self._binding(row)
                    try:
                        self._ack(await self._io('cancel', binding), binding)
                    except Exception:
                        pass
                monitor = self._monitors.pop(row['id'], None)
                if monitor and monitor is not asyncio.current_task():
                    monitor.cancel()
                    await asyncio.gather(monitor, return_exceptions=True)
                self._forget(row['id'])
                result['status'] = status
            except LedgerError:
                raise
            except Exception:
                raise LedgerError('AGENT_DISPATCH_UNCONFIRMED') from None
        await finish_cleanup(cleanup())
        return result['status']

    async def aclose(self):
        self._closing = True
        current = asyncio.current_task()
        dispatches = [task for task in self._dispatch_tasks if task is not current]
        bindings = list(self._known.values())
        monitors = list(self._monitors.values())
        for task in [*dispatches, *monitors]:
            if not task.cancelling():
                task.cancel()
        async def cleanup():
            # Inflight claims are drained by their dispatch cancellation path.
            # They can never send a start after this close has returned.
            await asyncio.gather(*dispatches, *monitors, return_exceptions=True)
            for binding in bindings:
                try:
                    await self._stop(binding, 'interrupted')
                except Exception:
                    pass
        await finish_cleanup(cleanup())
