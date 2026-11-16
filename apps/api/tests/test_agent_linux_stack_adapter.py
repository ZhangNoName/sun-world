"""Owned Unix sockets/processes and independent teardown faults, no SDK/DB/VM."""

import importlib.util
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'apps/api/tests/integration'))
spec = importlib.util.spec_from_file_location('linux_stack_adapter_tests', ROOT / 'apps/api/tests/integration/linux_sdk_stack.py')
adapter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(adapter)


class LinuxStackAdapterTests(unittest.TestCase):
    def test_an_owned_live_listener_is_not_misreported_as_closed(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary);root.chmod(0o700)
            relay = root / ('gateway-' + 'a' * 24);relay.mkdir(mode=0o700)
            path = relay / 's'
            with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as listener:
                listener.bind(str(path));path.chmod(0o600);listener.listen(1)
                with self.assertRaisesRegex(RuntimeError, '^AGENT_LINUX_STACK_FAILED$'):
                    adapter.closed_relays(root)
            self.assertTrue(path.is_socket())
            adapter.closed_relays(root)

    def test_symlink_and_replaced_workspace_are_not_probed_as_owned(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary);root.chmod(0o700)
            info = root.stat();identity = (info.st_dev, info.st_ino)
            adapter.closed_relays(root, identity)
            with self.assertRaises(RuntimeError):
                adapter.closed_relays(root, (identity[0], identity[1] + 1))
            (root / ('gateway-' + 'b' * 24)).symlink_to(root, target_is_directory=True)
            with self.assertRaises(RuntimeError):
                adapter.closed_relays(root, identity)

    def test_renamed_owned_workspace_with_a_live_listener_is_not_absent(self):
        # macOS's default temp root leaves too little room for a real UDS path.
        with tempfile.TemporaryDirectory(dir='/tmp', prefix='sw-') as temporary:
            parent = Path(temporary)
            root = parent / 'workspaces';root.mkdir(mode=0o700)
            info = root.stat();identity = (info.st_dev, info.st_ino)
            relay = root / ('gateway-' + 'c' * 24);relay.mkdir(mode=0o700)
            path = relay / 's'
            with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as listener:
                listener.bind(str(path));path.chmod(0o600);listener.listen(1)
                moved = parent / 'moved';root.rename(moved)
                with self.assertRaisesRegex(RuntimeError, '^AGENT_LINUX_STACK_FAILED$'):
                    adapter.closed_relays(root, identity)
                with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as connection:
                    connection.connect(str(moved / relay.name / 's'))
            root.symlink_to(parent / 'missing', target_is_directory=True)
            with self.assertRaises(RuntimeError):
                adapter.closed_relays(root)

    def test_group_probe_never_terminates_even_an_actual_owned_live_process(self):
        process = subprocess.Popen([sys.executable, '-I', '-c', 'import time;time.sleep(15)'],
            stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            start_new_session=True, env={'PATH': os.defpath})
        try:
            with self.assertRaisesRegex(RuntimeError, '^AGENT_LINUX_STACK_FAILED$'):
                adapter.absent_groups([process.pid])
            self.assertIsNone(process.poll())
            self.assertFalse(adapter.groups_gone_once([process.pid]))
        finally:
            process.terminate();process.wait(timeout=5)
        adapter.absent_groups([process.pid])
        self.assertTrue(adapter.groups_gone_once([process.pid]))

    def test_linux_factory_refuses_other_platform_before_constructing_a_fixture(self):
        base = Mock()
        with patch.object(adapter.sys, 'platform', 'darwin'), self.assertRaises(RuntimeError):
            adapter.linux_fixture_class(base)
        base.assert_not_called()

    def test_bad_pid_evidence_still_attempts_the_independently_owned_cgroup(self):
        with patch.object(adapter.sys, 'platform', 'linux'):
            kind = adapter.linux_fixture_class(object)
        instance = kind.__new__(kind)
        instance.root, instance._root_identity = Path('/unused-fixture'), (1, 2)
        instance.worker_process = SimpleNamespace(returncode=0)
        instance.recorded_groups = Mock(side_effect=ValueError('SYNTHETIC_PRIVATE_MARKER'))
        instance.containment = SimpleNamespace(stop_tree=Mock(return_value={'had_processes': False, 'executions': []}))
        with patch.object(adapter, 'private_directory'), self.assertRaises(RuntimeError) as failure:
            instance.reap_recorded_groups()
        self.assertEqual(str(failure.exception), 'AGENT_LINUX_STACK_FAILED')
        instance.containment.stop_tree.assert_called_once_with(worker_exited=True)


class LinuxStackCleanupHookTests(unittest.IsolatedAsyncioTestCase):
    async def test_filesystem_or_stop_failure_does_not_skip_the_other_owned_cleanup(self):
        with patch.object(adapter.sys, 'platform', 'linux'):
            kind = adapter.linux_fixture_class(object)
        instance = kind.__new__(kind)
        instance.root, instance._root_identity = Path('/unused-fixture'), (1, 2)
        instance.worker_process = SimpleNamespace(returncode=0)
        instance.containment = SimpleNamespace(stop_tree=Mock(side_effect=PermissionError), finish=Mock())
        with patch.object(adapter, 'private_directory', side_effect=PermissionError), self.assertRaises(RuntimeError):
            await instance.close_owned_containment()
        instance.containment.stop_tree.assert_called_once_with(worker_exited=True)
        instance.containment.finish.assert_called_once_with(worker_exited=True)
