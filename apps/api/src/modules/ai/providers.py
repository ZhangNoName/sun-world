from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from typing import AsyncIterator, Mapping, Protocol

import httpx

from .errors import AiDomainError
from .schemas import AiProviderDescriptor


@dataclass(frozen=True)
class ProviderConfig:
    provider: str
    model: str
    base_url: str
    api_key: str | None = field(default=None, repr=False)


class AiProvider(Protocol):
    async def stream(self, messages: list[dict[str, str]]) -> AsyncIterator[str]: ...


class OpenAiCompatibleProvider:
    def __init__(self, config: ProviderConfig):
        self.config = config

    async def stream(self, messages: list[dict[str, str]]) -> AsyncIterator[str]:
        if not self.config.api_key:
            raise AiDomainError(
                "AI_PROVIDER_NOT_CONFIGURED",
                "The selected AI provider does not have an API key.",
                status_code=503,
            )
        endpoint = f"{self.config.base_url.rstrip('/')}/chat/completions"
        headers = {"Authorization": f"Bearer {self.config.api_key}"}
        payload = {"model": self.config.model, "messages": messages, "stream": True}
        try:
            async with httpx.AsyncClient(timeout=90) as client:
                async with client.stream("POST", endpoint, headers=headers, json=payload) as response:
                    if response.status_code == 429:
                        raise AiDomainError(
                            "AI_RATE_LIMITED",
                            "The AI provider is busy. Try again shortly.",
                            status_code=429,
                        )
                    if response.status_code >= 400:
                        raise AiDomainError(
                            "AI_PROVIDER_UNAVAILABLE",
                            "The AI provider could not complete this request.",
                            status_code=502,
                        )
                    async for raw_line in response.aiter_lines():
                        if not raw_line.startswith("data:"):
                            continue
                        raw = raw_line.removeprefix("data:").strip()
                        if raw == "[DONE]":
                            break
                        try:
                            body = json.loads(raw)
                            delta = body["choices"][0]["delta"].get("content")
                        except (KeyError, IndexError, TypeError, json.JSONDecodeError):
                            continue
                        if isinstance(delta, str) and delta:
                            yield delta
        except AiDomainError:
            raise
        except (httpx.HTTPError, OSError) as exc:
            raise AiDomainError(
                "AI_PROVIDER_UNAVAILABLE",
                "The AI provider is temporarily unavailable.",
                status_code=502,
            ) from exc


class ProviderRegistry:
    def __init__(self, environment: Mapping[str, str] | None = None):
        self.environment = environment if environment is not None else os.environ

    def list_descriptors(self) -> list[AiProviderDescriptor]:
        return [
            AiProviderDescriptor(
                id="deepseek",
                name="DeepSeek",
                default_base_url="https://api.deepseek.com",
                default_model="deepseek-chat",
            ),
            AiProviderDescriptor(
                id="openai",
                name="OpenAI",
                default_base_url="https://api.openai.com/v1",
                default_model="gpt-4.1-mini",
            ),
            AiProviderDescriptor(
                id="openrouter",
                name="OpenRouter",
                default_base_url="https://openrouter.ai/api/v1",
            ),
            AiProviderDescriptor(id="openai-compatible", name="OpenAI compatible"),
        ]

    def resolve_default(self) -> ProviderConfig:
        env = self.environment
        if env.get("DEEPSEEK_API_KEY"):
            return ProviderConfig(
                provider="deepseek",
                model=env.get("DEEPSEEK_MODEL") or env.get("AI_CHAT_MODEL") or "deepseek-chat",
                base_url=env.get("DEEPSEEK_BASE_URL") or env.get("AI_URL") or "https://api.deepseek.com",
                api_key=env["DEEPSEEK_API_KEY"],
            )
        if env.get("OPENROUTER_API_KEY"):
            return ProviderConfig(
                provider="openrouter",
                model=env.get("OPENROUTER_MODEL") or env.get("AI_CHAT_MODEL") or "openai/gpt-4.1-mini",
                base_url=env.get("OPENROUTER_BASE_URL") or env.get("AI_URL") or "https://openrouter.ai/api/v1",
                api_key=env["OPENROUTER_API_KEY"],
            )
        if env.get("OPENAI_API_KEY"):
            return ProviderConfig(
                provider="openai",
                model=env.get("OPENAI_MODEL") or env.get("AI_CHAT_MODEL") or "gpt-4.1-mini",
                base_url=env.get("OPENAI_BASE_URL") or env.get("AI_URL") or "https://api.openai.com/v1",
                api_key=env["OPENAI_API_KEY"],
            )
        return ProviderConfig(
            provider="deepseek",
            model=env.get("DEEPSEEK_MODEL") or env.get("AI_CHAT_MODEL") or "deepseek-chat",
            base_url=env.get("DEEPSEEK_BASE_URL") or env.get("AI_URL") or "https://api.deepseek.com",
            api_key=None,
        )

    @staticmethod
    def create(config: ProviderConfig) -> AiProvider:
        return OpenAiCompatibleProvider(config)
