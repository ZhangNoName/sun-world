# React + shadcn 全量前端重构实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Sun World 的 Vue 生产前端、UI 包和图标适配层完整迁移到 React，并用项目自有 shadcn/ui 封装保持全部现有业务行为。

**Architecture:** 在隔离分支内按业务纵切片测试先行迁移，React Router 模块 manifest 保持现有路由与 SEO 结构，`@sun-world/ui` 在私有 shadcn/Radix primitives 上暴露稳定 Sun 组件子路径。FastAPI、contracts 与纯 TypeScript 画布引擎不改，最终一次切换入口并删除 Vue 运行时。

**Tech Stack:** React 19、React Router 7 Data Mode、TypeScript、Vite、Tailwind CSS 4、shadcn/ui、Radix、Zustand、react-i18next、Vitest、React Testing Library、react-markdown、@uiw/react-md-editor。

## Global Constraints

- 工作目录固定为 `E:\MyProject\sun-world\.worktrees\react-shadcn`，分支固定为 `refactor/react-shadcn`。
- 项目命令必须使用 Node `24.17.0` 和 `corepack pnpm` `10.15.1`。
- 所有现有 URL、API route 常量、cookie、request id、错误 envelope、SEO、SSG、遥测、ICP 与响应式行为保持兼容。
- 应用公共 UI 只从 `@sun-world/ui/<component>` 导入；Radix、shadcn 内部路径和 Lucide 不泄漏到业务模块。
- 每个生产行为先写失败测试并确认因 React 行为缺失而失败，再写最小实现；配置/清单也先写协议检查。
- 每个任务只运行其窄测试；最终任务必须运行 `corepack pnpm check`、`corepack pnpm format:check`、`git diff --check` 和浏览器验收。
- 首页必须且仅首页展示 `豫ICP备2024081960号`，链接 `https://beian.miit.gov.cn/`。
- 不读取、打印或提交 `apps/api/data`、`.env`、token、密码、证书或其他秘密。

---

### Task 1: React 工具链与行为测试基座

**Files:**
- Create: `scripts/check-react-migration-toolchain.mjs`
- Create: `apps/web/src/test/setup.ts`
- Create: `apps/web/src/test/render.tsx`
- Create: `apps/web/vitest.config.ts`
- Create: `apps/web/tsconfig.app.json`
- Create: `apps/web/tsconfig.node.json`
- Modify: `package.json`
- Modify: `apps/web/package.json`
- Modify: `apps/web/tsconfig.json`
- Modify: `apps/web/vite.config.ts`
- Modify: `scripts/check-web.mjs`

**Interfaces:**
- Consumes: repository Node/pnpm constraints and existing `@/*` alias.
- Produces: `renderApp(ui, options)`, jsdom setup, `test:react`, `typecheck`, and a protocol check that rejects missing React/shadcn dependencies.

- [ ] **Step 1: Write the failing toolchain protocol test**

```js
const web = readJson('apps/web/package.json')
requireDependency(web, 'react')
requireDependency(web, 'react-dom')
requireDependency(web, 'react-router')
requireDependency(web, 'zustand')
requireDependency(web, 'react-i18next')
rejectDependency(web, 'vue')
```

- [ ] **Step 2: Run it and confirm RED**

Run: `node scripts/check-react-migration-toolchain.mjs`  
Expected: FAIL because `apps/web/package.json` still declares Vue and lacks React.

- [ ] **Step 3: Add the React test/build dependencies and shared renderer**

`renderApp` must wrap React Router memory routing, i18n, theme, toast and error boundary providers; it accepts `route` and `router` options so later route tests do not duplicate setup. Keep the Vue Vite plugin only until Task 11, but make React the only framework accepted by the new protocol when `SUN_WORLD_REACT_CUTOVER=1` is set.

- [ ] **Step 4: Verify GREEN without cutting over production**

