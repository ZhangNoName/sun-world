from dotenv import load_dotenv
from os import getenv
load_dotenv()
AI_BASE_URL = getenv("AI_URL")
API_KEY = getenv("OPENROUTER_API_KEY")
TEST_MODEL = "mistralai/devstral-2512:free"
TEST_MODEL_PROVIDER = "mistralai"


LANGSMITH_TRACING = getenv("LANGSMITH_TRACING")
LANGSMITH_ENDPOINT = getenv("LANGSMITH_ENDPOINT")
LANGSMITH_API_KEY = getenv("LANGSMITH_API_KEY") or getenv("LANGCHAIN_API_KEY")
