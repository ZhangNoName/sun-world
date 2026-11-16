#!/usr/bin/env python3
"""Build a fixed offline guest initramfs; never extract or execute guest files."""

import argparse
import gzip
import hashlib
import io
import importlib.util
import json
import os
from pathlib import Path
import posixpath
import re
import stat
import sys
import tarfile

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'tools/agent-linux-vm/assets.json'
CONTAINMENT_ASSETS = ROOT / 'tools/agent-linux-vm/containment-assets.json'
GATEWAY_ASSETS = ROOT / 'tools/agent-linux-vm/gateway-assets.json'
SIZES = {'ubuntu-base.tar.gz': 134217728, 'kernel': 134217728, 'original-initrd': 134217728,
         'node.tar.xz': 134217728, 'tini.deb': 1048576}
WORKER = ('blog-tools', 'cleanup-diagnostics', 'execution-http', 'execution-journal', 'execution-service',
          'gateway-client', 'local-runner', 'process-runner', 'profile', 'protocol', 'root-result',
          'rpc-validation', 'sdk-execution', 'sdk-tools', 'verify-sandbox', 'verify-tools', 'worker')
SOURCES = tuple('apps/agent-worker/src/' + name + '.mjs' for name in WORKER) + (
    'packages/contracts/agent/rpc-v2.json', 'packages/contracts/agent/tool-catalog.json',
    *(f'apps/agent-worker/tests/protocol/{name}.mjs' for name in ('test-helpers', 'execution-service.test',
       'execution-journal.test', 'journal-maintenance.test', 'process-runner.test', 'execution-crash.test')),
    'apps/agent-worker/tests/fixtures/controller-crash.mjs', 'apps/agent-worker/tests/fixtures/crash-owned.mjs',
    'scripts/prune-agent-worker-journal.mjs', 'tools/agent-linux-vm/guest-init.sh',
    'tools/agent-linux-vm/guest-run.sh', 'tools/agent-linux-vm/guest-probe.mjs')
GUEST = {'tools/agent-linux-vm/guest-init.sh': ('init', 0o755),
         'tools/agent-linux-vm/guest-run.sh': ('sw-root/work/run-guest.sh', 0o755),
         'tools/agent-linux-vm/guest-probe.mjs': ('sw-root/work/probe.mjs', 0o644)}
CONTAINMENT_SOURCES = ('apps/agent-worker/src/linux-launcher.mjs',
    'apps/agent-worker/src/linux-launch-exec.mjs',
    'apps/agent-worker/src/linux-containment-paths.mjs',
    'apps/agent-worker/src/linux-containment-state.mjs',
    'apps/agent-worker/src/linux-gateway.mjs',
    'apps/agent-worker/src/gateway-relay.mjs',
    'apps/agent-worker/tests/fixtures/linux-contained.mjs',
    'apps/agent-worker/tests/fixtures/publish-proof.mjs',
    'tools/agent-linux-vm/containment-suite.mjs')
GATEWAY_SOURCES = ('apps/agent-worker/tests/fixtures/linux-gateway-probe.mjs',
    'tools/agent-linux-vm/gateway-suite.mjs', 'apps/agent-worker/tests/integration/sdk-run.mjs',
    'apps/agent-worker/tests/integration/linux-sdk-fixture.mjs',
    'apps/api/src/modules/blog/agent/skills/blog-qa-v2/SKILL.md',
    'tools/dsh-blog-p0/package.json', 'tools/dsh-blog-p0/pnpm-lock.yaml')


