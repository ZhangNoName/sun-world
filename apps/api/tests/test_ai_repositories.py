import asyncio
import importlib.util
import os
import sys
import threading
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest.mock import patch


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

    async def test_keyless_catalog_has_one_explicit_default(self):
        from src.modules.ai.repositories import InMemoryAiRepository
        from src.modules.ai.schemas import AiProviderCatalogInput

        repository = InMemoryAiRepository()
        with patch.dict(
            os.environ,
            {
                "AI_PROVIDER_ALLOWED_INSECURE_ORIGINS": (
                    "http://211.141.18.165:6195"
                )
            },
        ):
            await repository.create_provider_catalog_entry(
                AiProviderCatalogInput(
                    id="qwen-public",
                    name="Qwen Public",
                    default_base_url="http://211.141.18.165:6195/v1",
                    default_model="qwen38_27b",
                    auth_mode="none",
                    is_default=True,
                )
            )
        await repository.create_provider_catalog_entry(
            AiProviderCatalogInput(
                id="second-public",
                name="Second Public",
                default_base_url="https://models.example.test/v1",
                default_model="second-chat",
                auth_mode="none",
                is_default=True,
            )
        )

        catalog = await repository.list_provider_catalog()
        self.assertEqual(
            [item.id for item in catalog if item.is_default],
            ["second-public"],
        )
        default, encrypted_key = await repository.get_default_provider_record()
        self.assertEqual(default.id, "second-public")
        self.assertIsNone(encrypted_key)
        self.assertFalse(default.has_api_key)
        self.assertFalse(hasattr(default, "api_key"))

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
            "ai_personas",
            "ai_provider_catalog",
            "ai_provider_profiles",
            "ai_skills",
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
        self.assertIn("auth_mode", catalog_sql)
        self.assertIn("is_default", catalog_sql)

    def test_missing_provider_catalog_table_is_not_presented_as_empty(self):
        import pymysql
        from src.modules.ai.repositories import MySqlAiRepository

        class MissingCatalogDb:
            def fetch_all(self, *_args, **_kwargs):
                raise pymysql.err.OperationalError(1146, "table does not exist")

        with self.assertRaises(pymysql.err.OperationalError):
            import asyncio

            asyncio.run(MySqlAiRepository(MissingCatalogDb()).list_provider_catalog())


