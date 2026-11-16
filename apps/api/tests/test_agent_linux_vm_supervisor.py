"""Offline host control/proof boundaries. No hypervisor, assets or guest is run."""

import copy
import gzip
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[3]
spec = importlib.util.spec_from_file_location('linux_vm_supervisor_tests', ROOT / 'scripts/test-agent-linux-vm.py')
vm = importlib.util.module_from_spec(spec)
spec.loader.exec_module(vm)


def frame(name, value):
    return name.encode() + b' ' + json.dumps(value).encode() + b'\n'


def sample():
    host = {'version': 'sun-world-linux-host-result/1', 'started': True,
            'stopped': True, 'reason': 'completed'}
    probe = {'version': 'sun-world-linux-guest-probe/1', 'platform': 'linux',
        'architecture': 'arm64', 'node': 'v24.17.0', 'kernel': '6.8.0-147-generic',
        'cpu_count': 2, 'memory_bytes': 2000000000, 'cgroup2_mounted': True,
        'required_controllers': ['memory', 'pids'], 'namespace_probe_succeeded': True,
        'network_devices_other_than_loopback': 0, 'per_run_isolation_verified': False,
        'test_host_clock_seed_applied': True, 'clock_before_seed_seconds': 0}
    guest = {'version': 'sun-world-linux-guest-result/1', 'protocol_exit': 0}
    raw = frame('SW_LINUX_PROBE', probe) + frame('SW_LINUX_GUEST_RESULT', guest)
    raw += b'# tests 49\n# pass 49\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n'
    return raw, frame('SW_LINUX_HOST_RESULT', host), host, probe, guest


