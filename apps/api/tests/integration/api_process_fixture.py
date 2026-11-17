"""Parent owns resources and Popen only; the application exists in the child."""

import asyncio
import json
import os
from pathlib import Path
import re
import signal
import sys
from uuid import UUID

import httpx

from api_process_host import ENV_KEYS, ERROR, VERSION, STAGES, ERROR_TYPES, fail
import sdk_stack as stack


def event_value(raw):
    from official_channel_codec import strict_json
    value = strict_json(raw, 8192)
    fields = {'ready': {'event'}, 'model_hold': {'event'}, 'accepted': {'event', 'run_id'},
        'credential': {'event', 'run_id', 'execution_id', 'generation', 'audience', 'token', 'service'},
        'error': {'event', 'code', 'stage', 'error_type', 'line'}}
    if (type(value) is not dict or type(value.get('event')) is not str
            or value['event'] not in fields or set(value) != fields[value['event']]):
        raise fail()
    if 'run_id' in value and str(UUID(value['run_id'])) != value['run_id']:
        raise fail()
    if value['event'] == 'error':
        if (value['code'] != ERROR or type(value['stage']) is not str or value['stage'] not in STAGES
                or type(value['error_type']) is not str or value['error_type'] not in ERROR_TYPES
                or type(value['line']) is not int or not 0 <= value['line'] <= 65536):
            raise fail()
    if value['event'] == 'credential':
        if (str(UUID(value['execution_id'])) != value['execution_id']
                or type(value['generation']) is not int or value['generation'] != 1
                or value['audience'] != 'model'
                or any(type(value[key]) is not str or not re.fullmatch('[A-Za-z0-9_-]{32,128}', value[key])
                    for key in ('token', 'service'))):
            raise fail()
    return value


