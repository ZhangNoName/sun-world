"""Driver/input tests only; native Redis tests exercise the Lua implementation."""

import sys
import unittest
from dataclasses import replace
from pathlib import Path
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from src.modules.agent_runtime.admission import RedisRunAdmission
from src.modules.agent_runtime.ledger import LedgerError


class Driver:
    def __init__(self, response=None, error=None):
        self.response = [1] if response is None else response
        self.error = error
        self.calls = []

    def eval(self, *arguments):
        self.calls.append(arguments)
        if self.error:
            raise self.error
        return self.response


class AdmissionDriverTest(unittest.TestCase):
    def setUp(self):
        self.driver = Driver()
        self.admission = RedisRunAdmission(self.driver)
        self.arguments = dict(user_id=1, idempotency_key=str(uuid4()),
                              family_hash='a' * 64, request_hash='b' * 64)

    def assert_code(self, code, action):
        with self.assertRaises(LedgerError) as caught:
            action()
        self.assertEqual(code, caught.exception.code)
        return caught.exception

    def test_constructor_and_input_validation_never_connect(self):
        self.assertEqual([], self.driver.calls)
        for options in ({'namespace': 'wrong{tag}'}, {'namespace': 'a{sun-world}{sun-world}'},
                        {'namespace': 'x' * 129}, {'namespace': ''}, {'max_active': True},
                        {'max_active': 129}, {'max_active': 0}, {'user_per_minute': False},
                        {'global_per_minute': 0}, {'global_per_minute': 1_000_001}):
            with self.subTest(options=options):
                self.assert_code('AGENT_ADMISSION_UNAVAILABLE',
                                 lambda: RedisRunAdmission(self.driver, **options))
        for changes in ({'user_id': True}, {'user_id': 0}, {'user_id': 2**63},
                        {'idempotency_key': 'bad'}, {'family_hash': 'A' * 64},
                        {'request_hash': 'secret diagnostic'}, {'request_hash': None}):
            with self.subTest(changes=changes):
                self.assert_code('AGENT_ADMISSION_UNAVAILABLE',
                                 lambda: self.admission.reserve(**{**self.arguments, **changes}))
        self.assertEqual([], self.driver.calls)

    def test_lease_is_private_and_keys_are_server_derived(self):
        lease = self.admission.reserve(**self.arguments)
        self.assertNotIn(lease.owner, repr(lease))
        self.assertNotIn(lease.family_hash, repr(lease))
        self.assertEqual(6, len(lease.keys))
        self.assertTrue(all('{sun-world}' in key for key in lease.keys))
        self.assertTrue(all(self.arguments['idempotency_key'] not in key for key in lease.keys))
        self.assertEqual(1, len(self.driver.calls))
        self.assertEqual(6, self.driver.calls[0][1])
        self.assertTrue(self.admission.owned(lease))
        self.assertTrue(self.admission.release(lease))

    def test_fixed_errors_safe_retry_and_no_driver_diagnostics(self):
        for result, code in (([2, 120], 'AGENT_ADMISSION_PENDING'),
                             ([3], 'AGENT_RUN_NOT_FOUND'),
                             ([4], 'AGENT_IDEMPOTENCY_CONFLICT'),
                             ([5, 1], 'AGENT_RATE_LIMITED'),
                             ([9], 'AGENT_ADMISSION_UNAVAILABLE')):
            self.driver.response = result
            error = self.assert_code(code, lambda: self.admission.reserve(**self.arguments))
            if result[0] in (2, 5):
                self.assertEqual(result[1], error.retry_after)
        self.driver.error = RuntimeError('redis://private:credential@host raw-value')
        error = self.assert_code('AGENT_ADMISSION_UNAVAILABLE',
                                 lambda: self.admission.reserve(**self.arguments))
        self.assertNotIn('credential', repr(error))
        self.assertIsNone(error.__cause__)
        self.assertTrue(error.__suppress_context__)

    def test_malformed_driver_responses_fail_closed(self):
        for response in ([], [True], [1, 2], [2, 0], [5, 121], ['1'], '1',
                         [3, 1], [1, 2, 3], {'status': 1}):
            self.driver.response = response
            self.assert_code('AGENT_ADMISSION_UNAVAILABLE',
                             lambda: self.admission.reserve(**self.arguments))
        self.driver.response = [1]
        lease = self.admission.reserve(**self.arguments)
        for response in ([9], [1, 2], [2]):
            self.driver.response = response
            self.assert_code('AGENT_ADMISSION_UNAVAILABLE', lambda: self.admission.owned(lease))
            self.assert_code('AGENT_ADMISSION_UNAVAILABLE', lambda: self.admission.release(lease))

    def test_forged_or_cross_configuration_lease_never_calls_driver(self):
        lease = self.admission.reserve(**self.arguments)
        before = len(self.driver.calls)
        for invalid in (None, object(), replace(lease, keys=('external',)),
                        replace(lease, owner='wrong'), replace(lease, user_id=True),
                        replace(lease, fingerprint='c' * 64)):
            self.assertFalse(self.admission.owned(invalid))
            self.assertFalse(self.admission.release(invalid))
        other = RedisRunAdmission(self.driver, max_active=2)
        self.assertFalse(other.owned(lease))
        self.assertFalse(other.release(lease))
        self.assertEqual(before, len(self.driver.calls))


if __name__ == '__main__':
    unittest.main()
