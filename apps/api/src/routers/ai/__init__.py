from fastapi import APIRouter

from src.modules.ai.router import router as ai_v1_router

from .ai import router as legacy_ai_router


ai_router = APIRouter()
ai_router.include_router(legacy_ai_router)
ai_router.include_router(ai_v1_router)

__all__ = ["ai_router"]
