"""Explicit API composition root; importing this does not enable Agent runs."""

from src.core.module_registry import ModuleRegistry
from src.modules.blog.manifest import BLOG_MANIFEST, BLOG_SCHEMAS


def create_module_registry() -> ModuleRegistry:
    return ModuleRegistry((BLOG_MANIFEST,), BLOG_SCHEMAS)
