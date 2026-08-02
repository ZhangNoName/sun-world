import sys
import unittest
from pathlib import Path


API_ROOT = Path(__file__).resolve().parents[1]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))


class FakeProvider:
    async def stream(self, messages):
        self.messages = messages
        yield "hello "
        yield "world"


class FakeRegistry:
    def __init__(self):
        self.provider = FakeProvider()

    def resolve_default(self):
        from src.modules.ai.providers import ProviderConfig

        return ProviderConfig(
            provider="deepseek",
            model="deepseek-chat",
            base_url="https://api.deepseek.com/v1",
            api_key="secret",
        )

    def list_descriptors(self):
        from src.modules.ai.schemas import AiProviderDescriptor

        return [AiProviderDescriptor(id="deepseek", name="DeepSeek")]

    def create(self, _config):
        self.created_config = _config
        return self.provider


class BrokenProvider:
    async def stream(self, _messages):
        raise RuntimeError("upstream leaked secret")
        yield "unreachable"


class BrokenRegistry(FakeRegistry):
    def __init__(self):
        self.provider = BrokenProvider()


async def configured_service(repository, registry):
    from cryptography.fernet import Fernet

    from src.modules.ai.credentials import CredentialCipher
    from src.modules.ai.schemas import AiProviderCatalog
    from src.modules.ai.service import AiService

    cipher = CredentialCipher(Fernet.generate_key().decode("ascii"))
    catalog = AiProviderCatalog(
        id="deepseek",
        name="DeepSeek",
        default_base_url="https://api.deepseek.com",
        default_model="deepseek-chat",
        is_enabled=True,
    )
    encrypted_key = cipher.encrypt("test-global-key")

    async def get_default_provider_record():
        return catalog, encrypted_key

    repository.get_default_provider_record = get_default_provider_record
    return AiService(repository, registry, cipher)


