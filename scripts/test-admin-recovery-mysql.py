#!/usr/bin/env python3
"""Run administrator recovery tests with an owned, socket-only temporary MySQL."""

import argparse
import importlib.util
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('owned_mysql_launcher', ROOT / 'scripts/test-agent-mysql.py')
launcher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(launcher)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--mysqld', type=Path, required=True)
    arguments = parser.parse_args()
    return launcher.run(arguments.mysqld, test_command=[sys.executable, '-m', 'unittest',
        'discover', '-v', '-s', str(ROOT / 'apps/api/tests/integration'),
        '-p', 'test_admin_recovery_mysql.py'])


if __name__ == '__main__':
    sys.exit(main())
