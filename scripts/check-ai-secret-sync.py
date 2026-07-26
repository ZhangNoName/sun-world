from __future__ import annotations

import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
SYNC_SCRIPT = ROOT / "deploy" / "backend" / "sync_ai_secrets.py"


class AiSecretSyncTest(unittest.TestCase):
    def run_sync(self, target: Path, *values: str) -> subprocess.CompletedProcess[bytes]:
        payload = b"\0".join(value.encode("utf-8") for value in values) + b"\0"
        return subprocess.run(
            [sys.executable, str(SYNC_SCRIPT), str(target)],
            input=payload,
            capture_output=True,
            check=False,
        )

    def test_replaces_only_ai_values_and_preserves_existing_secrets(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_dir:
            target = Path(temporary_dir) / "auth.env"
            target.write_text(
                "BLOG_JWT_SECRET=keep-me\n"
                "AI_CREDENTIAL_ENCRYPTION_KEY=old-encryption-key\n",
                encoding="utf-8",
            )

            result = self.run_sync(
                target,
                "new-encryption-key",
                "new-deepseek-key",
            )

            self.assertEqual(result.returncode, 0, result.stderr.decode("utf-8"))
            self.assertEqual(result.stdout, b"")
            content = target.read_text(encoding="utf-8")
            self.assertIn("BLOG_JWT_SECRET=keep-me\n", content)
            self.assertIn("AI_CREDENTIAL_ENCRYPTION_KEY=new-encryption-key\n", content)
            self.assertIn("DEEPSEEK_API_KEY=new-deepseek-key\n", content)
            self.assertEqual(content.count("AI_CREDENTIAL_ENCRYPTION_KEY="), 1)
            self.assertEqual(content.count("DEEPSEEK_API_KEY="), 1)
            if os.name != "nt":
                self.assertEqual(target.stat().st_mode & 0o777, 0o600)

    def test_rejects_an_empty_payload_without_modifying_the_file(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_dir:
            target = Path(temporary_dir) / "auth.env"
            original = "BLOG_JWT_SECRET=keep-me\n"
            target.write_text(original, encoding="utf-8")

            result = self.run_sync(target, "", "new-deepseek-key")

            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(result.stdout, b"")
            self.assertEqual(target.read_text(encoding="utf-8"), original)


if __name__ == "__main__":
    unittest.main()
