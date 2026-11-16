"""Real owned MySQL/Redis/auth/HTTP; synthetic Worker/model/article inputs.

Reuse the base setup without rerunning its ten inherited tests. load_tests below
selects only the history cases defined here; the stack launcher also runs
the original test_agent_stack.py independently.
"""

import asyncio
import contextlib
import threading
import unittest
from unittest.mock import patch
from uuid import uuid4

import pymysql

import test_agent_stack as stack_fixture
from src.controller.user_manage import UserManager
from src.database.mysql.unit_of_work import MySQLUnitOfWork
from src.modules.agent_runtime.ledger import LedgerError


class HistoryStackTests(stack_fixture.AgentStackTests):
    async def completed(self):
        stream, run_id, key = await self.stream()
        await stream.finish()
        self.assertEqual(self.row(run_id)['status'], 'completed')
        return run_id, key

    def counts(self):
        return {table: self.pool.fetch_one(f'SELECT COUNT(*) n FROM {table}')['n'] for table in
            ('ai_conversations', 'ai_messages', 'ai_message_feedback',
             'agent_runs', 'agent_sources', 'agent_tool_calls', 'agent_model_calls')}

    async def test_history_delete_removes_content_preserves_dedup_and_exact_collation(self):
        run_id, key = await self.completed()
        before = self.row(run_id)
        conversation = before['conversation_id']
        message = self.pool.fetch_one('SELECT id FROM ai_messages WHERE conversation_id=%s LIMIT 1', (conversation,))['id']
        self.pool.execute("INSERT INTO ai_message_feedback(message_id,user_id,value) VALUES(%s,1,'like')", (message,))
        # A malformed orphan alias intentionally compares equal under unicode_ci.
        # Erasure must still target only the exact canonical conversation bytes.
        alias = conversation.replace('agent_', 'ÁGENT_', 1)
        self.assertEqual(self.pool.fetch_one('SELECT %s = %s COLLATE utf8mb4_unicode_ci AS same', (conversation, alias))['same'], 1)
        self.pool.execute("INSERT INTO ai_conversations(id,user_id,title) VALUES('ordinary',1,'keep ordinary')")
        for identifier, target, sequence in (('ordinary-message', 'ordinary', 1), ('alias-message', alias, 9)):
            self.pool.execute("INSERT INTO ai_messages(id,conversation_id,role,blocks,sequence) VALUES(%s,%s,'user','[]',%s)",
                              (identifier, target, sequence))
            self.pool.execute("INSERT INTO ai_message_feedback(message_id,user_id,value) VALUES(%s,1,'like')", (identifier,))
        rate, calls, starts = self.rate(), self.model_calls, len(self.worker.payloads)
        response = await self.request('DELETE', '/runs/' + run_id)
        self.assertEqual((response.status_code, response.json()['data']), (200, True))
        after = self.row(run_id)
        self.assertIsNotNone(after['history_deleted_at'])
        self.assertEqual(after['status'], 'completed')
        for field in ('idempotency_key', 'request_hash', 'session_family_hash', 'execution_id',
                      'model_count', 'tool_count', 'model_input_tokens_reserved',
                      'model_output_tokens_reserved', 'model_response_bytes_reserved'):
            self.assertEqual(after[field], before[field], field)
        for field in ('tool_credential_hash', 'model_credential_hash', 'result_credential_hash',
                      'result_hash', 'root_session_id', 'root_turn_id', 'root_request_id'):
            self.assertIsNone(after[field], field)
        self.assertEqual(self.counts(), dict(ai_conversations=1, ai_messages=2, ai_message_feedback=2,
            agent_runs=1, agent_sources=0, agent_tool_calls=0, agent_model_calls=0))
        self.assertEqual((await self.request('GET', '/runs/' + run_id)).status_code, 404)
        self.assertEqual((await self.request('DELETE', '/runs/' + run_id)).status_code, 200)
        for question in ('合成问题', '换个问题'):
            duplicate = await self.request('POST', '/runs/stream', json={'question': question, 'idempotency_key': key})
            self.assertEqual((duplicate.status_code, duplicate.json()['code']), (409, 'AGENT_HISTORY_DELETED'))
        payload = self.worker.payloads[run_id]
        with self.assertRaises(LedgerError):
            await self.application.gateway.model(self.worker.call(payload, 'model'), {'messages': []})
        with self.assertRaises(LedgerError):
            await asyncio.to_thread(self.application.gateway.finish, self.worker.call(payload, 'result'),
                root_session_id=payload['root_session_id'], root_turn_id='native-root-turn',
                root_request_id='native-root-request', answer='late', source_ids=[])
        self.assertEqual((self.rate(), self.model_calls, len(self.worker.payloads)), (rate, calls, starts))
        self.assertEqual(self.counts()['ai_messages'], 2)

    async def test_history_active_rejects_without_cancelling_then_terminal_deletes(self):
        self.worker.mode = 'hold'
        stream, run_id, _key = await self.stream()
        await self.wait_started(run_id)
        before = self.counts()
        response = await self.request('DELETE', '/runs/' + run_id)
        self.assertEqual((response.status_code, response.json()['code']), (409, 'AGENT_HISTORY_NOT_TERMINAL'))
        self.assertEqual(self.counts(), before)
        self.assertEqual(self.row(run_id)['status'], 'running')
        self.assertFalse(self.worker.cancels)
        self.assertEqual((await self.request('POST', '/runs/' + run_id + '/cancel')).status_code, 200)
        await stream.finish()
        self.assertEqual((await self.request('DELETE', '/runs/' + run_id)).status_code, 200)
        self.assertEqual(self.counts()['ai_messages'], 0)
        self.assertEqual(self.row(run_id)['status'], 'cancelled')

    async def test_history_owner_family_and_unknown_run_are_hidden(self):
        run_id, _ = await self.completed()
        before = self.counts()
        different_family = self.auth.create_tokens_for_user('1', str(uuid4())).access_token
        for token, target in ((self.other, run_id), (different_family, run_id), (self.token, str(uuid4()))):
            response = await self.request('DELETE', '/runs/' + target, token=token)
            self.assertEqual((response.status_code, response.json()['code']), (404, 'AGENT_RUN_NOT_FOUND'))
            self.assertNotIn(run_id, response.text)
        self.assertEqual(self.counts(), before)
        self.assertIsNone(self.row(run_id)['history_deleted_at'])

    async def test_history_disabled_account_cannot_read_erase_or_complete_again(self):
        run_id, _ = await self.completed()
        before = self.counts()
        self.assertTrue(UserManager(self.pool).delete_user('1'))
        for method in ('GET', 'DELETE'):
            response = await self.request(method, '/runs/' + run_id)
            self.assertEqual(response.status_code, 401)
        payload = self.worker.payloads[run_id]
        with self.assertRaises(LedgerError):
            await asyncio.to_thread(self.application.gateway.finish, self.worker.call(payload, 'result'),
                root_session_id=payload['root_session_id'], root_turn_id='native-root-turn',
                root_request_id='native-root-request', answer='late', source_ids=[])
        self.assertEqual(self.counts(), before)
        self.assertIsNone(self.row(run_id)['history_deleted_at'])

    async def test_history_disable_during_erasure_rolls_back_all_content(self):
        run_id, _ = await self.completed()
        before = self.counts()
        original = self.ledger.history.erase
        def disable(*args, **kwargs):
            original(*args, **kwargs)
            with self.admin.cursor() as cursor:
                cursor.execute('UPDATE users SET status=0 WHERE id=1')
        with patch.object(self.ledger.history, 'erase', disable):
            response = await self.request('DELETE', '/runs/' + run_id)
        self.assertEqual(response.status_code, 401)
        self.assertEqual(self.counts(), before)
        self.assertIsNone(self.row(run_id)['history_deleted_at'])

    async def test_history_failure_and_postcommit_ack_loss_are_atomic_and_retryable(self):
        run_id, _ = await self.completed()
        before = self.counts()
        execute = MySQLUnitOfWork.execute
        def failed(uow, sql, params=None):
            if sql.startswith('UPDATE agent_runs SET history_deleted_at'):
                raise RuntimeError('Synthetic failure after transcript removal')
            return execute(uow, sql, params)
        with patch.object(MySQLUnitOfWork, 'execute', failed):
            response = await self.request('DELETE', '/runs/' + run_id)
        self.assertEqual(response.status_code, 503)
        self.assertEqual(self.counts(), before)
        self.assertEqual((await self.request('GET', '/runs/' + run_id)).status_code, 200)
        commit, injected = pymysql.connections.Connection.commit, []
        def lost(connection):
            commit(connection)
            if not injected:
                injected.append(True)
                raise pymysql.OperationalError(2013, 'Synthetic post-COMMIT acknowledgement loss')
        with patch.object(pymysql.connections.Connection, 'commit', lost):
            response = await self.request('DELETE', '/runs/' + run_id)
        self.assertEqual(response.status_code, 503)
        self.assertEqual(injected, [True])
        self.assertIsNotNone(self.row(run_id)['history_deleted_at'])
        self.assertEqual(self.counts()['ai_messages'], 0)
        self.assertEqual((await self.request('DELETE', '/runs/' + run_id)).status_code, 200)

    async def locked_race(self, method, primary, waiters):
        entered, release = threading.Event(), threading.Event()
        local, ids = threading.local(), {}
        original_history = getattr(self.ledger.history, method)
        original_uow, original_erase = self.pool.unit_of_work, self.ledger.erase_history
        def paused(*args, **kwargs):
            value = original_history(*args, **kwargs)
            entered.set()
            if not release.wait(5):
                raise RuntimeError('Synthetic erasure/completion fence timed out')
            return value
        @contextlib.contextmanager
        def observed(*args, **kwargs):
            with original_uow(*args, **kwargs) as uow:
                label = getattr(local, 'label', None)
                if label in waiters and label not in ids:
                    ids[label] = uow.fetch_one('SELECT CONNECTION_ID() AS id')['id']
                yield uow
        def erase(*args, **kwargs):
            local.label = 'erase'
            try:
                return original_erase(*args, **kwargs)
            finally:
                local.label = None
        def tagged(label, function):
            local.label = label
            try:
                return function()
            finally:
                local.label = None
        tasks = []
        with patch.object(self.ledger.history, method, paused), patch.object(self.pool, 'unit_of_work', observed), \
                patch.object(self.ledger, 'erase_history', erase):
            try:
                tasks.append(asyncio.create_task(primary()))
                self.assertTrue(await asyncio.to_thread(entered.wait, 2))
                for label, (function, asynchronous) in waiters.items():
                    tasks.append(asyncio.create_task(function() if asynchronous else asyncio.to_thread(tagged, label, function)))
                async with asyncio.timeout(3):
                    while True:
                        if len(ids) == len(waiters):
                            def states():
                                with self.admin.cursor() as cursor:
                                    cursor.execute('SELECT trx_mysql_thread_id,trx_state FROM information_schema.innodb_trx')
                                    return dict(cursor.fetchall())
                            actual = await asyncio.to_thread(states)
                            if all(actual.get(value) == 'LOCK WAIT' for value in ids.values()):
                                break
                        await asyncio.sleep(.01)
                self.assertTrue(all(not task.done() for task in tasks))
            finally:
                release.set()
                results = await asyncio.gather(*tasks, return_exceptions=True)
        return results

    async def test_history_deletion_serializes_view_and_late_completion(self):
        run_id, _ = await self.completed()
        payload = self.worker.payloads[run_id]
        def finish():
            return self.application.gateway.finish(self.worker.call(payload, 'result'),
                root_session_id=payload['root_session_id'], root_turn_id='native-root-turn',
                root_request_id='native-root-request', answer='late', source_ids=[])
        results = await self.locked_race('erase', lambda: self.request('DELETE', '/runs/' + run_id), {
            'view': (lambda: self.application._view(self.token, run_id), False),
            'finish': (finish, False),
        })
        self.assertEqual(results[0].status_code, 200)
        self.assertIsInstance(results[1], LedgerError)
        self.assertEqual(results[1].code, 'AGENT_RUN_NOT_FOUND')
        self.assertIsInstance(results[2], LedgerError)
        self.assertEqual(results[2].code, 'AGENT_CREDENTIAL_INVALID')
        self.assertEqual(self.counts()['ai_messages'], 0)

    async def test_history_completion_serializes_delete_and_consistent_view(self):
        self.worker.mode = 'hold'
        stream, run_id, _ = await self.stream()
        await self.wait_started(run_id)
        payload = self.worker.payloads[run_id]
        result = self.worker.call(payload, 'result')
        await asyncio.to_thread(self.application.gateway.bind_root_turn, result,
            'native-root-turn', root_request_id='native-root-request')
        async def finish():
            return await asyncio.to_thread(self.application.gateway.finish, result,
                root_session_id=payload['root_session_id'], root_turn_id='native-root-turn',
                root_request_id='native-root-request', answer='合成回答', source_ids=[])
        results = await self.locked_race('complete', finish, {
            'erase': (lambda: self.request('DELETE', '/runs/' + run_id), True),
            'view': (lambda: self.application._view(self.token, run_id), False),
        })
        self.assertIs(results[0], True)
        self.assertEqual(results[1].status_code, 200)
        if isinstance(results[2], LedgerError):
            self.assertEqual(results[2].code, 'AGENT_RUN_NOT_FOUND')
        else:
            self.assertEqual(results[2]['status'], 'completed')
            self.assertEqual(results[2]['answer'], '未找到相关公开文章。')
        self.assertEqual(self.row(run_id)['status'], 'completed')
        self.assertIsNotNone(self.row(run_id)['history_deleted_at'])
        self.assertEqual(self.counts()['ai_messages'], 0)
        await stream.finish()

    async def test_history_erasure_before_settle_still_observes_and_releases_real_slot(self):
        entered, release = asyncio.Event(), asyncio.Event()
        settle, inspect = self.application._settle, self.worker.inspect
        observed_deleted = []
        async def paused(owner, run_id):
            entered.set()
            await release.wait()
            return await settle(owner, run_id)
        async def observed(binding):
            row = await asyncio.to_thread(self.row, binding['run_id'])
            observed_deleted.append(row['history_deleted_at'] is not None)
            return await inspect(binding)
        with patch.object(self.application, '_settle', paused), patch.object(self.worker, 'inspect', observed):
            try:
                stream, run_id, _ = await self.stream()
                async with asyncio.timeout(3):
                    await entered.wait()
                self.assertEqual(self.row(run_id)['status'], 'completed')
                lease = self.application._leases[run_id]
                self.assertTrue(await asyncio.to_thread(self.admission.owned, lease))
                self.assertEqual((await self.request('DELETE', '/runs/' + run_id)).status_code, 200)
                self.assertTrue(await asyncio.to_thread(self.admission.owned, lease))
            finally:
                release.set()
            await stream.finish()
        self.assertIn(True, observed_deleted)
        self.assertFalse(await asyncio.to_thread(self.admission.owned, lease))
        self.assertNotIn(run_id, self.application._leases)
        self.assertEqual((await self.request('GET', '/runs/' + run_id)).status_code, 404)


def load_tests(_loader, _tests, _pattern):
    names = sorted(name for name in HistoryStackTests.__dict__ if name.startswith('test_history_'))
    return unittest.TestSuite(HistoryStackTests(name) for name in names)
