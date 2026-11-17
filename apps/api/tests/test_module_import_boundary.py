"""Mutate real source copies; the checker never imports application modules."""

import ast
import importlib.util
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import textwrap
import unittest


ROOT = Path(__file__).resolve().parents[3]
SPEC = importlib.util.spec_from_file_location('module_boundary_checker', ROOT / 'scripts/check-module-imports.py')
CHECKER = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = CHECKER
SPEC.loader.exec_module(CHECKER)


class ModuleBoundaryTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix='sun-world-module-boundary-')
        self.addCleanup(self.directory.cleanup)
        self.source = Path(self.directory.name) / 'apps/api/src'
        original = ROOT / 'apps/api/src'
        for path in original.rglob('*.py'):
            target = self.source / path.relative_to(original)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(path, target)
        self.router = self.source / 'modules/agent_runtime/router.py'
        self.facade = self.source / 'modules/ai/public.py'

    def append(self, code, path=None):
        path = path or self.router
        path.write_text(path.read_text() + '\n' + code + '\n')

    def codes(self):
        return {error.code for error in CHECKER.check_sources(self.source)}

    def test_actual_full_source_and_cli_are_clean_without_importing_application(self):
        original_modules = set(sys.modules)
        self.assertEqual(self.codes(), set())
        script = Path(self.directory.name) / 'scripts/check-module-imports.py'
        script.parent.mkdir()
        shutil.copyfile(ROOT / 'scripts/check-module-imports.py', script)
        result = subprocess.run([sys.executable, str(script)], timeout=10, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertIn('no application imports', result.stdout)
        self.assertNotIn('app_instance', sys.modules.keys() - original_modules)

    def test_original_four_private_edges_and_composition_backflow_are_rejected(self):
        additions = [
            'from src.modules.ai.schemas import AiStreamEvent',
            'from src.modules.blog.tools import BlogPublicTools',
            'from src.modules.blog.manifest import BLOG_MANIFEST',
        ]
        original = self.router.read_text()
        for addition in additions:
            self.router.write_text(original + '\n' + addition)
            self.assertIn('PRIVATE_MODULE_IMPORT', self.codes())
        self.router.write_text(original)
        projection = self.source / 'modules/management/projection.py'
        self.append('def reverse():\n    from src.module_composition import create_module_registry', projection)
        self.assertIn('COMPOSITION_BACKFLOW', self.codes())

    def test_relative_nested_type_checking_package_and_star_imports(self):
        original = self.router.read_text()
        for code, expected in [
            ('def nested():\n    from ..ai.schemas import AiStreamEvent', 'PRIVATE_MODULE_IMPORT'),
            ('from typing import TYPE_CHECKING\nif TYPE_CHECKING:\n    from ..ai.schemas import AiStreamEvent', 'PRIVATE_MODULE_IMPORT'),
            ('from src.modules.ai import schemas', 'PRIVATE_MODULE_IMPORT'),
            ('from src.modules import ai', 'PRIVATE_MODULE_IMPORT'),
            ('from src.modules.ai.public import *', 'NON_PUBLIC_EXPORT'),
            ('from .....outside import value', 'RELATIVE_OUTSIDE_SRC'),
            ('from ..does_not_exist.public import value', 'UNKNOWN_MODULE'),
        ]:
            with self.subTest(code=code):
                self.router.write_text(original + '\n' + code)
                self.assertIn(expected, self.codes())

    def test_public_import_alias_and_relative_values_retain_legitimate_attributes(self):
        self.append('''
from ..ai.public import AiStreamEvent as Event
import src.modules.ai.public as api
import src.modules.blog.public
def alias():
    constructor = api.AiStreamEvent
    exported = getattr(api, 'STRUCTURED_MODEL_LIMITS')
    return Event.model_validate, constructor.model_json_schema, exported.max_request_bytes, src.modules.blog.public.create_public_tools
''')
        self.assertEqual(self.codes(), set())

    def test_module_alias_private_getattr_and_assignment_piercing_are_rejected(self):
        original = self.router.read_text()
        for usage in ['api.schemas', 'getattr(api, "schemas")', 'getattr(api, field)',
                      'api.__dict__', 'alias.schemas']:
            self.router.write_text(original + '\nimport src.modules.ai.public as api\nalias=api\n' + usage)
            self.assertTrue(self.codes() & {'NON_PUBLIC_EXPORT', 'DYNAMIC_MODULE_ATTRIBUTE'})
        self.router.write_text(original + '\nimport src.modules.ai.public\nsrc.modules.ai.schemas.AiStreamEvent')
        self.assertIn('PRIVATE_MODULE_IMPORT', self.codes())

    def test_facade_must_have_one_static_unique_public_export_list(self):
        original = self.facade.read_text()
        node = next(node for node in ast.parse(original).body if isinstance(node, ast.Assign)
                    and any(isinstance(target, ast.Name) and target.id == '__all__' for target in node.targets))
        lines = original.splitlines(keepends=True)
        for replacement, expected in [
            ('', 'FACADE_ALL_REQUIRED'),
            ("__all__=['missing']\n", 'FACADE_EXPORT_NOT_VALUE'),
            ("__all__=['AiStreamEvent','AiStreamEvent']\n", 'FACADE_ALL_DUPLICATE'),
            ("__all__=['_private']\n", 'FACADE_ALL_STATIC'),
            ("__all__=list(('AiStreamEvent',))\n", 'FACADE_ALL_STATIC'),
        ]:
            self.facade.write_text(''.join(lines[:node.lineno - 1]) + replacement + ''.join(lines[node.end_lineno:]))
            self.assertIn(expected, self.codes())

    def test_facade_all_must_be_a_module_body_declaration(self):
        original = self.facade.read_text()
        declaration = next(node for node in ast.parse(original).body if isinstance(node, ast.Assign)
                           and any(isinstance(target, ast.Name) and target.id == '__all__' for target in node.targets))
        lines = original.splitlines(keepends=True)
        exported = ''.join(lines[declaration.lineno - 1:declaration.end_lineno])
        for wrapper in ('def unused_declaration():', 'class UnusedDeclaration:', 'if True:'):
            self.facade.write_text(''.join(lines[:declaration.lineno - 1]) + wrapper + '\n'
                                   + textwrap.indent(exported, '    ') + ''.join(lines[declaration.end_lineno:]))
            self.assertIn('FACADE_ALL_REQUIRED', self.codes())

    def test_static_all_cannot_mutate_or_escape_through_a_runtime_alias(self):
        facade = self.source / 'modules/blog/public.py'
        original = facade.read_text()
        for code in ("__all__.append('create_public_queries')", "__all__ += ['extra']",
                     "__all__[0]='extra'", "alias=__all__; alias.append('extra')",
                     "mutator=__all__.append; mutator('extra')", "del __all__"):
            with self.subTest(code=code):
                facade.write_text(original + '\n' + code)
                self.assertTrue(self.codes() & {'FACADE_ALL_STATIC', 'FACADE_ALL_REQUIRED'})
        facade.write_text(original.replace('__all__ = [', '__all__ = alias = [')
                          + "\nalias.append('create_public_queries')\n")
        self.assertIn('FACADE_ALL_STATIC', self.codes())

    def test_module_object_exports_and_reexport_chains_are_not_public_values(self):
        original = self.facade.read_text()
        for declaration in ['import src.modules.ai.schemas as leaked',
                            'from . import schemas as leaked',
                            'from .boundary_bridge import leaked',
                            'from os import path as leaked']:
            (self.facade.parent / 'boundary_bridge.py').write_text('from . import schemas as leaked\n')
            self.facade.write_text(original.replace('__all__ = [', "__all__ = ['leaked',") + '\n' + declaration)
            self.assertIn('FACADE_EXPORT_NOT_VALUE', self.codes())

    def test_unknown_public_name_and_nonexistent_facade_are_rejected(self):
        self.append('from src.modules.ai.public import NotAnExport')
        self.assertIn('NON_PUBLIC_EXPORT', self.codes())
        self.facade.unlink()
        self.assertIn('FACADE_MISSING', self.codes())

    def test_core_ai_and_business_cannot_reverse_the_dependency_direction(self):
        self.append('from src.modules.ai.public import AiStreamEvent', self.source / 'core/auth/__init__.py')
        self.assertIn('CORE_BUSINESS_IMPORT', self.codes())
        self.append('from src.modules.agent_runtime.public import value', self.source / 'modules/ai/__init__.py')
        self.assertIn('AI_RUNTIME_BACKFLOW', self.codes())
        self.append('from src import module_composition', self.source / 'core/__init__.py')
        self.assertIn('COMPOSITION_BACKFLOW', self.codes())

    def test_dynamic_imports_detect_alias_getattr_and_unknown_targets(self):
        original = self.router.read_text()
        for code in [
            '__import__("src.modules.ai.public")',
            'import importlib as il\nil.import_module("src.modules.ai.public")',
            'from importlib import import_module as load\nload(target)',
            'import importlib as il\nload=il.import_module\nload("src.core.auth")',
            'import importlib\ngetattr(importlib,"import_module")("src.modules.ai.public")',
            'import builtins as b\nloader=b.__import__\nloader(name="src.core")',
            'from importlib import import_module\nimport_module(".public", package="src.modules.ai")',
            'import importlib\nimportlib.__import__("src.core")',
            'import importlib\ngetattr(importlib, loader_name)("src.core")',
            'loader=__import__(name="importlib")\nloader.import_module("src.modules.ai.schemas")',
            'def outer():\n    def inner():\n        loader("src.modules.ai.schemas")\n    from importlib import import_module as loader\n    inner()',
            'def outer():\n    def inner():\n        loader("src.modules.ai.schemas")\n    import importlib\n    loader=importlib.import_module\n    inner()',
        ]:
            with self.subTest(code=code):
                self.router.write_text(original + '\n' + code)
                self.assertIn('DYNAMIC_IMPORT', self.codes())

    def test_constant_external_dynamic_imports_keep_the_existing_mcp_loader(self):
        self.append('''
from importlib import import_module as load
import importlib as il
import builtins
load('mcp')
il.import_module('mcp.client.streamable_http')
builtins.__import__('httpx2')
load('src_external')
''')
        self.assertEqual(self.codes(), set())

    def test_new_module_directories_are_scanned_without_registering_exemptions(self):
        new = self.source / 'modules/new_module'
        new.mkdir()
        (new / 'public.py').write_text("class Visible: pass\n__all__=['Visible']\n")
        self.append('from ..new_module.public import Visible')
        self.assertEqual(self.codes(), set())
        (new / 'private.py').write_text('from src.modules.ai.schemas import AiStreamEvent\n')
        self.assertIn('PRIVATE_MODULE_IMPORT', self.codes())

    def test_missing_or_empty_source_trees_and_bare_local_namespaces_fail_closed(self):
        self.assertIn('SOURCE_TREE_REQUIRED', {
            error.code for error in CHECKER.check_sources(self.source / 'missing')})
        original = self.router.read_text()
        for code in ('import modules.blog.repository', 'from core.auth import Principal'):
            self.router.write_text(original + '\n' + code)
            self.assertIn('LOCAL_NAMESPACE_REQUIRED', self.codes())
        shutil.rmtree(self.source / 'core')
        self.assertIn('SOURCE_TREE_REQUIRED', self.codes())

    def test_all_eleven_old_adapter_edges_are_rejected_in_actual_source_copies(self):
        cases = [
            ('controller/blog_manage.py', 'from src.modules.blog.repository import build_blog_list_query'),
            ('controller/user_manage.py', 'from src.modules.identity.normalization import normalize_phone'),
            ('routers/admin/admin.py', 'from src.modules.ai.run_metrics import ai_run_metrics'),
            ('routers/admin/admin.py', 'from src.modules.ai.errors import AiDomainError'),
            ('routers/admin/admin.py', 'from src.modules.ai.schemas import AiProviderCatalog'),
            ('routers/admin/admin.py', 'from src.modules.ai.service import AiService'),
            ('routers/ai/__init__.py', 'from src.modules.ai.router import router'),
            ('routers/auth/auth.py', 'from src.modules.management.policy import ManagementDenied'),
            ('routers/file/file.py', 'from src.modules.files.storage import store_image'),
            ('type/auth_type.py', 'from src.modules.identity.errors import IdentityDomainError'),
            ('type/auth_type.py', 'from src.modules.identity.normalization import normalize_email'),
        ]
        for relative, code in cases:
            path = self.source / relative
            original = path.read_text()
            with self.subTest(relative=relative, code=code):
                self.append(code, path)
                self.assertIn('PRIVATE_MODULE_IMPORT', self.codes())
            path.write_text(original)

    def test_adapters_and_new_src_directories_cannot_bypass_public_with_aliases_or_package_roots(self):
        directory = self.source / 'new_adapter'
        directory.mkdir()
        adapter = directory / 'entry.py'
        for code, expected in [
            ('import src.modules', 'PRIVATE_MODULE_IMPORT'),
            ('from src.modules import ai', 'PRIVATE_MODULE_IMPORT'),
            ('from src.modules.ai import *', 'PRIVATE_MODULE_IMPORT'),
            ('from src.modules.ai.public import *', 'NON_PUBLIC_EXPORT'),
            ('import src.modules.ai.public as api\napi.schemas', 'NON_PUBLIC_EXPORT'),
            ('from ..modules.ai.service import AiService', 'PRIVATE_MODULE_IMPORT'),
            ('from importlib import import_module as load\nload("src.modules.ai.public")', 'DYNAMIC_IMPORT'),
            ('import src\npackage = src.modules', 'PRIVATE_MODULE_IMPORT'),
        ]:
            with self.subTest(code=code):
                adapter.write_text(code + '\n')
                self.assertIn(expected, self.codes())
        adapter.write_text('from src.modules.ai.public import AiService\nfrom src.module_composition import get_ai_v1_router\n')
        self.assertEqual(self.codes(), set())

    def test_only_the_exact_composition_root_can_assemble_existing_private_implementations(self):
        self.assertEqual(self.codes(), set())
        similar = self.source / 'module_composition_extra.py'
        similar.write_text('from src.modules.ai.router import router\n')
        self.assertIn('PRIVATE_MODULE_IMPORT', self.codes())
        similar.unlink()
        composition = self.source / 'module_composition.py'
        self.append('from src.modules.ai.not_present import missing', composition)
        self.assertIn('UNKNOWN_MODULE', self.codes())

    def test_canonical_file_package_duplicates_are_rejected_without_overwriting_an_ast(self):
        for relative in ('modules/blog/repository', 'core/response', 'controller/blog_manage'):
            duplicate = self.source / relative
            duplicate.mkdir()
            (duplicate / '__init__.py').write_text('')
            self.assertIn('DUPLICATE_CANONICAL_MODULE', self.codes())
            shutil.rmtree(duplicate)

    def test_local_src_stars_cannot_leak_previously_loaded_business_namespaces(self):
        directory = self.source / 'new_adapter'
        directory.mkdir()
        adapter = directory / 'entry.py'
        for code in ('from src import *\ninternal = modules.ai.schemas.AiStreamEvent',
                     'from .. import *\ninternal = modules.ai.schemas.AiStreamEvent',
                     'from src.core import *'):
            with self.subTest(code=code):
                adapter.write_text(code + '\n')
                self.assertIn('LOCAL_STAR_IMPORT', self.codes())
        adapter.write_text('from math import *\nfrom src.module_composition import get_ai_v1_router\n')
        self.assertEqual(self.codes(), set())


if __name__ == '__main__':
    unittest.main()
