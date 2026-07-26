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


class AiServiceTests(unittest.IsolatedAsyncioTestCase):
    async def test_guest_stream_emits_monotonic_events_and_one_terminal_event(self):
        from src.modules.ai.repositories import InMemoryAiRepository
        from src.modules.ai.schemas import AiRunRequest
        from src.modules.ai.service import AiService

        service = AiService(InMemoryAiRepository(), FakeRegistry())

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
        service = AiService(repository, FakeRegistry())
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

        service = AiService(InMemoryAiRepository(), BrokenRegistry())
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
        service = AiService(repository, registry)
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
        service = AiService(InMemoryAiRepository(), registry)
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

    async def test_regeneration_truncates_after_parent_without_duplicate_user_turn(self):
        from src.modules.ai.repositories import InMemoryAiRepository
        from src.modules.ai.schemas import AiRunRequest
        from src.modules.ai.service import AiService

        repository = InMemoryAiRepository()
        registry = FakeRegistry()
        service = AiService(repository, registry)
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
