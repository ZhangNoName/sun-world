from .base import base_router
from .blog import blog_router
from .user import user_router
from .role import role_router
from .resource import resource_router
from .auth import auth_router
from .ai import ai_router
__all__ = ["base_router", "blog_router", "user_router",
           "role_router", "resource_router", "auth_router", "ai_router"]
