import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch


API_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = API_ROOT.parents[1]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))


class ApplicationOriginConfigTests(unittest.TestCase):
    def test_runtime_mode_is_independent_from_yaml_config_profile(self):
        from src.core.runtime_env import get_runtime_environment

        with patch.dict(
            os.environ,
            {"ENV": "local", "BLOG_RUNTIME_ENV": "production"},
            clear=False,
        ):
            self.assertEqual(get_runtime_environment(), "production")

    def test_production_defaults_never_trust_loopback_browser_origins(self):
        from app_instance import Application

        with patch.dict(
            os.environ,
            {"ENV": "production", "BLOG_RUNTIME_ENV": "production"},
            clear=True,
        ):
            origins = Application._Application__get_allowed_origins()

        self.assertNotIn("http://localhost:3030", origins)
        self.assertNotIn("http://127.0.0.1:3030", origins)
        self.assertIn("https://sunworld.site", origins)

    def test_local_defaults_include_the_local_frontend_origins(self):
        from app_instance import Application

        with patch.dict(
            os.environ,
            {"ENV": "local", "BLOG_RUNTIME_ENV": "local"},
            clear=True,
        ):
            origins = Application._Application__get_allowed_origins()

        self.assertIn("http://localhost:3030", origins)
        self.assertIn("http://127.0.0.1:3030", origins)

    def test_credentialed_cors_rejects_an_explicit_wildcard(self):
        from app_instance import Application

        with patch.dict(
            os.environ,
            {
                "BLOG_RUNTIME_ENV": "production",
                "BLOG_CORS_ORIGINS": "https://sunworld.site, *",
            },
            clear=True,
        ):
            with self.assertRaisesRegex(
                RuntimeError,
                r"BLOG_CORS_ORIGINS must not contain '\*'",
            ):
                Application._Application__get_allowed_origins()

    def test_production_csrf_defaults_exclude_cors_compatibility_domains(self):
        from app_instance import Application

        with patch.dict(
            os.environ,
            {"ENV": "production", "BLOG_RUNTIME_ENV": "production"},
            clear=True,
        ):
            origins = Application._Application__get_csrf_allowed_origins()

        self.assertEqual(
            origins,
            [
                "https://sunworld.site",
                "https://www.sunworld.site",
                "https://api.sunworld.site",
            ],
        )
        self.assertNotIn("https://zsf.shopping", origins)
        self.assertNotIn("https://www.zsf.shopping", origins)

    def test_explicit_csrf_allowlist_does_not_inherit_cors_origins(self):
        from app_instance import Application

        with patch.dict(
            os.environ,
            {
                "BLOG_RUNTIME_ENV": "production",
                "BLOG_CORS_ORIGINS": (
                    "https://sunworld.site,https://zsf.shopping"
                ),
                "AUTH_CSRF_ALLOWED_ORIGINS": (
                    "https://sunworld.site,https://api.sunworld.site"
                ),
            },
            clear=True,
        ):
            origins = Application._Application__get_csrf_allowed_origins()

        self.assertEqual(
            origins,
            ["https://sunworld.site", "https://api.sunworld.site"],
        )

    def test_local_csrf_defaults_include_local_frontend_and_api_origins(self):
        from app_instance import Application

        with patch.dict(
            os.environ,
            {"ENV": "local", "BLOG_RUNTIME_ENV": "local"},
            clear=True,
        ):
            origins = Application._Application__get_csrf_allowed_origins()

        self.assertIn("http://localhost:3030", origins)
        self.assertIn("http://127.0.0.1:3030", origins)
        self.assertIn("http://localhost:8000", origins)
        self.assertIn("http://127.0.0.1:8000", origins)

    def test_csrf_allowlist_rejects_a_wildcard(self):
        from app_instance import Application

        with patch.dict(
            os.environ,
            {
                "BLOG_RUNTIME_ENV": "production",
                "AUTH_CSRF_ALLOWED_ORIGINS": "*",
            },
            clear=True,
        ):
            with self.assertRaisesRegex(
                RuntimeError,
                r"AUTH_CSRF_ALLOWED_ORIGINS must not contain '\*'",
            ):
                Application._Application__get_csrf_allowed_origins()


class DeploymentRuntimeModeTests(unittest.TestCase):
    def test_api_start_defaults_config_profile_and_runtime_mode_independently(self):
        start_script = (REPO_ROOT / "apps/api/start.sh").read_text(
            encoding="utf-8"
        )

        self.assertIn('export ENV="${ENV:-local}"', start_script)
        self.assertIn(
            'export BLOG_RUNTIME_ENV="${BLOG_RUNTIME_ENV:-production}"',
            start_script,
        )
        self.assertNotIn('BLOG_RUNTIME_ENV="${BLOG_RUNTIME_ENV:-$ENV}"', start_script)
        self.assertNotIn('ENV="${ENV:-$BLOG_RUNTIME_ENV}"', start_script)

    def test_production_deploy_explicitly_sets_runtime_security_mode(self):
        workflow = (
            REPO_ROOT / ".github/workflows/deploy.yml"
        ).read_text(encoding="utf-8")

        runtime_setting = "-e BLOG_RUNTIME_ENV=production"
        api_environment = workflow.index("API_ENV=(")
        candidate_container = workflow.index("sun-world-api-candidate", api_environment)
        production_container = workflow.index(
            "--name sun-world-api --network host", candidate_container
        )

        self.assertIn(
            runtime_setting,
            workflow[api_environment:candidate_container],
        )
        self.assertIn(
            '"${API_ENV[@]}"',
            workflow[candidate_container:production_container],
        )
        self.assertIn(
            '"${API_ENV[@]}"',
            workflow[production_container:],
        )

    def test_production_deploy_separates_cors_and_csrf_origins(self):
        workflow = (
            REPO_ROOT / ".github/workflows/deploy.yml"
        ).read_text(encoding="utf-8")

        self.assertIn(
            'API_CORS_ORIGINS="https://sunworld.site,https://www.sunworld.site,'
            'https://zsf.shopping,https://www.zsf.shopping"',
            workflow,
        )
        self.assertIn(
            'API_CSRF_ALLOWED_ORIGINS="https://sunworld.site,'
            'https://www.sunworld.site,https://api.sunworld.site"',
            workflow,
        )
        self.assertIn(
            '-e AUTH_CSRF_ALLOWED_ORIGINS="$API_CSRF_ALLOWED_ORIGINS"',
            workflow,
        )


if __name__ == "__main__":
    unittest.main()
