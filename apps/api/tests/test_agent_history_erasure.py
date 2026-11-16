"""Real SQLite rollback paths; CI collation is an approximation, not MySQL proof."""

import asyncio
import sqlite3
import sys
import tempfile
import unittest
import unicodedata
from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'apps/api'))
from test_agent_run_ledger import SqliteUow
from test_agent_tool_journal import JournalDatabase
from src.core.auth import Principal
from src.module_composition import create_module_registry
from src.modules.agent_runtime.gateway import RunCall, RunGateway
from src.modules.agent_runtime.ledger import LedgerError, MySqlRunLedger, digest, family_hash
from src.modules.ai.errors import AiDomainError


def folded(value):
    return ''.join(c for c in unicodedata.normalize('NFKD', value)
                   if not unicodedata.combining(c)).casefold()


class ErasureUow(SqliteUow):
    def __enter__(self):
        super().__enter__()
        self.connection.create_collation('NOCASE', lambda a, b: (folded(a) > folded(b)) - (folded(a) < folded(b)))
        return self

    def query(self, sql, params=()):
        if self.database.fail_on and sql.startswith(self.database.fail_on):
            raise sqlite3.OperationalError('synthetic erasure failure')
        return super().query(sql, params)

    def commit(self):
        super().commit()
        if self.database.ack_loss:
            self.database.ack_loss = False
            raise RuntimeError('synthetic commit acknowledgement loss')


class ErasureDatabase(JournalDatabase):
    def __init__(self, path):
        super().__init__(path)
        self.fail_on, self.ack_loss = None, False
        # SQLite BLOB casts translate MySQL BINARY casts in the shared UOW.
        # Folded NOCASE deliberately makes ordinary equality unsafe for erase.
        with sqlite3.connect(path) as db:
            db.executescript('''
                DROP TABLE ai_message_feedback;
                DROP TABLE ai_messages;
                DROP TABLE ai_conversations;
                CREATE TABLE ai_conversations(id TEXT COLLATE NOCASE PRIMARY KEY,user_id INTEGER,title TEXT,
                    is_deleted INTEGER DEFAULT 0,created_at TIMESTAMP,updated_at TIMESTAMP);
                CREATE TABLE ai_messages(id TEXT COLLATE NOCASE PRIMARY KEY,conversation_id TEXT COLLATE NOCASE,
                    role TEXT,blocks TEXT,sequence INTEGER,status TEXT,created_at TIMESTAMP,updated_at TIMESTAMP,
                    UNIQUE(conversation_id,sequence));
                CREATE TABLE ai_message_feedback(message_id TEXT COLLATE NOCASE,user_id INTEGER,value TEXT,
                    created_at TIMESTAMP,updated_at TIMESTAMP,PRIMARY KEY(message_id,user_id));
            ''')

    def unit_of_work(self, *, isolation_level=None):
        return ErasureUow(self, isolation_level)


