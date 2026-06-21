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
    os.environ["DEEPSEEK_API_KEY"] = "deepseek-secret-placeholder"
    os.environ["DEEPSEEK_BASE_URL"] = "https://api.deepseek.example"
    os.environ["DEEPSEEK_MODEL"] = "deepseek-chat"

    config = importlib.import_module("src.llm.config")

    if config.LANGSMITH_API_KEY != "fallback-langchain-token":
        raise AssertionError(
            "LANGSMITH_API_KEY should fall back to LANGCHAIN_API_KEY"
        )

    if config.API_KEY != "deepseek-secret-placeholder":
        raise AssertionError("API_KEY should prefer DEEPSEEK_API_KEY")

    if config.AI_BASE_URL != "https://api.deepseek.example":
        raise AssertionError("AI_BASE_URL should prefer DEEPSEEK_BASE_URL")

    if config.TEST_MODEL != "deepseek-chat":
        raise AssertionError("TEST_MODEL should prefer DEEPSEEK_MODEL")

    source = (API_ROOT / "src" / "llm" / "config.py").read_text(encoding="utf-8")
    for name in [
        "DEEPSEEK_API_KEY",
        "DEEPSEEK_BASE_URL",
        "DEEPSEEK_MODEL",
        "OPENAI_API_KEY",
        "AI_CHAT_MODEL",
    ]:
        if name not in source:
            raise AssertionError(f"src.llm.config must support {name}")

    print("LLM config env check passed.")


if __name__ == "__main__":
    main()