def gateway_helper():
    spec = importlib.util.spec_from_file_location('owned_gateway_assets', Path(__file__).with_name('agent-linux-vm-gateway.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module
SECRET = re.compile(rb'sk-[A-Za-z0-9_-]{20,}|-----BEGIN [A-Z ]*(?:PRIVATE KEY|CERTIFICATE)-----|Bearer[ \t]+[A-Za-z0-9_.~+/-]{24,}')
FAILED = 'AGENT_LINUX_GUEST_PREPARE_FAILED'


def fail():
    raise ValueError(FAILED) from None


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def read_owned(path, maximum, *, private=False, dir_fd=None):
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=dir_fd)
    try:
        info = os.fstat(descriptor)
        if (not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or info.st_nlink != 1
                or not 0 < info.st_size <= maximum or private and stat.S_IMODE(info.st_mode) != 0o600):
            fail()
        result, remaining = [], maximum + 1
        while remaining:
            raw = os.read(descriptor, min(65536, remaining))
            if not raw:
                break
            result.append(raw)
            remaining -= len(raw)
        raw = b''.join(result)
        if len(raw) != info.st_size or len(raw) > maximum:
            fail()
        return raw
    finally:
        os.close(descriptor)


def read_source(name):
    # A whitelisted final filename must not acquire an unlisted source through
    # a symlinked parent directory either.
    descriptor = os.open(ROOT, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        parts = relative(name).split('/')
        for component in parts[:-1]:
            following = os.open(component, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=descriptor)
            os.close(descriptor)
            descriptor = following
        return read_owned(parts[-1], 1048576, dir_fd=descriptor)
    finally:
        os.close(descriptor)


def relative(name):
    if type(name) is not str or '\x00' in name or '\\' in name or name.startswith('/'):
        fail()
    while name.startswith('./'):
        name = name[2:]
    name = name.rstrip('/')
    if name in ('', '.'):
        return ''
    if len(name.encode('utf-8')) > 4096 or any(part in ('', '.', '..') for part in name.split('/')):
        fail()
    return name


def link_target(name, target):
    if type(target) is not str or not target or '\x00' in target or '\\' in target or len(target.encode()) > 4096:
        fail()
    resolved = posixpath.normpath(target.lstrip('/') if target.startswith('/') else posixpath.join(posixpath.dirname(name), target))
    if resolved == '..' or resolved.startswith('../'):
        fail()
    return target.encode('utf-8')


class Budget:
    def __init__(self, gateway=False):
        self.entries, self.total = 0, 0
        self.maximum = 1024**3 if gateway else 512 * 1024**2
        self.entry_limit = 131072 if gateway else 20000

    def size(self, size):
        if type(size) is not int or not 0 <= size <= 256 * 1024**2:
            fail()
        self.total += size
        if self.total > self.maximum:
            fail()


def tar_entries(raw, budget, selected=None):
    class BoundedInfo(tarfile.TarInfo):
        def _proc_member(self, archive):
            budget.entries += 1
            if budget.entries > budget.entry_limit or self.size < 0 or self.size > 256 * 1024**2:
                fail()
            if self.type in (tarfile.XHDTYPE, tarfile.XGLTYPE, tarfile.GNUTYPE_LONGNAME, tarfile.GNUTYPE_LONGLINK):
                if self.size > 65536:
                    fail()
                budget.size(self.size)
            elif self.type not in (tarfile.REGTYPE, tarfile.AREGTYPE, tarfile.DIRTYPE, tarfile.SYMTYPE, tarfile.LNKTYPE):
                fail()
            return super()._proc_member(archive)
    seen, known = set(), {}
    with tarfile.open(fileobj=io.BytesIO(raw), mode='r|*', tarinfo=BoundedInfo) as archive:
        for item in archive:
            name = relative(item.name)
            if not name:
                if not item.isdir():
                    fail()
                continue
            if name in seen or item.sparse is not None:
                fail()
            seen.add(name)
            budget.size(item.size)
            chosen = selected is None or name == selected
            if selected is not None and name == selected and not item.isreg():
                fail()
            data = b''
            if item.isreg():
                source, chunks, remaining = archive.extractfile(item), [], item.size
                while remaining:
                    block = source.read(min(65536, remaining))
                    if not block:
                        fail()
                    if chosen:
                        chunks.append(block)
                    remaining -= len(block)
                if chosen:
                    data = b''.join(chunks)
                    known[name] = data
                mode = stat.S_IFREG | (item.mode & 0o7777)
            elif item.islnk():
                target = relative(item.linkname)
                if target not in known:
                    fail()
                data, mode = known[target], stat.S_IFREG | (item.mode & 0o7777)
                budget.size(len(data))
                known[name] = data
            elif item.issym():
                data, mode = link_target(name, item.linkname), stat.S_IFLNK | 0o777
            elif item.isdir():
                mode = stat.S_IFDIR | (item.mode & 0o7777)
            else:
                fail()
            if chosen:
                if any(type(n) is not int or not 0 <= n < 2**32 for n in (item.uid, item.gid)):
                    fail()
                yield name, mode, data, item.uid, item.gid


def tini_archive(raw):
    if not raw.startswith(b'!<arch>\n'):
        fail()
    offset, members = 8, {}
    while offset < len(raw):
        header = raw[offset:offset + 60]
        if len(header) != 60 or header[58:] != b'`\n' or len(members) >= 16:
            fail()
        name, size = header[:16].decode('ascii').strip().rstrip('/'), int(header[48:58])
        if not re.fullmatch(r'[A-Za-z0-9_.+-]+', name) or name in members or size < 0 or offset + 60 + size > len(raw):
            fail()
        members[name] = raw[offset + 60:offset + 60 + size]
        if size % 2 and raw[offset + 60 + size:offset + 61 + size] != b'\n':
            fail()
        offset += 60 + size + size % 2
    data = [value for name, value in members.items() if name.startswith('data.tar.')]
    if offset != len(raw) or members.get('debian-binary') != b'2.0\n' or len(data) != 1:
        fail()
    return data[0]


def bubblewrap_archive(raw):
    data = tini_archive(raw)
    if data.startswith(b'\x28\xb5\x2f\xfd'):
        # Only the explicit additional suite needs the repository's locked
        # codec; original five-asset/default construction remains stdlib-only.
        import zstandard
        if zstandard.__version__ != '0.25.0':
            fail()
        parameters = zstandard.get_frame_parameters(data)
        maximum = 2 * 1024**2
        if not 0 < parameters.content_size <= maximum or not 0 < parameters.window_size <= maximum:
            fail()
        data = zstandard.ZstdDecompressor(max_window_size=maximum).decompress(data,
            max_output_size=maximum, read_across_frames=False, allow_extra_data=False)
        if len(data) != parameters.content_size:
            fail()
    return data


class Cpio:
    def __init__(self, stream, gateway=False):
        self.stream, self.paths, self.inode = stream, {}, 0
        self.maximum = 131072 if gateway else 20000

    def add(self, name, mode, data=b'', uid=0, gid=0):
        name = relative(name)
        if (not name or name in self.paths or self.inode >= self.maximum and name != 'TRAILER!!!'
                or any(self.paths.get('/'.join(name.split('/')[:n])) not in (None, stat.S_IFDIR) for n in range(1, len(name.split('/'))))):
            fail()
        self.paths[name] = stat.S_IFMT(mode)
        self.inode += 1
        encoded = name.encode() + b'\0'
        values = (self.inode, mode, uid, gid, 1, 0, len(data), 0, 0, 0, 0, len(encoded), 0)
        self.stream.write(b'070701' + b''.join(f'{value:08x}'.encode() for value in values))
        self.stream.write(encoded + b'\0' * (-(110 + len(encoded)) % 4))
        self.stream.write(data + b'\0' * (-len(data) % 4))

    def directory(self, name):
        for index in range(1, len(name.split('/')) + 1):
            path = '/'.join(name.split('/')[:index])
            if path not in self.paths:
                self.add(path, stat.S_IFDIR | 0o755)
            elif self.paths[path] != stat.S_IFDIR:
                fail()

    def finish(self):
        self.add('TRAILER!!!', stat.S_IFREG)


def load_inputs(cache, *, containment=False, gateway=False):
    containment = containment or gateway
    info = os.lstat(cache)
    if not Path(cache).is_absolute() or not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) != 0o700:
        fail()
    contract = json.loads(read_owned(ASSETS, 65536))
    if (contract['version'] != 'sun-world-linux-vm-assets/1' or contract['architecture'] != 'arm64'
            or contract['node_version'] != '24.17.0' or len(contract['assets']) != 5):
        fail()
    assets, metadata = {}, {}
    for entry in contract['assets']:
        name = entry['filename']
        if name not in SIZES or name in assets or entry['max_bytes'] != SIZES[name] or not re.fullmatch('[0-9a-f]{64}', entry['sha256']):
            fail()
        raw = read_owned(Path(cache) / name, SIZES[name], private=True)
        if sha(raw) != entry['sha256']:
            fail()
        assets[name], metadata[name] = raw, {'sha256': sha(raw), 'size': len(raw)}
    if containment:
        extra = json.loads(read_owned(CONTAINMENT_ASSETS, 65536))
        if (set(extra) != {'version', 'base_assets_sha256', 'assets'}
                or extra['version'] != 'sun-world-linux-containment-assets/1'
                or extra['base_assets_sha256'] != sha(read_owned(ASSETS, 65536))
                or type(extra['assets']) is not list or len(extra['assets']) != 1):
            fail()
        entry = extra['assets'][0]
        if (entry['filename'] != 'bubblewrap.deb' or entry['max_bytes'] != 1048576
                or not re.fullmatch('[0-9a-f]{64}', entry['sha256'])):
            fail()
        raw = read_owned(Path(cache) / 'bubblewrap.deb', 1048576, private=True)
        if sha(raw) != entry['sha256']:
            fail()
        assets['bubblewrap.deb'], metadata['bubblewrap.deb'] = raw, {'sha256': sha(raw), 'size': len(raw)}
    if gateway:
        more, detail = gateway_helper().load(Path(cache), GATEWAY_ASSETS, CONTAINMENT_ASSETS, read_owned, read_source)
        assets.update(more)
        metadata.update(detail)
    payload = {}
    for name in SOURCES + (CONTAINMENT_SOURCES if containment else ()) + (GATEWAY_SOURCES if gateway else ()):
        raw = read_source(name)
        if SECRET.search(raw):
            fail()
        payload[name] = raw
    return assets, metadata, payload


def write_all(stream, raw):
    view = memoryview(raw)
    while view:
        size = stream.write(view)
        if not size:
            fail()
        view = view[size:]


class HashedOutput:
    def __init__(self, stream):
        self.stream, self.hash, self.size = stream, hashlib.sha256(), 0

    def write(self, raw):
        write_all(self.stream, raw)
        self.hash.update(raw)
        self.size += len(raw)
        return len(raw)


def build(cache, output, *, containment=False, gateway=False):
    containment = containment or gateway
    if not Path(output).is_absolute():
        fail()
    manifest_path = Path(str(output) + '.manifest.json')
    assets, metadata, payload = load_inputs(cache, containment=containment, gateway=gateway)
    if os.path.lexists(output) or os.path.lexists(manifest_path):
        fail()
    descriptor = os.open(output, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        os.fchmod(descriptor, 0o600)
        with os.fdopen(descriptor, 'wb', closefd=False) as target:
            derived = HashedOutput(target)
            derived.write(assets['original-initrd'])
            budget = Budget(gateway)
            with gzip.GzipFile(filename='', fileobj=derived, mode='wb', mtime=0) as compressed:
                writer = Cpio(compressed, gateway)
                writer.directory('sw-root')
                for row in tar_entries(assets['ubuntu-base.tar.gz'], budget):
                    writer.add('sw-root/' + row[0], *row[1:])
                programs = [(assets['node.tar.xz'], 'node-v24.17.0-linux-arm64/bin/node', 'sw-root/usr/local/bin/node'),
                            (tini_archive(assets['tini.deb']), 'usr/bin/tini-static', 'sw-root/usr/local/bin/tini')]
                if containment:
                    programs.append((bubblewrap_archive(assets['bubblewrap.deb']), 'usr/bin/bwrap', 'sw-root/usr/local/bin/bwrap'))
                if gateway:
                    programs.append((gateway_helper().openssl_archive(assets['openssl.deb'], tini_archive), 'usr/bin/openssl', 'sw-root/usr/local/bin/openssl'))
                for archive, member, destination in programs:
                    chosen = list(tar_entries(archive, budget, selected=member))
                    if len(chosen) != 1:
                        fail()
                    writer.directory(posixpath.dirname(destination))
                    writer.add(destination, stat.S_IFREG | 0o755, chosen[0][2])
                for name, raw in payload.items():
                    destination, mode = GUEST.get(name, ('sw-root/work/sun-world/' + name, 0o644))
                    writer.directory(posixpath.dirname(destination)) if '/' in destination else None
                    budget.size(len(raw))
                    writer.add(destination, stat.S_IFREG | mode, raw)
                if gateway:
                    writer.directory('sw-root/runtime-sdk')
                    for row in tar_entries(assets['sdk-runtime.tar.gz'], budget):
                        writer.add('sw-root/runtime-sdk/' + row[0], *row[1:])
                writer.finish()
            target.flush()
            os.fsync(descriptor)
    finally:
        os.close(descriptor)
    report = {'version': 'sun-world-linux-guest-archive/1', 'assets': metadata,
        'payload_sha256': {name: sha(raw) for name, raw in payload.items()},
        'original_initrd': metadata['original-initrd'], 'derived_initrd': {'sha256': derived.hash.hexdigest(), 'size': derived.size},
        'guest_entries': writer.inode - 1, 'expanded_bytes': budget.total}
    descriptor = os.open(manifest_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        os.fchmod(descriptor, 0o600)
        with os.fdopen(descriptor, 'wb', closefd=False) as target:
            write_all(target, (json.dumps(report, sort_keys=True, indent=2) + '\n').encode())
            target.flush()
            os.fsync(descriptor)
    finally:
        os.close(descriptor)
    return report


class Arguments(argparse.ArgumentParser):
    def error(self, message):
        self.exit(2, FAILED + '\n')


def main(argv=None):
    parser = Arguments(description=__doc__, allow_abbrev=False)
    parser.add_argument('--cache', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--containment', action='store_true')
    parser.add_argument('--gateway', action='store_true')
    arguments = parser.parse_args(argv)
    try:
        if arguments.gateway and arguments.containment:
            fail()
        build(arguments.cache, arguments.output, containment=arguments.containment, gateway=arguments.gateway)
        print('AGENT_LINUX_GUEST_PREPARED')
        return 0
    except BaseException as error:
        print(FAILED, file=sys.stderr)
        return 130 if isinstance(error, KeyboardInterrupt) else 1


if __name__ == '__main__':
    sys.exit(main())
