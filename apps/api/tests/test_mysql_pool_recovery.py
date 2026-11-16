"""Offline driver faults and real threads; no configured database is contacted."""

import sys
import threading
import time
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest.mock import patch

API_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(API_ROOT))
import pymysql
from src.database.mysql.mysql_manage import MySQLManager


def lost():
    return pymysql.err.OperationalError(2006, 'synthetic unavailable')


class Cursor:
    rowcount, lastrowid = 1, 7

    def __init__(self, connection):
        self.connection = connection
        self.calls = []

    def execute(self, sql, params=None):
        self.calls.append((sql, params))
        if self.connection.sql_error:
            raise self.connection.sql_error

    def fetchone(self):
        return {'id': 1}

    def fetchall(self):
        return [{'id': 1}]

    def close(self):
        pass


class Connection:
    def __init__(self):
        self.closed = False
        self.close_calls = self.commits = self.rollbacks = 0
        self.pings = []
        self.ping_error = self.sql_error = self.rollback_error = None
        self.commit_error = None
        self.cursor_obj = Cursor(self)

    def ping(self, *, reconnect):
        self.pings.append(reconnect)
        if self.ping_error:
            raise self.ping_error

    def cursor(self):
        return self.cursor_obj

    def rollback(self):
        self.rollbacks += 1
        if self.rollback_error:
            raise self.rollback_error

    def commit(self):
        self.commits += 1
        if self.commit_error:
            self.ping_error = lost()
            raise self.commit_error

    def close(self):
        self.closed = True
        self.close_calls += 1