Run: `node scripts/check-react-migration-toolchain.mjs --transition && corepack pnpm -C apps/web exec vitest run --passWithNoTests`  
Expected: PASS with React test environment initialized and existing Vue build untouched.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml apps/web/package.json apps/web/tsconfig.json apps/web/tsconfig.app.json apps/web/tsconfig.node.json apps/web/vite.config.ts apps/web/vitest.config.ts apps/web/src/test scripts/check-react-migration-toolchain.mjs scripts/check-web.mjs
git commit -m "build(web): 建立 React 迁移测试基座"
```

### Task 2: shadcn 驱动的 UI 包与 React 图标入口

**Files:**
- Create: `packages/ui/components.json`
- Create: `packages/ui/src/lib/cn.ts`
- Create: `packages/ui/src/styles/globals.css`
- Create: `packages/ui/src/primitives/{button,input,textarea,label,select,checkbox,dialog,dropdown-menu,tabs,tooltip,card,skeleton}.tsx`
- Replace: `packages/ui/src/components/*.vue` with matching `.tsx` components
- Create: `packages/ui/src/components/{SunTextarea,SunLabel,SunSelect,SunCheckbox,SunDialog,SunDropdownMenu,SunTabs,SunToast,SunTooltip,SunCard}.tsx`
- Create: `packages/ui/src/contracts/{textarea,label,select,checkbox,dialog,dropdown-menu,tabs,toast,tooltip,card}.ts`
- Create: `packages/ui/src/{textarea,label,select,checkbox,dialog,dropdown-menu,tabs,toast,tooltip,card}.ts`
- Replace: `packages/ui/src/components/*.spec.ts` with React Testing Library contract tests
- Modify: `packages/ui/package.json`
- Modify: `packages/ui/vite.config.ts`
- Modify: `packages/ui/vitest.config.ts`
- Modify: `packages/ui/tsconfig.json`
- Create: `packages/icons/src/react/SunIcon.tsx`
- Create: `packages/icons/src/react/SunIconButton.tsx`
- Create: `packages/icons/src/react/index.ts`
- Replace: `packages/icons/src/icons/{brand,editor,pointer}/*.vue` with `.tsx`
- Modify: `packages/icons/src/index.ts`
- Modify: `packages/icons/package.json`
- Modify: `packages/icons/vite.config.ts`
- Modify: `packages/icons/vitest.config.ts`
- Modify: `scripts/check-ui-package-boundary.mjs`
- Modify: `scripts/check-icon-boundary.mjs`

**Interfaces:**
- Consumes: existing Sun component contracts, icon data and theme variables.
- Produces: React `Sun*` subpath exports and `@sun-world/icons/react`; consumers never see Radix/shadcn internals.

- [ ] **Step 1: Write failing React contract tests for every public component**

```tsx
it('blocks button interaction while disabled', async () => {
  const onClick = vi.fn()
  render(<SunButton disabled onClick={onClick}>Save</SunButton>)
  await userEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(onClick).not.toHaveBeenCalled()
})
```

Dialog/select/dropdown/tabs tests must additionally cover keyboard open, navigation, escape, focus restore and accessible labels. Icon tests must cover named SVG, size/stroke props and unknown-name fallback.

- [ ] **Step 2: Run package tests and confirm RED**

Run: `corepack pnpm -F @sun-world/ui test && corepack pnpm -F @sun-world/icons test`  
Expected: FAIL because React components and `@sun-world/icons/react` do not exist.

- [ ] **Step 3: Implement private shadcn/Radix primitives and Sun wrappers**

Use `cn()` with `clsx` and `tailwind-merge`; keep variants in package code. Map shadcn variables to Sun tokens in `globals.css`. Sonner is wrapped by `SunToastProvider` and an exported framework-neutral `toast` facade.

- [ ] **Step 4: Verify package tests, builds and boundaries GREEN**

Run: `corepack pnpm -F @sun-world/ui test && corepack pnpm -F @sun-world/ui build && corepack pnpm -F @sun-world/icons test && corepack pnpm -F @sun-world/icons build && node scripts/check-ui-package-boundary.mjs && node scripts/check-icon-boundary.mjs`  
Expected: all PASS, no Vue runtime in UI/icon React outputs, no broad `ui.*` app chunk requirement yet.

- [ ] **Step 5: Commit**

```bash
git add packages/ui packages/icons scripts/check-ui-package-boundary.mjs scripts/check-icon-boundary.mjs pnpm-lock.yaml
git commit -m "refactor(ui): 基于 shadcn 重建 React 组件与图标层"
```

### Task 3: React 应用基础设施、模块路由和全局状态

**Files:**
- Create: `apps/web/src/main.tsx`
- Create: `apps/web/src/App.tsx`
- Create: `apps/web/src/app/providers/AppProviders.tsx`
- Create: `apps/web/src/app/errors/AppErrorBoundary.tsx`
- Replace: `apps/web/src/app/router/{create-router,routes,use-route-loading}.ts` with React equivalents and tests
- Replace: `apps/web/src/modules/{types,registry}.ts` and every `modules/*/index.ts` manifest with React route objects
- Replace: `apps/web/src/store/{auth,tg}.ts` with Zustand stores and tests
- Replace: `apps/web/src/i18n.ts` with i18next initialization and tests
- Replace: `apps/web/src/shared/design/theme.ts` with React provider/hook and tests
- Modify: `apps/web/src/service/http.ts`
- Modify: `apps/web/src/shared/api/index.ts`
- Replace: `apps/web/src/shared/seo/index.ts` with framework-neutral writer and React hooks
- Modify: `apps/web/src/shared/telemetry/index.ts`

**Interfaces:**
- Consumes: API contracts, locale JSON, Sun theme tokens and route metadata.
- Produces: `router`, `AppProviders`, `useAuthStore`, `useDeviceStore`, `useTheme`, `usePageMeta`, `useJsonLd`, and router-neutral telemetry subscription.

- [ ] **Step 1: Write failing unit tests for route merge, auth expiry, device breakpoints, theme, i18n, API envelope and SEO**

```ts
it('keeps catch-all after module routes', () => {
  expect(mergeRoutes(coreRoutes, moduleRoutes).at(-1)?.path).toBe('*')
})

