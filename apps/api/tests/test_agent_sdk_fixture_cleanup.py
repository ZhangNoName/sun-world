"""Owned real-process regressions; no SDK, database, TLS or business config."""

import asyncio
import ctypes
import importlib.util
import json
import os
import signal
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

ROOT = Path(__file__).resolve().parents[3]


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


launcher = load('sdk_cleanup_launcher', ROOT / 'scripts/test-agent-sdk-stack.py')
sdk_stack = load('sdk_cleanup_integration', ROOT / 'apps/api/tests/integration/sdk_stack.py')


def group_exists(pid):
    try:
        os.killpg(pid, 0)
        return True
    except ProcessLookupError:
        return False
    except PermissionError:
        return True  # Only ESRCH confirms the owned group has disappeared.


class OwnedOrphan:
    """Test safety net, also reaping Linux orphans on containers without init.

    Only the PID written by our static child script is waited for/signalled.
    Subreaper state is restored after the sequential test; unrelated PIDs are
    never waited for. macOS delegates orphan waitpid to its system init.
    """
    def __init__(self, record, *, child_field, group_field):
        self.record, self.child_field, self.group_field = record, child_field, group_field
        self.stop = threading.Event()
        self.previous = None

    def read(self):
        value = json.loads(self.record.read_text())
        for name in (self.child_field, self.group_field):
            pid = value[name]
            if type(pid) is not int or pid <= 1 or pid in {os.getpid(), os.getpgrp()}:
                raise RuntimeError('Unsafe synthetic process identity')
        return value

    def __enter__(self):
        if sys.platform.startswith('linux'):
            self.libc = ctypes.CDLL(None, use_errno=True)
            previous = ctypes.c_int()
            if self.libc.prctl(37, ctypes.byref(previous), 0, 0, 0) != 0:
                raise RuntimeError('Cannot inspect Linux test subreaper')
            self.previous = previous.value
            if self.libc.prctl(36, 1, 0, 0, 0) != 0:
                raise RuntimeError('Cannot own Linux test orphans')
        def reap():
            while not self.stop.is_set():
                try:
                    pid = self.read()[self.child_field]
                    if self.previous is not None:
                        os.waitpid(pid, os.WNOHANG)
                except (OSError, ValueError, KeyError, RuntimeError):
                    pass
                self.stop.wait(.01)
        self.thread = threading.Thread(target=reap, daemon=True)
        self.thread.start()
        return self

    def __exit__(self, *_):
        try:
            if self.record.exists():
                group = self.read()[self.group_field]
                for signum, seconds in ((signal.SIGTERM, .3), (signal.SIGKILL, 3)):
                    if not group_exists(group):
                        break
                    try:
                        os.killpg(group, signum)
                        os.killpg(group, signal.SIGCONT)
                    except (ProcessLookupError, PermissionError):
                        pass
                    until = time.monotonic() + seconds
                    while group_exists(group) and time.monotonic() < until:
                        time.sleep(.01)
                if group_exists(group):
                    raise RuntimeError('Synthetic process cleanup unconfirmed')
        finally:
            self.stop.set()
            self.thread.join(timeout=1)
            if self.previous is not None and self.libc.prctl(36, self.previous, 0, 0, 0) != 0:
                raise RuntimeError('Cannot restore Linux test subreaper')


SAME_GROUP_LEADER = r'''
import json, os, subprocess, sys
child = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(60)'],
    stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
with open(sys.argv[1], 'x') as stream:
    os.chmod(sys.argv[1], 0o600)
    json.dump({'child_pid': child.pid, 'pgid': os.getpgrp()}, stream)
    stream.flush()
    os.fsync(stream.fileno())
raise SystemExit(1)
'''

DETACHED_GROUP_LEADER = r'''
import json, os, subprocess, sys, time
code = 'import os,signal,sys,time; signal.signal(signal.SIGTERM,signal.SIG_IGN); open(sys.argv[1],"x").close(); time.sleep(60)'
child = subprocess.Popen([sys.executable, '-c', code, sys.argv[2]], start_new_session=True,
    stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
with open(sys.argv[1], 'x') as stream:
    os.chmod(sys.argv[1], 0o600)
    json.dump({'pid': child.pid}, stream)
    stream.write('\n')
    stream.flush()
    os.fsync(stream.fileno())
until = time.monotonic() + 2
while not os.path.exists(sys.argv[2]) and time.monotonic() < until:
    time.sleep(.01)
if not os.path.exists(sys.argv[2]): raise SystemExit(2)
raise SystemExit(1)
'''


def environment(root):
    return {'PATH': '/usr/bin:/bin', 'HOME': str(root), 'TMPDIR': str(root), 'LC_ALL': 'C', 'TZ': 'UTC'}


class EmptyRedis:
    def __init__(self):
        self.scans = []

    def scan_iter(self, *, match):
        self.scans.append(match)
        return iter(())

    def delete(self, *_):
        raise AssertionError('Synthetic cleanup has no Redis keys')


