"""Actual owned mysqld downtime; keep the original manager and ledger alive."""

import asyncio
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
import threading
from unittest.mock import patch
from uuid import uuid4

import pymysql

from test_agent_mysql import AgentMySQLTests
from src.modules.agent_runtime.ledger import LedgerError
from src.modules.agent_runtime.model_budget import ModelJournal

EXPECTED_POOL_SCENARIOS = {
    'test_pool_repeated_outage_same_manager_and_concurrent_capacity': 2,
    'test_pool_uncommitted_admission_is_not_replayed_after_outage': 1,
    'test_pool_committed_ack_loss_preserves_one_admission': 1,
    'test_pool_input_commit_ack_loss_keeps_budget_without_generation': 1,
}


class PoolRecoveryTests(AgentMySQLTests):
    server = None

    def setUp(self):
        super().setUp()
        self.pool.retry_interval = 1
        self.pending_cut = False
        self.crashes_before = len(self.server.crashes)
        self.original_manager = self.pool

    def tearDown(self):
        if self.pending_cut:
            self.restart()
        self.assertEqual(len(self.server.crashes) - self.crashes_before,
                         EXPECTED_POOL_SCENARIOS[self._testMethodName])

    def drop_database(self):
        # The pre-crash admin socket remains registered for close, but cannot
        # perform cleanup after server restart. This new admin is not the pool.
        if not self.database.startswith('sunworld_agent_') or len(self.database) != 31:
            raise RuntimeError('Invalid disposable database name')
        with self.server.connect(autocommit=True) as connection:
            with connection.cursor() as cursor:
                cursor.execute(f'DROP DATABASE `{self.database}`')

    def cut(self):
        with self.server.interrupts.defer():
            self.assertFalse(self.pending_cut)
            process = self.server.process
            self.assertIsNone(process.poll())
            process.kill()
            self.assertEqual(process.wait(timeout=10), -9)
            self.pending_cut = True

    def drain_during_outage(self):
        for _ in range(self.pool.pool_size):
            with self.assertRaises((pymysql.Error, ConnectionError)):
                self.pool.fetch_one('SELECT 1 AS n')
        self.assertEqual(self.pool._pool.qsize(), self.pool.pool_size,
                         'Failed replacement must preserve every checkout slot')

    def restart(self):
        self.assertTrue(self.pending_cut)
        self.server.start()  # Verifies original UUID, datadir/socket and TCP off.
        self.pending_cut = False
        self.server.crashes.append({'signal': 'SIGKILL', 'exit_confirmed': True,
            'same_server_uuid': True, 'same_datadir': True, 'same_socket': True,
            'tcp_disabled': True, 'flush_log_at_trx_commit': 1})
        self.assertIs(self.pool, self.original_manager)
        self.assertIs(self.ledger.database, self.original_manager)

    def test_pool_repeated_outage_same_manager_and_concurrent_capacity(self):
        for _cycle in range(2):
            self.cut()
            self.drain_during_outage()
            self.restart()
            self.assertEqual(self.pool.fetch_one('SELECT @@server_uuid AS id')['id'], self.server.identity)
            with ThreadPoolExecutor(max_workers=8) as executor:
                rows = list(executor.map(lambda _:
                    self.pool.fetch_one('SELECT CONNECTION_ID() AS id,SLEEP(0.01) AS paused'), range(32)))
            self.assertEqual(len({row['id'] for row in rows}), self.pool.pool_size)
            self.assertEqual(len(self.pool._connections), self.pool.pool_size)
            self.assertEqual(self.pool._pool.qsize(), self.pool.pool_size)
            with self.pool.unit_of_work() as uow:
                uow.execute('UPDATE users SET status=0 WHERE id=1')
                # No commit: the recovered physical session still uses a UOW.
            self.assertEqual(self.pool.fetch_one('SELECT status FROM users WHERE id=1')['status'], 1)

    def test_pool_uncommitted_admission_is_not_replayed_after_outage(self):
        original = pymysql.connections.Connection.commit
        commits = []
        def disconnected(connection):
            commits.append(True)
            self.cut()
            return original(connection)
        with patch.object(pymysql.connections.Connection, 'commit', disconnected):
            with self.assertRaises(pymysql.Error):
                self.accept()
        self.assertEqual(commits, [True])
        self.drain_during_outage()
        self.restart()
        for table in ('agent_runs', 'ai_conversations', 'ai_messages'):
            self.assertEqual(self.count(table), 0)
        self.assertEqual(commits, [True])

    def test_pool_committed_ack_loss_preserves_one_admission(self):
        key = str(uuid4())
        original, commits = pymysql.connections.Connection.commit, []
        def lost(connection):
            original(connection)
            commits.append(True)
            self.cut()
            raise pymysql.OperationalError(2013, 'Synthetic post-COMMIT ACK loss')
        with patch.object(pymysql.connections.Connection, 'commit', lost):
            with self.assertRaises(pymysql.Error):
                self.accept(key)
        self.assertEqual(commits, [True])
        self.drain_during_outage()
        self.restart()
        accepted = self.accept(key)
        self.assertFalse(accepted.created)
        self.assertEqual(accepted.run['status'], 'accepted')
        for table in ('agent_runs', 'ai_conversations', 'ai_messages'):
            self.assertEqual(self.count(table), 1)
        self.assertEqual(commits, [True])

    def test_pool_input_commit_ack_loss_keeps_budget_without_generation(self):
        from test_counted_model_budget import messages
        gateway, row, call, factory = self.counted_gateway()
        stage, injected = threading.local(), []
        reserve, commit = ModelJournal.reserve_input, pymysql.connections.Connection.commit
        def mark(journal, *args, **kwargs):
            value = reserve(journal, *args, **kwargs)
            stage.input = True
            return value
        def lost(connection):
            commit(connection)
            if getattr(stage, 'input', False) and not injected:
                injected.append(True)
                self.cut()
                raise pymysql.OperationalError(2013, 'Synthetic post-input-COMMIT ACK loss')
        with patch.object(ModelJournal, 'reserve_input', mark), patch.object(pymysql.connections.Connection, 'commit', lost):
            with self.assertRaises(LedgerError):
                asyncio.run(gateway.model(call, messages()))
        self.assertEqual(injected, [True])
        self.assertEqual((len(factory.count_requests), len(factory.generation_requests)), (1, 0))
        self.drain_during_outage()
        self.restart()
        observed = self.ledger.get_owned(self.owner, row['id'])
        self.assertEqual((observed['model_count'], observed['model_input_tokens_reserved'],
                          observed['model_output_tokens_reserved']), (1, 16384, 1024))
        attempt = self.pool.fetch_one('SELECT state,reserved_input_tokens FROM agent_model_calls WHERE run_id=%s', (row['id'],))
        self.assertEqual(attempt, {'state': 'reserved', 'reserved_input_tokens': 16384})
        self.time += timedelta(seconds=46)
        self.assertEqual(self.ledger.reconcile(), [row['id']])
        self.assertEqual(self.ledger.get_owned(self.owner, row['id'])['status'], 'interrupted')
        with self.assertRaises(LedgerError):
            asyncio.run(gateway.model(call, messages()))
        self.assertEqual((len(factory.count_requests), len(factory.generation_requests)), (1, 0))
        self.assertEqual(self.ledger.get_owned(self.owner, row['id'])['model_input_tokens_reserved'], 16384)
