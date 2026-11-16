"""Actual CLI/context signals; database daemons/readiness are synthetic."""

import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import time
import unittest

from test_agent_sdk_fixture_cleanup import OwnedOrphan, environment

ROOT = Path(__file__).resolve().parents[3]

# Execute real __main__, Redis/Mongo contexts, process groups and signal guards.
# Their database daemons/readiness and the MySQL context are synthetic.
SUPERVISOR = r'''
from contextlib import contextmanager
import importlib.abc
import importlib.util
import json, os, pathlib, runpy, shutil, subprocess, sys, tempfile, time
from types import SimpleNamespace

root, directory, mode = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2]), sys.argv[3]
repeat = mode in {'repeat', 'cleanup-first'}
child = """import json, os, pathlib, sys, time
path = pathlib.Path(sys.argv[1])
with path.open('x') as stream:
    os.chmod(path, 0o600)
    json.dump({'child_pid': os.getpid(), 'pgid': os.getpgrp()}, stream)
    stream.flush(); os.fsync(stream.fileno())
time.sleep(60)
"""
if mode == 'cleanup-first': child = child.replace('time.sleep(60)', 'time.sleep(.1)')

@contextmanager
def owned(label):
    path = directory / label
    path.mkdir(mode=0o700)
    try:
        yield {}
    finally:
        shutil.rmtree(path)

def mysql_run(_binary, *, test_runner, **_options):
    with owned('mysql'):
        result = test_runner([sys.executable, '-c', child, str(directory / 'child.json')],
            cwd=root, env=os.environ.copy(), timeout=30)
        return result.returncode

real_popen = subprocess.Popen
class OwnedDaemon:
    def __init__(self, process, label): self.process, self.label = process, label
    def __getattr__(self, name): return getattr(self.process, name)
    def wait(self, *args, **kwargs):
        if repeat and self.label == 'redis':
            (directory / 'cleanup-entered').write_text('ready')
            until = time.monotonic() + 5
            while not (directory / 'release-cleanup').exists() and time.monotonic() < until:
                time.sleep(.01)
        return self.process.wait(*args, **kwargs)

def daemon(command, **options):
    label = 'redis' if '--unixsocket' in command else 'mongo' if '--dbpath' in command else None
    if label is None: return real_popen(command, **options)
    process = real_popen([sys.executable, '-c', 'import time; time.sleep(60)'], **options)
    with (directory / (label + '-process.json')).open('x') as stream:
        os.chmod(stream.name, 0o600)
        json.dump({'child_pid': process.pid, 'pgid': process.pid}, stream)
        stream.flush(); os.fsync(stream.fileno())
    return OwnedDaemon(process, label)
subprocess.Popen = daemon
real_mkdtemp = tempfile.mkdtemp
tempfile.mkdtemp = lambda *args, **kwargs: real_mkdtemp(*args, **{**kwargs, 'dir': str(directory)})

class Loader(importlib.abc.Loader):
    def __init__(self, name, path): self.name, self.path = name, path
    def create_module(self, _spec): return None
    def exec_module(self, module):
        if self.name == 'sdk_owned_mysql': module.run = mysql_run
        else:
            module.__file__ = str(self.path)
            original(self.name, self.path).loader.exec_module(module)
            module.verified_client = lambda _environment: SimpleNamespace(
                close=lambda: None, connection_pool=SimpleNamespace(disconnect=lambda: None))

original = importlib.util.spec_from_file_location
def specification(name, path, *args, **kwargs):
    if name in {'sdk_owned_mysql', 'sdk_owned_redis', 'sdk_owned_mongo'}:
        return importlib.util.spec_from_loader(name, Loader(name, path))
    return original(name, path, *args, **kwargs)
importlib.util.spec_from_file_location = specification
subprocess.check_output = lambda *_args, **_kwargs: 'v' + (root / '.nvmrc').read_text().strip()
sys.platform = 'darwin'  # Exercise the guarded launcher on any POSIX test host.
script = root / 'scripts/test-agent-sdk-stack.py'
sys.argv = [str(script), '--mysqld', '/synthetic-unused', '--redis-server', sys.executable,
    '--mongod', sys.executable, '--sdk-runtime', str(directory), '--node', sys.executable]
runpy.run_path(str(script), run_name='__main__')
'''


