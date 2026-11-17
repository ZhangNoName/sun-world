#!/usr/bin/env python3
"""Run the real fixed SDK against three owned databases and test-only mTLS."""

import argparse
from contextlib import ExitStack
import importlib.util
import json
import os
from pathlib import Path
import signal
import stat
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'apps/api/tests/integration'))
from fixture_signals import owned_interrupts


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def owned_test_process(command, *, cwd, env, timeout):
    with owned_interrupts() as interrupts:
        return _owned_test_process(command, cwd=cwd, env=env, timeout=timeout, interrupts=interrupts)


def _owned_test_process(command, *, cwd, env, timeout, interrupts):
    # Forward a graceful stop to Python and its Node Worker together. The
    # Worker's detached SDK groups are reaped by its own bounded close path.
    process = None
    try:
        with interrupts.defer():
            process = subprocess.Popen(command, cwd=cwd, env=env, start_new_session=True)
        return subprocess.CompletedProcess(command, process.wait(timeout=timeout))
    finally:
        with interrupts.defer():
            if process is not None:
                _reap_test_process(process)


def _reap_test_process(process):
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
    parser.add_argument('--linux-stack', action='store_true')
    parser.add_argument('--linux-official', action='store_true')
    parser.add_argument('--api-process-recovery', action='store_true')
    arguments = parser.parse_args(argv)
    try:
        sys.path.insert(0, str(ROOT / 'apps/api'))
        sys.path.insert(0, str(ROOT / 'apps/api/tests/integration'))
        from model_evaluation import validate_options
        recovery = arguments.api_process_recovery
        if recovery and (sys.platform != 'darwin' or arguments.real_model or arguments.real_model_profile
                or arguments.interrupt_probe or arguments.linux_stack or arguments.linux_official
                or arguments.report is None):
            raise ValueError('Explicit synthetic macOS API-process fixture only')
        profile = validate_options(arguments.real_model, None if recovery else arguments.report,
                                   arguments.real_model_profile, interrupt=arguments.interrupt_probe)
        if recovery:
            # Validate before any database/process setup. The child rechecks
            # the same fresh report destination before writing bounded proof.
            destination = arguments.report.expanduser().absolute()
            if destination.is_symlink() or destination.exists():
                raise ValueError('A fresh API-process report destination is required')
            parent = destination.parent.resolve(strict=True)
            info = parent.lstat()
            if (not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid()
                    or stat.S_IMODE(info.st_mode) != 0o700):
                raise ValueError('An owned private API-process report directory is required')
            destination = parent / destination.name
        if arguments.linux_stack and (sys.platform != 'linux' or arguments.real_model or arguments.interrupt_probe):
            raise ValueError('Explicit synthetic Linux stack fixture only')
        if arguments.linux_official and (sys.platform != 'linux' or arguments.linux_stack
                or not arguments.real_model or profile != 'openai-local' or arguments.interrupt_probe):
            raise ValueError('Explicit Linux official profile only')
        linux = arguments.linux_stack or arguments.linux_official
        if not linux and sys.platform != 'darwin':
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
            command = [sys.executable, str(ROOT / 'apps/api/tests/integration/sdk_stack.py'),
                              *(['--linux-stack'] if arguments.linux_stack else []),
                              *(['--linux-official'] if arguments.linux_official else []),
                              *(['--interrupt-probe'] if arguments.interrupt_probe else []),
                              *(['--real-model', '--real-model-profile', profile,
                                  '--report', str(arguments.report.resolve())] if arguments.real_model else [])]
            if recovery:
                command = [sys.executable, str(ROOT / 'apps/api/tests/integration/api_process_recovery.py'),
                           '--report', str(destination)]
            if not linux:
                return mysql.run(arguments.mysqld, extra_env=environment, test_runner=owned_test_process,
                    test_command=command, test_timeout_seconds=300 if arguments.real_model else 180)
            server = stack.enter_context(mysql.owned_mysql(arguments.mysqld))
            environment = {**os.environ, **environment, **server.environment, 'PYTHONUNBUFFERED': '1'}
            status = owned_test_process(command, cwd=ROOT, env=environment, timeout=300).returncode
        if server.process is None or server.process.poll() is None or server.directory.exists():
            raise RuntimeError('Owned database shutdown is unconfirmed')
        if any(Path(environment['SUN_WORLD_AGENT_' + kind + '_ROOT']).exists() for kind in ('REDIS', 'MONGO')):
            raise RuntimeError('Owned database root remains')
        if status == 0:
            print(('SW_LINUX_OFFICIAL_RESOURCES_RESULT ' if arguments.linux_official else 'SW_LINUX_STACK_RESOURCES_RESULT ') + json.dumps({
                'version': 'sun-world-linux-stack-resources/1', 'database_processes_stopped': True,
                'database_roots_removed': True, 'owned_test_group_gone': True}), flush=True)
        return status
    except KeyboardInterrupt:
        print('SDK stack interrupted; owned shutdown requested and drained.', file=sys.stderr)
        return 130
    except Exception:
        print('SDK stack failed; inspect the bounded evaluation report if one was created.', file=sys.stderr)
        return 1


def run_cli():
    try:
        with owned_interrupts():
            return main()
    except KeyboardInterrupt:
        print('SDK stack interrupted; owned shutdown requested and drained.', file=sys.stderr)
        return 130


if __name__ == '__main__':
    sys.exit(run_cli())
