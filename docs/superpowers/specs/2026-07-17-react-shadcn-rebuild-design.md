# React + shadcn 全量前端重构设计

日期：2026-07-17  
状态：已批准（用户已明确授权自主决定方案与实施，且要求勿中途询问）

## 目标

把 Sun World 的浏览器端从 Vue 3 完整迁移到 React，同时把
`@sun-world/ui` 重建为基于 shadcn/ui 源码模式的项目自有组件层。迁移后必须保留
现有 URL、API 契约、业务流程、响应式布局、SEO/SSG、遥测、性能分包和 ICP 备案展示。

“完整迁移”的含义是生产前端、共享 UI 包和图标的框架适配层不再依赖 Vue、Pinia、
Vue Router、vue-i18n、Element Plus、md-editor-v3 或 Vue SFC。FastAPI 后端、
`@sun-world/contracts` 和框架无关的 `@sun-world/editor` 画布引擎不重写。

## 当前基线

- 基线提交：`ec81c24c`。
- 隔离分支：`refactor/react-shadcn`。
- Vue SFC 共 79 个，其中应用 56 个、UI 包 10 个、图标包及预览 13 个。
- 现有 `corepack pnpm check:web` 在原工作区和隔离工作区均通过。
- 当前生产构建包含 30 篇文章 SSG、前端清单、性能预算与路由分包守卫。
- 当前 `main` 比 `origin/main` 领先 3 个提交且未分叉；远端已执行
  `git pull --ff-only origin main`，结果为 up to date。

## 方案比较

### 方案 A：原地大爆炸替换

直接删除 Vue 入口、批量改名并集中修复。代码最终最干净，但迁移期间没有可运行基线，
业务回归定位困难，尤其不适合 AI 流式响应、画布、SSG 和后台指标这些互不相同的流程。

### 方案 B：长期双框架共存

按路由分别挂载 Vue 和 React，逐步切流。每个阶段都能上线，但需要双路由、双主题、
双状态和双遥测桥接，生产包长期携带两套运行时，清理成本高且容易形成永久过渡层。

### 方案 C：隔离分支内纵切片迁移，最终单次入口切换（采用）

先把现有行为固化为框架中立测试，再依次迁移基础设施、共享组件和业务模块。Vue 入口在
分支内保留到 React 已覆盖全部路由，但生产构建始终只选择一个入口；最后一次性切换到
React 并删除 Vue 依赖和 SFC。它兼顾可验证性与最终产物纯净度。

## 技术栈

- React 19 + TypeScript，Vite SPA 构建。
- React Router 7 Data Mode。保留当前自定义 Nginx SPA fallback 与构建后 SSG，暂不引入
  React Router Framework Mode，避免同时改变部署模型。
- shadcn/ui 的 monorepo 源码所有权模式，Tailwind CSS 4，Radix primitives，
  class-variance-authority、clsx、tailwind-merge、Lucide React 和 Sonner。
- Zustand 只管理认证会话和设备信息等客户端全局状态；服务端数据继续由模块 hooks 调用
  现有 typed API，不在本次迁移额外引入缓存语义。
- react-i18next + i18next 替代 vue-i18n，继续使用现有 `zh.json` / `en.json`。
- react-markdown + remark-gfm + rehype-slug + rehype-sanitize 用于安全文章渲染和目录；
  `@uiw/react-md-editor` 作为路由懒加载的写作器，并复用同一安全预览协议。
- Vitest、React Testing Library 和 user-event 用于组件/业务测试；保留现有 Node 协议检查，
  但把 Vue 文件名和源码模式断言改成 React 等价断言。

## 组件架构

### `@sun-world/ui`

应用只允许从稳定子路径导入 Sun World 组件，例如：

```ts
import { SunButton } from '@sun-world/ui/button'
import { SunDialog } from '@sun-world/ui/dialog'
```

包内分为三层：

```text
packages/ui/src/
  primitives/       # shadcn/Radix 派生源码，私有
  components/       # SunButton、SunDialog 等产品协议封装
  contracts/        # 公共 props、variant 和 item 类型
  lib/               # cn、variant 与可访问性辅助函数，私有
  styles/            # Tailwind v4、Sun token 映射与组件样式
```

应用不得直接导入 Radix、`components/ui/*`、包内 `src/*` 或 shadcn CLI 生成路径。
Tailwind/shadcn token 映射到现有 `--bg-*`、`--text-*`、`--color-*` 和
`--radius-*` 变量，保留 `sun-light` / `sun-dark` 主题类和跨标签页同步。

迁移后的公共组件至少包括 Button、Input、Textarea、Label、FormField、Select、Checkbox、
Dialog、DropdownMenu、Tabs、Toast、Tooltip、Card、Skeleton、Tag、Pagination、DatePicker、
List、ChatShell 和 ChatComposer。复杂业务表格仍归 admin/blog 模块，不抽象成万能表格。

### `@sun-world/icons`

