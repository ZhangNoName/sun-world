import sys
import unittest
from pathlib import Path

from fastapi import FastAPI


API_ROOT = Path(__file__).resolve().parents[1]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))


class OpenApiSecurityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from src.modules.ai.mcp_router import router as mcp_router
        from src.modules.ai.router import router as ai_router
        from src.modules.identity.router import router as identity_router
        from src.routers.auth.auth import router as auth_router

        app = FastAPI()
        for router in (auth_router, identity_router, ai_router, mcp_router):
            app.include_router(router)
        cls.schema = app.openapi()

    def test_cookie_session_scheme_is_declared_on_protected_routes(self):
        schemes = self.schema["components"]["securitySchemes"]
        self.assertEqual(schemes["CookieSession"]["type"], "apiKey")
        self.assertEqual(schemes["CookieSession"]["in"], "cookie")
        self.assertEqual(schemes["CookieSession"]["name"], "access_token")

        for path, method in (
            ("/auth/connections", "get"),
            ("/ai/v1/personas", "get"),
            ("/ai/v1/mcp/connections", "get"),
        ):
            with self.subTest(path=path):
                self.assertIn(
                    {"CookieSession": []},
                    self.schema["paths"][path][method]["security"],
                )

    def test_public_and_conditionally_authenticated_routes_are_accurate(self):
        self.assertNotIn("security", self.schema["paths"]["/auth/login"]["post"])
        self.assertNotIn(
            "security",
            self.schema["paths"]["/ai/v1/runs/stream"]["post"],
        )
        oauth_start = self.schema["paths"]["/auth/oauth/{provider}/start"]["get"]
        self.assertEqual(oauth_start["security"], [{}, {"CookieSession": []}])

    def test_oauth_callback_documents_its_redirect_response(self):
        callback = self.schema["paths"]["/auth/oauth/{provider}/callback"]["get"]
        self.assertIn("303", callback["responses"])


if __name__ == "__main__":
    unittest.main()
