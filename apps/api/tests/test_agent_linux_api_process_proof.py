"""Synthetic proof faults and CLI wiring; never Linux execution evidence."""

from contextlib import nullcontext, redirect_stderr, redirect_stdout
from copy import deepcopy
import importlib.util
import io
import json
import os
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'apps/api/tests'))
from test_agent_linux_stack_proof import sample, frame, vm


def load(name):
    spec = importlib.util.spec_from_file_location(name.replace('-', '_'), ROOT / ('scripts/' + name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


proof = load('agent-linux-api-process-proof')


def synthetic_report():
    source = ROOT / 'docs/evaluations/agent-api-process-recovery-2026-11-17/native-3.json'
    value = json.loads(source.read_text())
    value.update(platform='linux-cgroup-bubblewrap', linux_verified=True)
    for row, starts, tools in zip(value['cases'], (0, 1, 1), (0, 0, 2)):
        row.update(worker_start_count=starts, worker_acknowledged=True, linux_observation={
            'crashed': False, 'executions': starts, 'maximum_memory_peak_bytes': 110000000 if starts else 0,
            'model_requests': row['model_count_before'], 'tool_calls': tools,
            'parent_cgroup_reaped': False, 'parent_recovery_positive_control': False,
            'sdk_group_already_gone_before_parent': True, 'relays_closed': True})
    return value


def console():
    raw, control, existing = sample()
    raw += b''.join(frame(k, v) for k, v in existing.items())
    return raw, control, {'SW_LINUX_API_PROCESS_RESULT': synthetic_report(),
        'SW_LINUX_API_PROCESS_RESOURCES_RESULT': {'version': 'sun-world-linux-stack-resources/1',
            'database_processes_stopped': True, 'database_roots_removed': True, 'owned_test_group_gone': True}}


class LinuxApiProcessProofTests(unittest.TestCase):
    def test_exact_synthetic_positive_control_has_two_executions_and_no_provider_requests(self):
        result = proof.verify(synthetic_report())
        self.assertEqual((3, 2, 4, 2, 0), tuple(result[k] for k in
            ('cases', 'sdk_executions', 'synthetic_model_requests', 'tool_calls', 'supplier_requests')))

    def test_every_case_scalar_and_kernel_field_rejects_wrong_types(self):
        original = synthetic_report()
        for index, row in enumerate(original['cases']):
            for key, item in row.items():
                if key == 'linux_observation':
                    continue
                changed = deepcopy(original)
                changed['cases'][index][key] = 1 if type(item) is bool else True
                with self.subTest(index=index, key=key), self.assertRaises(ValueError):
                    proof.verify(changed)
            for key, item in row['linux_observation'].items():
                changed = deepcopy(original)
                changed['cases'][index]['linux_observation'][key] = 1 if type(item) is bool else True
                with self.subTest(index=index, kernel=key), self.assertRaises(ValueError):
                    proof.verify(changed)

    def test_timing_zero_execution_and_actual_receipts_are_required(self):
        faults = [(0, 'terminal_elapsed_ms', 44999), (1, 'terminal_elapsed_ms', 9999),
            (1, 'callback_lease_remaining_ms', 0), (1, 'callback_lease_remaining_ms', 10001),
            (0, 'worker_start_count', 1), (2, 'worker_acknowledged', False),
            (0, 'linux_observation', None), (0, 'failure_stage', 'prepare')]
        for index, key, value in faults:
            changed = synthetic_report()
            changed['cases'][index][key] = value
            with self.subTest(key=key, value=value), self.assertRaises(ValueError):
                proof.verify(changed)
        for index, key, value in [(0, 'executions', 1), (0, 'maximum_memory_peak_bytes', 1),
                (1, 'maximum_memory_peak_bytes', 0), (2, 'maximum_memory_peak_bytes', 536870913),
                (0, 'model_requests', 1), (2, 'tool_calls', 1), (1, 'parent_cgroup_reaped', True)]:
            changed = synthetic_report()
            changed['cases'][index]['linux_observation'][key] = value
            with self.subTest(kernel=key, value=value), self.assertRaises(ValueError):
                proof.verify(changed)

    def test_macos_partial_or_unknown_fields_cannot_be_accepted(self):
        original = synthetic_report()
        for key, value in [('platform', 'macos-sandbox'), ('linux_verified', False), ('passed', False),
                ('cases', original['cases'][:2]), ('cases', original['cases'][::-1]), ('unknown', True)]:
            changed = {**original, key: value}
            with self.subTest(key=key), self.assertRaises(ValueError):
                proof.verify(changed)
        for key in ('linux_observation', 'api_sigkill_confirmed'):
            changed = deepcopy(original)
            del changed['cases'][1][key]
            with self.assertRaises(ValueError):
                proof.verify(changed)

    def test_vm_requires_both_unique_frames_and_old_profile_refuses_them(self):
        raw, control, markers = console()
        suffix = b''.join(frame(k, v) for k, v in markers.items())
        result = vm.verify_console(raw + suffix, control, api_restart=True)
        self.assertTrue(result['linux_api_process_recovery_verified'])
        self.assertTrue(result['linux_formal_stack_synthetic_verified'])
        self.assertEqual('sun-world-linux-native-validation/6', result['version'])
        with self.assertRaises(Exception):
            vm.verify_console(raw + suffix, control, stack=True)
        with self.assertRaises(Exception):
            vm.verify_console(raw + suffix, control, api_restart=True, official=True)
        for key in markers:
            with self.subTest(missing=key), self.assertRaises(Exception):
                vm.verify_console(raw + b''.join(frame(k, v) for k, v in markers.items() if k != key), control, api_restart=True)
            with self.subTest(duplicate=key), self.assertRaises(Exception):
                vm.verify_console(raw + suffix + frame(key, markers[key]), control, api_restart=True)
        with self.assertRaises(Exception):
            vm.verify_console(raw + suffix + frame('SW_LINUX_API_PROCESS_UNKNOWN', {}), control, api_restart=True)
        bad = {**markers['SW_LINUX_API_PROCESS_RESOURCES_RESULT'], 'owned_test_group_gone': 1}
        with self.assertRaises(Exception):
            vm.verify_console(raw + frame('SW_LINUX_API_PROCESS_RESULT', synthetic_report())
                + frame('SW_LINUX_API_PROCESS_RESOURCES_RESULT', bad), control, api_restart=True)


class LinuxApiProcessCliTests(unittest.TestCase):
    def test_real_provider_modes_and_wrong_platforms_refuse_before_resources(self):
        cli = load('test-agent-sdk-stack')
        base = [argument for name in ('mysqld', 'redis-server', 'mongod', 'sdk-runtime', 'node')
                for argument in ('--' + name, '/missing')]
        for platform, flags in [('darwin', ['--linux-stack']), ('linux', []),
                ('linux', ['--linux-stack', '--real-model']), ('linux', ['--linux-stack', '--linux-official']),
                ('linux', ['--linux-stack', '--interrupt-probe'])]:
            with patch.object(cli.sys, 'platform', platform), patch.object(cli, 'load') as loader, \
                    patch.object(cli.subprocess, 'check_output') as execute, redirect_stderr(io.StringIO()):
                self.assertEqual(1, cli.main(base + ['--api-process-recovery', '--report', '/missing/report'] + flags))
                loader.assert_not_called()
                execute.assert_not_called()

    def test_explicit_linux_command_keeps_owned_wrappers_and_separate_resource_ack(self):
        cli = load('test-agent-sdk-stack')
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            server = SimpleNamespace(environment={}, process=Mock(poll=Mock(return_value=0)), directory=root / 'gone')
            mysql = SimpleNamespace(owned_mysql=lambda _: nullcontext(server))
            env = {'SUN_WORLD_AGENT_REDIS_ROOT': str(root / 'gone-redis'), 'SUN_WORLD_AGENT_MONGO_ROOT': str(root / 'gone-mongo')}
            redis = SimpleNamespace(owned_redis=lambda _: nullcontext(env))
            mongo = SimpleNamespace(owned_mongo=lambda _: nullcontext({}))
            base = [argument for name in ('mysqld', 'redis-server', 'mongod', 'sdk-runtime', 'node')
                    for argument in ('--' + name, str(root))]
            output = io.StringIO()
            with patch.object(cli.sys, 'platform', 'linux'), patch.dict(os.environ, BLOG_RUNTIME_ENV='test'), \
                    patch.object(cli, 'load', side_effect=[mysql, redis, mongo]), \
                    patch.object(cli.subprocess, 'check_output', return_value='v' + (ROOT / '.nvmrc').read_text().strip()), \
                    patch.object(cli, 'owned_test_process', return_value=SimpleNamespace(returncode=0)) as run, redirect_stdout(output):
                self.assertEqual(0, cli.main(base + ['--api-process-recovery', '--linux-stack', '--report', str(root / 'result.json')]))
            command = run.call_args.args[0]
            self.assertEqual(['--report', str(root / 'result.json'), '--linux-stack'], command[2:])
            self.assertTrue(command[1].endswith('/api_process_recovery.py'))
            self.assertIn('SW_LINUX_API_PROCESS_RESOURCES_RESULT ', output.getvalue())
            self.assertNotIn('SW_LINUX_STACK_RESOURCES_RESULT ', output.getvalue())


if __name__ == '__main__':
    unittest.main()