保留框架无关的图标数据、SVG 渲染函数和类型。新增 React 适配入口
`@sun-world/icons/react`，提供 `SunIcon` / `SunIconButton`；品牌和编辑器自定义 SVG 改成
React 组件。普通 UI 图标继续走统一名称映射，底层可以使用 Lucide，但应用不直接散落
Lucide 导入。

### `@sun-world/editor`

画布引擎继续保持 DOM/TypeScript 核心。仅将 Vue 页面和树/工具栏包装器改为 React hooks
与组件，并在卸载时释放事件、编辑器实例和 DOM 订阅。

## 应用基础设施

### 路由与模块注册

保留模块 manifest 概念，`AppModule` 改为 React Router route object。模块注册继续聚合
路由、导航、SEO 默认值和可选 preload。所有页面使用 `React.lazy`，catch-all 始终最后，
重复 path 在开发环境告警并跳过。

保留以下 URL 与行为：

| URL | React 页面 | 必须保留的行为 |
| --- | --- | --- |
| `/`, `/home` | HomePage | 个人信息、天气、博客流、响应式侧栏、首页唯一 ICP 备案 |
| `/blog/:id`, `/blog?id=` | BlogDetailPage | 两种 id 形式、文章元数据、安全 Markdown、目录与活动标题 |
| `/new_article` | ArticleEditorPage | 标题/分类/标签、Markdown 编辑、校验、创建文章 |
| `/login`, `/register` | 认证页 | 独立全屏壳、字段校验、错误内联、成功导航 |
| `/me`, `/qq` | 账户页 | 个人入口与 QQ 回调兼容 |
| `/aigc` | AigcPage | 全屏 AI 壳、会话列表、普通与流式响应、中止与错误状态 |
| `/manage` | ManagePage | 总览、博客、AI、指标、日志标签切换 |
| `/manage/metrics` | AdminMetricsPage | 请求/RUM 指标、告警、历史、刷新与图表懒加载 |
| `/manage/logs` | AdminLogsPage | 严重级别/事件过滤、刷新、空态、错误态、保留策略说明 |
| `/canvas` | EditorCanvasPage | 工具选择、图层树、属性面板、画布生命周期 |
| `/video` | VideoPage | URL 播放、Artplayer/HLS、复制、播放器销毁 |
| `/game_tiles` | GameTilesPage | 图片上传、切片配置、预览、整图/切片/JSON 导出 |
| `/tools`, `/keep` | 简单页面 | 原有内容与导航 |
| `*` | NotFound | 404 页面与返回入口 |

桌面/移动壳根据同一 `useDeviceStore` 断点逻辑选择。`hideHeader`、`hideFooter` 和
`className` 路由元数据继续控制认证、AI 与画布页面的全屏布局。

### 状态、主题与国际化

- Zustand auth store 保留 cookie 中 token、仅存过期时间、device id、登录、注册、用户
  查询、刷新判断和清理语义。
- device store 保留 768px 手机判断、iPad/iOS、Telegram Mini App 与 resize 生命周期；
  删除当前无效的 Vite 内部类型导入和演示性 Telegram 颜色副作用。
- ThemeProvider 在 `<html>` 维护 `sun-light` / `sun-dark`、`color-scheme`、localStorage
  和 storage 事件。
- I18next 初始化读取 `locale`，同步 `<html lang>` 和跨标签页变化。

### API、错误与遥测

现有 Axios 实例、`ApiError`、请求 id、cookie credentials、envelope 解包和
`@sun-world/contracts` typed helpers 保持签名。唯一框架耦合点是错误提示和 auth store：
改为框架无关 toast adapter 与 Zustand `getState()`，避免在拦截器中调用 React hook。

AI SSE/分块流保持 fetch、AbortSignal、逐块解析和会话更新语义。错误提示通过 Sonner，
认证页仍用内联错误，不让全局 toast 覆盖表单上下文。

遥测模块移除 Vue Router 类型，接收一个最小导航订阅接口；继续上报 Web Vitals、路由
耗时、全局错误、Promise rejection、API timing/error 和 request id。

### SEO 与 SSG

SEO helper 改为 React hook + 框架无关 DOM writer。模块 route meta 负责默认 head；文章
详情在数据到达后覆盖 title、description、canonical、Open Graph 和 BlogPosting JSON-LD。
继续支持 `/blog/<id>` canonical 和 `/blog?id=<id>` 兼容路径。

`prerender-public-pages.mjs` 保持构建后静态生成模型：根页、`/home.html`、文章
`/blog/<id>.html`、sitemap 和 API 失败非阻塞策略不变。生成 HTML 的 root 标记和脚本入口
更新为 React，但 Nginx `try_files $uri $uri.html $uri/ /index.html` 不变。

## 业务模块迁移顺序

