"""Fixed, bounded full-stack guest assets. No installers or host extraction."""

import hashlib
import io
import json
from pathlib import Path
import re
import stat
import struct
import tomllib
import zipfile

ROOT = Path(__file__).resolve().parents[1]
CONTRACT = 'tools/agent-linux-vm/stack-assets.json'
PYTHON = 'tools/agent-linux-vm/stack-python.json'
SOURCES = 'tools/agent-linux-vm/stack-sources.json'
GATEWAY = 'tools/agent-linux-vm/gateway-assets.json'
FAILED = 'AGENT_LINUX_GUEST_PREPARE_FAILED'


def fail():
    raise ValueError(FAILED) from None


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def strict_json(raw):
    def pairs(items):
        result = {}
        for key, value in items:
            if key in result:
                fail()
            result[key] = value
        return result
    return json.loads(raw, object_pairs_hook=pairs, parse_float=lambda _: fail(), parse_constant=lambda _: fail())


def source_paths(read_source):
    raw = read_source(SOURCES)
    value = strict_json(raw)
    if (type(value) is not dict or set(value) != {'version', 'paths'}
            or value['version'] != 'sun-world-linux-stack-sources/1'
            or type(value['paths']) is not list or not 1 <= len(value['paths']) <= 512
            or any(type(p) is not str for p in value['paths'])
            or sorted(set(value['paths'])) != value['paths']):
        fail()
    # The maintained contract is explicit; reject broad workspace expansion.
    exact = {'.nvmrc', 'apps/api/main.py', 'apps/api/pyproject.toml', 'apps/api/poetry.lock',
             PYTHON, 'tools/agent-linux-vm/stack-probe.py',
             'apps/api/tests/fixtures/agent-model-evaluation.json'}
    for path in value['paths']:
        if (path not in exact and not path.startswith(('apps/api/src/', 'apps/api/tests/integration/',
                'apps/agent-worker/tests/integration/')) and path not in {
                    'scripts/test-agent-sdk-stack.py', 'scripts/test-agent-mysql.py',
                    'scripts/test-agent-redis.py', 'scripts/test-agent-mongo.py'}):
            fail()
        if path not in exact and not path.endswith(('.py', '.json', '.mjs')):
            fail()
    return value['paths']


def load(cache, read_owned, read_source):
    contract = strict_json(read_source(CONTRACT))
    fields = {'version', 'architecture', 'gateway_assets_sha256', 'python_contract_sha256',
              'sources_contract_sha256', 'assets', 'ubuntu_indexes'}
    if (type(contract) is not dict or set(contract) != fields
            or contract['version'] != 'sun-world-linux-stack-assets/1' or contract['architecture'] != 'arm64'
            or contract['gateway_assets_sha256'] != sha(read_source(GATEWAY))
            or contract['python_contract_sha256'] != sha(read_source(PYTHON))
            or contract['sources_contract_sha256'] != sha(read_source(SOURCES))
            or type(contract['assets']) is not list or not 3 <= len(contract['assets']) <= 128):
        fail()
    python = strict_json(read_source(PYTHON))
    if (type(python) is not dict or set(python) != {'version', 'python', 'architecture', 'libc', 'poetry_lock_sha256', 'roots', 'wheels'}
            or python['version'] != 'sun-world-linux-stack-python/1' or python['python'] != '3.12.13'
            or python['architecture'] != 'aarch64' or python['libc'] != 'glibc'
            or python['poetry_lock_sha256'] != sha(read_source('apps/api/poetry.lock'))
            or type(python['wheels']) is not list or not 1 <= len(python['wheels']) <= 128):
        fail()
    packages = {p['name'].lower().replace('_', '-'): p for p in tomllib.loads(read_source('apps/api/poetry.lock').decode())['package']}
    wheels = {}
    for row in python['wheels']:
        name = row['name'].lower().replace('_', '-')
        package = packages[name]
        if (package['version'] != row['version'] or row['kind'] != 'wheel'
                or row['filename'] in wheels or any(x in row['filename'] for x in ('macosx', 'win32', 'win_amd64'))
                or not (row['filename'].endswith('-none-any.whl') or row['filename'].endswith('aarch64.whl'))
                or not any(f['file'] == row['filename'] and f['hash'] == 'sha256:' + row['sha256'] for f in package['files'])):
            fail()
        wheels[row['filename']] = row
    assets, metadata, kinds, total = {}, {}, {}, 0
    seen_wheels = set()
    for row in contract['assets']:
        name, size, digest, kind = (row[k] for k in ('filename', 'size', 'sha256', 'kind'))
        if (type(name) is not str or not re.fullmatch(r'[A-Za-z0-9_.+-]{1,255}', name)
                or name in assets or type(size) is not int or not 1 <= size <= 1024**3
                or type(digest) is not str or not re.fullmatch('[0-9a-f]{64}', digest)
                or kind not in {'mysql', 'mongo', 'python', 'redis', 'library', 'wheel'}):
            fail()
        if kind in {'mysql', 'mongo', 'python'} and name != {'mysql': 'mysql.tar.xz', 'mongo': 'mongo.tar.gz', 'python': 'python.tar.gz'}[kind]:
            fail()
        if kind == 'redis' and name != 'redis-tools.deb' or kind == 'library' and not re.fullmatch(r'lib[A-Za-z0-9+.-]+\.deb', name):
            fail()
        if kind == 'wheel':
            if name not in wheels or row != wheels[name]:
                fail()
            seen_wheels.add(name)
        total += size
        if total > 1536 * 1024**2:
            fail()
        raw = read_owned(cache / name, size, private=True)
        if len(raw) != size or sha(raw) != digest:
            fail()
        assets[name], metadata[name], kinds[name] = raw, {'sha256': digest, 'size': size, 'kind': kind}, kind
    if (seen_wheels != set(wheels) or any(list(kinds.values()).count(k) != 1 for k in ('mysql', 'mongo', 'python', 'redis'))):
        fail()
    return assets, metadata, kinds