it('does not call React hooks from the axios interceptor', () => {
  expect(httpSource).toContain('useAuthStore.getState()')
})
```

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `corepack pnpm -C apps/web exec vitest run src/app src/store src/shared src/service`  
Expected: FAIL on missing React providers/stores and Vue imports.

- [ ] **Step 3: Implement React infrastructure**

Use `createBrowserRouter`/`RouterProvider`, route `lazy`, a navigation subscription for loading/telemetry, Zustand `getState()` in non-component code, and DOM writers for head/JSON-LD. Keep route metadata keys unchanged.

- [ ] **Step 4: Verify focused tests GREEN**

Run: `corepack pnpm -C apps/web exec vitest run src/app src/store src/shared src/service && corepack pnpm -C apps/web run typecheck`  
Expected: PASS; no module in this task imports Vue, Pinia, Vue Router, vue-i18n or `@unhead/vue`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/main.tsx apps/web/src/App.tsx apps/web/src/app apps/web/src/modules apps/web/src/store apps/web/src/i18n.ts apps/web/src/shared apps/web/src/service
git commit -m "refactor(web): 迁移 React 路由状态与应用基础设施"
```

### Task 4: 响应式应用壳、首页与博客列表

**Files:**
- Replace: `apps/web/src/layout/{layout,deskLayout,mobLayout}.vue` and `layout/header/index.vue`, `layout/footer/index.vue` with `.tsx`
- Replace: `apps/web/src/components/{Avator,LanguageSwitch,ThemeSwitch,Waterfall}/**/*.vue` with `.tsx`
- Replace: `apps/web/src/modules/home/pages/HomePage.vue` with `HomePage.tsx`
- Replace: `apps/web/src/modules/home/ui/{WeatherCard,IcpFilingCard}.vue` with `.tsx`
- Replace: `apps/web/src/modules/blog/ui/{BlogHomeFeed,BlogCard,SelfInfoCard}.vue` with `.tsx`
- Replace: `apps/web/src/modules/blog/composables/{useBlogList,useBlogBaseData}.ts` with React hooks and tests
- Modify: `scripts/check-blog-waterfall-real-data.mjs`
- Modify: `scripts/check-blog-infinite-scroll.mjs`
- Modify: `scripts/check-icp-home-card.mjs`
- Modify: `scripts/check-home-footer-layout.mjs`
- Modify: `scripts/check-ai-public-entry-visible.mjs`

**Interfaces:**
- Consumes: device/theme/i18n providers, blog APIs, icon/UI components.
- Produces: desktop/mobile shell, public navigation, home feed pagination/infinite load, back-to-top and homepage-only filing.

- [ ] **Step 1: Rewrite protocol checks to target React files and add route behavior tests**

