"""Real-provider four-case evaluation through a privileged test-only channel."""

import asyncio
import hashlib
import json
import os
from pathlib import Path
import subprocess
import stat
import sys

from linux_sdk_stack import linux_fixture_class
from model_evaluation import evaluate_real_model


def check_live_sdk_devices(fixture):
    serial = os.stat('/dev/hvc1')
    if not stat.S_ISCHR(serial.st_mode) or serial.st_rdev <= 0:
        raise RuntimeError('AGENT_LINUX_OFFICIAL_FAILED')
    containment = fixture.containment
    children = containment._children()
    if len(children) != 1:
        raise RuntimeError('AGENT_LINUX_OFFICIAL_FAILED')
    leaf, identity = children[0]
    raw = containment._read(leaf/'cgroup.procs').splitlines()
    if not 1 <= len(raw) <= 64 or any(not p.isascii() or not p.isdecimal() or not 1 <= int(p) <= 2147483647 for p in raw):
        raise RuntimeError('AGENT_LINUX_OFFICIAL_FAILED')
    checked = 0
    for pid in raw:
        try:
            with os.scandir('/proc/'+pid+'/fd') as entries:
                for index,entry in enumerate(entries):
                    if index >= 256:
                        raise RuntimeError('AGENT_LINUX_OFFICIAL_FAILED')
                    try:
                        info = entry.stat(follow_symlinks=True)
                    except FileNotFoundError:
                        continue
                    if stat.S_ISCHR(info.st_mode) and info.st_rdev == serial.st_rdev:
                        raise RuntimeError('AGENT_LINUX_OFFICIAL_FAILED')
            if pid in containment._read(leaf/'cgroup.procs').splitlines():
                checked += 1
        except FileNotFoundError:
            continue
    from linux_stack_containment import private_directory
    private_directory(leaf,identity)
    if checked == 0:
        raise RuntimeError('AGENT_LINUX_OFFICIAL_FAILED')
    fixture._official_device_checks += 1


def serial_proxy(channel, observe):
    from src.modules.ai.openai_responses import MODEL, OpenAiResponsesProxy
    from src.modules.ai.providers import ProviderConfig

    class SerialResponsesProxy(OpenAiResponsesProxy):
        async def _post(self, raw, *, counting):
            from src.modules.ai.model_proxy import _decode_json, RESPONSE_INVALID
            observe()
            value = await channel.request('count' if counting else 'generate', raw)
            return _decode_json(value, 4096 if counting else 65536, RESPONSE_INVALID)

    # No usable provider credential is created or transported. The original
    # opaque prepare/generate and strict Responses adapter remain in effect.
    return SerialResponsesProxy(ProviderConfig(provider='openai-local', model=MODEL,
        base_url='https://api.openai.com/v1', auth_mode='bearer', api_key='unavailable-in-guest'))


async def evaluate_linux_official(report_path, *, base, stream_factory, root):
    if sys.platform != 'linux':
        raise RuntimeError('AGENT_LINUX_OFFICIAL_FAILED')
    from official_channel_guest import OfficialChannelGuest
    channel = OfficialChannelGuest()
    kind = linux_fixture_class(base)
    fixtures = []
    def factory(mode, **options):
        fixture = kind(mode, **options, official_proxy_factory=lambda: serial_proxy(channel,lambda:check_live_sdk_devices(fixture)))
        fixture._official_device_checks = 0
        fixtures.append(fixture)
        return fixture
    try:
        await channel.ready()
        if json.loads(await channel.request('probe')) != {'ready':True}:
            raise RuntimeError('AGENT_LINUX_OFFICIAL_FAILED')
        # This child has close_fds=True and no control fd in pass_fds. Its
        # production bubblewrap child additionally checks path and device IDs.
        probe = await asyncio.create_subprocess_exec('/usr/local/bin/node',
            str(root / 'apps/agent-worker/tests/integration/official-device-suite.mjs'),
            stdin=subprocess.DEVNULL, env={'PATH':os.defpath}, close_fds=True)
        try:
            if await asyncio.wait_for(probe.wait(), 25) != 0:
                raise RuntimeError('AGENT_LINUX_OFFICIAL_FAILED')
        finally:
            if probe.returncode is None:
                probe.kill()
                await probe.wait()
        try:
            await evaluate_real_model(report_path, profile='openai-local', fixture_factory=factory,
                                      stream_factory=stream_factory, root=root)
        finally:
            if Path(report_path).is_file():
                from linux_stack_containment import read_bytes
                raw = read_bytes(report_path,262144,private=True)
                if not 0 < len(raw) <= 262144:
                    raise RuntimeError('AGENT_LINUX_OFFICIAL_FAILED')
                reply = json.loads(await channel.request('evaluation', raw))
                if reply != {'sha256':hashlib.sha256(raw).hexdigest()}:
                    raise RuntimeError('AGENT_LINUX_OFFICIAL_FAILED')
        rows = [fixture.linux_summary() for fixture in fixtures]
        if len(rows) != 4 or any(row['crashed'] or row['executions'] != 1 or not row['relays_closed'] for row in rows):
            raise RuntimeError('AGENT_LINUX_OFFICIAL_FAILED')
        print('SW_LINUX_OFFICIAL_STACK_RESULT '+json.dumps({
            'version':'sun-world-linux-official-stack/1','cases':4,'sdk_executions':4,
            'formal_api_and_three_databases':True,'mutual_tls':True,
            'relays_cgroups_workspaces_removed':True,'maximum_memory_peak_bytes':max(r['maximum_memory_peak_bytes'] for r in rows),
            'model_generations':sum(r['model_requests'] for r in rows),
            'live_sdk_device_checks':sum(f._official_device_checks for f in fixtures),
            'tool_calls':sum(r['tool_calls'] for r in rows)}),flush=True)
    finally:
        from src.modules.agent_runtime.cleanup import finish_cleanup
        await finish_cleanup(channel.aclose())
