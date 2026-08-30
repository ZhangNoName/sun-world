import sys
import unittest
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError


API_ROOT = Path(__file__).resolve().parents[1]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))


class PersonaSkillSchemaTests(unittest.TestCase):
    def test_instructions_are_bounded_and_skill_is_prompt_only(self):
        from src.modules.ai.schemas import (
            AI_PERSONA_INSTRUCTIONS_MAX_LENGTH,
            AiPersonaInput,
            AiSkillInput,
        )

        with self.assertRaises(ValidationError):
            AiPersonaInput(
                name="Too large",
                instructions="x" * (AI_PERSONA_INSTRUCTIONS_MAX_LENGTH + 1),
            )
        with self.assertRaises(ValidationError):
            AiSkillInput(
                name="Executable",
                instructions="Use this prompt",
                kind="python",
            )
        with self.assertRaises(ValidationError):
            AiSkillInput(
                name="Executable",
                instructions="Use this prompt",
                command="python script.py",
            )

    def test_run_request_rejects_duplicate_or_excess_skill_ids(self):
        from src.modules.ai.schemas import AI_MAX_SELECTED_SKILLS, AiRunRequest

        with self.assertRaises(ValidationError):
            AiRunRequest(message="hello", skill_ids=["skill_1", "skill_1"])
        with self.assertRaises(ValidationError):
            AiRunRequest(
                message="hello",
                skill_ids=[f"skill_{index}" for index in range(AI_MAX_SELECTED_SKILLS + 1)],
            )


class InMemoryPersonaSkillRepositoryTests(unittest.IsolatedAsyncioTestCase):
    async def test_crud_is_strictly_scoped_to_the_owner(self):
        from src.modules.ai.errors import AiDomainError
        from src.modules.ai.repositories import InMemoryAiRepository
        from src.modules.ai.schemas import AiPersonaInput, AiSkillInput

        repository = InMemoryAiRepository()
        persona = await repository.create_persona(
            7,
            AiPersonaInput(name="Analyst", instructions="Be concise."),
        )
        skill = await repository.create_skill(
            7,
            AiSkillInput(name="Evidence", instructions="Cite the supplied evidence."),
        )

        self.assertEqual([item.id for item in await repository.list_personas(7)], [persona.id])
        self.assertEqual([item.id for item in await repository.list_skills(7)], [skill.id])
        self.assertEqual(await repository.list_personas(8), [])
        self.assertEqual(await repository.list_skills(8), [])

        for operation in (
            repository.get_persona(8, persona.id),
            repository.update_persona(
                8,
                persona.id,
                AiPersonaInput(name="Stolen", instructions="Override."),
            ),
            repository.delete_persona(8, persona.id),
            repository.get_skill(8, skill.id),
            repository.update_skill(
                8,
                skill.id,
                AiSkillInput(name="Stolen", instructions="Override."),
            ),
            repository.delete_skill(8, skill.id),
        ):
            with self.assertRaises(AiDomainError) as caught:
                await operation
            self.assertEqual(caught.exception.code, "AI_RESOURCE_NOT_FOUND")

        updated_persona = await repository.update_persona(
            7,
            persona.id,
            AiPersonaInput(name="Research analyst", instructions="Explain assumptions."),
        )
        updated_skill = await repository.update_skill(
            7,
            skill.id,
            AiSkillInput(name="Evidence first", instructions="Use sources first."),
        )
        self.assertEqual(updated_persona.name, "Research analyst")
        self.assertEqual(updated_skill.kind, "prompt")

        await repository.delete_persona(7, persona.id)
        await repository.delete_skill(7, skill.id)
        self.assertEqual(await repository.list_personas(7), [])
        self.assertEqual(await repository.list_skills(7), [])

    async def test_get_skills_preserves_the_requested_order_and_fails_closed(self):
        from src.modules.ai.errors import AiDomainError
        from src.modules.ai.repositories import InMemoryAiRepository
        from src.modules.ai.schemas import AiSkillInput

        repository = InMemoryAiRepository()
        first = await repository.create_skill(
            7,
            AiSkillInput(name="First", instructions="First instructions."),
        )
        second = await repository.create_skill(
            7,
            AiSkillInput(name="Second", instructions="Second instructions."),
        )

        selected = await repository.get_skills(7, [second.id, first.id])
        self.assertEqual([item.id for item in selected], [second.id, first.id])
        with self.assertRaises(AiDomainError):
            await repository.get_skills(8, [first.id])


