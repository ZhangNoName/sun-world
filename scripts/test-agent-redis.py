#!/usr/bin/env python3
"""Run admission tests on an owned Redis binary and a private Unix socket only.

No download, installed service, application configuration or credentials are used.
The exported context yields only its private root and random owner nonce so other
owned-stack validation can nest it without reaching an existing Redis instance.
"""

import argparse
import contextlib
import json
import os
import secrets
import shutil
import signal
import stat
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FORMAT = 'sun-world-owned-redis/1'


def verified_client(environment):
    """Refuse any socket/server not attested by this launcher's private marker."""
    import redis
    raw_root = environment.get('SUN_WORLD_AGENT_REDIS_ROOT', '')
    nonce = environment.get('SUN_WORLD_AGENT_REDIS_NONCE', '')
    root = Path(raw_root)
    if (not raw_root or not root.is_absolute() or root.is_symlink()
            or root.resolve() != root or not root.name.startswith('sunworld-agent-redis-')
            or len(nonce) != 64 or any(char not in '0123456789abcdef' for char in nonce)):
        raise RuntimeError('Owned Redis attestation is required')
    info = root.stat()
    marker = root / 'owner.json'
    marker_info = marker.lstat()
    if (info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) != 0o700
            or not stat.S_ISREG(marker_info.st_mode) or marker_info.st_nlink != 1
            or marker_info.st_uid != os.getuid() or stat.S_IMODE(marker_info.st_mode) != 0o600
            or marker_info.st_size > 4096):
        raise RuntimeError('Unsafe owned Redis runtime marker')
    owned = json.loads(marker.read_text())
    socket = root / 'redis.sock'
    if (set(owned) != {'format', 'nonce', 'root', 'socket', 'pid'} or owned['format'] != FORMAT
            or not secrets.compare_digest(owned['nonce'], nonce) or owned['root'] != str(root)
            or owned['socket'] != str(socket) or type(owned['pid']) is not int or owned['pid'] <= 1):
        raise RuntimeError('Owned Redis runtime identity mismatch')
    socket_info = socket.lstat()
    if (not stat.S_ISSOCK(socket_info.st_mode) or socket_info.st_uid != os.getuid()
            or stat.S_IMODE(socket_info.st_mode) != 0o600):
        raise RuntimeError('Unsafe owned Redis socket')
    # redis-py 5.x's Redis(unix_socket_path=...) silently drops the connect
    # timeout. Configure the actual Unix connection class/pool explicitly.
    pool = redis.ConnectionPool(connection_class=redis.connection.UnixDomainSocketConnection,
        path=str(socket), db=0, socket_connect_timeout=1, socket_timeout=2,
        decode_responses=True, max_connections=32)
    client = redis.Redis(connection_pool=pool)
    try:
        config = client.config_get('port', 'unixsocket', 'dir', 'appendonly', 'save',
                                   'maxmemory', 'maxmemory-policy', 'databases')
        server = client.info('server')
        if (config.get('port') != '0' or Path(config.get('unixsocket', '')).resolve() != socket
                or Path(config.get('dir', '')).resolve() != root or config.get('appendonly') != 'no'
                or config.get('save') != '' or config.get('maxmemory') != str(32 * 1024 * 1024)
                or config.get('maxmemory-policy') != 'noeviction' or config.get('databases') != '1'
                or server.get('process_id') != owned['pid'] or os.getpgid(owned['pid']) != owned['pid']):
            raise RuntimeError('Refusing Redis not owned by this launcher')
        return client
    except Exception:
        client.close()
        client.connection_pool.disconnect()
        raise RuntimeError('Owned Redis verification failed') from None