class MySQLPoolRecoveryTests(unittest.TestCase):
    def manager(self, connections, *, size=1, attempts=1):
        factory = patch('pymysql.connect', side_effect=connections)
        mocked = factory.start()
        self.addCleanup(factory.stop)
        manager = MySQLManager('synthetic.invalid', 3306, 'synthetic', pool_size=size,
                               retry_interval=0, max_retry_times=attempts)
        self.addCleanup(manager.close)
        return manager, mocked

    def wait_for(self, predicate):
        deadline = time.monotonic() + 2
        while not predicate():
            if time.monotonic() >= deadline:
                self.fail('synthetic thread did not reach gate')
            threading.Event().wait(.002)

    def assert_slots(self, manager, *, idle, borrowed=0):
        with manager._state:
            self.assertEqual(manager._pool.qsize(), idle)
            self.assertEqual(manager._borrowers, borrowed)
            self.assertEqual(idle + borrowed, manager.pool_size)
            self.assertLessEqual(len(manager._connections), manager.pool_size)

    def test_repeated_outage_preserves_slots_and_later_checkout_recovers(self):
        original, restored, final = Connection(), Connection(), Connection()
        manager, factory = self.manager([original, lost(), restored, lost(), final])
        for current, recovered, expected_calls in ((original, restored, 3), (restored, final, 5)):
            current.ping_error = lost()
            with self.assertRaises(pymysql.Error):
                manager.fetch_all('SELECT synthetic')
            self.assertTrue(current.closed)
            self.assert_slots(manager, idle=1)
            self.assertEqual(factory.call_count, expected_calls - 1)
            self.assertEqual(manager.fetch_one('SELECT recovered'), {'id': 1})
            self.assertEqual(factory.call_count, expected_calls)
            self.assertEqual(recovered.pings, [False])
        self.assertTrue(all(flag is False for c in (original, restored, final) for flag in c.pings))

    def test_partial_constructor_failure_closes_all_created_handles_without_retry(self):
        created = Connection()
        with patch('pymysql.connect', side_effect=[created, lost()]) as factory:
            with self.assertRaises(pymysql.Error):
                MySQLManager('synthetic.invalid', 3306, 'synthetic', pool_size=2)
        self.assertTrue(created.closed)
        self.assertEqual(factory.call_count, 2)

    def test_partial_constructor_interruption_closes_created_handle(self):
        created = Connection()
        with patch('pymysql.connect', side_effect=[created, KeyboardInterrupt()]):
            with self.assertRaises(KeyboardInterrupt):
                MySQLManager('synthetic.invalid', 3306, 'synthetic', pool_size=2)
        self.assertTrue(created.closed)

    def test_repeated_idle_connect_replaces_handles_without_adding_positions(self):
        old, new, final = Connection(), Connection(), Connection()
        manager, factory = self.manager([old, new, final])
        manager.connect()
        self.assertTrue(old.closed)
        self.assert_slots(manager, idle=1)
        manager.connect()
        self.assertTrue(new.closed)
        self.assertEqual(manager._connections, {final})
        self.assert_slots(manager, idle=1)
        self.assertEqual(factory.call_count, 3)

    def test_explicit_connect_is_idle_only_and_partial_failure_leaves_recoverable_positions(self):
        old, old2, partial, recovered, recovered2 = [Connection() for _ in range(5)]
        manager, factory = self.manager([old, old2, partial, lost(), recovered, recovered2], size=2)
        with self.assertRaises(pymysql.Error):
            manager.connect()
        self.assertTrue(all(c.closed for c in (old, old2, partial)))
        self.assert_slots(manager, idle=2)
        manager.fetch_one('SELECT one')
        manager.fetch_one('SELECT two')
        self.assertEqual(factory.call_count, 6)
        self.assert_slots(manager, idle=2)
        with manager._borrow():
            for operation in (manager.connect, manager.reconnect):
                with self.assertRaises(ConnectionError):
                    operation()
        self.assertEqual(factory.call_count, 6)

    def test_reconnect_partial_attempts_cleanup_then_publish_exact_capacity(self):
        old, old2, partial, new, new2 = [Connection() for _ in range(5)]
        manager, factory = self.manager([old, old2, partial, lost(), new, new2], size=2, attempts=2)
        manager.reconnect()
        self.assertTrue(all(c.closed for c in (old, old2, partial)))
        self.assertEqual(manager._connections, {new, new2})
        self.assert_slots(manager, idle=2)
        self.assertEqual(factory.call_count, 6)

    def test_exhausted_reconnect_leaves_empty_slots_and_later_checkout_recovers(self):
        old, recovered = Connection(), Connection()
        manager, factory = self.manager([old, lost(), lost(), recovered], attempts=2)
        with self.assertRaises(ConnectionError):
            manager.reconnect()
        self.assertTrue(old.closed)
        self.assert_slots(manager, idle=1)
        self.assertEqual(manager.fetch_one('SELECT recovered'), {'id': 1})
        self.assertEqual(factory.call_count, 4)

    def test_close_is_terminal_for_connect_reconnect_and_borrow(self):
        connection = Connection()
        manager, factory = self.manager([connection])
        manager.close()
        manager.close()
        for operation in (manager.connect, manager.reconnect, lambda: manager.fetch_one('SELECT one')):
            with self.assertRaises(ConnectionError):
                operation()
        self.assertEqual(connection.close_calls, 1)
        self.assertEqual(factory.call_count, 1)
        self.assertEqual(manager._pool.qsize(), 0)

    def test_close_wakes_waiter_without_interrupting_current_uow_or_lending_after_close(self):
        connection = Connection()
        manager, _ = self.manager([connection])
        with ThreadPoolExecutor(max_workers=1) as executor:
            with manager._borrow():
                waiting = executor.submit(manager.fetch_one, 'SELECT waiting')
                self.wait_for(lambda: manager._waiters == 1)
                with self.assertRaises(ConnectionError):
                    manager.connect()
                manager.close()
                with self.assertRaises(ConnectionError):
                    waiting.result(timeout=2)
                self.assertFalse(connection.closed)
            self.assertTrue(connection.closed)
        self.assertEqual(manager._connections, set())
        self.assertEqual(manager._borrowers, 0)

    def test_close_during_empty_slot_factory_closes_late_handle_and_does_not_publish(self):
        old, late = Connection(), Connection()
        entered, release = threading.Event(), threading.Event()
        def factory(**_kwargs):
            entered.set()
            if not release.wait(2):
                raise RuntimeError('synthetic gate timeout')
            return late
        manager, mocked = self.manager([old, lost()])
        old.ping_error = lost()
        with self.assertRaises(pymysql.Error):
            manager.fetch_one('SELECT old')
        mocked.side_effect = factory
        with ThreadPoolExecutor(max_workers=1) as executor:
            pending = executor.submit(manager.fetch_one, 'SELECT late')
            try:
                self.assertTrue(entered.wait(2))
                manager.close()  # Must not need the network/factory's lock.
            finally:
                release.set()
            with self.assertRaises(ConnectionError):
                pending.result(timeout=2)
        self.assertTrue(late.closed)
        self.assertEqual(manager._pool.qsize(), 0)
        self.assertEqual(manager._connections, set())

    def test_close_during_explicit_reset_closes_partial_and_late_connections(self):
        old, partial, late = Connection(), Connection(), Connection()
        entered, release = threading.Event(), threading.Event()
        manager, factory = self.manager([old, Connection()], size=2)
        count = 0
        def building(**_kwargs):
            nonlocal count
            count += 1
            if count == 1:
                return partial
            entered.set()
            if not release.wait(2):
                raise RuntimeError('synthetic gate timeout')
            return late
        factory.side_effect = building
        with ThreadPoolExecutor(max_workers=1) as executor:
            resetting = executor.submit(manager.connect)
            try:
                self.assertTrue(entered.wait(2))
                with self.assertRaises(ConnectionError):
                    manager.fetch_one('SELECT during_reset')
                manager.close()
            finally:
                release.set()
            with self.assertRaises(ConnectionError):
                resetting.result(timeout=2)
        self.assertTrue(partial.closed and late.closed)
        self.assertEqual(manager._connections, set())
        self.assertEqual(manager._pool.qsize(), 0)

    def test_parallel_recovery_builds_at_most_pool_size_connections(self):
        originals = [Connection(), Connection()]
        manager, factory = self.manager(originals + [lost(), lost()], size=2)
        for old in originals:
            old.ping_error = lost()
            with self.assertRaises(pymysql.Error):
                manager.fetch_one('SELECT old')
        release, guard = threading.Event(), threading.Lock()
        created = []
        def build(**_kwargs):
            connection = Connection()
            with guard:
                created.append(connection)
            if not release.wait(2):
                raise RuntimeError('synthetic gate timeout')
            return connection
        factory.side_effect = build
        with ThreadPoolExecutor(max_workers=6) as executor:
            work = [executor.submit(manager.fetch_one, 'SELECT healthy') for _ in range(6)]
            try:
                self.wait_for(lambda: len(created) == 2)
                self.assert_slots(manager, idle=0, borrowed=2)
                with self.assertRaises(ConnectionError):
                    manager.reconnect()
            finally:
                release.set()
            self.assertEqual([future.result(timeout=2) for future in work], [{'id': 1}]*6)
        self.assertEqual(len(created), 2)
        self.assert_slots(manager, idle=2)

    def test_logic_error_and_application_exception_rollback_and_reuse_original_handle(self):
        connection = Connection()
        manager, factory = self.manager([connection])
        connection.sql_error = pymysql.err.ProgrammingError(1146, 'synthetic missing table')
        with self.assertRaises(pymysql.err.ProgrammingError):
            manager.fetch_all('SELECT invalid')
        connection.sql_error = None
        with self.assertRaisesRegex(RuntimeError, 'synthetic application failure'):
            with manager.unit_of_work() as uow:
                uow.execute('UPDATE synthetic SET value=1')
                raise RuntimeError('synthetic application failure')
        self.assertEqual(manager.fetch_one('SELECT healthy'), {'id': 1})
        self.assertFalse(connection.closed)
        self.assertEqual(factory.call_count, 1)
        self.assertGreaterEqual(connection.rollbacks, 4)

    def test_unknown_commit_never_replays_sql_or_commit_and_next_checkout_is_independent(self):
        connection, recovered = Connection(), Connection()
        manager, factory = self.manager([connection, recovered])
        connection.commit_error = lost()
        with self.assertRaises(pymysql.Error):
            with manager.unit_of_work() as uow:
                uow.execute('INSERT INTO synthetic(value) VALUES(%s)', (7,))
                uow.commit()
        self.assertEqual(connection.commits, 1)
        self.assertEqual(len(connection.cursor_obj.calls), 1)
        self.assertEqual(factory.call_count, 1)
        self.assert_slots(manager, idle=1)
        manager.fetch_one('SELECT recovery_only')
        self.assertEqual(recovered.cursor_obj.calls, [('SELECT recovery_only', ())])
        self.assertEqual(recovered.commits, 0)
        self.assertEqual(factory.call_count, 2)

    def test_rollback_failure_and_factory_base_exception_do_not_lose_position(self):
        old, recovered = Connection(), Connection()
        manager, factory = self.manager([old, KeyboardInterrupt(), recovered])
        old.rollback_error = lost()
        manager.fetch_one('SELECT old')
        self.assertTrue(old.closed)
        with self.assertRaises(KeyboardInterrupt):
            manager.fetch_one('SELECT interrupted_factory')
        self.assert_slots(manager, idle=1)
        self.assertEqual(manager.fetch_one('SELECT recovered'), {'id': 1})
        self.assertEqual(factory.call_count, 3)

    def test_cleanup_interruption_preserves_position_and_propagates_interrupt(self):
        old, recovered = Connection(), Connection()
        manager, factory = self.manager([old, recovered])
        old.rollback_error = KeyboardInterrupt()
        with self.assertRaises(KeyboardInterrupt):
            manager.fetch_one('SELECT interrupted_rollback')
        self.assertTrue(old.closed)
        self.assert_slots(manager, idle=1)
        self.assertEqual(manager.fetch_one('SELECT recovery'), {'id': 1})
        self.assertEqual(factory.call_count, 2)

    def interrupt_close(self, connection, errors):
        original = connection.close
        remaining = list(errors)
        def close():
            if remaining:
                raise remaining.pop(0)
            original()
        connection.close = close

    def test_close_batch_continues_after_interrupt_and_repeat_close_retries_unknown(self):
        first, second = Connection(), Connection()
        manager, factory = self.manager([first, second], size=2)
        self.interrupt_close(first, [KeyboardInterrupt()])
        with self.assertRaises(KeyboardInterrupt):
            manager.close()
        self.assertTrue(second.closed)
        self.assertFalse(first.closed)
        self.assertEqual(manager._connections, {first})
        self.assertEqual(manager._closed_pending, {first})
        manager.close()
        self.assertTrue(first.closed)
        self.assertEqual(manager._connections, set())
        self.assertEqual(factory.call_count, 2)

    def test_reset_partial_close_interrupt_finalizes_state_and_preserves_pending_slot(self):
        old, old2, partial, recovered, recovered2 = [Connection() for _ in range(5)]
        manager, factory = self.manager([old, old2, partial, lost(), recovered, recovered2], size=2)
        self.interrupt_close(partial, [KeyboardInterrupt()])
        with self.assertRaises(KeyboardInterrupt):
            manager.connect()
        self.assertFalse(manager._resetting)
        self.assert_slots(manager, idle=2)
        self.assertTrue(old.closed and old2.closed)
        self.assertFalse(partial.closed)
        self.assertEqual(manager._connections, {partial})
        self.assertEqual(factory.call_count, 4)
        self.assertEqual(manager.fetch_one('SELECT recovered'), {'id': 1})
        self.assertTrue(partial.closed)
        self.assertEqual(factory.call_count, 5)
        manager.fetch_one('SELECT second_position')
        self.assertEqual(factory.call_count, 6)
        self.assert_slots(manager, idle=2)

    def test_unknown_borrow_close_retries_before_any_replacement_for_both_error_kinds(self):
        for error_type in (KeyboardInterrupt, RuntimeError):
            with self.subTest(error=error_type.__name__):
                old, recovered = Connection(), Connection()
                manager, factory = self.manager([old, recovered])
                old.ping_error = lost()
                old.open = False  # Unknown adapter facts cannot confirm close.
                self.interrupt_close(old, [error_type(), error_type()])
                for _ in range(2):
                    with self.assertRaises(error_type):
                        manager.fetch_one('SELECT unavailable')
                    self.assertFalse(old.closed)
                    self.assertEqual(manager._connections, {old})
                    self.assert_slots(manager, idle=1)
                    self.assertEqual(factory.call_count, 1)
                    self.assertEqual(recovered.pings, [])
                self.assertEqual(manager.fetch_one('SELECT recovered'), {'id': 1})
                self.assertTrue(old.closed)
                self.assertEqual(factory.call_count, 2)
                manager.close()

    def test_reconnect_pending_close_failure_preserves_capacity_and_remains_retryable(self):
        old, recovered = Connection(), Connection()
        manager, factory = self.manager([old, recovered])
        old.ping_error = lost()
        self.interrupt_close(old, [RuntimeError(), KeyboardInterrupt()])
        with self.assertRaises(RuntimeError):
            manager.fetch_one('SELECT unavailable')
        with self.assertRaises(KeyboardInterrupt):
            manager.reconnect()
        self.assertFalse(manager._resetting)
        self.assertEqual(manager._connections, {old})
        self.assert_slots(manager, idle=1)
        self.assertEqual(factory.call_count, 1)
        manager.reconnect()
        self.assertTrue(old.closed)
        self.assertEqual(manager._connections, {recovered})
        self.assert_slots(manager, idle=1)

    def test_partial_creation_cleanup_attempts_every_handle_even_after_first_close_interrupt(self):
        old, old2, old3, partial, partial2 = [Connection() for _ in range(5)]
        manager, factory = self.manager([old, old2, old3, partial, partial2, lost()], size=3)
        self.interrupt_close(partial, [KeyboardInterrupt()])
        with self.assertRaises(KeyboardInterrupt):
            manager.connect()
        self.assertTrue(partial2.closed)
        self.assertFalse(partial.closed)
        self.assertEqual(manager._connections, {partial})
        self.assertFalse(manager._resetting)
        self.assert_slots(manager, idle=3)
        self.assertEqual(factory.call_count, 6)
        manager.close()
        self.assertTrue(partial.closed)

    def test_stale_idle_is_replaced_before_sql_and_replacement_ping_does_not_retry(self):
        old, replacement, later = Connection(), Connection(), Connection()
        manager, factory = self.manager([old, replacement, later])
        old.ping_error = replacement.ping_error = lost()
        with self.assertRaises(pymysql.Error):
            manager.fetch_one('SELECT not_yet_sent')
        self.assertTrue(old.closed and replacement.closed)
        self.assertEqual(old.cursor_obj.calls + replacement.cursor_obj.calls, [])
        self.assertEqual(factory.call_count, 2)
        self.assert_slots(manager, idle=1)
        self.assertEqual(manager.fetch_one('SELECT independent'), {'id': 1})
        self.assertEqual(factory.call_count, 3)

    def test_disconnected_sql_is_not_reentered_or_replaced_within_its_checkout(self):
        old, replacement = Connection(), Connection()
        manager, factory = self.manager([old, replacement])
        def disconnected(sql, params=None):
            old.cursor_obj.calls.append((sql, params))
            old.ping_error = lost()
            raise lost()
        old.cursor_obj.execute = disconnected
        with self.assertRaises(pymysql.Error):
            manager.execute('UPDATE synthetic SET value=%s', (9,))
        self.assertEqual(factory.call_count, 1)
        self.assertEqual(len(old.cursor_obj.calls), 1)
        self.assertEqual(old.commits, 0)
        self.assertEqual(replacement.cursor_obj.calls, [])
        self.assertTrue(old.closed)
        manager.fetch_one('SELECT independent')
        self.assertEqual(replacement.cursor_obj.calls, [('SELECT independent', ())])
