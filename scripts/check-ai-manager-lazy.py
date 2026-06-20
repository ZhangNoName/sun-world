#!/usr/bin/env python3
import ast
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
AI_MANAGER_PATH = REPO_ROOT / "apps/api/src/controller/ai_manager.py"
EAGER_PREFIXES = ("src.llm.agent", "src.llm.model")


def main() -> None:
    tree = ast.parse(AI_MANAGER_PATH.read_text(encoding="utf-8"))
    violations = []

    for node in tree.body:
        if isinstance(node, ast.ImportFrom):
            module = node.module or ""
            if module.startswith(EAGER_PREFIXES):
                violations.append(f"from {module} import ...")
        elif isinstance(node, ast.Import):
            for alias in node.names:
                if alias.name.startswith(EAGER_PREFIXES):
                    violations.append(f"import {alias.name}")

    if violations:
        joined = ", ".join(violations)
        raise SystemExit(
            "AiManager must lazy-load AI agents/models so API startup and "
            f"/healthz do not require provider keys. Found: {joined}"
        )

    print("AI manager lazy import check passed")


if __name__ == "__main__":
    main()
