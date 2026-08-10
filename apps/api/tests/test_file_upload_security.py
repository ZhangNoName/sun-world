import io
import sys
import tempfile
import unittest
from contextlib import contextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette.datastructures import Headers, UploadFile


API_ROOT = Path(__file__).resolve().parents[1]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))


PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"safe-image-content"


def upload(filename: str, body: bytes, content_type: str) -> UploadFile:
    return UploadFile(
        filename=filename,
        file=io.BytesIO(body),
        headers=Headers({"content-type": content_type}),
    )


class FileUploadSecurityTests(unittest.IsolatedAsyncioTestCase):
    def _storage_api(self):
        try:
            from src.modules.files.storage import (
                UploadValidationError,
                store_image,
                store_video,
            )
        except ImportError as exc:
            self.fail(f"safe upload storage service is missing: {exc}")
        return UploadValidationError, store_image, store_video

    async def test_client_filename_cannot_escape_upload_root(self):
        _, store_image, _ = self._storage_api()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "uploads"

            stored = await store_image(
                upload("../../escape.png", PNG_BYTES, "image/png"), root
            )

            self.assertEqual(stored.path.parent, root.resolve())
            self.assertRegex(stored.path.name, r"^[0-9a-f]{32}\.png$")
            self.assertFalse((Path(directory) / "escape.png").exists())
            self.assertEqual(stored.path.read_bytes(), PNG_BYTES)

    async def test_svg_is_rejected_even_when_declared_as_an_image(self):
        UploadValidationError, store_image, _ = self._storage_api()
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(UploadValidationError) as raised:
                await store_image(
                    upload("badge.svg", b"<svg><script/></svg>", "image/svg+xml"),
                    Path(directory),
                )

        self.assertEqual(raised.exception.code, "unsupported_media_type")

    async def test_extension_spoofing_is_rejected_from_file_bytes(self):
        UploadValidationError, store_image, _ = self._storage_api()
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(UploadValidationError) as raised:
                await store_image(
                    upload("invoice.png", b"%PDF-1.7", "image/png"),
                    Path(directory),
                )

        self.assertEqual(raised.exception.code, "invalid_image")

    async def test_oversized_upload_is_removed(self):
        UploadValidationError, store_image, _ = self._storage_api()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with self.assertRaises(UploadValidationError) as raised:
                await store_image(
                    upload("large.png", PNG_BYTES + b"x" * 64, "image/png"),
                    root,
                    max_bytes=len(PNG_BYTES),
                )

            self.assertEqual(raised.exception.code, "file_too_large")
            self.assertEqual(list(root.iterdir()), [])

    async def test_video_storage_is_bounded_and_uses_a_server_filename(self):
        UploadValidationError, _, store_video = self._storage_api()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            stored = await store_video(
                upload("../../private.mp4", b"small-video", "video/mp4"), root
            )

            self.assertEqual(stored.path.parent, root.resolve())
            self.assertRegex(stored.filename, r"^[0-9a-f]{32}\.mp4$")
            self.assertEqual(stored.path.read_bytes(), b"small-video")

            with self.assertRaises(UploadValidationError) as raised:
                await store_video(
                    upload("large.mp4", b"x" * 9, "video/mp4"),
                    root,
                    max_bytes=8,
                )

            self.assertEqual(raised.exception.code, "file_too_large")
            self.assertEqual(list(root.glob("*.part")), [])


class ImageUploadRouteSecurityTests(unittest.TestCase):
    @contextmanager
    def _client(self, images_dir: Path):
        from app_instance import app as application_state
        from src.routers.auth.auth import get_current_user
        from src.routers.file.file import router

        had_config = hasattr(application_state, "config")
        original_config = getattr(application_state, "config", None)
        application_state.config = {"file": {"images_dir": str(images_dir)}}

        test_app = FastAPI()
        test_app.include_router(router)
        test_app.dependency_overrides[get_current_user] = lambda: {
            "id": 1,
            "roles": [{"code": "admin"}],
        }
        try:
            with TestClient(test_app, raise_server_exceptions=False) as client:
                yield client
        finally:
            if had_config:
                application_state.config = original_config
            else:
                del application_state.config

    def test_route_rejects_extension_spoofing_with_stable_error(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with self._client(root) as client:
                response = client.post(
                    "/file/image/upload",
                    files={"file": ("looks-valid.png", b"%PDF-1.7", "image/png")},
                )

            self.assertEqual(response.status_code, 400)
            self.assertEqual(response.json()["detail"]["code"], "invalid_image")
            self.assertEqual(list(root.iterdir()), [])

    def test_route_never_uses_the_client_filename(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with self._client(root) as client:
                response = client.post(
                    "/file/image/upload",
                    files={"file": ("private-name.png", PNG_BYTES, "image/png")},
                )

            self.assertEqual(response.status_code, 200)
            payload = response.json()["data"]
            self.assertNotIn("private-name", payload["filename"])
            self.assertRegex(payload["filename"], r"^[0-9a-f]{32}\.png$")
            self.assertEqual((root / payload["filename"]).read_bytes(), PNG_BYTES)


if __name__ == "__main__":
    unittest.main()