class MySqlAiRepositoryTransactionTests(unittest.TestCase):
    def test_system_default_switch_locks_catalog_before_clearing_previous_default(self):
        from src.modules.ai.repositories import MySqlAiRepository
        from src.modules.ai.schemas import AiProviderCatalogInput

        class RecordingUnitOfWork:
            def __init__(self):
                self.calls = []
                self.committed = False

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def fetch_all(self, statement, parameters=None):
                self.calls.append(("fetch_all", statement, parameters))
                return [{"id": "old-default"}, {"id": "new-default"}]

            def fetch_one(self, statement, parameters=None):
                self.calls.append(("fetch_one", statement, parameters))
                return {"id": "new-default", "is_default": False}

            def execute(self, statement, parameters=None):
                self.calls.append(("execute", statement, parameters))
                return 1

            def commit(self):
                self.calls.append(("commit", "COMMIT", None))
                self.committed = True

        class RecordingDb:
            def __init__(self):
                self.uow = RecordingUnitOfWork()

            def unit_of_work(self):
                return self.uow

            def fetch_one(self, _statement, _parameters=None):
                return {
                    "id": "new-default",
                    "name": "New Default",
                    "default_base_url": "https://models.example.test/v1",
                    "default_model": "new-chat",
                    "auth_mode": "none",
                    "is_enabled": True,
                    "is_default": True,
                    "sort_order": 0,
                    "has_api_key": False,
                    "api_key_hint": None,
                }

        database = RecordingDb()
        updated = asyncio.run(
            MySqlAiRepository(database).update_provider_catalog_entry(
                "new-default",
                AiProviderCatalogInput(
                    id="new-default",
                    name="New Default",
                    default_base_url="https://models.example.test/v1",
                    default_model="new-chat",
                    auth_mode="none",
                    is_default=True,
                ),
            )
        )

        statements = [call[1] for call in database.uow.calls]
        self.assertIn("FOR UPDATE", statements[0])
        self.assertIn("SET is_default = 0", statements[2])
        self.assertIn("is_default = %s", statements[3])
        self.assertEqual(statements[4], "COMMIT")
        self.assertTrue(database.uow.committed)
        self.assertTrue(updated.is_default)

    def test_locked_default_cannot_be_unset_or_deleted_by_a_stale_request(self):
        from src.modules.ai.errors import AiDomainError
        from src.modules.ai.repositories import MySqlAiRepository
        from src.modules.ai.schemas import AiProviderCatalogInput

        class LockedDefaultUnitOfWork:
            def __init__(self):
                self.calls = []
                self.committed = False

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def fetch_all(self, statement, parameters=None):
                self.calls.append(("fetch_all", statement, parameters))
                return [{"id": "current-default"}]

            def fetch_one(self, statement, parameters=None):
                self.calls.append(("fetch_one", statement, parameters))
                return {"id": "current-default", "is_default": True}

            def execute(self, statement, parameters=None):
                self.calls.append(("execute", statement, parameters))
                return 1

            def commit(self):
                self.committed = True

        class LockedDefaultDb:
            def __init__(self):
                self.uow = LockedDefaultUnitOfWork()

            def unit_of_work(self):
                return self.uow

        value = AiProviderCatalogInput(
            id="current-default",
            name="Current Default",
            default_base_url="https://models.example.test/v1",
            default_model="chat-model",
            auth_mode="none",
        )

        update_db = LockedDefaultDb()
        with self.assertRaises(AiDomainError) as update_error:
            asyncio.run(
                MySqlAiRepository(update_db).update_provider_catalog_entry(
                    value.id,
                    value,
                )
            )
        self.assertEqual(update_error.exception.code, "AI_PROVIDER_DEFAULT_REQUIRED")
        self.assertIn("FOR UPDATE", update_db.uow.calls[0][1])
        self.assertFalse(update_db.uow.committed)
        self.assertFalse(
            any(call[0] == "execute" for call in update_db.uow.calls)
        )

        delete_db = LockedDefaultDb()
        with self.assertRaises(AiDomainError) as delete_error:
            asyncio.run(
                MySqlAiRepository(delete_db).delete_provider_catalog_entry(
                    value.id
                )
            )
        self.assertEqual(delete_error.exception.code, "AI_PROVIDER_DEFAULT_REQUIRED")
        self.assertIn("FOR UPDATE", delete_db.uow.calls[0][1])
        self.assertFalse(delete_db.uow.committed)
        self.assertFalse(
            any(call[0] == "execute" for call in delete_db.uow.calls)
        )

    def test_default_provider_replacement_is_one_owner_locked_transaction(self):
        from src.modules.ai.repositories import MySqlAiRepository
        from src.modules.ai.schemas import AiProviderProfileInput

        class RecordingUnitOfWork:
            def __init__(self):
                self.calls = []
                self.committed = False
                self.rolled_back = False

            def __enter__(self):
                return self

            def __exit__(self, exc_type, *_args):
                self.rolled_back = exc_type is not None or not self.committed
                return False

            def fetch_one(self, statement, parameters=None):
                self.calls.append(("fetch_one", statement, parameters))
                if "FROM users" in statement:
                    return {"id": 7}
                if "FROM ai_provider_profiles" in statement:
                    return {"id": "profile-1"}
                raise AssertionError(statement)

            def execute(self, statement, parameters=None):
                self.calls.append(("execute", statement, parameters))
                return 1

            def commit(self):
                self.calls.append(("commit", None, None))
                self.committed = True

        class RecordingDb:
            def __init__(self):
                self.uow = RecordingUnitOfWork()

            def unit_of_work(self):
                return self.uow

            def fetch_all(self, _statement, _parameters=None):
                return [
                    {
                        "id": "profile-1",
                        "provider": "openai",
                        "name": "Primary",
                        "base_url": "https://models.example.test/v1",
                        "model": "mini",
                        "is_default": True,
                        "has_api_key": True,
                        "api_key_hint": "...1234",
                    }
                ]

        database = RecordingDb()
        profile = asyncio.run(
            MySqlAiRepository(database).save_provider_profile(
                7,
                AiProviderProfileInput(
                    id="profile-1",
                    provider="openai",
                    name="Primary",
                    base_url="https://models.example.test/v1",
                    model="mini",
                    is_default=True,
                ),
                "ciphertext",
                "...1234",
            )
        )

        statements = [call[1] or "COMMIT" for call in database.uow.calls]
        self.assertIn("FROM users", statements[0])
        self.assertIn("FOR UPDATE", statements[0])
        self.assertIn("FROM ai_provider_profiles", statements[1])
        self.assertIn("SET is_default = 0", statements[2])
        self.assertIn("INSERT INTO ai_provider_profiles", statements[3])
        self.assertEqual(statements[4], "COMMIT")
        self.assertEqual(profile.id, "profile-1")
        self.assertTrue(database.uow.committed)
        self.assertFalse(database.uow.rolled_back)

    def test_append_message_locks_allocates_and_writes_in_one_unit_of_work(self):
        from src.modules.ai.repositories import MySqlAiRepository
        from src.modules.ai.schemas import AiTextBlock

        class RecordingUnitOfWork:
            def __init__(self):
                self.calls = []
                self.committed = False
                self.rolled_back = False

            def __enter__(self):
                return self

            def __exit__(self, exc_type, *_args):
                if exc_type is not None or not self.committed:
                    self.rolled_back = True
                return False

            def fetch_one(self, statement, parameters=None):
                self.calls.append(("fetch_one", statement, parameters))
                if "FOR UPDATE" in statement:
                    return {"id": "conv-1"}
                return {"sequence": 4}

            def execute(self, statement, parameters=None):
                self.calls.append(("execute", statement, parameters))
                return 1

            def commit(self):
                self.calls.append(("commit", None, None))
                self.committed = True

        class RecordingDb:
            def __init__(self):
                self.uow = RecordingUnitOfWork()

            def unit_of_work(self):
                return self.uow

        database = RecordingDb()
        message = asyncio.run(
            MySqlAiRepository(database).append_message(
                7,
                "conv-1",
                "user",
                [AiTextBlock(text="hello")],
            )
        )

        statements = [call[1] or "COMMIT" for call in database.uow.calls]
        self.assertIn("FOR UPDATE", statements[0])
        self.assertIn("MAX(sequence)", statements[1])
        self.assertIn("INSERT INTO ai_messages", statements[2])
        self.assertIn("UPDATE ai_conversations", statements[3])
        self.assertEqual(statements[4], "COMMIT")
        self.assertEqual(message.sequence, 5)
        self.assertTrue(database.uow.committed)
        self.assertFalse(database.uow.rolled_back)

    def test_concurrent_appends_receive_unique_sequences_after_row_lock(self):
        from src.modules.ai.repositories import MySqlAiRepository
        from src.modules.ai.schemas import AiTextBlock

        class ConcurrentDb:
            def __init__(self):
                self.row_lock = threading.Lock()
                self.messages = []

            def unit_of_work(self):
                database = self

                class UnitOfWork:
                    def __init__(self):
                        self.staged = []
                        self.locked = False
                        self.committed = False

                    def __enter__(self):
                        return self

                    def __exit__(self, *_args):
                        if self.locked:
                            database.row_lock.release()
                        return False

                    def fetch_one(self, statement, _parameters=None):
                        if "FOR UPDATE" in statement:
                            database.row_lock.acquire()
                            self.locked = True
                            return {"id": "conv-1"}
                        if "MAX(sequence)" in statement:
                            sequences = [row[4] for row in database.messages]
                            return {"sequence": max(sequences, default=0)}
                        raise AssertionError(statement)

                    def execute(self, statement, parameters=None):
                        if "INSERT INTO ai_messages" in statement:
                            self.staged.append(parameters)
                        elif "UPDATE ai_conversations" not in statement:
                            raise AssertionError(statement)
                        return 1

                    def commit(self):
                        database.messages.extend(self.staged)
                        self.committed = True

                return UnitOfWork()

        database = ConcurrentDb()
        repository = MySqlAiRepository(database)

        def append(text):
            return asyncio.run(
                repository.append_message(
                    7,
                    "conv-1",
                    "user",
                    [AiTextBlock(text=text)],
                )
            )

        with ThreadPoolExecutor(max_workers=2) as executor:
            messages = list(executor.map(append, ["first", "second"]))

        self.assertEqual(sorted(message.sequence for message in messages), [1, 2])
        self.assertEqual(sorted(row[4] for row in database.messages), [1, 2])

    def test_append_failure_rolls_back_without_touching_conversation(self):
        from src.modules.ai.repositories import MySqlAiRepository
        from src.modules.ai.schemas import AiTextBlock

        class FailingUnitOfWork:
            def __init__(self):
                self.committed = False
                self.rolled_back = False
                self.touched = False

            def __enter__(self):
                return self

            def __exit__(self, exc_type, *_args):
                self.rolled_back = exc_type is not None or not self.committed
                return False

            def fetch_one(self, statement, _parameters=None):
                return {"id": "conv-1"} if "FOR UPDATE" in statement else {"sequence": 0}

            def execute(self, statement, _parameters=None):
                if "INSERT INTO ai_messages" in statement:
                    raise RuntimeError("insert failed")
                if "UPDATE ai_conversations" in statement:
                    self.touched = True
                return 1

            def commit(self):
                self.committed = True

        class FailingDb:
            def __init__(self):
                self.uow = FailingUnitOfWork()

            def unit_of_work(self):
                return self.uow

        database = FailingDb()
        with self.assertRaises(RuntimeError):
            asyncio.run(
                MySqlAiRepository(database).append_message(
                    7,
                    "conv-1",
                    "assistant",
                    [AiTextBlock(text="partial")],
                )
            )

        self.assertTrue(database.uow.rolled_back)
        self.assertFalse(database.uow.committed)
        self.assertFalse(database.uow.touched)

    def test_edit_locks_conversation_then_truncates_updates_and_touches_atomically(self):
        from datetime import datetime, timezone

        from src.modules.ai.repositories import MySqlAiRepository

        class RecordingUnitOfWork:
            def __init__(self):
                self.calls = []
                self.committed = False
                self.rolled_back = False

            def __enter__(self):
                return self

            def __exit__(self, exc_type, *_args):
                self.rolled_back = exc_type is not None or not self.committed
                return False

            def fetch_one(self, statement, parameters=None):
                self.calls.append(("fetch_one", statement, parameters))
                if "FROM ai_conversations" in statement:
                    return {"id": "conv-1"}
                return {
                    "id": "msg-1",
                    "conversation_id": "conv-1",
                    "role": "user",
                    "sequence": 2,
                    "status": "completed",
                    "created_at": datetime.now(timezone.utc),
                }

            def execute(self, statement, parameters=None):
                self.calls.append(("execute", statement, parameters))
                return 1

            def commit(self):
                self.calls.append(("commit", None, None))
                self.committed = True

        class RecordingDb:
            def __init__(self):
                self.uow = RecordingUnitOfWork()

            def fetch_one(self, _statement, _parameters=None):
                return {"conversation_id": "conv-1"}

            def unit_of_work(self):
                return self.uow

        database = RecordingDb()
        message = asyncio.run(
            MySqlAiRepository(database).edit_message(7, "msg-1", "edited")
        )

        statements = [call[1] or "COMMIT" for call in database.uow.calls]
        self.assertIn("ai_conversations", statements[0])
        self.assertIn("FOR UPDATE", statements[0])
        self.assertIn("ai_messages", statements[1])
        self.assertIn("FOR UPDATE", statements[1])
        self.assertIn("DELETE f FROM ai_message_feedback", statements[2])
        self.assertIn("DELETE FROM ai_messages", statements[3])
        self.assertIn("UPDATE ai_messages", statements[4])
        self.assertIn("UPDATE ai_conversations", statements[5])
        self.assertEqual(statements[6], "COMMIT")
        self.assertEqual(message.conversation_id, "conv-1")
        self.assertEqual(message.blocks[0].text, "edited")
        self.assertFalse(database.uow.rolled_back)

    def test_edit_update_failure_rolls_back_truncation_and_touch(self):
        from datetime import datetime, timezone

        from src.modules.ai.repositories import MySqlAiRepository

        class FailingUnitOfWork:
            def __init__(self):
                self.committed = False
                self.rolled_back = False
                self.touched = False

            def __enter__(self):
                return self

            def __exit__(self, exc_type, *_args):
                self.rolled_back = exc_type is not None or not self.committed
                return False

            def fetch_one(self, statement, _parameters=None):
                if "FROM ai_conversations" in statement:
                    return {"id": "conv-1"}
                return {
                    "id": "msg-1",
                    "conversation_id": "conv-1",
                    "role": "user",
                    "sequence": 1,
                    "status": "completed",
                    "created_at": datetime.now(timezone.utc),
                }

            def execute(self, statement, _parameters=None):
                if "UPDATE ai_messages" in statement:
                    raise RuntimeError("update failed")
                if "UPDATE ai_conversations" in statement:
                    self.touched = True
                return 1

            def commit(self):
                self.committed = True

        class FailingDb:
            def __init__(self):
                self.uow = FailingUnitOfWork()

            def fetch_one(self, _statement, _parameters=None):
                return {"conversation_id": "conv-1"}

            def unit_of_work(self):
                return self.uow

        database = FailingDb()
        with self.assertRaises(RuntimeError):
            asyncio.run(
                MySqlAiRepository(database).edit_message(7, "msg-1", "edited")
            )

        self.assertTrue(database.uow.rolled_back)
        self.assertFalse(database.uow.committed)
        self.assertFalse(database.uow.touched)