class AgentHistoryErasureTests(unittest.TestCase):
    tables = ('agent_runs', 'ai_conversations', 'ai_messages', 'ai_message_feedback',
              'agent_sources', 'agent_tool_calls', 'agent_model_calls')

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.db = ErasureDatabase(str(Path(self.temp.name) / 'erasure.sqlite'))
        self.time = datetime(2026, 11, 16, 1, tzinfo=timezone.utc)
        self.owner = Principal(kind='user', user_id=1, session_family='synthetic-family')
        self.ledger = MySqlRunLedger(self.db, clock=lambda: self.time)
        self.key = str(uuid4())
        self.model_calls, self.reads = 0, 0
        async def proxy(body):
            self.model_calls += 1
            return {'stop_reason': 'end_turn', 'content': [{'type': 'text', 'text': 'reply'}],
                    'model': body['model'], 'usage': {'input_tokens': 10, 'output_tokens': 5}}
        self.gateway = RunGateway(self.ledger, registry=create_module_registry(),
            handlers={'blog.search_public': lambda *_: {'items': []}, 'blog.read_public': self.read},
            enabled=lambda: True, authorize=lambda *_: self.owner, allow=lambda *_: True,
            worker_credential='S'*43, bundle_hash='a'*64, model_id='synthetic', model_proxy=proxy,
            site_origin='https://blog.example.test', source_reader=lambda *_: self.read())

    def read(self, *_):
        self.reads += 1
        return dict(article_id=1, title='公开标题', content='公开正文', truncated=False,
                    content_hash=digest({'article_id': 1, 'title': '公开标题', 'content': '公开正文'}),
                    content_bytes=12, returned_bytes=12)

    def accept(self, *, principal=None, question='具体问题'):
        return self.ledger.accept(principal or self.owner, question=question, idempotency_key=self.key,
                                  bundle_hash='a'*64, model_id='synthetic').run

    def running(self):
        row = self.accept()
        self.run, credentials = self.gateway.claim(row['id'], execution_id=str(uuid4()))
        self.calls = {a: RunCall(row['id'], self.run['execution_id'], 1, 'S'*43, getattr(credentials, a))
                      for a in ('tool', 'model', 'result')}
        self.gateway.bind_root_turn(self.calls['result'], 'root-turn', root_request_id='root-request')
        return self.run

    def finish(self):
        return self.gateway.finish(self.calls['result'], root_session_id=self.run['root_session_id'],
            root_turn_id='root-turn', root_request_id='root-request', answer='公开回答', source_ids=[])

    def completed(self):
        self.running()
        response = self.gateway.tool(self.calls['tool'], call_id='read-1', tool_id='blog.read_public',
                                     tool_version='1', arguments={'article_id': 1})
        self.gateway.receipt(self.calls['tool'], call_id='read-1', result_hash=response['result_hash'])
        asyncio.run(self.gateway.model(self.calls['model'], {'messages': []}))
        self.finish()
        with self.db.unit_of_work() as uow:
            for row in uow.fetch_all('SELECT id FROM ai_messages'):
                uow.execute('INSERT INTO ai_message_feedback(message_id,user_id,value) VALUES(%s,1,%s)',
                            (row['id'], 'positive'))
            uow.commit()
        return self.raw()

    def raw(self):
        with self.db.unit_of_work() as uow:
            return uow.fetch_one('SELECT * FROM agent_runs WHERE id=%s', (self.run['id'],))

    def snapshot(self):
        with self.db.unit_of_work() as uow:
            return {table: uow.fetch_all(f'SELECT * FROM {table} ORDER BY 1') for table in self.tables}

    def assert_code(self, code, operation):
        with self.assertRaises(LedgerError) as caught:
            operation()
        self.assertEqual(caught.exception.code, code)

    def test_completed_erase_is_atomic_and_preserves_dedup_budgets_and_control_binding(self):
        before = self.completed()
        self.assertTrue(self.ledger.erase_history(self.owner, self.run['id']))
        after = self.raw()
        cleared = {'tool_credential_hash', 'model_credential_hash', 'result_credential_hash', 'result_hash',
                   'root_session_id', 'root_turn_id', 'root_request_id'}
        for field in cleared:
            self.assertIsNone(after[field], field)
        for field in before.keys() - cleared - {'history_deleted_at', 'updated_at'}:
            self.assertEqual(before[field], after[field], field)
        self.assertEqual(after['history_deleted_at'], self.time.replace(tzinfo=None))
        for table in self.tables[1:]:
            self.assertEqual(self.db.count(table), 0, table)
        self.assertEqual(self.db.count('agent_runs'), 1)
        self.assertEqual(self.ledger.get_owned(self.owner, self.run['id'])['history_deleted_at'],
                         after['history_deleted_at'])
        with self.db.unit_of_work() as uow:
            self.assert_code('AGENT_RUN_NOT_FOUND', lambda: self.ledger._owned(
                uow, self.owner.user_id, family_hash(self.owner), self.run['id']))
        self.assertEqual(self.ledger.cancel(self.owner, self.run['id']), 'completed')
        self.assertIsNone(self.ledger.claim(self.run['id'], execution_id=str(uuid4())))
        self.assertEqual(self.ledger.end_execution(self.run['id'], execution_id=self.run['execution_id'],
                         generation=1, status='cancelled'), 'completed')
        self.assertFalse(self.ledger.erase_history(self.owner, self.run['id']))

    def test_all_terminal_states_allow_erasure_and_repeat_reauthorizes_once(self):
        for status in ('completed', 'failed', 'cancelled', 'interrupted'):
            with self.subTest(status=status):
                self.key = str(uuid4())
                self.running()
                if status == 'completed':
                    self.finish()
                else:
                    self.ledger.end_execution(self.run['id'], execution_id=self.run['execution_id'],
                                               generation=1, status=status)
                seen = []
                def authorize(uow, row):
                    self.assertEqual(uow.isolation_level, 'READ COMMITTED')
                    seen.append(row['id'])
                    return True
                self.assertTrue(self.ledger.erase_history(self.owner, self.run['id'], authorize=authorize))
                self.assertEqual(len(seen), 2)
                self.assertFalse(self.ledger.erase_history(self.owner, self.run['id'], authorize=authorize))
                self.assertEqual(len(seen), 3)

    def test_active_runs_are_rejected_without_cancellation_or_refund(self):
        self.run = self.accept()
        for state in ('accepted', 'running'):
            before = self.snapshot()
            self.assert_code('AGENT_HISTORY_NOT_TERMINAL',
                             lambda: self.ledger.erase_history(self.owner, self.run['id']))
            self.assertEqual(self.snapshot(), before)
            if state == 'accepted':
                self.run, _ = self.gateway.claim(self.run['id'], execution_id=str(uuid4()))

    def test_owner_and_family_privacy_precedes_authorizer_and_deleted_key_conflict(self):
        self.completed()
        called = []
        for principal in (replace(self.owner, user_id=2), replace(self.owner, session_family='different')):
            self.assert_code('AGENT_RUN_NOT_FOUND', lambda: self.ledger.erase_history(principal, self.run['id'],
                                                  authorize=lambda *_: called.append(True)))
        self.assertEqual(called, [])
        self.assert_code('AGENT_RUN_NOT_FOUND', lambda: self.ledger.erase_history(self.owner, str(uuid4())))
        self.ledger.erase_history(self.owner, self.run['id'])
        for question in ('具体问题', '不同问题'):
            self.assert_code('AGENT_HISTORY_DELETED', lambda: self.accept(question=question))
            self.assert_code('AGENT_HISTORY_DELETED', lambda: self.ledger.find_request(
                self.owner, question=question, idempotency_key=self.key))
            other = replace(self.owner, session_family='different')
            self.assert_code('AGENT_RUN_NOT_FOUND', lambda: self.accept(principal=other, question=question))
            self.assert_code('AGENT_RUN_NOT_FOUND', lambda: self.ledger.find_request(
                other, question=question, idempotency_key=self.key))
        self.assertEqual(self.db.count('agent_runs'), 1)
        self.assertEqual(self.model_calls, 1)

    def test_current_authorization_denial_before_or_after_deletes_rolls_back(self):
        self.completed()
        before = self.snapshot()
        for denial in (1, 2):
            seen = []
            def authorize(uow, row):
                seen.append(row['id'])
                if len(seen) == 2:
                    self.assertEqual(uow.fetch_all('SELECT * FROM ai_messages'), [])
                    self.assertIsNotNone(uow.fetch_one('SELECT history_deleted_at FROM agent_runs')['history_deleted_at'])
                return len(seen) != denial
            self.assert_code('AGENT_ACTIVE_SESSION_REQUIRED',
                             lambda: self.ledger.erase_history(self.owner, self.run['id'], authorize=authorize))
            self.assertEqual(len(seen), denial)
            self.assertEqual(self.snapshot(), before)

    def test_every_destructive_stage_rolls_back_prior_work(self):
        self.completed()
        before = self.snapshot()
        for statement in ('DELETE FROM ai_message_feedback', 'DELETE FROM ai_messages',
                          'DELETE FROM ai_conversations', 'DELETE FROM agent_sources',
                          'DELETE FROM agent_tool_calls', 'DELETE FROM agent_model_calls',
                          'UPDATE agent_runs SET history_deleted_at'):
            with self.subTest(statement=statement):
                self.db.fail_on = statement
                with self.assertRaises(sqlite3.OperationalError):
                    self.ledger.erase_history(self.owner, self.run['id'])
                self.db.fail_on = None
                self.assertEqual(self.snapshot(), before)

    def test_commit_ack_loss_is_recovered_by_marker_without_recreating_history(self):
        self.completed()
        self.db.ack_loss = True
        with self.assertRaises(RuntimeError):
            self.ledger.erase_history(self.owner, self.run['id'])
        self.assertIsNotNone(self.raw()['history_deleted_at'])
        self.assertFalse(self.ledger.erase_history(self.owner, self.run['id']))
        self.assertEqual(self.db.count('ai_messages'), 0)
        self.assert_code('AGENT_HISTORY_DELETED', self.accept)
        self.assertEqual(self.model_calls, 1)

    def test_late_callbacks_cannot_recreate_or_return_cached_private_history(self):
        self.completed()
        self.ledger.erase_history(self.owner, self.run['id'])
        before = self.snapshot()
        operations = [lambda: self.gateway.tool(self.calls['tool'], call_id='read-1', tool_id='blog.read_public',
                                               tool_version='1', arguments={'article_id': 1}),
                      lambda: self.gateway.receipt(self.calls['tool'], call_id='read-1', result_hash='b'*64),
                      lambda: self.gateway.bind_root_turn(self.calls['result'], 'root-turn'),
                      lambda: self.gateway.heartbeat(self.calls['tool']), self.finish,
                      lambda: asyncio.run(self.gateway.model(self.calls['model'], {'messages': []}))]
        for operation in operations:
            self.assert_code('AGENT_CREDENTIAL_INVALID', operation)
        self.assertEqual(self.snapshot(), before)
        self.assertEqual(self.model_calls, 1)

    def test_binary_cleanup_preserves_folded_message_and_feedback_aliases_and_ordinary_chat(self):
        self.completed()
        conv = self.run['conversation_id']
        alias = 'ágent_conv_' + conv[len('agent_conv_'):]
        with self.db.unit_of_work() as uow:
            message = uow.fetch_one('SELECT id FROM ai_messages WHERE sequence=1')['id']
            uow.execute('INSERT INTO ai_messages(id,conversation_id,sequence,blocks) VALUES(%s,%s,3,%s)',
                        ('ordinary_alias_message', alias, 'ordinary alias content'))
            uow.execute('INSERT INTO ai_message_feedback(message_id,user_id,value) VALUES(%s,2,%s)',
                        (message.upper(), 'alias feedback'))
            uow.execute('INSERT INTO ai_conversations(id,user_id,title) VALUES(%s,1,%s)', ('conv_ordinary', '普通标题'))
            uow.execute('INSERT INTO ai_messages(id,conversation_id,sequence,blocks) VALUES(%s,%s,1,%s)',
                        ('ordinary_message', 'conv_ordinary', '普通内容'))
            uow.execute('INSERT INTO ai_message_feedback(message_id,user_id,value) VALUES(%s,1,%s)',
                        ('ordinary_alias_message', 'ordinary feedback'))
            uow.commit()
        self.ledger.erase_history(self.owner, self.run['id'])
        with self.db.unit_of_work() as uow:
            self.assertEqual({r['id'] for r in uow.fetch_all('SELECT id FROM ai_messages')},
                             {'ordinary_alias_message', 'ordinary_message'})
            self.assertEqual({r['message_id'] for r in uow.fetch_all('SELECT message_id FROM ai_message_feedback')},
                             {message.upper(), 'ordinary_alias_message'})
            self.assertEqual(uow.fetch_one('SELECT title FROM ai_conversations')['title'], '普通标题')

    def test_folded_conversation_alias_cannot_be_erased_as_canonical(self):
        self.completed()
        alias = 'ágent_conv_' + self.run['conversation_id'][len('agent_conv_'):]
        with self.db.unit_of_work() as uow:
            uow.execute('UPDATE ai_conversations SET id=%s', (alias,))
            uow.commit()
        before = self.snapshot()
        with self.assertRaises(AiDomainError) as caught:
            self.ledger.erase_history(self.owner, self.run['id'])
        self.assertEqual(caught.exception.status_code, 404)
        self.assertEqual(self.snapshot(), before)

    def test_legacy_soft_hidden_canonical_history_can_be_erased(self):
        self.completed()
        with self.db.unit_of_work() as uow:
            uow.execute('UPDATE ai_conversations SET is_deleted=1')
            uow.commit()
        self.assertTrue(self.ledger.erase_history(self.owner, self.run['id']))
        self.assertEqual(self.db.count('ai_conversations'), 0)

    def test_completion_and_erasure_serialize_without_partial_history(self):
        self.running()
        def erase():
            try:
                return self.ledger.erase_history(self.owner, self.run['id'])
            except LedgerError as error:
                self.assertEqual(error.code, 'AGENT_HISTORY_NOT_TERMINAL')
                return False
        with ThreadPoolExecutor(max_workers=2) as pool:
            completion, deletion = pool.submit(self.finish), pool.submit(erase)
            self.assertTrue(completion.result(timeout=10))
            deleted = deletion.result(timeout=10)
        row = self.raw()
        self.assertEqual(row['status'], 'completed')
        self.assertEqual(self.db.count('ai_messages'), 0 if deleted else 2)
        self.assertEqual(row['history_deleted_at'] is not None, deleted)
