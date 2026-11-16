"""Real daemon crashes verify that capacity and run/history commit together."""

from unittest.mock import patch
from uuid import uuid4

import pymysql

from mysql_recovery import RecoveryTests
from src.database.mysql.unit_of_work import MySQLUnitOfWork


class CapacityRecoveryTests(RecoveryTests):
    def test_capacity_uncommitted_precharge_crash_leaves_no_counter_or_history(self):
        invoked = []
        def disconnected(_uow):
            invoked.append(True)
            self.crash()
            raise pymysql.OperationalError(2013, 'Synthetic connection loss before capacity COMMIT')
        with patch.object(MySQLUnitOfWork, 'commit', disconnected), self.assertRaises(pymysql.Error):
            self.accept()
        self.assertEqual(invoked, [True])
        self.fresh_connections()
        for table in ('agent_ledger_capacity', 'agent_runs', 'ai_conversations', 'ai_messages'):
            self.assertEqual(self.count(table), 0)
        self.ledger.ensure_capacity()
        self.assertEqual(self.count('agent_ledger_capacity'), 0)
        self.assertTrue(self.accept().created)
        self.assertEqual(self.pool.fetch_one('SELECT used_count FROM agent_ledger_capacity')['used_count'], 1)

    def test_capacity_committed_ack_loss_crash_keeps_one_counter_and_admission(self):
        key = str(uuid4())
        loss, injected = self.commit_ack_loss()
        with loss, self.assertRaises(pymysql.Error):
            self.accept(key)
        self.assertEqual(injected, [True])
        self.fresh_connections()
        self.assertFalse(self.accept(key).created)
        self.assertEqual(self.pool.fetch_one('SELECT * FROM agent_ledger_capacity'),
            {'id': 1, 'format_version': 1, 'capacity': 8192, 'used_count': 1, 'initialized': 1})
        for table in ('agent_runs', 'ai_conversations', 'ai_messages'):
            self.assertEqual(self.count(table), 1)
