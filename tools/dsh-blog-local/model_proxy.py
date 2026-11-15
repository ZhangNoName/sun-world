"""Synthetic preview's explicit keyless model; site mode uses its catalog."""

from src.modules.ai.model_proxy import StructuredModelProxy, messages_to_openai, response_to_messages
from src.modules.ai.public import create_keyless_validation_proxy

MODEL_LABEL = "qwen38_27b (本地验证 / 真实模型)"
model_proxy = create_keyless_validation_proxy()
