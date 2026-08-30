import unittest

from starlette.applications import Starlette
from starlette.responses import JSONResponse
from starlette.routing import Route
from starlette.testclient import TestClient

from src.core.csrf import CookieCsrfMiddleware, canonical_origin


async def mutate(_request):
    return JSONResponse({"ok": True})


async def read(_request):
    return JSONResponse({"ok": True})


def build_client() -> TestClient:
    app = Starlette(
        routes=[
            Route("/resource", mutate, methods=["POST"]),
            Route("/resource", read, methods=["GET"]),
        ]
    )
    app.add_middleware(
        CookieCsrfMiddleware,
        allowed_origins=["https://sunworld.site", "http://localhost:3030"],
    )
    return TestClient(app)


class CanonicalOriginTests(unittest.TestCase):
    def test_normalizes_default_ports_and_referer_paths(self):
        self.assertEqual(
            canonical_origin("https://SUNWORLD.site:443/account?tab=security"),
            "https://sunworld.site",
        )

    def test_rejects_non_http_and_credentialed_urls(self):
        self.assertIsNone(canonical_origin("null"))
        self.assertIsNone(canonical_origin("javascript:alert(1)"))
        self.assertIsNone(canonical_origin("https://user:pass@sunworld.site"))


class CookieCsrfMiddlewareTests(unittest.TestCase):
    def test_allows_anonymous_mutations_without_session_cookie(self):
        with build_client() as client:
            response = client.post("/resource")
        self.assertEqual(response.status_code, 200)

    def test_allows_trusted_origin_with_session_cookie(self):
        with build_client() as client:
            client.cookies.set("access_token", "session")
            response = client.post(
                "/resource",
                headers={"Origin": "https://sunworld.site"},
            )
        self.assertEqual(response.status_code, 200)

    def test_accepts_trusted_referer_when_origin_is_absent(self):
        with build_client() as client:
            client.cookies.set("refresh_token", "session")
            response = client.post(
                "/resource",
                headers={"Referer": "http://localhost:3030/me"},
            )
        self.assertEqual(response.status_code, 200)

    def test_rejects_untrusted_or_missing_origin_for_cookie_write(self):
        with build_client() as client:
            client.cookies.set("access_token", "session")
            untrusted = client.post(
                "/resource",
                headers={"Origin": "https://attacker.example"},
            )
            missing = client.post("/resource")
        self.assertEqual(untrusted.status_code, 403)
        self.assertEqual(missing.status_code, 403)
        self.assertEqual(untrusted.json()["msg"], "请求来源校验失败")

    def test_safe_method_is_not_blocked(self):
        with build_client() as client:
            client.cookies.set("access_token", "session")
            response = client.get(
                "/resource",
                headers={"Origin": "https://attacker.example"},
            )
        self.assertEqual(response.status_code, 200)


if __name__ == "__main__":
    unittest.main()
