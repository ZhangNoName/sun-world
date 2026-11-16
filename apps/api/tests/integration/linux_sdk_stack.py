"""Linux-only fixture ownership around the unchanged formal API scenarios."""

import asyncio
import json
import os
from pathlib import Path
import re
import signal
import socket
import stat
import sys
import time

from linux_stack_containment import OwnedStackCgroups, private_directory, read_worker_kernel


def unavailable():
    return RuntimeError('AGENT_LINUX_STACK_FAILED')


def closed_relays(workspaces, expected_identity=None):
    """Only this stopped fixture's private socket inodes may be probed."""
    root = Path(workspaces)
    try:
        info = root.lstat()
    except FileNotFoundError:
        if expected_identity is None:
            return
        raise unavailable() from None
    if (not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid()
            or stat.S_IMODE(info.st_mode) != 0o700
            or expected_identity is not None and (info.st_dev, info.st_ino) != expected_identity):
        raise unavailable()
    for index, path in enumerate(root.iterdir()):
        if index >= 256:
            raise unavailable()
        if not path.name.startswith('gateway-'):
            continue
        info = path.lstat()
        if (not re.fullmatch(r'gateway-[0-9a-f]{24}', path.name)
                or not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid()
                or stat.S_IMODE(info.st_mode) != 0o700):
            raise unavailable()
        for endpoint_index, endpoint in enumerate(path.iterdir()):
            if endpoint_index >= 1:
                raise unavailable()
            info = endpoint.lstat()
            if (endpoint.name != 's' or not stat.S_ISSOCK(info.st_mode)
                    or info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) != 0o600):
                raise unavailable()
            with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as connection:
                connection.settimeout(.2)
                try:
                    connection.connect(str(endpoint))
                except (ConnectionRefusedError, FileNotFoundError):
                    continue
                raise unavailable()


def absent_groups(groups):
    deadline = time.monotonic() + 3
    while True:
        live = []
        for group in groups:
            try:
                os.killpg(group, 0)
                live.append(group)
            except ProcessLookupError:
                pass
        if not live:
            return
        if time.monotonic() >= deadline:
            raise unavailable()
        time.sleep(.01)


def groups_gone_once(groups):
    for group in groups:
        try:
            os.killpg(group, 0)
            return False
        except ProcessLookupError:
            pass
    return True


