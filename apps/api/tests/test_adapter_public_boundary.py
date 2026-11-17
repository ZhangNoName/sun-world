"""Public identities and isolated assembly imports, with no service startup."""

import json
from pathlib import Path
import subprocess
import sys
import textwrap
import unittest


ROOT = Path(__file__).resolve().parents[3]


class AdapterPublicBoundaryTests(unittest.TestCase):
    def fresh(self, source):
        # Never inherit the developer's application environment or credentials.
        environment = {'PATH': '/usr/bin:/bin', 'LANG': 'C.UTF-8',
                       'PYTHONDONTWRITEBYTECODE': '1', 'PYTHONNOUSERSITE': '1'}
        prelude = f'import sys\nsys.path.insert(0, {str(ROOT / "apps/api")!r})\n'
        result = subprocess.run([sys.executable, '-I', '-B', '-c', prelude + textwrap.dedent(source)],
                                cwd=ROOT, env=environment, timeout=20, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        return json.loads(result.stdout)

    def test_fresh_public_imports_preserve_value_identity_without_bootstrap_or_startup_io(self):
        observed = self.fresh('''
            import importlib, json, os, sys
            def audit(event, args):
                if event in {'socket.connect', 'socket.getaddrinfo', 'subprocess.Popen', 'os.system'}:
                    raise AssertionError('Unexpected startup I/O')
                if event == 'open' and len(args) > 2 and type(args[2]) is int:
                    if args[2] & (os.O_WRONLY | os.O_RDWR | os.O_CREAT | os.O_TRUNC | os.O_APPEND):
                        raise AssertionError('Unexpected startup write')
            sys.addaudithook(audit)
            def profile(frame, event, arg):
                module = frame.f_globals.get('__name__', '')
                if event == 'call' and frame.f_code.co_name == '__init__' and module.startswith(
                    ('src.controller.', 'src.database.')):
                    raise AssertionError('Unexpected manager construction')
            sys.setprofile(profile)
            facades = {name: importlib.import_module('src.modules.' + name + '.public')
                       for name in ('identity', 'files', 'ai', 'management', 'blog')}
            sys.setprofile(None)
            assert 'app_instance' not in sys.modules
            assert 'src.modules.ai.router' not in sys.modules
            assert 'src.routers.auth.auth' not in sys.modules
            expected = {
                'identity': {'IdentityDomainError': 'errors', 'normalize_email': 'normalization', 'normalize_phone': 'normalization'},
                'files': {'StoredUpload': 'storage', 'UploadValidationError': 'storage', 'store_image': 'storage', 'store_video': 'storage'},
                'ai': {'AiService': 'service', 'AiDomainError': 'errors', 'AiProviderCatalog': 'schemas',
                       'AiProviderCatalogInput': 'schemas', 'AiStreamEvent': 'schemas', 'encode_sse_event': 'schemas',
                       'AiRunMetricsSnapshot': 'run_metrics'},
                'management': {'ManagementDenied': 'policy'},
            }
            for owner, declarations in expected.items():
                for name, internal in declarations.items():
                    implementation = importlib.import_module('src.modules.' + owner + '.' + internal)
                    assert getattr(facades[owner], name) is getattr(implementation, name)
                    assert name in facades[owner].__all__
            identity, ai = facades['identity'], facades['ai']
            assert identity.normalize_email(' Person@Example.COM ') == 'person@example.com'
            assert identity.normalize_phone('138 0013 8000') == '+8613800138000'
            for forbidden in ('ai_run_metrics', 'AiRepository', 'router', 'get_ai_v1_router'):
                assert not hasattr(ai, forbidden)
            assert not hasattr(facades['blog'], 'build_blog_list_query')
            metrics = importlib.import_module('src.modules.ai.run_metrics').ai_run_metrics
            before = ai.get_ai_run_metrics_snapshot()
            metrics.start()
            metrics.finish('completed', 1)
            after = ai.get_ai_run_metrics_snapshot()
            assert type(after) is ai.AiRunMetricsSnapshot
            assert after.started == before.started + 1
            assert after.completed == before.completed + 1
            assert after.model_dump() == metrics.snapshot().model_dump()
            print(json.dumps({'identities': True, 'no_bootstrap': True, 'same_collector': True}))
        ''')
        self.assertEqual(observed, {'identities': True, 'no_bootstrap': True, 'same_collector': True})

    def test_composition_getter_is_lazy_and_preserves_singleton_and_legacy_v1_route_order(self):
        observed = self.fresh(f'''
            import importlib, importlib.util, json, sys
            from src.module_composition import get_ai_v1_router
            assert 'src.modules.ai.router' not in sys.modules
            assert 'app_instance' not in sys.modules
            # Reuse the schema-only assembly stubs in this child process only.
            spec = importlib.util.spec_from_file_location('schema_only', {str(ROOT / 'scripts/export-openapi.py')!r})
            schema = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(schema)
            from fastapi import FastAPI
            schema.install_schema_stubs(FastAPI())
            singleton = get_ai_v1_router()
            assert singleton is importlib.import_module('src.modules.ai.router').router
            assert get_ai_v1_router() is singleton
            assembled = importlib.import_module('src.routers.ai')
            def entries(router):
                result = []
                for route in router.routes:
                    contexts = route.effective_route_contexts() if hasattr(route, 'effective_route_contexts') else [route]
                    for context in contexts:
                        result.extend((method, context.path) for method in sorted(context.methods))
                return result
            assert entries(assembled.ai_router) == entries(assembled.legacy_ai_router) + entries(singleton)
            assert entries(assembled.legacy_ai_router) and entries(singleton)
            print(json.dumps({{'lazy': True, 'singleton': True, 'route_order': True}}))
        ''')
        self.assertEqual(observed, {'lazy': True, 'singleton': True, 'route_order': True})

    def test_fresh_schema_only_composition_preserves_the_complete_openapi_document(self):
        observed = self.fresh(f'''
            import importlib.util, json
            from pathlib import Path
            spec = importlib.util.spec_from_file_location('schema_only', {str(ROOT / 'scripts/export-openapi.py')!r})
            schema = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(schema)
            # The committed document is Prettier-formatted; compare the entire
            # JSON document, leaving exact emitted-byte checks to the generator.
            actual = schema.build_schema_app().openapi()
            expected = json.loads(Path({str(ROOT / 'packages/contracts/openapi.json')!r}).read_bytes())
            assert actual == expected
            print(json.dumps({{'openapi_document_unchanged': True}}))
        ''')
        self.assertEqual(observed, {'openapi_document_unchanged': True})


if __name__ == '__main__':
    unittest.main()
