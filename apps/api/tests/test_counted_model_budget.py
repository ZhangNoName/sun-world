"""Real transaction precharge with the actual counted proxy and offline HTTP."""

import asyncio
from datetime import datetime, timedelta, timezone
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch
from uuid import uuid4

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from test_agent_run_ledger import SqliteUow
from test_agent_tool_journal import JournalDatabase
from test_openai_responses import OfficialWire, config, messages, result
from src.core.auth import Principal
from src.module_composition import create_module_registry
from src.modules.ai.public import MODEL_INPUT_LIMITS, ModelInputMetadata
from src.modules.ai.openai_responses import MODEL, OpenAiResponsesProxy
from src.modules.agent_runtime.gateway import RunCall, RunGateway
from src.modules.agent_runtime.ledger import LedgerError, MySqlRunLedger
from src.modules.agent_runtime.model_budget import ModelJournal


def count_reply(tokens):
    return httpx.Response(200, json={'object': 'response.input_tokens', 'input_tokens': tokens})


def generation_reply(tokens):
    response = result()
    response['usage'] = {'input_tokens': tokens, 'output_tokens': 5, 'total_tokens': tokens + 5}
    return httpx.Response(200, json=response)


def make_proxy(tokens=20, *, counting=None, generating=None):
    factory = OfficialWire(generating or (lambda _: generation_reply(tokens)),
        count_handler=counting or (lambda _: count_reply(tokens)))
    return OpenAiResponsesProxy(config(), provider_factory=factory), factory


class CountedGatewayTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix='sun-world-input-budget-')
        self.addCleanup(self.directory.cleanup)
        self.db = JournalDatabase(str(Path(self.directory.name) / 'ledger.sqlite'))
        self.current = [datetime(2026, 11, 16, tzinfo=timezone.utc)]
        self.ledger = MySqlRunLedger(self.db, clock=lambda: self.current[0])
        self.owner = Principal(kind='user', user_id=1, session_family='counted-family', roles=('admin',))
        self.proxy, self.factory = make_proxy()
        self.gateway = RunGateway(self.ledger, registry=create_module_registry(),
            handlers={'blog.search_public': lambda *_: {'items': []}, 'blog.read_public': lambda *_: None},
            enabled=lambda: True, authorize=lambda *_: self.owner, allow=lambda *_: True,
            worker_credential='S' * 43, bundle_hash='a' * 64, model_id=MODEL,
            model_proxy=self.proxy, site_origin='https://counted.example.test', source_reader=lambda *_: None)
        accepted = self.ledger.accept(self.owner, question='合成问题', idempotency_key=str(uuid4()),
                                      bundle_hash='a' * 64, model_id=MODEL).run
        self.run, credentials = self.gateway.claim(accepted['id'], execution_id=str(uuid4()))
        self.call = RunCall(self.run['id'], self.run['execution_id'], 1, 'S' * 43, credentials.model)

    def row(self):
        return self.ledger.get_owned(self.owner, self.run['id'])

    def calls(self):
        with self.ledger.unit_of_work() as uow:
            return uow.fetch_all('SELECT * FROM agent_model_calls WHERE run_id=%s', (self.run['id'],))

    def install(self, **kwargs):
        self.proxy, self.factory = make_proxy(**kwargs)
        self.gateway.model_proxy = self.proxy

    async def request(self, body=None):
        return await self.gateway.model(self.call, body if body is not None else messages())

    async def test_count_observes_attempt_and_generation_observes_input_commit(self):
        async def counting(request):
            row, calls = await asyncio.gather(asyncio.to_thread(self.row), asyncio.to_thread(self.calls))
            self.assertEqual((row['model_count'], row['model_output_tokens_reserved'], row['model_input_tokens_reserved']), (1, 1024, 0))
            self.assertIsNone(calls[0]['reserved_input_tokens'])
            return count_reply(20)
        async def generating(request):
            row, calls = await asyncio.gather(asyncio.to_thread(self.row), asyncio.to_thread(self.calls))
            self.assertEqual((row['model_input_tokens_reserved'], calls[0]['reserved_input_tokens']), (20, 20))
            self.assertEqual(calls[0]['wire_request_hash'], hashlib.sha256(request.content).hexdigest())
            self.assertEqual(calls[0]['state'], 'reserved')
            return generation_reply(20)
        self.install(counting=counting, generating=generating)
        await self.request()
        self.assertEqual(self.calls()[0]['state'], 'observed')
        self.assertEqual((self.row()['model_input_tokens_reserved'], self.row()['model_input_tokens_observed']), (20, 20))
        count_request, generation_request = self.factory.requests
        projected = {key: value for key, value in json.loads(generation_request.content).items()
                     if key not in ('max_output_tokens', 'stream', 'store')}
        self.assertEqual(json.loads(count_request.content), projected)
        self.assertEqual(self.calls()[0]['count_request_hash'], hashlib.sha256(count_request.content).hexdigest())

    async def test_per_call_and_run_budgets_refuse_generation_without_refund(self):
        self.install(tokens=MODEL_INPUT_LIMITS.max_input_tokens + 1)
        with self.assertRaises(LedgerError) as caught:
            await self.request()
        self.assertEqual('AGENT_BUDGET_EXCEEDED', caught.exception.code)
        self.assertEqual((len(self.factory.count_requests), len(self.factory.generation_requests)), (1, 0))
        self.assertEqual((self.row()['model_count'], self.row()['model_output_tokens_reserved'], self.row()['model_input_tokens_reserved']), (1, 1024, 0))
        self.assertEqual(self.calls()[0]['state'], 'unknown')

    async def test_parallel_preflights_compete_for_one_run_balance(self):
        arrived, gate = [], asyncio.Event()
        async def counting(_):
            arrived.append(1)
            if len(arrived) == 4:
                gate.set()
            await gate.wait()
            return count_reply(16384)
        self.install(tokens=16384, counting=counting)
        async with asyncio.timeout(5):
            results = await asyncio.gather(*(self.request() for _ in range(4)), return_exceptions=True)
        self.assertEqual(sum(isinstance(value, dict) for value in results), 2)
        self.assertEqual(sum(isinstance(value, LedgerError) and value.code == 'AGENT_BUDGET_EXCEEDED' for value in results), 2)
        self.assertEqual((len(self.factory.count_requests), len(self.factory.generation_requests)), (4, 2))
        row = self.row()
        self.assertEqual((row['model_count'], row['model_input_tokens_reserved'], row['model_input_tokens_observed'], row['model_usage_unknown_count']), (4, 32768, 32768, 2))

    async def test_count_failure_and_usage_drift_never_refund_or_replay(self):
        self.install(counting=lambda _: httpx.Response(503))
        with self.assertRaises(LedgerError):
            await self.request()
        self.assertEqual((len(self.factory.requests), self.row()['model_count']), (1, 1))
        self.install(generating=lambda _: generation_reply(21))
        with self.assertRaises(LedgerError):
            await self.request()
        self.assertEqual((len(self.factory.count_requests), len(self.factory.generation_requests)), (1, 1))
        self.assertEqual((self.row()['model_input_tokens_reserved'], self.row()['model_input_tokens_observed']), (20, 0))
        self.assertTrue(all(row['state'] == 'unknown' for row in self.calls()))

    async def test_revocation_after_count_stops_input_precharge_and_generation(self):
        async def counting(_):
            self.gateway.allow = lambda *_: False
            return count_reply(20)
        self.install(counting=counting)
        with self.assertRaises(LedgerError):
            await self.request()
        self.assertEqual(len(self.factory.generation_requests), 0)
        self.assertEqual(self.row()['model_input_tokens_reserved'], 0)

    async def test_input_commit_expiry_and_ack_loss_never_generate(self):
        original_reserve, original_commit = ModelJournal.reserve_input, SqliteUow.commit
        stage, injected = threading.local(), []
        def reserve(journal, *args, **kwargs):
            value = original_reserve(journal, *args, **kwargs)
            stage.input = True
            return value
        def commit(uow):
            original_commit(uow)
            if getattr(stage, 'input', False):
                stage.input = False
                if not injected:
                    injected.append(1)
                    raise RuntimeError('synthetic input commit ACK loss')
                self.current[0] += timedelta(seconds=46)
        with patch.object(ModelJournal, 'reserve_input', reserve), patch.object(SqliteUow, 'commit', commit):
            for _ in range(2):
                with self.assertRaises(LedgerError):
                    await self.request()
        self.assertEqual((len(self.factory.count_requests), len(self.factory.generation_requests)), (2, 0))
        self.assertEqual(self.row()['model_input_tokens_reserved'], 40)
        self.assertTrue(all(row['state'] == 'unknown' for row in self.calls()))

    async def test_repeated_cancel_drains_input_commit_before_return(self):
        entered, release = threading.Event(), threading.Event()
        original_reserve, original_commit = ModelJournal.reserve_input, SqliteUow.commit
        stage = threading.local()
        def reserve(journal, *args, **kwargs):
            value = original_reserve(journal, *args, **kwargs)
            stage.input = True
            return value
        def commit(uow):
            if getattr(stage, 'input', False):
                stage.input = False
                entered.set()
                if not release.wait(2):
                    raise RuntimeError('test gate expired')
            original_commit(uow)
        with patch.object(ModelJournal, 'reserve_input', reserve), patch.object(SqliteUow, 'commit', commit):
            task = asyncio.create_task(self.request())
            try:
                self.assertTrue(await asyncio.to_thread(entered.wait, 1))
                task.cancel()
                await asyncio.sleep(.01)
                task.cancel()
                await asyncio.sleep(.01)
                self.assertFalse(task.done())
            finally:
                release.set()
                await asyncio.gather(task, return_exceptions=True)
        self.assertEqual(len(self.factory.generation_requests), 0)
        self.assertEqual(self.row()['model_input_tokens_reserved'], 20)
        self.assertEqual(self.calls()[0]['state'], 'unknown')

    async def test_identical_input_metadata_is_idempotent_and_conflicts_rollback(self):
        await self.request()
        # A separate reserved attempt demonstrates idempotency before generation.
        call_id = str(uuid4())
        from src.modules.ai.public import STRUCTURED_MODEL_LIMITS
        metadata = ModelInputMetadata(20, 'b' * 64, 'c' * 64)
        with self.ledger.unit_of_work() as uow:
            row = self.ledger._binding(uow, self.run['id'], self.run['execution_id'], 1)
            journal = ModelJournal()
            journal.reserve(uow, row, input_bytes=10, request_hash='a' * 64, now=self.ledger.now(), limits=STRUCTURED_MODEL_LIMITS, call_id=call_id)
            self.assertTrue(journal.reserve_input(uow, row, call_id, metadata=metadata, now=self.ledger.now()))
            self.assertFalse(journal.reserve_input(uow, row, call_id, metadata=metadata, now=self.ledger.now()))
            with self.assertRaises(LedgerError):
                journal.reserve_input(uow, row, call_id, metadata=ModelInputMetadata(21, 'b' * 64, 'c' * 64), now=self.ledger.now())
            uow.commit()
        self.assertEqual(self.row()['model_input_tokens_reserved'], 40)

    async def test_call_metadata_failure_rolls_back_run_input_charge(self):
        original = SqliteUow.execute
        def execute(uow, sql, params=()):
            value = original(uow, sql, params)
            return 0 if sql.startswith('UPDATE agent_model_calls SET reserved_input_tokens') else value
        with patch.object(SqliteUow, 'execute', execute):
            with self.assertRaises(LedgerError):
                await self.request()
        self.assertEqual(len(self.factory.generation_requests), 0)
        self.assertEqual((self.row()['model_count'], self.row()['model_input_tokens_reserved']), (1, 0))
        self.assertIsNone(self.calls()[0]['reserved_input_tokens'])


if __name__ == '__main__':
    unittest.main()
