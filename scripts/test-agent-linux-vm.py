#!/usr/bin/env python3
"""Explicit disposable macOS VZ guest; no production services or model calls."""

import argparse
import gzip
import io
import hashlib
import json
import os
from pathlib import Path
import re
import selectors
import signal
import subprocess
import sys
import stat
import time

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'apps/api/tests/integration'))
from fixture_signals import owned_interrupts, owned_temporary_directory

FAILED = 'AGENT_LINUX_VM_FAILED'
ENV = {'PATH': '/usr/bin:/bin:/usr/sbin:/sbin', 'LC_ALL': 'C', 'TZ': 'UTC'}
LIMIT = 1048576


def fail():
    raise RuntimeError(FAILED) from None


def group_alive(process):
    if not process.pid:
        fail()
    try:
        os.killpg(process.pid, 0)
        return True
    except ProcessLookupError:
        return False


class Capture:
    def __init__(self, process):
        self.selector = selectors.DefaultSelector()
        for stream in (process.stdout, process.stderr):
            os.set_blocking(stream.fileno(), False)
            self.selector.register(stream, selectors.EVENT_READ, stream is process.stdout)
        self.head = bytearray()
        self.tail = bytearray()
        self.diagnostics = bytearray()
        self.received = 0

    def drain(self, process, seconds):
        deadline = time.monotonic() + seconds
        while time.monotonic() < deadline:
            if not self.selector.get_map() and process.poll() is not None:
                return True
            for key, _ in self.selector.select(.05):
                raw = os.read(key.fileobj.fileno(), 65536)
                if not raw:
                    self.selector.unregister(key.fileobj)
                    continue
                self.received += len(raw)
                if key.data:
                    self.head.extend(raw[:max(0, LIMIT - len(self.head))])
                    self.tail = (self.tail + raw)[-16384:]
                else:
                    self.diagnostics = (self.diagnostics + raw)[-16384:]
            process.poll()
        return False

    def stopped(self):
        try:
            value = only_json(bytes(self.diagnostics), 'SW_LINUX_HOST_RESULT')
            return valid_host(value) and value['stopped'] is True
        except Exception:
            return False

    def close(self):
        self.selector.close()


def execute(command, *, state, directory, timeout, is_vm=False, confirmations):
    process, capture = None, None
    try:
        with state.defer():
            process = subprocess.Popen(command, cwd=directory, env=ENV, stdin=subprocess.DEVNULL,
                stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True)
            confirmations['groups_gone'] = False
            if is_vm:
                confirmations['guest_stopped'] = False
            capture = Capture(process)
        if not capture.drain(process, timeout):
            fail()
        if process.returncode != 0 or capture.received > LIMIT:
            fail()
        return bytes(capture.head), bytes(capture.diagnostics)
    finally:
        if process is not None:
            with state.defer():
                try:
                    for signum, seconds in ((signal.SIGTERM, 10), (signal.SIGKILL, 5)):
                        if process.poll() is not None and not group_alive(process):
                            break
                        try:
                            os.killpg(process.pid, signum)
                        except ProcessLookupError:
                            pass
                        if capture is not None:
                            capture.drain(process, seconds)
                        else:
                            try:
                                process.wait(timeout=seconds)
                            except subprocess.TimeoutExpired:
                                pass
                    if process.poll() is None or group_alive(process):
                        fail()
                    confirmations['groups_gone'] = True
                finally:
                    if is_vm and capture is not None:
                        confirmations['guest_stopped'] = capture.stopped()
                    if capture is not None:
                        if is_vm:
                            with (Path(directory) / 'console.log').open('xb') as log:
                                os.fchmod(log.fileno(), 0o600)
                                log.write(bytes(capture.head) + b'\nHOST_STDERR\n' + bytes(capture.diagnostics))
                        capture.close()
                    for stream in (process.stdout, process.stderr):
                        if stream is not None:
                            stream.close()


