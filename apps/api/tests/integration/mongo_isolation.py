"""Explicit macOS dual-Mongo socket isolation regression; never a unit gate.

Usage: project-python apps/api/tests/integration/mongo_isolation.py --mongod <verified-binary>
No application config, SDK, external service or download.
"""

import argparse
from contextlib import ExitStack
import importlib.util
import json
import os
from pathlib import Path
import stat
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[4]


def global_socket_state():
    try:
        info = Path('/tmp/mongodb-0.sock').lstat()
        return info.st_dev, info.st_ino, info.st_mode, info.st_mtime_ns
    except FileNotFoundError:
        return None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--mongod', required=True, type=Path)
    binary = parser.parse_args().mongod
    if sys.platform != 'darwin':
        raise RuntimeError('Explicit macOS lsof isolation probe only')
    spec = importlib.util.spec_from_file_location('probe_owned_mongo', ROOT / 'scripts/test-agent-mongo.py')
    launcher = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(launcher)
    before, observations = global_socket_state(), []
    with ExitStack() as contexts:
        for index in range(2):
            environment = contexts.enter_context(launcher.owned_mongo(binary))
            client = launcher.verified_client(environment)
            contexts.callback(client.close)
            owned = Path(environment['SUN_WORLD_AGENT_MONGO_ROOT'])
            pid = json.loads((owned / 'owner.json').read_text())['pid']
            options = client.admin.command('getCmdLineOpts')['parsed']['net']
            assert options['unixDomainSocket']['pathPrefix'] == str(owned)
            sockets = subprocess.run(['/usr/sbin/lsof', '-a', '-p', str(pid), '-U', '-Fn'],
                capture_output=True, text=True, check=True, timeout=5)
            names = {line[1:] for line in sockets.stdout.splitlines() if line.startswith('n/')}
            assert names and str(owned / 'mongo.sock') in names
            assert all(Path(name).parent == owned for name in names), 'Named UNIX socket escaped owned root'
            assert all(stat.S_IMODE(Path(name).stat().st_mode) == 0o600 for name in names)
            tcp = subprocess.run(['/usr/sbin/lsof', '-a', '-p', str(pid), '-iTCP', '-sTCP:LISTEN', '-Fn'],
                capture_output=True, text=True, timeout=5)
            assert tcp.returncode == 1 and not tcp.stdout.strip() and not tcp.stderr.strip(), 'TCP listener or lsof failure'
            client.probe.values.insert_one({'instance': index})
            assert client.probe.values.count_documents({}) == 1
            observations.append((owned, pid, sorted(names), client))
        for index, (_, _, _, client) in enumerate(observations):
            assert client.probe.values.find_one()['instance'] == index
        assert global_socket_state() == before, 'Shared default socket was changed'
        for _, pid, names, _ in observations:
            print('Concurrent owned instance: PID', pid, 'private UNIX paths', names, 'TCP LISTEN=0')
    for owned, pid, _, _ in observations:
        assert not owned.exists()
        try:
            os.kill(pid, 0)
        except ProcessLookupError:
            pass
        else:
            raise AssertionError('Owned MongoDB PID remains')
    assert global_socket_state() == before
    print('Concurrent Mongo isolation passed: distinct data, all UNIX sockets private0600, no TCP, '
          'global default unchanged, both owned PIDs/roots removed.')


if __name__ == '__main__':
    main()