```tsx
it('shows ICP only on the homepage', async () => {
  const { router } = renderApp(<App />, { route: '/' })
  expect(await screen.findByText('豫ICP备2024081960号')).toHaveAttribute('href', 'https://beian.miit.gov.cn/')
  await router.navigate('/login')
  expect(screen.queryByText('豫ICP备2024081960号')).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Confirm RED**

Run: `corepack pnpm -C apps/web exec vitest run src/layout src/modules/home src/modules/blog/ui/BlogHomeFeed.test.tsx && node scripts/check-icp-home-card.mjs`  
Expected: FAIL because React shell/home/feed are absent.

- [ ] **Step 3: Implement shell/home/feed parity**

Use effects with cleanup for resize/intersection/scroll, preserve `.app-container` as the scroll root, 360px back-to-top threshold, list/grid toggle, page exhaustion, weather non-blocking errors and desktop/mobile ICP placement.

- [ ] **Step 4: Verify GREEN**

Run: `corepack pnpm -C apps/web exec vitest run src/layout src/modules/home src/modules/blog && node scripts/check-blog-waterfall-real-data.mjs && node scripts/check-blog-infinite-scroll.mjs && node scripts/check-icp-home-card.mjs && node scripts/check-home-footer-layout.mjs && node scripts/check-ai-public-entry-visible.mjs`  
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/layout apps/web/src/components apps/web/src/modules/home apps/web/src/modules/blog scripts/check-blog-waterfall-real-data.mjs scripts/check-blog-infinite-scroll.mjs scripts/check-icp-home-card.mjs scripts/check-home-footer-layout.mjs scripts/check-ai-public-entry-visible.mjs
git commit -m "refactor(web): 迁移首页布局与博客信息流"
```

### Task 5: Markdown 阅读、文章目录、写作与 SSG

**Files:**
- Replace: `apps/web/src/shared/markdown/SunMarkdownPreview.vue` with `SunMarkdownPreview.tsx`
- Replace: `apps/web/src/shared/markdown/SunMarkdownEditor.vue` with `SunMarkdownEditor.tsx`
- Delete: `apps/web/src/shared/markdown/md-editor-v3-subpath.d.ts`
- Create: `apps/web/src/shared/markdown/heading-tree.ts`
- Create: `apps/web/src/shared/markdown/heading-tree.test.ts`
- Replace: `apps/web/src/modules/blog/pages/{BlogDetailPage,ArticleEditorPage}.vue` with `.tsx`
- Replace: `apps/web/src/modules/blog/ui/{CatalogCard,CatalogItem}.vue` with `.tsx`
- Replace: `apps/web/src/modules/blog/composables/{useBlogReader,useBlogAuthoring}.ts` with React hooks and tests
- Modify: `scripts/check-blog-detail-render.mjs`
- Modify: `scripts/check-blog-detail-catalog.mjs`
- Replace: `scripts/check-md-editor-v3-migration.mjs` with `scripts/check-react-markdown-migration.mjs`
- Modify: `scripts/check-web-ssg.mjs`
- Modify: `scripts/prerender-public-pages.mjs`
- Modify: `scripts/web-ssg-utils.mjs`

**Interfaces:**
- Consumes: blog API/types, safe Markdown content and route params/query.
- Produces: `SunMarkdownPreview({content,onCatalog,onRendered})`, controlled `SunMarkdownEditor`, stable heading ids/tree, canonical article SSG.

- [ ] **Step 1: Write failing heading, sanitization, detail and authoring tests**

```tsx
it('does not execute raw html from an article', () => {
  render(<SunMarkdownPreview content={'<script>alert(1)</script>\n# Safe'} />)
  expect(document.querySelector('script')).toBeNull()
  expect(screen.getByRole('heading', { name: 'Safe' })).toBeVisible()
})
```

Also assert route param takes precedence over legacy query, active heading updates, empty title blocks save, category/tag ids reach `createBlog`, and generated JSON-LD/canonical use `/blog/<id>`.

- [ ] **Step 2: Confirm RED**

Run: `corepack pnpm -C apps/web exec vitest run src/shared/markdown src/modules/blog/pages src/modules/blog/composables && node scripts/check-react-markdown-migration.mjs`  
Expected: FAIL because React Markdown components and guard are absent.

- [ ] **Step 3: Implement safe reader and lazy editor**

Reader uses react-markdown, remark-gfm, rehype-slug and rehype-sanitize. Editor dynamically imports `@uiw/react-md-editor`; its preview uses the same sanitization plugins. Derive catalog and rendered heading ids from one slugging rule.

