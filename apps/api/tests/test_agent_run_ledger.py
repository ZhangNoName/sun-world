import json
import sqlite3
import sys
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'apps/api'))

# This is a real rollback/concurrency adapter, not MySQL lock conformance.
# BEGIN IMMEDIATE serializes writers more strongly than InnoDB row locks.
class SqliteUow:
    def __init__(self, database, isolation_level=None):
        self.database = database
        self.isolation_level = isolation_level

    def __enter__(self):
        self.connection = sqlite3.connect(self.database.path, timeout=10, detect_types=sqlite3.PARSE_DECLTYPES)
        self.connection.row_factory = sqlite3.Row
        self.connection.execute('BEGIN IMMEDIATE')
        return self

    def query(self, sql, params=()):
        if self.database.fail_completion and sql.startswith("UPDATE agent_runs SET status='completed'"):
            raise RuntimeError('synthetic commit failure')
        return self.connection.execute(sql.replace('%s', '?').replace(' FOR UPDATE', '')
                                       .replace(' AS BINARY)', ' AS BLOB)')
                                       .replace('CURRENT_TIMESTAMP(6)', 'CURRENT_TIMESTAMP'), params)

    def fetch_one(self, sql, params=()):
        row = self.query(sql, params).fetchone()
        return dict(row) if row else None

    def fetch_all(self, sql, params=()):
        return [dict(row) for row in self.query(sql, params).fetchall()]

    def execute(self, sql, params=()):
        return self.query(sql, params).rowcount

    def commit(self):
        self.connection.commit()

    def __exit__(self, *_args):
        self.connection.rollback()
        self.connection.close()


class Database:
    def __init__(self, path):
        self.path = path
        self.fail_completion = False
        from src.database.mysql.schema_migration import MYSQL_SCHEMA
        # Translate only column types, retaining actual production column names.
        columns = ','.join(f"{c['name']} {'TIMESTAMP' if c['type'] == 'datetime' else 'INTEGER' if c['type'] == 'int' else 'TEXT'}"
                           for c in MYSQL_SCHEMA['agent_runs']['columns'])
        with sqlite3.connect(path) as db:
            db.executescript('''
                CREATE TABLE users(id INTEGER PRIMARY KEY,status INTEGER);
                INSERT INTO users VALUES(1,1),(2,1),(3,0);
                CREATE TABLE ai_conversations(id TEXT PRIMARY KEY,user_id INTEGER,title TEXT,
                    is_deleted INTEGER DEFAULT 0,created_at TIMESTAMP,updated_at TIMESTAMP);
                CREATE TABLE ai_messages(id TEXT PRIMARY KEY,conversation_id TEXT,role TEXT,blocks TEXT,
                    sequence INTEGER,status TEXT,created_at TIMESTAMP,updated_at TIMESTAMP,
                    UNIQUE(conversation_id,sequence));
                CREATE TABLE ai_message_feedback(message_id TEXT,user_id INTEGER,value TEXT,
                    created_at TIMESTAMP,updated_at TIMESTAMP,PRIMARY KEY(message_id,user_id));
            ''')
            db.execute(f'CREATE TABLE agent_runs({columns},PRIMARY KEY(id),'
                       'UNIQUE(user_id,scenario,idempotency_key),UNIQUE(conversation_id))')

    def unit_of_work(self, *, isolation_level=None):
        return SqliteUow(self, isolation_level)

    def count(self, table):
        with sqlite3.connect(self.path) as db:
            return db.execute(f'SELECT COUNT(*) FROM {table}').fetchone()[0]