class MySqlAiRepositoryOffloadTests(unittest.IsolatedAsyncioTestCase):
    async def test_ai_and_mcp_reads_execute_off_the_event_loop_thread(self):
        from src.modules.ai.mcp_repository import MySqlAiMcpRepository
        from src.modules.ai.repositories import MySqlAiRepository

        class RecordingDb:
            def __init__(self):
                self.thread_ids = []

            def fetch_all(self, *_args, **_kwargs):
                self.thread_ids.append(threading.get_ident())
                return []

        event_loop_thread = threading.get_ident()
        ai_database = RecordingDb()
        mcp_database = RecordingDb()

        self.assertEqual(
            await MySqlAiRepository(ai_database).list_conversations(7),
            [],
        )
        self.assertEqual(
            await MySqlAiMcpRepository(mcp_database).list_connections(7),
            [],
        )

        self.assertNotEqual(ai_database.thread_ids, [event_loop_thread])
        self.assertNotEqual(mcp_database.thread_ids, [event_loop_thread])
        self.assertTrue(all(value != event_loop_thread for value in ai_database.thread_ids))
        self.assertTrue(all(value != event_loop_thread for value in mcp_database.thread_ids))

    async def test_ai_transaction_stays_on_one_worker_thread(self):
        from src.modules.ai.repositories import MySqlAiRepository
        from src.modules.ai.schemas import AiTextBlock

        class RecordingUnitOfWork:
            def __init__(self):
                self.thread_ids = []

            def _record(self):
                self.thread_ids.append(threading.get_ident())

            def __enter__(self):
                self._record()
                return self

            def __exit__(self, *_args):
                self._record()
                return False

            def fetch_one(self, statement, _parameters=None):
                self._record()
                return {"id": "conv-1"} if "FOR UPDATE" in statement else {"sequence": 0}

            def execute(self, _statement, _parameters=None):
                self._record()
                return 1

            def commit(self):
                self._record()

        class RecordingDb:
            def __init__(self):
                self.uow = RecordingUnitOfWork()

            def unit_of_work(self):
                return self.uow

        event_loop_thread = threading.get_ident()
        database = RecordingDb()
        await MySqlAiRepository(database).append_message(
            7,
            "conv-1",
            "user",
            [AiTextBlock(text="hello")],
        )

        self.assertEqual(len(set(database.uow.thread_ids)), 1)
        self.assertNotEqual(database.uow.thread_ids[0], event_loop_thread)

    async def test_mcp_audit_transaction_stays_on_one_worker_thread(self):
        from src.modules.ai.mcp_repository import MySqlAiMcpRepository

        class RecordingUnitOfWork:
            def __init__(self):
                self.thread_ids = []

            def _record(self):
                self.thread_ids.append(threading.get_ident())

            def __enter__(self):
                self._record()
                return self

            def __exit__(self, *_args):
                self._record()
                return False

            def fetch_one(self, statement, _parameters=None):
                self._record()
                if "FROM ai_mcp_connections" in statement:
                    return {"enabled": 1, "revision": 3, "catalog_revision": 3}
                return {"name": "search"}

            def execute(self, _statement, _parameters=None):
                self._record()
                return 1

            def commit(self):
                self._record()

        class RecordingDb:
            def __init__(self):
                self.uow = RecordingUnitOfWork()

            def unit_of_work(self):
                return self.uow

        event_loop_thread = threading.get_ident()
        database = RecordingDb()
        await MySqlAiMcpRepository(database).begin_call(
            call_id="call-1",
            user_id=7,
            connection_id="mcp-1",
            tool_name="search",
            argument_keys=["query"],
            connection_revision=3,
        )

        self.assertEqual(len(set(database.uow.thread_ids)), 1)
        self.assertNotEqual(database.uow.thread_ids[0], event_loop_thread)

    def test_every_mysql_repository_public_async_entry_offloads_to_thread(self):
        import ast
        import inspect
        import textwrap

        from src.modules.ai.mcp_repository import MySqlAiMcpRepository
        from src.modules.ai.repositories import MySqlAiRepository

        for repository_type in (MySqlAiRepository, MySqlAiMcpRepository):
            tree = ast.parse(textwrap.dedent(inspect.getsource(repository_type)))
            class_node = next(
                node for node in tree.body if isinstance(node, ast.ClassDef)
            )
            public_async_methods = [
                node
                for node in class_node.body
                if isinstance(node, ast.AsyncFunctionDef)
                and not node.name.startswith("_")
            ]
            self.assertTrue(public_async_methods)
            for method in public_async_methods:
                uses_to_thread = any(
                    isinstance(node, ast.Call)
                    and isinstance(node.func, ast.Attribute)
                    and isinstance(node.func.value, ast.Name)
                    and node.func.value.id == "asyncio"
                    and node.func.attr == "to_thread"
                    for node in ast.walk(method)
                )
                self.assertTrue(
                    uses_to_thread,
                    f"{repository_type.__name__}.{method.name} must offload DB work",
                )


