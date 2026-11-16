#!/usr/bin/env python3
"""Run Agent integration tests on an owned, disposable, socket-only mysqld.

No application config/env/credentials are read. No shared/remote database option
exists. Supply an already verified local mysqld binary; this script downloads or
installs nothing and never registers a service or touches the binary's datadir.
"""

import argparse
import json
import os
import secrets
import signal
import subprocess
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def run(binary, *, test_command=None, extra_env=None, test_runner=None):
    import pymysql
    binary = binary.expanduser().resolve(strict=True)
    if not binary.is_file() or not os.access(binary, os.X_OK):
        raise ValueError('Executable mysqld is required')
    basedir = binary.parent.parent
    process = None
    with tempfile.TemporaryDirectory(prefix='sunworld-agent-mysql-',
                                      dir='/private/tmp' if sys.platform == 'darwin' else None) as temporary:
        directory = Path(temporary).resolve()
        data, socket = directory / 'data', directory / 'mysql.sock'
        # Unix socket address limits are platform-specific; fail rather than
        # silently connecting to a default/shared socket when the path is long.
        if len(str(socket).encode()) > 100:
            raise ValueError('Temporary socket path is too long')
        data.mkdir(mode=0o700)
        files = directory / 'files'
        files.mkdir(mode=0o700)
        nonce = secrets.token_hex(32)
        marker = directory / 'owner.json'
        marker.write_text(json.dumps({'nonce': nonce, 'data': str(data), 'socket': str(socket)}))
        marker.chmod(0o600)
        log = directory / 'mysqld.log'
        server_env = {'PATH': '/usr/bin:/bin:/usr/sbin:/sbin', 'HOME': str(directory),
                      'TMPDIR': str(directory), 'LC_ALL': 'C', 'TZ': 'UTC'}
        common = [str(binary), '--no-defaults', f'--basedir={basedir}', f'--datadir={data}']
        with log.open('wb') as output:
            subprocess.run([*common, '--initialize-insecure', '--innodb-buffer-pool-size=64M'],
                           stdout=output, stderr=subprocess.STDOUT, check=True, timeout=120, env=server_env)
            try:
                process = subprocess.Popen([*common, '--skip-networking', '--mysqlx=0',
                    f'--socket={socket}', f'--pid-file={directory / "mysqld.pid"}',
                    '--innodb-buffer-pool-size=64M', '--innodb-redo-log-capacity=32M',
                    '--performance-schema=OFF', '--skip-log-bin', f'--secure-file-priv={files}'],
                    stdout=output, stderr=subprocess.STDOUT, start_new_session=True, env=server_env)
                deadline = time.monotonic() + 45
                while True:
                    if process.poll() is not None:
                        raise RuntimeError('Owned mysqld exited before readiness')
                    try:
                        connection = pymysql.connect(unix_socket=str(socket), user='root', password='',
                                                     connect_timeout=1, read_timeout=2)
                    except pymysql.Error:
                        if time.monotonic() >= deadline:
                            raise TimeoutError('Owned mysqld readiness timed out') from None
                        time.sleep(.1)
                        continue
                    try:
                        with connection.cursor() as cursor:
                            cursor.execute('SELECT @@datadir, @@socket, @@skip_networking, VERSION()')
                            actual_data, actual_socket, disabled_network, version = cursor.fetchone()
                            if Path(actual_data).resolve() != data or Path(actual_socket).resolve() != socket or disabled_network != 1:
                                raise RuntimeError('Refusing a database not owned by this launcher')
                            print(f'Disposable MySQL {version}; Unix socket only; no shared config loaded.', flush=True)
                            print('Owned runtime:', directory, flush=True)
                    finally:
                        connection.close()
                    break
                env = {**os.environ, **(extra_env or {}),
                       'SUN_WORLD_AGENT_MYSQL_ROOT': str(directory),
                       'SUN_WORLD_AGENT_MYSQL_NONCE': nonce, 'PYTHONUNBUFFERED': '1'}
                command = ([sys.executable, '-m', 'unittest', 'discover', '-v',
                    '-s', str(ROOT / 'apps/api/tests/integration'), '-p', 'test_agent_mysql.py']
                    if test_command is None else test_command)
                if (not isinstance(command, (tuple, list)) or not command
                        or any(not isinstance(value, str) or not value for value in command)):
                    raise ValueError('Explicit nonempty test command required')
                tests = (test_runner or subprocess.run)(command,
                    cwd=ROOT, env=env, timeout=180)
                return tests.returncode
            finally:
                if process is not None and process.poll() is None:
                    os.killpg(process.pid, signal.SIGTERM)
                    try:
                        process.wait(timeout=15)
                    except subprocess.TimeoutExpired:
                        os.killpg(process.pid, signal.SIGKILL)
                        process.wait(timeout=5)
                print('Owned mysqld stopped; disposable datadir removed on exit.', flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--mysqld', required=True, type=Path)
    args = parser.parse_args()
    def interrupted(_signal, _frame):
        # Let owned-process/data cleanup finish even if a second stop arrives.
        signal.signal(signal.SIGTERM, signal.SIG_IGN)
        signal.signal(signal.SIGINT, signal.SIG_IGN)
        raise KeyboardInterrupt
    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGINT, interrupted)
    try:
        return run(args.mysqld)
    except KeyboardInterrupt:
        print('Disposable MySQL test interrupted; owned cleanup completed.', file=sys.stderr)
        return 130
    except Exception as error:
        # Runtime paths are synthetic; no application credentials or configs
        # entered this process. Keep external driver/binary diagnostics private.
        print(f'Disposable MySQL test failed ({type(error).__name__}). No shared database was used.', file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