- [ ] **Step 4: Verify behavior and SSG GREEN**

Run: `corepack pnpm -C apps/web exec vitest run src/shared/markdown src/modules/blog && node scripts/check-blog-detail-render.mjs && node scripts/check-blog-detail-catalog.mjs && node scripts/check-react-markdown-migration.mjs && node scripts/check-web-ssg.mjs`  
Expected: all PASS; reader and editor remain separate lazy chunks.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/shared/markdown apps/web/src/modules/blog scripts/check-blog-detail-render.mjs scripts/check-blog-detail-catalog.mjs scripts/check-react-markdown-migration.mjs scripts/check-web-ssg.mjs scripts/prerender-public-pages.mjs scripts/web-ssg-utils.mjs
git commit -m "refactor(web): 迁移 React 文章阅读写作与 SSG"
```

### Task 6: 认证与账户模块

**Files:**
- Replace: `apps/web/src/pages/login/{AuthPageShell,login,register,qqCb}.vue` with `.tsx`
- Replace: `apps/web/src/pages/me/me.vue` with `me.tsx`
- Modify: `apps/web/src/modules/account/api.ts`
- Modify: `apps/web/src/modules/account/errors.ts`
- Create: `apps/web/src/modules/account/pages/*.test.tsx`
- Modify: `scripts/check-auth-page-layout.mjs`

**Interfaces:**
- Consumes: `useAuthStore`, account typed API, i18n and Sun form controls.
- Produces: full-screen login/register, field validation, inline errors, success toast/navigation and QQ callback compatibility.

- [ ] **Step 1: Write failing form behavior tests**

Cover required account/password, phone/email/password confirmation, disabled submitting, backend error inline rendering, successful login to `/`, register to `/`, and switching between `/login`/`/register`.

- [ ] **Step 2: Confirm RED**

Run: `corepack pnpm -C apps/web exec vitest run src/pages/login src/pages/me && node scripts/check-auth-page-layout.mjs`  
Expected: FAIL because React account pages are absent.

- [ ] **Step 3: Implement with Sun form primitives**

Use native form submission and explicit validators; do not reintroduce Element Form. Global API toast is suppressed for authentication forms so failures remain adjacent to fields/form status.

- [ ] **Step 4: Verify GREEN**

Run: `corepack pnpm -C apps/web exec vitest run src/pages/login src/pages/me src/store/auth.test.ts && node scripts/check-auth-page-layout.mjs`  
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/login apps/web/src/pages/me apps/web/src/modules/account scripts/check-auth-page-layout.mjs
git commit -m "refactor(web): 迁移 React 认证与账户页面"
```

### Task 7: AI 会话与流式响应

**Files:**
- Replace: `apps/web/src/modules/ai/pages/AigcPage.vue` with `AigcPage.tsx`
- Replace: `apps/web/src/modules/ai/ui/*.vue` with `.tsx`
- Replace: `apps/web/src/modules/ai/composables/useAiChat.ts` with `useAiChat.ts` and tests
- Modify: `apps/web/src/modules/ai/api.ts`
- Create: `apps/web/src/modules/ai/sse.ts`
- Create: `apps/web/src/modules/ai/sse.test.ts`
- Modify: `scripts/check-ai-interface.mjs`
- Modify: `scripts/check-ai-public-entry-visible.mjs`

**Interfaces:**
- Consumes: existing `/ai/chat`, stream and chunk-stream contracts.
- Produces: conversation CRUD in client state, message streaming, abort, retry/error and accessible live output.

- [ ] **Step 1: Write failing SSE and interaction tests**

Assert split JSON lines join correctly, malformed non-data lines are ignored, abort stops updates, send appends user then assistant content, empty prompts do not submit, and route unmount aborts active fetch.

- [ ] **Step 2: Confirm RED**

Run: `corepack pnpm -C apps/web exec vitest run src/modules/ai && node scripts/check-ai-interface.mjs`  
Expected: FAIL because React AI components/parser are absent.

- [ ] **Step 3: Implement AI page and cleanup semantics**

Keep sidebar/search/new conversation, collapsed rail, composer keyboard behavior, progressive assistant content and full-screen route metadata. Never expose provider keys client-side.

- [ ] **Step 4: Verify GREEN**

Run: `corepack pnpm -C apps/web exec vitest run src/modules/ai && node scripts/check-ai-interface.mjs && node scripts/check-ai-public-entry-visible.mjs && node scripts/check-web-client-secrets.mjs`  
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/modules/ai scripts/check-ai-interface.mjs scripts/check-ai-public-entry-visible.mjs
git commit -m "refactor(web): 迁移 React AI 会话与流式响应"
```

### Task 8: 后台管理、博客管理、指标与审计日志

**Files:**
- Replace: `apps/web/src/pages/manage/**/*.vue` with `.tsx`
- Replace: `apps/web/src/modules/admin/pages/*.vue` with `.tsx`
- Replace: `apps/web/src/modules/admin/ui/ChartsCard.vue` with `ChartsCard.tsx`
- Modify: `apps/web/src/modules/admin/ui/chartConfig.ts`
- Replace: `apps/web/src/modules/admin/composables/{useAdminMetrics,useAdminLogs}.ts` with React hooks and tests
- Replace: `apps/web/src/modules/blog/ui/manage/{SunForm,SunTable}.vue` with `.tsx`
- Replace: `apps/web/src/modules/blog/ui/manage/{formTypes,tableTypes}.ts` to remove Element types
- Replace: `apps/web/src/modules/blog/composables/useBlogManagement.ts` with React hook and tests
- Modify: `scripts/check-admin-log-page.mjs`

**Interfaces:**
- Consumes: admin/blog APIs, Sun controls and lazy ECharts core.
- Produces: manage tabs, blog query/table/form, metrics/telemetry/alerts/history, log filters/retention states.

- [ ] **Step 1: Write failing admin behavior tests**

Cover tab navigation, blog query validation/pagination/actions, concurrent metrics refresh without duplicate history writes, alerts, history kind, log limit/severity/event filters, refresh, empty/error/loading states and retention copy.

- [ ] **Step 2: Confirm RED**

Run: `corepack pnpm -C apps/web exec vitest run src/pages/manage src/modules/admin src/modules/blog/ui/manage && node scripts/check-admin-log-page.mjs`  
Expected: FAIL because React admin views are absent.

- [ ] **Step 3: Implement React admin vertical slice**

Use feature-owned semantic tables and Sun controls. Dynamically import `AdminChartsPage` and ECharts core modules only when the chart view is selected; dispose chart instances on cleanup.

- [ ] **Step 4: Verify GREEN**

Run: `corepack pnpm -C apps/web exec vitest run src/pages/manage src/modules/admin src/modules/blog && node scripts/check-admin-log-page.mjs`  
Expected: all PASS and no Element imports.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/manage apps/web/src/modules/admin apps/web/src/modules/blog scripts/check-admin-log-page.mjs
git commit -m "refactor(web): 迁移 React 后台指标日志与博客管理"
```

### Task 9: 画布编辑器 React 适配

**Files:**
- Replace: `apps/web/src/modules/editor/pages/EditorCanvasPage.vue` with `EditorCanvasPage.tsx`
- Replace: `apps/web/src/modules/editor/ui/*.vue` with `.tsx`
- Create: `apps/web/src/modules/editor/hooks/useEditorCanvas.ts`
- Create: `apps/web/src/modules/editor/hooks/useEditorCanvas.test.tsx`
- Modify: `apps/web/src/types/editor.type.ts`
- Add tests only as required to `packages/editor/src/**/*.spec.ts`

**Interfaces:**
- Consumes: `SWEditor`, `BaseElement`, `NodeInfo`, `ToolName` and React icon adapter.
- Produces: stable editor instance lifecycle, tool selection, layer tree selection/expand, property panel updates and disposal.

- [ ] **Step 1: Write failing lifecycle and tool tests**

Use a minimal fake canvas host only at the DOM boundary; assert one editor creation per mount, active tool forwarding, selected node synchronization and listener/editor cleanup on unmount.

- [ ] **Step 2: Confirm RED**

Run: `corepack pnpm -C apps/web exec vitest run src/modules/editor`  
Expected: FAIL because React editor adapter does not exist.

- [ ] **Step 3: Implement the React adapter without changing engine semantics**

Store `SWEditor` in refs, create after canvas host mount, translate engine callbacks into React state, memoize tree nodes and release every subscription in effect cleanup.

- [ ] **Step 4: Verify GREEN and editor package build**

Run: `corepack pnpm -C apps/web exec vitest run src/modules/editor && corepack pnpm build:editor`  
Expected: PASS; `@sun-world/editor` remains framework-neutral and builds unchanged.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/modules/editor apps/web/src/types/editor.type.ts packages/editor
git commit -m "refactor(web): 适配 React 画布编辑器界面"
```

