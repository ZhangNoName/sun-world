"""Failure provenance and independent close steps; no native service or SDK."""

import asyncio
from contextlib import redirect_stderr
import importlib.util
import io
import json
import os
from pathlib import Path
from types import SimpleNamespace
import tempfile
import unittest
from unittest.mock import patch
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[3]
spec = importlib.util.spec_from_file_location('fixture_diagnostics_stack', ROOT / 'apps/api/tests/integration/sdk_stack.py')
stack = importlib.util.module_from_spec(spec)
spec.loader.exec_module(stack)
import fixture_cleanup

MARKER = 'SYNTHETIC_PRIVATE_DIAGNOSTIC_MARKER'


class Redis:
    def __init__(self, actions):
        self.actions = actions

    def scan_iter(self, **_kwargs):
        self.actions.append('redis')
        return iter(())


class FixtureCleanupDiagnosticsTests(unittest.IsolatedAsyncioTestCase):
    def fixture(self, root):
        with patch.object(stack.tempfile, 'mkdtemp', return_value=str(root)):
            return stack.Fixture('diagnostics-only')

    async def close_failure(self, fixture, actions):
        output = io.StringIO()
        with patch.object(stack.AgentStackTests, 'redis', Redis(actions), create=True), redirect_stderr(output):
            with self.assertRaisesRegex(RuntimeError, '^SDK stack cleanup is unconfirmed$'):
                await fixture.close()
        self.assertNotIn(MARKER, output.getvalue())
        self.assertIn('SDK cleanup diagnostics ', output.getvalue())
        self.assertFalse(fixture.cleanup_diagnostics.snapshot()['cleanup_confirmed'])
        self.assertTrue(fixture.root.exists())
        return fixture.cleanup_diagnostics.snapshot()['events']

    async def test_multiple_failures_keep_first_stage_and_still_close_independent_resources(self):
        with tempfile.TemporaryDirectory() as temporary:
            fixture, actions = self.fixture(Path(temporary).resolve()), []
            def listener_close():
                actions.append('listener')
                raise PermissionError(MARKER)
            def pool_close():
                actions.append('pool')
                raise OSError(MARKER)
            def mongo_drop(_name):
                actions.append('mongo-drop')
                raise TimeoutError(MARKER)
            fixture.listener = SimpleNamespace(close=listener_close)
            fixture.pool = SimpleNamespace(close=pool_close)
            fixture.mongo = SimpleNamespace(drop_database=mongo_drop, close=lambda: actions.append('mongo-close'))
            events = await self.close_failure(fixture, actions)
            self.assertEqual(['listener', 'pool', 'mongo-drop', 'mongo-close', 'redis'], actions)
            self.assertEqual(['listener_close', 'mysql_pool_close', 'mongo_drop'], [event['stage'] for event in events])
            self.assertEqual(['permission_denied', 'io_failed', 'timeout'], [event['category'] for event in events])

    async def test_failed_worker_term_does_not_skip_kill_or_remaining_resources(self):
        with tempfile.TemporaryDirectory() as temporary:
            fixture, actions = self.fixture(Path(temporary).resolve()), []
            class Process:
                pid, returncode = os.getpid(), None
                def __init__(self):
                    self.stdin = SimpleNamespace(write=self.write)
                def write(self, _body):
                    raise PermissionError(MARKER)
                def terminate(self):
                    actions.append('term')
                    raise PermissionError(MARKER)
                def kill(self):
                    actions.append('kill')
                    self.returncode = -9
                async def wait(self):
                    return self.returncode
            fixture.worker_process, fixture.expected_worker_crash = Process(), True
            events = await self.close_failure(fixture, actions)
            self.assertEqual(['term', 'kill', 'redis'], actions)
            self.assertEqual(['worker_stop_input', 'worker_force_term'], [event['stage'] for event in events])

    async def test_workspace_delete_failure_is_visible_without_raw_path_or_error(self):
        with tempfile.TemporaryDirectory() as temporary:
            fixture, actions = self.fixture(Path(temporary).resolve()), []
            with patch.object(fixture_cleanup.shutil, 'rmtree', side_effect=PermissionError(MARKER)):
                events = await self.close_failure(fixture, actions)
            self.assertEqual(['redis'], actions)
            self.assertEqual('workspace_remove', events[0]['stage'])
            self.assertEqual('permission_denied', events[0]['category'])

    async def test_corrupt_worker_diagnostics_keep_safe_prefix_and_fail_closed(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            fixture, actions = self.fixture(root), []
            workspace = root / 'workspaces'
            workspace.mkdir(mode=0o700)
            event = dict(version='sun-world-cleanup-diagnostics/1', run_id=str(uuid4()), execution_id=str(uuid4()),
                generation=1, sequence=1, operation='finalize', stage='group_probe', category='permission_denied')
            path = workspace / 'fixture-cleanup.jsonl'
            path.write_text(json.dumps(event) + '\n' + json.dumps({MARKER: MARKER}) + '\n')
            path.chmod(0o600)
            async def wait():
                return -9
            fixture.worker_process = SimpleNamespace(pid=os.getpid(), returncode=-9, wait=wait)
            fixture.expected_worker_crash = True
            events = await self.close_failure(fixture, actions)
            self.assertEqual('worker_diagnostics_read', events[0]['stage'])
            self.assertEqual([event], fixture.worker_cleanup_diagnostics['events'])
            self.assertFalse(fixture.worker_cleanup_diagnostics['complete'])
            self.assertFalse(fixture.worker_cleanup_diagnostics['acknowledged'])

    async def test_incomplete_ack_does_not_skip_resource_cleanup_or_leak_unknown_fields(self):
        for ack in ({'event': 'stopped'}, {'event': 'stopped', MARKER: MARKER}):
            with self.subTest(ack=ack), tempfile.TemporaryDirectory() as temporary:
                fixture, actions = self.fixture(Path(temporary).resolve()), []
                async def wait():
                    return 0
                async def worker_line():
                    return ack
                fixture.worker_line = worker_line
                fixture.worker_process = SimpleNamespace(pid=os.getpid(), returncode=0, wait=wait)
                fixture.pool = SimpleNamespace(close=lambda: actions.append('pool'))
                events = await self.close_failure(fixture, actions)
                self.assertEqual(['pool', 'redis'], actions)
                self.assertIsNone(fixture.worker_stopped)
                self.assertEqual('worker_stop_ack', events[0]['stage'])
                self.assertEqual('invalid_observation', events[0]['category'])


if __name__ == '__main__':
    unittest.main()
