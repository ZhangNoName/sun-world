"""Build-time reviewed integration adapters.

Adding a platform means adding one adapter module and registering its safe
public manifest here. Runtime code download remains intentionally unsupported.
"""

from .feishu import connector as feishu_connector
from .zhihu import connector as zhihu_connector


def reviewed_connectors():
    return [feishu_connector, zhihu_connector]


__all__ = ["reviewed_connectors"]
