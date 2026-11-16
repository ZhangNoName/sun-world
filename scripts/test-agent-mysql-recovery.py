#!/usr/bin/env python3
"""Explicit synthetic migration/actual mysqld process-crash acceptance fixture."""

import argparse
import json
import os
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'apps/api/tests/integration'))
from fixture_mysql import owned_mysql

EXPECTED_SCENARIOS = frozenset({
    'test_recovery_attempt_commit_crash_never_counts_or_generates',
    'test_recovery_committed_admission_ack_loss_is_idempotent',
    'test_recovery_committed_completion_ack_loss_has_one_answer',
    'test_recovery_input_commit_crash_never_generates_or_refunds',
    'test_recovery_new_authorizer_denies_and_expiry_never_reclaims',
    'test_recovery_observation_commit_crash_never_replays_provider',
    'test_recovery_uncommitted_admission_has_no_partial_history',
    'test_recovery_uncommitted_completion_rolls_back_answer_and_run',
})


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--mysqld', required=True, type=Path)
    parser.add_argument('--report', type=Path)
    parser.add_argument('--suite', choices=('lifecycle', 'pool'), default='lifecycle')
    args = parser.parse_args(argv)
    if args.report is not None and args.report.exists():
        raise ValueError('Report must be a new file')
    report = {'format': 'sun-world-agent-mysql-recovery/1', 'suite': args.suite, 'synthetic_data': True,
              'real_provider_called': False, 'host_power_loss_tested': False,
              'production_snapshot_tested': False}
    with owned_mysql(args.mysqld) as server:
        directory = server.directory
        with patch.dict(os.environ, server.environment):
            if args.suite == 'pool':
                from mysql_pool_recovery import PoolRecoveryTests as RecoveryTests, EXPECTED_POOL_SCENARIOS
                expected, prefix = EXPECTED_POOL_SCENARIOS, 'test_pool_'
                if len(expected) != 4 or sorted(expected.values()) != [1, 1, 1, 2]:
                    raise RuntimeError('The complete fixed recovery matrix is required')
            else:
                from mysql_recovery import RecoveryTests
                expected, prefix = dict.fromkeys(EXPECTED_SCENARIOS, 1), 'test_recovery_'
            names = sorted(name for name in RecoveryTests.__dict__ if name.startswith(prefix))
            if not expected or set(names) != set(expected):
                raise RuntimeError('The complete fixed recovery matrix is required')
            RecoveryTests.server = server
            suite = unittest.TestSuite(RecoveryTests(name) for name in names)
            result = unittest.TextTestRunner(verbosity=2).run(suite)
        report['scenarios'] = names
        report.update(mysql_version=server.version, crashes=server.crashes,
            tests_run=result.testsRun, failures=len(result.failures), errors=len(result.errors),
            skipped=len(result.skipped))
    report['owned_process_stopped'] = server.process.poll() is not None
    report['owned_directory_removed'] = not directory.exists()
    success = (result.wasSuccessful() and not result.skipped
               and result.testsRun == len(expected)
               and len(server.crashes) == sum(expected.values())
               and report['owned_process_stopped'] and report['owned_directory_removed'])
    report['passed'] = success
    if args.report is not None:
        with args.report.open('x', encoding='utf-8') as stream:
            os.chmod(args.report, 0o600)
            json.dump(report, stream, ensure_ascii=False, indent=2)
            stream.write('\n')
    return 0 if success else 1


if __name__ == '__main__':
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print('Owned MySQL recovery suite interrupted; owned cleanup completed.', file=sys.stderr)
        sys.exit(130)
    except Exception as error:
        print(f'Owned MySQL recovery suite failed ({type(error).__name__}); no shared database used.', file=sys.stderr)
        sys.exit(1)