### Task 10: 视频、游戏切片与剩余路由

**Files:**
- Replace: `apps/web/src/modules/video/pages/VideoPage.vue` with `VideoPage.tsx`
- Replace: `apps/web/src/modules/video/ui/VideoPlayer.vue` with `VideoPlayer.tsx`
- Replace: `apps/web/src/pages/gameTiles/index.vue` with `index.tsx`
- Replace: `apps/web/src/pages/{tools/tools.page,keep/keep}.vue` with `.tsx`
- Replace: `apps/web/src/router/NotFound.vue` with `NotFound.tsx`
- Replace: `apps/web/src/baseCom/{grid/grid,col/col}.vue` with `.tsx` or delete if unused after proof by `rg`
- Modify: `apps/web/src/util/function.ts`
- Create: `apps/web/src/modules/video/ui/VideoPlayer.test.tsx`
- Create: `apps/web/src/pages/gameTiles/index.test.tsx`

**Interfaces:**
- Consumes: Artplayer/HLS, dynamic JSZip export helpers and Sun form/dialog/upload controls.
- Produces: player lifecycle, URL copy, image config/preview/export, tools/keep/404 parity.

- [ ] **Step 1: Write failing player, tile and route tests**

Assert Artplayer constructed with host/url and destroyed on unmount; file validation creates/revokes object URLs; row/column/size/gap bounds apply; export selections call whole/split/JSON branches; JSZip remains dynamically imported.

