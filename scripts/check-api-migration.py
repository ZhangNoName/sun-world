#!/usr/bin/env python3
"""Check that apps/api is safe to keep as a monorepo application.

This script intentionally avoids importing the FastAPI app. It performs syntax
checks and repository-boundary checks only, so it does not connect to databases,
start uvicorn, or read secret env files.
"""

from __future__ import annotations

import fnmatch
import py_compile
import subprocess
import sys
from pathlib import Path


REQUIRED_FILES = [
    "apps/api/main.py",
    "apps/api/app_instance.py",
    "apps/api/pyproject.toml",
    "apps/api/Dockerfile",
    "apps/api/start.sh",
    "apps/api/src/routers/health/health.py",
]

FORBIDDEN_TRACKED_PATTERNS = [
    "apps/api/.venv/*",
    "apps/api/**/__pycache__/*",
    "apps/api/**/*.pyc",
    "apps/api/**/*.pyo",
    "apps/api/**/*.env",
    "apps/api/**/.env",
    "apps/api/*.ipynb",
    "apps/api/**/*.ipynb",
    "apps/api/logs/*",
    "apps/api/uploads/*",
    "apps/api/runtime/*",
    "apps/api/src/conf/local.override.yml",
    "apps/api/src/conf/local.override.yaml",
]


def repo_root() -> Path:
    return Path(__file__).resolve().parents[1]


def git_ls_files(root: Path, pathspec: str) -> list[str]:
    result = subprocess.run(
        ["git", "ls-files", pathspec],
        cwd=root,
        check=True,
        text=True,
        capture_output=True,
    )
    return [line.strip().replace("\\", "/") for line in result.stdout.splitlines() if line.strip()]


def matches_any(path: str, patterns: list[str]) -> bool:
    return any(fnmatch.fnmatch(path, pattern) for pattern in patterns)


def check_required_files(root: Path) -> list[str]:
    missing = [path for path in REQUIRED_FILES if not (root / path).exists()]
    return [f"missing required file: {path}" for path in missing]


def check_forbidden_tracked_files(root: Path) -> list[str]:
    tracked = git_ls_files(root, "apps/api")
    forbidden = [
        path
        for path in tracked
        if (root / path).exists() and matches_any(path, FORBIDDEN_TRACKED_PATTERNS)
    ]
    return [f"forbidden tracked runtime/exploration file: {path}" for path in forbidden]


def check_health_routes(root: Path) -> list[str]:
    health_file = root / "apps/api/src/routers/health/health.py"
    text = health_file.read_text(encoding="utf-8")
    errors: list[str] = []
    for route in ('"/healthz"', '"/readyz"'):
        if route not in text:
            errors.append(f"health router does not declare {route}")
    return errors


def check_python_compiles(root: Path) -> list[str]:
    errors: list[str] = []
    files = [root / "apps/api/main.py", root / "apps/api/app_instance.py"]
    files.extend(sorted((root / "apps/api/src").rglob("*.py")))

    for file_path in files:
        try:
            py_compile.compile(str(file_path), doraise=True)
        except py_compile.PyCompileError as exc:
            rel = file_path.relative_to(root).as_posix()
            errors.append(f"{rel} failed to compile: {exc.msg}")
    return errors


def main() -> int:
    root = repo_root()
    checks = [
        *check_required_files(root),
        *check_forbidden_tracked_files(root),
        *check_health_routes(root),
        *check_python_compiles(root),
    ]

    if checks:
        print("API migration check failed:")
        for error in checks:
            print(f"- {error}")
        return 1

    py_files = len(list((root / "apps/api/src").rglob("*.py"))) + 2
    print(f"API migration check passed: {py_files} Python files compiled; repository boundary is clean.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