def only_json(raw, prefix):
    tag = prefix.encode()
    lines = [line.removesuffix(b'\r') for line in raw.split(b'\n') if line.startswith(tag)]
    if len(lines) != 1 or not lines[0].startswith(tag + b' '):
        fail()
    payload = lines[0][len(tag) + 1:]
    if not payload or len(payload) > 8192:
        fail()
    def pairs(items):
        result = {}
        for key, value in items:
            if key in result:
                fail()
            result[key] = value
        return result
    value = json.loads(payload.decode('utf-8'), object_pairs_hook=pairs,
                       parse_constant=lambda _: fail(), parse_float=lambda _: fail())
    if type(value) is not dict:
        fail()
    return value


def valid_host(value):
    return (set(value) == {'version', 'started', 'stopped', 'reason'}
        and value['version'] == 'sun-world-linux-host-result/1'
        and type(value['started']) is bool and type(value['stopped']) is bool
        and type(value['reason']) is str
        and value['reason'] in {'completed', 'deadline', 'interrupted', 'configuration_invalid',
                               'startup_failed', 'guest_error'})


def verify_console(raw, control):
    host = only_json(control, 'SW_LINUX_HOST_RESULT')
    guest = only_json(raw, 'SW_LINUX_GUEST_RESULT')
    probe = only_json(raw, 'SW_LINUX_PROBE')
    keys = {'version', 'platform', 'architecture', 'node', 'kernel', 'cpu_count', 'memory_bytes',
            'cgroup2_mounted', 'required_controllers', 'namespace_probe_succeeded',
            'network_devices_other_than_loopback', 'per_run_isolation_verified',
            'test_host_clock_seed_applied', 'clock_before_seed_seconds'}
    if (not valid_host(host) or host != {'version': 'sun-world-linux-host-result/1', 'started': True,
                 'stopped': True, 'reason': 'completed'}
            or host.get('started') is not True or host.get('stopped') is not True
            or guest != {'version': 'sun-world-linux-guest-result/1', 'protocol_exit': 0}
            or type(guest.get('protocol_exit')) is not int or set(probe) != keys
            or probe.get('version') != 'sun-world-linux-guest-probe/1'
            or probe.get('platform') != 'linux' or probe.get('architecture') != 'arm64'
            or probe.get('node') != 'v24.17.0' or type(probe.get('cpu_count')) is not int or probe.get('cpu_count') != 2
            or probe.get('cgroup2_mounted') is not True
            or probe.get('required_controllers') != ['memory', 'pids']
            or probe.get('namespace_probe_succeeded') is not True
            or probe.get('test_host_clock_seed_applied') is not True
            or type(probe.get('network_devices_other_than_loopback')) is not int
            or probe.get('network_devices_other_than_loopback') != 0
            or probe.get('per_run_isolation_verified') is not False):
        fail()
    if type(probe.get('kernel')) is not str or not re.fullmatch(r'[0-9]+\.[0-9]+\.[0-9]+[A-Za-z0-9._+~-]{0,100}', probe['kernel']):
        fail()
    memory = probe.get('memory_bytes')
    if type(memory) is not int or not 1073741824 <= memory <= 2147483648:
        fail()
    before_clock = probe.get('clock_before_seed_seconds')
    if type(before_clock) is not int or not 0 <= before_clock <= 4102444800:
        fail()
    counts = {name: re.findall(rb'^# ' + name.encode() + rb' (\d+)\r?$', raw, re.M)
              for name in ('tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo')}
    if any(len(values) != 1 for values in counts.values()):
        fail()
    values = {name: int(rows[0]) for name, rows in counts.items()}
    if values != {'tests': 49, 'pass': 49, 'fail': 0, 'cancelled': 0, 'skipped': 0, 'todo': 0}:
        fail()
    return {'version': 'sun-world-linux-native-validation/1', 'host': host, 'guest_probe': probe,
        'protocol_tests': values, 'linux_environment_boot_verified': True,
        'linux_per_run_isolation_verified': False, 'supplier_requests': 0,
        'console_sha256': hashlib.sha256(raw).hexdigest(),
        'host_control_sha256': hashlib.sha256(control).hexdigest()}


