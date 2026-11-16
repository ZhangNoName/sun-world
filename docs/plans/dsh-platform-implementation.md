# DSH 平台分阶段实施计划

日期：2026-11-12。状态：用户于 2026-11-12 授权在 `zxy/dsh-platform-foundation` 开始阶段 A；其余阶段仍按下表逐项实施和验收。执行前读取[评审](../reviews/2026-11-12-dsh-architecture-review.md)、[实现规范](../architecture/dsh-implementation-standard.md)、[架构总纲](../architecture/agent-module-platform.md)和当前 handoff。实施时保留工作区其他任务修改，不把本文视为部署或生产发布授权。

## 本地验证入口（2026-11-12）

用户进一步授权继续开发到可本地验证。已提供 `corepack pnpm dev:blog-qa` 与 `/aigc/blog-qa` 页面，使用独立 loopback API、两名合成开发用户、三篇合成文章、SQLite 验证账本、真实固定 SDK 与真实模型。详见[本地说明](../../tools/dsh-blog-local/README.md)。此入口不导入生产应用/配置，不改生产数据库 schema，主 API 未开放 Agent 运行。

现已进一步接入正常站点的真实 Cookie/Redis 会话、账号与公开博客查询、全局模型目录，默认启动命令切为站点模式（3030/8032）；三篇合成数据使用 `dev:blog-qa:fixtures`。详见[站点验证说明](../development/blog-qa.md)。已用用户授权的现有管理员正常登录，完成真实博客问答、引用、令牌刷新、取消和退出验收；使用显式本地测试Qwen，旧目录DeepSeek的解密配置仍未提供。

这是供开发机验证 B/C/D 核心交互的独立切片，不代表正式阶段已整体通过：MySQL 账本、Redis 准入、真实会话授权、Linux 隔离、内部 TLS 与生产故障矩阵仍须完成。macOS 回环沙盒不能替代 Linux 地址与PID硬限制。

## 设计约束与阶段映射

文件命名、缩进、测试布局以[工程文件规范](../repository-conventions.md)为准；模块权限、页面贡献及跨项目接入以[扩展契约](../architecture/module-extension-contract.md)为准。P0 是历史原型，A–D 对应 P1，E–F 对应 P2，G 对应 P3，不混用优先级 P1 与阶段编号。

阶段 A 首批已在本地实现模块注册、严格工具 schema、公开读取策略和 HTTP/工具共用查询；完整范围及验证见[分支交接](../handoff/branches/zxy-dsh-platform-foundation.md)。管理员入口源码盘点、40项显式基线及旧/新影子比较已在本地实现，见[迁移说明](../development/admin-policy-migration.md)；本地profile的真实角色/resource只读快照核对已完成（单启用管理员、resource目录为空，无重复/失联绑定），生产目标核对、恢复路径和逐入口能力迁移仍未完成，阶段 A 未整体验收；Worker/运行准入保持关闭。任务归属：A 增加模块权限和声明验证；D 按实际页面引入有限 slot/contribution，覆盖卸载、错误隔离和能力加载；G 在第二项目启用前完成项目隔离与 adapter 契约测试。格式配置统一作为独立维护任务，不与功能改造混做。

## 阶段C首批：生命周期与历史事务（2026-11-15）

本地新增MySQL agent_runs声明、接收/幂等/领取/租约/终态/对账仓储，以及AI模块同UOW历史接口。详见[账本说明](../development/agent-run-ledger.md)。普通聊天兼容旧AI表并隔离Agent会话；已修复重音等价ID绕过。未连接真实数据库执行DDL，未替换现有SQLite本地入口或开放生产准入。

C仍未整体验收：来源交付/工具账本、累计预算、正式网关会话重验、Worker接线和真实MySQL故障矩阵继续实现；本地SQLite事务测试不代替InnoDB行锁或迁移验收。B的Linux隔离也仍独立放行。

## C2 网关与来源预算（2026-11-15）

本地新增工具/来源持久化journal、4次工具/4次模型/64KiB完整响应预算、三受众摘要凭据、服务身份、live hooks与来源回执/提交重验，见[网关说明](../development/agent-run-gateway.md)。最终历史事务通过强制prepare回调连接这些检查；鉴权hook显式复用当前UOW，真实MySQL当前读/锁顺序仍待验。未注册新HTTP、派发Worker或修改现有SQLite协议，生产关闭。

