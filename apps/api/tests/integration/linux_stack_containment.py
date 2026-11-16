"""Own only this live fixture's cgroup tree; never adopt paths or signal PIDs."""

from copy import deepcopy
import json
import os
from pathlib import Path
import re
import signal
import stat
import subprocess
import sys
import tempfile
import time

ERROR = 'AGENT_LINUX_STACK_CONTAINMENT_FAILED'
MAX_SAFE = 9007199254740991
CAP = 536870912
KERNEL_FIELDS = ('memory_current_bytes', 'memory_peak_bytes', 'memory_max_bytes',
    'swap_max_bytes', 'pids_current', 'pids_max', 'memory_oom', 'memory_oom_kill',
    'memory_limit_events', 'pids_limit_events', 'populated')
GATEWAY_FIELDS = ('accepted_connections', 'active_connections', 'rejected_connections',
    'connect_failures', 'byte_limit_events', 'timeout_events', 'bytes_forwarded')


def fail():
    return RuntimeError(ERROR)


def integer(value):
    return type(value) is int and 0 <= value <= MAX_SAFE


def exact(value, keys):
    return type(value) is dict and set(value) == set(keys)


def read_bytes(path, maximum, *, private=False):
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        info = os.fstat(descriptor)
        if (not stat.S_ISREG(info.st_mode)
                or info.st_uid not in ((os.getuid(),) if private else (0, os.getuid()))
                or (private and (info.st_nlink != 1 or stat.S_IMODE(info.st_mode) != 0o600))
                or info.st_size > maximum):
            raise fail()
        chunks, size = [], 0
        while size <= maximum:
            part = os.read(descriptor, min(16384, maximum + 1 - size))
            if not part:
                break
            chunks.append(part)
            size += len(part)
        if size > maximum:
            raise fail()
        return b''.join(chunks)
    finally:
        os.close(descriptor)


def pairs(items):
    result = {}
    for key, value in items:
        if key in result:
            raise fail()
        result[key] = value
    return result


def forbidden_number(_):
    raise fail()


def kernel_sample(value, *, require_peak):
    if (not exact(value, KERNEL_FIELDS)
            or not all(integer(value[key]) for key in KERNEL_FIELDS)
            or value['memory_max_bytes'] != CAP or value['swap_max_bytes'] != 0
            or value['pids_max'] != 64 or value['pids_current'] != 0
            or value['populated'] != 0 or value['memory_oom'] != 0
            or value['memory_oom_kill'] != 0 or value['pids_limit_events'] != 0
            or not (int(require_peak) <= value['memory_peak_bytes'] <= CAP)
            or value['memory_current_bytes'] > CAP):
        raise fail()
    return {key: value[key] for key in KERNEL_FIELDS}


def read_worker_kernel(path):
    """Strictly rebuild Node's finalized safe report; no unknown metadata escapes."""
    try:
        path = Path(path)
        if not path.is_absolute():
            raise fail()
        for ancestor in reversed(path.parents):
            if not stat.S_ISDIR(ancestor.lstat().st_mode):
                raise fail()
        raw = read_bytes(path, 131072, private=True)
        value = json.loads(raw.decode('utf-8', errors='strict'), object_pairs_hook=pairs,
            parse_float=forbidden_number, parse_constant=forbidden_number)
        if (not exact(value, ('version', 'executions', 'cgroups_empty', 'relays_closed'))
                or value['version'] != 'sun-world-linux-sdk-stack-kernel/1'
                or value['cgroups_empty'] is not True or value['relays_closed'] is not True
                or type(value['executions']) is not list or len(value['executions']) > 128):
            raise fail()
        executions = []
        for row in value['executions']:
            if not exact(row, (*KERNEL_FIELDS, 'gateway')):
                raise fail()
            sample = kernel_sample({key: row[key] for key in KERNEL_FIELDS}, require_peak=True)
            gateway = row['gateway']
            if (not exact(gateway, (*GATEWAY_FIELDS, 'closed'))
                    or not all(integer(gateway[key]) for key in GATEWAY_FIELDS)
                    or gateway['closed'] is not True or gateway['active_connections'] != 0):
                raise fail()
            sample['gateway'] = {key: gateway[key] for key in GATEWAY_FIELDS}
            sample['gateway']['closed'] = True
            executions.append(sample)
        return {'version': value['version'], 'executions': executions,
            'cgroups_empty': True, 'relays_closed': True}
    except Exception:
        raise fail() from None


