import subprocess
import os
from loguru import logger


class FileManager:
    @staticmethod
    def process_hls(input_path: str, output_dir: str):
        """
        将 mp4 转换为 720p 和 1080p 的 HLS
        """
        # 创建子目录
        resolutions = {
            "720p": {"size": "1280x720", "bitrate": "2000k"},
            "1080p": {"size": "1920x1080", "bitrate": "5000k"}
        }

        for name, config in resolutions.items():
            res_path = os.path.join(output_dir, name)
            os.makedirs(res_path, exist_ok=True)

            # FFmpeg 命令
            cmd = [
                'ffmpeg', '-y', '-i', input_path,
                '-vf', f'scale={config["size"]}',
                '-c:v', 'libx264', '-b:v', config["bitrate"],
                '-c:a', 'aac', '-b:a', '128k',
                '-f', 'hls',
                '-hls_time', '6',
                '-hls_list_size', '0',
                '-hls_segment_filename', os.path.join(res_path, 'v%03d.ts'),
                os.path.join(res_path, 'index.m3u8')
            ]

            logger.info(f"正在生成 {name}...")
            subprocess.run(cmd, check=True)

        # 最后生成 master.m3u8 (可以用 Python 直接写文件内容)
        FileManager._create_master_m3u8(output_dir)

    @staticmethod
    def _create_master_m3u8(output_dir):
        content = """#EXTM3U
#EXT-X-VERSION:3
#EXT-X-STREAM-INF:BANDWIDTH=2500000,RESOLUTION=1280x720
720p/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080
1080p/index.m3u8
"""
        with open(os.path.join(output_dir, 'master.m3u8'), 'w') as f:
            f.write(content)