C3继续正式会话/准入、路由与派发、版本化协议和真实MySQL故障矩阵；本库成功不代表阶段C或A–D整体验收，亦不替代B的隔离/token/资源验证。

## C3 首批：当前会话与真实MySQL（2026-11-15）

已落实正式UOW READ COMMITTED、同连接非锁定当前账户/角色查询、易失会话绑定/白名单，以及必须复用UOW的source_reader。一次性本机MySQL8.4.13通过13项真实数据库测试，默认API518项通过，见[验证说明](../development/agent-run-mysql-validation.md)。不更改旧业务默认隔离，不连接业务配置数据库，临时服务/数据已回收。

仍未组合正式HTTP/dispatcher/Worker协议，也未验真实Redis/模型/SDK端到端或数据库进程崩溃恢复。C3、B及A–D不得按首批通过整体验收，下一步继续这些实现与验证。

## C3 后续：派发控制与私有V2协议（2026-11-16）

新增single-attempt dispatcher、固定HTTPS Worker client与显式私有V2回调工厂，根request关联字段及后端生成内部schema；说明见[派发控制](../development/agent-run-dispatch.md)。只有确认领取事务提交才发start；未知确认只inspect原execution，不能确定则中断并尽力取消。账本终态不由Worker ACK自报决定。私有factory未挂公网应用，旧SQLite/v1入口保留。

新测试覆盖真实Ledger/Gateway回调、受众/根请求、确认丢失/取消顺序、并发与关停；自有loopback TLS验证信任/主机名拒绝，临时MySQL现15项通过。Worker v2服务/SDK适配/取消tombstone、真实Redis准入、部署TLS身份与Linux/崩溃矩阵仍未实现/验收，不能宣称已完成正式Worker接线或C3整体验收。

## B/C3 本地Worker V2服务与SDK执行（2026-11-16）

已新增持久启动/取消记录、mTLS控制服务工厂、固定SDK进程执行与三受众网关client，见[Worker V2说明](../development/agent-worker-v2.md)。真实0.2.2-rc.1 SDK在自有macOS loopback沙盒跑通Worker HTTP重复start去重、3次合成Messages、两工具、UUID回执与根messageId/turn结果，owned group/home清理；取消先到的迟到start被拒绝。产品Skill v2独立声明并保留v1兼容，根check/CI加入普通Worker协议测试。

这证明本地协议与进程控制，不是Linux隔离、真实模型语义、真实Redis/业务DB组合或无人值守崩溃恢复验收。持久记录容量有界且当前需离线核对清理，崩溃锁/未知孤儿失败关闭不重放；生产仍关闭，A–D未整体验收。下一步落实真实Redis准入与API组合、真实模型质量及B资源/服务身份/崩溃矩阵。

## 交付顺序

| 阶段 / 建议 PR | 修改边界 | 产物与放行条件 | 失败时处理 |
| --- | --- | --- | --- |
| A：模块与权限基础 | API core/auth、静态 registry、blog schemas/public service、contracts 导出 | 主体与能力声明；旧/新策略对照；HTTP 与工具共用公开查询；工具 JSON Schema 导出和目录检查 | 旧接口保持兼容，Agent 开关关闭 |
| B：Worker 协议与模型适配 | apps/agent-worker、ai/model_proxy、隔离测试部署 | Node SDK 版本固定；实际生效工具清单只有两项；真实模型工具选择/参数流/停止原因验证；Linux 进程、文件、出站隔离报告 | 保留 P0 与业务契约，修复适配或更换引擎，不退回无隔离执行 |
| C：持久化运行与网关 | agent_runtime、MySQL 兼容新增 schema、ai 历史公共事务接口 | 幂等、代次、租约、撤销、来源记录、终态提交、对账；Worker/API 契约集成测试 | 关闭准入；对账残留运行，保留新增表，旧聊天继续工作 |
| D：登录用户只读内测 | Web ai 模块、公开 blog-qa API、能力探测 | 三个 API、V1 SSE 最终答案/来源、状态恢复、白名单及配额；完整故障矩阵通过 | 关闭 Agent 能力并撤销运行；公开博客/普通聊天正常 |
| E：个人草稿 | blog draft 服务、作者映射、工作台 | owner 范围、幂等、版本冲突、草稿与公开数据隔离；工具仅 draft 能力 | 关闭草稿写工具，保留草稿供人工恢复 |
| F：受控发布（独立放行） | 版本集合、公开快照、outbox、全部旧读写入口与发布工具 | 迁移/停写/增量对账演练，确认消费、幂等、跨库故障、删除竞争和最低回滚版本通过 | 关闭写入，暂停消费者并对账；只能回滚兼容公开版本指针的 API |
| G：扩展 | 评论建议、只读运营、经审查 MCP | 每个模块独立权限/数据/负载验收 | 单模块停用，不影响博客读链路 |

