import sys
import unittest
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from starlette.exceptions import HTTPException as StarletteHTTPException


API_ROOT = Path(__file__).resolve().parents[1]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))


class HttpExceptionEnvelopeIntegrationTests(unittest.TestCase):
    def test_global_envelope_preserves_http_exception_headers(self):
        from main import http_exception_handler

        app = FastAPI()
        app.add_exception_handler(
            StarletteHTTPException,
            http_exception_handler,
        )

        @app.get("/rate-limited")
        async def rate_limited():
            raise HTTPException(
                status_code=429,
                detail={
                    "code": "AUTH_RATE_LIMITED",
                    "message": "请求过于频繁，请稍后再试。",
                },
                headers={"Retry-After": "47"},
            )

        response = TestClient(app).get("/rate-limited")

        self.assertEqual(response.status_code, 429)
        self.assertEqual(response.headers["Retry-After"], "47")
        self.assertEqual(
            response.json(),
            {
                "code": "AUTH_RATE_LIMITED",
                "data": None,
                "msg": "请求过于频繁，请稍后再试。",
            },
        )


if __name__ == "__main__":
    unittest.main()
