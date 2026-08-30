from ..schemas import IntegrationCapability, IntegrationConnector


connector = IntegrationConnector(
    adapter_id="feishu",
    display_name="飞书 / Lark",
    transport="cli",
    execution="local_cli",
    official_source="https://github.com/larksuite/cli",
    capabilities=[
        IntegrationCapability(
            id="auth.status",
            description="检查飞书 CLI 的当前认证状态。",
            effect="read",
            confirmation="never",
        ),
        IntegrationCapability(
            id="calendar.agenda",
            description="读取当前身份的日程。",
            effect="read",
            confirmation="never",
        ),
        IntegrationCapability(
            id="message.send",
            description="向指定飞书会话发送文本消息。",
            effect="write",
            required_fields=["chat_id", "text"],
        ),
        IntegrationCapability(
            id="document.create",
            description="从 Markdown 内容创建飞书文档。",
            effect="write",
            required_fields=["content"],
        ),
    ],
)