class AiProviderSeedTests(unittest.TestCase):
    def test_seed_defaults_qwen_only_when_enabled_default_is_absent(self):
        script_path = API_ROOT.parent.parent / "scripts" / "seed-ai-default-provider.py"
        spec = importlib.util.spec_from_file_location("seed_ai_default_provider", script_path)
        self.assertIsNotNone(spec)
        self.assertIsNotNone(spec.loader)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)

        class FakeCursor:
            def __init__(self, current_default):
                self.calls = []
                self.current_default = current_default

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def execute(self, statement, parameters=None):
                self.calls.append((statement, parameters))

            def fetchall(self):
                return []

            def fetchone(self):
                return self.current_default

        class FakeConnection:
            def __init__(self, current_default):
                self.cursor_instance = FakeCursor(current_default)

            def cursor(self):
                return self.cursor_instance

        scenarios = (
            ("empty catalog", None, True),
            ("administrator default", {"id": "admin-selected"}, False),
        )
        for label, current_default, expected_default in scenarios:
            with self.subTest(label=label):
                connection = FakeConnection(current_default)
                selected_as_default = module.apply_seed(connection)

                calls = connection.cursor_instance.calls
                self.assertIn("FOR UPDATE", calls[0][0])
                self.assertIn("is_enabled = 1 AND is_default = 1", calls[1][0])
                insert_index = 3 if expected_default else 2
                self.assertEqual(len(calls), insert_index + 1)
                if expected_default:
                    self.assertIn(
                        "UPDATE ai_provider_catalog SET is_default = 0",
                        calls[2][0],
                    )
                else:
                    self.assertNotIn("SET is_default = 0", repr(calls))
                insert_sql, insert_parameters = calls[insert_index]
                self.assertIn("INSERT INTO ai_provider_catalog", insert_sql)
                self.assertIn("ON DUPLICATE KEY UPDATE", insert_sql)
                self.assertIn(
                    "is_default = VALUES(is_default)",
                    insert_sql,
                )
                self.assertNotIn("is_default = 1,", insert_sql)
                self.assertNotIn("DELETE FROM", repr(calls))
                self.assertEqual(insert_parameters[0], "qwen-public")
                self.assertEqual(
                    insert_parameters[2],
                    "http://211.141.18.165:6195/v1",
                )
                self.assertEqual(insert_parameters[3], "qwen38_27b")
                self.assertIs(insert_parameters[4], expected_default)
                self.assertIs(selected_as_default, expected_default)

    def test_full_schema_deploy_seeds_qwen_before_api_cutover(self):
        workflow = (
            API_ROOT.parent.parent / ".github" / "workflows" / "deploy.yml"
        ).read_text(encoding="utf-8")

        migration = workflow.index(
            "python -m src.database.mysql.schema_migration --mode apply"
        )
        seed = workflow.index(
            "python -m src.database.mysql.default_ai_provider_seed --apply"
        )
        candidate = workflow.index(
            "sudo docker run -d --name sun-world-api-candidate",
            migration,
        )

        self.assertLess(migration, seed)
        self.assertLess(seed, candidate)
        self.assertIn(
            "-e AI_PROVIDER_ALLOWED_HOSTS="
            "api.deepseek.com,openrouter.ai,api.openai.com",
            workflow,
        )
        self.assertNotIn(
            "AI_PROVIDER_ALLOWED_HOSTS="
            "api.deepseek.com,openrouter.ai,api.openai.com,211.141.18.165",
            workflow,
        )
        self.assertIn(
            "-e AI_PROVIDER_ALLOWED_INSECURE_ORIGINS="
            "http://211.141.18.165:6195",
            workflow,
        )


if __name__ == "__main__":
    unittest.main()