A 与 B 可以独立实现，但 C 必须在接口与模型适配契约稳定后集成；D 依赖 A/B/C 全部通过。E 不依赖开放发布，F 不能借 E 完成而自动启用。每个 PR 更新规范中的“待实现”状态及准确证据链接，不删掉未完成的验收条件。

跨项目身份/业务接入另依赖[统一登录与隔离规范](../architecture/federated-identity-and-isolation.md)的 ID/AU/DT 矩阵；不能以本表的单项目测试替代双产品、双工作空间与用户委托验证。

## 必须通过的验收矩阵

| 范围 | 场景 | 预期结果 / 验证方式 |
| --- | --- | --- |
| 模块 | 重复 ID、模型工具别名冲突、依赖环、缺能力、Skill hash 或 bundle 漂移 | 构建/启动检查拒绝；生成契约与源码一致 |
| 认证 | 匿名发起、失效 Cookie、注销、账户禁用、Redis 故障 | 新 run 或下一次调用拒绝；不降级访客 Agent；普通访客聊天另测兼容 |
| 授权 | A 读取/取消 B 的 run；绕开 HTTP 直接调用模块服务；伪造 owner | 拒绝且不泄露对象存在性；服务层确实检查资源范围 |
| 撤销 | 运行中撤角色、关工具、取消后延迟回调 | 下一次调用/结果提交拒绝；不能由 Worker 缓存权限继续完成 |
| 内部网关 | 只有 run token、只有 Worker 凭据、错误 audience、旧 generation | 均拒绝；模型参数不能指定执行身份 |
| 博客 | 软删除、缺正文、空搜索、搜索命中但未读取、过长正文、稀疏候选 | 无泄露，无无界扫描，返回截断信息，空来源由服务端固定回答 |
| 引用 | 伪造 ID、外部 URL、Markdown/HTML、读取后删除/修改文章 | 拒绝无效来源；答案纯文本；来源变化要求重试；链接来自服务端 |
| SDK | 斜杠问题、根/子会话混杂、重复终态、max-tokens、未知停止原因 | 纯 prompt 处理；只提交匹配根 turn 的成功且校验后的结果 |
| 模型 | 跨帧参数、非法 JSON、超大输出、错误工具 ID、隐藏额外调用 | schema/字节/调用预算生效，失败明确；真实模型和 fixture 分开报告 |
| 生命周期 | 总时限、取消、SIGTERM 无响应、Worker 崩溃、API 重启 | 先撤权再回收进程组；租约对账 interrupted；无残留进程/目录 |
| 派发恢复 | 请求已送达但确认丢失、API 重启失去凭据 | 不重复启动；查询原 execution 或 interrupted；新重试使用新 run |
| 来源回执 | prepared 未回执、重复回执、hash 不符 | 未 delivered 不可引用；幂等确认，摘要冲突拒绝 |
| 页面扩展 | slot 版本冲突、模块关闭、项目切换、加载失败 | 构建拒绝不兼容；卸载清理；错误仅影响单个贡献 |
| 跨项目 | 相同资源 ID、跨项目 token、缓存/回调/幂等键 | 默认拒绝并隔离；未完成迁移不得启用第二项目 |
| 发布传播 | API 已撤回但静态 HTML/CDN 尚存在 | 标记传播未完成并执行失效，验证直达页面 |
| 幂等 | 同用户同键重复、不同参数同键、不同用户同键、重复派发 | 原 run 409/独立冲突码/账户隔离；不重复模型执行 |
| 终态 | 完成与取消并发、提交后 SSE 丢失、存储提交失败 | 只有一个终态和最终消息；GET 可恢复已提交结果；失败不伪造成功 |
| 资源 | Redis/MySQL/模型/Worker 不可用，预算耗尽 | 有界失败；不放宽鉴权、配额；博客健康不依赖 Worker |
| 隔离 | 读取宿主/其他 run home、外网/DNS/重定向访问、启动未批准工具 | Linux 实际拒绝；不把 profile 白名单当网络隔离证明 |
| 兼容 | 普通聊天、用户 Skill/persona、MCP、博客分页、SSG/canonical、首页 ICP | 保持现有行为；blog-qa 会话拒绝普通聊天编辑路径 |
| P2 写入 | 跨用户草稿、过期/重放确认、参数变动、并发版本、消费者中断/重放 | 不越权、不重复发布，上一公开快照可读，失败可对账 |

