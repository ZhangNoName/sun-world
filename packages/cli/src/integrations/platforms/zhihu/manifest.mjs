export const zhihuManifest = {
  schemaVersion: '1',
  adapterId: 'zhihu',
  displayName: '知乎数据开放平台',
  transport: 'cli',
  binary: {
    environmentVariable: 'SUN_WORLD_ZHIHU_CLI_PATH',
    officialSource: 'https://developer.zhihu.com/docs?key=zhihu_cli',
    doctorArguments: ['capabilities'],
    runtimeEnvironment: ['ZHIHU_ACCESS_SECRET'],
  },
  capabilities: [
    {
      id: 'content.search',
      description: '搜索知乎社区内容。',
      effect: 'read',
      required: ['query'],
    },
    {
      id: 'global.search',
      description: '通过知乎开放平台进行全网搜索。',
      effect: 'read',
      required: ['query'],
    },
    {
      id: 'hot.list',
      description: '读取知乎热榜。',
      effect: 'read',
      required: [],
    },
    {
      id: 'answer.generate',
      description: '生成一次知乎直答检索增强回答。',
      effect: 'read',
      required: ['query'],
    },
    {
      id: 'quota.read',
      description: '读取当前开放平台额度。',
      effect: 'read',
      required: [],
    },
  ],
}
