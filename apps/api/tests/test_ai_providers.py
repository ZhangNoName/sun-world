import sys
import unittest
from pathlib import Path


API_ROOT = Path(__file__).resolve().parents[1]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))


class ProviderRegistryTests(unittest.TestCase):
    def test_creates_an_openai_compatible_provider_from_a_resolved_config(self):
        from src.modules.ai.providers import (
            OpenAiCompatibleProvider,
            ProviderConfig,
            ProviderRegistry,
        )

        config = ProviderConfig(
            provider="deepseek",
            model="deepseek-chat",
            base_url="https://api.deepseek.com",
            api_key="sk-global-secret",
        )

        provider = ProviderRegistry.create(config)

        self.assertIsInstance(provider, OpenAiCompatibleProvider)
        self.assertEqual(provider.config, config)


if __name__ == "__main__":
    unittest.main()
