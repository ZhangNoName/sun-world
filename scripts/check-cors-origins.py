#!/usr/bin/env python3
"""Check the API CORS allowlist keeps public frontend domains enabled."""
import ast
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
APP_INSTANCE = ROOT / "apps" / "api" / "app_instance.py"
DEPLOY_WORKFLOW = ROOT / ".github" / "workflows" / "deploy.yml"

REQUIRED_ORIGINS = [
    "https://sunworld.site",
    "https://www.sunworld.site",
    "https://zsf.shopping",
    "https://www.zsf.shopping",
]


def _find_allowed_origins_default() -> list[str]:
    module = ast.parse(APP_INSTANCE.read_text(encoding="utf-8"))

    for node in ast.walk(module):
        if not isinstance(node, ast.FunctionDef):
            continue
        if node.name != "__get_allowed_origins":
            continue

        for child in ast.walk(node):
            if not isinstance(child, ast.Return):
                continue
            if not isinstance(child.value, ast.List):
                continue

            origins = []
            for item in child.value.elts:
                if isinstance(item, ast.Constant) and isinstance(item.value, str):
                    origins.append(item.value)
            if origins:
                return origins

    raise AssertionError("Application.__get_allowed_origins default list not found")


def _assert_required_origins(label: str, values: str | list[str]) -> None:
    missing = [origin for origin in REQUIRED_ORIGINS if origin not in values]
    if missing:
        raise AssertionError(f"{label} missing CORS origins: {', '.join(missing)}")


def main() -> None:
    _assert_required_origins("apps/api/app_instance.py", _find_allowed_origins_default())

    workflow = DEPLOY_WORKFLOW.read_text(encoding="utf-8")
    _assert_required_origins(".github/workflows/deploy.yml", workflow)
    if "BLOG_CORS_ORIGINS=" not in workflow:
        raise AssertionError("deploy workflow must pass BLOG_CORS_ORIGINS to API containers")

    print("CORS origins include public frontend domains")


if __name__ == "__main__":
    main()