真实模型评测集至少包含有答案、无答案、多文章冲突和正文提示注入；记录固定输入、期望来源、模型版本、预算、实际输出、失败样本和人工语义判定。不得用 fixture 成功率替代语义准确率。涉及公开性变化的答案提交仍有现实时间边界：提交后撤回文章需在历史展示时隐藏失效链接；已经交付的文本无法撤回，不能承诺持续保密。

## 验证命令与新增检查归属

现有命令如下，按改动范围执行。使用仓库指定 Node/Corepack，不使用 Codex 内置 pnpm；脚本内部调用 pnpm 时也要确保 PATH 正确。

```bash
# API / schema / 公开契约变化
corepack pnpm check:api
corepack pnpm -F @sun-world/contracts generate
corepack pnpm test:contracts
corepack pnpm check:api:deploy-schema
# Web / AI 展示变化
corepack pnpm -F @sun-world/blog typecheck
corepack pnpm test:ai-ui
corepack pnpm check:web
# 合并实施 PR 前按影响范围扩展
corepack pnpm format:check
git diff --check
```

P0 实验复跑用 `./tools/dsh-blog-p0/run-local.sh`，仅支持说明中的 macOS 条件，安装阶段需要包仓库；不是生产验收命令。A 增加模块依赖/声明/生成产物检查，B 增加 Worker 测试和 Linux 隔离验证，C 增加数据库集成及故障注入；对应命令在实际 package/script 添加后才写入根 `check`，本计划不捏造已存在脚本。

完整实现集成后运行 `corepack pnpm check`。需要部署时再检查当前 Git 状态、镜像与 schema、关停方案及生产首页/API；当前本地实现按影响范围运行检查，记录已有共享工作区门禁失败，不把定向测试通过写成全部通过。

## 迁移与回滚清单

1. 新增兼容 schema，单独记录真实结构检查与 DDL 部分成功恢复办法；不开功能、不收缩旧列。
2. 发布 API 的 registry、查询和运行控制代码，Worker 部署到隔离环境，报告协议和 bundle hash。
3. 模型与 Linux 验证通过后接入 Web 能力探测，再启用指定账户；观测冷启动/峰值内存/公开博客延迟，不以 P0 单机样本作容量保证。
4. 关停演练先停止准入，拒绝新工具/模型请求，取消运行并回收 Worker；API 旧业务继续可用。
5. P2 发布前清点所有旧入口（管理页面、HTTP、SSG、CLI、开发发布 Skill）；任何绕过版本发布服务的入口未迁移，发布开关保持关闭。
6. 每次交接保存本阶段范围、变更、命令、实测结果、阻塞及下一步；Claude Code / `claude-ds` 接手必须读取本规范与本计划。

## 尚待实施中确定

- Linux Worker 的实际部署位置、内存/PID/token 硬上限与并发容量：由 B 的报告决定，作为未来 A/B 的输入，本分支先实现 A，B 仍须单独验证。
- 现有角色/resource 数据到 capability 的精确迁移：A 先做只读盘点和管理员基线，不猜测生产行内容。
- 内部 TLS/服务凭据签发与轮换、诊断保留期：D 开放前完成运维配置及演练；本地开发可用独立测试凭据，禁止导入生产密钥。
- 正文迁移总量、版本基线回填时长、最低回滚镜像：F 前实测；不能提前承诺无停写迁移。
