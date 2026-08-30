# Sun World 全面架构与体验审查

日期：2026-08-29

范围：`apps/api`、`apps/web`、共享 packages、构建/Compose 脚本、架构文档、桌面与移动端核心页面

## 结论

当前仓库的总体方向是合理的：React/FastAPI 分层清楚，前端已经采用业务模块注册与共享包边界，后端也具备 controller、router、database、type 的基础分层。此次审查未发现需要立即停服处理的 P0 问题，但发现并修复了依赖供应链、API 分页与批量查询、动态更新字段、天气定位隐私、移动导航、性能预算和校验脚本等一组会实际影响安全性、正确性或维护成本的问题。

修复后的状态：生产依赖已知漏洞为 0，根级门禁 19/19 通过，Web 119 项测试与 API 77 项测试通过，入口模块 gzip 为 161.9 KiB（预算 180 KiB），Compose 静态校验恢复有效。

## 审查方法

- 阅读仓库规则、现状、工程约定、架构与交接文档。
- 静态检查前后端、共享包、路由、状态管理、数据访问、构建与部署边界。
- 检查约 4.9 万行 TypeScript/TSX/Python，并单独识别生成文件和大型模块。
- 执行生产依赖安全审计、类型检查、单元测试、包构建、Web SSG、性能预算、API 协议与 Compose 校验。
- 在 1440px 桌面和 390px 移动视口审查首页、登录、移动导航和 AI 工作区的明暗主题、层级、间距、文案与可访问语义。

## 已修复问题

### P1：生产依赖存在大量已知漏洞

生产依赖审计原先报告 72 个已知漏洞（32 个 high、37 个 moderate、3 个 low）。升级 Vite、Axios、ECharts、React Router、UUID 及相关传递依赖，并把仅用于生成样式的 `shadcn` 调整为开发依赖。修复后：

- `pnpm audit --prod --audit-level moderate`：0 个已知漏洞。
- 构建期样式依赖仍由 `packages/base-ui` 明确持有，守卫脚本同步校正为检查 `devDependencies`。
- 所有共享包与 Web 生产构建通过。

### P1：用户列表分页总数错误且存在 N+1 查询

`UserManager.get_user_by_name` 原先调用了错误的执行接口，并在提前返回后保留不可达代码；路由还把当前页长度当成总数。现已：

- 使用独立 `COUNT(*)` 返回真实总数。
- 对角色和资源做批量查询，一页固定为用户、角色、资源三次查询，避免随用户数线性增长。
- 将 `page`、`page_size` 限制为有效范围，最大页大小为 100。
- 增加分页和查询次数回归测试。

### P1：管理接口动态更新字段缺少边界

用户、角色、资源更新曾直接把关键字拼成 SQL 字段名，调用层一旦传入额外字段就可能形成越权字段修改或无效 SQL。现已：

- 为三类实体设置可写字段白名单。
- 拒绝空更新和未知字段。
- Pydantic 请求模型集中到 `src/type/management_type.py`，可选字段使用真实默认值并增加长度限制。
- 删除资源时，在同一 MySQL 事务中先删除角色关联，再删除资源，避免悬挂关系。
- 角色资源列表改为批量查询，消除 N+1。

### P1：天气定位在页面启动时自动发生

首页原先在 `main.tsx` 启动阶段自动请求浏览器位置，并依赖全局可变对象和 `localStorage` 方法替换。现已：

- 只有用户点击“查看本地天气”后才请求定位。
- 请求支持中止、超时、错误态和 15 分钟缓存。
- 高德地址和和风天气请求并行执行，组件卸载或重试时会取消旧请求。
- 删除全局天气状态和 `localStorage` monkey patch。
- 未加载时不再渲染空的 `°C`、`km/h` 指标。

### P2：性能预算校验存在假绿，入口包超预算

构建摘要脚本原先只检查结果结构，不会因为 `ok: false` 失败，而且把“入口预算”当普通匹配处理。升级依赖后，真实入口包达到约 180.1 KiB，超过 180 KiB 限制。现已：

