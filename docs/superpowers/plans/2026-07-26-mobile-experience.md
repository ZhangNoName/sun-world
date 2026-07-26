# Mobile Experience Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give all Sun World routes a predictable mobile shell, responsive
content, fixed-access navigation, and a global back-to-top action.

**Architecture:** Keep `.app-container` as the ordinary-route scroll root.
Sticky mobile chrome and a layout-owned back-to-top component consume that
root. Immersive routes retain their internal full-screen scroll surfaces.

**Tech Stack:** React 19, React Router 7, TypeScript, CSS, Vitest, Testing
Library, Base UI dialog primitives.

## Global Constraints

- Use repository Node 24.17.0 and pnpm 10.15.1 through Corepack.
- Preserve user changes already present in the dirty worktree.
- Do not add a runtime dependency.
- Support viewport widths from 320px upward.
- Respect `prefers-reduced-motion` and mobile safe-area insets.

---

### Task 1: Lock Shared Shell Behavior

**Files:**
- Modify: `apps/web/src/layout/layout.test.tsx`
- Create: `apps/web/src/layout/mobile-layout-contract.test.ts`

**Interfaces:**
- Consumes: existing `AppLayout` and `useDeviceStore`.
- Produces: regression coverage for global scroll and drawer contracts.

- [ ] Add a failing test that scrolls `.app-container` beyond 360px and expects
      a `返回顶部` button.
- [ ] Add a failing test that activates `返回顶部` and expects the scroll root to
      receive a reduced-motion-aware `scrollTo` call.
- [ ] Add style contract assertions for sticky mobile chrome, safe-area
      offsets, full-height left drawer geometry, and a non-scrolling
      `.main-container`.
- [ ] Run
      `corepack pnpm -C apps/web test:react -- layout.test.tsx mobile-layout-contract.test.ts`
      and confirm the new assertions fail for the missing behavior.

### Task 2: Implement The Shared Mobile Shell

**Files:**
- Create: `apps/web/src/layout/BackToTopButton.tsx`
- Modify: `apps/web/src/layout/layout.tsx`
- Modify: `apps/web/src/layout/layout.css`
- Modify: `packages/ui/src/patterns/compound-controls/compound-controls.tsx`

**Interfaces:**
- `BackToTopButton({ scrollRoot, mobileOffset })` observes a scrollable
  `HTMLElement | null` and renders an accessible fixed action after 360px.
- `DialogPanel.overlayClassName` reaches `DialogContent.overlayClassName`.

- [ ] Implement the smallest back-to-top component that satisfies Task 1.
- [ ] Mount it once for desktop and once for ordinary mobile routes, targeting
      `.app-container`.
- [ ] Make mobile header/footer sticky, remove the nested main scroller, and
      add safe-area/touch-target rules.
- [ ] Pass the dialog overlay class through and override the dialog popup's
      centering transform for `.mob-drawer`.
- [ ] Run the Task 1 tests and confirm they pass.

### Task 3: Remove Duplicate Page Ownership

**Files:**
- Modify: `apps/web/src/modules/blog/ui/BlogHomeFeed.tsx`
- Modify: `apps/web/src/modules/blog/styles/blog-experience.css`
- Modify: `apps/web/src/modules/home/pages/home-react.css`
- Modify: `apps/web/src/modules/home/pages/home-style-ownership.test.ts`

**Interfaces:**
- Consumes: layout-level back-to-top behavior.
- Produces: one owner for shell layout and one owner for back-to-top behavior.

- [ ] Remove the blog-only scroll listener, button, and CSS.
- [ ] Remove duplicated shell/header/footer/drawer rules from homepage CSS.
- [ ] Update the homepage ownership test to reject shared shell selectors.
- [ ] Run the blog, home, and layout test files.

### Task 4: Harden Page-Level Phone Layouts

**Files:**
- Modify: `apps/web/src/style.css`
- Modify: `apps/web/src/pages/tools/tools.css`
- Modify: `apps/web/src/pages/keep/keep.css`
- Modify: `apps/web/src/pages/gameTiles/tiles.css`
- Modify: `apps/web/src/modules/video/pages/video.css`
- Modify: `apps/web/src/modules/admin/pages/admin.css`
- Modify: `apps/web/src/modules/blog/styles/blog-experience.css`

**Interfaces:**
- Consumes: the shared shell's 320px minimum viewport.
- Produces: page content that stays within the shell while preserving scoped
  overflow for tables, previews, and Markdown.

- [ ] Add bounded media and intrinsic-width safeguards to ordinary content.
- [ ] Reduce phone padding and collapse remaining cramped grids.
- [ ] Keep table, canvas, and Markdown overflow local to their components.
- [ ] Run changed style contract tests and React tests.

### Task 5: Full Verification And Handoff

**Files:**
- Modify: `docs/agent-handoff.md`
- Modify: `docs/current-state.md`

**Interfaces:**
- Consumes: completed Tasks 1-4.
- Produces: durable verification evidence and continuation context.

- [ ] Run `corepack pnpm format:check`.
- [ ] Run `corepack pnpm check:web`.
- [ ] Run `git diff --check`.
- [ ] Browser-test ordinary and immersive routes at 390x844 and 320x700.
- [ ] Record files, commands, results, residual risks, and the next step in the
      handoff documents.
