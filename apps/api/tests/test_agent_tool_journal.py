import sqlite3
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'apps/api'))

from test_agent_run_ledger import Database, SqliteUow
from src.core.auth import Principal
from src.database.mysql.schema_migration import MYSQL_SCHEMA
from src.modules.agent_runtime.journal import ToolJournal
from src.modules.agent_runtime.ledger import LedgerError, MySqlRunLedger


class JournalDatabase(Database):
    """Use real SQLite transactions, without claiming MySQL row-lock conformance."""
    def __init__(self, path):
        super().__init__(path)
        with sqlite3.connect(path) as db:
            for name in ('agent_tool_calls', 'agent_sources', 'agent_model_calls'):
                schema = MYSQL_SCHEMA[name]
                columns = ','.join(
                    f"{column['name']} {'TIMESTAMP' if column['type'] == 'datetime' else 'INTEGER' if column['type'] == 'int' else 'TEXT'}"
                    for column in schema['columns'])
                primary = ','.join(schema['primary_key'])
                extra = ',UNIQUE(run_id,generation,call_id)' if name == 'agent_sources' else ''
                db.execute(f'CREATE TABLE {name}({columns},PRIMARY KEY({primary}){extra})')


class AgentToolJournalTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.db = JournalDatabase(str(Path(self.temp.name) / 'journal.sqlite'))
        self.now = datetime(2026, 11, 15, 1)
        self.ledger = MySqlRunLedger(self.db, clock=lambda: self.now.replace(tzinfo=timezone.utc))
        self.journal = ToolJournal()
        self.owner = Principal(kind='user', user_id=1, session_family='synthetic-family')
        self.run = self.new_run()
        self.source = dict(article_id=1, title='公开文章', content_hash='b' * 64, excerpt_hash='c' * 64)

    def new_run(self):
        row = self.ledger.accept(self.owner, question='来源测试', idempotency_key=str(uuid4()),
                                 bundle_hash='a' * 64, model_id='synthetic').run
        execution_id = str(uuid4())
        row = self.ledger.claim(row['id'], execution_id=execution_id)
        # The C1 SQLite helper intentionally translates columns only. Ensure new
        # production DEFAULT counters are represented even before accept is wired.
        with self.db.unit_of_work() as uow:
            uow.execute('UPDATE agent_runs SET tool_count=0,model_count=0,result_bytes=0 WHERE id=%s', (row['id'],))
            uow.commit()
        return row

    def reserve(self, call_id='call-1', tool_id='blog.read_public', argument_hash='d' * 64):
        with self.db.unit_of_work() as uow:
            result = self.journal.reserve_tool(uow, self.run, call_id=call_id, tool_id=tool_id,
                                               tool_version='1', argument_hash=argument_hash, now=self.now)
            uow.commit()
            return result

    def prepare(self, call_id='call-1', size=123, source=None):
        with self.db.unit_of_work() as uow:
            result = self.journal.prepare(uow, self.run, call_id=call_id, result_hash='e' * 64,
                                          result_bytes=size, source=source, now=self.now)
            uow.commit()
            return result

    def ack(self, call_id='call-1', result_hash='e' * 64):
        with self.db.unit_of_work() as uow:
            result = self.journal.acknowledge(uow, self.run, call_id=call_id,
                                              result_hash=result_hash, now=self.now)
            uow.commit()
            return result

    def count(self, name):
        with self.db.unit_of_work() as uow:
            return uow.fetch_one(f'SELECT {name} AS value FROM agent_runs WHERE id=%s', (self.run['id'],))['value']

    def test_call_reservation_is_idempotent_and_conflicts_cannot_consume_more_budget(self):
        call, created = self.reserve()
        self.assertTrue(created)
        duplicate, created = self.reserve()
        self.assertFalse(created)
        self.assertEqual(duplicate['call_id'], call['call_id'])
        for kwargs in [dict(argument_hash='f' * 64), dict(tool_id='blog.search_public')]:
            with self.assertRaises(LedgerError) as caught:
                self.reserve(**kwargs)
            self.assertEqual(caught.exception.code, 'AGENT_CALL_CONFLICT')
        with self.db.unit_of_work() as uow, self.assertRaises(LedgerError) as caught:
            self.journal.reserve_tool(uow, self.run, call_id='call-1', tool_id='blog.read_public',
                                      tool_version='2', argument_hash='d' * 64, now=self.now)
        self.assertEqual(caught.exception.code, 'AGENT_CALL_CONFLICT')
        self.assertEqual(self.count('tool_count'), 1)
        self.assertEqual(self.db.count('agent_tool_calls'), 1)

    def test_failed_calls_keep_reservations_and_four_tool_cap_is_atomic(self):
        for index in range(4):
            call_id = f'call-{index}'
            self.reserve(call_id)
            with self.db.unit_of_work() as uow:
                self.assertTrue(self.journal.fail_tool(uow, self.run, call_id, self.now))
                self.assertFalse(self.journal.fail_tool(uow, self.run, call_id, self.now))
                uow.commit()
        with self.assertRaises(LedgerError) as caught:
            self.reserve('fifth')
        self.assertEqual(caught.exception.code, 'AGENT_BUDGET_EXCEEDED')
        self.assertEqual(self.count('tool_count'), 4)
        with self.db.unit_of_work() as uow:
            failures = uow.fetch_all('SELECT state,error_code FROM agent_tool_calls')
        self.assertTrue(all(row == {'state': 'failed', 'error_code': 'AGENT_TOOL_FAILED'} for row in failures))
        duplicate, created = self.reserve('call-0')
        self.assertFalse(created)
        self.assertEqual(duplicate['state'], 'failed')

    def test_response_budget_exact_boundary_and_negative_boolean_values_cannot_bypass(self):
        self.reserve('search', 'blog.search_public')
        self.assertIsNone(self.prepare('search', 65_536))
        self.assertEqual(self.count('result_bytes'), 65_536)
        self.reserve('next', 'blog.search_public')
        with self.assertRaises(LedgerError) as caught:
            self.prepare('next', 1)
        self.assertEqual(caught.exception.code, 'AGENT_BUDGET_EXCEEDED')
        for size in (-1, True, 1.1, 65_537):
            with self.subTest(size=size), self.assertRaises(LedgerError):
                self.prepare('next', size)
        self.assertEqual(self.count('result_bytes'), 65_536)
        with self.db.unit_of_work() as uow:
            self.assertEqual(uow.fetch_one('SELECT state FROM agent_tool_calls WHERE call_id=%s', ('next',))['state'], 'reserved')

    def test_prepared_source_is_not_delivered_until_matching_idempotent_receipt(self):
        self.reserve()
        source_id = self.prepare(source=self.source)
        with self.db.unit_of_work() as uow:
            with self.assertRaises(LedgerError):
                self.journal.delivered_sources(uow, self.run, [source_id])
        with self.assertRaises(LedgerError) as caught:
            self.ack(result_hash='f' * 64)
        self.assertEqual(caught.exception.code, 'AGENT_RECEIPT_INVALID')
        self.assertTrue(self.ack())
        self.assertTrue(self.ack())
        with self.db.unit_of_work() as uow:
            sources = self.journal.delivered_sources(uow, self.run, [source_id])
            self.assertEqual(sources[0]['article_id'], 1)
            self.assertEqual(sources[0]['delivered'], 1)
            self.assertEqual(sources[0]['delivered_at'], self.now)
            call = uow.fetch_one('SELECT * FROM agent_tool_calls WHERE call_id=%s', ('call-1',))
            self.assertEqual(call['state'], 'delivered')
            self.assertEqual(call['result_bytes'], 123)
        self.assertEqual(self.count('result_bytes'), 123)

    def test_search_results_never_become_source_and_read_requires_strict_metadata(self):
        self.reserve('search', 'blog.search_public')
        with self.assertRaises(LedgerError):
            self.prepare('search', source=self.source)
        self.prepare('search', source=None)
        self.ack('search')
        self.assertEqual(self.db.count('agent_sources'), 0)
        self.reserve('read')
        for source in [None, {**self.source, 'body': 'do not persist'}, {**self.source, 'article_id': True},
                       {**self.source, 'title': 'x' * 513}, {**self.source, 'content_hash': 'bad'}]:
            with self.subTest(source=source), self.assertRaises(LedgerError):
                self.prepare('read', source=source)
        self.assertEqual(self.count('result_bytes'), 123)
        self.assertEqual(self.db.count('agent_sources'), 0)
        forbidden = {'result', 'arguments', 'payload', 'body', 'content', 'question', 'prompt', 'token', 'credentials'}
        for table in ('agent_tool_calls', 'agent_sources'):
            self.assertTrue(forbidden.isdisjoint(column['name'] for column in MYSQL_SCHEMA[table]['columns']))

    def test_delivered_sources_enforce_scope_generation_order_and_no_duplicates(self):
        ids = []
        for index in range(2):
            call_id = f'call-{index}'
            self.reserve(call_id)
            ids.append(self.prepare(call_id, source={**self.source, 'article_id': index + 1}))
            self.ack(call_id)
        other = self.new_run()
        with self.db.unit_of_work() as uow:
            result = self.journal.delivered_sources(uow, self.run, list(reversed(ids)))
            self.assertEqual([row['article_id'] for row in result], [2, 1])
            for wrong_ids in ([ids[0], ids[0]], [str(uuid4())], [True], ids * 3):
                with self.subTest(ids=wrong_ids), self.assertRaises(LedgerError):
                    self.journal.delivered_sources(uow, self.run, wrong_ids)
            with self.assertRaises(LedgerError):
                self.journal.delivered_sources(uow, other, ids)
            with self.assertRaises(LedgerError):
                self.journal.delivered_sources(uow, {**self.run, 'generation': 2}, ids)
        for value in (0, 2, True):
            with self.db.unit_of_work() as uow, self.assertRaises(LedgerError):
                self.journal.reserve_model(uow, {**self.run, 'generation': value})

    def test_four_model_reservations_do_not_refund_on_caller_failure(self):
        for _ in range(4):
            with self.db.unit_of_work() as uow:
                self.assertTrue(self.journal.reserve_model(uow, self.run))
                uow.commit()
        with self.db.unit_of_work() as uow, self.assertRaises(LedgerError):
            self.journal.reserve_model(uow, self.run)
        self.assertEqual(self.count('model_count'), 4)

    def test_outer_transaction_failure_rolls_back_budget_preparation_and_receipt_together(self):
        with self.assertRaises(RuntimeError):
            with self.db.unit_of_work() as uow:
                self.journal.reserve_tool(uow, self.run, call_id='rolled-back', tool_id='blog.read_public',
                                          tool_version='1', argument_hash='d' * 64, now=self.now)
                source_id = self.journal.prepare(uow, self.run, call_id='rolled-back', result_hash='e' * 64,
                                                result_bytes=123, source=self.source, now=self.now)
                self.journal.acknowledge(uow, self.run, call_id='rolled-back', result_hash='e' * 64, now=self.now)
                self.assertEqual(len(self.journal.delivered_sources(uow, self.run, [source_id])), 1)
                raise RuntimeError('synthetic completion failure')
        self.assertEqual(self.db.count('agent_tool_calls'), 0)
        self.assertEqual(self.db.count('agent_sources'), 0)
        self.assertEqual(self.count('tool_count'), 0)
        self.assertEqual(self.count('result_bytes'), 0)

    def test_invalid_inputs_cannot_create_calls_or_override_reserved_state(self):
        for kwargs in [dict(call_id=''), dict(call_id='x' * 129), dict(call_id='bad\nline'),
                       dict(tool_id='blog.publish'), dict(tool_id=[]), dict(tool_version='2'),
                       dict(argument_hash='wrong'), dict(now=None)]:
            arguments = dict(call_id='valid', tool_id='blog.read_public', tool_version='1',
                             argument_hash='d' * 64, now=self.now)
            arguments.update(kwargs)
            with self.subTest(kwargs=kwargs), self.db.unit_of_work() as uow, self.assertRaises(LedgerError):
                self.journal.reserve_tool(uow, self.run, **arguments)
        self.assertEqual(self.db.count('agent_tool_calls'), 0)
        self.assertEqual(self.count('tool_count'), 0)
        self.reserve()
        self.prepare(source=self.source)
        with self.assertRaises(LedgerError):
            self.prepare(source=self.source)
        with self.db.unit_of_work() as uow:
            self.assertFalse(self.journal.fail_tool(uow, self.run, 'call-1', self.now))
            uow.commit()
        self.assertEqual(self.count('result_bytes'), 123)

    def test_concurrent_same_call_reserves_once_and_model_budget_stays_bounded(self):
        def reserve_call(_index):
            return self.reserve()[1]
        with ThreadPoolExecutor(max_workers=4) as pool:
            created = list(pool.map(reserve_call, range(4)))
        self.assertEqual(created.count(True), 1)
        self.assertEqual(self.count('tool_count'), 1)
        self.assertEqual(self.db.count('agent_tool_calls'), 1)
        def reserve_model(_index):
            try:
                with self.db.unit_of_work() as uow:
                    self.journal.reserve_model(uow, self.run)
                    uow.commit()
                return True
            except LedgerError as error:
                self.assertEqual(error.code, 'AGENT_BUDGET_EXCEEDED')
                return False
        with ThreadPoolExecutor(max_workers=4) as pool:
            admitted = list(pool.map(reserve_model, range(8)))
        self.assertEqual(admitted.count(True), 4)
        self.assertEqual(self.count('model_count'), 4)

    def test_negative_stored_counters_cannot_bypass_caps(self):
        for field in ('tool_count', 'model_count', 'result_bytes'):
            with self.db.unit_of_work() as uow:
                uow.execute(f'UPDATE agent_runs SET {field}=-1 WHERE id=%s', (self.run['id'],))
                uow.commit()
            if field == 'tool_count':
                operation = lambda: self.reserve('negative')
            elif field == 'model_count':
                def operation():
                    with self.db.unit_of_work() as uow:
                        self.journal.reserve_model(uow, self.run)
            else:
                # Reset tool_count before the legitimate call reservation.
                with self.db.unit_of_work() as uow:
                    uow.execute('UPDATE agent_runs SET tool_count=0 WHERE id=%s', (self.run['id'],))
                    uow.commit()
                self.reserve('negative-result', 'blog.search_public')
                operation = lambda: self.prepare('negative-result', size=1)
            with self.subTest(field=field), self.assertRaises(LedgerError) as caught:
                operation()
            self.assertEqual(caught.exception.code, 'AGENT_BUDGET_EXCEEDED')

    def test_preallocated_source_id_is_validated_and_duplicate_cannot_overwrite(self):
        self.reserve('first')
        chosen = str(uuid4())
        with self.db.unit_of_work() as uow:
            returned = self.journal.prepare(uow, self.run, call_id='first', result_hash='e' * 64,
                                           result_bytes=123, source=self.source, source_id=chosen, now=self.now)
            self.assertEqual(returned, chosen)
            uow.commit()
        self.reserve('second')
        for invalid in ('invalid', chosen.upper(), True):
            with self.subTest(invalid=invalid), self.db.unit_of_work() as uow, self.assertRaises(LedgerError):
                self.journal.prepare(uow, self.run, call_id='second', result_hash='e' * 64,
                                     result_bytes=123, source=self.source, source_id=invalid, now=self.now)
        with self.assertRaises(sqlite3.IntegrityError):
            with self.db.unit_of_work() as uow:
                self.journal.prepare(uow, self.run, call_id='second', result_hash='e' * 64,
                                     result_bytes=123, source=self.source, source_id=chosen, now=self.now)
                uow.commit()
        self.assertEqual(self.db.count('agent_sources'), 1)
        self.assertEqual(self.count('result_bytes'), 123)
        self.reserve('search', 'blog.search_public')
        with self.db.unit_of_work() as uow, self.assertRaises(LedgerError):
            self.journal.prepare(uow, self.run, call_id='search', result_hash='e' * 64,
                                 result_bytes=1, source=None, source_id=str(uuid4()), now=self.now)

    def test_completed_run_can_revalidate_delivered_sources_but_cannot_write(self):
        self.reserve()
        source_id = self.prepare(source=self.source)
        self.ack()
        completed = {**self.run, 'status': 'completed'}
        with self.db.unit_of_work() as uow:
            self.assertEqual(self.journal.delivered_sources(uow, completed, [source_id])[0]['source_id'], source_id)
            with self.assertRaises(LedgerError):
                self.journal.reserve_model(uow, completed)
            with self.assertRaises(LedgerError):
                self.journal.acknowledge(uow, completed, call_id='call-1', result_hash='e' * 64, now=self.now)