class AgentRunLedgerTests(unittest.TestCase):
    def test_request_preflight_is_read_only_and_conflicts_preserve_family_privacy(self):
        from dataclasses import replace
        from src.modules.agent_runtime.ledger import LedgerError
        self.assertIsNone(self.ledger.find_request(self.owner, question='具体问题', idempotency_key=self.key))
        self.assertEqual(self.db.count('agent_runs'), 0)
        row = self.accept().run
        self.assertEqual(self.ledger.find_request(self.owner, question=' 具体问题 ', idempotency_key=self.key)['id'], row['id'])
        for owner, question, code in [(self.owner, 'changed', 'AGENT_IDEMPOTENCY_CONFLICT'),
                (replace(self.owner, session_family='other'), 'changed', 'AGENT_RUN_NOT_FOUND')]:
            with self.assertRaises(LedgerError) as caught:
                self.ledger.find_request(owner, question=question, idempotency_key=self.key)
            self.assertEqual(caught.exception.code, code)
        self.assertEqual(self.db.count('ai_messages'), 1)

    def test_admission_failure_cannot_rewrite_running_or_terminal_run(self):
        from src.modules.agent_runtime.ledger import LedgerError
        row = self.accept().run
        with self.assertRaises(LedgerError):
            self.ledger.fail_accepted(row['id'], code='private diagnostic')
        self.assertEqual(self.ledger.fail_accepted(row['id'], code='AGENT_ADMISSION_UNAVAILABLE'), 'failed')
        self.assertEqual(self.ledger.fail_accepted(row['id'], code='AGENT_DISABLED'), 'failed')
        self.assertEqual(self.ledger.get_owned(self.owner, row['id'])['error_code'], 'AGENT_ADMISSION_UNAVAILABLE')
        self.key = str(uuid4())
        running = self.running()
        self.assertEqual(self.ledger.fail_accepted(running['id'], code='AGENT_DISABLED'), 'running')
        self.assertIsNone(self.ledger.get_owned(self.owner, running['id'])['error_code'])

    def setUp(self):
        from src.core.auth import Principal
        from src.modules.agent_runtime.ledger import MySqlRunLedger
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.db = Database(str(Path(self.temp.name) / 'ledger.sqlite'))
        self.time = datetime(2026, 11, 15, 1, tzinfo=timezone.utc)
        self.ledger = MySqlRunLedger(self.db, clock=lambda: self.time)
        self.owner = Principal(kind='user', user_id=1, session_family='synthetic-family')
        self.other = Principal(kind='user', user_id=2, session_family='synthetic-family')
        self.key = str(uuid4())

    def accept(self, **kwargs):
        return self.ledger.accept(kwargs.pop('principal', self.owner), question=kwargs.pop('question', '具体问题'),
            idempotency_key=kwargs.pop('key', self.key), bundle_hash='a'*64, model_id='synthetic-model', **kwargs)

    def running(self):
        row = self.accept().run
        self.execution = str(uuid4())
        claimed = self.ledger.claim(row['id'], execution_id=self.execution)
        self.ledger.bind_root_turn(row['id'], execution_id=self.execution, generation=1, root_turn_id='root-turn')
        return claimed

    def complete(self, row, **kwargs):
        from src.modules.ai.schemas import AiTextBlock
        text = kwargs.pop('text', '未找到相关公开文章。')
        return self.ledger.commit_answer(row['id'], execution_id=self.execution, generation=kwargs.pop('generation', 1),
            root_session_id=kwargs.pop('root_session_id', row['root_session_id']), root_turn_id='root-turn',
            prepare=lambda *_: [AiTextBlock(text=text, format='plain')], **kwargs)

    def test_accept_is_atomic_idempotent_and_owner_scoped(self):
        from src.modules.agent_runtime.ledger import LedgerError
        first = self.accept()
        second = self.accept(question=' 具体问题 ')
        self.assertTrue(first.created)
        self.assertFalse(second.created)
        self.assertEqual(first.run['id'], second.run['id'])
        self.assertEqual(self.db.count('ai_messages'), 1)
        self.assertNotEqual(first.run['session_family_hash'], self.owner.session_family)
        with self.assertRaises(LedgerError) as conflict:
            self.accept(question='不同问题')
        self.assertEqual(conflict.exception.code, 'AGENT_IDEMPOTENCY_CONFLICT')
        other = self.accept(principal=self.other)
        self.assertNotEqual(other.run['id'], first.run['id'])
        self.assertEqual(self.db.count('agent_runs'), 2)
        with self.assertRaises(LedgerError):
            self.ledger.get_owned(self.other, first.run['id'])

    def test_accept_rolls_back_transcript_if_run_insert_fails(self):
        original = SqliteUow.execute
        def fail(uow, sql, params=()):
            if sql.startswith('INSERT INTO agent_runs'):
                raise RuntimeError('synthetic insert failure')
            return original(uow, sql, params)
        with patch.object(SqliteUow, 'execute', fail), self.assertRaises(RuntimeError):
            self.accept()
        for table in ('agent_runs', 'ai_conversations', 'ai_messages'):
            self.assertEqual(self.db.count(table), 0)

    def test_concurrent_same_key_creates_one_run_and_one_message(self):
        with ThreadPoolExecutor(max_workers=2) as pool:
            outcomes = list(pool.map(lambda _: self.accept(), range(2)))
        self.assertEqual(sum(item.created for item in outcomes), 1)
        self.assertEqual(self.db.count('agent_runs'), 1)
        self.assertEqual(self.db.count('ai_messages'), 1)

    def test_claim_is_once_and_old_or_expired_execution_cannot_renew(self):
        from src.modules.agent_runtime.ledger import LedgerError
        row = self.running()
        self.assertIsNone(self.ledger.claim(row['id'], execution_id=str(uuid4())))
        with self.assertRaises(LedgerError):
            self.ledger.heartbeat(row['id'], execution_id=str(uuid4()), generation=1)
        self.time += timedelta(seconds=9)
        lease = self.ledger.heartbeat(row['id'], execution_id=self.execution, generation=1)
        self.assertEqual(lease, self.time.replace(tzinfo=None) + timedelta(seconds=10))
        self.time += timedelta(seconds=10)
        with self.assertRaises(LedgerError):
            self.ledger.heartbeat(row['id'], execution_id=self.execution, generation=1)

    def test_completion_is_one_transaction_and_duplicate_callback_is_idempotent(self):
        from src.modules.agent_runtime.ledger import LedgerError
        row = self.running()
        self.assertTrue(self.complete(row))
        self.assertFalse(self.complete(row))
        self.assertEqual(self.db.count('ai_messages'), 2)
        with self.assertRaises(LedgerError):
            self.complete(row, text='different')
        self.assertEqual(self.ledger.cancel(self.owner, row['id']), 'completed')

    def test_failed_completion_rolls_back_final_message_and_status(self):
        row = self.running()
        self.db.fail_completion = True
        with self.assertRaises(RuntimeError):
            self.complete(row)
        self.assertEqual(self.db.count('ai_messages'), 1)
        self.assertEqual(self.ledger.get_owned(self.owner, row['id'])['status'], 'running')
        self.db.fail_completion = False
        self.assertTrue(self.complete(row))

    def test_cancel_wins_and_late_success_cannot_add_message(self):
        from src.modules.agent_runtime.ledger import LedgerError
        row = self.running()
        self.assertEqual(self.ledger.cancel(self.owner, row['id']), 'cancelled')
        with self.assertRaises(LedgerError):
            self.complete(row)
        self.assertEqual(self.db.count('ai_messages'), 1)

    def test_cancel_completion_race_commits_only_one_terminal(self):
        from src.modules.agent_runtime.ledger import LedgerError
        row = self.running()
        def complete():
            try:
                return self.complete(row)
            except LedgerError:
                return False
        with ThreadPoolExecutor(max_workers=2) as pool:
            first = pool.submit(complete)
            second = pool.submit(self.ledger.cancel, self.owner, row['id'])
            first.result()
            second.result()
        status = self.ledger.get_owned(self.owner, row['id'])['status']
        self.assertIn(status, {'completed', 'cancelled'})
        self.assertEqual(self.db.count('ai_messages'), 2 if status == 'completed' else 1)

    def test_expired_accept_and_running_reconcile_without_replay(self):
        accepted = self.accept().run
        self.key = str(uuid4())
        running = self.running()
        self.time += timedelta(seconds=46)
        changed = self.ledger.reconcile()
        self.assertEqual(set(changed), {accepted['id'], running['id']})
        self.assertEqual(self.ledger.get_owned(self.owner, accepted['id'])['status'], 'failed')
        self.assertEqual(self.ledger.get_owned(self.owner, running['id'])['status'], 'interrupted')
        self.assertEqual(self.ledger.reconcile(), [])
        self.assertIsNone(self.ledger.claim(running['id'], execution_id=str(uuid4())))

    def test_root_binding_family_and_generation_are_not_replaceable(self):
        from src.core.auth import Principal
        from src.modules.agent_runtime.ledger import LedgerError
        row = self.running()
        with self.assertRaises(LedgerError):
            self.complete(row, generation=2)
        with self.assertRaises(LedgerError):
            self.complete(row, root_session_id='child-session')
        with self.assertRaises(LedgerError):
            self.ledger.bind_root_turn(row['id'], execution_id=self.execution, generation=1, root_turn_id='child-turn')
        new_family = Principal(kind='user', user_id=1, session_family='replacement')
        with self.assertRaises(LedgerError):
            self.ledger.cancel(new_family, row['id'])
        with self.assertRaises(LedgerError):
            self.accept(principal=new_family)

    def test_disabled_account_and_invalid_request_do_not_create_transcript(self):
        from src.core.auth import Principal
        from src.modules.agent_runtime.ledger import LedgerError
        for principal in [Principal(), Principal(kind='user', user_id=3, session_family='synthetic')]:
            with self.assertRaises(LedgerError):
                self.accept(principal=principal)
        with self.assertRaises(LedgerError):
            self.accept(question=' ')
        self.assertEqual(self.db.count('ai_conversations'), 0)

    def test_concurrent_claim_only_returns_one_execution(self):
        row = self.accept().run
        with ThreadPoolExecutor(max_workers=2) as pool:
            outcomes = list(pool.map(lambda _: self.ledger.claim(row['id'], execution_id=str(uuid4())), range(2)))
        self.assertEqual(sum(outcome is not None for outcome in outcomes), 1)

    def test_deadline_crossed_while_writing_answer_rolls_back_message(self):
        from src.modules.agent_runtime.ledger import LedgerError
        row = self.running()
        original = self.ledger.history.complete
        def delayed(*args, **kwargs):
            result = original(*args, **kwargs)
            self.time += timedelta(seconds=46)
            return result
        with patch.object(self.ledger.history, 'complete', delayed), self.assertRaises(LedgerError):
            self.complete(row)
        self.assertEqual(self.db.count('ai_messages'), 1)
        self.assertEqual(self.ledger.get_owned(self.owner, row['id'])['status'], 'running')

    def test_unknown_accept_commit_result_is_recovered_by_same_key_without_replay(self):
        original = SqliteUow.commit
        def commit_then_disconnect(uow):
            original(uow)
            raise ConnectionError('synthetic lost acknowledgement')
        with patch.object(SqliteUow, 'commit', commit_then_disconnect), self.assertRaises(ConnectionError):
            self.accept()
        recovered = self.accept()
        self.assertFalse(recovered.created)
        self.assertEqual(self.db.count('agent_runs'), 1)
        self.assertEqual(self.db.count('ai_messages'), 1)

    def test_unknown_completed_commit_result_is_idempotently_recoverable(self):
        row = self.running()
        original = SqliteUow.commit
        def commit_then_disconnect(uow):
            original(uow)
            raise ConnectionError('synthetic lost commit acknowledgement')
        with patch.object(SqliteUow, 'commit', commit_then_disconnect), self.assertRaises(ConnectionError):
            self.complete(row)
        self.assertFalse(self.complete(row))
        self.assertEqual(self.db.count('ai_messages'), 2)

    def test_internal_error_codes_are_registered(self):
        from src.core.error_codes import is_known_error_code, get_error_namespace
        for code in ['AGENT_STATE_CONFLICT', 'AGENT_RUN_INTERRUPTED', 'AGENT_EXECUTION_EXPIRED',
                     'AGENT_IDEMPOTENCY_CONFLICT', 'AGENT_RESULT_CONFLICT']:
            self.assertTrue(is_known_error_code(code))
            self.assertEqual(get_error_namespace(code), 'AGENT')

    def test_root_request_binding_is_immutable_and_required_for_final_replay(self):
        from src.modules.agent_runtime.ledger import LedgerError
        row = self.running()
        self.ledger.bind_root_turn(row['id'], execution_id=self.execution, generation=1,
                                  root_turn_id='root-turn', root_request_id='request-1')
        for request in (None, 'request-2', '', 'bad request', True):
            with self.subTest(request=request), self.assertRaises(LedgerError):
                self.ledger.bind_root_turn(row['id'], execution_id=self.execution, generation=1,
                                          root_turn_id='root-turn', root_request_id=request)
        self.assertEqual(self.ledger.get_owned(self.owner, row['id'])['root_request_id'], 'request-1')
        with self.assertRaises(LedgerError):
            self.complete(row)
        with self.assertRaises(LedgerError):
            self.complete(row, root_request_id='request-2')
        self.assertTrue(self.complete(row, root_request_id='request-1'))
        self.assertFalse(self.complete(row, root_request_id='request-1'))
        with self.assertRaises(LedgerError):
            self.complete(row, root_request_id='request-2')
        self.assertEqual(self.db.count('ai_messages'), 2)

    def test_internal_execution_termination_is_bound_fixed_and_terminal_immutable(self):
        from src.modules.agent_runtime.ledger import LedgerError
        row = self.running()
        for execution, generation, status in [(str(uuid4()), 1, 'interrupted'),
                                               (self.execution, 2, 'failed'),
                                               (self.execution, 1, 'completed'),
                                               (self.execution, 1, 'private diagnostic')]:
            with self.subTest(execution=execution, generation=generation, status=status), self.assertRaises(LedgerError):
                self.ledger.end_execution(row['id'], execution_id=execution, generation=generation, status=status)
        self.assertEqual(self.ledger.end_execution(row['id'], execution_id=self.execution,
                                                   generation=1, status='interrupted'), 'interrupted')
        self.assertEqual(self.ledger.end_execution(row['id'], execution_id=self.execution,
                                                   generation=1, status='failed'), 'interrupted')
        current = self.ledger.get_owned(self.owner, row['id'])
        self.assertEqual(current['error_code'], 'AGENT_RUN_INTERRUPTED')
        self.assertEqual(self.db.count('ai_messages'), 1)
