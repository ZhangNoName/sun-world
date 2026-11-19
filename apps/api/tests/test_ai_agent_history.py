import json
import re
import sqlite3
import sys
import unittest
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from src.modules.ai.agent_history import AgentHistoryTransactions
from src.modules.ai.errors import AiDomainError
from src.modules.ai.repositories import MySqlAiRepository
from src.modules.ai.schemas import AiLinkBlock, AiTextBlock


class SqliteHistoryDatabase:
    """Real transactions using the existing AI columns, without any Agent schema."""
    def __init__(self):
        self.connection = sqlite3.connect(':memory:', isolation_level=None)
        self.connection.row_factory = sqlite3.Row
        # Approximate the legacy MySQL accent-insensitive identifier equality.
        # This verifies application behavior, not MySQL's full collation rules.
        def unicode_ci(left, right):
            def normalize(value):
                return ''.join(char for char in unicodedata.normalize('NFKD', value)
                               if not unicodedata.combining(char)).casefold()
            first, second = normalize(left), normalize(right)
            return (first > second) - (first < second)
        self.connection.create_collation('NOCASE', unicode_ci)
        self.fail_on = None
        self.commits = 0
        self.connection.executescript('''
            CREATE TABLE ai_conversations(
              id TEXT PRIMARY KEY COLLATE NOCASE, user_id INTEGER NOT NULL, title TEXT NOT NULL,
              is_deleted INTEGER NOT NULL DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP,
              updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
            CREATE TABLE ai_messages(
              id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL COLLATE NOCASE, role TEXT NOT NULL,
              blocks TEXT NOT NULL, sequence INTEGER NOT NULL, status TEXT NOT NULL,
              parent_message_id TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP,
              updated_at TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(conversation_id,sequence));
            CREATE TABLE ai_message_feedback(message_id TEXT, user_id INTEGER, value TEXT,
              updated_at TEXT DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(message_id,user_id));
            CREATE TABLE test_run_journal(id INTEGER PRIMARY KEY);
        ''')

    def query(self, statement, parameters=()):
        if self.fail_on and self.fail_on in statement:
            raise sqlite3.OperationalError('synthetic storage failure')
        statement = statement.replace('%s', '?').replace(' FOR UPDATE', '').replace('CURRENT_TIMESTAMP(6)', 'CURRENT_TIMESTAMP')
        statement = statement.replace('UNIX_TIMESTAMP(', 'unixepoch(')
        statement = re.sub(r'LEFT\(([^,]+), 11\)', r'substr(\1, 1, 11)', statement)
        statement = statement.replace('ON DUPLICATE KEY UPDATE value = VALUES(value), updated_at = CURRENT_TIMESTAMP',
                                      'ON CONFLICT(message_id,user_id) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP')
        return self.connection.execute(statement, parameters)

    def execute(self, statement, parameters=()):
        return self.query(statement, parameters).rowcount

    def fetch_one(self, statement, parameters=()):
        row = self.query(statement, parameters).fetchone()
        return dict(row) if row else None

    def fetch_all(self, statement, parameters=()):
        return [dict(row) for row in self.query(statement, parameters).fetchall()]

    def unit_of_work(self):
        db = self
        class UnitOfWork:
            def __enter__(self):
                db.connection.execute('BEGIN IMMEDIATE')
                self.committed = False
                return self

            def __exit__(self, *_args):
                if not self.committed:
                    db.connection.rollback()

            def execute(self, *args):
                return db.execute(*args)

            def fetch_one(self, *args):
                return db.fetch_one(*args)

            def fetch_all(self, *args):
                return db.fetch_all(*args)

            def commit(self):
                db.connection.commit()
                db.commits += 1
                self.committed = True
        return UnitOfWork()


