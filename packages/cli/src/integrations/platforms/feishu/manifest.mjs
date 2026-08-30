export const feishuManifest = {
  schemaVersion: '1',
  adapterId: 'feishu',
  displayName: '飞书 / Lark',
  transport: 'cli',
  binary: {
    environmentVariable: 'SUN_WORLD_FEISHU_CLI_PATH',
    officialSource: 'https://github.com/larksuite/cli',
    doctorArguments: ['schema', 'im.messages.delete', '--format', 'json'],
    runtimeEnvironment: [
      'LARKSUITE_CLI_CONFIG_DIR',
      'LARK_APP_ID',
      'LARK_APP_SECRET',
      'FEISHU_APP_ID',
      'FEISHU_APP_SECRET',
    ],
  },
  capabilities: [
    {
      id: 'auth.status',
      description: '检查飞书 CLI 的当前认证状态。',
      effect: 'read',
      required: [],
    },
    {
      id: 'calendar.agenda',
      description: '读取当前身份的日程。',
      effect: 'read',
      required: [],
    },
    {
      id: 'message.send',
      description: '向指定飞书会话发送文本消息。',
      effect: 'write',
      required: ['chat_id', 'text'],
      supportsDryRun: true,
    },
    {
      id: 'document.create',
      description: '从 Markdown 内容创建飞书文档。',
      effect: 'write',
      required: ['content'],
      supportsDryRun: true,
    },
  ],
}
