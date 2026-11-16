"""Explicit native suite: real mysqld SIGKILL, synthetic API/model inputs.

Only scripts/test-agent-mysql-recovery.py supplies the owned server controller.
The ordinary API unittest discovery never runs this destructive fixture suite.
"""

import asyncio
from datetime import timedelta
import threading
from unittest.mock import patch
from uuid import uuid4

import pymysql

from test_agent_mysql import AgentMySQLTests, SocketManager
from src.database.mysql.unit_of_work import MySQLUnitOfWork
from src.modules.agent_runtime.ledger import LedgerError
from src.modules.agent_runtime.model_budget import ModelJournal


class RecoveryTests(AgentMySQLTests):
    server = None

    def setUp(self):
        self.crashes_before = len(self.server.crashes)
        super().setUp()

    def tearDown(self):
        self.assertEqual(len(self.server.crashes), self.crashes_before + 1,
                         'Each fixed scenario must prove its own daemon crash')

    def fresh_connections(self):
        self.pool.close()
        self.admin = self.server.connect(autocommit=True)
        self.addCleanup(self.admin.close)
        self.pool = SocketManager(self.socket, self.database)
        self.addCleanup(self.pool.close)
        # Gateway adapters may reference the same ledger object; replace only
        # its manager. No writes are replayed by the reconnect operation.
        self.ledger.database = self.pool

    def drop_database(self):
        # Registered cleanup callbacks must not reuse a pre-crash socket or a
        # newer admin connection already closed by the LIFO cleanup stack.
        if not self.database.startswith('sunworld_agent_') or len(self.database) != 31:
            raise RuntimeError('Invalid disposable database name')
        with self.server.connect(autocommit=True) as connection:
            with connection.cursor() as cursor:
                cursor.execute(f'DROP DATABASE `{self.database}`')

    def crash(self):
        self.server.crash_restart()

    def commit_ack_loss(self, *, armed=lambda: True):
        """Real COMMIT succeeds; kill server, then inject a lost client ACK.

        This is a deterministic post-COMMIT injection, not a network fault or
        evidence of host power-loss durability. The daemon crash is real.
        """
        original = pymysql.connections.Connection.commit
        injected = []
        def commit(connection):
            original(connection)
            if armed() and not injected:
                injected.append(True)
                self.crash()
                raise pymysql.OperationalError(2013, 'Synthetic post-COMMIT acknowledgement loss')
        return patch.object(pymysql.connections.Connection, 'commit', commit), injected

    def test_recovery_uncommitted_admission_has_no_partial_history(self):
        invoked = []
        def before_commit(_uow):
            invoked.append(True)
            self.crash()
            raise pymysql.OperationalError(2013, 'Synthetic connection loss before COMMIT')
        with patch.object(MySQLUnitOfWork, 'commit', before_commit):
            with self.assertRaises(pymysql.Error):
                self.accept()
        self.assertEqual(len(invoked), 1)
        self.fresh_connections()
        for table in ('agent_runs', 'ai_conversations', 'ai_messages'):
            self.assertEqual(self.count(table), 0)

    def test_recovery_committed_admission_ack_loss_is_idempotent(self):
        key = str(uuid4())
        loss, injected = self.commit_ack_loss()
        with loss, self.assertRaises(pymysql.Error):
            self.accept(key)
        self.assertEqual(injected, [True])
        self.fresh_connections()
        result = self.accept(key)
        self.assertFalse(result.created)
        self.assertEqual(result.run['status'], 'accepted')
        for table in ('agent_runs', 'ai_conversations', 'ai_messages'):
            self.assertEqual(self.count(table), 1)

    def test_recovery_uncommitted_completion_rolls_back_answer_and_run(self):
        gateway, row, _tool, result = self.gateway()
        def before_commit(_uow):
            self.crash()
            raise pymysql.OperationalError(2013, 'Synthetic connection loss before COMMIT')
        with patch.object(MySQLUnitOfWork, 'commit', before_commit):
            with self.assertRaises(pymysql.Error):
                self.finish(gateway, row, result, [])
        self.fresh_connections()
        observed = self.ledger.get_owned(self.owner, row['id'])
        self.assertEqual((observed['status'], observed['result_hash']), ('running', None))
        self.assertEqual(self.count('ai_messages'), 1)
        self.time += timedelta(seconds=46)
        self.assertEqual(self.ledger.reconcile(), [row['id']])
        self.assertEqual(self.ledger.get_owned(self.owner, row['id'])['status'], 'interrupted')
        self.assertEqual(self.count('ai_messages'), 1)

    def test_recovery_committed_completion_ack_loss_has_one_answer(self):
        gateway, row, _tool, result = self.gateway()
        loss, injected = self.commit_ack_loss()
        with loss, self.assertRaises(pymysql.Error):
            self.finish(gateway, row, result, [])
        self.assertEqual(injected, [True])
        self.fresh_connections()
        observed = self.ledger.get_owned(self.owner, row['id'])
        self.assertEqual(observed['status'], 'completed')
        self.assertIsNotNone(observed['result_hash'])
        self.assertEqual(self.count('ai_messages'), 2)
        self.assertFalse(self.finish(gateway, row, result, []))
        self.assertEqual(self.count('ai_messages'), 2)
        self.time += timedelta(seconds=46)
        self.assertEqual(self.ledger.reconcile(), [])

    def model_crash_at(self, method):
        from test_counted_model_budget import messages
        gateway, row, call, factory = self.counted_gateway()
        stage = threading.local()
        original = getattr(ModelJournal, method)
        def mark(journal, *args, **kwargs):
            value = original(journal, *args, **kwargs)
            stage.armed = True
            return value
        loss, injected = self.commit_ack_loss(armed=lambda: getattr(stage, 'armed', False))
        with patch.object(ModelJournal, method, mark), loss:
            with self.assertRaises(LedgerError):
                asyncio.run(gateway.model(call, messages()))
        self.assertEqual(injected, [True])
        self.fresh_connections()
        observed = self.ledger.get_owned(self.owner, row['id'])
        attempt = self.pool.fetch_one('SELECT * FROM agent_model_calls WHERE run_id=%s', (row['id'],))
        self.assertEqual(observed['model_count'], 1)
        self.assertEqual(observed['model_output_tokens_reserved'], 1024)
        self.assertEqual(observed['model_response_bytes_reserved'], 65536)
        self.assertEqual(self.count('agent_model_calls'), 1)
        before = (len(factory.count_requests), len(factory.generation_requests))
        self.time += timedelta(seconds=46)
        self.assertEqual(self.ledger.reconcile(), [row['id']])
        with self.assertRaises(LedgerError):
            asyncio.run(gateway.model(call, messages()))
        self.assertEqual(before, (len(factory.count_requests), len(factory.generation_requests)))
        self.assertIsNone(self.ledger.claim(row['id'], execution_id=str(uuid4())))
        after = self.ledger.get_owned(self.owner, row['id'])
        for field in ('model_count', 'model_input_tokens_reserved', 'model_output_tokens_reserved',
                      'model_response_bytes_reserved', 'model_input_tokens_observed'):
            self.assertEqual(after[field], observed[field])
        return observed, attempt, before

    def test_recovery_attempt_commit_crash_never_counts_or_generates(self):
        run, attempt, requests = self.model_crash_at('reserve')
        self.assertEqual(requests, (0, 0))
        self.assertEqual(run['model_input_tokens_reserved'], 0)
        self.assertEqual(attempt['state'], 'unknown')
        self.assertIsNone(attempt['reserved_input_tokens'])

    def test_recovery_input_commit_crash_never_generates_or_refunds(self):
        run, attempt, requests = self.model_crash_at('reserve_input')
        self.assertEqual(requests, (1, 0))
        self.assertEqual(run['model_input_tokens_reserved'], 16384)
        self.assertEqual(attempt['reserved_input_tokens'], 16384)
        self.assertEqual(attempt['state'], 'unknown')

    def test_recovery_observation_commit_crash_never_replays_provider(self):
        run, attempt, requests = self.model_crash_at('observe')
        self.assertEqual(requests, (1, 1))
        self.assertEqual((run['model_input_tokens_reserved'], run['model_input_tokens_observed']), (16384, 16384))
        self.assertEqual(attempt['state'], 'observed')
        self.assertEqual(run['model_usage_unknown_count'], 0)

    def test_recovery_new_authorizer_denies_and_expiry_never_reclaims(self):
        from src.core.auth import AuthorizationDenied
        from src.modules.agent_runtime.session_authorizer import RunSessionAuthorizer
        auth, tokens, authorizer, policy = self.real_session()
        gateway, row, _tool, _result = self.gateway(authorizer, allow=policy,
            bind=lambda accepted: authorizer.bind(accepted, tokens.access_token))
        accepted = self.accept().run
        self.crash()
        self.fresh_connections()
        restarted = RunSessionAuthorizer(auth)
        self.addCleanup(restarted.close)
        with self.ledger.unit_of_work() as uow, self.assertRaises(AuthorizationDenied):
            restarted(uow, row)
        self.time += timedelta(seconds=46)
        self.assertEqual(set(self.ledger.reconcile()), {row['id'], accepted['id']})
        self.assertEqual(self.ledger.get_owned(self.owner, row['id'])['status'], 'interrupted')
        self.assertEqual(self.ledger.get_owned(self.owner, accepted['id'])['status'], 'failed')
        for run_id in (row['id'], accepted['id']):
            self.assertIsNone(self.ledger.claim(run_id, execution_id=str(uuid4())))
        self.assertEqual(self.count('ai_messages'), 2)