- 从 `dist/index.html` 解析真实入口模块。
- 任一预算失败会让门禁失败。
- 将 Axios 提取为稳定的 `vendor-http` 缓存边界，入口模块降至 161.9 KiB。
- 最终总 JS gzip 1262.3/1360 KiB、总 CSS gzip 44.8/50 KiB，全部预算通过。

### P2：Compose 校验在 profile 场景下误报

API 服务位于 Compose `api` profile，旧校验未启用 profile，因而把有效配置误判为缺少 API。现已用 `--profile api` 校验服务和渲染配置，并同时兼容 Compose 原始端口字符串与标准化对象输出。

### P2：移动导航文案、可访问性和布局不统一

移动抽屉原先直接显示 `/aigc` 等内部路径片段，底部图标在窄屏隐藏文字后缺少可访问名称，抽屉内容还被网格拉伸出不合理的大段间距。现已：

- 导航数据集中定义并接入中英文翻译。
- 抽屉显示“首页、博客、画布、AI 助手”等产品文案。
- 图标快捷入口增加 `aria-label`，菜单、显示偏好、移动导航都有明确语义。
- 主题和语言操作合并到固定的偏好区域，抽屉内容从顶部自然排列。

### P2：日志和模型默认值不够安全

- 博客创建和读取不再记录整篇内容，只记录长度、分类、标签数和查找结果等元数据。
- 博客分页参数、排序字段和排序方向使用白名单与长度限制。
- Pydantic 列表默认值改为 `default_factory`，示例元数据迁移到当前写法。

### P3：源码目录混入备份/试验文件及生产调试输出

- 删除未被引用的 `packages/editor/src/editor.bak.ts` 与 `packages/editor/src/test-ruler.ts`。
- 清理编辑器高频渲染、光标、拖拽和工具链中的生产 `console` 输出。
- 重写当前项目架构与前端平台文档；对仍有参考价值的 Vue 时代文档增加历史/迁移标记，并同步更新平台门禁中的 React 请求链与类型检查命令。

## UI 与主题审查

| 流程 | 结果 | 证据 |
| --- | --- | --- |
| 首页桌面浅色 | 信息层级和备案位置一致；天气改为明确授权 | [修复前](../design-qa/architecture-review-2026-08-29/01-home-desktop-light.jpg)、[修复后](../design-qa/architecture-review-2026-08-29/08-home-desktop-fixed.jpg) |
| 首页移动浅色 | 底部导航、备案和内容区无横向溢出 | [修复前](../design-qa/architecture-review-2026-08-29/02-home-mobile-light.jpg)、[修复后](../design-qa/architecture-review-2026-08-29/06-home-mobile-fixed.jpg) |
| 移动导航明/暗主题 | 文案、焦点、间距、主题/语言操作已统一 | [原始浅色](../design-qa/architecture-review-2026-08-29/03-mobile-navigation.jpg)、[原始暗色](../design-qa/architecture-review-2026-08-29/04-mobile-navigation-dark.jpg)、[最终状态](../design-qa/architecture-review-2026-08-29/11-mobile-navigation-final.jpg) |
| 登录桌面暗色 | 品牌面板与表单暗色表面形成有意的高对比，不属于主题漂移 | [截图](../design-qa/architecture-review-2026-08-29/05-login-desktop-dark.jpg) |
| AI 工作区桌面暗色 | 侧栏、编辑区、输入框和状态文案使用同一暗色层级；未发现裁切或溢出 | [截图](../design-qa/architecture-review-2026-08-29/12-aigc-desktop-dark.jpg) |

浏览器审查时本地 API 未启动，因此首页展示了真实错误态和重复通知；这不影响布局结论，但暴露出通知去重仍可改善，已列入后续项。

## 文件结构与模块边界判断

当前目录划分总体符合职责：

