from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone
from typing import Protocol
from uuid import uuid4

from pydantic import TypeAdapter

from .errors import AiDomainError
from .schemas import (
    AiContentBlock,
    AiConversation,
    AiConversationSummary,
    AiMessage,
    AiPersona,
    AiPersonaInput,
    AiProviderCatalog,
    AiProviderCatalogInput,
    AiProviderProfile,
    AiProviderProfileInput,
    AiSkill,
    AiSkillInput,
    AiTextBlock,
)


BLOCKS_ADAPTER = TypeAdapter(list[AiContentBlock])


class AiRepository(Protocol):
    async def create_conversation(self, user_id: int, title: str) -> AiConversation: ...
    async def list_conversations(self, user_id: int) -> list[AiConversationSummary]: ...
    async def get_conversation(self, user_id: int, conversation_id: str) -> AiConversation: ...
    async def get_message_conversation_id(self, user_id: int, message_id: str) -> str: ...
    async def append_message(
        self,
        user_id: int,
        conversation_id: str,
        role: str,
        blocks: list[AiContentBlock],
        status: str = "completed",
    ) -> AiMessage: ...
    async def set_feedback(self, user_id: int, message_id: str, value: str | None) -> None: ...
    async def get_feedback(self, user_id: int, message_id: str) -> str | None: ...
    async def list_provider_catalog(self) -> list[AiProviderCatalog]: ...
    async def create_provider_catalog_entry(self, value: AiProviderCatalogInput) -> AiProviderCatalog: ...
    async def update_provider_catalog_entry(self, provider_id: str, value: AiProviderCatalogInput) -> AiProviderCatalog: ...
    async def delete_provider_catalog_entry(self, provider_id: str) -> None: ...
    async def get_default_provider_record(self) -> tuple[AiProviderCatalog, str] | None: ...
    async def list_provider_profiles(self, user_id: int) -> list[AiProviderProfile]: ...
    async def save_provider_profile(
        self,
        user_id: int,
        value: AiProviderProfileInput,
        encrypted_key: str | None,
        key_hint: str | None,
    ) -> AiProviderProfile: ...
    async def get_provider_profile_record(
        self,
        user_id: int,
        profile_id: str | None,
    ) -> tuple[AiProviderProfile, str | None] | None: ...
    async def list_personas(self, user_id: int) -> list[AiPersona]: ...
    async def create_persona(self, user_id: int, value: AiPersonaInput) -> AiPersona: ...
    async def get_persona(self, user_id: int, persona_id: str) -> AiPersona: ...
    async def update_persona(
        self,
        user_id: int,
        persona_id: str,
        value: AiPersonaInput,
    ) -> AiPersona: ...
    async def delete_persona(self, user_id: int, persona_id: str) -> None: ...
    async def list_skills(self, user_id: int) -> list[AiSkill]: ...
    async def create_skill(self, user_id: int, value: AiSkillInput) -> AiSkill: ...
    async def get_skill(self, user_id: int, skill_id: str) -> AiSkill: ...
    async def get_skills(self, user_id: int, skill_ids: list[str]) -> list[AiSkill]: ...
    async def update_skill(
        self,
        user_id: int,
        skill_id: str,
        value: AiSkillInput,
    ) -> AiSkill: ...
    async def delete_skill(self, user_id: int, skill_id: str) -> None: ...
    async def edit_message(self, user_id: int, message_id: str, content: str) -> AiMessage: ...


def _id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex}"


