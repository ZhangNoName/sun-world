import os
import uuid
from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Request, UploadFile, status
from loguru import logger
from pydantic import BaseModel
from src.controller.file_manager import FileManager
from src.controller.user_manage import UserManager
from app_instance import app
from src.type.user_type import User
from src.core.response import ok, fail
from src.routers.auth.auth import get_current_user


# 创建文件 API 路由
router = APIRouter(prefix="/file", tags=["文件"])

# 注入 FileManager 依赖


def get_file_manager() -> FileManager:
    if not hasattr(app, 'file'):
        raise HTTPException(
            status_code=500, detail="File manager not initialized")
    return app.file


# 上传视频
@router.post("/video/upload", status_code=status.HTTP_201_CREATED)
async def upload_video(background_tasks: BackgroundTasks, file: UploadFile = File(...), file_manager: FileManager = Depends(get_file_manager)):
    # 定义允许的视频扩展名
    ALLOWED_EXTENSIONS = {'.mp4', '.avi', '.mov', '.mkv',
                          '.wmv', '.flv', '.webm', '.m4v', '.3gp', '.mpg', '.mpeg'}

    # 获取文件扩展名
    extension = os.path.splitext(file.filename)[1].lower()

    # 验证文件格式
    if extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"不支持的视频格式，仅支持: {', '.join(ALLOWED_EXTENSIONS)}"
        )

   # 1. 生成唯一的视频 ID
    video_id = str(uuid.uuid4())
    base_dir = app.config['file']['videos_dir']  # 即 /data/blog/videos

    # 定义临时原始文件路径和输出目录
    temp_mp4_path = os.path.join(base_dir, f"raw_{video_id}{extension}")
    output_dir = os.path.join(base_dir, video_id)

    # 确保目录存在
    os.makedirs(output_dir, exist_ok=True)

    try:
        # 2. 安全地流式保存原始文件（防止大文件撑爆内存）
        with open(temp_mp4_path, "wb") as buffer:
            while chunk := await file.read(1024 * 1024):  # 每次读取 1MB
                buffer.write(chunk)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"文件保存失败: {str(e)}")

    # 3. 放入后台任务执行转码
    # 建议 process_hls 内部在转码结束后自动删除 temp_mp4_path
    background_tasks.add_task(file_manager.process_hls,
                              temp_mp4_path, output_dir)

    # 4. 返回前端可以访问的 master 路径
    # 假设你挂载了 /static 到 videos_dir
    master_url = f"/static/videos/{video_id}/master.m3u8"

    return ok(
        data={
            "video_id": video_id,
            "url": master_url,
            "status": "processing"  # 告诉前端正在处理中
        },
        msg="上传成功，后台处理中"
    )


@router.post('/image/upload')
async def upload_image(request: Request, file: UploadFile = File(...)):
    # 定义允许的图片扩展名
    ALLOWED_EXTENSIONS = {'.jpg', '.jpeg', '.png',
                          '.gif', '.webp', '.bmp', '.svg', '.ico'}
    MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB

    # 获取文件扩展名和原始文件名（不含扩展名）
    extension = os.path.splitext(file.filename)[1].lower()

    # 验证文件格式
    if extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"不支持的图片格式，仅支持: {', '.join(ALLOWED_EXTENSIONS)}"
        )

    image_id = str(uuid.uuid4().hex[:8])
    base_dir = app.config['file']['images_dir']  # 即 /data/blog/imgs

    # 确保目录存在
    os.makedirs(base_dir, exist_ok=True)

    original_name = os.path.splitext(file.filename)[0]

    # 生成文件名：原文件名_uuid.扩展名
    filename = f"{original_name}-{image_id}{extension}"
    file_path = os.path.join(base_dir, filename)

    try:
        # 保存图片文件并检查大小
        file_size = 0
        with open(file_path, "wb") as buffer:
            while chunk := await file.read(1024 * 1024):  # 每次读取 1MB
                file_size += len(chunk)
                # 检查文件大小是否超过限制
                if file_size > MAX_FILE_SIZE:
                    # 删除已创建的文件
                    if os.path.exists(file_path):
                        os.remove(file_path)
                    raise HTTPException(
                        status_code=400,
                        detail=f"文件大小超过限制，最大允许50MB，当前文件大小: {file_size / 1024 / 1024:.2f}MB"
                    )
                buffer.write(chunk)

        logger.info(f"图片上传成功: {filename}, 大小: {file_size / 1024 / 1024:.2f}MB")

        return ok(
            data={
                "image_id": image_id,
                "filename": filename,
                # 假设有静态文件服务
                "url": f"https://sunworld.site/static/imgs/{filename}"
            },
            msg="图片上传成功"
        )
    except HTTPException:
        # 重新抛出HTTP异常
        raise
    except Exception as e:
        logger.error(f"图片保存失败: {str(e)}")
        # 如果文件已创建但保存失败，尝试删除
        if os.path.exists(file_path):
            try:
                os.remove(file_path)
            except:
                pass
        raise HTTPException(status_code=500, detail=f"图片保存失败: {str(e)}")
