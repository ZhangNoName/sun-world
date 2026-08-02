from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import AsyncIterator, Protocol

import httpx

from .errors import AiDomainError


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
    @staticmethod
    def create(config: ProviderConfig) -> AiProvider:
        return OpenAiCompatibleProvider(config)
