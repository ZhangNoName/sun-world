import importlib
import os
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
API_ROOT = REPO_ROOT / "apps" / "api"
sys.path.insert(0, str(API_ROOT))


def main() -> None:
    os.environ.pop("LANGSMITH_API_KEY", None)
    os.environ["LANGCHAIN_API_KEY"] = "fallback-langchain-token"

    config = importlib.import_module("src.llm.config")

    if config.LANGSMITH_API_KEY != "fallback-langchain-token":
        raise AssertionError(
            "LANGSMITH_API_KEY should fall back to LANGCHAIN_API_KEY"
        )

    print("LLM config env check passed.")


if __name__ == "__main__":
    main()