class AiServiceTests(unittest.IsolatedAsyncioTestCase):
    async def test_uses_persisted_enabled_catalog_instead_of_builtin_descriptors(self):
        from src.modules.ai.repositories import InMemoryAiRepository
        from src.modules.ai.schemas import AiProviderCatalogInput
        from src.modules.ai.service import AiService

        repository = InMemoryAiRepository()
        await repository.create_provider_catalog_entry(
            AiProviderCatalogInput(
                id="team-provider",
                name="Team Provider",
                default_base_url="https://team.example.test/v1",
                default_model="team-chat",
                is_enabled=True,
                sort_order=5,
            )
        )
        await repository.create_provider_catalog_entry(
            AiProviderCatalogInput(
                id="disabled-provider",
                name="Disabled Provider",
                default_base_url="https://disabled.example.test/v1",
                default_model="disabled-chat",
                is_enabled=False,
                sort_order=1,
            )
        )

        descriptors = await AiService(repository, FakeRegistry()).list_providers()

        self.assertEqual([item.id for item in descriptors], ["team-provider"])
        self.assertEqual(descriptors[0].name, "Team Provider")

    async def test_returns_no_descriptors_when_catalog_is_empty(self):
        from src.modules.ai.repositories import InMemoryAiRepository
        from src.modules.ai.service import AiService

        descriptors = await AiService(InMemoryAiRepository(), FakeRegistry()).list_providers()

        self.assertEqual(descriptors, [])

    async def test_guest_run_uses_the_encrypted_global_provider_record(self):
        from cryptography.fernet import Fernet

        from src.modules.ai.credentials import CredentialCipher
        from src.modules.ai.repositories import InMemoryAiRepository
        from src.modules.ai.schemas import AiProviderCatalog, AiRunRequest
        from src.modules.ai.service import AiService

        cipher = CredentialCipher(Fernet.generate_key().decode("ascii"))
        repository = InMemoryAiRepository()
        catalog = AiProviderCatalog(
            id="deepseek",
            name="DeepSeek",
            default_base_url="https://api.deepseek.com",
            default_model="deepseek-chat",
            is_enabled=True,
        )

        async def get_default_provider_record():
            return catalog, cipher.encrypt("sk-global-secret")

        repository.get_default_provider_record = get_default_provider_record
        registry = FakeRegistry()
        service = AiService(repository, registry, cipher)

        _events = [
            event
            async for event in service.stream_run(
                user_id=None,
                request=AiRunRequest(message="Use global config"),
            )
        ]

        self.assertEqual(registry.created_config.provider, "deepseek")
        self.assertEqual(registry.created_config.api_key, "sk-global-secret")

    async def test_guest_stream_emits_monotonic_events_and_one_terminal_event(self):
        from src.modules.ai.repositories import InMemoryAiRepository
        from src.modules.ai.schemas import AiRunRequest
        from src.modules.ai.service import AiService

        service = await configured_service(InMemoryAiRepository(), FakeRegistry())

        events = [
            event
            async for event in service.stream_run(
                user_id=None,
                request=AiRunRequest(message="Say hello"),
            )
        ]

        self.assertEqual(
            [event.type for event in events],
            [
                "run.started",
                "content.delta",
                "content.delta",
                "message.completed",
            ],
        )
        self.assertEqual([event.sequence for event in events], [0, 1, 2, 3])
        self.assertEqual(events[-1].data["blocks"][0]["text"], "hello world")

    async def test_authenticated_stream_persists_user_and_assistant_messages(self):
        from src.modules.ai.repositories import InMemoryAiRepository
        from src.modules.ai.schemas import AiRunRequest
        from src.modules.ai.service import AiService

        repository = InMemoryAiRepository()
        service = await configured_service(repository, FakeRegistry())
        events = [
            event
            async for event in service.stream_run(
                user_id=7,
                request=AiRunRequest(message="Persist me"),
            )
        ]

        detail = await repository.get_conversation(7, events[0].conversation_id)
        self.assertEqual([message.role for message in detail.messages], ["user", "assistant"])

    async def test_authenticated_run_uses_the_saved_default_profile(self):
        from cryptography.fernet import Fernet

        from src.modules.ai.credentials import CredentialCipher
        from src.modules.ai.repositories import InMemoryAiRepository
        from src.modules.ai.schemas import AiProviderProfileInput, AiRunRequest
        from src.modules.ai.service import AiService

        cipher = CredentialCipher(Fernet.generate_key().decode("ascii"))
        repository = InMemoryAiRepository()
        registry = FakeRegistry()
        service = AiService(repository, registry, cipher)
        profile = await service.save_provider_profile(
            7,
            AiProviderProfileInput(
                provider="openrouter",
                name="My Router",
                base_url="https://openrouter.ai/api/v1",
                model="openai/gpt-4.1-mini",
                api_key="sk-user-private",
                is_default=True,
            ),
        )

        _events = [
            event
            async for event in service.stream_run(
                7,
                AiRunRequest(message="hello", provider_profile_id=profile.id),
            )
        ]

        self.assertEqual(registry.created_config.provider, "openrouter")
        self.assertEqual(registry.created_config.api_key, "sk-user-private")
        self.assertNotIn("sk-user-private", repr(registry.created_config))

    async def test_unexpected_provider_failure_is_sanitized_as_terminal_event(self):
        from src.modules.ai.repositories import InMemoryAiRepository
        from src.modules.ai.schemas import AiRunRequest
        from src.modules.ai.service import AiService

        service = await configured_service(InMemoryAiRepository(), BrokenRegistry())
        events = [
            event
            async for event in service.stream_run(
                user_id=None,
                request=AiRunRequest(message="fail safely"),
            )
        ]

        self.assertEqual([event.type for event in events], ["run.started", "run.failed"])
        self.assertEqual(events[-1].data["code"], "AI_PROVIDER_UNAVAILABLE")
        self.assertTrue(events[-1].data["retryable"])
        self.assertNotIn("secret", events[-1].data["message"])

    async def test_profile_without_personal_key_keeps_its_selected_model(self):
        from src.modules.ai.repositories import InMemoryAiRepository
        from src.modules.ai.schemas import AiProviderProfileInput, AiRunRequest
        from src.modules.ai.service import AiService

        repository = InMemoryAiRepository()
        registry = FakeRegistry()
        service = await configured_service(repository, registry)
        profile = await service.save_provider_profile(
            7,
            AiProviderProfileInput(
                provider="openai-compatible",
                name="Compatible model",
                base_url="https://models.example.test/v1",
                model="custom-model",
                is_default=True,
            ),
        )

        _events = [
            event
            async for event in service.stream_run(
                7,
                AiRunRequest(message="hello", provider_profile_id=profile.id),
            )
        ]

        self.assertEqual(registry.created_config.provider, "openai-compatible")
        self.assertEqual(registry.created_config.model, "custom-model")
        self.assertIsNone(registry.created_config.api_key)

    async def test_follow_up_run_includes_persisted_conversation_history(self):
        from src.modules.ai.repositories import InMemoryAiRepository
        from src.modules.ai.schemas import AiRunRequest
        from src.modules.ai.service import AiService

        registry = FakeRegistry()
        service = await configured_service(InMemoryAiRepository(), registry)
        first_events = [
            event
            async for event in service.stream_run(
                7,
                AiRunRequest(message="first"),
            )
        ]
        _second_events = [
            event
            async for event in service.stream_run(
                7,
                AiRunRequest(
                    conversation_id=first_events[0].conversation_id,
                    message="second",
                ),
            )
        ]

        self.assertEqual(
            registry.provider.messages,
            [
                {"role": "user", "content": "first"},
                {"role": "assistant", "content": "hello world"},
                {"role": "user", "content": "second"},
            ],
        )

    async def test_guest_follow_up_keeps_bounded_in_memory_context(self):
        from src.modules.ai.repositories import InMemoryAiRepository
        from src.modules.ai.schemas import AiRunRequest

        registry = FakeRegistry()
        service = await configured_service(InMemoryAiRepository(), registry)
        first_events = [
            event
            async for event in service.stream_run(
                None,
                AiRunRequest(conversation_id="guest-chat", message="first"),
            )
        ]
        _second_events = [
            event
            async for event in service.stream_run(
                None,
                AiRunRequest(
                    conversation_id=first_events[0].conversation_id,
                    message="second",
                ),
            )
        ]

        self.assertEqual(
            registry.provider.messages,
            [
                {"role": "user", "content": "first"},
                {"role": "assistant", "content": "hello world"},
                {"role": "user", "content": "second"},
            ],
        )

    async def test_regeneration_truncates_after_parent_without_duplicate_user_turn(self):
        from src.modules.ai.repositories import InMemoryAiRepository
        from src.modules.ai.schemas import AiRunRequest
        from src.modules.ai.service import AiService

        repository = InMemoryAiRepository()
        registry = FakeRegistry()
        service = await configured_service(repository, registry)
        first_events = [
            event
            async for event in service.stream_run(7, AiRunRequest(message="first"))
        ]
        conversation_id = first_events[0].conversation_id
        before = await repository.get_conversation(7, conversation_id)
        parent_id = before.messages[0].id

        _regenerated = [
            event
            async for event in service.stream_run(
                7,
                AiRunRequest(
                    conversation_id=conversation_id,
                    parent_message_id=parent_id,
                    message="first",
                ),
            )
        ]

        detail = await repository.get_conversation(7, conversation_id)
        self.assertEqual([message.role for message in detail.messages], ["user", "assistant"])
        self.assertEqual(registry.provider.messages, [{"role": "user", "content": "first"}])


if __name__ == "__main__":
    unittest.main()
