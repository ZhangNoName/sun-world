import sys
import unittest
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient


API_ROOT = Path(__file__).resolve().parents[1]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))


class DictionaryDomainTests(unittest.IsolatedAsyncioTestCase):
    async def test_enabled_items_are_filtered_and_stably_ordered(self):
        from src.modules.dictionaries.repository import InMemoryDictionaryRepository
        from src.modules.dictionaries.schemas import DictionaryItemInput, DictionaryTypeInput
        from src.modules.dictionaries.service import DictionaryService

        repository = InMemoryDictionaryRepository()
        service = DictionaryService(repository)
        dictionary = await service.create_type(
            DictionaryTypeInput(code="article-status", name="Article status")
        )
        await service.create_item(
            dictionary.id,
            DictionaryItemInput(value="published", label="Published", sort_order=20),
        )
        await service.create_item(
            dictionary.id,
            DictionaryItemInput(value="draft", label="Draft", sort_order=10),
        )
        disabled = await service.create_item(
            dictionary.id,
            DictionaryItemInput(value="deleted", label="Deleted", sort_order=1, is_enabled=False),
        )

        result = await service.get_enabled_items("article-status")

        self.assertEqual([item.value for item in result], ["draft", "published"])
        await service.update_item(
            dictionary.id,
            disabled.id,
            DictionaryItemInput(value="deleted", label="Deleted", sort_order=0, is_enabled=True),
        )
        result = await service.get_enabled_items("article-status")
        self.assertEqual([item.value for item in result], ["deleted", "draft", "published"])

    async def test_type_delete_is_rejected_until_items_are_removed(self):
        from src.modules.dictionaries.errors import DictionaryDomainError
        from src.modules.dictionaries.repository import InMemoryDictionaryRepository
        from src.modules.dictionaries.schemas import DictionaryItemInput, DictionaryTypeInput
        from src.modules.dictionaries.service import DictionaryService

        service = DictionaryService(InMemoryDictionaryRepository())
        dictionary = await service.create_type(DictionaryTypeInput(code="status", name="Status"))
        await service.create_item(dictionary.id, DictionaryItemInput(value="active", label="Active"))

        with self.assertRaises(DictionaryDomainError) as context:
            await service.delete_type(dictionary.id)

        self.assertEqual(context.exception.code, "DICTIONARY_TYPE_NOT_EMPTY")

    def test_schema_defines_dictionary_foreign_key_and_unique_index(self):
        from src.database.mysql.schema_migration import MYSQL_SCHEMA, build_create_table_sql

        self.assertIn("dictionary_types", MYSQL_SCHEMA)
        self.assertIn("dictionary_items", MYSQL_SCHEMA)
        sql = build_create_table_sql("dictionary_items", MYSQL_SCHEMA["dictionary_items"])
        self.assertIn("UNIQUE KEY `idx_dictionary_items_type_value`", sql)
        self.assertIn("FOREIGN KEY (`dictionary_type_id`) REFERENCES `dictionary_types` (`id`)", sql)


class DictionaryRouterTests(unittest.TestCase):
    def setUp(self):
        from src.modules.dictionaries.repository import InMemoryDictionaryRepository
        from src.modules.dictionaries.router import get_dictionary_service, router
        from src.modules.dictionaries.service import DictionaryService
        from src.routers.auth.auth import get_current_user

        app = FastAPI()
        app.include_router(router)
        self.service = DictionaryService(InMemoryDictionaryRepository())
        app.dependency_overrides[get_dictionary_service] = lambda: self.service
        app.dependency_overrides[get_current_user] = lambda: {
            "id": 1,
            "roles": [{"id": 1, "code": "admin"}],
        }
        self.client = TestClient(app)

    def test_admin_crud_and_public_enabled_read(self):
        created = self.client.post(
            "/admin/dictionaries/types",
            json={"code": "priority", "name": "Priority", "is_enabled": True},
        )
        self.assertEqual(created.status_code, 200)
        type_id = created.json()["data"]["id"]
        item = self.client.post(
            f"/admin/dictionaries/types/{type_id}/items",
            json={"value": "high", "label": "High", "sort_order": 2, "is_enabled": True},
        )
        self.assertEqual(item.status_code, 200, item.text)
        public = self.client.get("/dictionaries/priority")
        self.assertEqual(public.status_code, 200)
        self.assertEqual(public.json()["data"][0]["label"], "High")
        self.assertNotIn("extension_json", public.json()["data"][0])

    def test_non_admin_is_rejected_by_admin_dictionary_routes(self):
        from src.modules.dictionaries.router import get_dictionary_service
        from src.modules.dictionaries.repository import InMemoryDictionaryRepository
        from src.modules.dictionaries.service import DictionaryService
        from src.routers.auth.auth import get_current_user

        app = self.client.app
        app.dependency_overrides[get_dictionary_service] = lambda: DictionaryService(
            InMemoryDictionaryRepository()
        )
        app.dependency_overrides[get_current_user] = lambda: {
            "id": 2,
            "roles": [{"id": 2, "code": "normal"}],
        }
        response = self.client.get("/admin/dictionaries/types")
        self.assertEqual(response.status_code, 403)


if __name__ == "__main__":
    unittest.main()
