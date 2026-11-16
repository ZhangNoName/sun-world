#!/usr/bin/env python3
"""Run the real fixed SDK against three owned databases and test-only mTLS."""

import argparse
from contextlib import ExitStack
import importlib.util
import os
from pathlib import Path
import signal
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[1]


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def owned_test_process(command, *, cwd, env, timeout):
    # Forward a graceful stop to Python and its Node Worker together. The
    # Worker's detached SDK groups are reaped by its own bounded close path.
    process = subprocess.Popen(command, cwd=cwd, env=env, start_new_session=True)
    try:
        return subprocess.CompletedProcess(command, process.wait(timeout=timeout))
    finally:
        def alive():
            try:
                os.killpg(process.pid, 0)
                return True
            except ProcessLookupError:
                return False
            except PermissionError:
                # A denial is neither absence nor permission to skip cleanup.
                # Keep polling the owned group; only ESRCH confirms it is gone.
                return True
        # The Python leader may have exited while a Worker still occupies its
        # owned session. A reaped leader is not proof the whole group is gone.
        if alive():
            try:
                os.killpg(process.pid, signal.SIGTERM)
            except (ProcessLookupError, PermissionError):
                pass
            deadline = time.monotonic() + 25
            while alive() and time.monotonic() < deadline:
                process.poll()
                time.sleep(.02)
            if alive():
                try:
                    os.killpg(process.pid, signal.SIGKILL)
                except (ProcessLookupError, PermissionError):
                    pass
                deadline = time.monotonic() + 5
                while alive() and time.monotonic() < deadline:
                    process.poll()
                    time.sleep(.02)
            if alive():
                raise RuntimeError('Owned test process group cleanup unconfirmed')
        if process.poll() is None:
            process.wait(timeout=5)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('mysqld', 'redis-server', 'mongod', 'sdk-runtime', 'node'):
        parser.add_argument('--' + name, required=True, type=Path)
    parser.add_argument('--interrupt-probe', action='store_true')
    parser.add_argument('--real-model', action='store_true')
    parser.add_argument('--real-model-profile', choices=('qwen-public', 'openai-local'))
    parser.add_argument('--report', type=Path)
    arguments = parser.parse_args(argv)
    try:
        sys.path.insert(0, str(ROOT / 'apps/api'))
        sys.path.insert(0, str(ROOT / 'apps/api/tests/integration'))
        from model_evaluation import validate_options
        profile = validate_options(arguments.real_model, arguments.report, arguments.real_model_profile,
                                   interrupt=arguments.interrupt_probe)
        if sys.platform != 'darwin':
            raise ValueError('Explicit macOS sandbox-exec fixture only')
        node = arguments.node.expanduser().resolve(strict=True)
        version = subprocess.check_output([str(node), '--version'], timeout=5, text=True).strip()
        if version != 'v' + (ROOT / '.nvmrc').read_text().strip():
            raise ValueError('Use the repository Node version')
        runtime = arguments.sdk_runtime.expanduser().resolve(strict=True)
        mysql = load('sdk_owned_mysql', ROOT / 'scripts/test-agent-mysql.py')
        redis = load('sdk_owned_redis', ROOT / 'scripts/test-agent-redis.py')
        mongo = load('sdk_owned_mongo', ROOT / 'scripts/test-agent-mongo.py')
        with ExitStack() as stack:
            environment = stack.enter_context(redis.owned_redis(arguments.redis_server))
            environment = {**environment, **stack.enter_context(mongo.owned_mongo(arguments.mongod)),
                'SUN_WORLD_AGENT_SDK_RUNTIME': str(runtime), 'SUN_WORLD_AGENT_SDK_NODE': str(node)}
            return mysql.run(arguments.mysqld, extra_env=environment, test_runner=owned_test_process,
                test_command=[sys.executable, str(ROOT / 'apps/api/tests/integration/sdk_stack.py'),
                              *(['--interrupt-probe'] if arguments.interrupt_probe else []),
                              *(['--real-model', '--real-model-profile', profile,
                                  '--report', str(arguments.report.resolve())] if arguments.real_model else [])],
                test_timeout_seconds=300 if arguments.real_model else 180)
    except KeyboardInterrupt:
        print('SDK stack interrupted; owned shutdown requested and drained.', file=sys.stderr)
        return 130
    except Exception:
        print('SDK stack failed; inspect the bounded evaluation report if one was created.', file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
