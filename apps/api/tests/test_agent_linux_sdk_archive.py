"""Synthetic SDK tar boundaries only; no package manager, binary or guest runs."""

import gzip
import importlib.util
import io
import json
import os
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[3]


class LinuxSdkArchiveTests(unittest.TestCase):
    def setUp(self):
        spec = importlib.util.spec_from_file_location('sdk_archive_unit', ROOT / 'scripts/prepare-agent-linux-sdk.py')
        self.sdk = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.sdk)
        temporary = tempfile.TemporaryDirectory(prefix='sun-world-sdk-archive-')
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name).resolve()
        self.project, self.runtime = self.root / 'project', self.root / 'runtime'
        self.project.mkdir(mode=0o700); self.runtime.mkdir(mode=0o700)
        for name in self.sdk.SOURCES:
            target = self.project / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(b'// fixed synthetic repository bytes\n')
        for name in ('package.json', 'pnpm-lock.yaml'):
            (self.runtime / name).write_bytes((self.project / 'tools/dsh-blog-p0' / name).read_bytes())
        self.sdk.ROOT = self.project
        for name, version in self.sdk.NATIVE.items():
            package = self.runtime / 'node_modules/.pnpm' / (name.replace('/', '+') + '@' + version) / 'node_modules' / name
            package.mkdir(parents=True)
            (package / 'package.json').write_text(json.dumps({'name': name, 'version': version}))
            header = bytearray(24); header[:6] = b'\x7fELF\x02\x01'; header[18:20] = (183).to_bytes(2, 'little')
            (package / 'fixture.node').write_bytes(header)
        bin_dir = self.runtime / 'node_modules/.bin'; bin_dir.mkdir()
        (bin_dir.parent / 'synthetic-cli.mjs').write_text('// synthetic CLI, never executed\n')
        (bin_dir / 'dsh').symlink_to('../synthetic-cli.mjs')
        self.output = self.root / 'sdk.tar.gz'

    def test_only_explicit_sources_and_dependency_tree_are_sealed_deterministically(self):
        for name in ['.env', 'home/private', 'profiles/private', 'data/private']:
            target = self.runtime / name; target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text('SYNTHETIC_PRIVATE_DO_NOT_PACKAGE')
        metadata = self.sdk.seal(self.runtime, self.output)
        with tarfile.open(fileobj=io.BytesIO(gzip.decompress(self.output.read_bytes())), mode='r:') as archive:
            names = set(archive.getnames())
            self.assertTrue(set(self.sdk.SOURCES.values()) <= names)
            self.assertFalse({'.env', 'home/private', 'profiles/private', 'data/private'} & names)
            for entry in archive:
                self.assertEqual(entry.uid, 0); self.assertEqual(entry.gid, 0); self.assertEqual(entry.mtime, 0)
                if entry.isfile():
                    self.assertNotIn(b'SYNTHETIC_PRIVATE_DO_NOT_PACKAGE', archive.extractfile(entry).read())
        second = self.root / 'second.tar.gz'
        self.sdk.seal(self.runtime, second)
        self.assertEqual(self.output.read_bytes(), second.read_bytes())
        self.assertEqual(len(metadata['linux_binary_sha256']), 2)
        self.assertEqual(set(metadata['selected_source_sha256']), set(self.sdk.SOURCES))
        self.assertEqual(os.stat(self.output).st_mode & 0o777, 0o600)

    def test_escaping_dependency_symlinks_and_nonportable_cli_are_never_followed(self):
        linked = self.runtime / 'node_modules/escape'
        linked.symlink_to(self.root / 'outside-private')
        with self.assertRaises(ValueError):
            self.sdk.seal(self.runtime, self.output)
        self.assertFalse(Path(str(self.output) + '.manifest.json').exists())
        linked.unlink(); self.output.unlink()
        bin_path = self.runtime / 'node_modules/.bin/dsh'
        bin_path.unlink(); bin_path.write_text('SYNTHETIC_NONPORTABLE_HOST_SHIM')
        with self.assertRaises(ValueError):
            self.sdk.seal(self.runtime, self.output)
        self.assertFalse(self.output.exists())

    def test_missing_actual_native_binary_lock_mismatch_and_existing_output_are_rejected(self):
        native = next(self.runtime.glob('node_modules/.pnpm/*/node_modules/**/fixture.node'))
        original = native.read_bytes(); native.write_bytes(b'NOT_A_LINUX_BINARY')
        with self.assertRaises(ValueError): self.sdk.seal(self.runtime, self.output)
        native.write_bytes(original)
        copied = self.runtime / 'pnpm-lock.yaml'; copied.write_text('MODIFIED_LOCK')
        with self.assertRaises(ValueError): self.sdk.seal(self.runtime, self.output)
        copied.write_bytes((self.project / 'tools/dsh-blog-p0/pnpm-lock.yaml').read_bytes())
        self.output.write_text('EXISTING_PRIVATE_OUTPUT')
        with self.assertRaises(ValueError): self.sdk.seal(self.runtime, self.output)
        self.assertEqual(self.output.read_text(), 'EXISTING_PRIVATE_OUTPUT')

    def test_parent_symlink_cannot_select_unlisted_repository_bytes(self):
        source = self.project / 'apps/agent-worker/src'
        original = source.with_name('original-src'); source.rename(original)
        source.symlink_to(original, target_is_directory=True)
        with self.assertRaises(OSError): self.sdk.seal(self.runtime, self.output)
        self.assertFalse(self.output.exists())

    def test_native_bytes_changing_between_validation_and_archive_fail_without_manifest(self):
        original = self.sdk.read_regular
        counts = {}
        def changed(root, name, maximum):
            raw, info = original(root, name, maximum)
            if name.endswith('/fixture.node'):
                counts[name] = counts.get(name, 0) + 1
                if counts[name] > 1:
                    raw = raw[:-1] + bytes([raw[-1] ^ 1])
            return raw, info
        with patch.object(self.sdk, 'read_regular', side_effect=changed), self.assertRaises(ValueError):
            self.sdk.seal(self.runtime, self.output)
        self.assertFalse(Path(str(self.output) + '.manifest.json').exists())

    def test_validated_native_removed_or_replaced_by_symlink_is_rejected(self):
        for kind in ('remove', 'symlink'):
            with self.subTest(kind=kind):
                original = self.sdk.os.walk
                changed = False
                def walk(path, **options):
                    nonlocal changed
                    if Path(path) == self.runtime / 'node_modules' and not changed:
                        changed = True
                        for binary in self.runtime.glob('node_modules/.pnpm/*/node_modules/**/fixture.node'):
                            binary.unlink()
                            if kind == 'symlink':
                                binary.symlink_to('package.json')
                    yield from original(path, **options)
                with patch.object(self.sdk.os, 'walk', side_effect=walk), self.assertRaises(ValueError):
                    self.sdk.seal(self.runtime, self.output)
                self.assertFalse(Path(str(self.output) + '.manifest.json').exists())
                self.output.unlink(missing_ok=True)
                # Restore only this fixture's synthetic native files for the next fault.
                for name, version in self.sdk.NATIVE.items():
                    binary = self.runtime / 'node_modules/.pnpm' / (name.replace('/', '+') + '@' + version) / 'node_modules' / name / 'fixture.node'
                    binary.unlink(missing_ok=True)
                    header = bytearray(24); header[:6] = b'\x7fELF\x02\x01'; header[18:20] = (183).to_bytes(2, 'little')
                    binary.write_bytes(header)
