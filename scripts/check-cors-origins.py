#!/usr/bin/env python3
"""Check CORS compatibility and cookie-write origins stay deliberately separate."""
import ast
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
APP_INSTANCE = ROOT / "apps" / "api" / "app_instance.py"
DEPLOY_WORKFLOW = ROOT / ".github" / "workflows" / "deploy.yml"

CORS_REQUIRED_ORIGINS = [
    "https://sunworld.site",
    "https://www.sunworld.site",
    "https://zsf.shopping",
    "https://www.zsf.shopping",
]
CSRF_REQUIRED_ORIGINS = [
    "https://sunworld.site",
    "https://www.sunworld.site",
    "https://api.sunworld.site",
]
CSRF_FORBIDDEN_DEFAULTS = ["https://zsf.shopping", "https://www.zsf.shopping"]
LOCAL_CORS_ORIGINS = ["http://localhost:3030", "http://127.0.0.1:3030"]
LOCAL_CSRF_ORIGINS = [
    *LOCAL_CORS_ORIGINS,
    "http://localhost:8000",
    "http://127.0.0.1:8000",
]


def _literal_strings(node: ast.AST) -> list[str]:
    if not isinstance(node, ast.List):
        return []
    return [
        item.value
        for item in node.elts
        if isinstance(item, ast.Constant) and isinstance(item.value, str)
    ]


def _find_origin_defaults(function_name: str) -> tuple[list[str], list[str]]:
    module = ast.parse(APP_INSTANCE.read_text(encoding="utf-8"))

    for node in ast.walk(module):
        if not isinstance(node, ast.FunctionDef):
            continue
        if node.name != function_name:
            continue

        public_origins: list[str] = []
        local_origins: list[str] = []
        for child in ast.walk(node):
            if isinstance(child, ast.Assign) and any(
                isinstance(target, ast.Name) and target.id == "origins"
                for target in child.targets
            ):
                public_origins = _literal_strings(child.value) or public_origins
            if (
                isinstance(child, ast.Call)
                and isinstance(child.func, ast.Attribute)
                and isinstance(child.func.value, ast.Name)
                and child.func.value.id == "origins"
                and child.func.attr == "extend"
                and child.args
            ):
                local_origins = _literal_strings(child.args[0]) or local_origins
        if public_origins:
            return public_origins, local_origins

    raise AssertionError(f"Application.{function_name} default list not found")


def _assert_required_origins(
    label: str,
    values: str | list[str],
    required_origins: list[str],
) -> None:
    missing = [origin for origin in required_origins if origin not in values]
    if missing:
        raise AssertionError(f"{label} missing CORS origins: {', '.join(missing)}")


def main() -> None:
    cors_origins, local_cors_origins = _find_origin_defaults(
        "__get_allowed_origins"
    )
    _assert_required_origins(
        "apps/api/app_instance.py CORS defaults",
        cors_origins,
        CORS_REQUIRED_ORIGINS,
    )
    missing_local = [
        origin for origin in LOCAL_CORS_ORIGINS if origin not in local_cors_origins
    ]
    if missing_local:
        raise AssertionError(
            "apps/api/app_instance.py missing local-only CORS origins: "
            + ", ".join(missing_local)
        )
    leaked_local = [origin for origin in LOCAL_CORS_ORIGINS if origin in cors_origins]
    if leaked_local:
        raise AssertionError(
            "apps/api/app_instance.py enables local CORS origins outside local mode: "
            + ", ".join(leaked_local)
        )

    csrf_origins, local_csrf_origins = _find_origin_defaults(
        "__get_csrf_allowed_origins"
    )
    _assert_required_origins(
        "apps/api/app_instance.py CSRF defaults",
        csrf_origins,
        CSRF_REQUIRED_ORIGINS,
    )
    leaked_compatibility_origins = [
        origin for origin in CSRF_FORBIDDEN_DEFAULTS if origin in csrf_origins
    ]
    if leaked_compatibility_origins:
        raise AssertionError(
            "apps/api/app_instance.py grants default CSRF write authority to "
            "CORS-only compatibility origins: "
            + ", ".join(leaked_compatibility_origins)
        )
    missing_local_csrf = [
        origin for origin in LOCAL_CSRF_ORIGINS if origin not in local_csrf_origins
    ]
    if missing_local_csrf:
        raise AssertionError(
            "apps/api/app_instance.py missing local-only CSRF origins: "
            + ", ".join(missing_local_csrf)
        )

    workflow = DEPLOY_WORKFLOW.read_text(encoding="utf-8")
    _assert_required_origins(
        ".github/workflows/deploy.yml CORS config",
        workflow,
        CORS_REQUIRED_ORIGINS,
    )
    if "BLOG_CORS_ORIGINS=" not in workflow:
        raise AssertionError("deploy workflow must pass BLOG_CORS_ORIGINS to API containers")
    _assert_required_origins(
        ".github/workflows/deploy.yml CSRF config",
        workflow,
        CSRF_REQUIRED_ORIGINS,
    )
    if "AUTH_CSRF_ALLOWED_ORIGINS=" not in workflow:
        raise AssertionError(
            "deploy workflow must pass AUTH_CSRF_ALLOWED_ORIGINS to API containers"
        )

    print("CORS and CSRF origin policies are explicit and separate")


if __name__ == "__main__":
    main()
