from dotenv import load_dotenv
from os import getenv

load_dotenv()

DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com"
DEFAULT_CHAT_MODEL = "deepseek-chat"
DEFAULT_MODEL_PROVIDER = "openai"

AI_BASE_URL = (
    getenv("DEEPSEEK_BASE_URL")
    or getenv("AI_URL")
    or DEFAULT_DEEPSEEK_BASE_URL
)
API_KEY = (
    getenv("DEEPSEEK_API_KEY")
    or getenv("OPENROUTER_API_KEY")
    or getenv("OPENAI_API_KEY")
)
TEST_MODEL = (
    getenv("DEEPSEEK_MODEL")
    or getenv("AI_CHAT_MODEL")
    or "mistralai/devstral-2512:free"
)
TEST_MODEL_PROVIDER = getenv("AI_MODEL_PROVIDER") or DEFAULT_MODEL_PROVIDER

LANGSMITH_TRACING = getenv("LANGSMITH_TRACING")
LANGSMITH_ENDPOINT = getenv("LANGSMITH_ENDPOINT")
LANGSMITH_API_KEY = getenv("LANGSMITH_API_KEY") or getenv("LANGCHAIN_API_KEY")
