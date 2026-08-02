import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch


API_ROOT = Path(__file__).resolve().parents[1]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))


class ApplicationConfigTests(unittest.TestCase):
    def test_local_config_credential_key_takes_precedence_over_environment(self):
        from app_instance import get_credential_encryption_key

        with patch.dict(
            os.environ,
            {"AI_CREDENTIAL_ENCRYPTION_KEY": "environment-key"},
            clear=False,
        ):
            key = get_credential_encryption_key(
                {"ai": {"credential_encryption_key": "local-config-key"}}
            )

        self.assertEqual(key, "local-config-key")


if __name__ == "__main__":
    unittest.main()
