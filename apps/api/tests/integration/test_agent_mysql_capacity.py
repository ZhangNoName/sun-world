"""Owned InnoDB capacity/bootstrap; actual 8191/8193 synthetic identities."""

import contextlib
from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
import threading
import time
import unittest
from unittest.mock import patch
from uuid import uuid4

import pymysql

import test_agent_mysql as fixture
from src.modules.agent_runtime.capacity import LedgerCapacity
from src.modules.agent_runtime.ledger import LedgerError, MySqlRunLedger


class CapacityMySQLTests(fixture.AgentMySQLTests):
    def counter(self):
        return self.pool.fetch_one('SELECT * FROM agent_ledger_capacity WHERE id=1')

    def synthetic_retired_rows(self, total):
        prototype = self.accept().run
        row = {**prototype, 'status': 'failed', 'history_deleted_at': self.ledger.now(),
               'ended_at': self.ledger.now(), 'error_code': 'AGENT_ACCEPT_EXPIRED'}
        columns = list(row)
        sql = 'INSERT INTO agent_runs (' + ','.join(columns) + ') VALUES (' + ','.join('%s' for _ in columns) + ')'
        # These are synthetic retained identities with no question/answer data,
        # not a production snapshot. Keep statement batches finite.
        with self.admin.cursor() as cursor:
            batch = []
            for _ in range(total - 1):
                row.update(id=str(uuid4()), idempotency_key=str(uuid4()),
                           conversation_id='agent_conv_' + uuid4().hex)
                batch.append(tuple(row[column] for column in columns))
                if len(batch) == 256:
                    cursor.executemany(sql, batch)
                    batch.clear()
            if batch:
                cursor.executemany(sql, batch)
        return prototype

    def second_owner(self):
        self.pool.execute("INSERT INTO users(id,name,email,password,status) VALUES"
                          "(2,'synthetic-two','two@example.invalid','synthetic-unused',1)")
        return replace(self.owner, user_id=2, session_family='synthetic-capacity-two')

    def accept_owner(self, owner):
        return self.ledger.accept(owner, question='capacity synthetic', idempotency_key=str(uuid4()),
                                  bundle_hash='a' * 64, model_id='synthetic')

    def test_capacity_last_slot_cross_owner_waits_and_never_refunds_deleted_identity(self):
        original = self.synthetic_retired_rows(8191)
        self.pool.execute('UPDATE agent_ledger_capacity SET used_count=8191,initialized=1 WHERE id=1')
        other = self.second_owner()
        entered, release, waiting = threading.Event(), threading.Event(), threading.Event()
        local, connection_ids = threading.local(), []
        reserve, unit_of_work = LedgerCapacity.reserve, self.pool.unit_of_work
        def paused(capacity, uow):
            value = reserve(capacity, uow)
            if not getattr(local, 'second', False):
                entered.set()
                if not release.wait(5):
                    raise RuntimeError('Synthetic capacity fence timed out')
            return value
        @contextlib.contextmanager
        def observed(*args, **kwargs):
            with unit_of_work(*args, **kwargs) as uow:
                if getattr(local, 'second', False):
                    connection_ids.append(uow.fetch_one('SELECT CONNECTION_ID() id')['id'])
                    waiting.set()
                yield uow
        def second():
            local.second = True
            return self.accept_owner(other)
        with patch.object(LedgerCapacity, 'reserve', paused), patch.object(self.pool, 'unit_of_work', observed):
            with ThreadPoolExecutor(max_workers=2) as executor:
                first = executor.submit(self.accept_owner, self.owner)
                loser = None
                try:
                    self.assertTrue(entered.wait(2))
                    loser = executor.submit(second)
                    self.assertTrue(waiting.wait(1))
                    deadline = time.monotonic() + 2
                    while True:
                        if loser.done():
                            loser.result()  # Surface a real SQL failure, not a fence timeout.
                            self.fail('Competing admission passed a held capacity lock')
                        with self.admin.cursor() as cursor:
                            cursor.execute('SELECT trx_state FROM information_schema.innodb_trx '
                                           'WHERE trx_mysql_thread_id=%s', (connection_ids[0],))
                            row = cursor.fetchone()
                        if row and row[0] == 'LOCK WAIT':
                            break
                        self.assertLess(time.monotonic(), deadline)
                        # Spaced samples avoid repeatedly observing the initial
                        # RUNNING snapshot; still require an actual LOCK WAIT.
                        time.sleep(.15)
                    self.assertFalse(loser.done())
                finally:
                    release.set()
                winner = first.result(timeout=3)
                with self.assertRaises(LedgerError) as error:
                    loser.result(timeout=3)
                self.assertEqual(error.exception.code, 'AGENT_LEDGER_FULL')
        self.assertTrue(winner.created)
        self.assertEqual(self.count('agent_runs'), 8192)
        self.assertEqual(self.counter()['used_count'], 8192)
        self.assertFalse(self.ledger.accept(self.owner, question='原始问题', idempotency_key=original['idempotency_key'],
            bundle_hash='a' * 64, model_id='synthetic').created)
        self.ledger.cancel(self.owner, winner.run['id'])
        self.assertTrue(self.ledger.erase_history(self.owner, winner.run['id']))
        self.assertEqual(self.counter()['used_count'], 8192)
        with self.assertRaises(LedgerError) as error:
            self.accept_owner(self.owner)
        self.assertEqual(error.exception.code, 'AGENT_LEDGER_FULL')
        self.assertEqual(self.count('agent_runs'), 8192)

    def test_capacity_legacy_bootstrap_is_read_only_then_serialized_across_instances(self):
        self.synthetic_retired_rows(3)
        self.pool.execute('DELETE FROM agent_ledger_capacity')  # Synthetic pre-feature metadata.
        self.ledger.ensure_capacity()
        self.assertEqual(self.count('agent_ledger_capacity'), 0)
        other = self.second_owner()
        second_ledger = MySqlRunLedger(self.pool, clock=lambda: self.time)
        barrier = threading.Barrier(2)
        def accept(pair):
            ledger, owner = pair
            barrier.wait(timeout=2)
            return ledger.accept(owner, question='bootstrap', idempotency_key=str(uuid4()),
                                  bundle_hash='a' * 64, model_id='synthetic')
        with ThreadPoolExecutor(max_workers=2) as executor:
            results = list(executor.map(accept, ((self.ledger, self.owner), (second_ledger, other))))
        self.assertTrue(all(result.created for result in results))
        self.assertEqual(self.counter(), {'id': 1, 'format_version': 1, 'capacity': 8192,
                                          'used_count': 5, 'initialized': 1})
        self.assertEqual(self.count('agent_runs'), 5)

    def test_capacity_overfull_legacy_is_preserved_and_rejected_without_initialization(self):
        self.synthetic_retired_rows(8193)
        self.pool.execute('DELETE FROM agent_ledger_capacity')
        for operation in (self.ledger.ensure_capacity, lambda: self.accept_owner(self.owner)):
            with self.assertRaises(LedgerError) as error:
                operation()
            self.assertEqual(error.exception.code, 'AGENT_LEDGER_FULL')
        self.assertEqual(self.count('agent_ledger_capacity'), 0)
        self.assertEqual(self.count('agent_runs'), 8193)

    def test_capacity_history_failure_rolls_back_and_commit_ack_loss_never_double_counts(self):
        history = self.ledger.history.create
        def failed(*args, **kwargs):
            history(*args, **kwargs)
            raise RuntimeError('Synthetic history failure after precharge')
        with patch.object(self.ledger.history, 'create', failed), self.assertRaises(RuntimeError):
            self.accept()
        for table in ('agent_ledger_capacity', 'agent_runs', 'ai_messages'):
            self.assertEqual(self.count(table), 0)
        key = str(uuid4())
        commit, injected = pymysql.connections.Connection.commit, []
        def lost(connection):
            commit(connection)
            if not injected:
                injected.append(True)
                raise pymysql.OperationalError(2013, 'Synthetic post-capacity-COMMIT ACK loss')
        with patch.object(pymysql.connections.Connection, 'commit', lost), self.assertRaises(pymysql.Error):
            self.accept(key)
        self.assertEqual(injected, [True])
        self.assertEqual(self.counter()['used_count'], 1)
        self.assertFalse(self.accept(key).created)
        self.assertEqual(self.counter()['used_count'], 1)
        self.assertEqual(self.count('agent_runs'), 1)
        self.assertEqual(self.count('ai_messages'), 1)


def load_tests(_loader, _tests, _pattern):
    return unittest.TestSuite(CapacityMySQLTests(name) for name in sorted(CapacityMySQLTests.__dict__)
                              if name.startswith('test_capacity_'))
