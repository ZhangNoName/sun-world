"""Offline file/schema guards only; no fake cgroup is a Linux kernel proof."""

import importlib.util
import json
import os
from pathlib import Path
import signal
import stat
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch

ROOT = Path(__file__).resolve().parents[3]
SPEC = importlib.util.spec_from_file_location('linux_stack_containment',
    ROOT / 'apps/api/tests/integration/linux_stack_containment.py')
containment = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(containment)
ERROR = containment.ERROR
MARKER = 'SYNTHETIC_PRIVATE_KERNEL_METADATA'


def sample():
    return {'memory_current_bytes': 0, 'memory_peak_bytes': 100000000,
        'memory_max_bytes': 536870912, 'swap_max_bytes': 0,
        'pids_current': 0, 'pids_max': 64, 'memory_oom': 0, 'memory_oom_kill': 0,
        'memory_limit_events': 0, 'pids_limit_events': 0, 'populated': 0,
        'gateway': {'accepted_connections': 8, 'active_connections': 0,
            'rejected_connections': 0, 'connect_failures': 0, 'byte_limit_events': 0,
            'timeout_events': 0, 'bytes_forwarded': 12345, 'closed': True}}


def report():
    return {'version': 'sun-world-linux-sdk-stack-kernel/1',
        'executions': [sample()], 'cgroups_empty': True, 'relays_closed': True}


