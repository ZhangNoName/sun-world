# Global UI, Auth, Login, and Manage Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 统一 shadcn 主题变量和页面布局边界，修复认证恢复与刷新链路，并完成 login-04/sidebar-07 风格的登录与 Manage UI。

**Architecture:** shadcn 语义变量是颜色唯一源，旧变量只作兼容别名；ThemeProvider 管理 light/dark/system。认证以 HttpOnly cookie 为凭证，由 AppProviders 启动恢复、HTTP 客户端单飞刷新和 auth store 统一清理。AppLayout 放弃全局 max-width，blog 模块自己保留留白，Manage 使用独立 Sidebar shell。

**Tech Stack:** React 19, React Router 7, Zustand 5, Axios, FastAPI, Vitest, Testing Library, Tailwind v4, `@sun-world/ui` shadcn-style primitives.

## Global Constraints

- 主题运行时只提供 `light`、`dark`、`system`，保留 Sun World 品牌色，不保留 Apple 风格切换。
- 新增 UI 只消费 shadcn 语义变量；旧 `--color-*`/`--bg-*`/`--text-*`/`--border-*` 只能作为兼容别名。
- token 不写入 localStorage；auth 状态恢复必须支持 HttpOnly cookie。
- 只有 blog 页面保留内容最大宽度和两侧留白，其他页面不使用 blog 容器。
- 不回滚当前工作区中与本任务无关的既有改动，不提交 secrets 或 env 值。
- 项目命令使用 `corepack pnpm` 和仓库声明的 Node/pnpm 版本。

---

### Task 1: Theme token contract and theme switching

**Files:**
- Modify: `apps/web/src/styles/design-tokens.css`
- Modify: `packages/ui/src/styles/base.css`
- Modify: `apps/web/src/shared/design/theme.ts`
- Modify: `apps/web/src/components/ThemeSwitch/index.tsx`
- Modify: `apps/web/src/components/ThemeSwitch/ThemeOptions.tsx`
- Test: `apps/web/src/shared/design/theme.test.tsx`
- Test: `apps/web/src/components/ThemeSwitch/ThemeSwitch.test.tsx`
- Test: `packages/ui/src/components/react-contracts.react.spec.tsx`

**Interfaces:**
- `ThemeProvider` exposes `mode`, `resolvedMode`, `setMode`, and `toggleMode`.
- `<html data-color-mode="light|dark">` is the runtime theme contract.
- UI primitives consume `var(--background)` and related shadcn names, with fallbacks only in the UI package.

- [ ] Write failing tests for replacing the family toggle with mode choices, removing the Apple family from persisted preferences, and applying complete shadcn semantic variables in both modes.
- [ ] Run `corepack pnpm -F @sun-world/blog exec vitest run --config vitest.config.ts src/shared/design/theme.test.tsx src/components/ThemeSwitch/ThemeSwitch.test.tsx` and confirm the new assertions fail for the current family-based implementation.
- [ ] Implement the minimal preference parser/migrator and mode switch UI; keep legacy `theme=sun-light|sun-dark` migration.
- [ ] Replace duplicate shadcn definitions with a single semantic mapping and make legacy aliases reference those variables.
- [ ] Re-run focused tests and `corepack pnpm -F @sun-world/ui test` until green.

### Task 2: Auth session restoration and refresh lifecycle

**Files:**
- Modify: `apps/web/src/store/auth.ts`
- Modify: `apps/web/src/service/http.ts`
- Modify: `apps/web/src/util/auth.ts`
- Modify: `apps/web/src/app/providers/AppProviders.tsx`
- Modify: `apps/web/src/layout/layout.tsx`
- Modify: `apps/api/src/routers/auth/auth.py`
- Modify: `apps/api/src/conf/local.yml`
- Test: `apps/web/src/store/auth.test.ts`
- Test: `apps/web/src/service/http.test.ts`
- Test: `apps/api/tests/test_auth_router.py`

**Interfaces:**
- `useAuthStore.restoreSession(): Promise<UserInfo | null>` is idempotent and single-flight.
- `useAuthStore.refreshSession(): Promise<void>` calls `refreshToken`, updates expirations, and restores the user.
- The Axios retry marker is internal and guarantees one replay per request.

