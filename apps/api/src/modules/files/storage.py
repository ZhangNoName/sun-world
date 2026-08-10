"""Validated, bounded storage for uploaded files."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from uuid import uuid4

from fastapi import UploadFile


class UploadValidationError(ValueError):
    """A stable, client-safe upload validation error."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


@dataclass(frozen=True)
class StoredUpload:
    id: str
    filename: str
    path: Path
    size: int
    media_type: str


def _detect_image_type(header: bytes) -> tuple[str, str] | None:
    if header.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png", "image/png"
    if header.startswith(b"\xff\xd8\xff"):
        return "jpg", "image/jpeg"
    if header.startswith((b"GIF87a", b"GIF89a")):
        return "gif", "image/gif"
    if len(header) >= 12 and header[:4] == b"RIFF" and header[8:12] == b"WEBP":
        return "webp", "image/webp"
    if header.startswith(b"BM"):
        return "bmp", "image/bmp"
    if header.startswith(b"\x00\x00\x01\x00"):
        return "ico", "image/x-icon"
    return None


async def store_image(
    upload: UploadFile,
    root: str | Path,
    *,
    max_bytes: int = 10 * 1024 * 1024,
    chunk_size: int = 64 * 1024,
) -> StoredUpload:
    """Validate an image by signature and atomically store it below ``root``."""

    storage_root = Path(root).resolve()
    storage_root.mkdir(parents=True, exist_ok=True)

    upload_id = uuid4().hex
    temporary_path = storage_root / f".{upload_id}.part"
    final_path: Path | None = None
    total_size = 0
    header = b""

    try:
        with temporary_path.open("xb") as destination:
            while chunk := await upload.read(chunk_size):
                total_size += len(chunk)
                if total_size > max_bytes:
                    raise UploadValidationError(
                        "file_too_large", "The uploaded image exceeds the size limit."
                    )
                if len(header) < 32:
                    header = (header + chunk)[:32]
                destination.write(chunk)

        normalized_header = header.lstrip().lower()
        if normalized_header.startswith((b"<svg", b"<?xml")):
            raise UploadValidationError(
                "unsupported_media_type", "SVG images are not supported."
            )

        detected_type = _detect_image_type(header)
        if detected_type is None:
            raise UploadValidationError(
                "invalid_image", "The uploaded file is not a supported image."
            )

        extension, media_type = detected_type
        filename = f"{upload_id}.{extension}"
        final_path = (storage_root / filename).resolve()
        try:
            final_path.relative_to(storage_root)
        except ValueError as error:
            raise UploadValidationError(
                "invalid_storage_path", "The upload destination is invalid."
            ) from error

        os.replace(temporary_path, final_path)
        return StoredUpload(
            id=upload_id,
            filename=filename,
            path=final_path,
            size=total_size,
            media_type=media_type,
        )
    except Exception:
        temporary_path.unlink(missing_ok=True)
        if final_path is not None:
            final_path.unlink(missing_ok=True)
        raise
    finally:
        await upload.close()


_VIDEO_EXTENSIONS = {
    ".mp4",
    ".avi",
    ".mov",
    ".mkv",
    ".wmv",
    ".flv",
    ".webm",
    ".m4v",
    ".3gp",
    ".mpg",
    ".mpeg",
}


async def store_video(
    upload: UploadFile,
    root: str | Path,
    *,
    max_bytes: int = 200 * 1024 * 1024,
    chunk_size: int = 1024 * 1024,
) -> StoredUpload:
    """Store a bounded video under a server-generated, non-user-controlled name."""

    extension = Path(upload.filename or "").suffix.lower()
    if extension not in _VIDEO_EXTENSIONS:
        await upload.close()
        raise UploadValidationError(
            "unsupported_media_type", "The uploaded video format is not supported."
        )

    storage_root = Path(root).resolve()
    storage_root.mkdir(parents=True, exist_ok=True)
    upload_id = uuid4().hex
    temporary_path = storage_root / f".{upload_id}.part"
    filename = f"{upload_id}{extension}"
    final_path = (storage_root / filename).resolve()
    total_size = 0

    try:
        final_path.relative_to(storage_root)
        with temporary_path.open("xb") as destination:
            while chunk := await upload.read(chunk_size):
                total_size += len(chunk)
                if total_size > max_bytes:
                    raise UploadValidationError(
                        "file_too_large", "The uploaded video exceeds the size limit."
                    )
                destination.write(chunk)

        os.replace(temporary_path, final_path)
        return StoredUpload(
            id=upload_id,
            filename=filename,
            path=final_path,
            size=total_size,
            media_type=upload.content_type or "application/octet-stream",
        )
    except Exception:
        temporary_path.unlink(missing_ok=True)
        final_path.unlink(missing_ok=True)
        raise
    finally:
        await upload.close()
