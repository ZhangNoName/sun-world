# 代码审查实施报告：安全与数据完整性基线

日期：2026-08-09

分支：`codex/security-integrity-baseline`

状态：第一批高风险修复已实施并通过本地门禁；未部署、未执行生产迁移。

## 结论

本轮先收口越权、凭据泄露、任意文件写入、会话失效和跨用户数据残留，并建立后续拆分需要的事务与前端端口边界，没有进行高风险大重写。

已实施：

- 用户、角色、资源和文件管理路由统一要求管理员权限；`/user/me` 仍只要求登录。
- 图片上传使用魔数识别、UUID 文件名、硬大小限制、临时文件和原子发布；拒绝 SVG、扩展名伪装与路径穿越。
- 视频上传使用 UUID 文件名和硬大小限制，转码仍交给既有后台任务。
- 管理端创建用户统一经过 PBKDF2 哈希；普通用户查询不再选择密码列，也不记录完整凭据 DTO。
- refresh 兼容仓储返回的字典；受保护请求检查 Redis 会话/撤销状态。
- 未实现的密码重置和 QQ 登录返回 HTTP 501，不再伪造成功。
- 新增连接级 MySQL Unit of Work；角色资源替换已经单事务提交或回滚。
- 修复博客整数标签崩溃、已有标签返回字典、越界页把总数错误归零。
- HTTP 层通过启动时注入的 `SessionPort` 获取会话行为，不再导入 Zustand/Auth feature；并发刷新单飞。
- AI 工作区在用户身份切换时中止请求并清空会话、消息和 provider profile。
- `@sun-world/ui` 与 `@sun-world/ai-ui` 的 build 先执行硬失败 typecheck。

## 组件和模块边界

已处理 HTTP/Auth 循环依赖、管理表格共享 Select 引用、Base UI Select 异步测试稳定性及生产 UI 边界守卫。

仍需拆分：

- `useAiChat.ts` 仍同时负责远程加载、流控制、状态迁移和 UI adapter；应拆成 reducer、stream runner、provider/history hooks。
- `ManageLayout`、`ManageDictionariesPage` 和 `manageCopy.ts` 应按导航、壳层、表格、字典编辑器和领域文案拆分。
- Blog/Admin 需要公开 facade 和跨 feature 深层导入守卫。
- Editor 的示例、备份文件和生产调试输出应在独立批次迁移清理。

## 数据库设计

已增加显式提交/自动回滚的 Unit of Work，角色资源替换已使用；博客 count 独立于当前页结果。

高优先级待处理：

1. 为 `user_roles`、`role_resources`、`blog_tag`、AI 会话/消息/反馈补齐并验证外键策略。
2. 用户身份增加归一化唯一约束；上线前先执行只读重复值和孤儿数据审计。
3. Blog MySQL/Mongo 双写改为 MySQL outbox + 幂等 Mongo worker。
4. AI provider 默认项、消息编辑/后代删除、sequence 分配纳入 UoW；锁定会话后原子分配序号。
5. 为博客排序增加 `(is_deleted, updated_at, id)`、`(is_deleted, created_at, id)`、`(is_deleted, view_num, id)` 并用真实数据 `EXPLAIN`。

本轮没有自动生成或执行生产迁移。约束上线必须按“只读审计 -> 备份 -> 清理 -> 前向迁移 -> 验证 -> 回滚/前向修复预案”评审。

## 功能缺陷状态

已修复：管理越权、上传路径与伪装、明文密码、refresh 字典崩溃、logout 撤销失效、认证接口假成功、博客标签崩溃、分页 total 错误、AI 跨用户残留、HTTP/Auth 循环。

已识别但未在本批次冒险修改：跨 MySQL/Mongo 原子性、AI 多语句事务与并发 sequence、数据库迁移、Admin/AI/Editor 大组件，以及接近上限的入口和 Video chunk。

## 验证

- `corepack pnpm check:api`：通过，71 项 API 测试。
- `corepack pnpm check:web`：通过，48 个测试文件、116 项 React 测试；生产构建、SSG、边界和预算通过。
- `corepack pnpm check:compose`：静态检查通过；本机无 Docker CLI。
- Web gzip：JS 1220.4 / 1360 KiB，CSS 44.7 / 50 KiB；入口 175 / 180 KiB，余量偏小。

现有非阻断告警：Pydantic v2 `Field(example=...)`、React `act`、jsdom XHR、Rollup UMD globals 和 Node `DEP0190`。

## 后续顺序

1. 评审本安全基线，并在 staging smoke 登录/刷新/退出、管理拒绝、上传和 AI 用户切换。
2. 独立分支实现数据库审计 SQL、外键/索引迁移和回滚预案。
3. 将 AI 多语句写迁移到 UoW，并引入 Blog outbox。
4. 完成 AI reducer/runner、feature facade、Admin 拆分和 Editor 清理。
5. profile 入口、Video 和图表 chunk，恢复至少 10% 可持续预算余量。

## 2026-08-10 UI 消费边界实施补充

本轮继续执行已批准的组件治理方案，没有合并 `@sun-world/base-ui` 与
`@sun-world/ui`。前者继续负责通用无障碍原语，后者继续负责项目协议组件和
组合组件；应用与消费包只能通过这两个包的公开导出使用 UI 能力。

已完成：

- 将 AI Composer 的按钮、文本域和附件选择入口迁移到 Base UI；原生文件
  input 被隔离进 `AiFilePicker`，作为唯一受审计的浏览器能力适配器。
- 将 AI UI 的侧栏遮罩、反馈表单和 Markdown 表格迁移到 Button、Label、
  Textarea 与复合 Table 原语，并增加 `data-slot` 回归断言。
- 删除 Icons 包中越权承担按钮职责的 `SunIconButton`，使 Icons 恢复为纯图标包。
- 将全局 `components/Waterfall` 收归 Blog 模块，删除未路由的旧 Manage 壳、
  重复 Admin 日志页面/Hook 和不再接线的检查脚本。
- 扩展 UI 边界门禁到全部消费包：禁止生产 JSX 自建原生交互/表格元素、
  禁止直接引用第三方 UI 原语库，并禁止重新建立应用级 `shared/ui`。
- 为 `@sun-world/ai-composer` 增加独立 typecheck，并使 build 在打包前强制
  执行；根门禁同时校验这一发布包协议。

最终 `corepack pnpm check` 全部 19/19 通过：Web 45 个测试文件/112 项测试，
API 71 项测试，Icons/UI/AI 包测试与构建、Web 构建/SSG/预算、MySQL schema、
格式、Git 空白和 Compose 静态检查均通过。现有 React `act`、jsdom 网络、
Pydantic v2、UMD globals 和 Node 弃用信息仍为非阻断告警。

## 合并与部署

- `9aa5fdb9` 已快进合并到 `main`；`188a16dd` 修复了干净 CI 中依赖包未先
  构建的问题，并阻止发生变化的目标在镜像构建被跳过时进入部署。
- 首次自动流水线 `31346060274` 在镜像检查阶段停止，未替换生产容器。
- 手动 `build-and-deploy / all` 流水线 `31346480765` 成功：Web/API 质量
  检查、两套 Lighthouse 镜像、schema guard、候选 API、生产切换和公网
  探活均通过。
- 独立验证确认主站、WWW、`/aigc` 返回 200，API `/healthz` 返回
  `{"status":"ok"}`，浏览器渲染后的首页包含正确的 ICP 文案和工信部链接。
