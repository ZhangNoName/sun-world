"""Development SQLite uses the same counted input permit before generation."""

import asyncio
import os
from pathlib import Path
import sqlite3
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import patch
from uuid import uuid4

from fastapi import HTTPException

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from test_counted_model_budget import count_reply, make_proxy, messages
from src.module_composition import create_module_registry
from src.modules.agent_runtime.runtime import Runtime
from src.modules.agent_runtime.store import Store


class LocalInputBudgetTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory(prefix='sun-world-local-input-')
        self.addCleanup(directory.cleanup)
        self.path = Path(directory.name) / 'ledger.sqlite'
        self.store = Store(self.path)
        self.addCleanup(self.store.close)
        self.proxy, self.factory = make_proxy()
        self.runtime = Runtime(self.store, None, registry=create_module_registry(), runner=lambda *_: None, model_proxy=self.proxy)
        sid = self.runtime.login(1)
        self.run_id, error = self.store.create(1, str(uuid4()), '合成问题')
        self.assertIsNone(error)
        self.store.transition(self.run_id, 'running')
        self.runtime.active[self.run_id] = {'sid': sid, 'deadline': time.monotonic() + 45}

    def install(self, **kwargs):
        self.proxy, self.factory = make_proxy(**kwargs)
        self.runtime.model_proxy = self.proxy

    async def request(self):
        return await self.runtime.model(self.run_id, messages())

    async def test_network_only_sees_committed_attempt_and_input_reservation(self):
        async def counting(_):
            row = await asyncio.to_thread(self.store.get, self.run_id)
            attempts = await asyncio.to_thread(self.store.model_attempts, self.run_id)
            self.assertEqual((row['model_count'], row['model_input_tokens_reserved']), (1, 0))
            self.assertIsNone(attempts[0]['reserved_input_tokens'])
            return count_reply(20)
        from test_counted_model_budget import generation_reply
        async def generating(_):
            row = await asyncio.to_thread(self.store.get, self.run_id)
            attempts = await asyncio.to_thread(self.store.model_attempts, self.run_id)
            self.assertEqual((row['model_input_tokens_reserved'], attempts[0]['reserved_input_tokens']), (20, 20))
            return generation_reply(20)
        self.install(counting=counting, generating=generating)
        await self.request()
        attempt = self.store.model_attempts(self.run_id)[0]
        self.assertEqual((attempt['state'], attempt['input_tokens']), ('observed', 20))
        self.store.close()
        reopened = Store(self.path)
        try:
            self.assertEqual(reopened.get(self.run_id)['model_input_tokens_reserved'], 20)
            self.assertEqual(reopened.get(self.run_id)['status'], 'interrupted')
            self.assertEqual(reopened.model_attempts(self.run_id)[0]['input_tokens'], 20)
        finally:
            reopened.close()

    async def test_four_parallel_preflights_have_only_two_input_winners(self):
        arrived, ready = [], asyncio.Event()
        async def counting(_):
            arrived.append(1)
            if len(arrived) == 4:
                ready.set()
            await ready.wait()
            return count_reply(16384)
        self.install(tokens=16384, counting=counting)
        async with asyncio.timeout(5):
            values = await asyncio.gather(*(self.request() for _ in range(4)), return_exceptions=True)
        self.assertEqual(sum(isinstance(value, dict) for value in values), 2)
        self.assertEqual(sum(isinstance(value, HTTPException) and value.status_code == 429 for value in values), 2)
        self.assertEqual((len(self.factory.count_requests), len(self.factory.generation_requests)), (4, 2))
        self.assertEqual(self.store.get(self.run_id)['model_input_tokens_reserved'], 32768)
        self.assertEqual(sum(row['state'] == 'observed' for row in self.store.model_attempts(self.run_id)), 2)

    async def test_input_commit_ack_loss_and_deadline_never_generate(self):
        original = self.store.reserve_model_input
        for mode in ('ack', 'deadline'):
            def reserve(*args):
                value = original(*args)
                if mode == 'ack':
                    raise RuntimeError('synthetic post-commit ACK loss')
                self.runtime.active[self.run_id]['deadline'] = time.monotonic() - 1
                return value
            with patch.object(self.store, 'reserve_model_input', side_effect=reserve):
                with self.assertRaises(HTTPException):
                    await self.request()
        self.assertEqual((len(self.factory.count_requests), len(self.factory.generation_requests)), (2, 0))
        self.assertEqual(self.store.get(self.run_id)['model_input_tokens_reserved'], 40)
        self.assertTrue(all(row['state'] == 'unknown' for row in self.store.model_attempts(self.run_id)))

    async def test_repeated_cancel_waits_for_owned_input_commit_thread(self):
        entered, release = threading.Event(), threading.Event()
        original = self.store.reserve_model_input
        def reserve(*args):
            with self.store.lock:
                value = original(*args)
                entered.set()
                if not release.wait(2):
                    raise RuntimeError('test gate expired')
                return value
        with patch.object(self.store, 'reserve_model_input', side_effect=reserve):
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
                values = await asyncio.gather(task, return_exceptions=True)
        self.assertIsInstance(values[0], asyncio.CancelledError)
        self.assertEqual(len(self.factory.generation_requests), 0)
        self.assertEqual(self.store.get(self.run_id)['model_input_tokens_reserved'], 20)
        self.assertEqual(self.store.model_attempts(self.run_id)[0]['state'], 'unknown')
        self.assertFalse(self.runtime.model_tasks[self.run_id])

    async def test_observation_ack_loss_cannot_override_observed_or_retry_model(self):
        original = self.store.observe_model_input
        def observe(*args):
            original(*args)
            raise RuntimeError('synthetic observed ACK loss')
        with patch.object(self.store, 'observe_model_input', side_effect=observe):
            with self.assertRaises(HTTPException):
                await self.request()
        row = self.store.model_attempts(self.run_id)[0]
        self.assertEqual((row['state'], row['reserved_input_tokens'], row['input_tokens']), ('observed', 20, 20))
        self.assertEqual((len(self.factory.count_requests), len(self.factory.generation_requests)), (1, 1))

    async def test_final_validation_cancel_and_shutdown_drain_before_store_close(self):
        for shutdown in (False, True):
            expected_attempts = len(self.store.model_attempts(self.run_id)) + 1
            entered, release, exited = threading.Event(), threading.Event(), threading.Event()
            original, validations = self.runtime.ensure_active, []
            def validate(run_id):
                value = original(run_id)
                attempts = self.store.model_attempts(run_id)
                if len(attempts) == expected_attempts and all(row['state'] == 'observed' for row in attempts):
                    validations.append(1)
                    if len(validations) == 2:
                        entered.set()
                        try:
                            if not release.wait(2):
                                raise RuntimeError('test gate expired')
                        finally:
                            exited.set()
                return value
            with patch.object(self.runtime, 'ensure_active', side_effect=validate):
                request = asyncio.create_task(self.request())
                closing = None
                try:
                    self.assertTrue(await asyncio.to_thread(entered.wait, 1))
                    if shutdown:
                        closing = asyncio.create_task(self.runtime.aclose())
                    else:
                        request.cancel()
                    await asyncio.sleep(.02)
                    self.assertFalse(exited.is_set())
                    self.assertTrue(self.runtime.model_tasks[self.run_id])
                    self.assertFalse(closing.done() if closing else request.done())
                finally:
                    release.set()
                    await asyncio.gather(request, *([closing] if closing else []), return_exceptions=True)
                self.assertTrue(exited.is_set())
        with self.assertRaises(sqlite3.ProgrammingError):
            self.store.db.execute('SELECT 1')

    async def test_legacy_schema_upgrade_does_not_erase_existing_usage(self):
        path = self.path.with_name('legacy.sqlite')
        with sqlite3.connect(path) as db:
            db.execute('CREATE TABLE runs(id TEXT PRIMARY KEY,user_id INTEGER,key TEXT,question TEXT,status TEXT,'
                       'answer TEXT,error_code TEXT,session_family TEXT,tool_count INTEGER,model_count INTEGER,'
                       'result_bytes INTEGER,UNIQUE(user_id,key))')
            db.execute("INSERT INTO runs(id,user_id,key,question,status,model_count) VALUES('old',1,'old','old','completed',3)")
        legacy = Store(path)
        try:
            self.assertEqual((legacy.get('old')['model_count'], legacy.get('old')['model_input_tokens_reserved']), (3, 0))
            self.assertEqual(legacy.model_attempts('old'), [])
        finally:
            legacy.close()


if __name__ == '__main__':
    unittest.main()