class MySqlPersonaSkillRepositoryTests(unittest.IsolatedAsyncioTestCase):
    async def test_batch_skill_lookup_filters_owner_and_restores_request_order(self):
        from src.modules.ai.repositories import MySqlAiRepository

        class FakeDb:
            def __init__(self):
                self.sql = ""
                self.params = ()

            def fetch_all(self, sql, params):
                self.sql = sql
                self.params = params
                return [
                    {
                        "id": "skill_b",
                        "name": "B",
                        "description": None,
                        "kind": "prompt",
                        "instructions": "B instructions",
                    },
                    {
                        "id": "skill_a",
                        "name": "A",
                        "description": None,
                        "kind": "prompt",
                        "instructions": "A instructions",
                    },
                ]

        database = FakeDb()
        selected = await MySqlAiRepository(database).get_skills(
            7,
            ["skill_a", "skill_b"],
        )

        self.assertIn("user_id = %s", database.sql)
        self.assertEqual(database.params, (7, "skill_a", "skill_b"))
        self.assertEqual([item.id for item in selected], ["skill_a", "skill_b"])

    async def test_persona_lookup_never_falls_back_to_an_unowned_row(self):
        from src.modules.ai.errors import AiDomainError
        from src.modules.ai.repositories import MySqlAiRepository

        class EmptyDb:
            def __init__(self):
                self.sql = ""
                self.params = ()

            def fetch_one(self, sql, params):
                self.sql = sql
                self.params = params
                return None

        database = EmptyDb()
        with self.assertRaises(AiDomainError) as caught:
            await MySqlAiRepository(database).get_persona(7, "persona_other")

        self.assertEqual(caught.exception.code, "AI_RESOURCE_NOT_FOUND")
        self.assertIn("id = %s AND user_id = %s", database.sql)
        self.assertEqual(database.params, ("persona_other", 7))


class CaptureProvider:
    def __init__(self):
        self.calls = 0
        self.messages = []

    async def stream(self, messages):
        self.calls += 1
        self.messages = messages
        yield "ok"


class CaptureRegistry:
    def __init__(self):
        self.provider = CaptureProvider()

    def create(self, _config):
        return self.provider


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


class PersonaSkillPromptTests(unittest.IsolatedAsyncioTestCase):
    async def test_prompt_order_is_safety_persona_skills_then_conversation(self):
        from src.modules.ai.repositories import InMemoryAiRepository
        from src.modules.ai.schemas import AiPersonaInput, AiRunRequest, AiSkillInput

        repository = InMemoryAiRepository()
        registry = CaptureRegistry()
        service = await configured_service(repository, registry)
        persona = await service.create_persona(
            7,
            AiPersonaInput(name="Architect", instructions="PERSONA_INSTRUCTIONS"),
        )
        first = await service.create_skill(
            7,
            AiSkillInput(name="First skill", instructions="FIRST_SKILL_INSTRUCTIONS"),
        )
        second = await service.create_skill(
            7,
            AiSkillInput(name="Second skill", instructions="SECOND_SKILL_INSTRUCTIONS"),
        )

        events = [
            event
            async for event in service.stream_run(
                7,
                AiRunRequest(
                    message="USER_MESSAGE",
                    persona_id=persona.id,
                    skill_ids=[second.id, first.id],
                ),
            )
        ]

        self.assertEqual(events[-1].type, "message.completed")
        self.assertEqual(registry.provider.messages[0]["role"], "system")
        system_content = registry.provider.messages[0]["content"]
        ordered_markers = [
            "# Platform safety",
            "PERSONA_INSTRUCTIONS",
            "SECOND_SKILL_INSTRUCTIONS",
            "FIRST_SKILL_INSTRUCTIONS",
        ]
        positions = [system_content.index(marker) for marker in ordered_markers]
        self.assertEqual(positions, sorted(positions))
        self.assertEqual(
            registry.provider.messages[1],
            {"role": "user", "content": "USER_MESSAGE"},
        )

        conversation = await repository.get_conversation(7, events[0].conversation_id)
        self.assertEqual([message.role for message in conversation.messages], ["user", "assistant"])
        self.assertNotIn("PERSONA_INSTRUCTIONS", repr(conversation.messages))
        self.assertNotIn("FIRST_SKILL_INSTRUCTIONS", repr(conversation.messages))

    async def test_guest_asset_selection_fails_before_provider_or_persistence(self):
        from src.modules.ai.repositories import InMemoryAiRepository
        from src.modules.ai.schemas import AiRunRequest

        repository = InMemoryAiRepository()
        registry = CaptureRegistry()
        service = await configured_service(repository, registry)

        events = [
            event
            async for event in service.stream_run(
                None,
                AiRunRequest(message="hello", persona_id="persona_private"),
            )
        ]

        self.assertEqual([event.type for event in events], ["run.failed"])
        self.assertEqual(events[0].data["code"], "AI_AUTH_REQUIRED")
        self.assertEqual(registry.provider.calls, 0)
        self.assertEqual(service._guest_transcripts, {})

    async def test_foreign_owned_asset_fails_before_creating_a_conversation(self):
        from src.modules.ai.repositories import InMemoryAiRepository
        from src.modules.ai.schemas import AiPersonaInput, AiRunRequest

        repository = InMemoryAiRepository()
        registry = CaptureRegistry()
        service = await configured_service(repository, registry)
        persona = await service.create_persona(
            8,
            AiPersonaInput(name="Private", instructions="Owner eight only."),
        )

        events = [
            event
            async for event in service.stream_run(
                7,
                AiRunRequest(message="hello", persona_id=persona.id),
            )
        ]

        self.assertEqual(events[0].data["code"], "AI_RESOURCE_NOT_FOUND")
        self.assertEqual(await repository.list_conversations(7), [])
        self.assertEqual(registry.provider.calls, 0)

    async def test_combined_custom_instructions_are_bounded(self):
        from src.modules.ai.repositories import InMemoryAiRepository
        from src.modules.ai.schemas import AiRunRequest, AiSkillInput

        repository = InMemoryAiRepository()
        registry = CaptureRegistry()
        service = await configured_service(repository, registry)
        skills = [
            await service.create_skill(
                7,
                AiSkillInput(
                    name=f"Large skill {index}",
                    instructions=str(index) * 8_000,
                ),
            )
            for index in range(5)
        ]

        events = [
            event
            async for event in service.stream_run(
                7,
                AiRunRequest(
                    message="hello",
                    skill_ids=[skill.id for skill in skills],
                ),
            )
        ]

        self.assertEqual(events[0].data["code"], "AI_CUSTOM_INSTRUCTIONS_TOO_LARGE")
        self.assertEqual(await repository.list_conversations(7), [])
        self.assertEqual(registry.provider.calls, 0)


