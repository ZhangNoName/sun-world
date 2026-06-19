import subprocess
import os
from loguru import logger
import json


def get_video_resolution(file_path):
    # 使用 ffprobe 获取视频信息
    cmd = [
        'ffprobe', '-v', 'quiet', '-print_format', 'json',
        '-show_streams', file_path
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    data = json.loads(result.stdout)

    for stream in data['streams']:
        if stream['codec_type'] == 'video':
            return stream['width'], stream['height']
    return 0, 0


class FileManager:
    @staticmethod
    def _get_available_resolutions(original_width: int, original_height: int):
        """
        根据原始视频分辨率生成可用的分辨率列表
        最低480p，最高1080p，不超过原始分辨率
        """
        # 定义所有可用的分辨率选项
        all_resolutions = {
            "480p": {"size": "854x480", "bitrate": "1000k", "bandwidth": 1500000},
            "720p": {"size": "1280x720", "bitrate": "2000k", "bandwidth": 2500000},
            "1080p": {"size": "1920x1080", "bitrate": "5000k", "bandwidth": 5000000}
        }

        # 计算原始视频的高度（用于判断）
        original_height_p = original_height

        # 根据原始分辨率筛选可用的分辨率
        available_resolutions = {}

        # 如果原始分辨率 >= 1080p，包含所有分辨率
        if original_height_p >= 1080:
            available_resolutions["480p"] = all_resolutions["480p"]
            available_resolutions["720p"] = all_resolutions["720p"]
            available_resolutions["1080p"] = all_resolutions["1080p"]
        # 如果原始分辨率 >= 720p 但 < 1080p，包含480p和720p
        elif original_height_p >= 720:
            available_resolutions["480p"] = all_resolutions["480p"]
            available_resolutions["720p"] = all_resolutions["720p"]
        # 如果原始分辨率 >= 480p 但 < 720p，只包含480p
        elif original_height_p >= 480:
            available_resolutions["480p"] = all_resolutions["480p"]
        # 如果原始分辨率 < 480p，仍然生成480p（上采样）
        else:
            available_resolutions["480p"] = all_resolutions["480p"]

        return available_resolutions

    @staticmethod
    def process_hls(input_path: str, output_dir: str):
        """
        根据视频原始属性生成相应的HLS，最低480p，最高1080p
        """
        # 获取原始视频分辨率
        original_width, original_height = get_video_resolution(input_path)
        if original_width == 0 or original_height == 0:
            logger.error(f"无法获取视频分辨率: {input_path}")
            raise ValueError("无法获取视频分辨率")

        logger.info(f"原始视频分辨率: {original_width}x{original_height}")

        # 根据原始分辨率生成可用的分辨率列表
        resolutions = FileManager._get_available_resolutions(
            original_width, original_height)

        logger.info(f"将生成以下分辨率: {list(resolutions.keys())}")

        for name, config in resolutions.items():
            res_path = os.path.join(output_dir, name)
            os.makedirs(res_path, exist_ok=True)

            # FFmpeg 命令
            cmd = [
                'ffmpeg', '-y', '-i', input_path,
                '-preset', 'veryfast',
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
        FileManager._create_master_m3u8(output_dir, resolutions)

    @staticmethod
    def _create_master_m3u8(output_dir, resolutions):
        """
        动态生成 master.m3u8 文件
        """
        content = "#EXTM3U\n#EXT-X-VERSION:3\n"

        # 按分辨率从低到高排序（480p -> 720p -> 1080p）
        resolution_order = ["480p", "720p", "1080p"]

        for res_name in resolution_order:
            if res_name in resolutions:
                config = resolutions[res_name]
                size = config["size"]
                bandwidth = config["bandwidth"]
                content += f"#EXT-X-STREAM-INF:BANDWIDTH={bandwidth},RESOLUTION={size}\n"
                content += f"{res_name}/index.m3u8\n"

        with open(os.path.join(output_dir, 'master.m3u8'), 'w') as f:
            f.write(content)
