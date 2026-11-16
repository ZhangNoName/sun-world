# DSH Worker

## 本地V1入口

此入口是本地 macOS 验证使用的真实 SDK 适配器，不是已部署的 Worker 服务。入口 `src/local-runner.mjs` 从标准输入接收运行，使用固定 `0.2.2-rc.1` SDK、每次独立 home/cwd、纯 prompt 接口与根 turn 成功投影。只登记生成目录中的公开搜索与读取工具，不装载开发 Skill、用户 Skill、shell、MCP 或文件工具。

使用仓库根目录 `corepack pnpm dev:blog-qa` 接现有站点，或 `corepack pnpm dev:blog-qa:fixtures` 接合成数据，详见[站点验证说明](../../docs/development/blog-qa.md)。launcher 从 `tools/dsh-blog-p0` 的固定包清单与锁文件在临时目录安装依赖（禁安装脚本），拷贝 Worker/工具目录/产品 Skill，确认 SDK 实际登记两项工具，并运行 macOS 沙盒负向探测。运行中不安装依赖。产品 Skill 的内容 hash 随生成 bundle 固定，Worker 启动重验。

固定 SDK 的 defineTool 参数 DSL 不接受 Pydantic 导出的长度和数值约束关键字，适配器仅投影支持的类型、默认值、描述与必填；API 用完整生成 schema 执行严格类型、未知字段、范围与预算检查。不能直接把 JSON Schema 当 DSL；可选属性不能声明 `required:false`。启动验证会拒绝空工具清单，不以空清单继续运行。

可信 loopback 桥把 SDK 的 Messages 请求转发到本地 API 并加服务/运行双凭据；API 代理使用既有固定地址出站限制调用真实 OpenAI 兼容模型，再映射为 Messages 数据。停止原因和工具参数保留，未知终态、截断、跨 turn、重复终态拒绝成功。模型、来源正文与凭据不写普通日志。

macOS 沙盒只允许回环网络并拒绝项目/用户主目录读取（Node 安装目录只读例外）；允许回环不等于生产网关端口白名单。已新增显式[Linux隔离工厂](../../docs/development/agent-linux-containment.md)，资源/文件/PID与允许网关的网络路径分开验收；目前不提供生产镜像或默认监听，不能以本地通过开放生产内测。

协议回归：`corepack pnpm test:agent-worker`。真实模型、浏览器与负向探测见[本地验证说明](../../tools/dsh-blog-local/README.md)。


## 私有V2服务（本地实现）

新增显式mTLS服务factory与持久启动/取消记录、固定SDK执行端和网关client，详见[实现与验证](../../docs/development/agent-worker-v2.md)。createSdkWorker必须注入经过审查的隔离launcher、两方向服务身份、TLS与peer policy，不自动listen或读取业务配置。V2选择blog-qa@2产品Skill，模型引用读取工具提供的UUID source_id；V1内容与生成顺序保留。

已在自有macOS loopback沙盒和mTLS fixture中跑通真实固定SDK：HTTP重复启动仅执行一次、两项实际工具、3次合成Messages、UUID摘要/回执、根messageId/turn与结果，进程组/home已回收。取消先到会持久阻止迟到start。该记录与API MySQL运行账本职责不同，不替代最终答案事务。

普通协议测试仍用`corepack pnpm test:agent-worker`，已纳入根check和CI common quality；不需要SDK安装、真实模型或数据库。SDK集成单独运行：先用`node scripts/prepare-agent-worker.mjs --output /private/tmp/new-worker-runtime --offline`准备全新固定运行资源，再用`node apps/agent-worker/tests/integration/sdk-run.mjs /private/tmp/new-worker-runtime`（目前要求macOS sandbox-exec）。

确认终态的观察详情已支持三十天留存清理，永久身份摘要继续阻止重跑；未知进程、在途操作和既有控制器锁不会被自动清除，容量满时拒绝新身份。规则见[留存协议](../../docs/development/agent-journal-retention.md)，实际控制器崩溃的验证范围见[故障矩阵](../../docs/development/agent-worker-crash-validation.md)。

本地真实Redis准入、正式MySQL与固定SDK的整栈以及官方模型四题已有独立实证，详见[整栈验证](../../docs/development/agent-sdk-stack-validation.md)。Linux实际cgroup2/bubblewrap/ProcessRunner的512MiB、64项进程线程、文件只读与跨run不可见/取消超时整树回收已通过九情景；真实SDK在该启动器的容量、允许网关/拒任意外网仍未验收。人工语义、未知孤儿/旧锁的生产恢复授权及TLS签发轮换继续独立验收。当前没有生产镜像或生产监听入口，生产准入保持关闭。
