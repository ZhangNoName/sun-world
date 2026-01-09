
from langchain.chat_models import init_chat_model
from src.llm.config import AI_BASE_URL, API_KEY, TEST_MODEL, TEST_MODEL_PROVIDER


# Initialize the model with OpenRouter's base URL
GemmaModel = init_chat_model(
    model='google/gemma-3-27b-it:free',
    model_provider='openai',
    base_url=AI_BASE_URL,
    api_key=API_KEY,
    temperature=0.5,
    timeout=10,
    max_tokens=1000
)