class PersonaSkillRouterTests(unittest.TestCase):
    def setUp(self):
        from src.modules.ai.repositories import InMemoryAiRepository
        from src.modules.ai.router import get_ai_service, get_optional_ai_user_id, router
        from src.modules.ai.service import AiService

        application = FastAPI()
        application.include_router(router)
        self.repository = InMemoryAiRepository()
        self.service = AiService(self.repository, CaptureRegistry())
        application.dependency_overrides[get_ai_service] = lambda: self.service
        application.dependency_overrides[get_optional_ai_user_id] = lambda: 7
        self.client = TestClient(application)

    def test_persona_and_prompt_skill_crud(self):
        persona_response = self.client.post(
            "/ai/v1/personas",
            json={"name": "Writer", "instructions": "Write clearly."},
        )
        self.assertEqual(persona_response.status_code, 200)
        persona_id = persona_response.json()["data"]["id"]
        self.assertEqual(len(self.client.get("/ai/v1/personas").json()["data"]), 1)

        updated = self.client.put(
            f"/ai/v1/personas/{persona_id}",
            json={"name": "Editor", "instructions": "Edit carefully."},
        )
        self.assertEqual(updated.status_code, 200)
        self.assertEqual(updated.json()["data"]["name"], "Editor")

        skill_response = self.client.post(
            "/ai/v1/skills",
            json={"name": "Outline", "instructions": "Start with an outline."},
        )
        self.assertEqual(skill_response.status_code, 200)
        skill_id = skill_response.json()["data"]["id"]
        self.assertEqual(skill_response.json()["data"]["kind"], "prompt")
        self.assertEqual(len(self.client.get("/ai/v1/skills").json()["data"]), 1)

        updated_skill = self.client.put(
            f"/ai/v1/skills/{skill_id}",
            json={"name": "Structured outline", "instructions": "Use three sections."},
        )
        self.assertEqual(updated_skill.status_code, 200)
        self.assertEqual(updated_skill.json()["data"]["name"], "Structured outline")

        self.assertEqual(self.client.delete(f"/ai/v1/personas/{persona_id}").status_code, 200)
        self.assertEqual(self.client.delete(f"/ai/v1/skills/{skill_id}").status_code, 200)
        self.assertEqual(self.client.get(f"/ai/v1/personas/{persona_id}").status_code, 404)
        self.assertEqual(self.client.get(f"/ai/v1/skills/{skill_id}").status_code, 404)

    def test_asset_management_requires_authentication(self):
        from src.modules.ai.router import get_optional_ai_user_id

        self.client.app.dependency_overrides[get_optional_ai_user_id] = lambda: None

        response = self.client.post(
            "/ai/v1/skills",
            json={"name": "Private", "instructions": "Private prompt."},
        )

        self.assertEqual(response.status_code, 401)


if __name__ == "__main__":
    unittest.main()