- `apps/web/src/modules/*` 适合承载业务模块，`shared/*` 与 `packages/*` 适合跨模块协议和 UI 基础能力。
- `apps/api/src/routers`、`controller`、`database`、`type` 的依赖方向基本清楚；本次把管理请求模型从路由文件抽出，进一步降低了 HTTP 层体积。
- `packages/base-ui` 负责低层组件，`packages/ui` 负责产品级组合，`packages/icons`、`contracts`、`editor` 和 AI packages 的职责可辨认。
- `docs/architecture` 之前混有当前架构与历史 Vue 方案，现已明确区分，不再让旧文档看起来像当前执行标准。

仍然过大的模块不应机械按行数拆分，但下面几处已达到下一轮重构阈值：

- `apps/web/src/modules/ai/composables/useAiChat.ts`：634 行；建议按会话加载、流式运行、消息编辑和 provider profile 拆成独立 hooks/服务。
- `apps/web/src/modules/admin/components/ManageLayout.tsx`：543 行；建议拆出导航模型、账户菜单、移动壳与桌面壳。
- `apps/web/src/modules/admin/pages/ManageDictionariesPage.tsx`：438 行；建议拆出 schema、列表配置和编辑表单。
- `apps/web/src/modules/admin/manageCopy.ts`：772 行；建议按领域切分 locale namespace，避免单文件成为所有管理模块的编译耦合点。
- `apps/api/src/database/mysql/schema_migration.py`：552 行；建议把不可变 schema、增量 migration 和校验器分离。

## 未在本轮直接修改的风险

### P2：博客跨 MySQL/Mongo 写入缺少最终一致性机制

博客元数据与正文跨两个数据库。单个 MySQL 事务无法覆盖 MongoDB，进程中断可能产生一侧成功、另一侧失败。该问题需要 outbox、补偿任务或以单一数据库为写入真源，涉及数据迁移和运维策略，不适合在没有备份与回滚方案时直接改写。

### P2：数据库关系约束需要正式 migration

角色、资源、用户关联目前主要依赖应用逻辑。应审计线上数据后，为关联表补齐外键、唯一约束和常用过滤/排序索引；直接加约束可能因历史脏数据导致部署失败。

### P3：错误通知需要全局去重策略

当本地或上游 API 整体不可用时，不同模块会同时发出相似 toast。建议在 HTTP 边界按错误类别与时间窗去重，同时保留操作级错误的具体文案。

### P3：构建预算余量仍需持续观察

视频页 208.6/220 KiB、JSZip 27.6/30 KiB、CSS 44.8/50 KiB，余量不大。应保持路由级懒加载，并把 build summary 作为 CI 历史产物观察趋势，而不是放宽阈值。

### P3：构建工具版本提示

Editor 声明构建仍提示 API Extractor 内置 TypeScript 5.4.2 与项目 TypeScript 5.9.3 不一致。当前产物和测试通过，但后续应统一 API Extractor/TypeScript 工具链版本。

### 运维注意事项

浏览器端地图/天气 key 本质上是公开凭据，应在服务商后台限制域名、来源和配额；如出现滥用或需要隐藏计费凭据，应改为后端代理。跨库一致性和数据库约束改造前必须先做生产数据审计与可回滚备份。

## 验证记录

- `corepack pnpm check`：19/19 通过。
- Web：46 个测试文件、119 项测试通过；类型检查、生产构建、SSG、UI/图标/AI 包测试和构建通过。
- API：113 个 Python 文件编译通过，77 项 unittest 通过，schema、日志、指标、AI、CORS、数据库边界协议通过。
- `corepack pnpm audit --prod --audit-level moderate --registry=https://registry.npmjs.org`：0 个已知漏洞。
- 性能预算：总 JS 1262.3/1360 KiB；总 CSS 44.8/50 KiB；入口 161.9/180 KiB。
- Compose：配置、profile、端口、缓存和 SPA fallback 静态校验通过；未启动、删除或重建容器。
- `git diff --check`：通过。

本轮未执行 commit、push、MR 或部署；工作区中原有的博客无限滚动、本地端口和 API 启动脚本修改均保留并一起通过了最终门禁。
