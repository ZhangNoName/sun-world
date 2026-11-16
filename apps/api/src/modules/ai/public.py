"""Supported integration interface for model-aware application services."""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .openai_responses import OpenAiResponsesProxy

from src.core.runtime_env import is_local_runtime
from .agent_history import AgentHistoryTransactions, agent_answer_blocks
from .model_proxy import StructuredModelProxy, STRUCTURED_MODEL_LIMITS
from .providers import ProviderConfig


def create_keyless_validation_proxy() -> StructuredModelProxy:
    if not is_local_runtime():
        raise ValueError("Local model override is unavailable in production")
    proxy = StructuredModelProxy(ProviderConfig(
        provider="qwen-public", model="qwen38_27b",
        base_url="http://211.141.18.165:6195/v1", auth_mode="none",
    ))
    proxy.model_label = "qwen38_27b（本地测试模型）"
    return proxy


async def create_blog_qa_proxy(ai_service, *, local_model=None) -> StructuredModelProxy | OpenAiResponsesProxy:
    if local_model is not None:
        if local_model == "openai-local":
            from .local_openai import create_local_openai_proxy
            return create_local_openai_proxy()
        if local_model != "qwen-public":
            raise ValueError("Unapproved local test model")
        return create_keyless_validation_proxy()
    return StructuredModelProxy(await ai_service.resolve_agent_model())
