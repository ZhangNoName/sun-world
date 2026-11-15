# DSH local Worker

当前是本地 macOS 验证使用的真实 SDK 适配器，不是已部署的 Worker 服务。入口 `src/local-runner.mjs` 从标准输入接收运行，使用固定 `0.2.2-rc.1` SDK、每次独立 home/cwd、纯 prompt 接口与根 turn 成功投影。只登记生成目录中的公开搜索与读取工具，不装载开发 Skill、用户 Skill、shell、MCP 或文件工具。

使用仓库根目录 `corepack pnpm dev:blog-qa` 接现有站点，或 `corepack pnpm dev:blog-qa:fixtures` 接合成数据，详见[站点验证说明](../../docs/development/blog-qa.md)。launcher 从 `tools/dsh-blog-p0` 的固定包清单与锁文件在临时目录安装依赖（禁安装脚本），拷贝 Worker/工具目录/产品 Skill，确认 SDK 实际登记两项工具，并运行 macOS 沙盒负向探测。运行中不安装依赖。产品 Skill 的内容 hash 随生成 bundle 固定，Worker 启动重验。

固定 SDK 的 defineTool 参数 DSL 不接受 Pydantic 导出的长度和数值约束关键字，适配器仅投影支持的类型、默认值、描述与必填；API 用完整生成 schema 执行严格类型、未知字段、范围与预算检查。不能直接把 JSON Schema 当 DSL；可选属性不能声明 `required:false`。启动验证会拒绝空工具清单，不以空清单继续运行。

可信 loopback 桥把 SDK 的 Messages 请求转发到本地 API 并加服务/运行双凭据；API 代理使用既有固定地址出站限制调用真实 OpenAI 兼容模型，再映射为 Messages 数据。停止原因和工具参数保留，未知终态、截断、跨 turn、重复终态拒绝成功。模型、来源正文与凭据不写普通日志。

macOS 沙盒只允许回环网络并拒绝项目/用户主目录读取（Node 安装目录只读例外）；允许回环不等于生产网关端口白名单。尚未提供 Linux 容器、PID/地址硬隔离、TLS、正式调度服务和生产资源验收，不能以本地通过开放生产内测。

协议回归：`corepack pnpm test:agent-worker`。真实模型、浏览器与负向探测见[本地验证说明](../../tools/dsh-blog-local/README.md)。
