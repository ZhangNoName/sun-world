#!/usr/bin/env python3
"""Run Agent integration tests on an owned, disposable, socket-only mysqld.

No application config/env/credentials are read. No shared/remote database option
exists. Supply an already verified local mysqld binary; this script downloads or
installs nothing and never registers a service or touches the binary's datadir.
"""

import argparse
import os
import signal
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'apps/api/tests/integration'))
from fixture_mysql import owned_mysql


def run(binary, *, test_command=None, extra_env=None, test_runner=None, test_timeout_seconds=180):
    command = ([sys.executable, '-m', 'unittest', 'discover', '-v',
        '-s', str(ROOT / 'apps/api/tests/integration'), '-p', 'test_agent_mysql*.py']
        if test_command is None else test_command)
    if (not isinstance(command, (tuple, list)) or not command
            or any(not isinstance(value, str) or not value for value in command)):
        raise ValueError('Explicit nonempty test command required')
    if type(test_timeout_seconds) is not int or not 1 <= test_timeout_seconds <= 600:
        raise ValueError('Bounded test timeout required')
    with owned_mysql(binary) as server:
        env = {**os.environ, **(extra_env or {}), **server.environment, 'PYTHONUNBUFFERED': '1'}
        tests = (test_runner or subprocess.run)(command, cwd=ROOT, env=env, timeout=test_timeout_seconds)
        return tests.returncode


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--mysqld', required=True, type=Path)
    args = parser.parse_args()
    def interrupted(_signal, _frame):
        # Let owned-process/data cleanup finish even if a second stop arrives.
        signal.signal(signal.SIGTERM, signal.SIG_IGN)
        signal.signal(signal.SIGINT, signal.SIG_IGN)
        raise KeyboardInterrupt
    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGINT, interrupted)
    try:
        return run(args.mysqld)
    except KeyboardInterrupt:
        print('Disposable MySQL test interrupted; owned cleanup completed.', file=sys.stderr)
        return 130
    except Exception as error:
        # Runtime paths are synthetic; no application credentials or configs
        # entered this process. Keep external driver/binary diagnostics private.
        print(f'Disposable MySQL test failed ({type(error).__name__}). No shared database was used.', file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
