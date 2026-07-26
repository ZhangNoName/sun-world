import sys
import unittest
from pathlib import Path

from cryptography.fernet import Fernet


API_ROOT = Path(__file__).resolve().parents[1]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))


class CredentialCipherTests(unittest.TestCase):
    def test_encrypts_keys_and_never_exposes_plaintext_in_ciphertext(self):
        from src.modules.ai.credentials import CredentialCipher

        cipher = CredentialCipher(Fernet.generate_key().decode("ascii"))
        encrypted = cipher.encrypt("sk-private-value")

        self.assertNotIn("sk-private-value", encrypted)
        self.assertEqual(cipher.decrypt(encrypted), "sk-private-value")
        self.assertEqual(cipher.hint("sk-private-value"), "••••alue")

    def test_missing_encryption_key_has_actionable_domain_code(self):
        from src.modules.ai.credentials import CredentialCipher
        from src.modules.ai.errors import AiDomainError

        cipher = CredentialCipher(None)

        with self.assertRaises(AiDomainError) as caught:
            cipher.encrypt("sk-private-value")
        self.assertEqual(caught.exception.code, "AI_CREDENTIAL_ENCRYPTION_UNAVAILABLE")


if __name__ == "__main__":
    unittest.main()
