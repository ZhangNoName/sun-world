"""Supported integration interface for model-aware application services."""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .openai_responses import OpenAiResponsesProxy

from src.core.runtime_env import is_local_runtime
from .agent_history import AgentHistoryTransactions, agent_answer_blocks
from .model_proxy import StructuredModelProxy, STRUCTURED_MODEL_LIMITS
from .model_input import MODEL_INPUT_LIMITS, ModelInputMetadata
from .providers import ProviderConfig
from .schemas import AiStreamEvent, encode_sse_event
from .schemas import AiProviderCatalog, AiProviderCatalogInput
from .errors import AiDomainError
from .service import AiService
from .run_metrics import AiRunMetricsSnapshot


def get_ai_run_metrics_snapshot() -> AiRunMetricsSnapshot:
    """Read the same process collector without publishing its mutation API."""
    from .run_metrics import ai_run_metrics
    return ai_run_metrics.snapshot()


def is_counted_model_proxy(proxy) -> bool:
    from .openai_responses import OpenAiResponsesProxy
    return isinstance(proxy, OpenAiResponsesProxy)


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


__all__ = [
    'AgentHistoryTransactions', 'agent_answer_blocks', 'StructuredModelProxy',
    'STRUCTURED_MODEL_LIMITS', 'MODEL_INPUT_LIMITS', 'ModelInputMetadata',
    'ProviderConfig', 'AiStreamEvent', 'encode_sse_event', 'is_counted_model_proxy',
    'create_keyless_validation_proxy', 'create_blog_qa_proxy',
    'AiService', 'AiProviderCatalog', 'AiProviderCatalogInput', 'AiDomainError',
    'AiRunMetricsSnapshot', 'get_ai_run_metrics_snapshot',
]
