"""Exercise migrated adapters through HTTP with isolated storage and fault sinks."""

import importlib
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, Mock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient


API_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(API_ROOT))
PNG = b'\x89PNG\r\n\x1a\n' + b'synthetic-image-content'


class AdapterHttpBoundaryTests(unittest.TestCase):
    def setUp(self):
        self.auth = importlib.import_module('src.routers.auth.auth')
        self.admin = importlib.import_module('src.routers.admin.admin')
        self.files = importlib.import_module('src.routers.file.file')
        self.state = importlib.import_module('app_instance').app
        self.application = FastAPI()
        self.application.include_router(self.admin.router)
        self.application.include_router(self.files.router)
        self.application.dependency_overrides[self.auth.get_current_user] = lambda: {
            'id': 1, 'status': 1, 'roles': [{'code': 'admin'}],
        }
        # Only the observation sink is replaced; the real role guard still runs.
        sink = patch.object(self.auth.audit_log, 'record')
        sink.start()
        self.addCleanup(sink.stop)
        self.client = TestClient(self.application, raise_server_exceptions=False)
        self.addCleanup(self.client.close)

    def test_anonymous_and_non_admin_are_denied_before_service_or_storage(self):
        def unexpected_service():
            raise AssertionError('Protected service must not be resolved')

        self.application.dependency_overrides[self.admin.get_admin_ai_service] = unexpected_service
        auth_store = Mock(side_effect=AssertionError('Anonymous request must not read token storage'))
        self.application.dependency_overrides[self.auth.get_auth_manager] = lambda: SimpleNamespace(
            get_user_from_token=auth_store,
        )
        del self.application.dependency_overrides[self.auth.get_current_user]
        storage = AsyncMock(side_effect=AssertionError('Unauthorized upload must not store bytes'))
        with (patch.object(self.files, 'store_image', storage),
              patch.object(self.admin, 'get_ai_run_metrics_snapshot', side_effect=AssertionError('Unauthorized read')) as metrics):
            for status in (401, 403):
                if status == 403:
                    self.application.dependency_overrides[self.auth.get_current_user] = lambda: {
                        'id': 2, 'status': 1, 'roles': [{'code': 'normal'}],
                    }
                self.assertEqual(self.client.get('/admin/ai/metrics').status_code, status)
                self.assertEqual(self.client.get('/admin/ai/providers').status_code, status)
                response = self.client.post('/file/image/upload', files={
                    'file': ('../../private-name.png', PNG, 'image/png'),
                })
                self.assertEqual(response.status_code, status)
            storage.assert_not_awaited()
            metrics.assert_not_called()
        auth_store.assert_not_called()

    def test_admin_upload_uses_real_storage_and_keeps_rejection_and_filename_rules(self):
        with tempfile.TemporaryDirectory(prefix='adapter-public-upload-') as directory:
            root = Path(directory)
            with patch.object(self.state, 'config', {'file': {'images_dir': directory}}, create=True):
                rejected = self.client.post('/file/image/upload', files={
                    'file': ('looks-valid.png', b'%PDF-1.7', 'image/png'),
                })
                self.assertEqual(rejected.status_code, 400)
                self.assertEqual(rejected.json()['detail']['code'], 'invalid_image')
                self.assertEqual(list(root.iterdir()), [])
                accepted = self.client.post('/file/image/upload', files={
                    'file': ('../../private-name.png', PNG, 'image/png'),
                })
                self.assertEqual(accepted.status_code, 200, accepted.text)
                filename = accepted.json()['data']['filename']
                self.assertRegex(filename, r'^[0-9a-f]{32}\.png$')
                self.assertNotIn('private-name', accepted.text)
                self.assertEqual((root / filename).read_bytes(), PNG)
                self.assertEqual(len(list(root.iterdir())), 1)

    def test_admin_reads_same_metrics_and_maps_public_typed_error_without_success_stub(self):
        metrics_module = importlib.import_module('src.modules.ai.run_metrics')
        public = importlib.import_module('src.modules.ai.public')
        collector = metrics_module.AiRunMetrics()
        collector.start()
        collector.finish('completed', 12.5)
        with patch.object(metrics_module, 'ai_run_metrics', collector):
            response = self.client.get('/admin/ai/metrics')
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()['data'], collector.snapshot().model_dump())
            public.AiRunMetricsSnapshot.model_validate(response.json()['data'])

        calls = []

        class UnavailableProvider:
            async def create_provider_catalog_entry(self, value):
                calls.append(value)
                raise public.AiDomainError('AI_PROVIDER_NOT_FOUND', 'Synthetic provider unavailable', status_code=404)

        service = UnavailableProvider()
        self.application.dependency_overrides[self.admin.get_admin_ai_service] = lambda: service
        invalid = self.client.post('/admin/ai/providers', json={})
        self.assertEqual(invalid.status_code, 422)
        self.assertEqual(calls, [])
        response = self.client.post('/admin/ai/providers', json={
            'id': 'synthetic-provider', 'name': 'Synthetic provider',
            'default_base_url': 'https://fixture.example.test/v1',
            'default_model': 'synthetic-only', 'auth_mode': 'none',
            'is_enabled': True, 'is_default': False, 'sort_order': 10,
        })
        self.assertEqual(response.status_code, 404, response.text)
        self.assertEqual(response.json()['detail']['code'], 'AI_PROVIDER_NOT_FOUND')
        self.assertEqual(len(calls), 1)
        self.assertIs(type(calls[0]), public.AiProviderCatalogInput)


if __name__ == '__main__':
    unittest.main()
