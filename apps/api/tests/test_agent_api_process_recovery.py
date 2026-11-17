"""Offline adapters and actual owned child cleanup; no database/SDK/provider."""

import asyncio
import json
import os
from pathlib import Path
import secrets
import select
import signal
import socket
import subprocess
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, patch
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'apps/api'))
sys.path.insert(0, str(ROOT / 'apps/api/tests/integration'))
import api_process_host as host
import api_process_fixture as fixture_module
import api_process_recovery as recovery

MARKER = 'SYNTHETIC_PRIVATE_API_PROCESS_INPUT'
ERROR = '^AGENT_API_PROCESS_FIXTURE_FAILED$'


class ProtocolTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix='sun-world-sdk-stack-', dir=ROOT / '.tmp')
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name).resolve()
        for name in ('key.pem', 'cert.pem'):
            (self.root / name).write_bytes(b'synthetic metadata-only TLS fixture')
            (self.root / name).chmod(0o600)

    def config(self):
        return dict(version=host.VERSION, root=str(self.root), database='sunworld_sdk_' + uuid4().hex,
            namespace='agent:sdk:' + uuid4().hex + ':{sun-world}', auth_secret=secrets.token_urlsafe(32),
            gateway_secret=secrets.token_urlsafe(32), worker_secret=secrets.token_urlsafe(32),
            origin='https://localhost:43210', worker_origin='https://127.0.0.1:43211',
            bundle_hash='a' * 64, phase='accepted', listener_fd=7,
            owned_env={key: str(self.root) for key in host.ENV_KEYS})

    def test_exact_private_configuration_and_metadata_rejections(self):
        value = self.config()
        self.assertEqual(host.configuration(value), value)
        for changed in ({'version': MARKER}, {'url': MARKER}, {'phase': MARKER},
                {'listener_fd': True}, {'origin': 'https://outside.invalid:43210'},
                {'database': 'business'}, {'owned_env': {'BUSINESS_SECRET': MARKER}},
                {'root': 'relative'}):
            with self.assertRaisesRegex(RuntimeError, ERROR):
                host.configuration({**value, **changed})
        (self.root / 'key.pem').chmod(0o644)
        with self.assertRaisesRegex(RuntimeError, ERROR):
            host.configuration(value)

    def test_cut_adapter_observes_actual_return_before_bounded_gate(self):
        events = []
        run_id = str(uuid4())
        def accept():
            events.append('commit-returned')
            return SimpleNamespace(created=True, run={'id': run_id})
        application = SimpleNamespace(ledger=SimpleNamespace(accept=accept),
            gateway=SimpleNamespace(_check=lambda *args, **kwargs: None))
        host.install_hooks(application, 'accepted', lambda value: events.append(value['event']))
        with patch.object(host.threading.Event, 'wait', return_value=False) as gate:
            with self.assertRaisesRegex(RuntimeError, ERROR):
                application.ledger.accept()
        self.assertEqual(events, ['commit-returned', 'accepted'])
        gate.assert_called_once_with(12)

    def test_capture_only_follows_successful_real_gateway_validation(self):
        events = []
        check = lambda *args, **kwargs: ('validated', 'principal')
        application = SimpleNamespace(ledger=None, gateway=SimpleNamespace(_check=check))
        host.install_hooks(application, 'model_hold', events.append)
        call = SimpleNamespace(run_id=str(uuid4()), execution_id=str(uuid4()), generation=1,
            service_credential=secrets.token_urlsafe(32), token=secrets.token_urlsafe(32))
        self.assertEqual(application.gateway._check(None, call, 'model'), ('validated', 'principal'))
        self.assertEqual(len(events), 1)
        self.assertEqual(fixture_module.event_value(json.dumps(events[0]).encode()), events[0])
        application.gateway._check(None, call, 'model')
        self.assertEqual(len(events), 1)
        denied = SimpleNamespace(ledger=None, gateway=SimpleNamespace(_check=lambda *a, **k: (_ for _ in ()).throw(RuntimeError())))
        host.install_hooks(denied, 'model_hold', events.append)
        with self.assertRaises(RuntimeError):
            denied.gateway._check(None, call, 'model')
        self.assertEqual(len(events), 1)

    def test_report_exclusive_private_and_failed_prefix_has_nullable_checks(self):
        path = self.root / 'new.json'
        report = recovery.Report(path)
        try:
            report.value['cases'].append(recovery.observation('accepted'))
            report.save()
            value = json.loads(path.read_bytes())
            self.assertFalse(value['passed'])
            self.assertIsNone(value['cases'][0]['old_callback_rejected'])
            self.assertIsNone(value['cases'][0]['deadline_reconciled'])
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            with self.assertRaises(FileExistsError):
                recovery.Report(path)
        finally:
            report.close()

    def test_bad_child_stdin_and_unknown_argv_are_fixed_and_do_not_start_resources(self):
        script = ROOT / 'apps/api/tests/integration/api_process_host.py'
        for args, data in (([], b'{}\n'), ([MARKER], b'{}\n'),
                ([], ('{"private":"' + MARKER + '"}\n').encode())):
            result = subprocess.run([sys.executable, str(script), *args], input=data,
                stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                env={'PATH': '/usr/bin:/bin'}, timeout=8, check=False)
            self.assertEqual(result.returncode, 1)
            value = fixture_module.event_value(result.stdout)
            self.assertEqual(set(value), {'event', 'code', 'stage', 'error_type', 'line'})
            self.assertEqual(value['event'], 'error')
            self.assertEqual(value['stage'], 'configuration')
            self.assertNotIn(MARKER.encode(), result.stdout)
            self.assertEqual(result.stderr, b'')

    def test_child_diagnostic_is_closed_projection_without_exception_text(self):
        class PrivateError(Exception):
            def __str__(self):
                raise AssertionError('Exception text must not be accessed')
        error = PrivateError(MARKER)
        value = host.error_projection(error)
        self.assertEqual(set(value), {'stage', 'error_type', 'line'})
        self.assertEqual(value['error_type'], 'OtherError')
        self.assertNotIn(MARKER, json.dumps(value))
        baseline = {'event': 'error', 'code': host.ERROR, **value}
        self.assertEqual(fixture_module.event_value(json.dumps(baseline).encode()), baseline)
        for changed in ({'stage': MARKER}, {'error_type': MARKER}, {'line': True},
                {'line': 65537}, {'message': MARKER}):
            with self.assertRaisesRegex(RuntimeError, ERROR):
                fixture_module.event_value(json.dumps({**baseline, **changed}).encode())

    def test_primary_bootstrap_stage_survives_later_cleanup_stage(self):
        with patch.object(host, '_FAILURE', None), patch.object(host, '_STAGE', 'application'):
            host.remember_failure(TypeError(MARKER))
            host._STAGE = 'cleanup'
            host.remember_failure(OSError(MARKER))
            self.assertEqual(host._FAILURE, {'stage': 'application', 'error_type': 'TypeError', 'line': 0})

    def test_explicit_linux_mode_never_selects_platform_from_input_or_environment(self):
        with patch.object(host.sys, 'platform', 'linux'):
            self.assertTrue(host.linux_mode(['--linux-stack']))
            for arguments in ([], ['--linux-stack', MARKER], [MARKER]):
                with self.assertRaisesRegex(RuntimeError, ERROR):
                    host.linux_mode(arguments)
        with patch.object(host.sys, 'platform', 'darwin'):
            self.assertFalse(host.linux_mode([]))
            with self.assertRaisesRegex(RuntimeError, ERROR):
                host.linux_mode(['--linux-stack'])
        for platform, linux in (('linux', False), ('darwin', True), ('darwin', 1)):
            with patch.object(fixture_module.sys, 'platform', platform), \
                    patch.object(fixture_module.stack.Fixture, '__init__') as base:
                with self.assertRaisesRegex(RuntimeError, ERROR):
                    fixture_module.ProcessFixture('accepted', linux=linux)
                base.assert_not_called()
        with patch.object(fixture_module.sys, 'platform', 'linux'), \
                patch.object(fixture_module.stack.Fixture, '__init__', return_value=None) as base:
            fixture_module.ProcessFixture('accepted', linux=True)
            base.assert_called_once_with('complete', linux=True)

    def test_linux_report_starts_unverified_and_ack_projection_uses_actual_observation(self):
        report = recovery.Report(self.root / 'linux.json', linux=True)
        try:
            self.assertEqual(report.value['platform'], 'linux-cgroup-bubblewrap')
            self.assertFalse(report.value['linux_verified'])
            record = recovery.observation('accepted')
            self.assertIsNone(record['linux_observation'])
            fixture = SimpleNamespace(worker_stopped={'start_count': 0},
                worker_cleanup_diagnostics={'complete': True, 'acknowledged': False})
            recovery.worker_observation(fixture, record)
            self.assertEqual(record['worker_start_count'], 0)
            self.assertFalse(record['worker_acknowledged'])
            fixture.worker_cleanup_diagnostics['acknowledged'] = True
            recovery.worker_observation(fixture, record)
            self.assertTrue(record['worker_acknowledged'])
        finally:
            report.close()

    def test_portable_probe_accepts_owned_empty_listener_and_preserves_it(self):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
            listener.bind(('127.0.0.1', 0))
            listener.listen(1)
            origin = 'https://localhost:' + str(listener.getsockname()[1])
            host.verify_listener(listener, origin)
            self.assertFalse(listener.getblocking())
            with self.assertRaises(BlockingIOError):
                listener.accept()

    def test_portable_probe_refuses_bound_nonlistener_udp_wildcard_and_wrong_port(self):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as bound:
            bound.bind(('127.0.0.1', 0))
            with self.assertRaises(OSError):
                host.verify_listener(bound, 'https://localhost:' + str(bound.getsockname()[1]))
        for kind, address in ((socket.SOCK_DGRAM, '127.0.0.1'), (socket.SOCK_STREAM, '0.0.0.0')):
            with socket.socket(socket.AF_INET, kind) as other:
                other.bind((address, 0))
                if kind == socket.SOCK_STREAM:
                    other.listen(1)
                with self.assertRaisesRegex(RuntimeError, ERROR):
                    host.verify_listener(other, 'https://localhost:' + str(other.getsockname()[1]))
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
            listener.bind(('127.0.0.1', 0))
            listener.listen(1)
            wrong = listener.getsockname()[1] % 65535 + 1
            with self.assertRaisesRegex(RuntimeError, ERROR):
                host.verify_listener(listener, 'https://localhost:' + str(wrong))

    def test_portable_probe_closes_queued_pre_ready_peer_without_consuming_data(self):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener, \
                socket.socket(socket.AF_INET, socket.SOCK_STREAM) as peer:
            listener.bind(('127.0.0.1', 0))
            listener.listen(1)
            peer.settimeout(1)
            peer.connect(listener.getsockname())
            self.assertTrue(select.select([listener], [], [], 1)[0])
            host.verify_listener(listener, 'https://localhost:' + str(listener.getsockname()[1]))
            self.assertEqual(peer.recv(1), b'')
            with self.assertRaises(BlockingIOError):
                listener.accept()


