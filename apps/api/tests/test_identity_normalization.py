import sys
import unittest
from pathlib import Path


API_ROOT = Path(__file__).resolve().parents[1]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))


class IdentityNormalizationTests(unittest.TestCase):
    def test_mainland_phone_is_normalized_to_e164(self):
        from src.modules.identity.normalization import normalize_phone

        self.assertEqual(normalize_phone("138 0013 8000"), "+8613800138000")
        self.assertEqual(normalize_phone("0086-13800138000"), "+8613800138000")

    def test_ambiguous_local_phone_is_rejected(self):
        from src.modules.identity.errors import IdentityDomainError
        from src.modules.identity.normalization import normalize_phone

        with self.assertRaises(IdentityDomainError) as raised:
            normalize_phone("555-0123")

        self.assertEqual(raised.exception.code, "AUTH_CONTACT_INVALID")

    def test_email_is_normalized_and_masked(self):
        from src.modules.identity.normalization import mask_contact, normalize_email

        email = normalize_email(" Person@Example.COM ")
        self.assertEqual(email, "person@example.com")
        self.assertEqual(mask_contact("email", email), "p***@example.com")


if __name__ == "__main__":
    unittest.main()
