#!/usr/bin/env python3
"""Seal a fresh locked Linux SDK dependency tree plus explicit repository files."""

import argparse
import gzip
import hashlib
import io
import json
import os
from pathlib import Path
import posixpath
import stat
import sys
import tarfile

ROOT = Path(__file__).resolve().parents[1]
FAILED = 'AGENT_LINUX_SDK_PREPARE_FAILED'
MAX_ENTRIES = 65536
MAX_EXPANDED = 1024**3
MAX_FILE = 256 * 1024**2
SOURCES = {f'apps/agent-worker/src/{name}.mjs': f'{name}.mjs' for name in (
    'sdk-execution', 'sdk-tools', 'profile', 'gateway-client', 'rpc-validation', 'protocol', 'root-result')}
SOURCES.update({'packages/contracts/agent/rpc-v2.json': 'rpc-v2.json',
    'packages/contracts/agent/tool-catalog.json': 'tool-catalog.json',
    'apps/api/src/modules/blog/agent/skills/blog-qa-v2/SKILL.md': 'blog-qa-v2.md',
    'tools/dsh-blog-p0/package.json': 'package.json', 'tools/dsh-blog-p0/pnpm-lock.yaml': 'pnpm-lock.yaml'})
NATIVE = {'@deepseek-ai/node-addon-system-linux-arm64': '0.1.2',
          'node-addon-require-builtin-linux-arm64-gnu': '0.1.9'}
IGNORED = {'node_modules/.modules.yaml', 'node_modules/.pnpm-workspace-state-v1.json',
           'node_modules/.pnpm/lock.yaml'}


def fail():
    raise ValueError(FAILED) from None


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def private_directory(path):
    info = os.lstat(path)
    if (not path.is_absolute() or path.resolve() != path or not stat.S_ISDIR(info.st_mode)
            or info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) != 0o700):
        fail()


def read_regular(root, relative, maximum):
    descriptor = os.open(root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        parts = relative.split('/')
        for part in parts[:-1]:
            following = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=descriptor)
            os.close(descriptor)
            descriptor = following
        file = os.open(parts[-1], os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=descriptor)
        try:
            info = os.fstat(file)
            if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or not 0 <= info.st_size <= maximum:
                fail()
            chunks, remaining = [], maximum + 1
            while remaining:
                raw = os.read(file, min(remaining, 65536))
                if not raw:
                    break
                chunks.append(raw)
                remaining -= len(raw)
            raw = b''.join(chunks)
            if len(raw) != info.st_size or len(raw) > maximum:
                fail()
            return raw, info
        finally:
            os.close(file)
    finally:
        os.close(descriptor)


def member(name):
    if (not name or len(name.encode()) > 4096 or '\\' in name or '\0' in name
            or name.startswith('/') or any(part in ('', '.', '..') for part in name.split('/'))):
        fail()
    return name


