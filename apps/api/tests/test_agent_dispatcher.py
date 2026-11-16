import asyncio
import json
import sys
import threading
import unittest
from datetime import timedelta
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import test_agent_run_gateway as gateway_fixture
from src.modules.agent_runtime.dispatcher import RunDispatcher
from src.modules.agent_runtime.gateway import RunCall
from src.modules.agent_runtime.ledger import LedgerError
from src.modules.agent_runtime.rpc import PROTOCOL


class MemoryWorker:
    def __init__(self, ledger, owner):
        self.ledger, self.owner = ledger, owner
        self.starts, self.inspections, self.cancels, self.cancel_states = [], [], [], []
        self.on_start = self.on_inspect = self.on_cancel = None

    @staticmethod
    def ack(binding, status='running'):
        return {key: binding[key] for key in ('protocol', 'run_id', 'execution_id', 'generation', 'bundle_hash')} | {'status': status}

    async def start(self, payload):
        self.starts.append(payload)
        return await self.on_start(payload) if self.on_start else self.ack(payload)

    async def inspect(self, binding):
        self.inspections.append(binding)
        return await self.on_inspect(binding) if self.on_inspect else self.ack(binding)

    async def cancel(self, binding):
        self.cancels.append(binding)
        row = await asyncio.to_thread(self.ledger.get_owned, self.owner, binding['run_id'])
        self.cancel_states.append(row['status'])
        return await self.on_cancel(binding) if self.on_cancel else self.ack(binding, 'cancelled')


class AgentDispatcherTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        # Reuse the real SQLite+Gateway setup without importing its TestCase as
        # a top-level symbol (which would duplicate unittest discovery).
        self.fixture = gateway_fixture.AgentRunGatewayTests('test_private_credentials_are_scoped_hashed_and_never_printed')
        self.fixture.setUp()
        self.addCleanup(self.fixture.doCleanups)
        self.ledger, self.gateway, self.owner = self.fixture.ledger, self.fixture.gateway, self.fixture.owner
        self.worker = MemoryWorker(self.ledger, self.owner)
        self.dispatcher = RunDispatcher(self.gateway, self.worker, worker_credential=self.fixture.service_secret)
        self.addAsyncCleanup(self.dispatcher.aclose)
        self.run = self.accept()

    def accept(self):
        return self.ledger.accept(self.owner, question='具体问题', idempotency_key=str(uuid4()),
                                  bundle_hash='a' * 64, model_id='synthetic').run

    async def dispatch(self, row=None, **kwargs):
        return await self.dispatcher.dispatch((row or self.run)['id'], question=kwargs.pop('question', '具体问题'), **kwargs)

    def state(self, row=None):
        return self.ledger.get_owned(self.owner, (row or self.run)['id'])

    async def wait_for(self, predicate):
        async with asyncio.timeout(3):
            while not predicate():
                await asyncio.sleep(.01)

    async def test_payload_is_v2_and_duplicate_or_concurrent_dispatch_never_restarts(self):
        results = await asyncio.gather(self.dispatch(), self.dispatch())
        self.assertEqual(sum(result is None for result in results), 1)
        self.assertEqual(len(self.worker.starts), 1)
        payload = self.worker.starts[0]
        self.assertEqual(payload['protocol'], PROTOCOL)
        self.assertEqual(payload['question'], '具体问题')
        self.assertEqual(payload['root_session_id'], 'blog-qa-' + self.run['id'])
        self.assertTrue(payload['deadline'].endswith('Z'))
        self.assertEqual(set(payload['credentials']), {'tool', 'model', 'result'})
        self.assertNotIn(self.fixture.service_secret, json.dumps(payload))
        self.assertEqual(self.state()['status'], 'running')
        self.assertIsNone(await self.dispatch())
        self.assertEqual(len(self.worker.starts), 1)
        self.assertFalse(self.worker.inspections)

    async def test_wrong_question_profile_disabled_or_missing_session_never_claims_or_starts(self):
        with self.assertRaises(LedgerError):
            await self.dispatch(question='another question')
        self.fixture.flag = False
        with self.assertRaises(LedgerError):
            await self.dispatch()
        self.fixture.flag = True
        self.fixture.current = None
        with self.assertRaises(LedgerError):
            await self.dispatch()
        self.assertEqual(self.state()['status'], 'accepted')
        self.assertFalse(self.worker.starts)

    async def test_unknown_start_inspects_same_binding_once_without_resending(self):
        async def unknown(_payload):
            raise OSError('private worker error with credentials')
        self.worker.on_start = unknown
        result = await self.dispatch()
        self.assertEqual(result['status'], 'running')
        self.assertEqual(len(self.worker.starts), 1)
        self.assertEqual(len(self.worker.inspections), 1)
        self.assertEqual(set(self.worker.inspections[0]), {'protocol', 'run_id', 'execution_id', 'generation', 'bundle_hash'})
        self.assertEqual(self.worker.inspections[0]['execution_id'], self.worker.starts[0]['execution_id'])

    async def test_bad_ack_and_unknown_inspection_revoke_before_best_effort_cancel(self):
        async def bad_start(payload):
            return {**self.worker.ack(payload), 'generation': True, 'credential': 'not accepted'}
        async def bad_inspect(binding):
            return {**self.worker.ack(binding), 'execution_id': str(uuid4())}
        async def bad_cancel(_binding):
            raise OSError('private cancel diagnostics')
        self.worker.on_start, self.worker.on_inspect, self.worker.on_cancel = bad_start, bad_inspect, bad_cancel
        result = await self.dispatch()
        self.assertEqual(result['status'], 'interrupted')
        self.assertEqual(self.worker.cancel_states, ['interrupted'])
        self.assertEqual(len(self.worker.starts), 1)
        self.assertEqual(len(self.worker.inspections), 1)
        payload = self.worker.starts[0]
        call = RunCall(payload['run_id'], payload['execution_id'], 1, self.fixture.service_secret, payload['credentials']['tool'])
        with self.assertRaises(LedgerError):
            self.gateway.tool(call, call_id='late', tool_id='blog.search_public', tool_version='1', arguments={'query': 'late'})
        self.assertEqual(self.state()['error_code'], 'AGENT_RUN_INTERRUPTED')

    async def test_worker_completed_observation_cannot_commit_answer(self):
        async def completed(payload):
            return self.worker.ack(payload, 'completed')
        before = self.fixture.db.count('ai_messages')
        self.worker.on_start = completed
        result = await self.dispatch()
        self.assertEqual(result['status'], 'running')
        self.assertEqual(self.fixture.db.count('ai_messages'), before)
        self.assertEqual(self.state()['status'], 'running')

    async def test_terminal_inspection_maps_fixed_errors_without_accepting_worker_diagnostics(self):
        async def unknown(_payload):
            raise OSError('private worker details')
        self.worker.on_start = unknown
        for status, expected in [('failed', 'AGENT_WORKER_FAILED'), ('cancelled', 'AGENT_RUN_CANCELLED'),
                                 ('interrupted', 'AGENT_RUN_INTERRUPTED')]:
            row = self.accept()
            async def inspect(binding, value=status):
                return self.worker.ack(binding, value)
            self.worker.on_inspect = inspect
            result = await self.dispatch(row)
            self.assertEqual(result['status'], status)
            self.assertEqual(self.state(row)['error_code'], expected)
            self.assertEqual(self.worker.cancel_states[-1], status)

    async def test_caller_cancellation_drains_rpc_then_revokes_and_cleans(self):
        entered, drained = asyncio.Event(), asyncio.Event()
        async def pending(_payload):
            try:
                entered.set()
                await asyncio.Event().wait()
            finally:
                await asyncio.sleep(.01)
                drained.set()
        self.worker.on_start = pending
        task = asyncio.create_task(self.dispatch())
        await asyncio.wait_for(entered.wait(), 2)
        task.cancel()
        await asyncio.sleep(0)
        task.cancel()
        with self.assertRaises(asyncio.CancelledError):
            await task
        self.assertTrue(drained.is_set())
        self.assertEqual(self.state()['status'], 'cancelled')
        self.assertEqual(self.worker.cancel_states, ['cancelled'])
        self.assertFalse(self.dispatcher._slots)

    async def test_claim_commit_ack_unknown_never_sends_any_rpc_or_replays(self):
        original = self.gateway.claim
        def unknown(*args, **kwargs):
            original(*args, **kwargs)
            raise OSError('private commit outcome unknown')
        with patch.object(self.gateway, 'claim', side_effect=unknown):
            with self.assertRaises(LedgerError) as caught:
                await self.dispatch()
        self.assertEqual(caught.exception.code, 'AGENT_DISPATCH_UNCONFIRMED')
        self.assertFalse(self.worker.starts or self.worker.inspections or self.worker.cancels)
        self.assertEqual(self.state()['status'], 'running')
        self.assertIsNone(await self.dispatch())
        self.fixture.time += timedelta(seconds=11)
        self.ledger.reconcile()
        self.assertEqual(self.state()['status'], 'interrupted')

    async def test_cancel_repeats_preserve_terminal_and_stop_only_after_ledger(self):
        await self.dispatch()
        self.assertEqual(await self.dispatcher.cancel(self.owner, self.run['id']), 'cancelled')
        self.assertEqual(await self.dispatcher.cancel(self.owner, self.run['id']), 'cancelled')
        self.assertTrue(self.worker.cancel_states)
        self.assertTrue(all(status == 'cancelled' for status in self.worker.cancel_states))
        self.assertFalse(self.dispatcher._known or self.dispatcher._monitors or self.dispatcher._slots)

    async def test_monitor_closing_flag_or_external_terminal_also_reclaims_worker(self):
        await self.dispatch()
        self.fixture.flag = False
        await self.wait_for(lambda: bool(self.worker.cancels))
        self.assertEqual(self.state()['status'], 'interrupted')
        self.assertEqual(self.worker.cancel_states[-1], 'interrupted')
        self.fixture.flag = True
        other = self.accept()
        await self.dispatch(other)
        self.ledger.cancel(self.owner, other['id'])
        await self.wait_for(lambda: any(binding['run_id'] == other['id'] for binding in self.worker.cancels))
        self.assertEqual(self.state(other)['status'], 'cancelled')
        self.assertEqual(self.worker.cancel_states[-1], 'cancelled')

    async def test_io_timeouts_are_bounded_and_not_retried_as_starts(self):
        async def pending(_payload):
            await asyncio.Event().wait()
        self.worker.on_start = self.worker.on_inspect = pending
        with patch('src.modules.agent_runtime.dispatcher.IO_TIMEOUT', .03):
            result = await asyncio.wait_for(self.dispatch(), 1)
        self.assertEqual(result['status'], 'interrupted')
        self.assertEqual(len(self.worker.starts), 1)
        self.assertEqual(len(self.worker.inspections), 1)
        self.assertEqual(self.worker.cancel_states, ['interrupted'])

    async def test_capacity_bounds_inflight_claims_and_active_monitors(self):
        bounded = RunDispatcher(self.gateway, self.worker, worker_credential=self.fixture.service_secret, max_active=1)
        self.addAsyncCleanup(bounded.aclose)
        entered, release = asyncio.Event(), asyncio.Event()
        async def pending(payload):
            entered.set()
            await release.wait()
            return self.worker.ack(payload)
        self.worker.on_start = pending
        first = asyncio.create_task(bounded.dispatch(self.run['id'], question='具体问题'))
        await asyncio.wait_for(entered.wait(), 2)
        second = self.accept()
        with self.assertRaises(LedgerError) as caught:
            await bounded.dispatch(second['id'], question='具体问题')
        self.assertEqual(caught.exception.code, 'AGENT_RUNTIME_UNAVAILABLE')
        self.assertEqual(self.state(second)['status'], 'accepted')
        self.assertEqual(len(bounded._slots), 1)
        release.set()
        await first
        self.assertEqual(len(bounded._slots), 1)
        self.assertEqual(len(bounded._monitors), 1)
        await bounded.aclose()
        self.assertFalse(bounded._slots or bounded._monitors)

    async def test_close_drains_claim_and_does_not_send_start_after_return(self):
        entered, release = threading.Event(), threading.Event()
        original = self.gateway.claim
        def delayed(*args, **kwargs):
            claimed = original(*args, **kwargs)
            entered.set()
            if not release.wait(2):
                raise AssertionError('release missing')
            return claimed
        with patch.object(self.gateway, 'claim', side_effect=delayed):
            dispatch = asyncio.create_task(self.dispatch())
            self.assertTrue(await asyncio.to_thread(entered.wait, 2))
            closing = asyncio.create_task(self.dispatcher.aclose())
            await asyncio.sleep(.02)
            self.assertFalse(closing.done())
            release.set()
            await asyncio.wait_for(closing, 3)
            with self.assertRaises(asyncio.CancelledError):
                await dispatch
        self.assertFalse(self.worker.starts)
        self.assertEqual(self.state()['status'], 'cancelled')
        self.assertEqual(self.worker.cancel_states, ['cancelled'])
        self.assertFalse(self.dispatcher._slots or self.dispatcher._known)

    async def test_database_failure_after_send_cancels_best_effort_but_stays_unconfirmed(self):
        async def bad_start(_payload):
            raise OSError('private transport failure')
        async def bad_inspect(_binding):
            raise OSError('private transport failure')
        self.worker.on_start, self.worker.on_inspect = bad_start, bad_inspect
        with patch.object(self.ledger, 'end_execution', side_effect=OSError('private database failure')):
            with self.assertRaises(LedgerError) as caught:
                await self.dispatch()
        self.assertEqual(caught.exception.code, 'AGENT_DISPATCH_UNCONFIRMED')
        self.assertTrue(self.worker.cancels)
        self.assertEqual(self.state()['status'], 'running')
        self.assertNotIn('private', str(caught.exception))

    async def test_authority_lost_during_start_reclaims_execution_before_return(self):
        async def close_flag(payload):
            self.fixture.flag = False
            return self.worker.ack(payload)
        self.worker.on_start = close_flag
        with self.assertRaises(LedgerError):
            await self.dispatch()
        self.assertEqual(self.state()['status'], 'interrupted')
        self.assertEqual(self.worker.cancel_states, ['interrupted'])
        self.assertFalse(self.dispatcher._known or self.dispatcher._slots)

    async def test_monitor_session_loss_and_lease_reconcile_stop_the_original_worker(self):
        await self.dispatch()
        self.fixture.current = None
        await self.wait_for(lambda: bool(self.worker.cancels))
        self.assertEqual(self.state()['status'], 'interrupted')
        self.fixture.current = self.owner
        other = self.accept()
        await self.dispatch(other)
        self.fixture.time += timedelta(seconds=11)
        self.ledger.reconcile()
        await self.wait_for(lambda: any(binding['run_id'] == other['id'] for binding in self.worker.cancels))
        self.assertEqual(self.state(other)['status'], 'interrupted')
        self.assertEqual(self.worker.cancel_states[-1], 'interrupted')

    async def test_cancel_does_not_free_inflight_start_capacity_before_dispatch_exits(self):
        bounded = RunDispatcher(self.gateway, self.worker, worker_credential=self.fixture.service_secret, max_active=1)
        self.addAsyncCleanup(bounded.aclose)
        entered, release = asyncio.Event(), asyncio.Event()
        active, maximum = 0, 0
        async def pending(payload):
            nonlocal active, maximum
            active += 1
            maximum = max(maximum, active)
            try:
                entered.set()
                await release.wait()
                return self.worker.ack(payload)
            finally:
                active -= 1
        self.worker.on_start = pending
        first = asyncio.create_task(bounded.dispatch(self.run['id'], question='具体问题'))
        await asyncio.wait_for(entered.wait(), 2)
        self.assertEqual(await bounded.cancel(self.owner, self.run['id']), 'cancelled')
        self.assertFalse(first.done())
        self.assertEqual(len(bounded._slots), 1)
        second = self.accept()
        with self.assertRaises(LedgerError) as caught:
            await bounded.dispatch(second['id'], question='具体问题')
        self.assertEqual(caught.exception.code, 'AGENT_RUNTIME_UNAVAILABLE')
        self.assertEqual(len(self.worker.starts), 1)
        release.set()
        self.assertEqual((await first)['status'], 'cancelled')
        self.assertFalse(bounded._slots or bounded._inflight_slots)
        self.worker.on_start = None
        self.assertEqual((await bounded.dispatch(second['id'], question='具体问题'))['status'], 'running')
        self.assertEqual(maximum, 1)
