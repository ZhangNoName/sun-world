#!/usr/bin/env python3
"""Explicit real-guest double-SIGTERM probe; a passed experiment exits 130."""

import argparse
import importlib.util
import json
import os
from pathlib import Path
import signal
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
FAILED = 'AGENT_LINUX_VM_INTERRUPT_FAILED'


class Arguments(argparse.ArgumentParser):
    def error(self, message):
        self.exit(2, FAILED + '\n')


def main(argv=None):
    parser = Arguments(description=__doc__, allow_abbrev=False)
    parser.add_argument('--cache', type=Path, required=True)
    parser.add_argument('--report', type=Path, required=True)
    arguments = parser.parse_args(argv)
    try:
        if sys.platform != 'darwin' or not arguments.cache.is_absolute() or not arguments.report.is_absolute():
            raise ValueError()
        spec = importlib.util.spec_from_file_location('owned_vz_interrupt', ROOT / 'scripts/test-agent-linux-vm.py')
        vm = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(vm)
        original_drain, original_execute = vm.Capture.drain, vm.execute
        observed = {'signals': 0}
        before = set(arguments.cache.parent.glob('sun-world-linux-vm-*'))

        def execute(*args, **options):
            observed['confirmations'] = options['confirmations']
            return original_execute(*args, **options)

        def drain(capture, process, seconds):
            if observed['signals'] == 1 and capture is observed.get('capture'):
                # The first signal unwound into execute's state.defer cleanup;
                # this call is before reading the stop callback confirmation.
                observed['signals'] = 2
                os.kill(os.getpid(), signal.SIGTERM)
            deadline = time.monotonic() + seconds
            while time.monotonic() < deadline:
                complete = original_drain(capture, process, min(.02, max(0, deadline - time.monotonic())))
                if observed['signals'] == 0 and any(
                        line.removesuffix(b'\r').startswith(b'SW_LINUX_PROBE ')
                        for line in bytes(capture.head).split(b'\n')[:-1]):
                    probe = vm.only_json(bytes(capture.head), 'SW_LINUX_PROBE')
                    if probe.get('platform') != 'linux' or probe.get('node') != 'v24.17.0':
                        raise ValueError()
                    observed['capture'] = capture
                    observed['signals'] = 1
                    os.kill(os.getpid(), signal.SIGTERM)
                if complete:
                    return True
            return False

        vm.Capture.drain, vm.execute = drain, execute
        try:
            result = vm.main(['--cache', str(arguments.cache), '--report', str(arguments.report)])
        finally:
            vm.Capture.drain, vm.execute = original_drain, original_execute
        capture = observed.get('capture')
        if result != 130 or observed['signals'] != 2 or capture is None:
            raise ValueError()
        host = vm.only_json(bytes(capture.diagnostics), 'SW_LINUX_HOST_RESULT')
        expected = {'version': 'sun-world-linux-host-result/1', 'started': True,
                    'stopped': True, 'reason': 'interrupted'}
        if (not vm.valid_host(host) or host != expected
                or observed['confirmations'] != {'guest_stopped': True, 'groups_gone': True}
                or set(arguments.cache.parent.glob('sun-world-linux-vm-*')) != before):
            raise ValueError()
        proof = {'version': 'sun-world-linux-vm-interruption/1', 'signals_sent': 2,
            'target_exit_code': result, 'host': host, 'guest_probe_observed': True,
            'owned_groups_gone': True, 'private_run_root_removed': True,
            'protocol_suite_completed': False, 'linux_per_run_isolation_verified': False}
        with arguments.report.open('x', encoding='utf-8') as output:
            os.fchmod(output.fileno(), 0o600)
            output.write(json.dumps(proof, indent=2) + '\n')
            output.flush()
            os.fsync(output.fileno())
        print('AGENT_LINUX_VM_INTERRUPT_VALIDATED')
        return 130
    except BaseException:
        print(FAILED, file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
