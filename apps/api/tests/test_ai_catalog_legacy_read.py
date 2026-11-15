import asyncio
import sys
import unittest
from pathlib import Path
from unittest.mock import Mock

import pymysql

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from src.modules.ai.repositories import MySqlAiRepository


def catalog():
    return dict(id='legacy-provider', name='Legacy', default_base_url='https://models.example.test/v1',
                default_model='legacy', is_default=True, is_enabled=True, sort_order=0,
                has_api_key=True, api_key_hint=None, api_key_ciphertext='synthetic-ciphertext')


class LegacyCatalogReadTests(unittest.TestCase):
    def test_old_catalog_keeps_bearer_credentials_and_does_not_mutate_schema(self):
        db = Mock()
        db.fetch_one.side_effect = [pymysql.err.OperationalError(1054, "Unknown column 'auth_mode'"), {**catalog(), 'auth_mode':'bearer'}]
        db.fetch_all.return_value = [{'Field':'is_default'}]
        model, ciphertext = asyncio.run(MySqlAiRepository(db).get_default_provider_record())
        self.assertEqual(model.auth_mode, 'bearer')
        self.assertEqual(ciphertext, 'synthetic-ciphertext')
        self.assertIn("'bearer' AS auth_mode", db.fetch_one.call_args.args[0])
        db.execute.assert_not_called()

    def test_missing_table_and_other_columns_never_trigger_fallback(self):
        for error in [pymysql.err.OperationalError(1146, 'missing table'), pymysql.err.OperationalError(1054, "Unknown column 'sort_order'")]:
            db = Mock()
            db.fetch_one.side_effect = error
            with self.assertRaises(pymysql.err.OperationalError):
                asyncio.run(MySqlAiRepository(db).get_default_provider_record())
            self.assertEqual(db.fetch_one.call_count, 1)

    def test_single_legacy_enabled_provider_is_the_only_possible_default(self):
        db = Mock()
        db.fetch_one.side_effect = pymysql.err.OperationalError(1054, "Unknown column 'is_default'")
        db.fetch_all.side_effect = [[{'Field':'auth_mode'}], [{**catalog(), 'auth_mode':'bearer'}]]
        model, _ = asyncio.run(MySqlAiRepository(db).get_default_provider_record())
        self.assertTrue(model.is_default)
        db.execute.assert_not_called()

    def test_multiple_legacy_providers_are_not_silently_defaulted(self):
        from src.modules.ai.errors import AiDomainError
        db = Mock()
        db.fetch_one.side_effect = pymysql.err.OperationalError(1054, "Unknown column 'is_default'")
        db.fetch_all.side_effect = [[{'Field':'auth_mode'}], [catalog(), catalog()]]
        with self.assertRaises(AiDomainError):
            asyncio.run(MySqlAiRepository(db).get_default_provider_record())


class LocalModelOverrideTests(unittest.IsolatedAsyncioTestCase):
    async def test_local_override_is_explicit_keyless_and_does_not_read_catalog(self):
        from unittest.mock import patch, AsyncMock
        from src.modules.ai.public import create_blog_qa_proxy
        service = Mock(resolve_agent_model=AsyncMock())
        with patch.dict('os.environ', {'BLOG_RUNTIME_ENV': 'local'}):
            proxy = await create_blog_qa_proxy(service, local_model='qwen-public')
        self.assertEqual(proxy.config.auth_mode, 'none')
        self.assertIsNone(proxy.config.api_key)
        service.resolve_agent_model.assert_not_awaited()

    async def test_production_and_unapproved_override_are_rejected(self):
        from unittest.mock import patch
        from src.modules.ai.public import create_blog_qa_proxy
        with patch.dict('os.environ', {'BLOG_RUNTIME_ENV': 'production'}):
            with self.assertRaises(ValueError):
                await create_blog_qa_proxy(Mock(), local_model='qwen-public')
        with patch.dict('os.environ', {'BLOG_RUNTIME_ENV': 'local'}):
            with self.assertRaises(ValueError):
                await create_blog_qa_proxy(Mock(), local_model='arbitrary')
