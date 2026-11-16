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
    def invoke(self, *, omit=None, skipped=False, zero_run=False):
        with tempfile.TemporaryDirectory(prefix='sw-mysql-oracle-') as temporary:
            directory = Path(temporary)
            @contextmanager
            def owned(_binary):
                yield SimpleNamespace(environment={}, directory=directory / 'absent-runtime',
                    version='synthetic', crashes=[{}] * 8,
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
            methods = {name: (lambda _self: None) for name in module.EXPECTED_SCENARIOS
                       if omit != 'all' and name != omit}
            case = type('SyntheticRecovery', (unittest.TestCase,), methods)
            if skipped:
                case = unittest.skip('Synthetic skipped matrix')(case)
            report = directory / 'report.json'
            with patch.dict(sys.modules, {'mysql_recovery': SimpleNamespace(RecoveryTests=case)}), redirect_stderr(io.StringIO()):
                if omit is not None:
                    with self.assertRaisesRegex(RuntimeError, 'complete fixed recovery matrix'):
                        module.main(['--mysqld', 'synthetic-unused', '--report', str(report)])
                    self.assertFalse(report.exists())
                    return
                if zero_run:
                    result = SimpleNamespace(testsRun=0, failures=[], errors=[], skipped=[], wasSuccessful=lambda: True)
                    with patch.object(module.unittest.TextTestRunner, 'run', return_value=result):
                        status = module.main(['--mysqld', 'synthetic-unused', '--report', str(report)])
                else:
                    status = module.main(['--mysqld', 'synthetic-unused', '--report', str(report)])
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
