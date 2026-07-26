import asyncio
import sys
import unittest
from pathlib import Path


API_ROOT = Path(__file__).resolve().parents[1]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))


class InMemoryRepositoryTests(unittest.IsolatedAsyncioTestCase):
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


if __name__ == "__main__":
    unittest.main()
