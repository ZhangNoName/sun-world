from dataclasses import dataclass
from langchain.tools import tool, ToolRuntime
from langgraph.graph.state import RunnableConfig
from loguru import logger
from pydantic import BaseModel, Field
import httpx

# ---------------------------------------------------------
# 工具 1: 获取用户 IP
# ---------------------------------------------------------


@tool
async def get_client_ip(config: RunnableConfig) -> str:
    """获取当前用户的 IP 地址。"""
    # 从 configurable 中获取注入的 user_ip
    logger.info(f"get_client_ip: {config}")
    configurable = config.get("configurable", {})
    user_ip = configurable.get("user_ip")

    if not user_ip:
        return "127.0.0.1"  # 或者返回错误信息
    return user_ip

# ---------------------------------------------------------
# 工具 2: 根据 IP 解析地理位置
# ---------------------------------------------------------


@tool
async def get_current_location(config: RunnableConfig) -> str:
    """自动获取当前用户所在的地理位置。"""
    logger.info(f"get_current_location: {config}")
    # 1. 直接从配置获取 IP
    configurable = config.get("configurable", {})
    ip = configurable.get("ip")

    if not ip or ip.startswith("127."):
        return "本地开发环境，位置默认：北京市"

    # 2. 直接解析 IP
    async with httpx.AsyncClient() as client:
        response = await client.get(f"http://ip-api.com/json/{ip}?lang=zh-CN")
        if response.status_code == 200:
            data = response.json()
            return f"{data.get('regionName')} {data.get('city')}"
        return "无法解析位置"

# ---------------------------------------------------------
# 工具 3: 根据地址获取天气
# ---------------------------------------------------------


@tool
async def get_weather_for_location(location: str) -> str:
    """
    根据城市或地区名称查询实时天气。

    Args:
        location: 城市或地区名称（例如：'北京市' 或 'Florida'）。
    """
    logger.info(f"get_weather_for_location: {location}")
    # 提示：实际生产中建议使用和风天气、OpenWeatherMap 等 API
    # 这里演示使用 wttr.in 快速获取文本天气
    async with httpx.AsyncClient() as client:
        # format=3 返回简洁的一行文字描述
        response = await client.get(f"https://wttr.in/{location}?format=3&lang=zh-CN")
        if response.status_code == 200:
            return response.text.strip()
        return f"暂时无法获取 {location} 的天气信息"


class CodeSchema(BaseModel):
    description: str = Field(description="这段代码的功能描述")
    language: str = Field(description="编程语言，如 python, javascript, html")


@tool(args_schema=CodeSchema)
def generate_python_code(description: str, language: str = "python") -> str:
    """当用户请求编写代码、脚本或程序逻辑时，调用此工具生成对应的代码。"""
    # 实际上，代码生成是由 LLM 完成的。
    # 这个工具的意义在于：强迫 Agent 进入“代码模式”，并给出一个结构化的标记。
    return f"---CODE_BLOCK_START---\nLanguage: {language}\nDescription: {description}\n---CODE_BLOCK_END---"
