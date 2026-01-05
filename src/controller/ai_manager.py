import os
from typing import Optional
from loguru import logger
from langchain.chat_models import init_chat_model
from langchain_core.messages import BaseMessage


class AiManager:
    def __init__(
        self,
        base_url: Optional[str] = None,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        model_provider: Optional[str] = None,
    ):
        """
        初始化 AI Manager
        
        Args:
            base_url: AI API 的基础 URL，默认从环境变量 AI_URL 读取
            api_key: API 密钥，默认从环境变量 OPENROUTER_API_KEY 读取
            model: 模型名称，默认 "mistralai/devstral-2512:free"
            model_provider: 模型提供商，默认 "mistralai"
        """
        self.base_url = base_url or os.getenv("AI_URL")
        self.api_key = api_key or os.getenv("OPENROUTER_API_KEY")
        self.model = model or os.getenv("AI_MODEL", "mistralai/devstral-2512:free")
        self.model_provider = model_provider or os.getenv("AI_MODEL_PROVIDER", "mistralai")
        
        # LangSmith 配置（可选）
        self.langsmith_tracing = os.getenv("LANGSMITH_TRACING")
        self.langsmith_endpoint = os.getenv("LANGSMITH_ENDPOINT")
        self.langsmith_api_key = os.getenv("LANGSMITH_API_KEY")
        
        self._model = None
        self._initialize_model()
    
    def _initialize_model(self):
        """初始化聊天模型"""
        if not self.base_url or not self.api_key:
            logger.warning("AI_BASE_URL 或 API_KEY 未设置，AI 功能将不可用")
            return
        
        try:
            self._model = init_chat_model(
                model=self.model,
                model_provider=self.model_provider,
                base_url=self.base_url,
                api_key=self.api_key,
            )
            logger.info(f"AI 模型初始化成功: {self.model}")
        except Exception as e:
            logger.error(f"AI 模型初始化失败: {e}")
            self._model = None
    
    def get_ai_response(self, prompt: str) -> str:
        """
        获取 AI 响应
        
        Args:
            prompt: 用户输入的提示词
            
        Returns:
            AI 的响应文本
            
        Raises:
            RuntimeError: 如果模型未初始化
        """
        if self._model is None:
            raise RuntimeError("AI 模型未初始化，请检查配置")
        
        try:
            response = self._model.invoke(prompt)
            if isinstance(response, BaseMessage):
                return response.content
            return str(response)
        except Exception as e:
            logger.error(f"获取 AI 响应失败: {e}")
            raise
    
    def invoke(self, message: str):
        """
        调用 AI 模型（兼容 langchain 接口）
        
        Args:
            message: 用户消息
            
        Returns:
            AI 响应消息对象
        """
        if self._model is None:
            raise RuntimeError("AI 模型未初始化，请检查配置")
        
        return self._model.invoke(message)