def linux_fixture_class(base):
    if sys.platform != 'linux':
        raise unavailable()

    class LinuxFixture(base):
        def __init__(self, mode):
            super().__init__(mode, linux=True)
            self.containment = OwnedStackCgroups()
            info = self.root.lstat()
            self._root_identity = (info.st_dev, info.st_ino)
            self._workspace_identity = None
            self._linux_summary = None

        async def start(self):
            self.containment.prepare()
            await super().start()
            info = (self.root / 'workspaces').lstat()
            self._workspace_identity = (info.st_dev, info.st_ino)

        def reap_recorded_groups(self):
            exited = self.worker_process is None or self.worker_process.returncode is not None
            if not exited:
                self.containment.stop_tree(worker_exited=False)
                raise unavailable()
            errors = []
            try:
                private_directory(self.root, self._root_identity)
                groups = self.recorded_groups()
                group_gone_before_parent = groups_gone_once(groups)
            except BaseException as error:
                errors.append(error)
            try:
                recovered = self.containment.stop_tree(worker_exited=exited)
            except BaseException as error:
                errors.append(error)
            if errors:
                raise unavailable() from errors[0]
            absent_groups(groups)  # Never signal a PID recovered from a file.
            closed_relays(self.root / 'workspaces', self._workspace_identity)
            if self.expected_worker_crash:
                print('SW_LINUX_STACK_RECOVERY_OBSERVATION ' + json.dumps({
                    'worker_sigkill_confirmed': self.worker_process.returncode == -signal.SIGKILL,
                    'had_processes': recovered['had_processes'],
                    'survivor_was_live': recovered['survivor_was_live'],
                    'survivor_cgroup_killed': recovered['survivor_cgroup_killed'],
                    'sdk_group_already_gone_before_parent': group_gone_before_parent,
                    'remaining_leaf_snapshots': len(recovered['executions']),
                    'recorded_group_count': len(groups),
                }), flush=True)
                if (self.worker_process.returncode != -signal.SIGKILL or not recovered['had_processes']
                        or not recovered['survivor_was_live'] or not recovered['survivor_cgroup_killed']
                        or len(recovered['executions']) != 1 or len(groups) != 1):
                    raise unavailable()
                samples = recovered['executions']
            else:
                evidence = read_worker_kernel(self.root / 'fixture-kernel-observations.json')
                if recovered['had_processes'] or recovered['executions'] or len(evidence['executions']) != 1:
                    raise unavailable()
                samples = evidence['executions']
                if any(row['gateway']['accepted_connections'] < 1 or row['gateway']['bytes_forwarded'] < 1
                       for row in samples):
                    raise unavailable()
            self._linux_summary = {
                'crashed': self.expected_worker_crash,
                'executions': len(samples),
                'maximum_memory_peak_bytes': max(row['memory_peak_bytes'] for row in samples),
                'model_requests': self.model_steps,
                'tool_calls': int(self.pool.fetch_one('SELECT COALESCE(SUM(tool_count),0) n FROM agent_runs')['n']),
                'parent_cgroup_reaped': recovered['had_processes'],
                'parent_recovery_positive_control': recovered['survivor_was_live'] and recovered['survivor_cgroup_killed'],
                'sdk_group_already_gone_before_parent': group_gone_before_parent,
                'relays_closed': True,
            }
            return groups

        async def close_owned_containment(self):
            exited = self.worker_process is None or self.worker_process.returncode is not None
            errors = []
            for operation in (
                lambda: private_directory(self.root, self._root_identity),
                lambda: self.containment.stop_tree(worker_exited=exited),
                lambda: self.containment.finish(worker_exited=exited),
            ):
                try:
                    await asyncio.to_thread(operation)
                except BaseException as error:
                    errors.append(error)
            if errors:
                raise unavailable() from errors[0]

        def linux_summary(self):
            if self._linux_summary is None or self.root.exists() or self.containment.path.exists():
                raise unavailable()
            return dict(self._linux_summary)

    return LinuxFixture


def stack_proof(rows):
    if (len(rows) != 6 or sum(row['executions'] for row in rows) != 6
            or sum(row['crashed'] for row in rows) != 1
            or sum(row['parent_cgroup_reaped'] for row in rows) != 1
            or sum(row['parent_recovery_positive_control'] for row in rows) != 1
            or any(row['parent_recovery_positive_control'] is not row['crashed'] for row in rows)
            or sum(row['model_requests'] for row in rows) != 10
            or sum(row['tool_calls'] for row in rows) != 4
            or any(not row['relays_closed'] for row in rows)):
        raise unavailable()
    peak = max(row['maximum_memory_peak_bytes'] for row in rows)
    if not 0 < peak <= 536870912:
        raise unavailable()
    return {'version': 'sun-world-linux-formal-stack-result/1',
        'cases': 6, 'sdk_executions': 6, 'synthetic_model_requests': 10, 'tool_calls': 4,
        'formal_api_and_three_databases': True, 'mutual_tls': True,
        'success_and_recovery': True, 'explicit_cancel': True, 'tls_disconnect': True,
        'live_session_revocation': True, 'withdraw_before_commit': True,
        'worker_crash_frozen_cgroup_reaped': True, 'unknown_ack_quota_retained': True,
        'parent_recovery_positive_control': True,
        'sdk_group_already_gone_before_parent': next(row['sdk_group_already_gone_before_parent'] for row in rows if row['crashed']),
        'normal_worker_acks': 5, 'parent_cgroup_recoveries': 1,
        'memory_max_bytes': 536870912, 'pids_max': 64,
        'maximum_memory_peak_bytes': peak, 'relays_closed': True,
        'cgroups_removed': True, 'workspaces_removed': True,
        'real_supplier_requests': 0}
