import asyncio
import importlib.util
import sys
import unittest
from pathlib import Path


API_ROOT = Path(__file__).resolve().parents[1]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))


class InMemoryRepositoryTests(unittest.IsolatedAsyncioTestCase):
    async def test_manages_a_global_provider_catalog_without_credentials(self):
        from src.modules.ai.repositories import InMemoryAiRepository
        from src.modules.ai.schemas import AiProviderCatalogInput

        repository = InMemoryAiRepository()
        created = await repository.create_provider_catalog_entry(
            AiProviderCatalogInput(
                id="custom-openai",
                name="Custom OpenAI",
                default_base_url="https://models.example.test/v1",
                default_model="custom-mini",
                is_enabled=True,
                sort_order=20,
            )
        )

        self.assertEqual(created.id, "custom-openai")
        self.assertEqual(created.default_model, "custom-mini")
        self.assertTrue(created.is_enabled)
        self.assertFalse(hasattr(created, "api_key"))

        updated = await repository.update_provider_catalog_entry(
            "custom-openai",
            AiProviderCatalogInput(
                id="custom-openai",
                name="Custom OpenAI v2",
                default_base_url="https://models.example.test/v2",
                default_model="custom-large",
                is_enabled=False,
                sort_order=10,
            ),
        )
        self.assertEqual(updated.name, "Custom OpenAI v2")
        self.assertEqual((await repository.list_provider_catalog())[0].sort_order, 10)

        await repository.delete_provider_catalog_entry("custom-openai")
        self.assertEqual(await repository.list_provider_catalog(), [])

    async def test_orders_conversations_and_enforces_ownership(self):
        from src.modules.ai.errors import AiDomainError
        from src.modules.ai.repositories import InMemoryAiRepository

        repository = InMemoryAiRepository()
        older = await repository.create_conversation(7, "Older")
        await asyncio.sleep(0)
        newer = await repository.create_conversation(7, "Newer")

        self.assertEqual(
            [item.id for item in await repository.list_conversations(7)],
            [newer.id, older.id],
        )
        with self.assertRaises(AiDomainError) as caught:
            await repository.get_conversation(8, older.id)
        self.assertEqual(caught.exception.code, "AI_RESOURCE_NOT_FOUND")

    async def test_sequences_messages_and_upserts_one_feedback_per_user(self):
        from src.modules.ai.repositories import InMemoryAiRepository
        from src.modules.ai.schemas import AiTextBlock

        repository = InMemoryAiRepository()
        conversation = await repository.create_conversation(7, "Chat")
        first = await repository.append_message(
            7, conversation.id, "user", [AiTextBlock(text="hello")]
        )
        second = await repository.append_message(
            7, conversation.id, "assistant", [AiTextBlock(text="world")]
        )
        await repository.set_feedback(7, second.id, "like")
        await repository.set_feedback(7, second.id, "dislike")

        detail = await repository.get_conversation(7, conversation.id)
        self.assertEqual([item.sequence for item in detail.messages], [1, 2])
        self.assertEqual(first.role, "user")
        self.assertEqual(await repository.get_feedback(7, second.id), "dislike")


class AiDatabaseSchemaTests(unittest.TestCase):
    def test_declares_persistent_workspace_tables_and_owner_indexes(self):
        from src.database.mysql.schema_migration import MYSQL_SCHEMA, build_create_table_sql

        expected = {
            "ai_provider_catalog",
            "ai_provider_profiles",
            "ai_conversations",
            "ai_messages",
            "ai_message_feedback",
        }

        self.assertTrue(expected.issubset(MYSQL_SCHEMA))
        for table in expected:
            sql = build_create_table_sql(table, MYSQL_SCHEMA[table])
            self.assertIn("CREATE TABLE IF NOT EXISTS", sql)
            self.assertIn("utf8mb4", sql)
        self.assertIn("user_id", build_create_table_sql("ai_conversations", MYSQL_SCHEMA["ai_conversations"]))
        catalog_sql = build_create_table_sql(
            "ai_provider_catalog", MYSQL_SCHEMA["ai_provider_catalog"]
        )
        self.assertIn("api_key_ciphertext", catalog_sql)
        self.assertIn("api_key_hint", catalog_sql)

    def test_missing_provider_catalog_table_is_not_presented_as_empty(self):
        import pymysql
        from src.modules.ai.repositories import MySqlAiRepository

        class MissingCatalogDb:
            def fetch_all(self, *_args, **_kwargs):
                raise pymysql.err.OperationalError(1146, "table does not exist")

        with self.assertRaises(pymysql.err.OperationalError):
            import asyncio

            asyncio.run(MySqlAiRepository(MissingCatalogDb()).list_provider_catalog())


class AiProviderSeedTests(unittest.TestCase):
    def test_seed_encrypts_the_key_after_clearing_provider_rows(self):
        from cryptography.fernet import Fernet

        script_path = API_ROOT.parent.parent / "scripts" / "seed-ai-default-provider.py"
        spec = importlib.util.spec_from_file_location("seed_ai_default_provider", script_path)
        self.assertIsNotNone(spec)
        self.assertIsNotNone(spec.loader)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)

        class FakeCursor:
            def __init__(self):
                self.calls = []

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def execute(self, statement, parameters=None):
                self.calls.append((statement, parameters))

        class FakeConnection:
            def __init__(self):
                self.cursor_instance = FakeCursor()

            def cursor(self):
                return self.cursor_instance

        connection = FakeConnection()
        encryption_key = Fernet.generate_key().decode("ascii")
        module.apply_seed(connection, "test-secret", encryption_key)

        calls = connection.cursor_instance.calls
        self.assertIn("DELETE FROM ai_provider_profiles", calls[0][0])
        self.assertIn("DELETE FROM ai_provider_catalog", calls[1][0])
        self.assertIn("INSERT INTO ai_provider_catalog", calls[2][0])
        self.assertNotIn("test-secret", repr(calls[2]))
        encrypted_key = calls[2][1][4]
        self.assertEqual(module.CredentialCipher(encryption_key).decrypt(encrypted_key), "test-secret")


if __name__ == "__main__":
    unittest.main()