def arm64(raw):
    if len(raw) >= 20 and raw.startswith(b'\x7fELF'):
        if raw[:6] != b'\x7fELF\x02\x01' or struct.unpack_from('<H', raw, 18)[0] != 183:
            fail()
        return True
    return False


def writer_type(base):
    class StackCpio(base):
        def __init__(self, stream):
            super().__init__(stream, gateway=True)
            self.selected_bytes = 0

        def add(self, name, mode, data=b'', uid=0, gid=0):
            if stat.S_ISREG(mode):
                if len(data) > 512 * 1024**2:
                    fail()
                self.selected_bytes += len(data)
                if self.selected_bytes > 2 * 1024**3:
                    fail()
            return super().add(name, mode, data, uid, gid)
    return StackCpio


def emit_tar(writer, budget, raw, *, prefix, destination, selected, tar_entries):
    count, binary = 0, False
    def choose(name):
        return name.startswith(prefix) and selected(name[len(prefix):])
    for name, mode, data, uid, gid in tar_entries(raw, budget, selected=choose,
            repeat_directories=prefix.startswith('mysql-')):
        relative = name[len(prefix):]
        target = destination + '/' + relative
        if stat.S_ISREG(mode):
            is_elf = arm64(data)
            if relative in ('bin/mysqld', 'bin/mongod', 'bin/python3.12'):
                if not is_elf:
                    fail()
                binary = True
        writer.directory(target.rsplit('/', 1)[0])
        if stat.S_ISDIR(mode):
            writer.directory(target)
        else:
            writer.add(target, stat.S_IFMT(mode) | (mode & 0o777), data)
        count += 1
    if not count or not binary:
        fail()


def emit_wheel(writer, budget, raw, relative):
    seen = set()
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        if len(archive.infolist()) > 8192:
            fail()
        for info in archive.infolist():
            budget.entries += 1
            if budget.entries > budget.entry_limit:
                fail()
            name = relative(info.filename.rstrip('/'))
            if (not name or name in seen or name.endswith('.pth') or '.data/' in name
                    or info.flag_bits & 1 or info.file_size > 64 * 1024**2):
                fail()
            seen.add(name)
            target = 'sw-root/opt/python/lib/python3.12/site-packages/' + name
            if info.is_dir():
                writer.directory(target)
                continue
            kind = stat.S_IFMT(info.external_attr >> 16)
            if kind not in (0, stat.S_IFREG):
                fail()
            budget.size(info.file_size)
            data = archive.read(info)
            if len(data) != info.file_size:
                fail()
            arm64(data)
            writer.directory(target.rsplit('/', 1)[0])
            writer.add(target, stat.S_IFREG | 0o644, data)


def emit(writer, budget, assets, kinds, *, tar_entries, deb_archive, decode_zstd_deb, relative):
    emit_tar(writer, budget, assets['python.tar.gz'], prefix='python/', destination='sw-root/opt/python',
        selected=lambda _: True, tar_entries=tar_entries)
    emit_tar(writer, budget, assets['mysql.tar.xz'], prefix='mysql-8.4.13-linux-glibc2.28-aarch64/', destination='sw-root/opt/mysql',
        selected=lambda p: p == 'bin/mysqld' or p.startswith(('share/', 'lib/private/', 'lib/plugin/')), tar_entries=tar_entries)
    emit_tar(writer, budget, assets['mongo.tar.gz'], prefix='mongodb-linux-aarch64-ubuntu2404-8.0.38/', destination='sw-root/opt/mongo',
        selected=lambda p: p == 'bin/mongod', tar_entries=tar_entries)
    for name, kind in kinds.items():
        if kind == 'wheel':
            emit_wheel(writer, budget, assets[name], relative)
        elif kind in {'redis', 'library'}:
            data = deb_archive(assets[name])
            if data.startswith(b'\x28\xb5\x2f\xfd'):
                data = decode_zstd_deb(assets[name], deb_archive)
            choose = (lambda p: p == 'usr/bin/redis-check-rdb') if kind == 'redis' else (
                lambda p: p.startswith(('usr/lib/aarch64-linux-gnu/', 'lib/aarch64-linux-gnu/')))
            chosen = 0
            for path, mode, body, uid, gid in tar_entries(data, budget, selected=choose):
                if path.startswith('lib/'):
                    path = 'usr/' + path  # Ubuntu's merged /usr, without following a cpio parent symlink.
                target = 'sw-root/usr/local/bin/redis-server' if kind == 'redis' else 'sw-root/' + path
                if target in writer.paths:
                    # Base libraries are immutable; never overlay an installed file.
                    if stat.S_ISDIR(mode):
                        continue
                    fail()
                if stat.S_ISREG(mode):
                    is_elf = arm64(body)
                    if kind == 'redis' and not is_elf:
                        fail()
                elif kind == 'redis':
                    fail()
                writer.directory(target.rsplit('/', 1)[0])
                writer.add(target, mode, body, uid, gid)
                chosen += 1
            if not chosen:
                fail()