class ProcessFixture(stack.Fixture):
    def __init__(self, cut):
        if sys.platform != 'darwin' or cut not in ('accepted', 'model_hold', 'completed'):
            raise fail()
        super().__init__('hold' if cut == 'model_hold' else 'complete')
        self.cut, self.api_process, self.api_reader = cut, None, None
        self.api_events, self.callback = asyncio.Queue(maxsize=64), None
        self.api_close_failed = False
        self.api_sigkills = 0
        self._confirmed_api_kill = None
        self.child_failure = None

    async def start_api_service(self):
        # The parent retains the listener but never starts an ASGI application.
        return

    async def start_application(self, worker_origin):
        self.worker_origin = worker_origin
        await self.spawn_api(self.cut)

    async def spawn_api(self, phase):
        if self.api_process is not None and self.api_process.returncode is None:
            raise fail()
        config = dict(version=VERSION, root=str(self.root), database=self.database,
            namespace=self.namespace, auth_secret=self.auth_secret, gateway_secret=self.gateway_secret,
            worker_secret=self.worker_secret, origin=self.origin, worker_origin=self.worker_origin,
            bundle_hash=self.bundle_hash, phase=phase, listener_fd=self.listener.fileno(),
            owned_env={key: os.environ[key] for key in ENV_KEYS})
        raw = json.dumps(config, allow_nan=False).encode() + b'\n'
        if len(raw) > 32768:
            raise fail()
        self.api_events = asyncio.Queue(maxsize=64)
        self.api_process = await asyncio.create_subprocess_exec(sys.executable,
            str(Path(__file__).with_name('api_process_host.py')),
            stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL, pass_fds=(self.listener.fileno(),),
            env={'PATH': '/usr/bin:/bin', 'HOME': str(self.root), 'TMPDIR': str(self.root),
                'LC_ALL': 'C', 'TZ': 'UTC', 'BLOG_RUNTIME_ENV': 'test', 'PYTHONNOUSERSITE': '1'})
        process = self.api_process
        async def receive():
            try:
                for _ in range(64):
                    line = await process.stdout.readline()
                    if not line:
                        await self.api_events.put({'event': 'eof'})
                        return
                    event = event_value(line)
                    if event['event'] == 'error' and self.child_failure is None:
                        self.child_failure = {key: event[key] for key in ('code', 'stage', 'error_type', 'line')}
                    await self.api_events.put(event)
                raise fail()
            except Exception:
                failure = {'event': 'error', 'code': ERROR, 'stage': 'channel', 'error_type': 'OtherError', 'line': 0}
                if self.child_failure is None:
                    self.child_failure = {key: failure[key] for key in ('code', 'stage', 'error_type', 'line')}
                await self.api_events.put(failure)
        self.api_reader = asyncio.create_task(receive())
        process.stdin.write(raw)
        async with asyncio.timeout(10):
            await process.stdin.drain()
            await self.wait_event('ready')
        if self.application is not None or self.server is not None:
            raise fail()

    async def wait_event(self, kind):
        async with asyncio.timeout(15):
            while True:
                value = await self.api_events.get()
                if value['event'] == 'credential':
                    self.callback = value
                if value['event'] == kind:
                    return value
                if value['event'] in ('error', 'eof'):
                    raise fail()

    async def _drain_api_pipes(self):
        if self.api_process and self.api_process.stdin:
            self.api_process.stdin.close()
            try:
                await self.api_process.stdin.wait_closed()
            except (BrokenPipeError, ConnectionResetError):
                pass
        if self.api_reader:
            async with asyncio.timeout(3):
                await self.api_reader
            self.api_reader = None

    async def kill_api(self):
        process = self.api_process
        if process is None or process.returncode is not None:
            raise fail()
        process.kill()  # Only our own live Popen, never a PID from disk/events.
        async with asyncio.timeout(5):
            await process.wait()
        if process.returncode != -signal.SIGKILL:
            raise fail()
        self._confirmed_api_kill = process
        self.api_sigkills += 1
        await self._drain_api_pipes()
        if self.worker_process.returncode is not None:
            raise fail()

    async def restart_api(self):
        if self.client:
            await self.client.aclose()
        await self.spawn_api('restarted')
        self.client = httpx.AsyncClient(base_url=self.origin, verify=self.tls, trust_env=False,
            follow_redirects=False, timeout=httpx.Timeout(10, connect=2))

    async def stop_api(self):
        process = self.api_process
        if process is None:
            return
        errors = []
        if process.returncode is None:
            try:
                process.terminate()
            except BaseException:
                errors.append(True)
            try:
                async with asyncio.timeout(15):
                    await process.wait()
            except BaseException:
                errors.append(True)
            if process.returncode is None:
                try:
                    process.kill()
                except BaseException:
                    errors.append(True)
                try:
                    async with asyncio.timeout(5):
                        await process.wait()
                except BaseException:
                    errors.append(True)
        try:
            await self._drain_api_pipes()
        except BaseException:
            errors.append(True)
        if errors or not self.api_cleanup_confirmed():
            raise fail()

    def api_cleanup_confirmed(self):
        process = self.api_process
        return (process is None or process.returncode == 0 or
            process is self._confirmed_api_kill and process.returncode == -signal.SIGKILL)

    async def close_owned_containment(self):
        if self.api_close_failed:
            raise fail()  # Base cleanup keeps the root if API close was unknown.

    async def close(self):
        try:
            await self.stop_api()
        except BaseException:
            self.api_close_failed = True
        # Always attempt Worker, SDK groups, TLS client/listener and all stores.
        await super().close()
        if self.api_close_failed:
            raise fail()

    async def quiet(self, run_id):
        from src.modules.agent_runtime.rpc import PROTOCOL
        async with asyncio.timeout(15):
            while True:
                row = await asyncio.to_thread(self.row, run_id)
                binding = {**{key: row[key] for key in ('execution_id', 'generation', 'bundle_hash')},
                    'protocol': PROTOCOL, 'run_id': run_id}
                observed = await self.worker.inspect(binding)
                if (observed['status'] in ('completed', 'failed', 'cancelled')
                        and not list((self.root / 'workspaces').glob('run-*'))):
                    return
                await asyncio.sleep(.05)