@unittest.skipUnless(os.name == 'posix', 'Owned process groups require POSIX')
class AgentSdkLauncherSignalTests(unittest.TestCase):
    def exercise(self, *, repeat, during_cleanup=False):
        with tempfile.TemporaryDirectory(prefix='sw-signal-',
                dir='/private/tmp' if sys.platform == 'darwin' else None) as temporary:
            directory = Path(temporary)
            record = directory / 'child.json'
            process = None
            from contextlib import ExitStack
            with ExitStack() as safety:
                for name in ('child.json', 'redis-process.json', 'mongo-process.json'):
                    safety.enter_context(OwnedOrphan(directory / name, child_field='child_pid', group_field='pgid'))
                try:
                    process = subprocess.Popen([sys.executable, '-c', SUPERVISOR,
                        str(ROOT), str(directory), 'cleanup-first' if during_cleanup else 'repeat' if repeat else 'single'],
                        cwd=ROOT, env=environment(directory), start_new_session=True,
                        stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                    deadline = time.monotonic() + 5
                    while not record.exists() and process.poll() is None and time.monotonic() < deadline:
                        time.sleep(.01)
                    self.assertTrue(record.exists(), 'Owned child did not become ready')
                    # The marker is fsynced; wait until its complete JSON is observable.
                    while True:
                        try:
                            json.loads(record.read_text())
                            break
                        except json.JSONDecodeError:
                            self.assertLess(time.monotonic(), deadline)
                            time.sleep(.01)
                    if not during_cleanup:
                        os.kill(process.pid, signal.SIGTERM)
                    if repeat or during_cleanup:
                        while (not (directory / 'cleanup-entered').exists() and process.poll() is None
                                and time.monotonic() < deadline):
                            time.sleep(.01)
                        self.assertTrue((directory / 'cleanup-entered').exists(), 'Cleanup gate not reached')
                        os.kill(process.pid, signal.SIGTERM)
                        time.sleep(.03)
                        self.assertIsNone(process.poll(), 'Repeated signal interrupted cleanup')
                        (directory / 'release-cleanup').write_text('release')
                    self.assertEqual(130, process.wait(timeout=10))
                    self.assertFalse((directory / 'mysql').exists())
                    for label in ('redis', 'mongo'):
                        self.assertEqual([], list(directory.glob('sunworld-agent-' + label + '-*')), label)
                    deadline = time.monotonic() + 3
                    child = json.loads(record.read_text())['pgid']
                    while time.monotonic() < deadline:
                        try:
                            os.killpg(child, 0)
                        except ProcessLookupError:
                            break
                        time.sleep(.01)
                    else:
                        self.fail('Owned child group remains after CLI exit')
                finally:
                    (directory / 'release-cleanup').write_text('release')
                    if process is not None and process.poll() is None:
                        os.killpg(process.pid, signal.SIGTERM)
                        try:
                            process.wait(timeout=2)
                        except subprocess.TimeoutExpired:
                            os.killpg(process.pid, signal.SIGKILL)
                            process.wait(timeout=3)

    def test_cli_sigterm_drains_owned_child_and_resource_contexts(self):
        self.exercise(repeat=False)

    def test_repeated_sigterm_does_not_interrupt_in_progress_cleanup(self):
        self.exercise(repeat=True)

    def test_first_sigterm_during_normal_cleanup_is_deferred_then_reports_interruption(self):
        self.exercise(repeat=False, during_cleanup=True)

    def test_pending_signal_does_not_replace_a_cleanup_failure_and_handlers_restore(self):
        from fixture_signals import owned_interrupts
        previous = {kind: signal.getsignal(kind) for kind in (signal.SIGINT, signal.SIGTERM)}
        with self.assertRaisesRegex(RuntimeError, '^synthetic cleanup failed$'):
            with owned_interrupts() as interrupts:
                with interrupts.defer():
                    signal.getsignal(signal.SIGTERM)(signal.SIGTERM, None)
                    raise RuntimeError('synthetic cleanup failed')
        self.assertEqual(previous, {kind: signal.getsignal(kind) for kind in previous})

    def test_unconfirmed_resource_directory_is_retained_for_independent_recovery(self):
        from fixture_signals import owned_interrupts, owned_temporary_directory
        path = None
        with tempfile.TemporaryDirectory(prefix='sw-retain-') as parent:
            with self.assertRaisesRegex(RuntimeError, 'cleanup is unconfirmed'):
                with owned_interrupts() as interrupts:
                    with owned_temporary_directory(interrupts, dir=parent,
                            cleanup_confirmed=lambda: False) as directory:
                        path = Path(directory)
                        (path / 'owner').write_text('synthetic recovery evidence')
            self.assertEqual('synthetic recovery evidence', (path / 'owner').read_text())


if __name__ == '__main__':
    unittest.main()