- [ ] Add failing tests for stable `getDeviceId`, startup restore, concurrent restore deduplication, refresh rotation, 401 replay, and refresh failure cleanup.
- [ ] Run the focused web/API tests and record the expected failures before changing production code.
- [ ] Implement stable device id persistence, explicit auth status, restore single-flight, refresh single-flight, and state cleanup without persisting credentials.
- [ ] Enable request interception for expiry/401 refresh, skipping login/register/logout/refresh and preserving `suppressErrorToast`.
- [ ] Make backend cookie settings safe for HTTP local development and HTTPS production; ensure all auth cookies use consistent `path=/` and max-age.
- [ ] Re-run focused tests, API unit tests, and typecheck.

### Task 3: Login and auth page redesign

**Files:**
- Modify: `apps/web/src/pages/login/AuthPageShell.tsx`
- Modify: `apps/web/src/pages/login/login.tsx`
- Modify: `apps/web/src/pages/login/register.tsx`
- Modify: `apps/web/src/pages/login/auth.css`
- Test: `apps/web/src/pages/login/login.test.tsx`
- Test: `apps/web/src/pages/login/register.test.tsx`

**Interfaces:**
- `AuthPageShell` owns the responsive full-screen split layout and accepts brand/form slots.
- Login/register continue using `useAuthStore`, `getAccountErrorMessage`, and route navigation contracts.

- [ ] Add failing tests for the login form structure, required-field validation, submit loading, API failure rendering, and successful navigation.
- [ ] Run the focused login tests and confirm they fail against the current shell/behavior.
- [ ] Implement login-04 style muted page background, brand visual panel, centered form card, accessible labels, password affordance, and responsive mobile layout.
- [ ] Reuse the same field/button primitives for register and make form errors non-duplicative with global toast handling.
- [ ] Run focused auth-page tests and web typecheck.

### Task 4: Layout width boundary and Manage shell polish

**Files:**
- Modify: `apps/web/src/layout/layout.tsx`
- Modify: `apps/web/src/layout/layout.css`
- Modify: `apps/web/src/modules/blog/styles/blog-experience.css`
- Modify: `apps/web/src/modules/admin/components/ManageLayout.tsx`
- Modify: `apps/web/src/modules/admin/components/manage-layout.css`
- Modify: `apps/web/src/modules/admin/components/ManageTable.tsx`
- Test: `apps/web/src/layout/layout.test.tsx`
- Test: `apps/web/src/modules/admin/components/ManageLayout.test.tsx`
- Test: `apps/web/src/modules/admin/components/ManageTable.test.tsx`

**Interfaces:**
- `AppLayout` renders full-width non-blog routes; blog pages opt into a named container class.
- Manage routes render only through `ManageLayout` and its `AdminRouteGuard`.

- [ ] Add failing tests for full-width non-blog shells and blog-only max-width, plus sidebar collapse/mobile navigation behavior.
- [ ] Run focused layout/admin tests and confirm failures identify the old global container or missing interaction.
- [ ] Implement the width boundary and tighten the sidebar-07 composition: predictable active parent expansion, keyboard-accessible collapse/hide/mobile open, stable account/language actions, and reliable async sign-out.
- [ ] Verify Manage table scroll/pagination and mutation buttons do not get blocked by shell overflow or stale loading state.
- [ ] Run focused tests, UI package tests, and web typecheck/build.

### Task 5: Full verification and browser reproduction

**Files:**
- Modify: `docs/current-state.md`
- Modify: `docs/agent-handoff.md`
- Modify: `design-qa.md` if the existing visual checklist needs updated routes

- [ ] Run `corepack pnpm -F @sun-world/ui test`, `corepack pnpm -F @sun-world/ui build`, `corepack pnpm -F @sun-world/blog exec vitest run --config vitest.config.ts`, `corepack pnpm -F @sun-world/blog typecheck`, `corepack pnpm -F @sun-world/blog build`, `corepack pnpm format:check`, `node scripts/check-ui-package-boundary.mjs`, and `node scripts/check-ui-shadcn-structure.mjs`.
- [ ] Start the local web/API services using the repository scripts and use the in-app browser to inspect `/login`, `/register`, `/manage`, one blog route, and one non-blog route at desktop and narrow widths.
- [ ] Reproduce theme switching, login error/success, reload restoration, logout, sidebar collapse, mobile drawer, and representative data-page actions.
- [ ] Record exact commands, results, remaining environmental limitations, and next steps in the handoff docs.
- [ ] Re-check `git status --short` and `git diff --check`; do not claim completion until every requirement has direct evidence.