class InMemoryAiRepository:
    def __init__(self):
        self._conversations: dict[str, tuple[int, AiConversation]] = {}
        self._feedback: dict[tuple[int, str], str] = {}
        self._conversation_order: dict[str, int] = {}
        self._next_order = 0
        self._profiles: dict[str, tuple[int, AiProviderProfile, str | None]] = {}
        self._provider_catalog: dict[str, AiProviderCatalog] = {}
        self._provider_catalog_secrets: dict[str, str | None] = {}
        self._personas: dict[str, tuple[int, AiPersona]] = {}
        self._skills: dict[str, tuple[int, AiSkill]] = {}

    async def create_conversation(self, user_id: int, title: str) -> AiConversation:
        conversation = AiConversation(id=_id("conv"), title=title)
        self._conversations[conversation.id] = (user_id, conversation)
        self._next_order += 1
        self._conversation_order[conversation.id] = self._next_order
        return conversation

    async def list_conversations(self, user_id: int) -> list[AiConversationSummary]:
        items = [conversation for owner, conversation in self._conversations.values() if owner == user_id]
        items.sort(
            key=lambda item: (item.updated_at, self._conversation_order[item.id]),
            reverse=True,
        )
        return [AiConversationSummary(**item.model_dump(exclude={"messages"})) for item in items]

    async def get_conversation(self, user_id: int, conversation_id: str) -> AiConversation:
        found = self._conversations.get(conversation_id)
        if found is None or found[0] != user_id:
            raise AiDomainError("AI_RESOURCE_NOT_FOUND", "Conversation not found.", status_code=404)
        return found[1]

    async def get_message_conversation_id(self, user_id: int, message_id: str) -> str:
        for owner, conversation in self._conversations.values():
            if owner == user_id and any(
                message.id == message_id for message in conversation.messages
            ):
                return conversation.id
        raise AiDomainError(
            "AI_RESOURCE_NOT_FOUND",
            "Message not found.",
            status_code=404,
        )

    async def append_message(
        self,
        user_id: int,
        conversation_id: str,
        role: str,
        blocks: list[AiContentBlock],
        status: str = "completed",
    ) -> AiMessage:
        conversation = await self.get_conversation(user_id, conversation_id)
        stamp = datetime.now(timezone.utc)
        message = AiMessage(
            id=_id("msg"),
            conversation_id=conversation_id,
            role=role,
            blocks=blocks,
            sequence=len(conversation.messages) + 1,
            status=status,
            created_at=stamp,
            updated_at=stamp,
        )
        conversation.messages.append(message)
        conversation.updated_at = stamp
        return message

    async def set_feedback(self, user_id: int, message_id: str, value: str | None) -> None:
        owned = any(
            owner == user_id
            and any(message.id == message_id for message in conversation.messages)
            for owner, conversation in self._conversations.values()
        )
        if not owned:
            raise AiDomainError("AI_RESOURCE_NOT_FOUND", "Message not found.", status_code=404)
        key = (user_id, message_id)
        if value is None:
            self._feedback.pop(key, None)
        else:
            self._feedback[key] = value

    async def get_feedback(self, user_id: int, message_id: str) -> str | None:
        return self._feedback.get((user_id, message_id))

    async def list_provider_catalog(self) -> list[AiProviderCatalog]:
        return sorted(self._provider_catalog.values(), key=lambda item: (item.sort_order, item.id))

    async def create_provider_catalog_entry(self, value: AiProviderCatalogInput) -> AiProviderCatalog:
        if value.id in self._provider_catalog:
            raise AiDomainError("AI_PROVIDER_ALREADY_EXISTS", "Provider already exists.", status_code=409)
        catalog_entry = AiProviderCatalog(**value.model_dump())
        self._provider_catalog[catalog_entry.id] = catalog_entry
        self._provider_catalog_secrets[catalog_entry.id] = None
        return catalog_entry

    async def update_provider_catalog_entry(
        self,
        provider_id: str,
        value: AiProviderCatalogInput,
    ) -> AiProviderCatalog:
        existing = self._provider_catalog.get(provider_id)
        if existing is None:
            raise AiDomainError("AI_RESOURCE_NOT_FOUND", "Provider not found.", status_code=404)
        catalog_entry = AiProviderCatalog(
            **value.model_dump(),
            created_at=existing.created_at,
            updated_at=datetime.now(timezone.utc),
        )
        if catalog_entry.id != provider_id:
            raise AiDomainError("AI_PROVIDER_ID_IMMUTABLE", "Provider ID cannot be changed.", status_code=409)
        self._provider_catalog[provider_id] = catalog_entry
        return catalog_entry

    async def delete_provider_catalog_entry(self, provider_id: str) -> None:
        if provider_id not in self._provider_catalog:
            raise AiDomainError("AI_RESOURCE_NOT_FOUND", "Provider not found.", status_code=404)
        del self._provider_catalog[provider_id]
        self._provider_catalog_secrets.pop(provider_id, None)

    async def get_default_provider_record(self) -> tuple[AiProviderCatalog, str] | None:
        for catalog_entry in await self.list_provider_catalog():
            encrypted_key = self._provider_catalog_secrets.get(catalog_entry.id)
            if catalog_entry.is_enabled and encrypted_key:
                return catalog_entry, encrypted_key
        return None

    async def list_provider_profiles(self, user_id: int) -> list[AiProviderProfile]:
        return [profile for owner, profile, _secret in self._profiles.values() if owner == user_id]

    async def save_provider_profile(
        self,
        user_id: int,
        value: AiProviderProfileInput,
        encrypted_key: str | None,
        key_hint: str | None,
    ) -> AiProviderProfile:
        profile_id = value.id or _id("profile")
        existing = self._profiles.get(profile_id)
        if existing is not None and existing[0] != user_id:
            raise AiDomainError("AI_RESOURCE_NOT_FOUND", "Provider profile not found.", status_code=404)
        if value.is_default:
            for key, (owner, profile, secret) in list(self._profiles.items()):
                if owner == user_id:
                    self._profiles[key] = (owner, profile.model_copy(update={"is_default": False}), secret)
        secret = encrypted_key if encrypted_key is not None else (existing[2] if existing else None)
        stamp = datetime.now(timezone.utc)
        profile = AiProviderProfile(
            id=profile_id,
            provider=value.provider,
            name=value.name,
            base_url=value.base_url,
            model=value.model,
            is_default=value.is_default,
            has_api_key=secret is not None,
            api_key_hint=key_hint or (existing[1].api_key_hint if existing else None),
            created_at=existing[1].created_at if existing else stamp,
            updated_at=stamp,
        )
        self._profiles[profile_id] = (user_id, profile, secret)
        return profile

    async def get_provider_profile_record(
        self,
        user_id: int,
        profile_id: str | None,
    ) -> tuple[AiProviderProfile, str | None] | None:
        if profile_id:
            found = self._profiles.get(profile_id)
            if found is None or found[0] != user_id:
                raise AiDomainError("AI_RESOURCE_NOT_FOUND", "Provider profile not found.", status_code=404)
            return found[1], found[2]
        for owner, profile, secret in self._profiles.values():
            if owner == user_id and profile.is_default:
                return profile, secret
        return None

    async def list_personas(self, user_id: int) -> list[AiPersona]:
        personas = [persona for owner, persona in self._personas.values() if owner == user_id]
        return sorted(personas, key=lambda item: (item.updated_at, item.id), reverse=True)

    async def create_persona(self, user_id: int, value: AiPersonaInput) -> AiPersona:
        persona = AiPersona(id=_id("persona"), **value.model_dump())
        self._personas[persona.id] = (user_id, persona)
        return persona

    async def get_persona(self, user_id: int, persona_id: str) -> AiPersona:
        found = self._personas.get(persona_id)
        if found is None or found[0] != user_id:
            raise AiDomainError("AI_RESOURCE_NOT_FOUND", "Persona not found.", status_code=404)
        return found[1]

    async def update_persona(
        self,
        user_id: int,
        persona_id: str,
        value: AiPersonaInput,
    ) -> AiPersona:
        existing = await self.get_persona(user_id, persona_id)
        persona = AiPersona(
            id=persona_id,
            **value.model_dump(),
            created_at=existing.created_at,
            updated_at=datetime.now(timezone.utc),
        )
        self._personas[persona_id] = (user_id, persona)
        return persona

    async def delete_persona(self, user_id: int, persona_id: str) -> None:
        await self.get_persona(user_id, persona_id)
        del self._personas[persona_id]

    async def list_skills(self, user_id: int) -> list[AiSkill]:
        skills = [skill for owner, skill in self._skills.values() if owner == user_id]
        return sorted(skills, key=lambda item: (item.updated_at, item.id), reverse=True)

    async def create_skill(self, user_id: int, value: AiSkillInput) -> AiSkill:
        skill = AiSkill(id=_id("skill"), **value.model_dump())
        self._skills[skill.id] = (user_id, skill)
        return skill

    async def get_skill(self, user_id: int, skill_id: str) -> AiSkill:
        found = self._skills.get(skill_id)
        if found is None or found[0] != user_id:
            raise AiDomainError("AI_RESOURCE_NOT_FOUND", "Skill not found.", status_code=404)
        return found[1]

    async def get_skills(self, user_id: int, skill_ids: list[str]) -> list[AiSkill]:
        return [await self.get_skill(user_id, skill_id) for skill_id in skill_ids]

    async def update_skill(
        self,
        user_id: int,
        skill_id: str,
        value: AiSkillInput,
    ) -> AiSkill:
        existing = await self.get_skill(user_id, skill_id)
        skill = AiSkill(
            id=skill_id,
            **value.model_dump(),
            created_at=existing.created_at,
            updated_at=datetime.now(timezone.utc),
        )
        self._skills[skill_id] = (user_id, skill)
        return skill

    async def delete_skill(self, user_id: int, skill_id: str) -> None:
        await self.get_skill(user_id, skill_id)
        del self._skills[skill_id]

    async def edit_message(self, user_id: int, message_id: str, content: str) -> AiMessage:
        for owner, conversation in self._conversations.values():
            if owner != user_id:
                continue
            for index, message in enumerate(conversation.messages):
                if message.id != message_id:
                    continue
                if message.role != "user":
                    raise AiDomainError("AI_MESSAGE_NOT_EDITABLE", "Only user messages can be edited.", status_code=409)
                updated = message.model_copy(
                    update={
                        "blocks": [AiTextBlock(text=content.strip())],
                        "updated_at": datetime.now(timezone.utc),
                    }
                )
                conversation.messages[index:] = [updated]
                conversation.updated_at = updated.updated_at
                return updated
        raise AiDomainError("AI_RESOURCE_NOT_FOUND", "Message not found.", status_code=404)