class OwnedApiChildTests(unittest.IsolatedAsyncioTestCase):
    async def owned(self):
        process = await asyncio.create_subprocess_exec(sys.executable, '-I', '-c',
            'import time; time.sleep(60)', stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL,
            env={'PATH': '/usr/bin:/bin'})
        actual_kill, actual_wait = process.kill, process.wait
        async def cleanup():
            if process.returncode is None:
                actual_kill()
            await asyncio.wait_for(actual_wait(), 3)
            if process.stdin:
                process.stdin.close()
        self.addAsyncCleanup(cleanup)
        fixture = fixture_module.ProcessFixture.__new__(fixture_module.ProcessFixture)
        fixture.api_process, fixture.api_reader = process, None
        fixture.api_sigkills, fixture._confirmed_api_kill = 0, None
        fixture.worker_process = SimpleNamespace(returncode=None)
        return fixture, process

    async def test_real_kill_receipt_allows_cleanup_before_restart_only_for_same_handle(self):
        fixture, process = await self.owned()
        await fixture.kill_api()
        self.assertEqual(process.returncode, -signal.SIGKILL)
        self.assertTrue(fixture.api_cleanup_confirmed())
        await fixture.stop_api()
        other, other_process = await self.owned()
        fixture.api_process = other_process
        self.assertFalse(fixture.api_cleanup_confirmed())
        other_process.kill()
        await other_process.wait()
        with self.assertRaisesRegex(RuntimeError, ERROR):
            await fixture.stop_api()

    async def test_term_denial_still_attempts_actual_kill_wait_and_pipe_drain(self):
        fixture, process = await self.owned()
        wait = process.wait
        calls = 0
        async def pending_then_real():
            nonlocal calls
            calls += 1
            if calls == 1:
                raise TimeoutError
            return await wait()
        with patch.object(process, 'terminate', side_effect=PermissionError(MARKER)), \
                patch.object(process, 'wait', side_effect=pending_then_real), \
                patch.object(fixture, '_drain_api_pipes', new_callable=AsyncMock) as pipes:
            with self.assertRaisesRegex(RuntimeError, ERROR):
                await fixture.stop_api()
            pipes.assert_awaited_once()
        self.assertEqual(process.returncode, -signal.SIGKILL)
        self.assertGreaterEqual(calls, 2)
        self.assertFalse(fixture.api_cleanup_confirmed())  # No graceful app ACK.

    async def test_api_cleanup_failure_cannot_skip_base_resource_cleanup(self):
        fixture = fixture_module.ProcessFixture.__new__(fixture_module.ProcessFixture)
        fixture.api_close_failed = False
        with patch.object(fixture, 'stop_api', new_callable=AsyncMock, side_effect=RuntimeError()), \
                patch.object(fixture_module.stack.Fixture, 'close', new_callable=AsyncMock) as base:
            with self.assertRaisesRegex(RuntimeError, ERROR):
                await fixture.close()
            base.assert_awaited_once()
        self.assertTrue(fixture.api_close_failed)
        with self.assertRaisesRegex(RuntimeError, ERROR):
            await fixture.close_owned_containment()

    async def test_report_checkpoint_failure_precedes_fixture_allocation(self):
        report = SimpleNamespace(value={'cases': []}, save=lambda: (_ for _ in ()).throw(OSError(MARKER)))
        with patch.object(recovery.stack.AgentStackTests, 'setUpClass'), \
                patch.object(recovery.stack.AgentStackTests, 'tearDownClass') as close, \
                patch.object(recovery.sys, 'platform', 'darwin'), \
                patch.object(recovery, 'ProcessFixture') as create:
            with self.assertRaises(OSError):
                await recovery.run_matrix(report)
            create.assert_not_called()
            close.assert_called_once()


if __name__ == '__main__':
    unittest.main()