class LinuxVmProofTests(unittest.TestCase):
    def test_gateway_requires_both_transport_and_real_sdk_proof_with_bounded_actual_memory(self):
        raw, control, _, probe, _ = sample()
        raw = raw.replace(frame('SW_LINUX_PROBE', probe), frame('SW_LINUX_PROBE', {**probe, 'memory_bytes': 4200000000}))
        containment = {'version': 'sun-world-linux-containment-result/1', 'cases': 9,
            'memory_max_bytes': 536870912, 'pids_max': 64, 'memory_oom_kills': 1, 'pids_limit_events': 1,
            'filesystem_and_capabilities': True, 'cross_run_visibility': True,
            'cancel_tree_reaped': True, 'deadline_tree_reaped': True, 'cgroups_removed': True,
            'workspaces_removed': True, 'gateway_allow_path_verified': False, 'sdk_stack_verified': False,
            'cold_pid_abort_signal_observed': True, 'cold_pids_limit_events': 1,
            'unknown_leaf_refused': True, 'restarted_factory_refused_live_tree': True}
        network = {'version': 'sun-world-linux-gateway-result/1', 'cases': 5, 'approved_heartbeat_requests': 3,
            'mutual_tls_verified': True, 'server_name_rejected': True, 'missing_client_certificate_rejected': True,
            'raw_ipv4_denied': True, 'raw_ipv6_denied': True, 'root_loopback_denied': True, 'udp_dns_denied': True,
            'own_loopback_allowed': True, 'cross_run_socket_hidden': True, 'active_stream_cancelled': True,
            'relay_listener_and_connections_closed': True, 'cgroups_removed': True, 'workspaces_removed': True,
            'supplier_requests': 0, 'database_requests': 0}
        sdk = {'version': 'sun-world-linux-sdk-result/1', 'fixed_sdk_version': '0.2.2-rc.1',
            'synthetic_model_responses': 3, 'sdk_wait_cancel_model_responses': 1, 'idempotent_single_start': True,
            'cancel_before_start': True, 'active_sdk_cancel': True, 'cleanup_failure_retained_slot': True,
            'root_uuid_receipts_result': True, 'mutual_tls_and_gateway_socket': True,
            'real_supplier_requests': 0, 'real_database_requests': 0, 'memory_max_bytes': 536870912,
            'pids_max': 64, 'executions_reaped': 2, 'relay_connections_closed': True, 'cgroups_empty': True,
            'maximum_memory_peak_bytes': 400000000}
        base = raw + frame('SW_LINUX_CONTAINMENT_RESULT', containment)
        frames = frame('SW_LINUX_GATEWAY_RESULT', network) + frame('SW_LINUX_SDK_RESULT', sdk)
        result = vm.verify_console(base + frames, control, gateway=True)
        self.assertTrue(result['linux_gateway_egress_verified'])
        self.assertTrue(result['linux_sdk_synthetic_verified'])
        self.assertFalse(result['linux_per_run_isolation_verified'])
        for candidate in (base, base + frame('SW_LINUX_GATEWAY_RESULT', network),
                          base + frame('SW_LINUX_SDK_RESULT', sdk), base + frames * 2):
            with self.assertRaises(Exception):
                vm.verify_console(candidate, control, gateway=True)
        for proof, prefix, other in ((network, 'SW_LINUX_GATEWAY_RESULT', frame('SW_LINUX_SDK_RESULT', sdk)),
                                     (sdk, 'SW_LINUX_SDK_RESULT', frame('SW_LINUX_GATEWAY_RESULT', network))):
            # Every attested field is required and type-strict, including bool vs int.
            for key, value in proof.items():
                changed = {**proof, key: 1 if type(value) is bool else True}
                with self.subTest(prefix=prefix, field=key), self.assertRaises(Exception):
                    vm.verify_console(base + frame(prefix, changed) + other, control, gateway=True)
            with self.assertRaises(Exception):
                vm.verify_console(base + frame(prefix, {**proof, 'unreviewed': True}) + other, control, gateway=True)
        for peak in (0, -1, 536870913):
            with self.assertRaises(Exception):
                vm.verify_console(base + frame('SW_LINUX_GATEWAY_RESULT', network) +
                    frame('SW_LINUX_SDK_RESULT', {**sdk, 'maximum_memory_peak_bytes': peak}), control, gateway=True)
        with self.assertRaises(Exception):
            vm.verify_console(base + frames, control, containment=True)

    def test_containment_requires_exact_positive_resource_proof_without_claiming_network_or_sdk(self):
        raw, control, *_ = sample()
        proof = {'version': 'sun-world-linux-containment-result/1', 'cases': 9,
            'memory_max_bytes': 536870912, 'pids_max': 64, 'memory_oom_kills': 1, 'pids_limit_events': 2,
            'filesystem_and_capabilities': True, 'cross_run_visibility': True,
            'cancel_tree_reaped': True, 'deadline_tree_reaped': True, 'cgroups_removed': True,
            'workspaces_removed': True, 'gateway_allow_path_verified': False, 'sdk_stack_verified': False}
        proof['cold_pid_abort_signal_observed'] = True
        proof['cold_pids_limit_events'] = 1
        proof['unknown_leaf_refused'] = True
        proof['restarted_factory_refused_live_tree'] = True
        framed = frame('SW_LINUX_CONTAINMENT_RESULT', proof)
        result = vm.verify_console(raw + framed, control, containment=True)
        self.assertTrue(result['linux_resource_filesystem_containment_verified'])
        self.assertFalse(result['linux_per_run_isolation_verified'])
        with self.assertRaises(Exception):
            vm.verify_console(raw + framed, control)
        with self.assertRaises(Exception):
            vm.verify_console(raw, control, containment=True)
        for changes in ({'memory_oom_kills': 0}, {'pids_limit_events': True}, {'cases': True},
                        {'gateway_allow_path_verified': True}, {'sdk_stack_verified': True},
                        {'filesystem_and_capabilities': False}, {'unreviewed': True}):
            with self.subTest(changes=changes), self.assertRaises(Exception):
                vm.verify_console(raw + frame('SW_LINUX_CONTAINMENT_RESULT', {**proof, **changes}), control, containment=True)
        with self.assertRaises(Exception):
            vm.verify_console(raw + framed + framed, control, containment=True)

    def test_exact_result_is_environment_only_and_guest_cannot_supply_host_control(self):
        raw, control, *_ = sample()
        result = vm.verify_console(raw, control)
        self.assertTrue(result['linux_environment_boot_verified'])
        self.assertFalse(result['linux_per_run_isolation_verified'])
        with self.assertRaises(Exception):
            vm.verify_console(raw + control, b'')
        for reason in ('deadline', 'interrupted', 'guest_error'):
            host = sample()[2]
            host['reason'] = reason
            with self.assertRaises(Exception):
                vm.verify_console(raw, frame('SW_LINUX_HOST_RESULT', host))

    def test_duplicate_keys_nonfinite_float_duplicate_or_non_line_frames_are_rejected(self):
        raw, control, *_ = sample()
        duplicate = control.replace(b'"stopped": true', b'"stopped": false,"stopped": true')
        faults = [duplicate, control + control, b'free prefix ' + control,
                  control + b'SW_LINUX_HOST_RESULT malformed\n',
                  control.replace(b'true', b'NaN', 1), control.replace(b'true', b'1.0', 1)]
        for candidate in faults:
            with self.subTest(candidate_index=faults.index(candidate)), self.assertRaises(Exception):
                vm.verify_console(raw, candidate)
        captured = vm.Capture.__new__(vm.Capture)
        captured.diagnostics = bytearray(duplicate)
        self.assertFalse(captured.stopped())
        captured.diagnostics = bytearray(control)
        self.assertTrue(captured.stopped())
        captured.diagnostics = bytearray()
        captured.tail = bytearray(control)
        self.assertFalse(captured.stopped())

    def test_typed_fields_unknown_metadata_and_test_count_cannot_turn_green(self):
        raw, control, _, probe, guest = sample()
        for name, wrong in [('cpu_count', True), ('memory_bytes', True),
                            ('network_devices_other_than_loopback', False),
                            ('per_run_isolation_verified', True), ('extra', 'PRIVATE_SENTINEL'),
                            ('test_host_clock_seed_applied', False), ('clock_before_seed_seconds', True),
                            ('kernel', 'unexpected/path')]:
            changed = copy.deepcopy(probe);changed[name] = wrong
            candidate = raw.replace(frame('SW_LINUX_PROBE', probe), frame('SW_LINUX_PROBE', changed))
            with self.subTest(name=name), self.assertRaises(Exception):
                vm.verify_console(candidate, control)
        changed = {**guest, 'protocol_exit': False}
        with self.assertRaises(Exception):
            vm.verify_console(raw.replace(frame('SW_LINUX_GUEST_RESULT', guest), frame('SW_LINUX_GUEST_RESULT', changed)), control)
        for candidate in [raw.replace(b'# tests 49', b'# tests 0'), raw.replace(b'# skipped 0', b'# skipped 1'), raw + b'# tests 49\n']:
            with self.assertRaises(Exception):
                vm.verify_console(candidate, control)

    def test_actual_owned_child_channels_are_separate_and_stdout_cannot_confirm_stop(self):
        _, control, *_ = sample()
        with tempfile.TemporaryDirectory(prefix='sun-world-vm-host-unit-') as directory:
            flags = {'groups_gone': True, 'guest_stopped': True}
            with vm.owned_interrupts() as state:
                stdout, stderr = vm.execute([sys.executable, '-c',
                    'import sys;sys.stdout.buffer.write(' + repr(control) + ');sys.stderr.write("diagnostic")'],
                    state=state, directory=directory, timeout=3, is_vm=True, confirmations=flags)
            self.assertEqual(control, stdout)
            self.assertEqual(b'diagnostic', stderr)
            self.assertTrue(flags['groups_gone'])
            self.assertFalse(flags['guest_stopped'])

    def test_output_overflow_and_timeout_fail_but_reap_their_owned_child(self):
        for body, timeout in [('import sys;sys.stdout.buffer.write(b"x"*1049000)', 3),
                              ('import time;time.sleep(10)', .05)]:
            with tempfile.TemporaryDirectory(prefix='sun-world-vm-host-unit-') as directory:
                flags = {'groups_gone': True, 'guest_stopped': True}
                with vm.owned_interrupts() as state, self.assertRaises(RuntimeError):
                    vm.execute([sys.executable, '-c', body], state=state, directory=directory,
                               timeout=timeout, confirmations=flags)
                self.assertTrue(flags['groups_gone'])

    def test_unknown_group_probe_never_leaves_successful_cleanup_flag(self):
        with tempfile.TemporaryDirectory(prefix='sun-world-vm-host-unit-') as directory:
            flags = {'groups_gone': True, 'guest_stopped': True}
            with vm.owned_interrupts() as state, patch.object(vm, 'group_alive', side_effect=PermissionError), self.assertRaises(PermissionError):
                vm.execute([sys.executable, '-c', 'pass'], state=state, directory=directory,
                           timeout=3, confirmations=flags)
            self.assertFalse(flags['groups_gone'])

    def test_kernel_uses_same_bounded_regular_pinned_bytes_and_rejects_links(self):
        with tempfile.TemporaryDirectory(prefix='sun-world-vm-kernel-unit-') as directory:
            image = bytearray(64);image[56:60] = b'ARM\x64'
            raw = gzip.compress(image)
            source = Path(directory) / 'kernel';source.write_bytes(raw);source.chmod(0o600)
            expected = hashlib.sha256(raw).hexdigest()
            self.assertEqual(bytes(image), vm.kernel_bytes(source, expected))
            with self.assertRaises(RuntimeError):
                vm.kernel_bytes(source, '0' * 64)
            link = Path(directory) / 'link';link.symlink_to(source)
            with self.assertRaises(OSError):
                vm.kernel_bytes(link, expected)


if __name__ == '__main__':
    unittest.main()
