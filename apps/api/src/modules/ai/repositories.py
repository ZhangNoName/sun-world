from __future__ import annotations

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
    AiProviderProfile,
    AiProviderProfileInput,
    AiTextBlock,
)


BLOCKS_ADAPTER = TypeAdapter(list[AiContentBlock])


class AiRepository(Protocol):
    async def create_conversation(self, user_id: int, title: str) -> AiConversation: ...
    async def list_conversations(self, user_id: int) -> list[AiConversationSummary]: ...
    async def get_conversation(self, user_id: int, conversation_id: str) -> AiConversation: ...
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


def _id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex}"


class InMemoryAiRepository:
    def __init__(self):
        self._conversations: dict[str, tuple[int, AiConversation]] = {}
        self._feedback: dict[tuple[int, str], str] = {}
        self._conversation_order: dict[str, int] = {}
        self._next_order = 0
        self._profiles: dict[str, tuple[int, AiProviderProfile, str | None]] = {}

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
        conversation = AiConversation(id=_id("conv"), title=title)
        self.db.execute(
            "INSERT INTO ai_conversations (id, user_id, title) VALUES (%s, %s, %s)",
            (conversation.id, user_id, title),
        )
        return conversation

    async def list_conversations(self, user_id: int) -> list[AiConversationSummary]:
        rows = self.db.fetch_all(
            "SELECT id, title, created_at, updated_at FROM ai_conversations "
            "WHERE user_id = %s AND is_deleted = 0 ORDER BY updated_at DESC, id DESC",
            (user_id,),
        )
        return [AiConversationSummary(**row) for row in rows]

    async def get_conversation(self, user_id: int, conversation_id: str) -> AiConversation:
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

    async def append_message(
        self,
        user_id: int,
        conversation_id: str,
        role: str,
        blocks: list[AiContentBlock],
        status: str = "completed",
    ) -> AiMessage:
        await self.get_conversation(user_id, conversation_id)
        row = self.db.fetch_one(
            "SELECT COALESCE(MAX(sequence), 0) AS sequence FROM ai_messages WHERE conversation_id = %s",
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
        self.db.execute(
            "INSERT INTO ai_messages (id, conversation_id, role, blocks, sequence, status) "
            "VALUES (%s, %s, %s, %s, %s, %s)",
            (
                message.id,
                conversation_id,
                role,
                json.dumps([block.model_dump(mode="json") for block in blocks], ensure_ascii=False),
                sequence,
                status,
            ),
        )
        self.db.execute("UPDATE ai_conversations SET updated_at = CURRENT_TIMESTAMP(6) WHERE id = %s", (conversation_id,))
        return message

    async def set_feedback(self, user_id: int, message_id: str, value: str | None) -> None:
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
        row = self.db.fetch_one(
            "SELECT value FROM ai_message_feedback WHERE message_id = %s AND user_id = %s",
            (message_id, user_id),
        )
        return row["value"] if row else None

    async def list_provider_profiles(self, user_id: int) -> list[AiProviderProfile]:
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
        profile_id = value.id or _id("profile")
        if value.id:
            existing = self.db.fetch_one(
                "SELECT id FROM ai_provider_profiles WHERE id = %s AND user_id = %s",
                (profile_id, user_id),
            )
            if not existing:
                raise AiDomainError("AI_RESOURCE_NOT_FOUND", "Provider profile not found.", status_code=404)
        if value.is_default:
            self.db.execute("UPDATE ai_provider_profiles SET is_default = 0 WHERE user_id = %s", (user_id,))
        self.db.execute(
            "INSERT INTO ai_provider_profiles "
            "(id, user_id, provider, name, base_url, model, api_key_ciphertext, api_key_hint, is_default) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s) "
            "ON DUPLICATE KEY UPDATE provider = VALUES(provider), name = VALUES(name), "
            "base_url = VALUES(base_url), model = VALUES(model), "
            "api_key_ciphertext = COALESCE(VALUES(api_key_ciphertext), api_key_ciphertext), "
            "api_key_hint = COALESCE(VALUES(api_key_hint), api_key_hint), is_default = VALUES(is_default)",
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
        rows = await self.list_provider_profiles(user_id)
        return next(profile for profile in rows if profile.id == profile_id)

    async def get_provider_profile_record(
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

    async def edit_message(self, user_id: int, message_id: str, content: str) -> AiMessage:
        row = self.db.fetch_one(
            "SELECT m.*, c.user_id FROM ai_messages m JOIN ai_conversations c ON c.id = m.conversation_id "
            "WHERE m.id = %s AND c.user_id = %s AND c.is_deleted = 0",
            (message_id, user_id),
        )
        if not row:
            raise AiDomainError("AI_RESOURCE_NOT_FOUND", "Message not found.", status_code=404)
        if row["role"] != "user":
            raise AiDomainError("AI_MESSAGE_NOT_EDITABLE", "Only user messages can be edited.", status_code=409)
        blocks = [AiTextBlock(text=content.strip())]
        self.db.execute(
            "DELETE FROM ai_messages WHERE conversation_id = %s AND sequence > %s",
            (row["conversation_id"], row["sequence"]),
        )
        self.db.execute(
            "UPDATE ai_messages SET blocks = %s, updated_at = CURRENT_TIMESTAMP(6) WHERE id = %s",
            (json.dumps([block.model_dump(mode="json") for block in blocks], ensure_ascii=False), message_id),
        )
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
