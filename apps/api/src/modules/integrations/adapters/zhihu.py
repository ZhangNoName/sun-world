from ..schemas import IntegrationCapability, IntegrationConnector


connector = IntegrationConnector(
    adapter_id="zhihu",
    display_name="知乎数据开放平台",
    transport="cli",
    execution="local_cli",
    official_source="https://developer.zhihu.com/docs?key=zhihu_cli",
    capabilities=[
        IntegrationCapability(
            id="content.search",
            description="搜索知乎社区内容。",
            effect="read",
            required_fields=["query"],
            confirmation="never",
        ),
        IntegrationCapability(
            id="global.search",
            description="通过知乎开放平台进行全网搜索。",
            effect="read",
            required_fields=["query"],
            confirmation="never",
        ),
        IntegrationCapability(
            id="hot.list",
            description="读取知乎热榜。",
            effect="read",
            confirmation="never",
        ),
        IntegrationCapability(
            id="answer.generate",
            description="生成一次知乎直答检索增强回答。",
            effect="read",
            required_fields=["query"],
            confirmation="never",
        ),
        IntegrationCapability(
            id="quota.read",
            description="读取当前开放平台额度。",
            effect="read",
            confirmation="never",
        ),
    ],
)
