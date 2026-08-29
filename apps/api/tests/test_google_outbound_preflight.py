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


class GoogleOutboundPreflightTests(unittest.TestCase):
    def test_preflight_reuses_explicit_proxy_config_without_printing_it(self):
        from src.modules.identity import google_outbound_preflight as preflight

        statuses = {
            "accounts.google.com": 200,
            "oauth2.googleapis.com": 405,
            "openidconnect.googleapis.com": 401,
            "www.googleapis.com": 200,
        }

        def handler(request: httpx.Request) -> httpx.Response:
            self.assertEqual(request.method, "GET")
            self.assertNotIn("authorization", request.headers)
            return httpx.Response(statuses[request.url.host])

        configured_proxy = "https://test-user:test-password@proxy.example:8443"
        received_proxy_values: list[str | None] = []

        def client_factory(*, proxy_url=None):
            received_proxy_values.append(proxy_url)
            return httpx.AsyncClient(
                transport=httpx.MockTransport(handler),
                follow_redirects=False,
                trust_env=False,
            )

        stdout = io.StringIO()
        stderr = io.StringIO()
        with (
            patch.dict(
                os.environ,
                {
                    preflight.GOOGLE_OUTBOUND_PROXY_ENV: configured_proxy,
                    "AUTH_GOOGLE_CLIENT_ID": "test-client",
                    "AUTH_GOOGLE_CLIENT_SECRET": "test-secret",
                    "BLOG_RUNTIME_ENV": "production",
                },
                clear=True,
            ),
            patch.object(preflight, "_oauth_http_client", side_effect=client_factory),
            contextlib.redirect_stdout(stdout),
            contextlib.redirect_stderr(stderr),
        ):
            exit_code = asyncio.run(preflight.run_preflight())

        self.assertEqual(exit_code, 0)
        self.assertEqual(received_proxy_values, [configured_proxy])
        self.assertEqual(stderr.getvalue(), "")
        self.assertNotIn(configured_proxy, stdout.getvalue())
        self.assertNotIn("test-password", stdout.getvalue())
        for hostname, status_code in statuses.items():
            self.assertIn(f"{hostname}: HTTP {status_code}", stdout.getvalue())

    def test_preflight_rejects_proxy_authentication_response(self):
        from src.modules.identity import google_outbound_preflight as preflight

        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(407)

        def client_factory(*, proxy_url=None):
            return httpx.AsyncClient(
                transport=httpx.MockTransport(handler),
                follow_redirects=False,
                trust_env=False,
            )

        stdout = io.StringIO()
        stderr = io.StringIO()
        with (
            patch.dict(
                os.environ,
                {
                    "AUTH_GOOGLE_CLIENT_ID": "test-client",
                    "AUTH_GOOGLE_CLIENT_SECRET": "test-secret",
                    "BLOG_RUNTIME_ENV": "production",
                },
                clear=True,
            ),
            patch.object(preflight, "_oauth_http_client", side_effect=client_factory),
            contextlib.redirect_stdout(stdout),
            contextlib.redirect_stderr(stderr),
        ):
            exit_code = asyncio.run(preflight.run_preflight())

        self.assertEqual(exit_code, 1)
        self.assertEqual(stdout.getvalue(), "")
        self.assertEqual(stderr.getvalue().count("unexpected HTTP 407"), 4)

    def test_preflight_fails_before_network_when_google_is_disabled(self):
        from src.modules.identity import google_outbound_preflight as preflight

        stdout = io.StringIO()
        stderr = io.StringIO()
        with (
            patch.dict(
                os.environ,
                {
                    preflight.GOOGLE_OUTBOUND_PROXY_ENV: "http://proxy.example:8080",
                    "BLOG_RUNTIME_ENV": "production",
                },
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
        self.assertEqual(stderr.getvalue(), "Google login is not enabled.\n")

    def test_preflight_fails_before_network_for_wrong_public_origin(self):
        from src.modules.identity import google_outbound_preflight as preflight

        stdout = io.StringIO()
        stderr = io.StringIO()
        with (
            patch.dict(
                os.environ,
                {
                    "AUTH_GOOGLE_CLIENT_ID": "test-client",
                    "AUTH_GOOGLE_CLIENT_SECRET": "test-secret",
                    "AUTH_PUBLIC_API_ORIGIN": "https://wrong.example",
                    "AUTH_PUBLIC_WEB_ORIGIN": "https://sunworld.site",
                    "BLOG_RUNTIME_ENV": "production",
                },
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
            "Google login public origins are not production-safe.\n",
        )
        self.assertNotIn("wrong.example", stderr.getvalue())

    def test_preflight_fails_before_network_for_nonproduction_runtime(self):
        from src.modules.identity import google_outbound_preflight as preflight

        stdout = io.StringIO()
        stderr = io.StringIO()
        with (
            patch.dict(
                os.environ,
                {
                    "AUTH_GOOGLE_CLIENT_ID": "test-client",
                    "AUTH_GOOGLE_CLIENT_SECRET": "test-secret",
                    "BLOG_RUNTIME_ENV": "local",
                },
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
            "Google login runtime is not production-safe.\n",
        )


if __name__ == "__main__":
    unittest.main()
