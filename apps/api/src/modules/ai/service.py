from __future__ import annotations

from typing import AsyncIterator
from uuid import uuid4

from .errors import AiDomainError
from .credentials import CredentialCipher
from .providers import ProviderConfig, ProviderRegistry
from .repositories import AiRepository
from .schemas import (
    AiProviderCatalogInput,
    AiProviderDescriptor,
    AiProviderProfileInput,
    AiRunRequest,
    AiStreamEvent,
    AiTextBlock,
)


def _id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex}"


def _provider_messages(conversation) -> list[dict[str, str]]:
    messages: list[dict[str, str]] = []
    for message in conversation.messages:
        if message.role not in {"system", "user", "assistant"}:
            continue
        content = "\n\n".join(
            block.text for block in message.blocks if isinstance(block, AiTextBlock)
        )
        if content:
            messages.append({"role": message.role, "content": content})
    return messages


MAX_GUEST_CONTEXT_MESSAGES = 40
MAX_GUEST_CONVERSATIONS = 512


class AiService:
    def __init__(
        self,
        repository: AiRepository,
        providers: ProviderRegistry,
        cipher: CredentialCipher | None = None,
    ):
        self.repository = repository
        self.providers = providers
        self.cipher = cipher or CredentialCipher(None)
        self._guest_transcripts: dict[str, list[dict[str, str]]] = {}

    def _remember_guest_transcript(
        self,
        conversation_id: str,
        messages: list[dict[str, str]],
    ) -> None:
        if conversation_id not in self._guest_transcripts:
            while len(self._guest_transcripts) >= MAX_GUEST_CONVERSATIONS:
                self._guest_transcripts.pop(next(iter(self._guest_transcripts)))
        self._guest_transcripts[conversation_id] = messages[-MAX_GUEST_CONTEXT_MESSAGES:]

    async def list_providers(self) -> list[AiProviderDescriptor]:
        method = getattr(self.repository, "list_provider_catalog", None)
        catalog = await method() if method is not None else []
        return [
            AiProviderDescriptor(
                id=item.id,
                name=item.name,
                default_base_url=item.default_base_url,
                default_model=item.default_model,
            )
            for item in catalog
            if item.is_enabled
        ]

    async def list_provider_catalog(self):
        method = getattr(self.repository, "list_provider_catalog", None)
        return await method() if method else []

    async def create_provider_catalog_entry(self, value: AiProviderCatalogInput):
        method = getattr(self.repository, "create_provider_catalog_entry", None)
        if method is None:
            raise AiDomainError("AI_PROVIDER_STORAGE_UNAVAILABLE", "Provider catalog storage is unavailable.", status_code=503)
        return await method(value)

    async def update_provider_catalog_entry(self, provider_id: str, value: AiProviderCatalogInput):
        method = getattr(self.repository, "update_provider_catalog_entry", None)
        if method is None:
            raise AiDomainError("AI_PROVIDER_STORAGE_UNAVAILABLE", "Provider catalog storage is unavailable.", status_code=503)
        return await method(provider_id, value)

    async def delete_provider_catalog_entry(self, provider_id: str) -> None:
        method = getattr(self.repository, "delete_provider_catalog_entry", None)
        if method is None:
            raise AiDomainError("AI_PROVIDER_STORAGE_UNAVAILABLE", "Provider catalog storage is unavailable.", status_code=503)
        await method(provider_id)

    async def list_provider_profiles(self, user_id: int):
        method = getattr(self.repository, "list_provider_profiles", None)
        return await method(user_id) if method else []

    async def save_provider_profile(self, user_id: int, profile: AiProviderProfileInput):
        method = getattr(self.repository, "save_provider_profile", None)
        if method is None:
            raise AiDomainError("AI_PROVIDER_STORAGE_UNAVAILABLE", "Provider profile storage is unavailable.", status_code=503)
        encrypted = self.cipher.encrypt(profile.api_key) if profile.api_key else None
        hint = self.cipher.hint(profile.api_key) if profile.api_key else None
        return await method(user_id, profile, encrypted, hint)

    async def list_conversations(self, user_id: int):
        return await self.repository.list_conversations(user_id)

    async def create_conversation(self, user_id: int):
        return await self.repository.create_conversation(user_id, "New chat")

    async def get_conversation(self, user_id: int, conversation_id: str):
        return await self.repository.get_conversation(user_id, conversation_id)

    async def edit_message(self, user_id: int, message_id: str, content: str):
        method = getattr(self.repository, "edit_message", None)
        if method is None:
            raise AiDomainError("AI_RESOURCE_NOT_FOUND", "Message not found.", status_code=404)
        return await method(user_id, message_id, content)

    async def set_feedback(self, user_id: int, message_id: str, value: str):
        await self.repository.set_feedback(user_id, message_id, None if value == "none" else value)

    async def _resolve_provider_config(
        self,
        user_id: int | None,
        profile_id: str | None,
    ) -> ProviderConfig:
        method = getattr(self.repository, "get_provider_profile_record", None)
        if user_id is not None and method is not None:
            record = await method(user_id, profile_id)
            if record:
                profile, encrypted_key = record
                return ProviderConfig(
                    provider=profile.provider,
                    model=profile.model,
                    base_url=profile.base_url,
                    api_key=(
                        self.cipher.decrypt(encrypted_key)
                        if encrypted_key
                        else None
                    ),
                )
        if profile_id and user_id is None:
            raise AiDomainError(
                "AI_AUTH_REQUIRED",
                "Sign in to use a personal provider profile.",
                status_code=401,
            )
        default_method = getattr(self.repository, "get_default_provider_record", None)
        default_record = await default_method() if default_method is not None else None
        if default_record:
            profile, encrypted_key = default_record
            return ProviderConfig(
                provider=profile.id,
                model=profile.default_model or "",
                base_url=profile.default_base_url or "",
                api_key=self.cipher.decrypt(encrypted_key),
            )
        raise AiDomainError(
            "AI_PROVIDER_NOT_CONFIGURED",
            "No default AI provider is configured.",
            status_code=503,
        )

    async def stream_run(
        self,
        user_id: int | None,
        request: AiRunRequest,
    ) -> AsyncIterator[AiStreamEvent]:
        if user_id is not None:
            if request.parent_message_id:
                edited = await self.edit_message(
                    user_id,
                    request.parent_message_id,
                    request.message,
                )
                conversation_id = edited.conversation_id
            elif request.conversation_id:
                conversation = await self.repository.get_conversation(user_id, request.conversation_id)
                conversation_id = conversation.id
                await self.repository.append_message(
                    user_id,
                    conversation_id,
                    "user",
                    [AiTextBlock(text=request.message)],
                )
            else:
                conversation = await self.repository.create_conversation(user_id, request.message[:48])
                conversation_id = conversation.id
                await self.repository.append_message(
                    user_id,
                    conversation_id,
                    "user",
                    [AiTextBlock(text=request.message)],
                )
            conversation = await self.repository.get_conversation(user_id, conversation_id)
            provider_messages = _provider_messages(conversation)
        else:
            conversation_id = request.conversation_id or _id("guest")
            provider_messages = [
                *self._guest_transcripts.get(conversation_id, []),
                {"role": "user", "content": request.message},
            ]

        message_id = _id("msg")
        sequence = 0
        try:
            config = await self._resolve_provider_config(user_id, request.provider_profile_id)
        except AiDomainError as error:
            yield AiStreamEvent(
                event_id=_id("evt"),
                type="run.failed",
                conversation_id=conversation_id,
                message_id=message_id,
                sequence=sequence,
                data={"code": error.code, "message": error.message, "retryable": False},
            )
            return

        yield AiStreamEvent(
            event_id=_id("evt"),
            type="run.started",
            conversation_id=conversation_id,
            message_id=message_id,
            sequence=sequence,
            data={"provider": config.provider, "model": config.model},
        )

        content = ""
        try:
            provider = self.providers.create(config)
            async for delta in provider.stream(provider_messages):
                content += delta
                sequence += 1
                yield AiStreamEvent(
                    event_id=_id("evt"),
                    type="content.delta",
                    conversation_id=conversation_id,
                    message_id=message_id,
                    sequence=sequence,
                    data={"delta": delta},
                )
            block = AiTextBlock(text=content)
            if user_id is not None:
                saved = await self.repository.append_message(
                    user_id,
                    conversation_id,
                    "assistant",
                    [block],
                )
                message_id = saved.id
            else:
                self._remember_guest_transcript(
                    conversation_id,
                    [*provider_messages, {"role": "assistant", "content": content}],
                )
            sequence += 1
            yield AiStreamEvent(
                event_id=_id("evt"),
                type="message.completed",
                conversation_id=conversation_id,
                message_id=message_id,
                sequence=sequence,
                data={"blocks": [block.model_dump(mode="json")]},
            )
        except AiDomainError as error:
            sequence += 1
            yield AiStreamEvent(
                event_id=_id("evt"),
                type="run.failed",
                conversation_id=conversation_id,
                message_id=message_id,
                sequence=sequence,
                data={
                    "code": error.code,
                    "message": error.message,
                    "retryable": error.status_code >= 429,
                },
            )
        except Exception:
            sequence += 1
            yield AiStreamEvent(
                event_id=_id("evt"),
                type="run.failed",
                conversation_id=conversation_id,
                message_id=message_id,
                sequence=sequence,
                data={
                    "code": "AI_PROVIDER_UNAVAILABLE",
                    "message": "The AI provider is temporarily unavailable. Please try again.",
                    "retryable": True,
                },
            )