- [ ] **Step 2: Confirm RED**

Run: `corepack pnpm -C apps/web exec vitest run src/modules/video src/pages/gameTiles src/pages/tools src/pages/keep src/router`  
Expected: FAIL because React pages are absent.

- [ ] **Step 3: Implement remaining React routes**

Keep Artplayer/HLS and JSZip inside lazy route chunks, use native file input wrapped by Sun controls, revoke URLs and destroy players on cleanup, and preserve 404 navigation.

- [ ] **Step 4: Verify GREEN**

Run: `corepack pnpm -C apps/web exec vitest run src/modules/video src/pages src/router`  
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/modules/video apps/web/src/pages apps/web/src/router apps/web/src/baseCom apps/web/src/util/function.ts
git commit -m "refactor(web): 迁移 React 视频切片与剩余页面"
```

### Task 11: React 生产入口切换与 Vue 完整清理

**Files:**
- Delete: all remaining `apps/web/src/**/*.vue`, `packages/ui/src/**/*.vue`, `packages/icons/src/**/*.vue`
- Delete: `apps/web/src/{auto-imports.d.ts,components.d.ts,shims-vue.d.ts}`
- Delete: `packages/icons/src/shims-vue.d.ts`
- Delete: Vue-only source entries and tests under `packages/icons/src/vue`, `packages/icons/src/play`
- Modify: `apps/web/index.html`
- Modify: `apps/web/vite.config.ts`
- Modify: `apps/web/tsconfig*.json`
- Modify: `apps/web/package.json`
- Modify: `packages/ui/package.json`
- Modify: `packages/icons/package.json`
- Modify: root `package.json`
- Modify: `scripts/check-web.mjs`
- Modify: `scripts/check-web-chunks.mjs`
- Modify: `scripts/check-ui-package-boundary.mjs`
- Modify: `scripts/check-icon-boundary.mjs`
- Modify: `apps/web/performance-budgets.json`
- Modify: `Dockerfile`

**Interfaces:**
- Consumes: all migrated React routes and package exports.
- Produces: React-only production graph and strict guard rejecting every removed Vue dependency/file/import.

- [ ] **Step 1: Strengthen the cutover guard and confirm RED**

The guard scans manifests, lockfile-reachable direct dependencies, Vite plugins, source imports and `rg --files -g '*.vue'`. It rejects Vue, Pinia, Vue Router, vue-i18n, Element Plus, md-editor-v3, `@unhead/vue`, `@vitejs/plugin-vue` and any `.vue` source.

Run: `node scripts/check-react-migration-toolchain.mjs --cutover`  
Expected: FAIL listing remaining Vue files/dependencies.

- [ ] **Step 2: Switch entry and remove every Vue artifact**

Point `index.html` at `/src/main.tsx`, use only `@vitejs/plugin-react` and Tailwind Vite plugins, update manual chunks for `.tsx` paths, remove legacy declaration files and packages, then regenerate lockfile with `corepack pnpm install`.

- [ ] **Step 3: Rewrite source-bound protocol guards without weakening behavior**

Replace Vue filename/template regexes with React tests or `.tsx` assertions. Rename md-editor guards and preserve route chunk/preload requirements. Set new performance budgets no higher than measured React output; record exact measured values in the commit diff.

- [ ] **Step 4: Verify cutover GREEN**

Run: `node scripts/check-react-migration-toolchain.mjs --cutover && corepack pnpm -C apps/web run typecheck && corepack pnpm -C apps/web run test:react && corepack pnpm -F @sun-world/ui test && corepack pnpm -F @sun-world/icons test && corepack pnpm check:web`  
Expected: all PASS; `rg --files -g '*.vue'` prints nothing and production HTML references React entry only.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(web): 完成 React 生产切换并移除 Vue"
```