def kernel_bytes(path, expected):
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        info = os.fstat(descriptor)
        if (not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or info.st_nlink != 1
                or stat.S_IMODE(info.st_mode) != 0o600 or not 0 < info.st_size <= 134217728):
            fail()
        with os.fdopen(descriptor, 'rb', closefd=False) as source:
            original = source.read(134217729)
        if len(original) != info.st_size or hashlib.sha256(original).hexdigest() != expected:
            fail()
        with gzip.GzipFile(fileobj=io.BytesIO(original)) as source:
            kernel = source.read(134217729)
        if len(kernel) > 134217728 or kernel[56:60] != b'ARM\x64':
            fail()
        return kernel
    finally:
        os.close(descriptor)


def main(argv=None):
    class Arguments(argparse.ArgumentParser):
        def error(self, message):
            self.exit(2, FAILED + '\n')
    parser = Arguments(description=__doc__, allow_abbrev=False)
    parser.add_argument('--cache', type=Path, required=True)
    parser.add_argument('--report', type=Path, required=True)
    arguments = parser.parse_args(argv)
    try:
        if (sys.platform != 'darwin' or not arguments.cache.is_absolute()
                or not arguments.report.is_absolute() or not arguments.report.parent.is_dir()
                or arguments.report.exists() or Path(str(arguments.report) + '.console.log').exists()):
            fail()
        confirmations = {'guest_stopped': True, 'groups_gone': True}
        with owned_interrupts() as state:
            with owned_temporary_directory(state, prefix='sun-world-linux-vm-',
                    dir=arguments.cache.parent,
                    cleanup_confirmed=lambda: all(confirmations.values())) as temporary:
                run = Path(temporary)
                execute([sys.executable, str(ROOT / 'scripts/prepare-agent-linux-guest.py'),
                    '--cache', str(arguments.cache), '--output', str(run / 'guest.initrd')],
                    state=state, directory=run, timeout=90, confirmations=confirmations)
                build = json.loads((run / 'guest.initrd.manifest.json').read_text())
                # The builder has verified the original compressed kernel bytes.
                contract = json.loads((ROOT / 'tools/agent-linux-vm/assets.json').read_text())
                expected = next(row['sha256'] for row in contract['assets'] if row['filename'] == 'kernel')
                kernel = kernel_bytes(arguments.cache / 'kernel', expected)
                image = run / 'kernel.Image'
                with image.open('xb') as output:
                    os.fchmod(output.fileno(), 0o600)
                    output.write(kernel)
                execute(['/usr/bin/swiftc', '-module-cache-path', str(arguments.cache.parent / 'swift-cache'),
                    str(ROOT / 'tools/agent-linux-vm/Host.swift'), '-o', str(run / 'host')],
                    state=state, directory=run, timeout=60, confirmations=confirmations)
                execute(['/usr/bin/codesign', '--force', '--sign', '-', '--entitlements',
                    str(ROOT / 'tools/agent-linux-vm/entitlements.plist'), str(run / 'host')],
                    state=state, directory=run, timeout=15, confirmations=confirmations)
                try:
                    console, control = execute([str(run / 'host'), str(image), str(run / 'guest.initrd')],
                        state=state, directory=run, timeout=110, is_vm=True, confirmations=confirmations)
                finally:
                    log = run / 'console.log'
                    if log.exists():
                        with Path(str(arguments.report) + '.console.log').open('xb') as target:
                            os.fchmod(target.fileno(), 0o600)
                            target.write(log.read_bytes())
                            target.flush()
                            os.fsync(target.fileno())
                result = verify_console(console, control)
                result['guest_build'] = build
                result['kernel_image_sha256'] = hashlib.sha256(kernel).hexdigest()
                result['owned_groups_gone'] = confirmations['groups_gone']
                if not all(confirmations.values()):
                    fail()
        result['private_run_root_removed'] = True
        with arguments.report.open('x', encoding='utf-8') as output:
            os.fchmod(output.fileno(), 0o600)
            output.write(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
            output.flush()
            os.fsync(output.fileno())
        print('AGENT_LINUX_VM_VALIDATED')
        return 0
    except BaseException as error:
        print(FAILED, file=sys.stderr)
        return 130 if isinstance(error, KeyboardInterrupt) else 1


if __name__ == '__main__':
    sys.exit(main())
