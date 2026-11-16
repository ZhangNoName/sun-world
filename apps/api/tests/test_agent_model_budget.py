"""Actual transactional budget tests; native MySQL separately proves row locks."""

import asyncio
import json
from pathlib import Path
import sys
import tempfile
import threading
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from test_agent_tool_journal import JournalDatabase
from test_agent_run_ledger import SqliteUow
from src.core.auth import Principal
from src.module_composition import create_module_registry
from src.modules.ai.public import STRUCTURED_MODEL_LIMITS as LIMITS
from src.modules.agent_runtime.gateway import RunGateway, RunCall, encode
from src.modules.agent_runtime.ledger import LedgerError, MySqlRunLedger, digest
from src.modules.agent_runtime.model_budget import ModelJournal, MAX_INPUT_BYTES


class ModelBudgetTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.db = JournalDatabase(str(Path(self.temp.name) / 'budget.sqlite'))
        self.ledger = MySqlRunLedger(self.db, clock=lambda: datetime(2026, 11, 16, tzinfo=timezone.utc))
        self.owner = Principal(kind='user', user_id=1, session_family='budget-test-family', roles=('admin',))
        self.proxy_calls = 0
        async def proxy(body):
            self.proxy_calls += 1
            return self.reply()
        self.gateway = RunGateway(self.ledger, registry=create_module_registry(),
            handlers={'blog.search_public': lambda *_: {'items': []}, 'blog.read_public': lambda *_: None},
            enabled=lambda: True, authorize=lambda *_: self.owner, allow=lambda *_: True,
            worker_credential='S'*43, bundle_hash='a'*64, model_id='budget-model',
            model_proxy=proxy, site_origin='https://budget.example.test', source_reader=lambda *_: None)
        accepted = self.ledger.accept(self.owner, question='合成问题', idempotency_key=str(uuid4()),
            bundle_hash='a'*64, model_id='budget-model').run
        self.run, credentials = self.gateway.claim(accepted['id'], execution_id=str(uuid4()))
        self.call = RunCall(self.run['id'], self.run['execution_id'], 1, 'S'*43, credentials.model)

    def reply(self):
        return {'model': 'budget-model', 'stop_reason': 'end_turn', 'content': [{'type': 'text', 'text': '合成回答'}],
                'usage': {'input_tokens': 10, 'output_tokens': 5}}

    def row(self):
        return self.ledger.get_owned(self.owner, self.run['id'])

    def calls(self):
        with self.ledger.unit_of_work() as uow:
            return uow.fetch_all('SELECT * FROM agent_model_calls ORDER BY reserved_at,call_id')

    async def request(self, body=None):
        return await self.gateway.model(self.call, body or {'messages': []})

    async def test_network_observes_precommitted_reservation_and_usage_never_refunds(self):
        original = self.gateway.model_proxy
        async def inspect(body):
            row = await asyncio.to_thread(self.row)
            calls = await asyncio.to_thread(self.calls)
            self.assertEqual(row['model_output_tokens_reserved'], row['model_count'] * 1024)
            self.assertEqual(row['model_response_bytes_reserved'], row['model_count'] * 65536)
            self.assertTrue(any(item['state'] == 'reserved' and item['input_tokens'] is None for item in calls))
            return await original(body)
        self.gateway.model_proxy = inspect
        for _ in range(4):
            await self.request()
        with self.assertRaises(LedgerError):
            await self.request()
        row = self.row()
        self.assertEqual((row['model_count'], row['model_output_tokens_reserved'], row['model_output_tokens_observed']), (4, 4096, 20))
        self.assertEqual(row['model_input_tokens_observed'], 40)
        self.assertEqual(row['model_usage_unknown_count'], 0)
        self.assertEqual(self.proxy_calls, 4)
        self.assertTrue(all(item['state'] == 'observed' for item in self.calls()))
        self.assertNotIn('合成回答', json.dumps(self.calls(), default=str, ensure_ascii=False))

    async def test_cumulative_input_bytes_refuse_before_provider_and_rollback_call_increment(self):
        body = {'messages': [{'role': 'user', 'content': ''}]}
        full = {**body, 'model': 'budget-model', 'stream': False, 'max_tokens': 1024}
        body['messages'][0]['content'] = 'x' * (LIMITS.max_request_bytes - len(encode(full)))
        await self.request(body)
        await self.request(body)
        self.assertEqual(self.row()['model_input_bytes'], MAX_INPUT_BYTES)
        with self.assertRaises(LedgerError):
            await self.request()
        self.assertEqual((self.row()['model_count'], self.proxy_calls, len(self.calls())), (2, 2, 2))

    async def test_unknown_usage_error_overrun_and_cancellation_keep_full_precharge(self):
        cleaned, entered = asyncio.Event(), asyncio.Event()
        async def failure(_):
            raise RuntimeError('private provider diagnostic')
        self.gateway.model_proxy = failure
        with self.assertRaises(LedgerError) as caught:
            await self.request()
        self.assertNotIn('private', str(caught.exception))
        for invalid in [None, {'input_tokens': 10, 'output_tokens': 1025}]:
            async def invalid_usage(_, value=invalid):
                return {**self.reply(), 'usage': value}
            self.gateway.model_proxy = invalid_usage
            with self.assertRaises(LedgerError):
                await self.request()
        async def waiting(_):
            entered.set()
            try:
                await asyncio.Event().wait()
            finally:
                await asyncio.sleep(.01)
                cleaned.set()
        self.gateway.model_proxy = waiting
        task = asyncio.create_task(self.request())
        await asyncio.wait_for(entered.wait(), 2)
        task.cancel()
        with self.assertRaises(asyncio.CancelledError):
            await task
        self.assertTrue(cleaned.is_set())
        row = self.row()
        self.assertEqual((row['model_count'], row['model_output_tokens_reserved'], row['model_usage_unknown_count']), (4, 4096, 4))
        self.assertEqual(row['model_response_bytes_reserved'], 262144)
        self.assertEqual(row['model_input_tokens_observed'], 0)
        self.assertTrue(all(item['state'] == 'unknown' and item['input_tokens'] is None for item in self.calls()))

    async def test_duplicate_usage_is_idempotent_and_different_usage_cannot_rewrite_terminal(self):
        result = await self.request()
        call = self.calls()[0]
        self.ledger.cancel(self.owner, self.run['id'])
        accounting = ModelJournal()
        for usage, conflict in [(dict(input_tokens=10, output_tokens=5, response_bytes=len(encode(result))), False),
                                 (dict(input_tokens=10, output_tokens=6, response_bytes=len(encode(result))), True)]:
            with self.ledger.unit_of_work() as uow:
                current = self.ledger._binding(uow, self.run['id'], self.run['execution_id'], 1)
                if conflict:
                    with self.assertRaises(LedgerError):
                        accounting.observe(uow, current, call['call_id'], usage=usage, result_hash=digest(result), now=self.ledger.now())
                else:
                    self.assertFalse(accounting.observe(uow, current, call['call_id'], usage=usage,
                        result_hash=digest(result), now=self.ledger.now()))
                    uow.commit()
        self.assertEqual((self.row()['status'], self.row()['model_output_tokens_observed']), ('cancelled', 5))

    async def test_observation_failure_rolls_back_and_marks_unknown_without_provider_retry(self):
        original = SqliteUow.execute
        def fail(uow, statement, parameters=()):
            if statement.startswith('UPDATE agent_runs SET model_input_tokens_observed='):
                raise RuntimeError('private SQL diagnostic')
            return original(uow, statement, parameters)
        with patch.object(SqliteUow, 'execute', fail), self.assertRaises(LedgerError):
            await self.request()
        self.assertEqual(self.proxy_calls, 1)
        self.assertEqual(self.calls()[0]['state'], 'unknown')
        row = self.row()
        self.assertEqual((row['model_output_tokens_reserved'], row['model_output_tokens_observed'], row['model_usage_unknown_count']), (1024, 0, 1))

    async def test_cancelled_reservation_thread_is_drained_before_unknown_accounting(self):
        entered, release = threading.Event(), threading.Event()
        original = SqliteUow.commit
        first = [True]
        def fenced(uow):
            original(uow)
            if first[0]:
                first[0] = False
                entered.set()
                if not release.wait(3):
                    raise RuntimeError('Synthetic reservation fence timed out')
        with patch.object(SqliteUow, 'commit', fenced):
            task = asyncio.create_task(self.request())
            try:
                self.assertTrue(await asyncio.to_thread(entered.wait, 2))
                task.cancel()
                await asyncio.sleep(.02)
                self.assertFalse(task.done())
            finally:
                release.set()
                with self.assertRaises(asyncio.CancelledError):
                    await task
        self.assertEqual(self.proxy_calls, 0)
        self.assertEqual(self.calls()[0]['state'], 'unknown')
        self.assertEqual(self.row()['model_output_tokens_reserved'], 1024)

    async def test_concurrent_requests_have_only_four_atomic_winners(self):
        results = await asyncio.gather(*(self.request() for _ in range(8)), return_exceptions=True)
        self.assertEqual(sum(isinstance(item, dict) for item in results), 4)
        self.assertEqual(sum(isinstance(item, LedgerError) for item in results), 4)
        self.assertEqual((self.row()['model_count'], self.proxy_calls), (4, 4))
        self.assertEqual(len(self.calls()), 4)

    async def test_expiry_during_reservation_commit_never_starts_provider(self):
        current = [datetime(2026, 11, 16, tzinfo=timezone.utc)]
        self.ledger.clock = lambda: current[0]
        original = SqliteUow.commit
        first = [True]
        def delayed_commit(uow):
            original(uow)
            if first[0]:
                first[0] = False
                current[0] += timedelta(seconds=46)
        with patch.object(SqliteUow, 'commit', delayed_commit), self.assertRaises(LedgerError) as caught:
            await self.request()
        self.assertEqual(caught.exception.code, 'AGENT_EXECUTION_EXPIRED')
        self.assertEqual(self.proxy_calls, 0)
        self.assertEqual(self.calls()[0]['state'], 'unknown')
        self.assertEqual(self.row()['model_output_tokens_reserved'], 1024)
