"""Acceptance reports must reject an absent, shortened, or skipped matrix."""

from contextlib import contextmanager, redirect_stderr
import importlib.util
import io
import json
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[3]


class RecoveryLauncherTests(unittest.TestCase):
    def invoke(self, *, omit=None, skipped=False, zero_run=False, pool=False, capacity=False):
        with tempfile.TemporaryDirectory(prefix='sw-mysql-oracle-') as temporary:
            directory = Path(temporary)
            @contextmanager
            def owned(_binary):
                yield SimpleNamespace(environment={}, directory=directory / 'absent-runtime',
                    version='synthetic', crashes=[{}] * (2 if capacity else 5 if pool else 8),
                    process=SimpleNamespace(poll=lambda: 0))
            with patch.dict(sys.modules, {'fixture_mysql': SimpleNamespace(owned_mysql=owned)}):
                original_path = sys.path[:]
                try:
                    spec = importlib.util.spec_from_file_location('recovery_oracle_fixture',
                        ROOT / 'scripts/test-agent-mysql-recovery.py')
                    module = importlib.util.module_from_spec(spec)
                    spec.loader.exec_module(module)
                finally:
                    sys.path[:] = original_path
            expected = ({'test_pool_repeated_outage_same_manager_and_concurrent_capacity': 2,
                         'test_pool_uncommitted_admission_is_not_replayed_after_outage': 1,
                         'test_pool_committed_ack_loss_preserves_one_admission': 1,
                         'test_pool_input_commit_ack_loss_keeps_budget_without_generation': 1}
                        if pool else dict.fromkeys(module.EXPECTED_SCENARIOS, 1))
            if capacity:
                expected = dict.fromkeys(module.CAPACITY_SCENARIOS, 1)
            methods = {name: (lambda _self: None) for name in expected
                       if omit != 'all' and name != omit}
            case = type('SyntheticRecovery', (unittest.TestCase,), methods)
            if skipped:
                case = unittest.skip('Synthetic skipped matrix')(case)
            report = directory / 'report.json'
            dependency = ({'mysql_pool_recovery': SimpleNamespace(PoolRecoveryTests=case,
                           EXPECTED_POOL_SCENARIOS=expected)} if pool else
                          {'mysql_recovery': SimpleNamespace(RecoveryTests=case)})
            if capacity:
                dependency = {'mysql_capacity_recovery': SimpleNamespace(CapacityRecoveryTests=case)}
            arguments = ['--mysqld', 'synthetic-unused', '--report', str(report),
                         '--suite', 'capacity' if capacity else 'pool' if pool else 'lifecycle']
            with patch.dict(sys.modules, dependency), redirect_stderr(io.StringIO()):
                if omit is not None:
                    with self.assertRaisesRegex(RuntimeError, 'complete fixed recovery matrix'):
                        module.main(arguments)
                    self.assertFalse(report.exists())
                    return
                if zero_run:
                    result = SimpleNamespace(testsRun=0, failures=[], errors=[], skipped=[], wasSuccessful=lambda: True)
                    with patch.object(module.unittest.TextTestRunner, 'run', return_value=result):
                        status = module.main(arguments)
                else:
                    status = module.main(arguments)
            self.assertEqual(status, 1)
            self.assertFalse(json.loads(report.read_text())['passed'])

    def test_actual_cli_rejects_empty_scenario_set(self):
        self.invoke(omit='all')

    def test_actual_cli_rejects_missing_scenario(self):
        self.invoke(omit='test_recovery_input_commit_crash_never_generates_or_refunds')

    def test_actual_cli_rejects_skipped_matrix(self):
        self.invoke(skipped=True)

    def test_actual_cli_rejects_successful_runner_with_zero_tests(self):
        self.invoke(zero_run=True)

    def test_pool_cli_rejects_empty_or_missing_scenarios(self):
        for missing in ('all', 'test_pool_input_commit_ack_loss_keeps_budget_without_generation'):
            with self.subTest(missing=missing):
                self.invoke(pool=True, omit=missing)

    def test_pool_cli_rejects_skipped_or_zero_run_matrix(self):
        self.invoke(pool=True, skipped=True)
        self.invoke(pool=True, zero_run=True)

    def test_capacity_cli_rejects_empty_or_missing_scenarios(self):
        for missing in ('all', 'test_capacity_uncommitted_precharge_crash_leaves_no_counter_or_history'):
            with self.subTest(missing=missing):
                self.invoke(capacity=True, omit=missing)

    def test_capacity_cli_rejects_skipped_or_zero_run_matrix(self):
        self.invoke(capacity=True, skipped=True)
        self.invoke(capacity=True, zero_run=True)