def private_directory(path, identity=None):
    if not path.is_absolute() or str(path) != os.path.normpath(str(path)):
        raise fail()
    for ancestor in (*reversed(path.parents), path):
        info = ancestor.lstat()
        if (not stat.S_ISDIR(info.st_mode) or info.st_uid not in (0, os.getuid())
                or stat.S_IMODE(info.st_mode) & 0o022):
            raise fail()
    info = path.lstat()
    actual = (info.st_dev, info.st_ino)
    if (info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) != 0o700
            or (identity is not None and actual != identity)):
        raise fail()
    return actual


def number(raw):
    if not re.fullmatch(r'[0-9]{1,16}', raw) or not integer(int(raw)):
        raise fail()
    return int(raw)


class OwnedStackCgroups:
    def __init__(self):
        self._path = self._identity = None
        self._prepared = self._removed = self._had_processes = False
        self._samples = {}
        self._survivor = self._survivor_leaf = None
        self._survivor_joined = self._survivor_fallback = False
        self._survivor_was_live = self._survivor_cgroup_killed = False

    def _cleanup_survivor(self):
        """Safety fallback uses only this object's Popen, never CG proof."""
        child = self._survivor
        if child is None:
            return
        interrupted = None
        for action in ('terminate', 'kill'):
            try:
                if child.poll() is not None:
                    break
            except BaseException as error:
                if not isinstance(error, Exception) and interrupted is None:
                    interrupted = error
            self._survivor_fallback = True
            try:
                getattr(child, action)()
            except BaseException as error:
                if not isinstance(error, Exception) and interrupted is None:
                    interrupted = error
            try:
                child.wait(timeout=2)
            except BaseException as error:
                if not isinstance(error, Exception) and interrupted is None:
                    interrupted = error
        if interrupted is not None:
            raise interrupted
        try:
            if child.poll() is None:
                raise fail()
        except Exception:
            raise fail() from None

    @property
    def path(self):
        if self._path is None:
            raise fail()
        return self._path

    @staticmethod
    def _linux():
        if sys.platform != 'linux':
            raise fail()

    @staticmethod
    def _read(path):
        return read_bytes(path, 65536).decode('ascii', errors='strict').strip()

    @classmethod
    def _events(cls, path):
        result = {}
        for line in cls._read(path).splitlines():
            match = re.fullmatch(r'([a-z_]+) ([0-9]{1,16})', line)
            if match is None or match[1] in result:
                raise fail()
            result[match[1]] = number(match[2])
        return result

    @staticmethod
    def _write(path, value):
        descriptor = os.open(path, os.O_WRONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        try:
            info = os.fstat(descriptor)
            if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid():
                raise fail()
            data = (value + '\n').encode('ascii')
            if os.write(descriptor, data) != len(data):
                raise fail()
        finally:
            os.close(descriptor)

    @classmethod
    def _mount(cls):
        parent = Path('/sys/fs/cgroup')
        info = parent.lstat()
        if not stat.S_ISDIR(info.st_mode) or info.st_uid not in (0, os.getuid()):
            raise fail()
        device = f'{os.major(info.st_dev)}:{os.minor(info.st_dev)}'
        mounts = read_bytes('/proc/self/mountinfo', 131072).decode('ascii').splitlines()
        if not any(len(parts := line.split(' - ')) == 2
                and len(fields := parts[0].split()) >= 6 and fields[2] == device
                and fields[4] == '/sys/fs/cgroup' and parts[1].split()[0] == 'cgroup2'
                for line in mounts):
            raise fail()
        for file in ('cgroup.controllers', 'cgroup.subtree_control'):
            if not {'memory', 'pids'} <= set(cls._read(parent / file).split()):
                raise fail()

    def _verify(self):
        self._linux()
        if self._identity is None or self._removed:
            raise fail()
        self._mount()
        private_directory(self.path, self._identity)
        if self._identity[0] != self.path.parent.lstat().st_dev:
            raise fail()

    def _children(self):
        self._verify()
        children = []
        with os.scandir(self.path) as entries:
            for count, entry in enumerate(entries):
                if count >= 256 or entry.is_symlink():
                    raise fail()
                if entry.is_dir(follow_symlinks=False):
                    if len(children) >= 128 or not re.fullmatch(r'run-[A-Za-z0-9]{6}', entry.name):
                        raise fail()
                    path = self.path / entry.name
                    identity = private_directory(path)
                    if identity[0] != self._identity[0]:
                        raise fail()
                    with os.scandir(path) as nested:
                        if any(item.is_symlink() or item.is_dir(follow_symlinks=False) for item in nested):
                            raise fail()
                    children.append((path, identity))
        return sorted(children)

    def _populated(self):
        value = self._events(self.path / 'cgroup.events')['populated']
        if value not in (0, 1):
            raise fail()
        return value

    def _empty(self):
        return self._populated() == 0 and self._read(self.path / 'cgroup.procs') == ''

    def prepare(self):
        try:
            self._linux()
            if self._path is not None:
                raise fail()
            self._mount()
            self._path = Path(tempfile.mkdtemp(prefix='sun-world-stack-', dir='/sys/fs/cgroup'))
            # Record the newly created root before chmod/controller I/O. Unknown
            # initialization retains this object/path; no automatic adoption.
            info = self.path.lstat()
            self._identity = (info.st_dev, info.st_ino)
            os.chmod(self.path, 0o700, follow_symlinks=False)
            self._verify()
            if self._children() or not self._empty():
                raise fail()
            if (self._read(self.path / 'cgroup.type') != 'domain'
                    or not {'memory', 'pids'} <= set(self._read(self.path / 'cgroup.controllers').split())):
                raise fail()
            self._write(self.path / 'cgroup.subtree_control', '+memory +pids')
            if not {'memory', 'pids'} <= set(self._read(self.path / 'cgroup.subtree_control').split()):
                raise fail()
            self._prepared = True
            return self
        except BaseException as error:
            self._cleanup_survivor()
            if not isinstance(error, Exception):
                raise
            raise fail() from None

    def freeze(self):
        try:
            self._verify()
            if not self._prepared:
                raise fail()
            self._children()
            self._write(self.path / 'cgroup.freeze', '1')
            deadline = time.monotonic() + 2
            while True:
                self._verify()
                events = self._events(self.path / 'cgroup.events')
                if events.get('frozen') == 1 and events.get('populated') == 1:
                    return
                if time.monotonic() >= deadline:
                    raise fail()
                time.sleep(.01)
        except BaseException as error:
            self._cleanup_survivor()
            if not isinstance(error, Exception):
                raise
            raise fail() from None

    def start_survivor(self):
        self._linux()  # No subprocess or filesystem I/O on other platforms.
        try:
            self._verify()
            children = self._children()
            events = self._events(self.path / 'cgroup.events')
            if (not self._prepared or self._survivor is not None or len(children) != 1
                    or events.get('populated') != 1 or events.get('frozen') != 0
                    or self._read(self.path / 'cgroup.freeze') != '0'):
                raise fail()
            leaf, identity = children[0]
            leaf_events = self._events(leaf / 'cgroup.events')
            if (leaf_events.get('populated') != 1 or leaf_events.get('frozen') != 0
                    or not self._read(leaf / 'cgroup.procs')
                    or self._read(leaf / 'memory.max') != str(CAP)
                    or self._read(leaf / 'memory.swap.max') != '0'
                    or self._read(leaf / 'pids.max') != '64'):
                raise fail()
            self._survivor = subprocess.Popen(
                [sys.executable, '-I', '-c', 'import time; time.sleep(150)'],
                stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL, start_new_session=True,
                env={'PATH': '/usr/bin:/bin', 'LC_ALL': 'C', 'TZ': 'UTC'})
            self._survivor_leaf = (leaf, identity)
            self._verify()
            private_directory(leaf, identity)
            if self._children() != children or self._survivor.poll() is not None:
                raise fail()
            self._write(leaf / 'cgroup.procs', str(self._survivor.pid))
            if (str(self._survivor.pid) not in self._read(leaf / 'cgroup.procs').splitlines()
                    or self._survivor.poll() is not None):
                raise fail()
            self._survivor_joined = True
        except BaseException as error:
            self._cleanup_survivor()
            if not isinstance(error, Exception):
                raise
            raise fail() from None

    def _survivor_before_kill(self, worker_exited):
        if self._survivor is None or self._survivor_cgroup_killed:
            return False
        if not self._survivor_joined or self._survivor_fallback:
            raise fail()
        leaf, identity = self._survivor_leaf
        private_directory(leaf, identity)
        if (self._survivor.poll() is not None
                or str(self._survivor.pid) not in self._read(leaf / 'cgroup.procs').splitlines()):
            raise fail()
        if worker_exited:
            self._survivor_was_live = True
        return worker_exited

    def _snapshot(self, path):
        memory, pids = self._events(path / 'memory.events'), self._events(path / 'pids.events')
        value = {key: number(self._read(path / file)) for key, file in (
            ('memory_current_bytes', 'memory.current'), ('memory_peak_bytes', 'memory.peak'),
            ('memory_max_bytes', 'memory.max'), ('swap_max_bytes', 'memory.swap.max'),
            ('pids_current', 'pids.current'), ('pids_max', 'pids.max'))}
        value.update(memory_oom=memory['oom'], memory_oom_kill=memory['oom_kill'],
            memory_limit_events=memory['max'], pids_limit_events=pids['max'],
            populated=self._events(path / 'cgroup.events')['populated'])
        if self._read(path / 'cgroup.procs') != '':
            raise fail()
        return kernel_sample(value, require_peak=False)

    def stop_tree(self, *, worker_exited):
        try:
            self._linux()
            if type(worker_exited) is not bool:
                raise fail()
            if self._path is not None and not self._removed:
                children = self._children()
                self._had_processes |= self._populated() == 1
                failed = False
                if children or self._had_processes:
                    for name, value in (('cgroup.freeze', '0'), ('cgroup.kill', '1')):
                        control_live = False
                        if name == 'cgroup.kill':
                            try:
                                control_live = self._survivor_before_kill(worker_exited)
                            except Exception:
                                failed = True
                        try:
                            self._write(self.path / name, value)
                            if control_live:
                                if self._survivor.wait(timeout=2) != -signal.SIGKILL:
                                    raise fail()
                                self._survivor_cgroup_killed = True
                        except Exception:
                            failed = True
                deadline = time.monotonic() + 2
                while True:
                    self._verify()
                    if self._empty():
                        break
                    if time.monotonic() >= deadline:
                        raise fail()
                    time.sleep(.01)
                if (failed or not worker_exited or self._children() != children
                        or (self._survivor is not None and not self._survivor_cgroup_killed)):
                    raise fail()
                for path, identity in children:
                    private_directory(path, identity)
                    if identity not in self._samples and len(self._samples) >= 128:
                        raise fail()
                    self._samples.setdefault(identity, self._snapshot(path))
                for path, identity in children:
                    self._verify()
                    private_directory(path, identity)
                    os.rmdir(path)
            if not worker_exited:
                raise fail()
            return {'had_processes': self._had_processes,
                'executions': deepcopy(list(self._samples.values())),
                'survivor_was_live': self._survivor_was_live,
                'survivor_cgroup_killed': self._survivor_cgroup_killed}
        except BaseException as error:
            self._cleanup_survivor()
            if not isinstance(error, Exception):
                raise
            raise fail() from None

    def finish(self, *, worker_exited):
        try:
            self._linux()
            if worker_exited is not True:
                raise fail()
            if self._survivor is not None and self._survivor.poll() is None:
                raise fail()
            if self._path is None or self._removed:
                return
            if self._children() or not self._empty():
                raise fail()
            self._verify()
            os.rmdir(self.path)
            self._removed = True
        except BaseException as error:
            self._cleanup_survivor()
            if not isinstance(error, Exception):
                raise
            raise fail() from None