1. React/Vite/测试工具链、路由、主题、i18n、API adapter、SEO、遥测与空壳。
2. `@sun-world/icons/react` 和 shadcn 驱动的 `@sun-world/ui`。
3. 桌面/移动布局、首页、博客列表与 ICP，确保第一个可验证纵切片。
4. 文章详情与写作，替换 Vue Markdown 依赖并验证 SSG/目录/安全。
5. 登录、注册、个人页与 QQ 回调。
6. AI 会话与流式响应。
7. 管理壳、博客管理、指标、图表和审计日志。
8. 画布编辑器 React 适配。
9. 视频、游戏切片、tools、keep 与 404。
10. 删除所有 Vue/Element/Pinia 依赖、SFC、声明和 Vue 专用构建规则，收紧守卫。

每一步都要求先有失败的行为测试，再写最小实现，通过后才清理对应 Vue 文件。迁移中的
React 页面不会在生产入口与 Vue 页面同时挂载。

## 错误处理与边界

- 顶层和路由级 ErrorBoundary 提供恢复入口并上报 telemetry。
- 数据页面明确区分 loading、empty、error、stale/refreshing 状态。
- 网络错误保留 `ApiError.code/status/requestId`，用户可见消息不暴露响应体或凭据。
- AI 流在导航、重新发送和卸载时 abort，已收到的内容保留。
- Artplayer、ECharts、IntersectionObserver、ResizeObserver 和 SWEditor 均在 effect cleanup
  释放。
- SSG 调用生产 API 失败时仍输出首页和基础 sitemap，并打印非敏感 warning。

## 可访问性

- 所有表单控件具备可见 label 或明确 aria-label；错误用 `aria-describedby` 关联。
- Dialog、Select、Dropdown、Tabs、Tooltip 使用 Radix 的键盘、焦点陷阱和焦点恢复语义。
- 导航、图标按钮、复制、返回顶部、发送与删除操作有可访问名称。
- loading bar 保留 progressbar，动态流消息使用合适的 live region。
- 保留 `prefers-reduced-motion`，暗色/亮色焦点环满足可见性。

## 测试与验收

### 组件与业务测试

- `@sun-world/ui` 每个交互组件覆盖正常、禁用、标签、键盘和公共子路径导出。
- `@sun-world/icons` 覆盖名称解析、SVG 属性、未知图标 fallback 和 React 入口。
- auth、device、API envelope、route merge、SEO、SSE parser、Markdown heading/catalog、
  tile export 等纯逻辑有单元测试。
- 每个路由至少有一个 React Testing Library smoke/behavior 测试；登录、注册、博客、AI、
  admin、canvas、video 和 game tiles 覆盖关键交互。

### 协议与构建测试

- 现有 API route usage、secret scan、AI、博客流、目录、SSG、ICP、footer 和 public entry
  守卫改为 React 文件与等价行为，不降低断言。
- 类型检查改为 `tsc -b --noEmit`；生产构建必须无 Vue 编译器。
- chunk guard 继续要求 video、tile export、Markdown reader/editor、admin charts、manage、
  auth 和 legacy tool routes 为路由懒加载，且不得出现在 entry preload。
- 删除 Element chunk 后调整预算，但新的总 JS/CSS、entry 和最大 chunk 上限不得宽于迁移前
  实测，除非文档记录可复现原因。
- `corepack pnpm check`、`git diff --check` 和 `corepack pnpm format:check` 全部通过。

### 浏览器验收

在本地 production preview 验证桌面和移动宽度：所有路由可达、主题/语言切换、首页滚动与
返回顶部、博客详情/目录、认证校验、AI 流中止、管理过滤、画布交互、视频销毁、切片导出、
刷新深链和 404。首页必须显示 `豫ICP备2024081960号` 并链接
`https://beian.miit.gov.cn/`，其他路由不得重复展示。

## 完成定义

- `rg --files -g '*.vue'` 在生产源码和共享包中无结果；示例/归档也不保留可构建 Vue 入口。
- package manifests、lockfile、Vite、tsconfig 和 CI 不含 Vue、Pinia、Vue Router、
  vue-i18n、Element Plus、md-editor-v3 或 Vue 插件。
- 所有上述 URL、API、状态和业务交互通过自动化与浏览器验收。
- SSG、sitemap、构建清单、性能预算、Docker/Nginx 和 CI/deploy 协议通过。
- `docs/current-state.md` 与分支 handoff 记录变更、验证、风险和下一步。

## 风险与缓解

- **范围过大导致遗漏**：用路由/业务矩阵和原有协议检查逐项销账，不按文件数判断完成。
- **Markdown XSS 或目录漂移**：reader 默认跳过原始 HTML并使用 sanitize，heading id 与目录
  来自同一 AST 规则。
- **样式被 Tailwind reset 破坏**：Tailwind 只从 UI 全局入口加载，先做 token 映射，再迁移
  页面；Markdown、canvas、Artplayer 使用隔离容器样式。
- **bundle 变大**：所有重依赖保持 route lazy，ECharts 按需导入，shadcn 源码按子路径消费。
- **现有检查绑定 Vue 源码**：先把检查改成框架中立测试且确认会对缺失 React 行为失败，
  再删除旧检查。
- **主分支中间态不可部署**：全部工作在隔离分支完成，未通过完整验收前不合并或部署。
