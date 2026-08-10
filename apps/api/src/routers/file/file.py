"""Administrative file upload routes."""

from pathlib import Path

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    HTTPException,
    UploadFile,
    status,
)
from loguru import logger

from app_instance import app
from src.controller.file_manager import FileManager
from src.core.response import ok
from src.modules.files.storage import (
    UploadValidationError,
    store_image,
    store_video,
)
from src.routers.auth.auth import require_admin


router = APIRouter(
    prefix="/file",
    tags=["files"],
    dependencies=[Depends(require_admin)],
)


def get_file_manager() -> FileManager:
    if not hasattr(app, "file"):
        raise HTTPException(status_code=500, detail="File manager not initialized")
    return app.file


def _upload_error(error: UploadValidationError) -> HTTPException:
    status_code = 413 if error.code == "file_too_large" else 400
    return HTTPException(
        status_code=status_code,
        detail={"code": error.code, "message": str(error)},
    )


@router.post("/video/upload", status_code=status.HTTP_201_CREATED)
async def upload_video(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    file_manager: FileManager = Depends(get_file_manager),
):
    videos_dir = Path(app.config["file"]["videos_dir"])
    try:
        stored = await store_video(file, videos_dir)
    except UploadValidationError as error:
        raise _upload_error(error) from error
    except Exception as error:
        logger.exception("Video upload storage failed")
        raise HTTPException(
            status_code=500,
            detail={
                "code": "upload_failed",
                "message": "The video could not be stored.",
            },
        ) from error

    output_dir = videos_dir / stored.id
    output_dir.mkdir(parents=True, exist_ok=True)
    background_tasks.add_task(file_manager.process_hls, str(stored.path), str(output_dir))

    return ok(
        data={
            "video_id": stored.id,
            "url": f"/static/videos/{stored.id}/master.m3u8",
            "status": "processing",
        },
        msg="Video uploaded; background processing has started",
    )


@router.post("/image/upload")
async def upload_image(file: UploadFile = File(...)):
    try:
        stored = await store_image(
            file,
            app.config["file"]["images_dir"],
            max_bytes=10 * 1024 * 1024,
        )
    except UploadValidationError as error:
        raise _upload_error(error) from error
    except Exception as error:
        logger.exception("Image upload storage failed")
        raise HTTPException(
            status_code=500,
            detail={
                "code": "upload_failed",
                "message": "The image could not be stored.",
            },
        ) from error

    logger.info("Image upload succeeded: id={}, bytes={}", stored.id, stored.size)
    return ok(
        data={
            "image_id": stored.id,
            "filename": stored.filename,
            "url": f"https://sunworld.site/static/imgs/{stored.filename}",
        },
        msg="Image uploaded successfully",
    )