class LinuxStackContainmentTests(unittest.TestCase):
    def setUp(self):
        base = ROOT / '.tmp'
        base.mkdir(mode=0o700, exist_ok=True)
        self.temporary = tempfile.TemporaryDirectory(prefix='stack-cgroup-unit-', dir=base)
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name).resolve()
        self.path = self.root / 'fixture-kernel-observations.json'

    def write(self, value):
        self.path.write_bytes(json.dumps(value, ensure_ascii=False).encode())
        self.path.chmod(0o600)

    def rejected(self, callback):
        with self.assertRaises(RuntimeError) as error:
            callback()
        self.assertEqual(str(error.exception), ERROR)
        self.assertNotIn(MARKER, repr(error.exception))

    def test_complete_node_projection_and_empty_cancel_before_start(self):
        original = report()
        self.write(original)
        projected = containment.read_worker_kernel(self.path)
        self.assertEqual(projected, original)
        self.assertEqual(stat.S_IMODE(self.path.stat().st_mode), 0o600)
        projected['executions'][0]['gateway']['bytes_forwarded'] = 0
        self.assertEqual(containment.read_worker_kernel(self.path), original)
        original['executions'] = []
        self.write(original)
        self.assertEqual(containment.read_worker_kernel(self.path), original)

    def test_unknown_names_and_private_values_never_leave_fixed_failure(self):
        for location in ('root', 'execution', 'gateway'):
            value = report()
            destination = (value if location == 'root' else value['executions'][0]
                if location == 'execution' else value['executions'][0]['gateway'])
            destination[MARKER] = {'private': MARKER}
            self.write(value)
            self.rejected(lambda: containment.read_worker_kernel(self.path))

    def test_resource_and_quiescence_faults_each_reject_complete_baseline(self):
        for key, bad in (('memory_max_bytes', 1), ('swap_max_bytes', 1),
                ('pids_max', 63), ('pids_current', 1), ('populated', 1),
                ('memory_peak_bytes', 0), ('memory_peak_bytes', 536870913),
                ('memory_current_bytes', 536870913), ('memory_oom', 1),
                ('memory_oom_kill', 1), ('pids_limit_events', 1)):
            value = report()
            value['executions'][0][key] = bad
            self.write(value)
            self.rejected(lambda: containment.read_worker_kernel(self.path))
        for key, bad in (('closed', False), ('active_connections', 1)):
            value = report()
            value['executions'][0]['gateway'][key] = bad
            self.write(value)
            self.rejected(lambda: containment.read_worker_kernel(self.path))

    def test_strict_integer_domain_and_final_bool(self):
        for bad in (True, -1, 1.5, 9007199254740992, MARKER, None):
            value = report()
            value['executions'][0]['memory_limit_events'] = bad
            self.write(value)
            self.rejected(lambda: containment.read_worker_kernel(self.path))
        for key, bad in (('cgroups_empty', False), ('cgroups_empty', 1),
                ('relays_closed', False), ('relays_closed', 1), ('version', MARKER)):
            value = report()
            value[key] = bad
            self.write(value)
            self.rejected(lambda: containment.read_worker_kernel(self.path))

    def test_json_duplicates_nonfinite_floats_and_utf8_are_rejected(self):
        valid = json.dumps(report()).encode()
        for raw in (
                valid.replace(b'"pids_max": 64', b'"pids_max": 64,"pids_max":64'),
                valid.replace(b'"bytes_forwarded": 12345', b'"bytes_forwarded":0.0'),
                valid.replace(b'"bytes_forwarded": 12345', b'"bytes_forwarded":NaN'),
                valid.replace(b'"bytes_forwarded": 12345', b'"bytes_forwarded":Infinity'),
                valid.replace(b'kernel/1', b'kernel/\xff'), b'{',
                b'[' * 1500 + b']' * 1500):
            self.path.write_bytes(raw)
            self.path.chmod(0o600)
            self.rejected(lambda: containment.read_worker_kernel(self.path))

    def test_entry_and_file_byte_limits_are_independent(self):
        value = report()
        value['executions'] = [sample() for _ in range(128)]
        self.write(value)
        self.assertEqual(len(containment.read_worker_kernel(self.path)['executions']), 128)
        value['executions'].append(sample())
        self.write(value)
        self.assertLess(self.path.stat().st_size, 131072)
        self.rejected(lambda: containment.read_worker_kernel(self.path))
        valid = json.dumps(report()).encode()
        self.path.write_bytes(valid + b' ' * (131072 - len(valid)))
        self.assertEqual(containment.read_worker_kernel(self.path), report())
        with self.path.open('ab') as stream:
            stream.write(b' ')
        self.rejected(lambda: containment.read_worker_kernel(self.path))

    def test_growth_after_fstat_still_uses_bounded_read(self):
        self.write(report())
        original = os.fstat
        def grow(descriptor):
            info = original(descriptor)
            with self.path.open('ab') as stream:
                stream.write(b' ' * 131073)
            return info
        with patch.object(containment.os, 'fstat', side_effect=grow):
            self.rejected(lambda: containment.read_worker_kernel(self.path))

    def test_symlink_hardlink_permissions_and_directory_refused_without_write(self):
        self.write(report())
        target = self.root / 'original'
        self.path.rename(target)
        self.path.symlink_to(target)
        self.rejected(lambda: containment.read_worker_kernel(self.path))
        self.path.unlink()
        os.link(target, self.path)
        self.rejected(lambda: containment.read_worker_kernel(self.path))
        self.path.unlink()
        target.rename(self.path)
        self.path.chmod(0o640)
        self.rejected(lambda: containment.read_worker_kernel(self.path))
        self.path.unlink()
        self.path.mkdir(mode=0o700)
        self.rejected(lambda: containment.read_worker_kernel(self.path))

    @unittest.skipUnless(hasattr(os, 'mkfifo'), 'POSIX FIFO guard')
    def test_fifo_is_rejected_before_reading(self):
        os.mkfifo(self.path, mode=0o600)
        self.rejected(lambda: containment.read_worker_kernel(self.path))

    def test_symlink_parent_is_not_a_controller_evidence_location(self):
        self.write(report())
        alias = self.root / 'alias'
        alias.symlink_to(self.root, target_is_directory=True)
        self.rejected(lambda: containment.read_worker_kernel(alias / self.path.name))
        self.assertEqual(containment.read_worker_kernel(self.path), report())

    def test_non_linux_all_lifecycle_operations_reject_before_io(self):
        owned = containment.OwnedStackCgroups()
        with patch.object(containment.sys, 'platform', 'darwin'), \
                patch.object(containment.tempfile, 'mkdtemp') as create, \
                patch.object(containment.subprocess, 'Popen') as spawn, \
                patch.object(containment.os, 'open') as opened, \
                patch.object(containment.OwnedStackCgroups, '_mount') as mount:
            for operation in (owned.prepare, owned.freeze, owned.start_survivor,
                    lambda: owned.stop_tree(worker_exited=True),
                    lambda: owned.finish(worker_exited=True)):
                self.rejected(operation)
            create.assert_not_called()
            opened.assert_not_called()
            spawn.assert_not_called()
            mount.assert_not_called()
        self.rejected(lambda: owned.path)

    def test_real_directory_metadata_guards_do_not_adopt_symlink_or_changed_inode(self):
        identity = containment.private_directory(self.root)
        self.assertEqual(identity, (self.root.stat().st_dev, self.root.stat().st_ino))
        with self.assertRaises(RuntimeError):
            containment.private_directory(self.root, (identity[0], identity[1] + 1))
        child = self.root / 'child'
        child.mkdir(mode=0o700)
        link = self.root / 'link'
        link.symlink_to(child, target_is_directory=True)
        self.rejected(lambda: containment.private_directory(link))
        child.chmod(0o777)
        self.rejected(lambda: containment.private_directory(child))

    def test_rescue_projection_is_fixed_and_allows_unstarted_zero_peak_only(self):
        value = sample()
        del value['gateway']
        value['memory_peak_bytes'] = 0
        self.assertEqual(containment.kernel_sample(value, require_peak=False), value)
        self.rejected(lambda: containment.kernel_sample(value, require_peak=True))
        value[MARKER] = MARKER
        self.rejected(lambda: containment.kernel_sample(value, require_peak=False))

    def owned_sleep(self):
        child = subprocess.Popen([sys.executable, '-I', '-c', 'import time; time.sleep(150)'],
            stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            start_new_session=True, env={'PATH': '/usr/bin:/bin'})
        actual_kill, actual_wait = child.kill, child.wait
        def cleanup():
            if child.poll() is None:
                actual_kill()
            actual_wait(timeout=3)
        self.addCleanup(cleanup)
        return child

    def test_owned_handle_fallback_reaps_after_term_error_without_cgroup_credit(self):
        child = self.owned_sleep()
        owned = containment.OwnedStackCgroups()
        owned._survivor = child
        actual_wait = child.wait
        attempts = 0
        def wait(timeout):
            nonlocal attempts
            attempts += 1
            if attempts == 1:
                raise subprocess.TimeoutExpired('fixed-synthetic', timeout)
            return actual_wait(timeout=timeout)
        with patch.object(child, 'terminate', side_effect=PermissionError(MARKER)), \
                patch.object(child, 'wait', side_effect=wait):
            owned._cleanup_survivor()
        self.assertEqual(child.returncode, -signal.SIGKILL)
        self.assertTrue(owned._survivor_fallback)
        self.assertFalse(owned._survivor_cgroup_killed)
        self.assertFalse(owned._survivor_was_live)
        self.assertIs(owned._survivor, child)
        owned._cleanup_survivor()  # A completed fallback is idempotent.

    def test_owned_handle_cleanup_drains_kill_then_preserves_interrupt(self):
        child = self.owned_sleep()
        owned = containment.OwnedStackCgroups()
        owned._survivor = child
        actual_wait = child.wait
        waits = iter([False, True])
        def wait(timeout):
            if not next(waits):
                raise subprocess.TimeoutExpired('fixed-synthetic', timeout)
            return actual_wait(timeout=timeout)
        with patch.object(child, 'terminate', side_effect=KeyboardInterrupt), \
                patch.object(child, 'wait', side_effect=wait):
            with self.assertRaises(KeyboardInterrupt):
                owned._cleanup_survivor()
        self.assertEqual(child.returncode, -signal.SIGKILL)
        self.assertFalse(owned._survivor_cgroup_killed)

    def test_validation_failure_independently_reaps_its_owned_control(self):
        child = self.owned_sleep()
        owned = containment.OwnedStackCgroups()
        owned._survivor = child
        # This deliberately fails before any kernel inspection. It proves only
        # the exception cleanup of our real Popen, never fake cgroup success.
        with patch.object(containment.sys, 'platform', 'linux'), \
                patch.object(owned, '_verify', side_effect=RuntimeError(MARKER)), \
                patch.object(containment.subprocess, 'Popen') as spawn:
            self.rejected(owned.start_survivor)
            spawn.assert_not_called()
        self.assertIsNotNone(child.poll())
        self.assertTrue(owned._survivor_fallback)
        self.assertFalse(owned._survivor_cgroup_killed)

    def test_unknown_control_cleanup_retains_handle_and_finish_refuses_live(self):
        child = Mock()
        child.poll.return_value = None
        child.terminate.side_effect = PermissionError(MARKER)
        child.kill.side_effect = PermissionError(MARKER)
        child.wait.side_effect = subprocess.TimeoutExpired('fixed-synthetic', 2)
        owned = containment.OwnedStackCgroups()
        owned._survivor = child
        self.rejected(owned._cleanup_survivor)
        child.terminate.assert_called_once()
        child.kill.assert_called_once()
        self.assertIs(owned._survivor, child)
        self.assertFalse(owned._survivor_cgroup_killed)
        with patch.object(containment.sys, 'platform', 'linux'), \
                patch.object(owned, '_children') as children:
            self.rejected(lambda: owned.finish(worker_exited=True))
            children.assert_not_called()


if __name__ == '__main__':
    unittest.main()
