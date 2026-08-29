from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
IMPORT_SCRIPT = ROOT / "deploy" / "backend" / "import_google_oauth_client.py"
REDIRECT_URI = "https://api.sunworld.site/auth/oauth/google/callback"
PROJECT_ID = "sun-world-507015"
CLIENT_ID = "synthetic-client.apps.googleusercontent.com"
CLIENT_SECRET = "synthetic-client-secret"


class GoogleOAuthImportTest(unittest.TestCase):
    def make_target(self, directory: str, content: str) -> Path:
        target = Path(directory) / "auth.env"
        target.write_text(content, encoding="utf-8")
        target.chmod(0o600)
        return target

    def payload(
        self,
        *,
        client_id: str = CLIENT_ID,
        client_secret: str = CLIENT_SECRET,
        project_id: str = PROJECT_ID,
        redirect_uris: list[str] | None = None,
        client_type: str = "web",
    ) -> bytes:
        return json.dumps(
            {
                client_type: {
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "project_id": project_id,
                    "redirect_uris": redirect_uris or [REDIRECT_URI],
                }
            }
        ).encode("utf-8")

    def run_import(
        self,
        target: Path,
        payload: bytes,
    ) -> subprocess.CompletedProcess[bytes]:
        return subprocess.run(
            [sys.executable, str(IMPORT_SCRIPT), str(target)],
            input=payload,
            capture_output=True,
            check=False,
        )

    def run_rollback(self, target: Path) -> subprocess.CompletedProcess[bytes]:
        return subprocess.run(
            [sys.executable, str(IMPORT_SCRIPT), "--rollback", str(target)],
            input=b"",
            capture_output=True,
            check=False,
        )

    def test_import_preserves_other_keys_and_creates_private_rollback(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_dir:
            original = (
                "# existing values\n"
                "BLOG_JWT_SECRET=keep-me\n"
                "AUTH_GOOGLE_CLIENT_ID=old-client.apps.googleusercontent.com\n"
                "export AUTH_GOOGLE_CLIENT_SECRET=old-secret\n"
                "AUTH_GOOGLE_CLIENT_SECRET=duplicate-secret\n"
            )
            target = self.make_target(temporary_dir, original)

            result = self.run_import(target, self.payload())

            self.assertEqual(result.returncode, 0, result.stderr.decode("utf-8"))
            self.assertEqual(result.stdout, b"")
            self.assertEqual(result.stderr, b"")
            updated = target.read_text(encoding="utf-8")
            self.assertIn("BLOG_JWT_SECRET=keep-me\n", updated)
            self.assertIn(f"AUTH_GOOGLE_CLIENT_ID={CLIENT_ID}\n", updated)
            self.assertIn(f"AUTH_GOOGLE_CLIENT_SECRET={CLIENT_SECRET}\n", updated)
            self.assertEqual(updated.count("AUTH_GOOGLE_CLIENT_ID="), 1)
            self.assertEqual(updated.count("AUTH_GOOGLE_CLIENT_SECRET="), 1)

            backup = Path(temporary_dir) / ".auth.env.google-oauth.rollback"
            self.assertEqual(
                backup.read_text(encoding="utf-8"),
                "AUTH_GOOGLE_CLIENT_ID=old-client.apps.googleusercontent.com\n"
                "export AUTH_GOOGLE_CLIENT_SECRET=old-secret\n",
            )
            self.assertNotIn(
                "BLOG_JWT_SECRET=keep-me",
                backup.read_text(encoding="utf-8"),
            )
            if os.name != "nt":
                self.assertEqual(target.stat().st_mode & 0o777, 0o600)
                self.assertEqual(backup.stat().st_mode & 0o777, 0o600)

    def test_rollback_restores_only_google_keys_and_keeps_other_changes(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_dir:
            original = "BLOG_JWT_SECRET=keep-me\n"
            target = self.make_target(temporary_dir, original)
            imported = self.run_import(target, self.payload())
            self.assertEqual(imported.returncode, 0)
            backup = Path(temporary_dir) / ".auth.env.google-oauth.rollback"
            self.assertEqual(backup.read_bytes(), b"")
            target.write_text(
                target.read_text(encoding="utf-8").replace(
                    "BLOG_JWT_SECRET=keep-me",
                    "BLOG_JWT_SECRET=changed-after-import",
                ),
                encoding="utf-8",
            )
            target.chmod(0o600)

            result = self.run_rollback(target)

            self.assertEqual(result.returncode, 0, result.stderr.decode("utf-8"))
            self.assertEqual(result.stdout, b"")
            self.assertEqual(result.stderr, b"")
            self.assertEqual(
                target.read_text(encoding="utf-8"),
                "BLOG_JWT_SECRET=changed-after-import\n",
            )

    def test_rejects_installed_client_without_modifying_target(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_dir:
            original = "BLOG_JWT_SECRET=keep-me\n"
            target = self.make_target(temporary_dir, original)

            result = self.run_import(
                target,
                self.payload(client_type="installed"),
            )

            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(target.read_text(encoding="utf-8"), original)
            self.assertFalse(
                (Path(temporary_dir) / ".auth.env.google-oauth.rollback").exists()
            )

    def test_rejects_missing_production_redirect_without_modifying_target(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_dir:
            original = "BLOG_JWT_SECRET=keep-me\n"
            target = self.make_target(temporary_dir, original)

            result = self.run_import(
                target,
                self.payload(redirect_uris=["http://localhost/callback"]),
            )

            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(target.read_text(encoding="utf-8"), original)

    def test_rejects_additional_redirect_uri_without_modifying_target(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_dir:
            original = "BLOG_JWT_SECRET=keep-me\n"
            target = self.make_target(temporary_dir, original)

            result = self.run_import(
                target,
                self.payload(
                    redirect_uris=[
                        REDIRECT_URI,
                        "https://unreviewed.example/oauth/callback",
                    ]
                ),
            )

            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(target.read_text(encoding="utf-8"), original)
            self.assertFalse(
                (Path(temporary_dir) / ".auth.env.google-oauth.rollback").exists()
            )

    def test_rejects_a_different_google_project_without_modifying_target(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_dir:
            original = "BLOG_JWT_SECRET=keep-me\n"
            target = self.make_target(temporary_dir, original)

            result = self.run_import(
                target,
                self.payload(project_id="different-project"),
            )

            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(target.read_text(encoding="utf-8"), original)
            self.assertFalse(
                (Path(temporary_dir) / ".auth.env.google-oauth.rollback").exists()
            )

    @unittest.skipIf(os.name == "nt", "Unix file modes are required in production")
    def test_rejects_an_overly_permissive_target(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_dir:
            original = "BLOG_JWT_SECRET=keep-me\n"
            target = self.make_target(temporary_dir, original)
            target.chmod(0o644)

            result = self.run_import(target, self.payload())

            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(target.read_text(encoding="utf-8"), original)
            self.assertEqual(target.stat().st_mode & 0o777, 0o644)

    def test_failure_output_never_contains_client_values(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_dir:
            target = self.make_target(temporary_dir, "BLOG_JWT_SECRET=keep-me\n")
            bad_secret = "synthetic secret with spaces"

            result = self.run_import(
                target,
                self.payload(client_secret=bad_secret),
            )

            self.assertNotEqual(result.returncode, 0)
            combined_output = result.stdout + result.stderr
            self.assertNotIn(CLIENT_ID.encode("utf-8"), combined_output)
            self.assertNotIn(bad_secret.encode("utf-8"), combined_output)


if __name__ == "__main__":
    unittest.main()
