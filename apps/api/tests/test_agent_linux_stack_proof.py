"""Synthetic wire faults around archived valid v3 input; never a native claim."""

import importlib.util
import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'apps/api/tests/integration'))
from linux_sdk_stack import stack_proof

spec = importlib.util.spec_from_file_location('linux_stack_proof_tests', ROOT / 'scripts/test-agent-linux-vm.py')
vm = importlib.util.module_from_spec(spec)
spec.loader.exec_module(vm)


def frame(tag, value):
    return tag.encode() + b' ' + json.dumps(value).encode() + b'\n'


def sample():
    archived = json.loads((ROOT / 'docs/evaluations/agent-linux-gateway-2026-11-17/native-validation.json').read_text())
    raw = frame('SW_LINUX_PROBE', {**archived['guest_probe'], 'memory_bytes': 8000000000})
    raw += frame('SW_LINUX_GUEST_RESULT', {'version': 'sun-world-linux-guest-result/1', 'protocol_exit': 0})
    raw += b'# tests 49\n# pass 49\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n'
    for key, tag in [('containment', 'SW_LINUX_CONTAINMENT_RESULT'), ('gateway', 'SW_LINUX_GATEWAY_RESULT'), ('sdk', 'SW_LINUX_SDK_RESULT')]:
        raw += frame(tag, archived[key])
    rows = [{'crashed': i == 5, 'executions': 1, 'maximum_memory_peak_bytes': 112000000,
             'model_requests': n, 'tool_calls': 2 if i in (0, 4) else 0,
             'parent_cgroup_reaped': i == 5, 'parent_recovery_positive_control': i == 5,
             'sdk_group_already_gone_before_parent': True, 'relays_closed': True}
            for i, n in enumerate((3, 1, 1, 1, 3, 1))]
    assets = {'version': 'sun-world-linux-stack-assets-result/1', 'python': '3.12.13',
        'architecture': 'aarch64', 'mysql': '8.4.13', 'mongo': '8.0.38', 'redis': '7.0.15',
        'locked_wheels': 36, 'native_imports_loaded': True}
    resources = {'version': 'sun-world-linux-stack-resources/1', 'database_processes_stopped': True,
        'database_roots_removed': True, 'owned_test_group_gone': True}
    proofs = {'SW_LINUX_STACK_ASSETS_RESULT': assets, 'SW_LINUX_STACK_RESULT': stack_proof(rows),
              'SW_LINUX_STACK_RESOURCES_RESULT': resources}
    return raw, frame('SW_LINUX_HOST_RESULT', archived['host']), proofs


class LinuxStackProofTests(unittest.TestCase):
    def test_all_three_new_proofs_are_required_and_existing_profiles_cannot_accept_them(self):
        raw, control, proofs = sample()
        append = b''.join(frame(k, v) for k, v in proofs.items())
        result = vm.verify_console(raw + append, control, stack=True)
        self.assertTrue(result['linux_formal_stack_synthetic_verified'])
        self.assertFalse(result['linux_per_run_isolation_verified'])
        for missing in proofs:
            with self.subTest(missing=missing), self.assertRaises(Exception):
                vm.verify_console(raw + b''.join(frame(k, v) for k,v in proofs.items() if k != missing), control, stack=True)
        with self.assertRaises(Exception):
            vm.verify_console(raw + append, control, gateway=True)
        for tag, proof in proofs.items():
            with self.assertRaises(Exception):
                vm.verify_console(raw + append + frame(tag, proof), control, stack=True)

    def test_typed_schema_positive_control_limits_and_observation_are_independent(self):
        raw, control, proofs = sample()
        for tag, proof in proofs.items():
            for key, value in proof.items():
                wrong = 1 if type(value) is bool else True
                modified = {**proof, key: wrong}
                appended = b''.join(frame(k, modified if k == tag else v) for k, v in proofs.items())
                with self.subTest(tag=tag, field=key), self.assertRaises(Exception):
                    vm.verify_console(raw + appended, control, stack=True)
            appended = b''.join(frame(k, {**v, 'unreviewed': True} if k == tag else v) for k,v in proofs.items())
            with self.assertRaises(Exception):
                vm.verify_console(raw + appended, control, stack=True)
        # The SDK may exit first due to its existing parent-death protection;
        # this observational bool never replaces the active cgroup control.
        proof = {**proofs['SW_LINUX_STACK_RESULT'], 'sdk_group_already_gone_before_parent': False}
        appended = b''.join(frame(k, proof if k == 'SW_LINUX_STACK_RESULT' else v) for k,v in proofs.items())
        self.assertTrue(vm.verify_console(raw + appended, control, stack=True)['linux_formal_stack_synthetic_verified'])
        for changes in ({'parent_recovery_positive_control': False}, {'maximum_memory_peak_bytes': 0},
                        {'maximum_memory_peak_bytes': 536870913}, {'synthetic_model_requests': 9}, {'tool_calls': 3}):
            proof = {**proofs['SW_LINUX_STACK_RESULT'], **changes}
            with self.subTest(changes=changes), self.assertRaises(Exception):
                vm.verify_console(raw + b''.join(frame(k, proof if k == 'SW_LINUX_STACK_RESULT' else v) for k,v in proofs.items()), control, stack=True)
