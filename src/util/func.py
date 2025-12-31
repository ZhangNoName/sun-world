from datetime import datetime, timezone


def get_seconds_until_expiry(expiry_time: datetime) -> int:
    """
    计算从当前 UTC 时间到过期时间的秒数

    Args:
        expiry_time: 过期时间（datetime 对象，应该是 timezone-aware）

    Returns:
        int: 从当前时间到过期时间的秒数（整数）
    """
    return int((expiry_time - datetime.now(timezone.utc)).total_seconds())