@contextlib.contextmanager
def owned_redis(binary):
    binary = Path(binary).expanduser().resolve(strict=True)
    if not binary.is_file() or not os.access(binary, os.X_OK):
        raise ValueError('Executable redis-server is required')
    root = Path(tempfile.mkdtemp(prefix='sunworld-agent-redis-',
        dir='/private/tmp' if sys.platform == 'darwin' else None)).resolve()
    root.chmod(0o700)
    socket = root / 'redis.sock'
    if len(str(socket).encode()) > 100:
        shutil.rmtree(root)
        raise ValueError('Temporary Redis socket path is too long')
    nonce = secrets.token_hex(32)
    environment = {'SUN_WORLD_AGENT_REDIS_ROOT': str(root), 'SUN_WORLD_AGENT_REDIS_NONCE': nonce}
    process = None
    previous = {}
    def interrupted(_signum, _frame):
        for signum in (signal.SIGINT, signal.SIGTERM):
            signal.signal(signum, signal.SIG_IGN)
        raise KeyboardInterrupt
    if threading.current_thread() is threading.main_thread():
        for signum in (signal.SIGINT, signal.SIGTERM):
            previous[signum] = signal.signal(signum, interrupted)
    try:
        log = root / 'redis.log'
        descriptor = os.open(log, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, 'wb') as output:
            process = subprocess.Popen([str(binary), '--port', '0', '--unixsocket', str(socket),
                '--unixsocketperm', '600', '--dir', str(root), '--pidfile', str(root / 'redis.pid'),
                '--daemonize', 'no', '--save', '', '--appendonly', 'no', '--databases', '1',
                '--maxmemory', '32mb', '--maxmemory-policy', 'noeviction', '--loglevel', 'warning'],
                stdout=output, stderr=subprocess.STDOUT, start_new_session=True,
                env={'PATH': '/usr/bin:/bin:/usr/sbin:/sbin', 'HOME': str(root), 'TMPDIR': str(root),
                     'LC_ALL': 'C', 'TZ': 'UTC'})
            marker = root / 'owner.json'
            descriptor = os.open(marker, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(descriptor, 'w') as output:
                json.dump(dict(format=FORMAT, nonce=nonce, root=str(root),
                               socket=str(socket), pid=process.pid), output)
            deadline = time.monotonic() + 15
            while True:
                if process.poll() is not None:
                    raise RuntimeError('Owned Redis exited before readiness')
                try:
                    client = verified_client(environment)
                except Exception:
                    if time.monotonic() >= deadline:
                        raise RuntimeError('Owned Redis readiness timed out') from None
                    time.sleep(.05)
                    continue
                client.close()
                client.connection_pool.disconnect()
                break
            yield environment
    finally:
        try:
            if process is not None and process.poll() is None:
                try:
                    os.killpg(process.pid, signal.SIGTERM)
                except ProcessLookupError:
                    pass
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    try:
                        os.killpg(process.pid, signal.SIGKILL)
                    except ProcessLookupError:
                        pass
                    process.wait(timeout=3)
            if process is not None and process.poll() is None:
                raise RuntimeError('Owned Redis process cleanup is unconfirmed')
            shutil.rmtree(root)
        finally:
            for signum, handler in previous.items():
                signal.signal(signum, handler)
        # Leave the private marker/data intact if process cleanup is unconfirmed.


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--redis-server', required=True, type=Path)
    arguments = parser.parse_args()
    try:
        with owned_redis(arguments.redis_server) as environment:
            print('Owned Redis ready: private Unix socket, TCP disabled, persistence disabled.', flush=True)
            result = subprocess.run([sys.executable, '-m', 'unittest', 'discover', '-v',
                '-s', str(ROOT / 'apps/api/tests/integration'), '-p', 'test_agent_admission_redis.py'],
                cwd=ROOT, env={**os.environ, **environment, 'PYTHONUNBUFFERED': '1'}, timeout=180)
            return result.returncode
    except KeyboardInterrupt:
        print('Owned Redis test interrupted; cleanup completed.', file=sys.stderr)
        return 130
    except Exception:
        print('Owned Redis validation failed; no shared configuration was used.', file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
