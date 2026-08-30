import asyncio
import contextlib
import io
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

import httpx


API_ROOT = Path(__file__).resolve().parents[1]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))


class QQOutboundPreflightTests(unittest.TestCase):
    @staticmethod
    def _qq_only_environment(**overrides: str) -> dict[str, str]:
        environment = {
            "AUTH_QQ_CLIENT_ID": "test-qq-client",
            "AUTH_QQ_CLIENT_SECRET": "test-qq-secret",
            "BLOG_RUNTIME_ENV": "production",
        }
        environment.update(overrides)
        return environment

    def test_preflight_checks_fixed_endpoints_without_credentials_or_redirects(self):
        from src.modules.identity import qq_outbound_preflight as preflight

        statuses = {
            "/oauth2.0/authorize": 204,
            "/oauth2.0/token": 302,
            "/oauth2.0/me": 400,
            "/user/get_user_info": 429,
        }
        requested_urls: list[str] = []

        def handler(request: httpx.Request) -> httpx.Response:
            self.assertEqual(request.method, "GET")
            self.assertEqual(request.url.host, "graph.qq.com")
            self.assertEqual(request.url.query, b"")
            self.assertNotIn("authorization", request.headers)
            requested_urls.append(str(request.url))
            return httpx.Response(statuses[request.url.path])

        def client_factory():
            client = httpx.AsyncClient(
                transport=httpx.MockTransport(handler),
                follow_redirects=False,
                trust_env=False,
            )
            self.assertFalse(client.follow_redirects)
            return client

        stdout = io.StringIO()
        stderr = io.StringIO()
        with (
            patch.dict(os.environ, self._qq_only_environment(), clear=True),
            patch.object(preflight, "_oauth_http_client", side_effect=client_factory),
            contextlib.redirect_stdout(stdout),
            contextlib.redirect_stderr(stderr),
        ):
            exit_code = asyncio.run(preflight.run_preflight())

        self.assertEqual(exit_code, 0)
        self.assertEqual(
            requested_urls,
            [target.url for target in preflight.PREFLIGHT_TARGETS],
        )
        self.assertEqual(stderr.getvalue(), "")
        self.assertNotIn("test-qq-client", stdout.getvalue())
        self.assertNotIn("test-qq-secret", stdout.getvalue())
        for status_code in statuses.values():
            self.assertIn(f"graph.qq.com: HTTP {status_code}", stdout.getvalue())

    def test_preflight_rejects_proxy_authentication_and_server_errors(self):
        from src.modules.identity import qq_outbound_preflight as preflight

        statuses = {
            "/oauth2.0/authorize": 407,
            "/oauth2.0/token": 500,
            "/oauth2.0/me": 502,
            "/user/get_user_info": 503,
        }

        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(statuses[request.url.path])

        def client_factory():
            return httpx.AsyncClient(
                transport=httpx.MockTransport(handler),
                follow_redirects=False,
                trust_env=False,
            )

        stdout = io.StringIO()
        stderr = io.StringIO()
        with (
            patch.dict(os.environ, self._qq_only_environment(), clear=True),
            patch.object(preflight, "_oauth_http_client", side_effect=client_factory),
            contextlib.redirect_stdout(stdout),
            contextlib.redirect_stderr(stderr),
        ):
            exit_code = asyncio.run(preflight.run_preflight())

        self.assertEqual(exit_code, 1)
        self.assertEqual(stdout.getvalue(), "")
        for status_code in statuses.values():
            self.assertIn(
                f"graph.qq.com: unexpected HTTP {status_code}",
                stderr.getvalue(),
            )

    def test_preflight_fails_closed_on_network_error_without_printing_it(self):
        from src.modules.identity import qq_outbound_preflight as preflight

        sensitive_error = "test-qq-client test-qq-secret"

        def handler(request: httpx.Request) -> httpx.Response:
            raise httpx.ConnectError(sensitive_error, request=request)

        def client_factory():
            return httpx.AsyncClient(
                transport=httpx.MockTransport(handler),
                follow_redirects=False,
                trust_env=False,
            )

        stdout = io.StringIO()
        stderr = io.StringIO()
        with (
            patch.dict(os.environ, self._qq_only_environment(), clear=True),
            patch.object(preflight, "_oauth_http_client", side_effect=client_factory),
            contextlib.redirect_stdout(stdout),
            contextlib.redirect_stderr(stderr),
        ):
            exit_code = asyncio.run(preflight.run_preflight())

        self.assertEqual(exit_code, 1)
        self.assertEqual(stdout.getvalue(), "")
        self.assertEqual(stderr.getvalue().count("graph.qq.com: connection failed"), 4)
        self.assertNotIn(sensitive_error, stderr.getvalue())

    def test_preflight_fails_before_network_when_qq_credentials_are_incomplete(self):
        from src.modules.identity import qq_outbound_preflight as preflight

        for environment in (
            {"BLOG_RUNTIME_ENV": "production"},
            {
                "AUTH_QQ_CLIENT_ID": "test-qq-client",
                "BLOG_RUNTIME_ENV": "production",
            },
            {
                "AUTH_QQ_CLIENT_SECRET": "test-qq-secret",
                "BLOG_RUNTIME_ENV": "production",
            },
        ):
            with self.subTest(environment_names=sorted(environment)):
                stdout = io.StringIO()
                stderr = io.StringIO()
                with (
                    patch.dict(os.environ, environment, clear=True),
                    patch.object(preflight, "_oauth_http_client") as client_factory,
                    contextlib.redirect_stdout(stdout),
                    contextlib.redirect_stderr(stderr),
                ):
                    exit_code = asyncio.run(preflight.run_preflight())

                self.assertEqual(exit_code, 1)
                client_factory.assert_not_called()
                self.assertEqual(stdout.getvalue(), "")
                self.assertEqual(stderr.getvalue(), "QQ login is not enabled.\n")

    def test_preflight_requires_exact_qq_only_provider_matrix(self):
        from src.modules.identity import qq_outbound_preflight as preflight

        non_qq_credential_sets = (
            {"AUTH_GOOGLE_CLIENT_ID": "test-google-client"},
            {"AUTH_GOOGLE_CLIENT_SECRET": "test-google-secret"},
            {
                "AUTH_GOOGLE_CLIENT_ID": "test-google-client",
                "AUTH_GOOGLE_CLIENT_SECRET": "test-google-secret",
            },
            {"AUTH_GOOGLE_OUTBOUND_PROXY_URL": "https://proxy.example:8443"},
            {"AUTH_WECHAT_CLIENT_ID": "test-wechat-client"},
            {"AUTH_WECHAT_CLIENT_SECRET": "test-wechat-secret"},
            {
                "AUTH_WECHAT_CLIENT_ID": "test-wechat-client",
                "AUTH_WECHAT_CLIENT_SECRET": "test-wechat-secret",
            },
        )
        for credential_set in non_qq_credential_sets:
            with self.subTest(environment_names=sorted(credential_set)):
                stdout = io.StringIO()
                stderr = io.StringIO()
                environment = self._qq_only_environment(**credential_set)
                with (
                    patch.dict(os.environ, environment, clear=True),
                    patch.object(preflight, "_oauth_http_client") as client_factory,
                    contextlib.redirect_stdout(stdout),
                    contextlib.redirect_stderr(stderr),
                ):
                    exit_code = asyncio.run(preflight.run_preflight())

                self.assertEqual(exit_code, 1)
                client_factory.assert_not_called()
                self.assertEqual(stdout.getvalue(), "")
                self.assertEqual(
                    stderr.getvalue(),
                    "OAuth provider matrix is not QQ-only.\n",
                )
                for value in credential_set.values():
                    self.assertNotIn(value, stderr.getvalue())

    def test_preflight_fails_before_network_for_wrong_public_origin(self):
        from src.modules.identity import qq_outbound_preflight as preflight

        stdout = io.StringIO()
        stderr = io.StringIO()
        with (
            patch.dict(
                os.environ,
                self._qq_only_environment(
                    AUTH_PUBLIC_API_ORIGIN="https://wrong.example",
                    AUTH_PUBLIC_WEB_ORIGIN="https://sunworld.site",
                ),
                clear=True,
            ),
            patch.object(preflight, "_oauth_http_client") as client_factory,
            contextlib.redirect_stdout(stdout),
            contextlib.redirect_stderr(stderr),
        ):
            exit_code = asyncio.run(preflight.run_preflight())

        self.assertEqual(exit_code, 1)
        client_factory.assert_not_called()
        self.assertEqual(stdout.getvalue(), "")
        self.assertEqual(
            stderr.getvalue(),
            "QQ login public origins are not production-safe.\n",
        )
        self.assertNotIn("wrong.example", stderr.getvalue())

    def test_preflight_fails_before_network_for_nonproduction_runtime(self):
        from src.modules.identity import qq_outbound_preflight as preflight

        stdout = io.StringIO()
        stderr = io.StringIO()
        with (
            patch.dict(
                os.environ,
                self._qq_only_environment(BLOG_RUNTIME_ENV="local"),
                clear=True,
            ),
            patch.object(preflight, "_oauth_http_client") as client_factory,
            contextlib.redirect_stdout(stdout),
            contextlib.redirect_stderr(stderr),
        ):
            exit_code = asyncio.run(preflight.run_preflight())

        self.assertEqual(exit_code, 1)
        client_factory.assert_not_called()
        self.assertEqual(stdout.getvalue(), "")
        self.assertEqual(
            stderr.getvalue(),
            "QQ login runtime is not production-safe.\n",
        )


if __name__ == "__main__":
    unittest.main()
