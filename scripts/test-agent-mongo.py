#!/usr/bin/env python3
"""Owned socket-only MongoDB fixture; no config, download or installed service."""

import argparse
from contextlib import contextmanager
import json
import os
from pathlib import Path
import secrets
import shutil
import signal
import stat
import subprocess
import sys
import tempfile
import threading
import time
from urllib.parse import quote
from uuid import uuid4

FORMAT = 'sun-world-owned-mongo/1'


def verified_client(environment):
    from pymongo import MongoClient
    raw = environment.get('SUN_WORLD_AGENT_MONGO_ROOT', '')
    nonce = environment.get('SUN_WORLD_AGENT_MONGO_NONCE', '')
    root = Path(raw)
    if (not raw or not root.is_absolute() or root.is_symlink() or root.resolve() != root
            or not root.name.startswith('sunworld-agent-mongo-')
            or len(nonce) != 64 or any(char not in '0123456789abcdef' for char in nonce)):
        raise RuntimeError('Owned MongoDB attestation required')
    info, marker = root.stat(), root / 'owner.json'
    marker_info = marker.lstat()
    if (info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) != 0o700
            or not stat.S_ISREG(marker_info.st_mode) or marker_info.st_nlink != 1
            or marker_info.st_uid != os.getuid() or stat.S_IMODE(marker_info.st_mode) != 0o600
            or marker_info.st_size > 4096):
        raise RuntimeError('Unsafe MongoDB fixture marker')
    proof = json.loads(marker.read_text())
    socket, data = root / 'mongo.sock', root / 'data'
    if (set(proof) != {'format', 'nonce', 'root', 'socket', 'data', 'pid'}
            or proof['format'] != FORMAT or not secrets.compare_digest(proof['nonce'], nonce)
            or proof['root'] != str(root) or proof['socket'] != str(socket) or proof['data'] != str(data)
            or type(proof['pid']) is not int or proof['pid'] <= 1):
        raise RuntimeError('Owned MongoDB identity mismatch')
    socket_info = socket.lstat()
    if (not stat.S_ISSOCK(socket_info.st_mode) or socket_info.st_uid != os.getuid()
            or stat.S_IMODE(socket_info.st_mode) != 0o600 or data.is_symlink()):
        raise RuntimeError('Unsafe MongoDB fixture socket')
    client = MongoClient('mongodb://' + quote(str(socket), safe='') + '/',
        connectTimeoutMS=1000, socketTimeoutMS=2000, serverSelectionTimeoutMS=2000,
        retryReads=False, retryWrites=False, maxPoolSize=8, directConnection=True)
    try:
        options = client.admin.command('getCmdLineOpts')['parsed']
        server = client.admin.command('serverStatus')
        unix = options['net'].get('unixDomainSocket', {})
        if (server['pid'] != proof['pid'] or options['storage']['dbPath'] != str(data)
                or options['net']['bindIp'] != str(socket) or options['net']['port'] != 0
                or unix.get('pathPrefix') != str(root)
                or type(unix.get('filePermissions')) is not int or unix['filePermissions'] != 0o600):
            raise RuntimeError('MongoDB fixture configuration mismatch')
        return client
    except BaseException:
        client.close()
        raise


@contextmanager
def owned_mongo(binary):
    binary = Path(binary).expanduser().resolve(strict=True)
    if not binary.is_file() or not os.access(binary, os.X_OK):
        raise ValueError('Executable mongod required')
    root = Path(tempfile.mkdtemp(prefix='sunworld-agent-mongo-',
        dir='/private/tmp' if sys.platform == 'darwin' else None)).resolve()
    root.chmod(0o700)
    data, socket = root / 'data', root / 'mongo.sock'
    if len(str(socket).encode()) > 100:
        shutil.rmtree(root)
        raise ValueError('MongoDB socket path too long')
    data.mkdir(mode=0o700)
    nonce = secrets.token_hex(32)
    environment = {'SUN_WORLD_AGENT_MONGO_ROOT': str(root), 'SUN_WORLD_AGENT_MONGO_NONCE': nonce}
    process, previous = None, {}

    def interrupted(_signum, _frame):
        for signum in (signal.SIGINT, signal.SIGTERM):
            signal.signal(signum, signal.SIG_IGN)
        raise KeyboardInterrupt

    if threading.current_thread() is threading.main_thread():
        for signum in (signal.SIGINT, signal.SIGTERM):
            previous[signum] = signal.signal(signum, interrupted)
    try:
        descriptor = os.open(root / 'console.log', os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, 'wb') as output:
            process = subprocess.Popen([str(binary), '--dbpath', str(data), '--bind_ip', str(socket),
                '--port', '0', '--unixSocketPrefix', str(root), '--filePermissions', '0600', '--maxConns', '32',
                '--wiredTigerCacheSizeGB', '0.25', '--setParameter', 'diagnosticDataCollectionEnabled=false',
                '--pidfilepath', str(root / 'mongod.pid'), '--logpath', str(root / 'mongod.log')],
                stdout=output, stderr=subprocess.STDOUT, start_new_session=True,
                env={'PATH': '/usr/bin:/bin:/usr/sbin:/sbin', 'HOME': str(root), 'TMPDIR': str(root),
                     'LC_ALL': 'C', 'TZ': 'UTC'})
            descriptor = os.open(root / 'owner.json', os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(descriptor, 'w') as marker:
                json.dump(dict(format=FORMAT, nonce=nonce, root=str(root), socket=str(socket),
                               data=str(data), pid=process.pid), marker)
            deadline = time.monotonic() + 25
            while True:
                if process.poll() is not None:
                    raise RuntimeError('Owned MongoDB exited before readiness')
                try:
                    client = verified_client(environment)
                except Exception:
                    if time.monotonic() >= deadline:
                        raise RuntimeError('Owned MongoDB readiness timed out') from None
                    time.sleep(.05)
                    continue
                client.close()
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
                    process.wait(timeout=15)
                except subprocess.TimeoutExpired:
                    try:
                        os.killpg(process.pid, signal.SIGKILL)
                    except ProcessLookupError:
                        pass
                    process.wait(timeout=5)
            if process is not None and process.poll() is None:
                raise RuntimeError('MongoDB fixture process cleanup unconfirmed')
            shutil.rmtree(root)
        finally:
            for signum, handler in previous.items():
                signal.signal(signum, handler)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--mongod', required=True, type=Path)
    arguments = parser.parse_args()
    try:
        with owned_mongo(arguments.mongod) as environment:
            client = verified_client(environment)
            name = 'sunworld_fixture_' + uuid4().hex
            try:
                database = client[name]
                database.blogs.insert_one({'blogId': 1, 'content': '明确标记的合成正文'})
                assert database.blogs.find_one({'blogId': 1})['content'] == '明确标记的合成正文'
                client.drop_database(name)
                print('Owned socket-only MongoDB identity and actual write/read/drop passed.', flush=True)
            finally:
                client.close()
        return 0
    except KeyboardInterrupt:
        print('Owned MongoDB interrupted; cleanup completed.', file=sys.stderr)
        return 130
    except Exception:
        print('Owned MongoDB validation failed; no shared configuration was used.', file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
