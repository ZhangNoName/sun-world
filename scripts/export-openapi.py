#!/usr/bin/env python3
"""Export the FastAPI OpenAPI schema for the Sun World API.

The production API module imports runtime managers and LLM models at module
import time. For schema generation we only need route declarations and Pydantic
models, so this script builds a schema-only FastAPI app and stubs runtime-only
objects that would otherwise require secrets or database/LLM setup.

It does not start uvicorn, run lifespan startup, initialize databases, connect
to LLM providers, or read secret env files.
"""

from __future__ import annotations

import argparse
import importlib
import json
import os
import sys
import types
from pathlib import Path
from typing import Any


def repo_root() -> Path:
    return Path(__file__).resolve().parents[1]


class _SchemaOnlyAiManager:
    """Placeholder used only for FastAPI dependency annotations."""

    async def invoke(self, *_args: Any, **_kwargs: Any) -> Any:
        raise RuntimeError("Schema-only AI manager cannot be used at runtime")

    async def invoke_stream(self, *_args: Any, **_kwargs: Any) -> Any:
        raise RuntimeError("Schema-only AI manager cannot be used at runtime")


class _SchemaOnlyModel:
    """Placeholder used only so AI routes can be imported for OpenAPI export."""

    @staticmethod
    async def ainvoke(*_args: Any, **_kwargs: Any) -> Any:
        raise RuntimeError("Schema-only model cannot be used at runtime")


def install_schema_stubs(schema_app: Any) -> None:
    app_instance = types.ModuleType("app_instance")
    app_instance.app = schema_app
    sys.modules["app_instance"] = app_instance

    ai_manager_module = types.ModuleType("src.controller.ai_manager")
    ai_manager_module.AiManager = _SchemaOnlyAiManager
    sys.modules["src.controller.ai_manager"] = ai_manager_module

    for module_name, export_name in {
        "src.llm.model.gemma": "GemmaModel",
        "src.llm.model.mistral_img": "MistralImgModel",
        "src.llm.model.qwen": "QwenModel",
    }.items():
        module = types.ModuleType(module_name)
        setattr(module, export_name, _SchemaOnlyModel)
        sys.modules[module_name] = module


def export_openapi(output: Path) -> None:
    root = repo_root()
    api_dir = root / "apps" / "api"

    sys.path.insert(0, str(api_dir))
    previous_cwd = Path.cwd()
    try:
        os.chdir(api_dir)
        from fastapi import FastAPI

        schema_app = FastAPI(title="Sun World API")
        install_schema_stubs(schema_app)

        routers_module = importlib.import_module("src.routers")
        routers = [
            routers_module.blog_router,
            routers_module.base_router,
            routers_module.user_router,
            routers_module.role_router,
            routers_module.resource_router,
            routers_module.auth_router,
            routers_module.ai_router,
            routers_module.file_router,
            routers_module.telemetry_router,
            routers_module.admin_router,
            routers_module.health_router,
        ]
        for router in routers:
            schema_app.include_router(router)

        schema = schema_app.openapi()
    finally:
        os.chdir(previous_cwd)

    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        json.dumps(schema, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    print(f"Exported OpenAPI schema to {output.relative_to(root)}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Export Sun World FastAPI OpenAPI schema")
    parser.add_argument(
        "--output",
        default="packages/contracts/openapi.json",
        help="Output path relative to the repository root",
    )
    args = parser.parse_args()

    output = repo_root() / args.output
    export_openapi(output)


if __name__ == "__main__":
    main()
