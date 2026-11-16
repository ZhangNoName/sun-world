"""Formal run composition. Explicit host wiring; no production auto-admission."""

import asyncio
from dataclasses import dataclass
from threading import RLock

from src.core.auth import AuthorizationDenied
from src.core.auth.session import SessionAuthenticator
from .cleanup import finish_cleanup
from .dispatcher import RunDispatcher
from .gateway import RunGateway
from .ledger import LedgerError, TERMINAL, digest, family_hash, uuid_text
from .rpc import ExecutionAck
from .run_view import RunView
from .session_authorizer import RunAllowlistPolicy, RunSessionAuthorizer


class RequestExists(LedgerError):
    def __init__(self, run_id):
        self.run_id = run_id
        super().__init__('AGENT_REQUEST_EXISTS')


@dataclass(frozen=True)
class AcceptedRun:
    run_id: str
    owner: object


class RunApplication:
    def __init__(self, ledger, *, auth_manager, admission, worker, registry, handlers,
                 source_reader, model_proxy, worker_credential, bundle_hash, model_id,
                 site_origin, user_ids, enabled, require_admin=True):
        if not callable(enabled) or not callable(getattr(worker, 'probe', None)):
            raise ValueError('Explicit run switch and Worker readiness required')
        self.ledger, self.admission, self.worker = ledger, admission, worker
        self.authenticator = SessionAuthenticator(auth_manager)
        self.sessions = RunSessionAuthorizer(auth_manager)
        self.policy = RunAllowlistPolicy(user_ids, require_admin=require_admin)
        self.switch, self.bundle_hash, self.model_id = enabled, bundle_hash, model_id
        self._leases, self._jobs, self._admitting = {}, {}, set()
        self._lock = RLock()
        self._closed, self._reaper = False, None
        self.gateway = RunGateway(ledger, registry=registry, handlers=handlers,
            enabled=self.enabled, authorize=self.sessions, allow=self._allow,
            worker_credential=worker_credential, bundle_hash=bundle_hash, model_id=model_id,
            model_proxy=model_proxy, site_origin=site_origin, source_reader=source_reader)
        self.dispatcher = RunDispatcher(self.gateway, worker, worker_credential=worker_credential, max_active=1)
        self.projection = RunView(self.gateway)

    def enabled(self):
        try:
            return not self._closed and self.switch() is True
        except Exception:
            return False

    def _require_enabled(self):
        if not self.enabled():
            raise LedgerError('AGENT_DISABLED')

    def _allow(self, principal, row, uow):
        self.policy(principal, row, uow)
        # A completed duplicate result is checked against its durable digest;
        # quiescent execution may already have released its concurrency slot.
        if row['status'] == 'completed':
            return True
        with self._lock:
            lease = self._leases.get(row['id'])
        if lease is None or self.admission.owned(lease) is not True:
            raise LedgerError('AGENT_ADMISSION_UNAVAILABLE')
        return True

    def _authenticate(self, token):
        self._require_enabled()
        try:
            with self.ledger.unit_of_work() as uow:
                principal = self.authenticator.authenticate(token, uow=uow)
                self._public_policy(principal, uow)
                return principal
        except AuthorizationDenied:
            raise LedgerError('AGENT_ACTIVE_SESSION_REQUIRED') from None

    def _public_policy(self, principal, uow, row=None):
        try:
            return self.policy.admit(principal, uow) if row is None else self.policy(principal, row, uow)
        except AuthorizationDenied:
            raise LedgerError('AGENT_NOT_ALLOWLISTED') from None

    async def capabilities(self, token):
        authenticated = False
        reason = 'AGENT_DISABLED'
        available = False
        if self.enabled():
            try:
                def identify():
                    with self.ledger.unit_of_work() as uow:
                        return self.authenticator.authenticate(token, uow=uow)
                principal = await self._sync(identify)
                authenticated = True
                await self._sync(self._authenticate, token)
                available = await self.available()
                reason = None if available else 'AGENT_RUNTIME_UNAVAILABLE'
            except (AuthorizationDenied, LedgerError) as error:
                reason = getattr(error, 'code', 'AGENT_ACTIVE_SESSION_REQUIRED')
            except Exception:
                reason = 'AGENT_RUNTIME_UNAVAILABLE'
        return dict(enabled=available, mode='formal', local_validation=False,
            dataset='本站公开博客', model=self.model_id, authenticated=authenticated, reason=reason)

    async def ready(self):
        if self._closed:
            raise LedgerError('AGENT_DISABLED')
        if self._reaper is None:
            self._reaper = asyncio.create_task(self._reconcile_loop())

    async def available(self):
        if not self.enabled():
            return False
        try:
            async with asyncio.timeout(2):
                return await self.worker.probe(bundle_hash=self.bundle_hash, model_id=self.model_id) is True
        except Exception:
            return False

    async def _sync(self, function, *args, **kwargs):
        return await self.dispatcher._db(function, *args, **kwargs)

    async def start(self, token, *, question, idempotency_key):
        await self.ready()
        self._require_enabled()
        if len(self._admitting) >= 128:
            raise LedgerError('AGENT_RUNTIME_UNAVAILABLE')
        task = asyncio.current_task()
        self._admitting.add(task)
        context = {'lease': None, 'accepted': None, 'begun': False, 'job': False}
        owner = None
        try:
            if not isinstance(question, str) or not question.strip() or len(question) > 2000:
                raise LedgerError('AGENT_INPUT_INVALID')
            try:
                question.encode('utf-8')
            except UnicodeError:
                raise LedgerError('AGENT_INPUT_INVALID') from None
            question, key = question.strip(), uuid_text(idempotency_key)
            owner = await self._sync(self._authenticate, token)
            existing = await self._sync(self.ledger.find_request, owner, question=question, idempotency_key=key)
            if existing:
                raise RequestExists(existing['id'])
            if not await self.available():
                raise LedgerError('AGENT_RUNTIME_UNAVAILABLE')
            def reserve():
                context['lease'] = self.admission.reserve(user_id=owner.user_id, idempotency_key=key,
                    family_hash=family_hash(owner), request_hash=digest({'scenario': 'blog-qa', 'question': question}))
            await self._sync(reserve)
            self._require_enabled()
            def accept():
                context['begun'] = True
                context['accepted'] = self.ledger.accept(owner, question=question, idempotency_key=key,
                    bundle_hash=self.bundle_hash, model_id=self.model_id)
            await self._sync(accept)
            admission = context['accepted']
            if not admission.created:
                raise RequestExists(admission.run['id'])
            await self._sync(self.sessions.bind, admission.run, token)
            self._require_enabled()
            with self._lock:
                if len(self._leases) >= 128 or admission.run['id'] in self._leases:
                    raise LedgerError('AGENT_RUNTIME_UNAVAILABLE')
                self._leases[admission.run['id']] = context['lease']
            job = asyncio.create_task(self._execute(owner, admission.run['id'], question))
            self._jobs[admission.run['id']] = job
            context['job'] = True
            return AcceptedRun(admission.run['id'], owner)
        except BaseException as error:
            async def unwind():
                lease, accepted = context['lease'], context['accepted']
                if lease is None or context['job']:
                    return
                release = not context['begun']
                if accepted is not None:
                    if accepted.created:
                        status = await self._sync(self.ledger.fail_accepted, accepted.run['id'], code='AGENT_ADMISSION_UNAVAILABLE')
                        row = await self._sync(self.ledger.get_owned, owner, accepted.run['id'])
                        release = status in TERMINAL and row['execution_id'] is None
                        self.sessions.revoke(accepted.run['id'])
                        with self._lock:
                            if self._leases.get(accepted.run['id']) is lease:
                                self._leases.pop(accepted.run['id'], None)
                    else:
                        release = True
                # Unknown SQL commit retains the reservation until its Redis
                # TTL; it is never refunded/replayed based on a lost ACK.
                if release:
                    await self._sync(self.admission.release, lease)
            try:
                await finish_cleanup(unwind())
            except Exception:
                pass
            if isinstance(error, (asyncio.CancelledError, LedgerError)):
                raise
            raise LedgerError('AGENT_RUNTIME_UNAVAILABLE') from None
        finally:
            self._admitting.discard(task)

    async def _execute(self, owner, run_id, question):
        try:
            row = await self._sync(self.ledger.get_owned, owner, run_id)
            remaining = max(0, (row['deadline'] - self.ledger.now()).total_seconds())
            async with asyncio.timeout(remaining + 1):
                await self.dispatcher.dispatch(run_id, question=question)
                while True:
                    row = await self._sync(self.ledger.get_owned, owner, run_id)
                    if row['status'] in TERMINAL:
                        break
                    await asyncio.sleep(.1)
        except asyncio.CancelledError:
            # A clean shutdown can cancel this job before dispatch ever claims
            # the known accepted row. Persist its cancellation before settling,
            # so a safe no-execution slot is not abandoned until TTL.
            try:
                await finish_cleanup(self._cancel_owned(owner, run_id))
            except Exception:
                pass
            raise
        except Exception:
            try:
                row = await self._sync(self.ledger.get_owned, owner, run_id)
                if row['status'] == 'accepted':
                    await self._sync(self.ledger.fail_accepted, run_id, code='AGENT_RUNTIME_UNAVAILABLE')
                elif row['status'] == 'running':
                    await self.dispatcher._stop(self.dispatcher._binding(row), 'interrupted')
            except Exception:
                pass
        finally:
            try:
                await finish_cleanup(self._settle(owner, run_id))
            finally:
                self._jobs.pop(run_id, None)

    async def _settle(self, owner, run_id):
        with self._lock:
            lease = self._leases.get(run_id)
        try:
            row = await self._sync(self.ledger.get_owned, owner, run_id)
            if row['status'] not in TERMINAL:
                return
            quiescent = row['execution_id'] is None
            if not quiescent:
                binding = self.dispatcher._binding(row)
                async with asyncio.timeout(5):
                    while True:
                        async with asyncio.timeout(2):
                            ack = ExecutionAck.model_validate(await self.worker.inspect(binding)).model_dump()
                        if any(ack[key] != value for key, value in binding.items()):
                            break
                        if ack['status'] in {'completed', 'failed', 'cancelled'}:
                            quiescent = True
                            break
                        await asyncio.sleep(.1)
            if quiescent and lease is not None:
                await self._sync(self.admission.release, lease)
        except Exception:
            pass
        finally:
            with self._lock:
                self._leases.pop(run_id, None)

    def _view(self, token, run_id, *, bound_owner=None):
        self._require_enabled()
        try:
            with self.ledger.unit_of_work() as uow:
                if bound_owner is None:
                    owner = self.authenticator.authenticate(token, uow=uow)
                else:
                    owner = bound_owner
                # Serialize the run row and AI transcript read with completion.
                # RC alone permits running + the newly committed answer, which
                # would otherwise turn a successful SSE completion into failure.
                row = self.ledger._owned(uow, owner.user_id, family_hash(owner), run_id, lock=True)
                principal = (self.sessions(uow, row) if bound_owner is not None
                             else self.authenticator.authenticate(token, uow=uow))
                self._public_policy(principal, uow, row)
                state = self.projection.project(uow, row, principal)
                fresh = self.sessions(uow, row) if bound_owner is not None else self.authenticator.authenticate(token, uow=uow)
                self._public_policy(fresh, uow, row)
                self._require_enabled()
                return state
        except AuthorizationDenied:
            raise LedgerError('AGENT_ACTIVE_SESSION_REQUIRED') from None

    async def view(self, token, run_id):
        await self.ready()
        return await self._sync(self._view, token, run_id)

    async def stream_view(self, accepted):
        return await self._sync(self._view, None, accepted.run_id, bound_owner=accepted.owner)

    async def cancel(self, token, run_id):
        owner = await self._sync(self._authenticate, token)
        await self.dispatcher.cancel(owner, run_id)
        return await self.view(token, run_id)

    async def _cancel_owned(self, owner, run_id):
        try:
            await self.dispatcher.cancel(owner, run_id)
        except Exception:
            # This identity came from successful admission, not a caller's
            # arbitrary run ID. Best effort stop remains authorized on DB loss.
            binding = self.dispatcher._known.get(run_id)
            if binding:
                await self.dispatcher._stop(binding, 'cancelled')

    async def abandon(self, accepted):
        try:
            await self._cancel_owned(accepted.owner, accepted.run_id)
        finally:
            job = self._jobs.get(accepted.run_id)
            if job and job is not asyncio.current_task():
                if not job.done():
                    job.cancel()
                await asyncio.gather(job, return_exceptions=True)

    async def _reconcile_loop(self):
        while not self._closed:
            try:
                ids = await self._sync(self.ledger.reconcile)
                for run_id in ids:
                    def read():
                        with self.ledger.unit_of_work() as uow:
                            return uow.fetch_one('SELECT * FROM agent_runs WHERE id=%s', (run_id,))
                    row = await self._sync(read)
                    if row and row['execution_id']:
                        async with asyncio.timeout(2):
                            await self.worker.cancel(self.dispatcher._binding(row))
            except asyncio.CancelledError:
                raise
            except Exception:
                pass
            await asyncio.sleep(1)

    async def close(self):
        self._closed = True
        current = asyncio.current_task()
        admitting = [task for task in self._admitting if task is not current]
        for task in admitting:
            task.cancel()
        async def drain():
            await asyncio.gather(*admitting, return_exceptions=True)
            if self._reaper:
                self._reaper.cancel()
                await asyncio.gather(self._reaper, return_exceptions=True)
            await self.dispatcher.aclose()
            jobs = list(self._jobs.values())
            for job in jobs:
                if not job.done():
                    job.cancel()
            await asyncio.gather(*jobs, return_exceptions=True)
            self.sessions.close()
        await finish_cleanup(drain())
