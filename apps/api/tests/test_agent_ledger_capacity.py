"""SQLite transaction evidence; does not prove InnoDB X-lock behavior."""

import sqlite3
import sys
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'apps/api'))
from test_agent_run_ledger import SqliteUow
from test_agent_tool_journal import JournalDatabase
from src.core.auth import Principal
from src.modules.agent_runtime.capacity import LedgerCapacity
from src.modules.agent_runtime.ledger import LedgerError, MySqlRunLedger


class CapacityUow(SqliteUow):
    def query(self, sql, params=()):
        if self.database.fail_sql and sql.startswith(self.database.fail_sql):
            raise sqlite3.OperationalError('synthetic capacity transaction failure')
        self.database.queries.append(sql)
        return super().query(sql, params)

    def commit(self):
        super().commit()
        if self.database.lose_ack:
            self.database.lose_ack = False
            raise ConnectionError('synthetic commit acknowledgement loss')


class CapacityDatabase(JournalDatabase):
    def __init__(self, path):
        super().__init__(path)
        self.fail_sql, self.lose_ack = None, False
        self.queries = []

    def unit_of_work(self, *, isolation_level=None):
        return CapacityUow(self, isolation_level)


class AgentLedgerCapacityTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.db = CapacityDatabase(str(Path(self.temp.name) / 'capacity.sqlite'))
        self.now = datetime(2026, 11, 16, 1, tzinfo=timezone.utc)
        self.ledger = self.new_ledger()
        self.owner = Principal(kind='user', user_id=1, session_family='synthetic-family')

    def new_ledger(self):
        return MySqlRunLedger(self.db, clock=lambda: self.now)

    def accept(self, *, principal=None, key=None, question='容量测试', ledger=None):
        return (ledger or self.ledger).accept(principal or self.owner, question=question,
            idempotency_key=key or str(uuid4()), bundle_hash='a'*64, model_id='synthetic')

    def counter(self):
        with self.db.unit_of_work() as uow:
            return uow.fetch_all('SELECT * FROM agent_ledger_capacity')

    def set_counter(self, used, **changes):
        row = dict(id=1, format_version=1, capacity=8192, used_count=used, initialized=1)
        row.update(changes)
        with self.db.unit_of_work() as uow:
            uow.execute('DELETE FROM agent_ledger_capacity')
            uow.execute('INSERT INTO agent_ledger_capacity(id,format_version,capacity,used_count,initialized) '
                        'VALUES(%s,%s,%s,%s,%s)', tuple(row.values()))
            uow.commit()

    def assert_code(self, code, operation):
        with self.assertRaises(LedgerError) as caught:
            operation()
        self.assertEqual(caught.exception.code, code)

    def seed_legacy(self, count):
        """Synthetic valid-shaped run clones, never a production snapshot."""
        sample = self.accept().run
        columns = list(sample)
        sql = 'INSERT INTO agent_runs (' + ','.join(columns) + ') VALUES (' + ','.join('?'*len(columns)) + ')'
        with sqlite3.connect(self.db.path) as connection:
            connection.execute('DELETE FROM agent_ledger_capacity')
            rows = []
            for index in range(count - 1):
                row = {**sample, 'id': str(uuid4()), 'idempotency_key': str(uuid4()),
                       'conversation_id': 'agent_conv_' + uuid4().hex,
                       'app_id': 'synthetic-other-app', 'scenario': 'synthetic-other-scenario',
                       'history_deleted_at': self.now.replace(tzinfo=None) if index % 2 == 0 else None}
                rows.append(tuple(row[column] for column in columns))
            connection.executemany(sql, rows)
        return sample

    def test_empty_read_only_precheck_does_not_initialize_or_consume(self):
        self.assertIsNone(self.ledger.ensure_capacity())
        self.assertEqual(self.counter(), [])
        self.assertEqual(self.db.count('agent_runs'), 0)
        self.assertTrue(all(sql.startswith('SELECT ') for sql in self.db.queries))
        self.accept()
        self.assertEqual(self.counter(), [dict(id=1, format_version=1, capacity=8192,
                                              used_count=1, initialized=1)])
        self.ledger.ensure_capacity()
        self.assertEqual(self.counter()[0]['used_count'], 1)

    def test_bootstrap_counts_all_profiles_and_deleted_identities_at_last_position(self):
        self.seed_legacy(8191)
        self.ledger.ensure_capacity()
        self.assertEqual(self.counter(), [])
        self.accept()
        self.assertEqual(self.counter()[0]['used_count'], 8192)
        self.assertEqual(self.db.count('agent_runs'), 8192)
        self.assert_code('AGENT_LEDGER_FULL', self.ledger.ensure_capacity)
        self.assert_code('AGENT_LEDGER_FULL', self.accept)
        self.assertEqual(self.db.count('agent_runs'), 8192)

    def test_overfull_legacy_is_bounded_and_never_pruned_or_initialized_as_empty(self):
        self.seed_legacy(8194)
        for operation in (self.ledger.ensure_capacity, self.accept):
            self.assert_code('AGENT_LEDGER_FULL', operation)
        self.assertEqual(self.counter(), [])
        self.assertEqual(self.db.count('agent_runs'), 8194)
        self.assertEqual(self.db.count('ai_messages'), 1)
        scans = [sql for sql in self.db.queries if sql.startswith('SELECT id FROM agent_runs')]
        self.assertTrue(scans)
        self.assertTrue(all(sql.endswith('LIMIT 8193') for sql in scans))

    def test_existing_uninitialized_counter_bootstraps_and_initialized_count_never_decreases(self):
        self.seed_legacy(3)
        self.set_counter(0, initialized=0)
        self.ledger.ensure_capacity()
        self.assertEqual(self.counter()[0]['initialized'], 0)
        self.accept()
        self.assertEqual(self.counter()[0]['used_count'], 4)
        self.set_counter(8191)
        self.accept()
        self.assertEqual(self.counter()[0]['used_count'], 8192)
        self.assertEqual(self.db.count('agent_runs'), 5)

    def test_counter_missing_after_existing_runs_is_rebuilt_without_double_charging_old_key(self):
        key = str(uuid4())
        first = self.accept(key=key)
        with self.db.unit_of_work() as uow:
            uow.execute('DELETE FROM agent_ledger_capacity')
            uow.commit()
        self.assertFalse(self.accept(key=key).created)
        self.assertEqual(self.counter(), [])
        second = self.accept()
        self.assertNotEqual(first.run['id'], second.run['id'])
        self.assertEqual(self.counter()[0]['used_count'], 2)

    def test_two_users_across_instances_compete_for_one_remaining_position(self):
        self.set_counter(8191)
        second_owner = replace(self.owner, user_id=2)
        def compete(principal):
            try:
                return self.accept(principal=principal, ledger=self.new_ledger()).created
            except LedgerError as error:
                return error.code
        with ThreadPoolExecutor(max_workers=2) as pool:
            outcomes = list(pool.map(compete, (self.owner, second_owner)))
        self.assertCountEqual(outcomes, [True, 'AGENT_LEDGER_FULL'])
        self.assertEqual(self.counter()[0]['used_count'], 8192)
        self.assertEqual(self.db.count('agent_runs'), 1)
        self.assertEqual(self.db.count('ai_messages'), 1)

    def test_concurrent_empty_bootstrap_uses_one_shared_counter(self):
        def create(user_id):
            return self.accept(principal=replace(self.owner, user_id=user_id), ledger=self.new_ledger())
        with ThreadPoolExecutor(max_workers=2) as pool:
            outcomes = list(pool.map(create, (1, 2)))
        self.assertTrue(all(item.created for item in outcomes))
        self.assertEqual(self.counter()[0]['used_count'], 2)
        self.assertEqual(self.db.count('agent_runs'), 2)

    def test_reservation_history_and_run_insert_failures_rollback_together(self):
        for prefix in ('UPDATE agent_ledger_capacity', 'INSERT INTO ai_conversations',
                       'INSERT INTO ai_messages', 'INSERT INTO agent_runs'):
            with self.subTest(prefix=prefix):
                self.db.fail_sql = prefix
                with self.assertRaises(sqlite3.OperationalError):
                    self.accept()
                self.db.fail_sql = None
                self.assertEqual(self.counter(), [])
                self.assertEqual(self.db.count('agent_runs'), 0)
                self.assertEqual(self.db.count('ai_messages'), 0)
                self.assertEqual(self.db.count('ai_conversations'), 0)
        self.set_counter(8191)
        self.db.fail_sql = 'INSERT INTO agent_runs'
        with self.assertRaises(sqlite3.OperationalError):
            self.accept()
        self.db.fail_sql = None
        self.assertEqual(self.counter()[0]['used_count'], 8191)

    def test_commit_ack_loss_and_manager_reconstruction_do_not_reserve_again(self):
        self.set_counter(8191)
        key = str(uuid4())
        self.db.lose_ack = True
        with self.assertRaises(ConnectionError):
            self.accept(key=key)
        rebuilt = self.new_ledger()
        duplicate = self.accept(key=key, ledger=rebuilt)
        self.assertFalse(duplicate.created)
        self.assertEqual(rebuilt.find_request(self.owner, question='容量测试', idempotency_key=key)['id'],
                         duplicate.run['id'])
        self.assertEqual(self.counter()[0]['used_count'], 8192)
        self.assertEqual(self.db.count('ai_messages'), 1)
        self.assert_code('AGENT_LEDGER_FULL', rebuilt.ensure_capacity)

    def test_full_keeps_known_key_privacy_and_deleted_history_dedup_without_refund(self):
        key = str(uuid4())
        row = self.accept(key=key).run
        self.set_counter(8192)
        self.assertFalse(self.accept(key=key).created)
        self.assert_code('AGENT_IDEMPOTENCY_CONFLICT', lambda: self.accept(key=key, question='不同问题'))
        self.assert_code('AGENT_RUN_NOT_FOUND', lambda: self.accept(
            key=key, principal=replace(self.owner, session_family='other')))
        self.assertEqual(self.ledger.cancel(self.owner, row['id']), 'cancelled')
        self.assertTrue(self.ledger.erase_history(self.owner, row['id']))
        self.assertFalse(self.ledger.erase_history(self.owner, row['id']))
        self.assertEqual(self.ledger.get_owned(self.owner, row['id'])['status'], 'cancelled')
        self.assert_code('AGENT_HISTORY_DELETED', lambda: self.accept(key=key))
        self.assert_code('AGENT_HISTORY_DELETED', lambda: self.accept(key=key, question='不同问题'))
        self.assertEqual(self.counter()[0]['used_count'], 8192)

    def test_invalid_state_is_fixed_error_and_does_not_block_existing_owner_operations(self):
        key = str(uuid4())
        row = self.accept(key=key).run
        states = [dict(format_version=2), dict(capacity=8193), dict(used_count=-1),
                  dict(initialized=2), dict(initialized=0, used_count=1), dict(id=2),
                  dict(used_count=2**31)]
        for state in states:
            with self.subTest(state=state):
                self.set_counter(0, **state)
                before = self.counter()
                for operation in (self.ledger.ensure_capacity, self.accept):
                    self.assert_code('AGENT_LEDGER_CAPACITY_INVALID', operation)
                self.assertEqual(self.counter(), before)
                self.assertFalse(self.accept(key=key).created)
                self.assertEqual(self.ledger.get_owned(self.owner, row['id'])['id'], row['id'])
        self.assertEqual(self.ledger.cancel(self.owner, row['id']), 'cancelled')
        self.assertTrue(self.ledger.erase_history(self.owner, row['id']))

    def test_duplicate_singleton_and_null_fields_fail_closed(self):
        self.set_counter(0)
        with self.db.unit_of_work() as uow:
            uow.execute('INSERT INTO agent_ledger_capacity VALUES(2,1,8192,0,1)')
            uow.commit()
        self.assert_code('AGENT_LEDGER_CAPACITY_INVALID', self.ledger.ensure_capacity)
        self.assert_code('AGENT_LEDGER_CAPACITY_INVALID', self.accept)
        self.set_counter(0, initialized=None)
        self.assert_code('AGENT_LEDGER_CAPACITY_INVALID', self.accept)

    def test_used_above_capacity_is_full_and_is_never_lowered(self):
        self.set_counter(8193)
        for operation in (self.ledger.ensure_capacity, self.accept):
            self.assert_code('AGENT_LEDGER_FULL', operation)
        self.assertEqual(self.counter()[0]['used_count'], 8193)

    def test_driver_type_boundaries_reject_bool_float_and_string_before_any_counter_write(self):
        # SQLite INTEGER affinity coerces these values, so this one boundary
        # test injects driver row types. Transactional cases above use real SQL.
        self.set_counter(0)
        valid = self.counter()[0]
        for field in valid:
            for value in (True, 1.0, '1'):
                with self.subTest(field=field, value=value), self.db.unit_of_work() as uow:
                    original = uow.fetch_all
                    def driver_rows(sql, params=()):
                        if 'FROM agent_ledger_capacity' in sql:
                            return [{**valid, field: value}]
                        return original(sql, params)
                    with patch.object(uow, 'fetch_all', side_effect=driver_rows):
                        self.assert_code('AGENT_LEDGER_CAPACITY_INVALID', lambda: LedgerCapacity().check(uow))
        self.assertEqual(self.counter(), [valid])
