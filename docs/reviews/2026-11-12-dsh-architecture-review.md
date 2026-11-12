# DSH 架构改进方案评审

日期：2026-11-12。范围：当前工作树的设计与源码静态评审；不代表生产审计、真实模型验证或部署验收。当前工作树包含其他任务的 AI 运营、评论及写作 Skill 改动，本次不修改这些实现。

## 结论

保留[原总纲](../architecture/agent-module-platform.md)的模块化单体、FastAPI 授权与数据权威、独立 Worker、先只读后写入的方向。可以推进分阶段实现；目前不足以把 P0 原型直接接入生产。新增[实现规范](../architecture/dsh-implementation-standard.md)收敛目录、契约和安全边界，[实施计划](../plans/dsh-platform-implementation.md)规定交付与放行条件。以下优先级表示实施阻断程度，不是已经证实存在的线上漏洞。

## 发现与处理

本轮后续范围已收敛为只完善文档，暂不开发。总纲精简为导航，详细规则集中到实现规范、[模块扩展契约](../architecture/module-extension-contract.md)和[文件格式规范](../repository-conventions.md)。新增设计处理覆盖派发结果不明时不自动重放、来源交付回执、跨库检查窗口、SSG/CDN 撤回传播，以及页面插槽和跨项目授权。规则尚未成为自动门禁。

格式核查发现本地 Prettier 实际选择 `.prettierrc`，与此前文档指定的 `.prettierrc.json` 不一致。已记录当前值及未来统一目标，本轮未改配置或格式化代码。

| 编号 / 优先级 | 证据与缺口 | 影响 | 本轮设计处理 / 放行条件 |
| --- | --- | --- | --- |
| R1 / P1 | `apps/api/src/routers/blog/blog.py` 的 create/update/delete 使用 `require_admin`；`apps/api/src/routers/auth/auth.py:require_admin` 按角色 code 判断。原方案尚未指定统一能力检查的落点 | 只给工具网关加权限，会形成网页与 Agent 两套规则；直接移除旧守卫又可能扩大权限 | 新增内部认证/授权接口；业务服务强制授权；旧写入口保留 admin 下限，先影子比较再逐入口切换 |
| R2 / P1 | `apps/api/src/controller/blog_manage.py:build_blog_list_query/get_blog` 使用 `is_deleted`；`add_blog/update_blog` 跨 MySQL/MongoDB 写入，无公开版本指针 | 不能把原型 fixture 的 published 布尔值直接映射为真实发布状态，也不能开放 Agent 发布 | P1 定义 legacy public 读取规则；草稿单独存储；P2 发布等待所有读写入口版本化、outbox 与最低回滚版本验收 |
| R3 / P1 | `apps/api/src/modules/ai/providers.py:AiProvider.stream` 返回 `AsyncIterator[str]`；P0 模拟 Messages 工具参数流 | 现有普通聊天模型可用，不等于 dsh 工具调用可用；丢掉 tool-call/stop-reason 后不能正确判断成功 | 独立结构化模型代理适配；保留普通聊天接口；真实模型契约测试必须先于 P1 放行 |
| R4 / P1 | `tools/dsh-blog-p0/run.mjs:runCase` 的 run/token/sources 保存在进程内；现有 AI 运营指标不是 dsh 持久化执行账本 | API 重启、Worker 失联、重复提交和取消竞争缺少权威恢复依据 | MySQL 保存运行与代次、调用及来源凭据；Redis 仅做准入；终态条件更新与持久化后 SSE 投影 |
| R5 / P1 | `tools/dsh-blog-p0/profile.mjs` 从本地 Markdown 注入固定说明；`apps/api/src/modules/ai/service.py:_resolve_custom_system_message` 组合用户 Skill；仓库另有 `.agents/skills` | 三类 Skill 若直接互相装载，可能把开发发布流程、个人提示词或脚本带入产品执行环境 | 区分开发、产品与用户 Skill；模块拥有产品 Skill，构建时按白名单打包；Skill 不授予权限 |
| R6 / P1 | 原总纲定义模块 ID、权限键和工具 schema，但没有明确生成源；P0 工具使用下划线名称，文档使用点号 ID | 人工维护 Python/TS/profile 三份声明易漂移，工具名称变更可能绕开审计或破坏升级 | Python 模块 manifest 与 Pydantic schema 为源；生成 Worker 投影；显式维护稳定业务 ID 到模型名称映射，禁止隐式替换 |
| R7 / P1 | P0 `run.mjs` 导入 Node `HarnessClient`，版本固定为 `0.2.2-rc.1`；原总纲同时讨论 Python SDK；隔离依赖 macOS `sandbox-exec` | 若首期另做 Python Worker，就需要重验一套 SDK；macOS 结果不能证明 Linux 容器隔离 | P1 选择 Node/TypeScript Worker 承接原型；版本先不升级；Linux 无外网、无宿主文件、进程回收实测作为独立门槛 |
| R8 / P1 | `run.mjs:projectAnswer` 校验来源 ID 与基础链接形式，只处理单次 fixture 事件；真实文章可在问答中被修改或删除 | 引用可能指向不同正文；来自模型的 Markdown 链接也不能仅靠正则防护 | 来源绑定实际返回片段摘要与内容 hash；提交前复核；P1 答案按 plain text 渲染，链接仅来自服务端块；事件按 root session/turn 关联 |
| R9 / P2 | `apps/web/src/modules/registry.ts` 已有前端注册；`modules/ai` 同时包含聊天、Provider、Skill、MCP；`packages/cli` 有本机集成适配 | 新平台容易重复路由系统，或误把本机 CLI/MCP 能力作为 Worker 默认工具 | 复用前端注册；新增 `agent_runtime` 负责运行编排；AI 保留模型与聊天；CLI 和 MCP 均不自动接入 Worker |

## 需要保留的设计

- 模块是业务代码边界，不必对应独立服务或数据库。2 核约 2 GB 的既有主机不适合一次拆出认证、博客、Skill 等微服务。
- 私有 Worker 是运行隔离边界；业务服务不能因 Worker 已认证就跳过用户权限及资源检查。
- 发布确认绑定规范化参数、目标与版本；跨库内容采用不可变版本和 outbox。该方案的复杂度值得承担，但应留在发布阶段。
- 前端、CLI 和 Agent 共享业务操作，继续复用 contracts、UI 包和既有部署流程，不重建通用插件市场。

## SDK 外部核对与证据边界

2026-11-12 查阅[官方架构](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.zh.md)、[Python SDK](https://github.com/deepseek-ai/deepseek-harness/blob/master/python/sdk/README.md)和[安全说明](https://github.com/deepseek-ai/deepseek-harness/blob/master/SAFETY.zh.md)。上游将 dsh 标为实验性开发者预览，不能将其自身权限控制视为唯一隔离措施。Python SDK 文档描述了通过 stdio 启动子进程，并区分协议响应超时与实际活动时限；当前入口还可能识别原生命令。

这些链接指向可变化的 master，只用来核查方向，不作为 `0.2.2-rc.1` 的兼容证明。P1 必须保存所选发行版的 SDK/profile 契约样例、锁文件与镜像摘要；继续验证纯 prompt 入口。禁止照搬最新文档升级原型后宣称原测试仍成立。

本轮没有重跑 P0、调用真实模型、连接生产数据库或执行权限攻击测试。P0 历史结果见[原型说明](../../tools/dsh-blog-p0/README.md)与原总纲；实际测试缺口已转入实施计划，不重复声称本轮通过。