@unittest.skipUnless(os.name == 'posix', 'Owned process groups require POSIX')
class AgentSdkFixtureCleanupTests(unittest.IsolatedAsyncioTestCase):
    async def test_transient_permission_denial_then_esrch_preserves_result_or_interrupt(self):
        # OS permission failures are injected; the two adjacent tests exercise
        # actual owned groups. Never try producing EPERM against another user.
        for interrupted in (False, True):
            with self.subTest(interrupted=interrupted):
                process = SimpleNamespace(pid=999999999,
                    wait=Mock(side_effect=KeyboardInterrupt if interrupted else None, return_value=1),
                    poll=Mock(return_value=1))
                signals, probes = [], 0
                def transient(_pid, signum):
                    nonlocal probes
                    signals.append(signum)
                    if signum == 0:
                        probes += 1
                        if probes > 1:
                            raise ProcessLookupError()
                    raise PermissionError()
                with patch.object(launcher.subprocess, 'Popen', return_value=process), \
                        patch.object(launcher.os, 'killpg', side_effect=transient):
                    if interrupted:
                        with self.assertRaises(KeyboardInterrupt):
                            launcher.owned_test_process(['synthetic-no-launch'], cwd=ROOT, env={}, timeout=1)
                    else:
                        result = launcher.owned_test_process(['synthetic-no-launch'], cwd=ROOT, env={}, timeout=1)
                        self.assertEqual(1, result.returncode)
                self.assertIn(signal.SIGTERM, signals)
                self.assertNotIn(signal.SIGKILL, signals)

    async def test_permanent_permission_denial_cannot_claim_group_was_reaped(self):
        process = SimpleNamespace(pid=999999999, wait=Mock(return_value=1), poll=Mock(return_value=1))
        signals, tick = [], 0
        def denied(_pid, signum):
            signals.append(signum)
            raise PermissionError()
        def clock():
            nonlocal tick
            tick += 100
            return tick
        # No asyncio await occurs while this process-local clock is replaced.
        with patch.object(launcher.subprocess, 'Popen', return_value=process), \
                patch.object(launcher.os, 'killpg', side_effect=denied), \
                patch.object(launcher.time, 'monotonic', side_effect=clock), \
                patch.object(launcher.time, 'sleep'):
            with self.assertRaisesRegex(RuntimeError, '^Owned test process group cleanup unconfirmed$'):
                launcher.owned_test_process(['synthetic-no-launch'], cwd=ROOT, env={}, timeout=1)
        self.assertIn(signal.SIGTERM, signals)
        self.assertIn(signal.SIGKILL, signals)

    async def test_exited_test_leader_preserves_failure_and_reaps_its_remaining_group(self):
        with tempfile.TemporaryDirectory(prefix='sun-world-sdk-cleanup-') as temporary:
            root = Path(temporary).resolve()
            record = root / 'same-group.json'
            with OwnedOrphan(record, child_field='child_pid', group_field='pgid') as orphan:
                result = await asyncio.to_thread(launcher.owned_test_process,
                    [sys.executable, '-c', SAME_GROUP_LEADER, str(record)],
                    cwd=root, env=environment(root), timeout=3)
                self.assertEqual(1, result.returncode)
                ids = orphan.read()
                self.assertFalse(group_exists(ids['pgid']))
                with self.assertRaises(ProcessLookupError):
                    os.kill(ids['child_pid'], 0)

    async def test_failed_worker_reaps_recorded_detached_group_and_continues_cleanup(self):
        with tempfile.TemporaryDirectory(prefix='sun-world-sdk-cleanup-') as temporary:
            root = Path(temporary).resolve()
            with patch.object(sdk_stack.tempfile, 'mkdtemp', return_value=str(root)):
                fixture = sdk_stack.Fixture('synthetic-cleanup-only')
            workspace = root / 'workspaces'
            workspace.mkdir(mode=0o700)
            record, ready = workspace / 'fixture-processes.jsonl', root / 'child-ready'
            redis, cleanup = EmptyRedis(), []
            class Pool:
                def close(self):
                    cleanup.append(not group_exists(json.loads(record.read_text())['pid']))
            fixture.pool = Pool()
            with OwnedOrphan(record, child_field='pid', group_field='pid') as orphan:
                process = await asyncio.create_subprocess_exec(sys.executable, '-c', DETACHED_GROUP_LEADER,
                    str(record), str(ready), stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.DEVNULL, start_new_session=True, env=environment(root))
                fixture.worker_process = process
                try:
                    await asyncio.wait_for(process.wait(), 4)
                    self.assertEqual(1, process.returncode)
                    sdk_group = orphan.read()['pid']
                    self.assertTrue(ready.exists())
                    self.assertTrue(group_exists(sdk_group))
                    with patch.object(sdk_stack.AgentStackTests, 'redis', redis, create=True):
                        with self.assertRaisesRegex(RuntimeError, '^SDK stack cleanup is unconfirmed$'):
                            await asyncio.wait_for(fixture.close(), 8)
                    self.assertEqual([sdk_group], fixture.reaped_groups)
                    self.assertFalse(group_exists(sdk_group))
                    self.assertEqual([True], cleanup)
                    self.assertEqual([fixture.namespace + '*'], redis.scans)
                    self.assertIsNone(fixture.worker_stopped)
                    self.assertTrue(root.exists())  # Failed ACK keeps evidence.
                finally:
                    if process.returncode is None:
                        process.kill()
                    await asyncio.wait_for(process.wait(), 3)
                    process.stdin.close()

    async def test_pid_journal_rejects_current_group_or_nonprivate_mode_before_signalling(self):
        with tempfile.TemporaryDirectory(prefix='sun-world-sdk-cleanup-') as temporary:
            root = Path(temporary).resolve()
            with patch.object(sdk_stack.tempfile, 'mkdtemp', return_value=str(root)):
                fixture = sdk_stack.Fixture('synthetic-invalid-pid-only')
            fixture.worker_process = SimpleNamespace(pid=os.getpid(), returncode=1)
            workspace = root / 'workspaces'
            workspace.mkdir(mode=0o700)
            record = workspace / 'fixture-processes.jsonl'
            record.write_text(json.dumps({'pid': os.getpgrp()}) + '\n')
            for mode in (0o600, 0o644):
                record.chmod(mode)
                with patch.object(sdk_stack.os, 'killpg') as signalling:
                    with self.assertRaises(RuntimeError):
                        fixture.reap_recorded_groups()
                    signalling.assert_not_called()


if __name__ == '__main__':
    unittest.main()
