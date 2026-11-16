"""Bounded in-memory archives only; no installers, Linux binary or VM runs."""

import importlib.util
import io
from pathlib import Path
import stat
import tarfile
import tempfile
import unittest
from unittest.mock import patch
import zipfile

ROOT = Path(__file__).resolve().parents[3]


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts' / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


builder = load('stack_archive_builder_tests', 'prepare-agent-linux-guest.py')
stack = load('stack_archive_helpers_tests', 'agent-linux-vm-stack.py')


def tar(rows):
    output = io.BytesIO()
    with tarfile.open(fileobj=output, mode='w', format=tarfile.GNU_FORMAT) as archive:
        for name, kind, body, mode in rows:
            info = tarfile.TarInfo(name)
            info.type, info.mode = kind, mode
            if kind == tarfile.REGTYPE:
                info.size = len(body)
            archive.addfile(info, io.BytesIO(body) if kind == tarfile.REGTYPE else None)
    return output.getvalue()


class LinuxStackArchiveTests(unittest.TestCase):
    def test_only_explicit_mysql_recipe_accepts_identical_directory_headers(self):
        directory = ('fixed/bin', tarfile.DIRTYPE, b'', 0o755)
        raw = tar([directory, directory, ('fixed/bin/program', tarfile.REGTYPE, b'body', 0o755)])
        with self.assertRaises(ValueError):
            list(builder.tar_entries(raw, builder.Budget(stack=True)))
        rows = list(builder.tar_entries(raw, builder.Budget(stack=True), repeat_directories=True))
        self.assertEqual([r[0] for r in rows], ['fixed/bin', 'fixed/bin/program'])
        for second in [('fixed/bin', tarfile.DIRTYPE, b'', 0o777),
                       ('fixed/bin', tarfile.REGTYPE, b'body', 0o755)]:
            with self.assertRaises(ValueError):
                list(builder.tar_entries(tar([directory, second]), builder.Budget(stack=True), repeat_directories=True))
        file = ('fixed/program', tarfile.REGTYPE, b'body', 0o755)
        with self.assertRaises(ValueError):
            list(builder.tar_entries(tar([file, file]), builder.Budget(stack=True), repeat_directories=True))

    def test_empty_modules_preserve_bytes_only_when_explicitly_selected(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            path = root / 'pkg/__init__.py'
            path.parent.mkdir();path.write_bytes(b'')
            with patch.object(builder, 'ROOT', root):
                with self.assertRaises(ValueError):
                    builder.read_source('pkg/__init__.py')
                self.assertEqual(builder.read_source('pkg/__init__.py', allow_empty=True), b'')
                path.unlink();path.symlink_to(root / 'outside')
                with self.assertRaises(OSError):
                    builder.read_source('pkg/__init__.py', allow_empty=True)

    def test_stream_and_selected_output_budgets_remain_independent(self):
        with self.assertRaises(ValueError):
            builder.Budget().size(449185696)
        budget = builder.Budget(stack=True)
        budget.size(449185696)
        self.assertEqual(budget.total, 449185696)
        with self.assertRaises(ValueError):
            budget.size(512 * 1024**2 + 1)
        output = io.BytesIO()
        writer = stack.writer_type(builder.Cpio)(output)
        writer.selected_bytes = 2 * 1024**3 - 1
        with self.assertRaises(ValueError):
            writer.add('file', stat.S_IFREG | 0o644, b'ab')
        self.assertEqual(output.getvalue(), b'')

    def test_actual_wheel_members_stay_beneath_python_and_never_use_pth_or_symlinks(self):
        output = io.BytesIO()
        with zipfile.ZipFile(output, 'w') as archive:
            archive.writestr('synthetic/__init__.py', b'VALUE = 1\n')
        cpio = builder.Cpio(io.BytesIO(), gateway=True)
        stack.emit_wheel(cpio, builder.Budget(stack=True), output.getvalue(), builder.relative)
        self.assertIn('sw-root/opt/python/lib/python3.12/site-packages/synthetic/__init__.py', cpio.paths)
        for name in ('../outside', '/absolute', 'synthetic/load.pth', 'synthetic.data/scripts/run'):
            output = io.BytesIO()
            with zipfile.ZipFile(output, 'w') as archive:
                archive.writestr(name, b'SYNTHETIC_NEVER_EXECUTED')
            with self.subTest(name=name), self.assertRaises(ValueError):
                stack.emit_wheel(builder.Cpio(io.BytesIO(), gateway=True), builder.Budget(stack=True), output.getvalue(), builder.relative)
        output = io.BytesIO()
        with zipfile.ZipFile(output, 'w') as archive:
            info = zipfile.ZipInfo('synthetic/link')
            info.create_system, info.external_attr = 3, (stat.S_IFLNK | 0o777) << 16
            archive.writestr(info, '../outside')
        with self.assertRaises(ValueError):
            stack.emit_wheel(builder.Cpio(io.BytesIO(), gateway=True), builder.Budget(stack=True), output.getvalue(), builder.relative)

    def test_foreign_elf_is_rejected_before_becoming_a_runtime_member(self):
        header = bytearray(20)
        header[:6], header[18:20] = b'\x7fELF\x02\x01', (62).to_bytes(2, 'little')
        with self.assertRaises(ValueError):
            stack.arm64(header)
        header[18:20] = (183).to_bytes(2, 'little')
        self.assertTrue(stack.arm64(header))
