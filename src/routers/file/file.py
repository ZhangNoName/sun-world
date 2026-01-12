import os
import uuid
from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile, status
from loguru import logger
from pydantic import BaseModel
from src.controller.file_manager import FileManager
from src.controller.user_manage import UserManager
from app_instance import app
from src.type.user_type import User
from src.type.type import ResponseModel
from src.routers.auth.auth import get_current_user


# 创建文件 API 路由
router = APIRouter(prefix="/file", tags=["file"])

# 注入 FileManager 依赖


def get_file_manager() -> FileManager:
    if not hasattr(app, 'file'):
        raise HTTPException(
            status_code=500, detail="File manager not initialized")
    return app.file


# 上传视频
@router.post("/video/upload", status_code=status.HTTP_201_CREATED)
async def upload_video(background_tasks: BackgroundTasks, file: UploadFile = File(...), file_manager: FileManager = Depends(get_file_manager)):
   # 1. 生成唯一的视频 ID
    video_id = str(uuid.uuid4())
    base_dir = app.config['file']['videos_dir']  # 即 /home/lighthouse/videos

    # 定义临时原始文件路径和输出目录
    extension = os.path.splitext(file.filename)[1]
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
    master_url = f"/static/{video_id}/master.m3u8"

    return ResponseModel(
        code=1,
        data={
            "video_id": video_id,
            "url": master_url,
            "status": "processing"  # 告诉前端正在处理中
        },
        message="上传成功，后台处理中"
    )
