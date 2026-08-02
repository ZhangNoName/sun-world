# Manage shadcn UI Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refactor the existing `/manage/*` presentation to the shadcn
dashboard-01/sidebar-07 composition while preserving all current Manage
behavior and the shared `@sun-world/ui` boundary.

**Architecture:** Add a small, dependency-free sidebar primitive to
`@sun-world/ui`, then make `ManageLayout` compose it with provider/inset
semantics. Re-style the existing generic data page around dashboard cards and
toolbar slots without changing its request lifecycle or public ref API.

**Tech Stack:** React 19, TypeScript, Base UI, `@sun-world/ui`,
`@sun-world/icons/react`, Vitest + Testing Library, Corepack pnpm 10.15.1.

## Constraints

- Preserve all unrelated dirty worktree changes; do not reset, checkout, clean,
  deploy, push, or stage unrelated files.
- Do not add dependencies or run shadcn CLI commands that can overwrite local
  components.
- Use only existing `@sun-world/icons` names for app icons.
- Keep Chinese as the default locale and the language switch in the sidebar
  footer.

## Task 1: Lock the new UI contracts with failing tests

**Files:**

- Modify: `apps/web/src/modules/admin/components/ManageLayout.test.tsx`
- Modify: `apps/web/src/modules/admin/components/ManageTable.test.tsx`
- Modify: `apps/web/src/modules/admin/components/ManageDataPage.test.tsx`

1. Add assertions for the provider/inset/sidebar data contract, active
   navigation inside the sidebar, and the desktop/mobile state markers.
2. Add assertions that the data page renders a dashboard heading, a single
   table card, left actions and right search in the same toolbar, and pagination
   outside the scroll viewport.
3. Run the focused tests and verify the new assertions fail against the current
   markup. Do not weaken assertions to make the old implementation pass.

## Task 2: Add the local shadcn-style sidebar primitive

**Files:**

- Create: `packages/ui/src/components/sidebar/sidebar.tsx`
- Create: `packages/ui/src/components/sidebar/index.ts`
- Modify: `packages/ui/src/index.ts`
- Modify: `packages/ui/package.json`
- Modify: `packages/ui/source-aliases.ts`
- Modify: `packages/ui/vite.config.ts`

1. Implement `SidebarProvider` state/context with controlled and uncontrolled
   collapse support, keyboard toggle, and mobile-safe data attributes.
2. Implement `Sidebar`, `SidebarInset`, header/content/footer/menu wrappers,
   and `SidebarMenuButton` as semantic presentational primitives with shadcn
   data-slot attributes and token-based classes.
3. Keep the primitive free of router/auth assumptions and compatible with the
   repository's React 19/Base UI setup.
4. Run the package typecheck/build or the narrowest available package checks;
   expected result is the new focused tests still fail only at Manage markup.

## Task 3: Compose ManageLayout with the sidebar primitive

**Files:**

- Modify: `apps/web/src/modules/admin/components/ManageLayout.tsx`
- Modify: `apps/web/src/modules/admin/components/manage-layout.css`
- Modify: `apps/web/src/modules/admin/components/ManageLayout.test.tsx`

1. Replace the custom outer shell geometry with `SidebarProvider`, `Sidebar`,
   and `SidebarInset` while keeping the existing state persistence, recursive
   nav, account menu, language switch, route redirects, and admin guard.
2. Move the brand into the sidebar header and add a dashboard-style inset
   topbar/sidebar trigger; preserve desktop hide/restore and mobile drawer
   controls with accessible names.
3. Update navigation, footer, and content CSS to match shadcn sidebar tokens:
   compact active states, consistent radii, subtle borders, and a content
   surface that works in light and dark themes.
4. Run the ManageLayout tests and typecheck; fix only implementation defects.

## Task 4: Apply dashboard-01 composition to data pages

**Files:**

- Modify: `apps/web/src/modules/admin/components/ManageDataPage.tsx`
- Modify: `apps/web/src/modules/admin/components/ManageTable.tsx`
- Modify: `apps/web/src/modules/admin/components/manage-data.css`
- Modify: `apps/web/src/modules/admin/components/ManageDataPage.test.tsx`
- Modify: `apps/web/src/modules/admin/components/ManageTable.test.tsx`

1. Add the page heading/description as the dashboard page header while keeping
   page actions in the table toolbar.
2. Re-style the table card with shadcn card/header/content/footer spacing,
   subtle row separators, sticky header, internal horizontal/vertical scroll,
   and a pagination footer with page-size selection.
3. Keep the table's `@sun-world/ui/table` primitives and all existing states,
   dictionary rendering, selection, pagination, and public ref methods.
4. Verify mobile toolbar wrapping and internal scrolling through component
   assertions and the focused browser pass.

## Task 5: Verify and document the visual refresh

**Files:**

- Modify: `design-qa.md`
- Modify: `docs/current-state.md`
- Modify: `docs/agent-handoff.md`

1. Run focused Manage Vitest tests, web typecheck, web build,
   `node scripts/check-ui-shadcn-structure.mjs`, `corepack pnpm format:check`,
   and `git diff --check`.
2. Run the local browser QA at 1280px and 390px. Check sidebar expanded,
   collapsed, hidden/restored, mobile drawer, language/account footer, page
   toolbar, table sticky header, internal scroll, pagination, dark mode, and
   no document horizontal overflow. If the local session is not authenticated,
   record the guard limitation while still verifying the shell.
3. Record exact commands, results, remaining root-check timeout/blockers, and
   final design QA status. Do not claim checks passed unless their output was
   observed.
