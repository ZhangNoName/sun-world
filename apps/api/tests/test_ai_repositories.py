import asyncio
import importlib.util
import sys
import threading
import unittest
from concurrent.futures import ThreadPoolExecutor
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
