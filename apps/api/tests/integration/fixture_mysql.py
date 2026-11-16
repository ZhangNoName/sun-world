"""Owned socket-only MySQL, with an explicit same-datadir crash operation.

Test infrastructure only. No config, shared socket, existing datadir, or PID
input is accepted. Signals target live Popen handles created in this context.
"""

from contextlib import contextmanager
import json
import os
from pathlib import Path
import secrets
import signal
import subprocess
import sys
import time

from fixture_signals import owned_interrupts, owned_temporary_directory


class OwnedMySQL:
    def __init__(self, binary, directory, output, interrupts):
        self.binary = binary
        self.directory = directory
        self.data = directory / 'data'
        self.socket = directory / 'mysql.sock'
        self.output = output
        self.interrupts = interrupts
        self.process = None
        self.identity = None
        self.crashes = []
        self.nonce = secrets.token_hex(32)
        self.environment = {
            'SUN_WORLD_AGENT_MYSQL_ROOT': str(directory),
            'SUN_WORLD_AGENT_MYSQL_NONCE': self.nonce,
        }
        self.server_env = {'PATH': '/usr/bin:/bin:/usr/sbin:/sbin', 'HOME': str(directory),
                           'TMPDIR': str(directory), 'LC_ALL': 'C', 'TZ': 'UTC'}
        self.common = [str(binary), '--no-defaults', f'--basedir={binary.parent.parent}',
                       f'--datadir={self.data}']

    def _spawn(self, arguments):
        if self.process is not None and self.process.poll() is None:
            raise RuntimeError('Owned MySQL process is still live')
        with self.interrupts.defer():
            self.process = subprocess.Popen([*self.common, *arguments], stdout=self.output,
                stderr=subprocess.STDOUT, start_new_session=True, env=self.server_env)

    def initialize(self):
        if len(str(self.socket).encode()) > 100:
            raise ValueError('Temporary socket path is too long')
        self.data.mkdir(mode=0o700)
        (self.directory / 'files').mkdir(mode=0o700)
        marker = self.directory / 'owner.json'
        with marker.open('x') as stream:
            marker.chmod(0o600)
            json.dump({'nonce': self.nonce, 'data': str(self.data), 'socket': str(self.socket)}, stream)
        self._spawn(['--initialize-insecure', '--innodb-buffer-pool-size=64M'])
        if self.process.wait(timeout=120) != 0:
            raise RuntimeError('Owned MySQL initialization failed')
        self.start()

    def connect(self, **options):
        import pymysql
        return pymysql.connect(unix_socket=str(self.socket), user='root', password='',
            connect_timeout=2, read_timeout=5, write_timeout=5, **options)

    def start(self):
        self._spawn(['--skip-networking', '--mysqlx=0', f'--socket={self.socket}',
            f'--pid-file={self.directory / "mysqld.pid"}', '--innodb-buffer-pool-size=64M',
            '--innodb-redo-log-capacity=32M', '--innodb-flush-log-at-trx-commit=1',
            '--performance-schema=OFF', '--skip-log-bin',
            f'--secure-file-priv={self.directory / "files"}'])
        import pymysql
        deadline = time.monotonic() + 45
        while True:
            if self.process.poll() is not None:
                raise RuntimeError('Owned mysqld exited before readiness')
            try:
                connection = self.connect()
            except pymysql.Error:
                if time.monotonic() >= deadline:
                    raise TimeoutError('Owned mysqld readiness timed out') from None
                time.sleep(.1)
                continue
            try:
                with connection.cursor() as cursor:
                    cursor.execute('SELECT @@datadir,@@socket,@@skip_networking,VERSION(),'
                                   '@@server_uuid,@@innodb_flush_log_at_trx_commit')
                    data, socket, networking, version, identity, durability = cursor.fetchone()
                    if (Path(data).resolve() != self.data or Path(socket).resolve() != self.socket
                            or networking != 1 or durability != 1
                            or (self.identity is not None and identity != self.identity)):
                        raise RuntimeError('Refusing an unowned or changed MySQL instance')
                    self.identity, self.version = identity, version
            finally:
                connection.close()
            return

    def crash_restart(self):
        if self.process is None or self.process.poll() is not None or self.identity is None:
            raise RuntimeError('A live verified owned mysqld is required')
        with self.interrupts.defer():
            previous = self.process
            previous.kill()
            if previous.wait(timeout=10) != -signal.SIGKILL:
                raise RuntimeError('Owned mysqld SIGKILL was not confirmed')
            self.start()
            self.crashes.append({'signal': 'SIGKILL', 'exit_confirmed': True,
                'same_server_uuid': True, 'same_datadir': True, 'same_socket': True,
                'tcp_disabled': True, 'flush_log_at_trx_commit': 1})

    def stop(self):
        with self.interrupts.defer():
            if self.process is not None and self.process.poll() is None:
                self.process.terminate()
                try:
                    self.process.wait(timeout=15)
                except subprocess.TimeoutExpired:
                    self.process.kill()
                    self.process.wait(timeout=5)
            if self.process is not None and self.process.poll() is None:
                raise RuntimeError('Owned mysqld process cleanup is unconfirmed')


@contextmanager
def owned_mysql(binary):
    binary = binary.expanduser().resolve(strict=True)
    if not binary.is_file() or not os.access(binary, os.X_OK):
        raise ValueError('Executable mysqld is required')
    server = None
    with owned_interrupts() as interrupts:
        with owned_temporary_directory(interrupts, prefix='sunworld-agent-mysql-',
                cleanup_confirmed=lambda: server is None or server.process is None
                    or server.process.poll() is not None,
                dir='/private/tmp' if sys.platform == 'darwin' else None) as temporary:
            directory = Path(temporary).resolve()
            with (directory / 'mysqld.log').open('wb') as output:
                server = OwnedMySQL(binary, directory, output, interrupts)
                try:
                    server.initialize()
                    print(f'Disposable MySQL {server.version}; Unix socket only; no shared config loaded.', flush=True)
                    print('Owned runtime:', directory, flush=True)
                    yield server
                finally:
                    server.stop()
