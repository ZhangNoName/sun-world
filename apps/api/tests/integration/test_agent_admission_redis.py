"""Native Lua checks: run only via scripts/test-agent-redis.py's owned socket."""

import importlib.util
import os
import signal
import sys
import time
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from uuid import uuid4

import redis

ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT / 'apps/api'))
from src.modules.agent_runtime.admission import RedisRunAdmission
from src.modules.agent_runtime.ledger import LedgerError

spec = importlib.util.spec_from_file_location('owned_agent_redis', ROOT / 'scripts/test-agent-redis.py')
launcher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(launcher)


class NativeRedisAdmissionTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Missing/invalid attestation fails rather than silently using localhost.
        cls.client = launcher.verified_client(os.environ)

    @classmethod
    def tearDownClass(cls):
        cls.client.close()
        cls.client.connection_pool.disconnect()

    def setUp(self):
        self.namespaces = []
        self.admission = self.make()

    def tearDown(self):
        # Never FLUSH; remove only random namespaces owned by this test.
        for namespace in self.namespaces:
            keys = list(self.client.scan_iter(match=namespace + ':*'))
            if keys:
                self.assertTrue(all(key.startswith(namespace + ':') for key in keys))
                self.client.delete(*keys)

    def make(self, **options):
        namespace = 'agent:test:' + uuid4().hex + ':{sun-world}'
        self.namespaces.append(namespace)
        return RedisRunAdmission(self.client, namespace=namespace, **options)

    def reserve(self, admission=None, *, user_id=1, key=None, family='a' * 64, request='b' * 64):
        return (admission or self.admission).reserve(user_id=user_id,
            idempotency_key=key or str(uuid4()), family_hash=family, request_hash=request)

    def assert_code(self, code, action):
        with self.assertRaises(LedgerError) as caught:
            action()
        self.assertEqual(code, caught.exception.code)
        return caught.exception

    def test_real_reservation_ttls_and_release_does_not_refund(self):
        lease = self.reserve()
        self.assertTrue(self.admission.owned(lease))
        for index, maximum in ((0, 120000), (1, 120000), (2, 60000),
                               (3, 60000), (4, 60000), (5, 60000)):
            self.assertTrue(0 < self.client.pttl(lease.keys[index]) <= maximum)
        self.assertEqual('1', self.client.get(lease.keys[2]))
        self.assertEqual('1', self.client.get(lease.keys[3]))
        self.assertTrue(self.admission.release(lease))
        self.assertFalse(self.admission.owned(lease))
        self.assertFalse(self.admission.release(lease))
        self.assertFalse(self.client.exists(lease.keys[4], lease.keys[5]))
        self.assertEqual('1', self.client.get(lease.keys[2]))
        self.assertEqual('1', self.client.get(lease.keys[3]))
        self.assertTrue(self.client.exists(lease.keys[1]))
        self.assert_code('AGENT_ADMISSION_PENDING', lambda: self.reserve(key=lease.idempotency_key))

    def test_concurrent_same_key_has_one_owner_and_no_duplicate_charge(self):
        key = str(uuid4())
        def attempt(_):
            try:
                return self.reserve(key=key)
            except LedgerError as error:
                return error.code
        with ThreadPoolExecutor(max_workers=16) as pool:
            results = list(pool.map(attempt, range(32)))
        leases = [result for result in results if not isinstance(result, str)]
        self.assertEqual(1, len(leases))
        self.assertEqual(31, results.count('AGENT_ADMISSION_PENDING'))
        lease = leases[0]
        self.assertEqual('1', self.client.get(lease.keys[2]))
        self.assertEqual('1', self.client.get(lease.keys[3]))
        self.assert_code('AGENT_RUN_NOT_FOUND', lambda: self.reserve(key=key, family='c' * 64))
        self.assert_code('AGENT_IDEMPOTENCY_CONFLICT', lambda: self.reserve(key=key, request='d' * 64))
        self.assertEqual('1', self.client.get(lease.keys[3]))

    def test_per_user_and_global_concurrency(self):
        admission = self.make(max_active=2)
        first = self.reserve(admission)
        error = self.assert_code('AGENT_RATE_LIMITED', lambda: self.reserve(admission))
        self.assertTrue(1 <= error.retry_after <= 60)
        second = self.reserve(admission, user_id=2)
        self.assert_code('AGENT_RATE_LIMITED', lambda: self.reserve(admission, user_id=3))
        self.assertEqual('2', self.client.get(first.keys[3]))
        self.assertTrue(admission.release(first))
        third = self.reserve(admission, user_id=3)
        self.assertTrue(admission.owned(second))
        self.assertTrue(admission.owned(third))

    def test_concurrent_distinct_requests_obey_global_and_user_slots(self):
        for same_user in (False, True):
            admission = self.make(max_active=3)
            def attempt(index):
                try:
                    return self.reserve(admission, user_id=1 if same_user else index + 1)
                except LedgerError as error:
                    return error.code
            with ThreadPoolExecutor(max_workers=16) as pool:
                results = list(pool.map(attempt, range(16)))
            leases = [result for result in results if not isinstance(result, str)]
            expected = 1 if same_user else 3
            self.assertEqual(expected, len(leases))
            self.assertEqual(16 - expected, results.count('AGENT_RATE_LIMITED'))
            self.assertEqual(str(expected), self.client.get(leases[0].keys[3]))

    def test_user_and_global_rate_limits_survive_release(self):
        admission = self.make(user_per_minute=2, global_per_minute=3, max_active=3)
        first = self.reserve(admission)
        admission.release(first)
        second = self.reserve(admission)
        admission.release(second)
        self.assert_code('AGENT_RATE_LIMITED', lambda: self.reserve(admission))
        third = self.reserve(admission, user_id=2)
        admission.release(third)
        self.assert_code('AGENT_RATE_LIMITED', lambda: self.reserve(admission, user_id=3))
        self.assertEqual('2', self.client.get(first.keys[2]))
        self.assertEqual('3', self.client.get(first.keys[3]))

    def test_expired_slots_cannot_be_deleted_by_late_owner(self):
        old = self.reserve()
        seconds, micros = self.client.time()
        self.client.zadd(old.keys[5], {old.owner: seconds * 1000 + micros // 1000 - 1})
        self.client.pexpire(old.keys[4], 20)
        time.sleep(.04)
        self.assertFalse(self.admission.owned(old))
        new = self.reserve()
        self.assertFalse(self.admission.release(old))
        self.assertTrue(self.admission.owned(new))
        self.assertEqual(new.owner, self.client.get(new.keys[4]))
        self.assertEqual(1, self.client.zcard(new.keys[5]))
        self.assertEqual('2', self.client.get(new.keys[2]))

    def test_minute_expiry_resets_rate_without_refunding_reservation(self):
        admission = self.make(user_per_minute=1, global_per_minute=1)
        lease = self.reserve(admission)
        admission.release(lease)
        for key in lease.keys[2:4]:
            self.client.pexpire(key, 20)
        time.sleep(.04)
        new = self.reserve(admission)
        self.assertEqual('1', self.client.get(new.keys[2]))
        self.assertTrue(self.client.exists(lease.keys[1]))
        self.assert_code('AGENT_ADMISSION_PENDING',
                         lambda: self.reserve(admission, key=lease.idempotency_key))

    def test_owned_fails_on_missing_each_authority_key(self):
        for index in (0, 1, 4, 5):
            admission = self.make()
            lease = self.reserve(admission)
            self.client.delete(lease.keys[index])
            self.assertFalse(admission.owned(lease))
            self.assertFalse(admission.release(lease))

    def test_owned_fails_when_authority_value_is_replaced(self):
        for index in (0, 1, 4, 5):
            admission = self.make()
            lease = self.reserve(admission)
            if index == 0:
                self.client.set(lease.keys[index], 'c' * 64, px=120000)
            elif index == 1:
                self.client.set(lease.keys[index], lease.family_hash + ':' + lease.request_hash
                                + ':' + 'x' * 43, px=120000)
            elif index == 4:
                self.client.set(lease.keys[index], 'x' * 43, px=60000)
            else:
                score = self.client.zscore(lease.keys[index], lease.owner)
                self.client.zrem(lease.keys[index], lease.owner)
                self.client.zadd(lease.keys[index], {'x' * 43: score})
                self.client.pexpire(lease.keys[index], 60000)
            self.assertFalse(admission.owned(lease))
            self.assertFalse(admission.release(lease))

    def test_type_and_value_poisoning_has_no_partial_writes(self):
        for index, poison in ((0, 'list'), (1, 'list'), (2, 'list'), (3, 'list'),
                              (4, 'list'), (5, 'list'), (2, '-1'), (3, 'nonsense'),
                              (2, '01'), (2, '10000000'), (4, 'bad-owner')):
            admission = self.make(max_active=2)
            lease = self.reserve(admission)
            admission.release(lease)
            key = lease.keys[index]
            self.client.delete(key)
            if poison == 'list':
                self.client.rpush(key, 'poison')
                self.client.pexpire(key, 60000)
            else:
                self.client.set(key, poison, px=60000)
            before = [self.client.dump(item) for item in lease.keys]
            self.assert_code('AGENT_ADMISSION_UNAVAILABLE',
                lambda: self.reserve(admission, key=lease.idempotency_key if index == 1 else None))
            self.assertEqual(before, [self.client.dump(item) for item in lease.keys])
            self.assert_code('AGENT_ADMISSION_UNAVAILABLE', lambda: admission.owned(lease))
            self.assert_code('AGENT_ADMISSION_UNAVAILABLE', lambda: admission.release(lease))

    def test_missing_or_invalid_ttl_and_zset_metadata_fail_closed(self):
        for index in range(6):
            admission = self.make()
            lease = self.reserve(admission)
            self.client.persist(lease.keys[index])
            self.assert_code('AGENT_ADMISSION_UNAVAILABLE', lambda: admission.owned(lease))
        admission = self.make(max_active=2)
        lease = self.reserve(admission)
        self.client.zadd(lease.keys[5], {'malformed-owner': 1})
        self.assert_code('AGENT_ADMISSION_UNAVAILABLE', lambda: self.reserve(admission, user_id=2))

    def test_configuration_mismatch_and_lost_configuration_fail_closed(self):
        lease = self.reserve()
        changed = RedisRunAdmission(self.client, namespace=self.admission._namespace, max_active=2)
        self.assert_code('AGENT_ADMISSION_UNAVAILABLE', lambda: self.reserve(changed, user_id=2))
        self.assertTrue(self.admission.owned(lease))
        self.client.delete(lease.keys[0])
        self.assert_code('AGENT_ADMISSION_UNAVAILABLE', lambda: self.reserve(user_id=2))

    def test_configuration_ttl_covers_every_new_reservation(self):
        admission = self.make(max_active=2)
        first = self.reserve(admission)
        self.client.pexpire(first.keys[0], 1000)
        second = self.reserve(admission, user_id=2)
        self.assertGreaterEqual(self.client.pttl(second.keys[0]), self.client.pttl(second.keys[1]) - 2)

    def test_driver_failure_and_attestation_errors_are_not_disclosed(self):
        bad = redis.Redis(unix_socket_path=str(Path(os.environ['SUN_WORLD_AGENT_REDIS_ROOT']) / 'absent.sock'),
                          socket_connect_timeout=.1, socket_timeout=.1)
        try:
            admission = RedisRunAdmission(bad)
            error = self.assert_code('AGENT_ADMISSION_UNAVAILABLE', lambda: self.reserve(admission))
            self.assertEqual("LedgerError('AGENT_ADMISSION_UNAVAILABLE')", repr(error))
            self.assertNotIn('sock', str(error))
        finally:
            bad.close()
            bad.connection_pool.disconnect()
        with self.assertRaises(RuntimeError):
            launcher.verified_client({**os.environ, 'SUN_WORLD_AGENT_REDIS_NONCE': '0' * 64})

    def test_owned_launcher_reaps_and_removes_runtime_on_error_and_signal(self):
        # This is the executable of our already attested, owned server, never a
        # PATH lookup or an installed/shared Redis service.
        binary = self.client.info('server')['executable']
        for mode in ('normal', 'error', 'signal'):
            root, pid = None, None
            try:
                with launcher.owned_redis(binary) as environment:
                    root = Path(environment['SUN_WORLD_AGENT_REDIS_ROOT'])
                    inner = launcher.verified_client(environment)
                    try:
                        pid = inner.info('server')['process_id']
                    finally:
                        inner.close()
                        inner.connection_pool.disconnect()
                    if mode == 'error':
                        raise ValueError('Synthetic owned test failure')
                    if mode == 'signal':
                        os.kill(os.getpid(), signal.SIGTERM)
            except ValueError:
                self.assertEqual('error', mode)
            except KeyboardInterrupt:
                self.assertEqual('signal', mode)
            self.assertIsNotNone(pid)
            self.assertFalse(root.exists())
            with self.assertRaises(ProcessLookupError):
                os.kill(pid, 0)


if __name__ == '__main__':
    unittest.main()
