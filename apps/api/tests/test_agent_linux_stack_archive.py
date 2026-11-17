"""Bounded in-memory archives only; no installers, Linux binary or VM runs."""

import importlib.util
import io
import json
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
    def test_actual_declared_source_manifest_has_direct_python_import_closure(self):
        contract = json.loads(builder.read_source(stack.SOURCES))
        self.assertEqual(stack.source_paths(builder.read_source), contract['paths'])

    def test_actual_imports_reject_each_missing_auth_module_before_packaging(self):
        contract = json.loads(builder.read_source(stack.SOURCES))
        for module in ('admin_recovery', 'recent', 'admin_audit'):
            missing = f'apps/api/src/core/auth/{module}.py'
            paths = [path for path in contract['paths'] if path != missing]
            self.assertEqual(len(paths), len(contract['paths']) - 1)
            def read(name, **kwargs):
                if name == stack.SOURCES:
                    return json.dumps({**contract, 'paths': paths}).encode()
                return builder.read_source(name, **kwargs)
            with self.subTest(module=module), self.assertRaisesRegex(ValueError, '^AGENT_LINUX_GUEST_PREPARE_FAILED$'):
                stack.source_paths(read)

    def test_actual_auth_initializer_cannot_be_removed_while_members_are_imported(self):
        contract = json.loads(builder.read_source(stack.SOURCES))
        paths = [path for path in contract['paths'] if path != 'apps/api/src/core/auth/__init__.py']
        self.assertEqual(len(paths), len(contract['paths']) - 1)
        def read(name, **kwargs):
            if name == stack.SOURCES:
                return json.dumps({**contract, 'paths': paths}).encode()
            return builder.read_source(name, **kwargs)
        with self.assertRaisesRegex(ValueError, '^AGENT_LINUX_GUEST_PREPARE_FAILED$'):
            stack.source_paths(read)

    def test_relative_packages_namespaces_and_attributes_are_not_guessed_submodules(self):
        sources = {
            'apps/api/src/__init__.py': b'',
            'apps/api/src/pkg/__init__.py': b'Principal = object\n',
            'apps/api/src/pkg/entry.py': b'from . import Principal\nfrom .child import VALUE\nfrom ..type import leaf\nimport src.type.leaf\n',
            'apps/api/src/pkg/child.py': b'VALUE = 1\n',
            # Only the real maintained namespace locations are permitted.
            'apps/api/src/type/leaf.py': b'VALUE = 2\n',
        }
        opened = []
        def read(name, **kwargs):
            opened.append(name)
            if name == stack.SOURCES:
                return json.dumps({'version': 'sun-world-linux-stack-sources/1', 'paths': sorted(sources)}).encode()
            return sources[name]
        self.assertEqual(stack.source_paths(read), sorted(sources))
        self.assertEqual(set(opened), {stack.SOURCES, *sources})
        for body in (b'from .missing import thing\n', b'import src.type.missing\n',
                     b'from ....outside import thing\n', b'from . import missing\n',
                     b'from ..type import thing\n', b'from .child import UNKNOWN\n'):
            sources['apps/api/src/pkg/entry.py'] = body
            with self.subTest(body=body), self.assertRaisesRegex(ValueError, '^AGENT_LINUX_GUEST_PREPARE_FAILED$'):
                stack.source_paths(read)
        sources['apps/api/src/unknown_namespace/leaf.py'] = b'VALUE = 3\n'
        sources['apps/api/src/pkg/entry.py'] = b'import src.unknown_namespace.leaf\n'
        with self.assertRaisesRegex(ValueError, '^AGENT_LINUX_GUEST_PREPARE_FAILED$'):
            stack.source_paths(read)

    def test_source_ast_or_read_failure_has_only_the_fixed_error(self):
        path = 'apps/api/src/entry.py'
        for raw in (b'PRIVATE SYNTAX INVALID', None):
            def read(name, **kwargs):
                if name == stack.SOURCES:
                    return json.dumps({'version': 'sun-world-linux-stack-sources/1', 'paths': ['apps/api/src/__init__.py', path]}).encode()
                if name == 'apps/api/src/__init__.py':
                    return b''
                if raw is None:
                    raise OSError('PRIVATE filesystem details')
                return raw
            with self.assertRaisesRegex(ValueError, '^AGENT_LINUX_GUEST_PREPARE_FAILED$') as caught:
                stack.source_paths(read)
            self.assertNotIn('PRIVATE', str(caught.exception))

    def test_from_members_use_only_real_top_level_bindings_or_declared_children(self):
        sources = {
            'apps/api/src/__init__.py': b'',
            'apps/api/src/pkg/__init__.py': (
                b'class Principal: pass\ndef factory(): pass\nasync def async_factory(): pass\n'
                b'VALUE = 1\nANNOTATED: int = 2\nimport json as json_alias\n'
                b'from .child import CHILD_VALUE as alias\n'
                b'annotation_only: int\nundefined_owner.attribute = 1\n'
            ),
            'apps/api/src/pkg/child.py': b'CHILD_VALUE = 3\n',
            'apps/api/src/pkg/entry.py': (
                b'from . import Principal, factory, async_factory, VALUE, ANNOTATED, json_alias, alias, child\n'
            ),
        }
        def read(name, **kwargs):
            if name == stack.SOURCES:
                return json.dumps({'version': 'sun-world-linux-stack-sources/1', 'paths': sorted(sources)}).encode()
            return sources[name]
        self.assertEqual(stack.source_paths(read), sorted(sources))
        for member in ('annotation_only', 'undefined_owner', 'UNKNOWN'):
            sources['apps/api/src/pkg/entry.py'] = f'from . import {member}\n'.encode()
            with self.subTest(member=member), self.assertRaisesRegex(ValueError, '^AGENT_LINUX_GUEST_PREPARE_FAILED$'):
                stack.source_paths(read)

    def test_from_alias_cannot_prove_its_own_missing_or_circular_source(self):
        for mode in ('self', 'mutual'):
            sources = {'apps/api/src/__init__.py': b''}
            if mode == 'self':
                sources['apps/api/src/pkg/__init__.py'] = b'from . import missing\n'
            else:
                sources.update({
                    'apps/api/src/pkg/__init__.py': b'from .left import missing\n',
                    'apps/api/src/pkg/left.py': b'from .right import missing\n',
                    'apps/api/src/pkg/right.py': b'from .left import missing\n',
                })
            def read(name, **kwargs):
                if name == stack.SOURCES:
                    return json.dumps({'version': 'sun-world-linux-stack-sources/1', 'paths': sorted(sources)}).encode()
                return sources[name]
            with self.subTest(mode=mode), self.assertRaisesRegex(ValueError, '^AGENT_LINUX_GUEST_PREPARE_FAILED$'):
                stack.source_paths(read)

    def test_reexports_resolve_to_an_independent_class_or_declared_child(self):
        sources = {
            'apps/api/src/__init__.py': b'',
            'apps/api/src/pkg/__init__.py': b'from .middle import Exported\nfrom . import leaf as Child\n',
            'apps/api/src/pkg/middle.py': b'from .leaf import Original as Exported\n',
            'apps/api/src/pkg/leaf.py': b'class Original: pass\n',
            'apps/api/src/pkg/entry.py': b'from src.pkg import Exported, Child\n',
        }
        def read(name, **kwargs):
            if name == stack.SOURCES:
                return json.dumps({'version': 'sun-world-linux-stack-sources/1', 'paths': sorted(sources)}).encode()
            return sources[name]
        self.assertEqual(stack.source_paths(read), sorted(sources))

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