def seal(runtime, output):
    private_directory(runtime)
    if not output.is_absolute() or output.parent.resolve() != output.parent:
        fail()
    private_directory(output.parent)
    manifest = Path(str(output) + '.manifest.json')
    if os.path.lexists(output) or os.path.lexists(manifest):
        fail()
    sources = {}
    for name in SOURCES:
        raw, _ = read_regular(ROOT, name, 1024**2)
        sources[name] = raw
    for original in ('package.json', 'pnpm-lock.yaml'):
        copied, _ = read_regular(runtime, original, 1024**2)
        if copied != sources['tools/dsh-blog-p0/' + original]:
            fail()
    modules = runtime / 'node_modules'
    module_info = os.lstat(modules)
    if not stat.S_ISDIR(module_info.st_mode) or module_info.st_uid != os.getuid():
        fail()
    binary_hashes, validated_files, written_binaries, written_validated = {}, {}, set(), set()
    names = sorted((modules / '.pnpm').iterdir())
    for package, version in NATIVE.items():
        prefix = package.replace('/', '+') + '@' + version
        candidates = [path for path in names if path.name == prefix or path.name.startswith(prefix + '(')]
        if len(candidates) != 1:
            fail()
        package_root = candidates[0] / 'node_modules' / package
        declaration, _ = read_regular(runtime, str(package_root.relative_to(runtime) / 'package.json'), 65536)
        value = json.loads(declaration)
        if value['name'] != package or value['version'] != version:
            fail()
        validated_files[str(package_root.relative_to(runtime) / 'package.json')] = sha(declaration)
        for path, _, files in os.walk(package_root, followlinks=False):
            for name in sorted(files):
                target = Path(path) / name
                if target.is_symlink():
                    continue
                relative = target.relative_to(runtime).as_posix()
                raw, _ = read_regular(runtime, relative, MAX_FILE)
                if len(raw) >= 20 and raw[:6] == b'\x7fELF\x02\x01' and int.from_bytes(raw[18:20], 'little') == 183:
                    binary_hashes[relative] = sha(raw)
        if not any('/' + package + '/' in name for name in binary_hashes):
            fail()
    if any('node-addon-system-darwin-' in path.name for path in names):
        fail()
    bin_path = modules / '.bin/dsh'
    if not bin_path.is_symlink() or not bin_path.resolve().is_relative_to(modules):
        fail()
    cli_link = os.readlink(bin_path)
    written_cli = False

    entries, expanded = 0, 0
    def add(archive, name, *, data=None, mode=0o644, link=None):
        nonlocal entries, expanded
        entries += 1
        if entries > MAX_ENTRIES:
            fail()
        info = tarfile.TarInfo(member(name))
        info.mode, info.uid, info.gid, info.mtime = mode, 0, 0, 0
        if link is not None:
            destination = posixpath.normpath(posixpath.join(posixpath.dirname(name), link))
            if (not link or '\0' in link or '\\' in link or link.startswith('/') or len(link.encode()) > 4096
                    or not destination.startswith('node_modules/')):
                fail()
            info.type, info.linkname = tarfile.SYMTYPE, link
        elif data is None:
            info.type = tarfile.DIRTYPE
        else:
            expanded += len(data)
            if expanded > MAX_EXPANDED:
                fail()
            info.size = len(data)
        archive.addfile(info, io.BytesIO(data) if data is not None else None)

    descriptor = os.open(output, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        os.fchmod(descriptor, 0o600)
        with os.fdopen(descriptor, 'wb', closefd=False) as raw:
            with gzip.GzipFile(filename='', fileobj=raw, mode='wb', mtime=0) as compressed:
                with tarfile.open(fileobj=compressed, mode='w|', format=tarfile.PAX_FORMAT) as archive:
                    for original, name in SOURCES.items():
                        add(archive, name, data=sources[original])
                    add(archive, 'node_modules', mode=0o755)
                    for directory, dirs, files in os.walk(modules, followlinks=False):
                        dirs.sort(); files.sort()
                        for name in dirs + files:
                            path = Path(directory) / name
                            relative = path.relative_to(runtime).as_posix()
                            if relative in IGNORED:
                                continue
                            info = os.lstat(path)
                            if info.st_uid != os.getuid():
                                fail()
                            if relative in binary_hashes or relative in validated_files:
                                if not stat.S_ISREG(info.st_mode):
                                    fail()
                            if relative == 'node_modules/.bin/dsh' and not stat.S_ISLNK(info.st_mode):
                                fail()
                            if stat.S_ISLNK(info.st_mode):
                                link = os.readlink(path)
                                if relative == 'node_modules/.bin/dsh' and link != cli_link:
                                    fail()
                                add(archive, relative, link=link, mode=0o777)
                                if relative == 'node_modules/.bin/dsh':
                                    written_cli = True
                            elif stat.S_ISDIR(info.st_mode):
                                add(archive, relative, mode=0o755)
                            elif stat.S_ISREG(info.st_mode):
                                data, info = read_regular(runtime, relative, MAX_FILE)
                                if relative in binary_hashes and sha(data) != binary_hashes[relative]:
                                    fail()
                                if relative in validated_files and sha(data) != validated_files[relative]:
                                    fail()
                                add(archive, relative, data=data, mode=0o755 if info.st_mode & 0o111 else 0o644)
                                if relative in binary_hashes:
                                    written_binaries.add(relative)
                                if relative in validated_files:
                                    written_validated.add(relative)
                            else:
                                fail()
                    if written_binaries != set(binary_hashes) or written_validated != set(validated_files) or not written_cli:
                        fail()
            raw.flush()
            os.fsync(descriptor)
    finally:
        os.close(descriptor)
    digest = hashlib.sha256()
    with output.open('rb') as source:
        for chunk in iter(lambda: source.read(1048576), b''):
            digest.update(chunk)
    result = {'version': 'sun-world-linux-sdk-archive/1', 'sdk_version': '0.2.2-rc.1',
        'architecture': 'arm64', 'libc': 'glibc', 'node': '24.17.0',
        'selected_source_sha256': {name: sha(raw) for name, raw in sources.items()},
        'linux_binary_sha256': binary_hashes, 'entries': entries, 'expanded_bytes': expanded,
        'archive': {'sha256': digest.hexdigest(), 'size': output.stat().st_size},
        'portable_cli_link': True, 'install_scripts': False}
    descriptor = os.open(manifest, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        os.fchmod(descriptor, 0o600)
        with os.fdopen(descriptor, 'wb', closefd=False) as target:
            target.write((json.dumps(result, indent=2, sort_keys=True) + '\n').encode())
            target.flush()
            os.fsync(descriptor)
    finally:
        os.close(descriptor)
    return result


def main(argv=None):
    class Arguments(argparse.ArgumentParser):
        def error(self, message):
            self.exit(2, FAILED + '\n')
    parser = Arguments(allow_abbrev=False)
    parser.add_argument('--runtime', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args(argv)
    try:
        seal(args.runtime, args.output)
        print('AGENT_LINUX_SDK_ARCHIVE_PREPARED')
        return 0
    except BaseException as error:
        print(FAILED, file=sys.stderr)
        return 130 if isinstance(error, KeyboardInterrupt) else 1


if __name__ == '__main__':
    sys.exit(main())
