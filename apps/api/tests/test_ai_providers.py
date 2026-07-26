import sys
import unittest
from pathlib import Path


API_ROOT = Path(__file__).resolve().parents[1]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))


class ProviderRegistryTests(unittest.TestCase):
    def test_resolves_deepseek_as_default_without_initializing_a_client(self):
        from src.modules.ai.providers import ProviderRegistry

        registry = ProviderRegistry(
            {
                "DEEPSEEK_API_KEY": "sk-default-secret",
                "DEEPSEEK_BASE_URL": "https://api.deepseek.example/v1",
                "DEEPSEEK_MODEL": "deepseek-chat-test",
            }
        )

        config = registry.resolve_default()

        self.assertEqual(config.provider, "deepseek")
        self.assertEqual(config.model, "deepseek-chat-test")
        self.assertEqual(config.base_url, "https://api.deepseek.example/v1")
        self.assertNotIn("sk-default-secret", repr(config))

    def test_normalizes_supported_compatible_providers(self):
        from src.modules.ai.providers import ProviderRegistry

        registry = ProviderRegistry({})
        descriptors = registry.list_descriptors()

        self.assertEqual(
            [item.id for item in descriptors],
            ["deepseek", "openai", "openrouter", "openai-compatible"],
        )

    def test_uses_openrouter_endpoint_when_it_is_the_only_default_key(self):
        from src.modules.ai.providers import ProviderRegistry

        config = ProviderRegistry(
            {
                "OPENROUTER_API_KEY": "sk-router",
                "OPENROUTER_MODEL": "openai/gpt-4.1-mini",
            }
        ).resolve_default()

        self.assertEqual(config.provider, "openrouter")
        self.assertEqual(config.base_url, "https://openrouter.ai/api/v1")
        self.assertEqual(config.model, "openai/gpt-4.1-mini")


if __name__ == "__main__":
    unittest.main()