### Task 12: 全量验证、浏览器验收与持久化交接

**Files:**
- Modify: `README.md`
- Modify: `.ai/plans/platform-roadmap.md`
- Modify: `docs/current-state.md`
- Modify: `docs/engineering-conventions.md`
- Modify: `docs/agent-handoff.md`
- Create: `docs/handoff/branches/refactor-react-shadcn.md`

**Interfaces:**
- Consumes: completed React build and all design acceptance criteria.
- Produces: durable architecture/runtime state, full verification evidence and a merge/deploy-ready handoff without deploying automatically.

- [ ] **Step 1: Run fresh full automated verification**

Run: `corepack pnpm check`  
Expected: exit 0; UI/icons/contracts tests, React type/test/build, API checks, compose and all protocol checks pass.

- [ ] **Step 2: Run formatting and repository integrity checks**

Run: `corepack pnpm format:check && git diff --check && rg --files -g '*.vue' && rg -n "vue|pinia|element-plus|md-editor-v3|@unhead/vue" apps/web packages/ui packages/icons package.json pnpm-lock.yaml`  
Expected: first two commands PASS; both `rg` checks return no production hits (documentation/history references are reviewed explicitly, not silently ignored).

- [ ] **Step 3: Run local production preview browser matrix**

Build and preview with project scripts, then verify desktop and 390px mobile for `/`, `/home`, `/blog/<real-id>`, legacy `/blog?id=<id>`, `/new_article`, `/login`, `/register`, `/me`, `/qq`, `/aigc`, `/manage`, `/manage/metrics`, `/manage/logs`, `/canvas`, `/video`, `/game_tiles`, `/tools`, `/keep`, a missing route and direct refresh. Exercise theme/language, feed scrolling/back-to-top, catalog, form validation, AI abort, filters, canvas tools, player cleanup and tile export.

- [ ] **Step 4: Update durable docs with exact evidence**

Record goal, status, files/groups changed, commands and exit codes, browser routes checked, known warnings, blockers and next merge/deploy step. Update architecture direction from Vue to React and remove stale Vue-only conventions.

- [ ] **Step 5: Re-run the final gate after documentation changes**

Run: `corepack pnpm format:check && git diff --check && corepack pnpm check`  
Expected: all exit 0 after docs and generated outputs settle.

- [ ] **Step 6: Commit final verification and handoff**

```bash
git add README.md .ai/plans/platform-roadmap.md docs/current-state.md docs/engineering-conventions.md docs/agent-handoff.md docs/handoff/branches/refactor-react-shadcn.md
git commit -m "docs: 记录 React 重构验证与交接"
```

## Plan Self-Review

- Every design requirement maps to at least one task: foundation (1/3), UI/icons (2), shell/home/blog (4), Markdown/SSG (5), auth (6), AI (7), admin (8), canvas (9), remaining routes (10), cleanup/build budgets (11), full verification/docs (12).
- Public interfaces consumed by later tasks are named in each task and keep stable Sun subpaths.
- No task uses placeholder implementation language; every behavior has a concrete test target and command.
- Final cleanup cannot pass by deleting checks: Task 11 requires React-equivalent guards before removing Vue assertions, and Task 12 runs the entire root gate twice around documentation.
