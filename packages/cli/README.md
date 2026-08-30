# @sun-world/cli

Sun World 的第一方命令行客户端。它面向两类使用场景：

- 通过 Sun World 公共 API 查询模型并发起 AI 请求；
- 通过受信任的本地 Adapter 调用官方飞书、知乎 CLI。

仓库内可直接使用 `pnpm sun`。发布到 npm 后可全局安装：

```bash
npm install --global @sun-world/cli
sun-world inspect
```

```bash
sun-world ai models
sun-world ai ask --message "用一句话说明今天的访问趋势"

sun-world integrations list
sun-world integrations inspect zhihu
sun-world integrations run zhihu content.search \
  --binary /absolute/path/to/zhihu-cli \
  --input-json '{"query":"大模型推理优化","count":5}'
```

平台 CLI 必须通过 `--binary` 或对应环境变量提供绝对路径：

- `SUN_WORLD_FEISHU_CLI_PATH`
- `SUN_WORLD_ZHIHU_CLI_PATH`

写操作默认拒绝执行。使用 `--dry-run` 预演，确认后显式添加 `--confirm`。CLI
使用固定 argv 映射和 `shell: false`，不会接受任意 shell 命令透传。
