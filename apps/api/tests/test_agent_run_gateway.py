import asyncio
import contextlib
import threading
import hashlib
import json
import sqlite3
import sys
import tempfile
import unittest
from dataclasses import replace
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'apps/api'))
from test_agent_tool_journal import JournalDatabase
from test_agent_run_ledger import SqliteUow
from src.core.auth import Principal
from src.module_composition import create_module_registry
from src.modules.agent_runtime.gateway import NO_SOURCES, RunCall, RunGateway, encode
from src.modules.agent_runtime.ledger import LedgerError, MySqlRunLedger, digest


class AgentRunGatewayTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.db = JournalDatabase(str(Path(self.temp.name) / 'gateway.sqlite'))
        self.time = datetime(2026, 11, 15, 1, tzinfo=timezone.utc)
        self.ledger = MySqlRunLedger(self.db, clock=lambda: self.time)
        self.owner = Principal(kind='user', user_id=1, session_family='synthetic-family', roles=('admin',))
        self.current = self.owner
        self.flag, self.allowed = True, True
        self.title, self.content, self.reads, self.searches = '公开标题', '公开正文不会复制到来源账本。', 0, 0
        self.after_read = None
        self.service_secret = 'S' * 43
        async def proxy(body):
            return {'stop_reason': 'end_turn', 'content': [{'type': 'text', 'text': 'reply'}], 'model': body['model']}
        self.gateway = RunGateway(self.ledger, registry=create_module_registry(),
            handlers={'blog.search_public': self.search, 'blog.read_public': self.read},
            enabled=lambda: self.flag, authorize=lambda *_: self.current, allow=lambda *_: self.allowed,
            worker_credential=self.service_secret, bundle_hash='a'*64, model_id='synthetic',
            model_proxy=proxy, site_origin='https://blog.example.test')
        self.run, self.credentials = self.new_run()
        self.tool_call, self.model_call, self.result_call = [self.call(audience) for audience in ('tool', 'model', 'result')]
        self.gateway.bind_root_turn(self.result_call, 'root-turn')

    def new_run(self):
        row = self.ledger.accept(self.owner, question='具体问题', idempotency_key=str(uuid4()),
                                  bundle_hash='a'*64, model_id='synthetic').run
        return self.gateway.claim(row['id'], execution_id=str(uuid4()))

    def call(self, audience, *, run=None, credentials=None):
        run, credentials = run or self.run, credentials or self.credentials
        return RunCall(run['id'], run['execution_id'], run['generation'], self.service_secret, getattr(credentials, audience))

    def search(self, principal, arguments):
        self.searches += 1
        return {'items': [{'article_id': 1, 'title': self.title, 'abstract': '摘要', 'truncated': False}]}

    def read(self, principal, arguments):
        self.assertEqual(principal.user_id, 1)
        if arguments['article_id'] != 1:
            raise LookupError('synthetic private error')
        self.reads += 1
        result = dict(article_id=1, title=self.title, content=self.content,
            content_hash=digest({'article_id': 1, 'title': self.title, 'content': self.content}),
            truncated=False, content_bytes=len(self.content.encode()), returned_bytes=len(self.content.encode()))
        if self.after_read:
            self.after_read()
        return result

    def tool(self, call_id='read-1', **kwargs):
        return self.gateway.tool(kwargs.pop('call', self.tool_call), call_id=call_id,
            tool_id=kwargs.pop('tool_id', 'blog.read_public'), tool_version='1',
            arguments=kwargs.pop('arguments', {'article_id': 1}), **kwargs)

    def delivered(self):
        result = self.tool()
        self.gateway.receipt(self.tool_call, call_id='read-1', result_hash=result['result_hash'])
        return result['source_id']

    def finish(self, source_ids, **kwargs):
        return self.gateway.finish(kwargs.pop('call', self.result_call), root_session_id=self.run['root_session_id'],
            root_turn_id='root-turn', answer=kwargs.pop('answer', '有据可查的回答。'), source_ids=source_ids, **kwargs)

    def test_private_credentials_are_scoped_hashed_and_never_printed(self):
        row = self.ledger.get_owned(self.owner, self.run['id'])
        for audience in ('tool', 'model', 'result'):
            token = getattr(self.credentials, audience)
            self.assertEqual(row[audience+'_credential_hash'], hashlib.sha256(token.encode()).hexdigest())
            self.assertNotIn(token, repr(self.credentials))
            self.assertNotIn(token, repr(self.call(audience)))
            self.assertNotIn(token, str(row))
        for call in [replace(self.tool_call, service_credential='T'*43), self.model_call,
                     replace(self.tool_call, generation=2), replace(self.tool_call, execution_id=str(uuid4()))]:
            with self.subTest(call=repr(call)), self.assertRaises(LedgerError):
                self.tool(call=call)
        self.assertEqual(self.reads, 0)
        self.assertEqual(self.ledger.get_owned(self.owner, self.run['id'])['tool_count'], 0)

    def test_normalized_call_replay_is_one_charge_without_rereading(self):
        first = self.tool('search-1', tool_id='blog.search_public', arguments={'query': ' 文章 '})
        second = self.tool('search-1', tool_id='blog.search_public', arguments={'query': '文章', 'limit': 10})
        self.assertEqual(first, second)
        self.assertEqual(self.searches, 1)
        payload = {key: value for key, value in first.items() if key != 'result_hash'}
        self.assertEqual(first['result_hash'], hashlib.sha256(encode(payload)).hexdigest())
        row = self.ledger.get_owned(self.owner, self.run['id'])
        self.assertEqual(row['result_bytes'], len(encode(first)))
        self.assertEqual(row['tool_count'], 1)
        self.assertIsNone(first['source_id'])
        with self.assertRaises(LedgerError):
            self.tool('search-1', tool_id='blog.search_public', arguments={'query': 'different'})

    def test_prepared_is_not_delivered_and_wrong_receipt_never_unlocks_source(self):
        response = self.tool()
        with self.assertRaises(LedgerError):
            self.finish([response['source_id']])
        with self.assertRaises(LedgerError):
            self.gateway.receipt(self.tool_call, call_id='read-1', result_hash='0'*64)
        self.gateway.receipt(self.tool_call, call_id='read-1', result_hash=response['result_hash'])
        self.gateway.receipt(self.tool_call, call_id='read-1', result_hash=response['result_hash'])
        self.assertTrue(self.finish([response['source_id']]))
        self.assertFalse(self.finish([response['source_id']]))
        self.assertEqual(self.db.count('ai_messages'), 2)
        with self.db.unit_of_work() as uow:
            answer = json.loads(uow.fetch_one('SELECT blocks FROM ai_messages WHERE sequence=2')['blocks'])
        self.assertEqual(answer[0]['format'], 'plain')
        self.assertEqual(answer[1]['url'], 'https://blog.example.test/blog/1')

    def test_changed_article_or_deleted_source_rejects_completion(self):
        source_id = self.delivered()
        self.content += '更新'
        with self.assertRaises(LedgerError) as error:
            self.finish([source_id])
        self.assertEqual(error.exception.code, 'BLOG_SOURCE_CHANGED')
        self.assertEqual(self.db.count('ai_messages'), 1)
        self.assertEqual(self.ledger.get_owned(self.owner, self.run['id'])['status'], 'running')

    def test_cross_run_source_and_credential_reuse_rejected(self):
        source_id = self.delivered()
        other, credentials = self.new_run()
        other_result = self.call('result', run=other, credentials=credentials)
        self.gateway.bind_root_turn(other_result, 'other-root')
        with self.assertRaises(LedgerError):
            self.gateway.finish(other_result, root_session_id=other['root_session_id'], root_turn_id='other-root',
                                answer='回答', source_ids=[source_id])
        with self.assertRaises(LedgerError):
            self.tool('cross', call=replace(self.tool_call, run_id=other['id'], execution_id=other['execution_id']))
        self.assertEqual(self.db.count('ai_messages'), 2)

    def test_live_revocation_checks_before_after_read_and_completion(self):
        self.after_read = lambda: setattr(self, 'allowed', False)
        with self.assertRaises(LedgerError):
            self.tool()
        self.assertEqual(self.db.count('agent_sources'), 0)
        self.assertEqual(self.ledger.get_owned(self.owner, self.run['id'])['tool_count'], 1)
        self.after_read, self.allowed = None, True
        response = self.tool('read-2')
        self.gateway.receipt(self.tool_call, call_id='read-2', result_hash=response['result_hash'])
        self.current = replace(self.owner, session_family='replaced')
        with self.assertRaises(LedgerError):
            self.finish([response['source_id']])
        self.assertEqual(self.db.count('ai_messages'), 1)

    def test_feature_close_and_authorization_dependency_failure_are_closed(self):
        self.flag = False
        with self.assertRaises(LedgerError):
            self.tool()
        self.flag = True
        def unavailable(*_):
            raise RuntimeError('secret database diagnostic')
        self.gateway.authorize = unavailable
        with self.assertRaises(LedgerError) as error:
            self.tool()
        self.assertNotIn('secret', str(error.exception))
        self.assertEqual(self.reads, 0)

    def test_search_or_empty_sources_cannot_create_model_authored_links(self):
        self.tool('search', tool_id='blog.search_public', arguments={'query': '文章'})
        with self.assertRaises(LedgerError):
            self.finish([str(uuid4())])
        self.assertTrue(self.finish([], answer='模型随意回答'))
        with self.db.unit_of_work() as uow:
            blocks = json.loads(uow.fetch_one('SELECT blocks FROM ai_messages WHERE sequence=2')['blocks'])
        self.assertEqual(blocks, [{'type': 'text', 'text': NO_SOURCES, 'format': 'plain'}])

    def test_cache_loss_does_not_reexecute_or_charge_again(self):
        self.tool()
        self.gateway.cache = type(self.gateway.cache)()
        with self.assertRaises(LedgerError) as error:
            self.tool()
        self.assertEqual(error.exception.code, 'AGENT_CALL_RESULT_UNAVAILABLE')
        self.assertEqual(self.reads, 1)
        self.assertEqual(self.ledger.get_owned(self.owner, self.run['id'])['tool_count'], 1)

    def test_cumulative_budget_counts_full_response_envelope(self):
        self.content = 'x' * 16384
        for index in range(3):
            self.tool(str(index))
        with self.assertRaises(LedgerError):
            self.tool('four')
        row = self.ledger.get_owned(self.owner, self.run['id'])
        self.assertEqual(row['tool_count'], 4)
        self.assertLessEqual(row['result_bytes'], 65536)
        self.assertEqual(self.db.count('agent_sources'), 3)
        with self.assertRaises(LedgerError):
            self.tool('five')
        self.assertEqual(self.reads, 4)

    def test_failed_prepare_rolls_back_bytes_and_source_but_keeps_reserved_call_charge(self):
        original = SqliteUow.execute
        def fail(uow, statement, parameters=()):
            if statement.startswith('INSERT INTO agent_sources'):
                raise RuntimeError('synthetic storage failure')
            return original(uow, statement, parameters)
        with patch.object(SqliteUow, 'execute', fail), self.assertRaises(LedgerError):
            self.tool()
        self.assertEqual(self.db.count('agent_sources'), 0)
        row = self.ledger.get_owned(self.owner, self.run['id'])
        self.assertEqual(row['tool_count'], 1)
        self.assertEqual(row['result_bytes'], 0)

    def test_no_public_article_body_or_argument_json_persisted_in_journal(self):
        self.tool()
        with self.db.unit_of_work() as uow:
            rows = uow.fetch_all('SELECT * FROM agent_tool_calls') + uow.fetch_all('SELECT * FROM agent_sources')
        self.assertNotIn(self.content, str(rows))
        for row in rows:
            for forbidden in ('arguments', 'result', 'result_json'):
                self.assertNotIn(forbidden, row)

    def test_model_failures_consume_budget_and_client_model_never_changes_snapshot(self):
        seen = []
        async def failing(body):
            seen.append(body)
            raise RuntimeError('secret upstream detail')
        self.gateway.model_proxy = failing
        for _ in range(4):
            with self.assertRaises(LedgerError) as error:
                asyncio.run(self.gateway.model(self.model_call, {'model': 'attacker-choice', 'messages': []}))
            self.assertNotIn('secret', str(error.exception))
        with self.assertRaises(LedgerError):
            asyncio.run(self.gateway.model(self.model_call, {'messages': []}))
        self.assertEqual(len(seen), 4)
        self.assertTrue(all(body['model'] == 'synthetic' and body['max_tokens'] == 1024 for body in seen))
        self.assertEqual(self.ledger.get_owned(self.owner, self.run['id'])['model_count'], 4)

    def test_model_is_aborted_and_drained_when_run_cancelled_while_waiting(self):
        async def scenario():
            entered, cleaned = asyncio.Event(), asyncio.Event()
            async def waiting(_body):
                try:
                    entered.set()
                    await asyncio.Event().wait()
                finally:
                    await asyncio.sleep(.01)
                    cleaned.set()
            self.gateway.model_proxy = waiting
            task = asyncio.create_task(self.gateway.model(self.model_call, {'messages': []}))
            await asyncio.wait_for(entered.wait(), 5)
            await asyncio.to_thread(self.ledger.cancel, self.owner, self.run['id'])
            with self.assertRaises(LedgerError):
                await asyncio.wait_for(task, 5)
            self.assertTrue(cleaned.is_set())
        asyncio.run(scenario())

    def test_root_binding_and_heartbeat_use_result_audience(self):
        with self.assertRaises(LedgerError):
            self.gateway.heartbeat(self.tool_call)
        with self.assertRaises(LedgerError):
            self.gateway.bind_root_turn(self.tool_call, 'child')
        self.assertEqual(self.gateway.heartbeat(self.result_call), self.run['lease_expires_at'])

    def test_authorization_receives_existing_uow_without_nested_pool_borrow(self):
        active = threading.local()
        original = self.db.unit_of_work
        @contextlib.contextmanager
        def one_connection():
            if getattr(active, 'borrowed', False):
                raise AssertionError('nested database pool borrow')
            active.borrowed = True
            try:
                with original() as uow:
                    yield uow
            finally:
                active.borrowed = False
        seen = []
        def authorize(uow, row):
            account = uow.fetch_one('SELECT id,status FROM users WHERE id=%s', (row['user_id'],))
            seen.append(account['id'])
            return self.current if account['status'] == 1 else None
        self.gateway.authorize = authorize
        with patch.object(self.db, 'unit_of_work', one_connection):
            self.tool()
        self.assertGreaterEqual(len(seen), 2)

    def test_bad_service_cannot_probe_root_metadata_or_model(self):
        bad = replace(self.result_call, service_credential='T'*43)
        with self.assertRaises(LedgerError) as error:
            self.gateway.finish(bad, root_session_id='wrong', root_turn_id='wrong', answer='answer', source_ids=[])
        self.assertEqual(error.exception.code, 'AGENT_CREDENTIAL_INVALID')
        with self.assertRaises(LedgerError):
            asyncio.run(self.gateway.model(bad, {'messages': []}))
        self.assertEqual(self.ledger.get_owned(self.owner, self.run['id'])['model_count'], 0)

    def test_valid_tool_titles_become_bounded_nonempty_link_labels(self):
        for index, title in enumerate(('长' * 512, '')):
            if index:
                self.run, self.credentials = self.new_run()
                self.tool_call, self.model_call, self.result_call = [self.call(a) for a in ('tool', 'model', 'result')]
                self.gateway.bind_root_turn(self.result_call, 'root-turn')
            self.title = title
            source = self.delivered()
            self.assertTrue(self.finish([source]))
            with self.db.unit_of_work() as uow:
                blocks = json.loads(uow.fetch_one('SELECT blocks FROM ai_messages WHERE conversation_id=%s AND sequence=2',
                                                  (self.run['conversation_id'],))['blocks'])
            self.assertEqual(blocks[1]['label'], title[:500] or '文章 1')

    def test_invalid_unicode_answer_is_stable_output_denial(self):
        with self.assertRaises(LedgerError) as error:
            self.finish([], answer='invalid-\ud800')
        self.assertEqual(error.exception.code, 'AGENT_OUTPUT_INVALID')

    def test_handler_cannot_hide_oversized_body_in_returned_bytes_metadata(self):
        def inconsistent(principal, arguments):
            result = self.read(principal, arguments)
            result.update(content='x'*16385, returned_bytes=0, content_bytes=16385)
            return result
        self.gateway.handlers['blog.read_public'] = inconsistent
        with self.assertRaises(LedgerError) as error:
            self.tool()
        self.assertEqual(error.exception.code, 'AGENT_OUTPUT_INVALID')
        self.assertEqual(self.db.count('agent_sources'), 0)
        row = self.ledger.get_owned(self.owner, self.run['id'])
        self.assertEqual(row['tool_count'], 1)
        self.assertEqual(row['result_bytes'], 0)