class MySqlAiRepository:
    """MySQL-backed AI workspace storage behind the application service boundary."""

    def __init__(self, db):
        self.db = db

    async def create_conversation(self, user_id: int, title: str) -> AiConversation:
        return await asyncio.to_thread(self._create_conversation, user_id, title)

    def _create_conversation(self, user_id: int, title: str) -> AiConversation:
        conversation = AiConversation(id=_id("conv"), title=title)
        self.db.execute(
            "INSERT INTO ai_conversations (id, user_id, title) VALUES (%s, %s, %s)",
            (conversation.id, user_id, title),
        )
        return conversation

    async def list_conversations(self, user_id: int) -> list[AiConversationSummary]:
        return await asyncio.to_thread(self._list_conversations, user_id)

    def _list_conversations(self, user_id: int) -> list[AiConversationSummary]:
        rows = self.db.fetch_all(
            "SELECT id, title, created_at, updated_at FROM ai_conversations "
            "WHERE user_id = %s AND is_deleted = 0 ORDER BY updated_at DESC, id DESC",
            (user_id,),
        )
        return [AiConversationSummary(**row) for row in rows]

    async def get_conversation(self, user_id: int, conversation_id: str) -> AiConversation:
        return await asyncio.to_thread(
            self._get_conversation,
            user_id,
            conversation_id,
        )

    def _get_conversation(self, user_id: int, conversation_id: str) -> AiConversation:
        row = self.db.fetch_one(
            "SELECT id, title, created_at, updated_at FROM ai_conversations "
            "WHERE id = %s AND user_id = %s AND is_deleted = 0",
            (conversation_id, user_id),
        )
        if not row:
            raise AiDomainError("AI_RESOURCE_NOT_FOUND", "Conversation not found.", status_code=404)
        message_rows = self.db.fetch_all(
            "SELECT m.id, m.conversation_id, m.role, m.blocks, m.sequence, m.status, "
            "m.created_at, m.updated_at, f.value AS feedback "
            "FROM ai_messages m LEFT JOIN ai_message_feedback f "
            "ON f.message_id = m.id AND f.user_id = %s "
            "WHERE m.conversation_id = %s ORDER BY m.sequence ASC",
            (user_id, conversation_id),
        )
        messages = []
        for message_row in message_rows:
            raw_blocks = message_row["blocks"]
            if isinstance(raw_blocks, str):
                raw_blocks = json.loads(raw_blocks)
            messages.append(
                AiMessage(
                    **{key: value for key, value in message_row.items() if key != "blocks"},
                    blocks=BLOCKS_ADAPTER.validate_python(raw_blocks),
                )
            )
        return AiConversation(**row, messages=messages)

    async def get_message_conversation_id(self, user_id: int, message_id: str) -> str:
        return await asyncio.to_thread(
            self._get_message_conversation_id,
            user_id,
            message_id,
        )

    def _get_message_conversation_id(self, user_id: int, message_id: str) -> str:
        row = self.db.fetch_one(
            "SELECT c.id AS conversation_id FROM ai_messages m "
            "JOIN ai_conversations c ON c.id = m.conversation_id "
            "WHERE m.id = %s AND c.user_id = %s AND c.is_deleted = 0",
            (message_id, user_id),
        )
        if not row:
            raise AiDomainError(
                "AI_RESOURCE_NOT_FOUND",
                "Message not found.",
                status_code=404,
            )
        return str(row["conversation_id"])

    async def append_message(
        self,
        user_id: int,
        conversation_id: str,
        role: str,
        blocks: list[AiContentBlock],
        status: str = "completed",
    ) -> AiMessage:
        return await asyncio.to_thread(
            self._append_message,
            user_id,
            conversation_id,
            role,
            blocks,
            status,
        )

    def _append_message(
        self,
        user_id: int,
        conversation_id: str,
        role: str,
        blocks: list[AiContentBlock],
        status: str = "completed",
    ) -> AiMessage:
        # The conversation row is the serialization point for message sequence
        # allocation. Keeping ownership validation, MAX(sequence), insert, and
        # touch on one connection prevents concurrent runs from choosing the
        # same sequence and guarantees rollback if any write fails.
        with self.db.unit_of_work() as uow:
            owned = uow.fetch_one(
                "SELECT id FROM ai_conversations "
                "WHERE id = %s AND user_id = %s AND is_deleted = 0 FOR UPDATE",
                (conversation_id, user_id),
            )
            if not owned:
                raise AiDomainError(
                    "AI_RESOURCE_NOT_FOUND",
                    "Conversation not found.",
                    status_code=404,
                )
            row = uow.fetch_one(
                "SELECT COALESCE(MAX(sequence), 0) AS sequence "
                "FROM ai_messages WHERE conversation_id = %s",
                (conversation_id,),
            )
            sequence = int(row["sequence"] if row else 0) + 1
            message = AiMessage(
                id=_id("msg"),
                conversation_id=conversation_id,
                role=role,
                blocks=blocks,
                sequence=sequence,
                status=status,
            )
            uow.execute(
                "INSERT INTO ai_messages (id, conversation_id, role, blocks, sequence, status) "
                "VALUES (%s, %s, %s, %s, %s, %s)",
                (
                    message.id,
                    conversation_id,
                    role,
                    json.dumps(
                        [block.model_dump(mode="json") for block in blocks],
                        ensure_ascii=False,
                    ),
                    sequence,
                    status,
                ),
            )
            uow.execute(
                "UPDATE ai_conversations SET updated_at = CURRENT_TIMESTAMP(6) "
                "WHERE id = %s",
                (conversation_id,),
            )
            uow.commit()
        return message

    async def set_feedback(self, user_id: int, message_id: str, value: str | None) -> None:
        await asyncio.to_thread(self._set_feedback, user_id, message_id, value)

    def _set_feedback(self, user_id: int, message_id: str, value: str | None) -> None:
        owned = self.db.fetch_one(
            "SELECT m.id FROM ai_messages m JOIN ai_conversations c ON c.id = m.conversation_id "
            "WHERE m.id = %s AND c.user_id = %s AND c.is_deleted = 0",
            (message_id, user_id),
        )
        if not owned:
            raise AiDomainError("AI_RESOURCE_NOT_FOUND", "Message not found.", status_code=404)
        if value is None:
            self.db.execute("DELETE FROM ai_message_feedback WHERE message_id = %s AND user_id = %s", (message_id, user_id))
            return
        self.db.execute(
            "INSERT INTO ai_message_feedback (message_id, user_id, value) VALUES (%s, %s, %s) "
            "ON DUPLICATE KEY UPDATE value = VALUES(value), updated_at = CURRENT_TIMESTAMP(6)",
            (message_id, user_id, value),
        )

    async def get_feedback(self, user_id: int, message_id: str) -> str | None:
        return await asyncio.to_thread(self._get_feedback, user_id, message_id)

    def _get_feedback(self, user_id: int, message_id: str) -> str | None:
        row = self.db.fetch_one(
            "SELECT value FROM ai_message_feedback WHERE message_id = %s AND user_id = %s",
            (message_id, user_id),
        )
        return row["value"] if row else None

    async def list_provider_catalog(self) -> list[AiProviderCatalog]:
        return await asyncio.to_thread(self._list_provider_catalog)

    def _list_provider_catalog(self) -> list[AiProviderCatalog]:
        rows = self.db.fetch_all(
            "SELECT id, name, default_base_url, default_model, is_enabled, sort_order, created_at, updated_at "
            "FROM ai_provider_catalog ORDER BY sort_order ASC, id ASC"
        )
        return [AiProviderCatalog(**row) for row in rows]

    async def get_default_provider_record(self) -> tuple[AiProviderCatalog, str] | None:
        return await asyncio.to_thread(self._get_default_provider_record)

    def _get_default_provider_record(self) -> tuple[AiProviderCatalog, str] | None:
        row = self.db.fetch_one(
            "SELECT id, name, default_base_url, default_model, is_enabled, sort_order, "
            "created_at, updated_at, api_key_ciphertext "
            "FROM ai_provider_catalog "
            "WHERE is_enabled = 1 AND api_key_ciphertext IS NOT NULL "
            "ORDER BY sort_order ASC, id ASC LIMIT 1"
        )
        if not row:
            return None
        encrypted_key = row.pop("api_key_ciphertext")
        if not encrypted_key:
            return None
        return AiProviderCatalog(**row), encrypted_key

    async def create_provider_catalog_entry(self, value: AiProviderCatalogInput) -> AiProviderCatalog:
        return await asyncio.to_thread(self._create_provider_catalog_entry, value)

    def _create_provider_catalog_entry(self, value: AiProviderCatalogInput) -> AiProviderCatalog:
        existing = self.db.fetch_one("SELECT id FROM ai_provider_catalog WHERE id = %s", (value.id,))
        if existing:
            raise AiDomainError("AI_PROVIDER_ALREADY_EXISTS", "Provider already exists.", status_code=409)
        self.db.execute(
            "INSERT INTO ai_provider_catalog "
            "(id, name, default_base_url, default_model, is_enabled, sort_order) VALUES (%s, %s, %s, %s, %s, %s)",
            (
                value.id,
                value.name,
                value.default_base_url,
                value.default_model,
                value.is_enabled,
                value.sort_order,
            ),
        )
        return self._get_provider_catalog_entry(value.id)

    async def update_provider_catalog_entry(
        self,
        provider_id: str,
        value: AiProviderCatalogInput,
    ) -> AiProviderCatalog:
        return await asyncio.to_thread(
            self._update_provider_catalog_entry,
            provider_id,
            value,
        )

    def _update_provider_catalog_entry(
        self,
        provider_id: str,
        value: AiProviderCatalogInput,
    ) -> AiProviderCatalog:
        if value.id != provider_id:
            raise AiDomainError("AI_PROVIDER_ID_IMMUTABLE", "Provider ID cannot be changed.", status_code=409)
        self.db.execute(
            "UPDATE ai_provider_catalog SET name = %s, default_base_url = %s, default_model = %s, "
            "is_enabled = %s, sort_order = %s WHERE id = %s",
            (
                value.name,
                value.default_base_url,
                value.default_model,
                value.is_enabled,
                value.sort_order,
                provider_id,
            ),
        )
        return self._get_provider_catalog_entry(provider_id)

    async def delete_provider_catalog_entry(self, provider_id: str) -> None:
        await asyncio.to_thread(self._delete_provider_catalog_entry, provider_id)

    def _delete_provider_catalog_entry(self, provider_id: str) -> None:
        existing = self.db.fetch_one("SELECT id FROM ai_provider_catalog WHERE id = %s", (provider_id,))
        if not existing:
            raise AiDomainError("AI_RESOURCE_NOT_FOUND", "Provider not found.", status_code=404)
        self.db.execute("DELETE FROM ai_provider_catalog WHERE id = %s", (provider_id,))

    def _get_provider_catalog_entry(self, provider_id: str) -> AiProviderCatalog:
        row = self.db.fetch_one(
            "SELECT id, name, default_base_url, default_model, is_enabled, sort_order, created_at, updated_at "
            "FROM ai_provider_catalog WHERE id = %s",
            (provider_id,),
        )
        if not row:
            raise AiDomainError("AI_RESOURCE_NOT_FOUND", "Provider not found.", status_code=404)
        return AiProviderCatalog(**row)

    async def list_provider_profiles(self, user_id: int) -> list[AiProviderProfile]:
        return await asyncio.to_thread(self._list_provider_profiles, user_id)

    def _list_provider_profiles(self, user_id: int) -> list[AiProviderProfile]:
        rows = self.db.fetch_all(
            "SELECT id, provider, name, base_url, model, is_default, "
            "api_key_ciphertext IS NOT NULL AS has_api_key, api_key_hint, created_at, updated_at "
            "FROM ai_provider_profiles WHERE user_id = %s ORDER BY is_default DESC, updated_at DESC",
            (user_id,),
        )
        return [AiProviderProfile(**row) for row in rows]

    async def save_provider_profile(
        self,
        user_id: int,
        value: AiProviderProfileInput,
        encrypted_key: str | None,
        key_hint: str | None,
    ) -> AiProviderProfile:
        return await asyncio.to_thread(
            self._save_provider_profile,
            user_id,
            value,
            encrypted_key,
            key_hint,
        )

    def _save_provider_profile(
        self,
        user_id: int,
        value: AiProviderProfileInput,
        encrypted_key: str | None,
        key_hint: str | None,
    ) -> AiProviderProfile:
        profile_id = value.id or _id("profile")
        with self.db.unit_of_work() as uow:
            # Serialize all profile writes for one owner on the stable users
            # row. Clearing the previous default and writing the new profile
            # must be one transaction, otherwise concurrent saves can leave
            # multiple rows marked as default.
            owner = uow.fetch_one(
                "SELECT id FROM users WHERE id = %s FOR UPDATE",
                (user_id,),
            )
            if not owner:
                raise AiDomainError(
                    "AI_RESOURCE_NOT_FOUND",
                    "User not found.",
                    status_code=404,
                )
            if value.id:
                existing = uow.fetch_one(
                    "SELECT id FROM ai_provider_profiles "
                    "WHERE id = %s AND user_id = %s",
                    (profile_id, user_id),
                )
                if not existing:
                    raise AiDomainError(
                        "AI_RESOURCE_NOT_FOUND",
                        "Provider profile not found.",
                        status_code=404,
                    )
            if value.is_default:
                uow.execute(
                    "UPDATE ai_provider_profiles SET is_default = 0 "
                    "WHERE user_id = %s",
                    (user_id,),
                )
            uow.execute(
                "INSERT INTO ai_provider_profiles "
                "(id, user_id, provider, name, base_url, model, "
                "api_key_ciphertext, api_key_hint, is_default) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s) "
                "ON DUPLICATE KEY UPDATE provider = VALUES(provider), "
                "name = VALUES(name), base_url = VALUES(base_url), "
                "model = VALUES(model), "
                "api_key_ciphertext = COALESCE(VALUES(api_key_ciphertext), "
                "api_key_ciphertext), api_key_hint = COALESCE("
                "VALUES(api_key_hint), api_key_hint), "
                "is_default = VALUES(is_default)",
                (
                    profile_id,
                    user_id,
                    value.provider,
                    value.name,
                    value.base_url,
                    value.model,
                    encrypted_key,
                    key_hint,
                    value.is_default,
                ),
            )
            uow.commit()
        rows = self._list_provider_profiles(user_id)
        return next(profile for profile in rows if profile.id == profile_id)

    async def get_provider_profile_record(
        self,
        user_id: int,
        profile_id: str | None,
    ) -> tuple[AiProviderProfile, str | None] | None:
        return await asyncio.to_thread(
            self._get_provider_profile_record,
            user_id,
            profile_id,
        )

    def _get_provider_profile_record(
        self,
        user_id: int,
        profile_id: str | None,
    ) -> tuple[AiProviderProfile, str | None] | None:
        condition = "id = %s" if profile_id else "is_default = 1"
        params = (profile_id, user_id) if profile_id else (user_id,)
        row = self.db.fetch_one(
            "SELECT id, provider, name, base_url, model, is_default, "
            "api_key_ciphertext, api_key_hint, created_at, updated_at "
            f"FROM ai_provider_profiles WHERE {condition} AND user_id = %s "
            "ORDER BY updated_at DESC LIMIT 1",
            params,
        )
        if not row:
            if profile_id:
                raise AiDomainError("AI_RESOURCE_NOT_FOUND", "Provider profile not found.", status_code=404)
            return None
        encrypted = row.pop("api_key_ciphertext")
        profile = AiProviderProfile(
            **row,
            has_api_key=bool(encrypted),
        )
        return profile, encrypted

    async def list_personas(self, user_id: int) -> list[AiPersona]:
        return await asyncio.to_thread(self._list_personas, user_id)

    def _list_personas(self, user_id: int) -> list[AiPersona]:
        rows = self.db.fetch_all(
            "SELECT id, name, description, instructions, created_at, updated_at "
            "FROM ai_personas WHERE user_id = %s ORDER BY updated_at DESC, id DESC",
            (user_id,),
        )
        return [AiPersona(**row) for row in rows]

    async def create_persona(self, user_id: int, value: AiPersonaInput) -> AiPersona:
        return await asyncio.to_thread(self._create_persona, user_id, value)

    def _create_persona(self, user_id: int, value: AiPersonaInput) -> AiPersona:
        persona_id = _id("persona")
        self.db.execute(
            "INSERT INTO ai_personas (id, user_id, name, description, instructions) "
            "VALUES (%s, %s, %s, %s, %s)",
            (persona_id, user_id, value.name, value.description, value.instructions),
        )
        return self._get_persona(user_id, persona_id)

    async def get_persona(self, user_id: int, persona_id: str) -> AiPersona:
        return await asyncio.to_thread(self._get_persona, user_id, persona_id)

    def _get_persona(self, user_id: int, persona_id: str) -> AiPersona:
        row = self.db.fetch_one(
            "SELECT id, name, description, instructions, created_at, updated_at "
            "FROM ai_personas WHERE id = %s AND user_id = %s",
            (persona_id, user_id),
        )
        if not row:
            raise AiDomainError("AI_RESOURCE_NOT_FOUND", "Persona not found.", status_code=404)
        return AiPersona(**row)

    async def update_persona(
        self,
        user_id: int,
        persona_id: str,
        value: AiPersonaInput,
    ) -> AiPersona:
        return await asyncio.to_thread(
            self._update_persona,
            user_id,
            persona_id,
            value,
        )

    def _update_persona(
        self,
        user_id: int,
        persona_id: str,
        value: AiPersonaInput,
    ) -> AiPersona:
        self._get_persona(user_id, persona_id)
        self.db.execute(
            "UPDATE ai_personas SET name = %s, description = %s, instructions = %s "
            "WHERE id = %s AND user_id = %s",
            (value.name, value.description, value.instructions, persona_id, user_id),
        )
        return self._get_persona(user_id, persona_id)

    async def delete_persona(self, user_id: int, persona_id: str) -> None:
        await asyncio.to_thread(self._delete_persona, user_id, persona_id)

    def _delete_persona(self, user_id: int, persona_id: str) -> None:
        self._get_persona(user_id, persona_id)
        self.db.execute(
            "DELETE FROM ai_personas WHERE id = %s AND user_id = %s",
            (persona_id, user_id),
        )

    async def list_skills(self, user_id: int) -> list[AiSkill]:
        return await asyncio.to_thread(self._list_skills, user_id)

    def _list_skills(self, user_id: int) -> list[AiSkill]:
        rows = self.db.fetch_all(
            "SELECT id, name, description, kind, instructions, created_at, updated_at "
            "FROM ai_skills WHERE user_id = %s ORDER BY updated_at DESC, id DESC",
            (user_id,),
        )
        return [AiSkill(**row) for row in rows]

    async def create_skill(self, user_id: int, value: AiSkillInput) -> AiSkill:
        return await asyncio.to_thread(self._create_skill, user_id, value)

    def _create_skill(self, user_id: int, value: AiSkillInput) -> AiSkill:
        skill_id = _id("skill")
        self.db.execute(
            "INSERT INTO ai_skills (id, user_id, name, description, kind, instructions) "
            "VALUES (%s, %s, %s, %s, %s, %s)",
            (
                skill_id,
                user_id,
                value.name,
                value.description,
                value.kind,
                value.instructions,
            ),
        )
        return self._get_skill(user_id, skill_id)

    async def get_skill(self, user_id: int, skill_id: str) -> AiSkill:
        return await asyncio.to_thread(self._get_skill, user_id, skill_id)

    def _get_skill(self, user_id: int, skill_id: str) -> AiSkill:
        row = self.db.fetch_one(
            "SELECT id, name, description, kind, instructions, created_at, updated_at "
            "FROM ai_skills WHERE id = %s AND user_id = %s",
            (skill_id, user_id),
        )
        if not row:
            raise AiDomainError("AI_RESOURCE_NOT_FOUND", "Skill not found.", status_code=404)
        return AiSkill(**row)

    async def get_skills(self, user_id: int, skill_ids: list[str]) -> list[AiSkill]:
        return await asyncio.to_thread(self._get_skills, user_id, skill_ids)

    def _get_skills(self, user_id: int, skill_ids: list[str]) -> list[AiSkill]:
        if not skill_ids:
            return []
        placeholders = ", ".join(["%s"] * len(skill_ids))
        rows = self.db.fetch_all(
            "SELECT id, name, description, kind, instructions, created_at, updated_at "
            f"FROM ai_skills WHERE user_id = %s AND id IN ({placeholders})",
            (user_id, *skill_ids),
        )
        by_id = {row["id"]: AiSkill(**row) for row in rows}
        if any(skill_id not in by_id for skill_id in skill_ids):
            raise AiDomainError("AI_RESOURCE_NOT_FOUND", "Skill not found.", status_code=404)
        return [by_id[skill_id] for skill_id in skill_ids]

    async def update_skill(
        self,
        user_id: int,
        skill_id: str,
        value: AiSkillInput,
    ) -> AiSkill:
        return await asyncio.to_thread(
            self._update_skill,
            user_id,
            skill_id,
            value,
        )

    def _update_skill(
        self,
        user_id: int,
        skill_id: str,
        value: AiSkillInput,
    ) -> AiSkill:
        self._get_skill(user_id, skill_id)
        self.db.execute(
            "UPDATE ai_skills SET name = %s, description = %s, kind = %s, instructions = %s "
            "WHERE id = %s AND user_id = %s",
            (
                value.name,
                value.description,
                value.kind,
                value.instructions,
                skill_id,
                user_id,
            ),
        )
        return self._get_skill(user_id, skill_id)

    async def delete_skill(self, user_id: int, skill_id: str) -> None:
        await asyncio.to_thread(self._delete_skill, user_id, skill_id)

    def _delete_skill(self, user_id: int, skill_id: str) -> None:
        self._get_skill(user_id, skill_id)
        self.db.execute(
            "DELETE FROM ai_skills WHERE id = %s AND user_id = %s",
            (skill_id, user_id),
        )

    async def edit_message(self, user_id: int, message_id: str, content: str) -> AiMessage:
        return await asyncio.to_thread(
            self._edit_message,
            user_id,
            message_id,
            content,
        )

    def _edit_message(self, user_id: int, message_id: str, content: str) -> AiMessage:
        blocks = [AiTextBlock(text=content.strip())]
        conversation_id = self._get_message_conversation_id(user_id, message_id)
        with self.db.unit_of_work() as uow:
            # Use the same parent-row lock order as append_message so edit,
            # truncate, and append operations cannot interleave or deadlock by
            # acquiring the message and conversation rows in reverse order.
            owned = uow.fetch_one(
                "SELECT id FROM ai_conversations "
                "WHERE id = %s AND user_id = %s AND is_deleted = 0 FOR UPDATE",
                (conversation_id, user_id),
            )
            if not owned:
                raise AiDomainError(
                    "AI_RESOURCE_NOT_FOUND",
                    "Message not found.",
                    status_code=404,
                )
            row = uow.fetch_one(
                "SELECT * FROM ai_messages "
                "WHERE id = %s AND conversation_id = %s FOR UPDATE",
                (message_id, conversation_id),
            )
            if not row:
                raise AiDomainError(
                    "AI_RESOURCE_NOT_FOUND",
                    "Message not found.",
                    status_code=404,
                )
            if row["role"] != "user":
                raise AiDomainError(
                    "AI_MESSAGE_NOT_EDITABLE",
                    "Only user messages can be edited.",
                    status_code=409,
                )
            uow.execute(
                "DELETE f FROM ai_message_feedback f "
                "INNER JOIN ai_messages m ON m.id = f.message_id "
                "WHERE m.conversation_id = %s AND m.sequence > %s",
                (row["conversation_id"], row["sequence"]),
            )
            uow.execute(
                "DELETE FROM ai_messages WHERE conversation_id = %s AND sequence > %s",
                (row["conversation_id"], row["sequence"]),
            )
            uow.execute(
                "UPDATE ai_messages SET blocks = %s, updated_at = CURRENT_TIMESTAMP(6) "
                "WHERE id = %s",
                (
                    json.dumps(
                        [block.model_dump(mode="json") for block in blocks],
                        ensure_ascii=False,
                    ),
                    message_id,
                ),
            )
            uow.execute(
                "UPDATE ai_conversations SET updated_at = CURRENT_TIMESTAMP(6) "
                "WHERE id = %s",
                (row["conversation_id"],),
            )
            uow.commit()
        return AiMessage(
            id=message_id,
            conversation_id=row["conversation_id"],
            role="user",
            blocks=blocks,
            sequence=row["sequence"],
            status=row["status"],
            created_at=row["created_at"],
            updated_at=datetime.now(timezone.utc),
        )