class AgentHistoryTransactionTests(unittest.TestCase):
    def test_recovery_reads_only_owned_canonical_plain_transcript_without_committing(self):
        self.create()
        with self.db.unit_of_work() as uow:
            first = self.history.read(uow, user_id=1, conversation_id=self.conversation_id, now=self.now)
            self.assertEqual(first[0]['blocks'][0].text, '测试问题')
            self.complete(uow)
            restored = self.history.read(uow, user_id=1, conversation_id=self.conversation_id, now=self.now)
            self.assertEqual(restored[1]['blocks'], self.blocks)
            self.assertEqual(self.db.commits, 1)
            for owner, key in [(2, self.conversation_id), (1, self.conversation_id.upper())]:
                with self.assertRaises(AiDomainError) as caught:
                    self.history.read(uow, user_id=owner, conversation_id=key, now=self.now)
                self.assertEqual(caught.exception.status_code, 404)

    def test_recovery_rejects_corrupt_status_shape_size_and_extra_messages(self):
        self.create()
        for blocks, status in [('[', 'completed'), ('[]', 'completed'),
                (json.dumps([{'type': 'text', 'text': 'x', 'format': 'markdown'}]), 'completed'),
                (' ' * 65537, 'completed'),
                (json.dumps([{'type': 'text', 'text': 'x', 'format': 'plain'}]), 'pending')]:
            with self.subTest(status=status, blocks=blocks[:20]), self.db.unit_of_work() as uow:
                uow.execute('UPDATE ai_messages SET blocks=%s,status=%s', (blocks, status))
                with self.assertRaises(AiDomainError):
                    self.history.read(uow, user_id=1, conversation_id=self.conversation_id, now=self.now)
        with self.db.unit_of_work() as uow:
            self.complete(uow)
            uow.execute("INSERT INTO ai_messages(id,conversation_id,role,blocks,sequence,status) VALUES('extra',%s,'assistant','[]',3,'completed')", (self.conversation_id,))
            with self.assertRaises(AiDomainError):
                self.history.read(uow, user_id=1, conversation_id=self.conversation_id, now=self.now)

    def setUp(self):
        self.db = SqliteHistoryDatabase()
        self.addCleanup(self.db.connection.close)
        self.history = AgentHistoryTransactions()
        self.conversation_id = 'agent_conv_' + uuid4().hex
        self.now = datetime(2026, 11, 15, 12, 0, 0)
        self.blocks = [AiTextBlock(text='可靠回答', format='plain'),
                       AiLinkBlock(label='原文', url='https://example.test/blog/1')]

    def create(self):
        with self.db.unit_of_work() as uow:
            result = self.history.create(uow, user_id=1, conversation_id=self.conversation_id,
                                         question='  测试问题  ', now=self.now)
            self.assertEqual(result, self.conversation_id)
            uow.commit()

    def complete(self, uow, **overrides):
        values = dict(user_id=1, conversation_id=self.conversation_id, blocks=self.blocks, now=self.now)
        values.update(overrides)
        return self.history.complete(uow, **values)

    def test_creates_question_and_completes_only_inside_callers_transaction(self):
        with self.db.unit_of_work() as uow:
            self.history.create(uow, user_id=1, conversation_id=self.conversation_id,
                                question='  测试问题  ', now=self.now)
            message_id = self.complete(uow)
            self.assertEqual(self.db.commits, 0)
            uow.execute('INSERT INTO test_run_journal(id) VALUES (1)')
            uow.commit()
        rows = self.db.fetch_all('SELECT * FROM ai_messages ORDER BY sequence')
        self.assertEqual([(row['role'], row['sequence']) for row in rows], [('user', 1), ('assistant', 2)])
        self.assertEqual(rows[1]['id'], message_id)
        self.assertEqual(json.loads(rows[0]['blocks'])[0], {'type': 'text', 'format': 'plain', 'text': '测试问题'})
        self.assertEqual(json.loads(rows[1]['blocks']), [block.model_dump() for block in self.blocks])
        self.assertEqual(self.db.fetch_one('SELECT title FROM ai_conversations')['title'], '测试问题')
        self.assertEqual(self.db.fetch_one('SELECT COUNT(*) AS n FROM test_run_journal')['n'], 1)

    def test_caller_failure_rolls_back_history_with_run_write(self):
        with self.assertRaises(RuntimeError):
            with self.db.unit_of_work() as uow:
                self.history.create(uow, user_id=1, conversation_id=self.conversation_id,
                                    question='问题', now=self.now)
                self.complete(uow)
                uow.execute('INSERT INTO test_run_journal(id) VALUES (1)')
                raise RuntimeError('synthetic run state failure')
        self.assertEqual(self.db.fetch_one('SELECT COUNT(*) AS n FROM ai_messages')['n'], 0)
        self.assertEqual(self.db.fetch_one('SELECT COUNT(*) AS n FROM ai_conversations')['n'], 0)
        self.assertEqual(self.db.fetch_one('SELECT COUNT(*) AS n FROM test_run_journal')['n'], 0)
        self.assertEqual(self.db.commits, 0)

    def test_completion_failure_retains_question_without_partial_answer(self):
        self.create()
        self.db.fail_on = 'UPDATE ai_conversations'
        with self.assertRaises(sqlite3.OperationalError):
            with self.db.unit_of_work() as uow:
                self.complete(uow)
                uow.commit()
        self.assertEqual(self.db.fetch_one('SELECT COUNT(*) AS n FROM ai_messages')['n'], 1)

    def test_wrong_owner_deleted_missing_or_wrong_namespace_are_indistinguishable(self):
        self.create()
        for overrides in [dict(user_id=2), dict(conversation_id='agent_conv_' + 'f' * 32),
                          dict(conversation_id='conv_ordinary'), dict(conversation_id=self.conversation_id.upper())]:
            with self.subTest(overrides=overrides), self.db.unit_of_work() as uow:
                with self.assertRaises(AiDomainError) as caught:
                    self.complete(uow, **overrides)
                self.assertEqual(caught.exception.status_code, 404)
        self.db.execute('UPDATE ai_conversations SET is_deleted=1')
        with self.db.unit_of_work() as uow:
            with self.assertRaises(AiDomainError) as caught:
                self.complete(uow)
            self.assertEqual(caught.exception.status_code, 404)
        self.assertEqual(self.db.fetch_one('SELECT COUNT(*) AS n FROM ai_messages')['n'], 1)

    def test_rejects_unsafe_blocks_and_second_final_answer(self):
        self.create()
        for blocks in [[], [AiTextBlock(text='Markdown')],
                       [{'type': 'record', 'record_type': 'bad', 'record_id': 'x', 'title': 'bad'}],
                       [{'type': 'link', 'label': 'bad', 'url': 'javascript:bad'}]]:
            with self.subTest(blocks=blocks), self.db.unit_of_work() as uow:
                with self.assertRaises(AiDomainError):
                    self.complete(uow, blocks=blocks)
        with self.db.unit_of_work() as uow:
            self.complete(uow)
            uow.commit()
        with self.db.unit_of_work() as uow:
            with self.assertRaises(AiDomainError) as caught:
                self.complete(uow)
            self.assertEqual(caught.exception.status_code, 409)
        self.assertEqual(self.db.fetch_one('SELECT COUNT(*) AS n FROM ai_messages')['n'], 2)

    def test_create_rejects_invalid_context_and_rolls_back_failed_question_insert(self):
        for values in [dict(user_id=True), dict(conversation_id='conv_plain'), dict(question=' '),
                       dict(now=datetime.now(timezone.utc))]:
            arguments = dict(user_id=1, conversation_id=self.conversation_id, question='question', now=self.now)
            arguments.update(values)
            with self.subTest(values=values), self.db.unit_of_work() as uow:
                with self.assertRaises(AiDomainError):
                    self.history.create(uow, **arguments)
        self.db.fail_on = 'INSERT INTO ai_messages'
        with self.assertRaises(sqlite3.OperationalError):
            with self.db.unit_of_work() as uow:
                self.history.create(uow, user_id=1, conversation_id=self.conversation_id,
                                    question='问题', now=self.now)
                uow.commit()
        self.assertEqual(self.db.fetch_one('SELECT COUNT(*) AS n FROM ai_conversations')['n'], 0)

    def test_ordinary_paths_cannot_read_edit_append_or_feedback_agent_history(self):
        self.create()
        with self.db.unit_of_work() as uow:
            message_id = self.complete(uow)
            uow.commit()
        repository = MySqlAiRepository(self.db)
        self.assertEqual(repository._list_conversations(1), [])
        for conversation_id in (self.conversation_id, self.conversation_id.upper()):
            with self.assertRaises(AiDomainError):
                repository._get_conversation(1, conversation_id)
            with self.assertRaises(AiDomainError):
                repository._append_message(1, conversation_id, 'user', [AiTextBlock(text='change')])
        for method, args in [(repository._get_message_conversation_id, (1, message_id)),
                             (repository._edit_message, (1, message_id, 'change')),
                             (repository._set_feedback, (1, message_id, 'like')),
                             (repository._set_feedback, (1, message_id, None))]:
            with self.assertRaises(AiDomainError):
                method(*args)
        self.assertIsNone(repository._get_feedback(1, message_id))
        self.assertEqual(self.db.fetch_one('SELECT COUNT(*) AS n FROM ai_messages')['n'], 2)
        self.assertEqual(self.db.fetch_one('SELECT COUNT(*) AS n FROM ai_message_feedback')['n'], 0)

    def test_accent_equivalent_alias_cannot_read_or_append_agent_transcript(self):
        self.create()
        repository = MySqlAiRepository(self.db)
        aliases = (self.conversation_id.replace('agent_', 'ágent_', 1),
                   self.conversation_id.replace('_conv_', '_cónv_', 1))
        for alias in aliases:
            with self.subTest(alias=alias):
                # Prove that the database comparison resolves the alias, so the
                # denial cannot pass merely because this test double misses it.
                matched = self.db.fetch_one('SELECT id FROM ai_conversations WHERE id=%s', (alias,))
                self.assertEqual(matched['id'], self.conversation_id)
                with self.assertRaises(AiDomainError) as read_error:
                    repository._get_conversation(1, alias)
                self.assertEqual(read_error.exception.status_code, 404)
                with self.assertRaises(AiDomainError) as write_error:
                    repository._append_message(1, alias, 'user', [AiTextBlock(text='attempted change')])
                self.assertEqual(write_error.exception.status_code, 404)
        self.assertEqual(self.db.fetch_one('SELECT COUNT(*) AS n FROM ai_messages')['n'], 1)

    def test_ordinary_legacy_schema_without_agent_tables_still_supports_chat(self):
        repository = MySqlAiRepository(self.db)
        conversation = repository._create_conversation(1, 'normal')
        message = repository._append_message(1, conversation.id, 'user', [AiTextBlock(text='normal')])
        self.db.execute("UPDATE ai_messages SET created_at = %s WHERE id = %s",
                        ('2026-11-18 11:03:00', message.id))
        saved = repository._get_conversation(1, conversation.id).messages[0]
        self.assertEqual(saved.id, message.id)
        self.assertEqual(saved.created_at, datetime(2026, 11, 18, 11, 3, tzinfo=timezone.utc))
        self.assertEqual(repository._get_message_conversation_id(1, message.id), conversation.id)
        repository._set_feedback(1, message.id, 'like')
        self.assertEqual(repository._get_feedback(1, message.id), 'like')
        self.assertEqual([item.id for item in repository._list_conversations(1)], [conversation.id])
