"""Offline guest archive boundaries: synthetic tar/ar/CPIO, never guest execution."""

import ast
import contextlib
import gzip
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import stat
import subprocess
import sys
import tarfile
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[3]
SCRIPT = ROOT / 'scripts/prepare-agent-linux-guest.py'
PRIVATE = 'SYNTHETIC_PRIVATE_ARGV_SOURCE'


def load():
    spec = importlib.util.spec_from_file_location('guest_archive_builder', SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def tar(rows, *, compressed=False):
    target = io.BytesIO()
    with tarfile.open(fileobj=target, mode='w:gz' if compressed else 'w', format=tarfile.GNU_FORMAT) as archive:
        for name, kind, value in rows:
            info = tarfile.TarInfo(name)
            info.mode, info.mtime = 0o755, 123456
            info.type = kind
            if kind in (tarfile.SYMTYPE, tarfile.LNKTYPE):
                info.linkname = value
            elif kind == tarfile.REGTYPE:
                info.size = len(value)
            archive.addfile(info, io.BytesIO(value) if kind == tarfile.REGTYPE else None)
    return target.getvalue()


def ar(rows):
    raw = b'!<arch>\n'
    for name, body in rows:
        raw += f'{name:<16}{0:<12}{0:<6}{0:<6}{"100644":<8}{len(body):<10}`\n'.encode() + body
        if len(body) % 2:
            raw += b'\n'
    return raw


def decode_cpio(raw):
    offset, entries = 0, {}
    while True:
        assert offset % 4 == 0
        assert raw[offset:offset + 6] == b'070701'
        fields = [int(raw[offset + 6 + index * 8:offset + 14 + index * 8], 16) for index in range(13)]
        offset += 110
        name = raw[offset:offset + fields[11] - 1].decode()
        assert raw[offset + fields[11] - 1] == 0
        offset += fields[11]
        offset += -offset % 4
        body = raw[offset:offset + fields[6]]
        assert len(body) == fields[6]
        offset += fields[6]
        offset += -offset % 4
        assert fields[4] == 1 and fields[5] == 0
        if name == 'TRAILER!!!':
            assert offset == len(raw)
            return entries
        assert name not in entries
        entries[name] = (fields, body)


class AgentLinuxGuestArchiveTests(unittest.TestCase):
    def setUp(self):
        self.builder = load()
        directory = tempfile.TemporaryDirectory(prefix='sun-world-archive-unit-')
        self.addCleanup(directory.cleanup)
        self.root = Path(directory.name)
        self.cache, self.project = self.root / 'cache', self.root / 'project'
        self.cache.mkdir(mode=0o700)
        self.project.mkdir(mode=0o700)
        self.output = self.root / 'initrd'
        self.assets = {
            'ubuntu-base.tar.gz': tar([('.', tarfile.DIRTYPE, b''), ('usr', tarfile.DIRTYPE, b''),
                ('usr/bin', tarfile.DIRTYPE, b''), ('bin', tarfile.SYMTYPE, 'usr/bin'),
                ('usr/bin/original', tarfile.REGTYPE, b'original-root-data'),
                ('usr/bin/hardcopy', tarfile.LNKTYPE, 'usr/bin/original')], compressed=True),
            'kernel': b'FIXED_KERNEL_BYTES', 'original-initrd': b'ORIGINAL_INITRD_BYTES',
            'node.tar.xz': tar([('node-v24.17.0-linux-arm64/bin/node', tarfile.REGTYPE,
                b'ELF-not-executed-sk-' + b'A'*48), ('unused/header', tarfile.REGTYPE, b'never-package')]),
            'tini.deb': ar([('debian-binary', b'2.0\n'), ('control.tar.xz', b'ignored-control'),
                ('data.tar.gz', tar([('./usr/bin/tini-static', tarfile.REGTYPE, b'FIXED_TINI')], compressed=True))]),
        }
        contract = {'version': 'sun-world-linux-vm-assets/1', 'architecture': 'arm64', 'node_version': '24.17.0',
                    'assets': []}
        for name, raw in self.assets.items():
            path = self.cache / name
            path.write_bytes(raw)
            path.chmod(0o600)
            contract['assets'].append({'filename': name, 'sha256': hashlib.sha256(raw).hexdigest(),
                                      'max_bytes': self.builder.SIZES[name], 'url': 'https://official.invalid/fixed'})
        contract_path = self.project / 'assets.json'
        contract_path.write_text(json.dumps(contract))
        for name in self.builder.SOURCES:
            path = self.project / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(b'// fixed synthetic payload\n')
        for attribute, value in [('ROOT', self.project), ('ASSETS', contract_path)]:
            patched = patch.object(self.builder, attribute, value)
            patched.start()
            self.addCleanup(patched.stop)

    def entries(self, path=None):
        raw = (path or self.output).read_bytes()
        prefix = self.assets['original-initrd']
        self.assertTrue(raw.startswith(prefix))
        compressed = raw[len(prefix):]
        self.assertEqual(compressed[4:8], b'\0'*4)
        return decode_cpio(gzip.decompress(compressed))

    def test_fixed_whitelist_correct_newc_links_modes_manifest_and_determinism(self):
        for name in ('.env', '.git/private', 'data/secret', 'node_modules/private'):
            path = self.project / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(PRIVATE)
        report = self.builder.build(self.cache, self.output)
        entries = self.entries()
        self.assertEqual(len(self.builder.SOURCES), 31)
        self.assertEqual(len(self.builder.WORKER), 17)
        self.assertEqual(set(report['payload_sha256']), set(self.builder.SOURCES))
        self.assertEqual(entries['sw-root/bin'][1], b'usr/bin')
        self.assertEqual(stat.S_IFMT(entries['sw-root/bin'][0][1]), stat.S_IFLNK)
        self.assertEqual(entries['sw-root/usr/bin/hardcopy'][1], entries['sw-root/usr/bin/original'][1])
        self.assertNotEqual(entries['sw-root/usr/bin/hardcopy'][0][0], entries['sw-root/usr/bin/original'][0][0])
        self.assertEqual(entries['sw-root/usr/local/bin/tini'][1], b'FIXED_TINI')
        self.assertEqual(entries['sw-root/usr/local/bin/node'][1], b'ELF-not-executed-sk-' + b'A'*48)
        for name in ('init', 'sw-root/work/run-guest.sh', 'sw-root/usr/local/bin/node', 'sw-root/usr/local/bin/tini'):
            self.assertEqual(entries[name][0][1] & 0o777, 0o755)
        for name, digest in report['payload_sha256'].items():
            destination = self.builder.GUEST.get(name, ('sw-root/work/sun-world/' + name, 0))[0]
            self.assertEqual(hashlib.sha256(entries[destination][1]).hexdigest(), digest)
        self.assertFalse(any('.env' in name or '.git' in name or 'node_modules' in name or 'unused' in name for name in entries))
        self.assertEqual(len(entries), report['guest_entries'])
        self.assertEqual(report['derived_initrd']['sha256'], hashlib.sha256(self.output.read_bytes()).hexdigest())
        self.assertEqual(report['derived_initrd']['size'], self.output.stat().st_size)
        self.assertEqual(stat.S_IMODE(self.output.stat().st_mode), 0o600)
        manifest = Path(str(self.output) + '.manifest.json')
        self.assertEqual(stat.S_IMODE(manifest.stat().st_mode), 0o600)
        self.assertEqual(json.loads(manifest.read_text()), report)
        second = self.root / 'another-initrd'
        self.builder.build(self.cache, second)
        self.assertEqual(self.output.read_bytes(), second.read_bytes())
        self.assertEqual(manifest.read_bytes(), Path(str(second) + '.manifest.json').read_bytes())
        self.assertEqual(list(self.root.glob('usr*')), [])

    def test_tar_path_traversal_duplicates_bad_links_and_unsupported_types_rejected(self):
        bad = [[('/absolute', tarfile.REGTYPE, b'x')], [('../escape', tarfile.REGTYPE, b'x')],
            [('ok/../../escape', tarfile.REGTYPE, b'x')], [('bad\\name', tarfile.REGTYPE, b'x')],
            [('same', tarfile.REGTYPE, b'a'), ('./same', tarfile.REGTYPE, b'b')],
            [('copy', tarfile.LNKTYPE, '../outside')], [('copy', tarfile.LNKTYPE, '/etc/passwd')],
            [('copy', tarfile.LNKTYPE, 'future'), ('future', tarfile.REGTYPE, b'x')],
            [('dir/link', tarfile.SYMTYPE, '../../outside')], [('device', tarfile.CHRTYPE, b'')],
            [('fifo', tarfile.FIFOTYPE, b'')]]
        for rows in bad:
            with self.subTest(kind=rows[0][1]):
                with self.assertRaises((ValueError, tarfile.TarError)):
                    list(self.builder.tar_entries(tar(rows), self.builder.Budget()))
        with self.assertRaises(ValueError):
            self.builder.relative('nul\0name')
        outside = self.root / 'outside'
        self.assertFalse(outside.exists())
        output = io.BytesIO()
        writer = self.builder.Cpio(output)
        writer.add('link', stat.S_IFLNK | 0o777, b'/usr/bin')
        with self.assertRaises(ValueError):
            writer.add('link/child', stat.S_IFREG | 0o644, b'x')
        self.assertFalse(outside.exists())

    def test_new_archive_never_overlays_original_initrd_tools_except_controlled_init(self):
        self.builder.build(self.cache, self.output)
        entries = self.entries()
        self.assertEqual({name.split('/')[0] for name in entries}, {'init', 'sw-root'})
        self.assertEqual(entries['sw-root'][0][1], stat.S_IFDIR | 0o755)
        self.assertTrue(all(name == 'init' or name == 'sw-root' or name.startswith('sw-root/') for name in entries))
        self.assertFalse(any(name in entries for name in ('bin', 'usr', 'usr/bin', 'bin/mount', 'usr/bin/mount', 'work')))
        self.assertIn('sw-root/usr/bin/original', entries)
        self.assertIn('sw-root/work/probe.mjs', entries)
        self.assertIn('sw-root/work/sun-world/apps/agent-worker/src/process-runner.mjs', entries)
        manifest = json.loads(Path(str(self.output) + '.manifest.json').read_text())
        self.assertEqual(set(manifest['payload_sha256']), set(self.builder.SOURCES))

    def test_stream_size_entry_and_metadata_limits_reject_without_large_allocations(self):
        info = tarfile.TarInfo('huge')
        info.size = 256 * 1024**2 + 1
        with self.assertRaises(ValueError):
            list(self.builder.tar_entries(info.tobuf(), self.builder.Budget()))
        info.type, info.size = tarfile.GNUTYPE_LONGNAME, 65537
        with self.assertRaises(ValueError):
            list(self.builder.tar_entries(info.tobuf(), self.builder.Budget()))
        budget = self.builder.Budget()
        budget.size(256 * 1024**2)
        budget.size(256 * 1024**2)
        with self.assertRaises(ValueError):
            budget.size(1)
        directories = [(f'directory-{i}', tarfile.DIRTYPE, b'') for i in range(20001)]
        with self.assertRaises(ValueError):
            list(self.builder.tar_entries(tar(directories), self.builder.Budget()))
        info.type, info.size = tarfile.REGTYPE, 100
        with self.assertRaises(tarfile.TarError):
            list(self.builder.tar_entries(info.tobuf(), self.builder.Budget()))

    def test_exact_node_and_static_tini_only_and_invalid_ar_rejected(self):
        duplicate = ar([('debian-binary', b'2.0\n'), ('data.tar.gz', b'x'), ('data.tar.xz', b'y')])
        for raw in (b'not-ar', duplicate, self.assets['tini.deb'][:-1]):
            with self.assertRaises((ValueError, UnicodeError)):
                self.builder.tini_archive(raw)
        with patch.object(self.builder, 'load_inputs', return_value=(
                {**self.assets, 'node.tar.xz': tar([('other/bin/node', tarfile.REGTYPE, b'x')])}, {}, {})):
            with self.assertRaises(ValueError):
                self.builder.build(self.cache, self.output)
        self.assertFalse(Path(str(self.output) + '.manifest.json').exists())

    def test_asset_hash_symlink_hardlink_permissions_and_partial_names_fail_before_output(self):
        target = self.cache / 'kernel'
        original = target.read_bytes()
        for kind in ('hash', 'symlink', 'hardlink', 'permissions', 'partial'):
            with self.subTest(kind=kind):
                if target.exists() or target.is_symlink():
                    target.unlink()
                external = self.root / ('source-' + kind)
                external.write_bytes(original)
                if kind == 'symlink':
                    target.symlink_to(external)
                elif kind == 'hardlink':
                    os.link(external, target)
                    target.chmod(0o600)
                elif kind == 'partial':
                    target.with_suffix('.partial').write_bytes(original)
                else:
                    target.write_bytes(original + b'corrupt' if kind == 'hash' else original)
                    target.chmod(0o644 if kind == 'permissions' else 0o600)
                with self.assertRaises((OSError, ValueError)):
                    self.builder.build(self.cache, self.output)
                self.assertFalse(self.output.exists())

    def test_verified_asset_bytes_are_parsed_even_if_source_changes_after_read(self):
        read = self.builder.read_owned
        source = self.cache / 'ubuntu-base.tar.gz'
        def replaced(path, maximum, **options):
            raw = read(path, maximum, **options)
            if Path(path) == source:
                source.write_bytes(b'now-invalid-tar')
            return raw
        with patch.object(self.builder, 'read_owned', side_effect=replaced):
            self.builder.build(self.cache, self.output)
        self.assertEqual(self.entries()['sw-root/usr/bin/original'][1], b'original-root-data')
        with self.assertRaises(ValueError):
            self.builder.build(self.cache, self.root / 'must-fail')

    def test_payload_missing_symlink_or_secret_patterns_fail_before_output(self):
        source = self.project / self.builder.SOURCES[0]
        original = source.read_bytes()
        for raw in (b'sk-' + b'A'*32, b'Bearer ' + b'Z'*32, b'-----BEGIN PRIVATE KEY-----'):
            source.write_bytes(raw)
            with self.assertRaises(ValueError):
                self.builder.build(self.cache, self.output)
            self.assertFalse(self.output.exists())
        source.write_bytes(original)
        source.unlink()
        source.symlink_to(self.project / self.builder.SOURCES[1])
        with self.assertRaises(OSError):
            self.builder.build(self.cache, self.output)
        source.unlink()
        with self.assertRaises(OSError):
            self.builder.build(self.cache, self.output)
        self.assertFalse(self.output.exists())

    def test_whitelist_parent_directory_symlink_cannot_select_outside_sources(self):
        source = self.project / 'apps/agent-worker/src'
        preserved = source.with_name('original-source')
        source.rename(preserved)
        source.symlink_to(preserved, target_is_directory=True)
        with self.assertRaises(OSError):
            self.builder.build(self.cache, self.output)
        self.assertFalse(self.output.exists())

    def test_existing_output_or_manifest_is_never_overwritten_and_partial_fsync_is_failure(self):
        manifest = Path(str(self.output) + '.manifest.json')
        manifest.write_text(PRIVATE)
        with self.assertRaises(ValueError):
            self.builder.build(self.cache, self.output)
        self.assertFalse(self.output.exists())
        self.assertEqual(manifest.read_text(), PRIVATE)
        manifest.unlink()
        self.output.write_text(PRIVATE)
        with self.assertRaises(ValueError):
            self.builder.build(self.cache, self.output)
        self.assertEqual(self.output.read_text(), PRIVATE)
        self.output.unlink()
        output, error = io.StringIO(), io.StringIO()
        with patch.object(self.builder.os, 'fsync', side_effect=OSError(PRIVATE)), \
                contextlib.redirect_stdout(output), contextlib.redirect_stderr(error):
            code = self.builder.main(['--cache', str(self.cache), '--output', str(self.output)])
        self.assertEqual(code, 1)
        self.assertEqual(output.getvalue(), '')
        self.assertEqual(error.getvalue(), self.builder.FAILED + '\n')
        self.assertTrue(self.output.exists())
        self.assertFalse(manifest.exists())

    def test_cli_bad_arguments_are_fixed_and_builder_imports_only_stdlib_and_explicit_optional_codec(self):
        for arguments in ([], ['--cache'], ['--asset-url', PRIVATE], ['--output', 'relative']):
            result = subprocess.run([sys.executable, '-S', str(SCRIPT), *arguments], capture_output=True,
                                    text=True, timeout=5, env={'PATH': os.defpath})
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(result.stdout, '')
            self.assertEqual(result.stderr, self.builder.FAILED + '\n')
            self.assertNotIn(PRIVATE, result.stderr)
        imports = set()
        for node in ast.walk(ast.parse(SCRIPT.read_text())):
            if isinstance(node, ast.Import):
                imports.update(alias.name.split('.')[0] for alias in node.names)
            elif isinstance(node, ast.ImportFrom):
                imports.add(node.module.split('.')[0])
        self.assertLessEqual(imports, {'argparse', 'gzip', 'hashlib', 'io', 'json', 'os', 'pathlib',
                                      'posixpath', 're', 'stat', 'sys', 'tarfile', 'zstandard'})

    def test_additional_zstd_deb_is_bounded_single_known_size_frame_without_host_extraction(self):
        import zstandard
        source = tar([('usr/bin/bwrap', tarfile.REGTYPE, b'SYNTHETIC_BWRAP')])
        encoded = zstandard.ZstdCompressor().compress(source)
        package = lambda body: ar([('debian-binary', b'2.0\n'), ('data.tar.zst', body)])
        self.assertEqual(self.builder.bubblewrap_archive(package(encoded)), source)
        bad = [encoded[:-2], encoded + b'trailing', encoded + encoded,
               zstandard.ZstdCompressor(write_content_size=False).compress(source),
               zstandard.ZstdCompressor().compress(b'A' * (2 * 1024**2 + 1))]
        for index, raw in enumerate(bad):
            with self.subTest(index=index), self.assertRaises(Exception):
                self.builder.bubblewrap_archive(package(raw))

    def test_explicit_containment_asset_and_sources_are_pinned_and_never_added_to_default(self):
        raw = ar([('debian-binary', b'2.0\n'), ('data.tar.gz', tar([
            ('./usr/bin/bwrap', tarfile.REGTYPE, b'FIXED_BWRAP'),
            ('./usr/bin/unused-bwrap-tool', tarfile.REGTYPE, b'NOT_INCLUDED')], compressed=True))])
        asset = self.cache / 'bubblewrap.deb'
        asset.write_bytes(raw)
        asset.chmod(0o600)
        contract = self.project / 'containment-assets.json'
        data = {'version': 'sun-world-linux-containment-assets/1',
            'base_assets_sha256': hashlib.sha256(self.builder.ASSETS.read_bytes()).hexdigest(),
            'assets': [{'filename': 'bubblewrap.deb', 'sha256': hashlib.sha256(raw).hexdigest(),
                        'max_bytes': 1048576}]}
        contract.write_text(json.dumps(data))
        for name in self.builder.CONTAINMENT_SOURCES:
            path = self.project / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(b'// synthetic containment source\n')
        with patch.object(self.builder, 'CONTAINMENT_ASSETS', contract):
            report = self.builder.build(self.cache, self.output, containment=True)
            self.assertEqual(len(report['assets']), 6)
            self.assertEqual(set(report['payload_sha256']), set(self.builder.SOURCES + self.builder.CONTAINMENT_SOURCES))
            entries = self.entries()
            self.assertEqual(entries['sw-root/usr/local/bin/bwrap'][1], b'FIXED_BWRAP')
            self.assertNotIn('sw-root/usr/bin/unused-bwrap-tool', entries)
            data['base_assets_sha256'] = '0' * 64
            contract.write_text(json.dumps(data))
            with self.assertRaises(ValueError):
                self.builder.build(self.cache, self.root / 'bad-containment', containment=True)
            # The additional binary/contract is not read on the default path.
            asset.write_bytes(b'INVALID_IGNORED_EXTRA')
            original = self.builder.build(self.cache, self.root / 'default-initrd')
            self.assertEqual(len(original['assets']), 5)
            self.assertEqual(set(original['payload_sha256']), set(self.builder.SOURCES))
