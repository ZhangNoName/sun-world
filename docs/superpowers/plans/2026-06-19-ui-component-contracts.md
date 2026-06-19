# UI Component Contracts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `@sun-world/ui` with contract-first Vue UI components for Button, Input, DatePicker, List, Pagination, and package-level theme-color switching.

**Architecture:** The package exposes contracts from `src/contracts/*` and implementations from `src/components/*` through `src/index.ts`. Components wrap Element Plus where useful, while package tests lock the public API behavior. Theme customization flows through `SunThemeProvider` and CSS variables so component internals remain replaceable.

**Tech Stack:** Vue 3, Vite library mode, Element Plus, TypeScript, Vitest, Vue Test Utils, jsdom.

---

## File Map

- Create `packages/ui/package.json`: package scripts, peer/runtime dependencies, and exports.
- Create `packages/ui/vite.config.ts`: library build and dts generation.
- Create `packages/ui/vitest.config.ts`: package test config.
- Create `packages/ui/tsconfig.json`: strict package TypeScript config.
- Create `packages/ui/src/contracts/*.ts`: public component contracts.
- Create `packages/ui/src/components/*.vue`: component implementations.
- Create `packages/ui/src/theme/createSunThemeVars.ts`: theme-to-CSS-variable mapping.
- Create `packages/ui/src/components/*.spec.ts`: contract tests.
- Create `packages/ui/src/styles/index.css`: package styles using Sun World tokens with fallbacks.
- Create `packages/ui/src/index.ts`: public package entry.
- Create `packages/ui/README.md`: component API and commands.
- Modify `package.json`: add `build:ui` and `test:ui` scripts.
- Modify `apps/web/package.json`: add `@sun-world/ui` workspace dependency.
- Modify `apps/web/vite.config.ts`: add source alias for `@sun-world/ui`.
- Modify `apps/web/tsconfig.json`: add source path for `@sun-world/ui`.
- Modify `docs/architecture/frontend-shared-ui-classification.md`: record package decision.

## Task 1: Scaffold Package Shell

- [ ] Write package metadata with `build` and `test` scripts.
- [ ] Add Vite library config with Vue and dts output.
- [ ] Add Vitest config using jsdom.
- [ ] Add package TypeScript config.
- [ ] Add empty `src/index.ts`.
- [ ] Run `pnpm -C packages/ui build` and expect an empty-entry failure or no exported components yet.

## Task 2: Add Public Contracts

- [ ] Add `button.ts`, `input.ts`, `date-picker.ts`, `list.ts`, `pagination.ts`, and `theme.ts`.
- [ ] Export all contract types from `src/index.ts`.
- [ ] Run `pnpm -C packages/ui build`.
- [ ] Expected: package builds type-only exports.

## Task 2.5: TDD Theme API

- [ ] Write `SunThemeProvider.spec.ts` and `createSunThemeVars.spec.ts` first.
- [ ] Test `createSunThemeVars({ primaryColor: '#14b8a6' })` returns `{ '--sun-ui-color-primary': '#14b8a6' }`.
- [ ] Test `SunThemeProvider` applies CSS variables to its wrapper and renders slot content.
- [ ] Run `pnpm -C packages/ui test -- SunThemeProvider.spec.ts createSunThemeVars.spec.ts` and verify RED.
- [ ] Implement `theme/createSunThemeVars.ts` and `components/SunThemeProvider.vue`.
- [ ] Re-run focused tests and expect PASS.

## Task 3: TDD SunButton

- [ ] Write `SunButton.spec.ts` first.
- [ ] Test normal click emits `click`.
- [ ] Test `disabled` and `state="disabled"` block click.
- [ ] Test `label` and `state="label"` render visible label content.
- [ ] Run `pnpm -C packages/ui test -- SunButton.spec.ts` and verify the test fails because `SunButton.vue` does not exist.
- [ ] Implement `SunButton.vue` with Element Plus `ElButton`.
- [ ] Re-run the focused test and expect PASS.

## Task 4: TDD SunInput

- [ ] Write `SunInput.spec.ts` first.
- [ ] Test normal input emits `update:modelValue`.
- [ ] Test disabled input blocks updates.
- [ ] Test label renders and is associated with the input.
- [ ] Run focused test and verify RED.
- [ ] Implement `SunInput.vue` with Element Plus `ElInput`.
- [ ] Re-run focused test and expect PASS.

## Task 5: TDD SunDatePicker

- [ ] Write `SunDatePicker.spec.ts` first.
- [ ] Test date input renders with placeholder and emits update/change.
- [ ] Test disabled date picker blocks updates.
- [ ] Test label renders and is associated with the input.
- [ ] Test mobile date picker uses a bottom drawer trigger and no keyboard-opening input.
- [ ] Run focused test and verify RED.
- [ ] Implement `SunDatePicker.vue` with desktop date input behavior and mobile bottom-drawer date buttons.
- [ ] Re-run focused test and expect PASS.

## Task 6: TDD SunList

- [ ] Write `SunList.spec.ts` first.
- [ ] Test desktop rows render and select emits item.
- [ ] Test disabled list blocks select.
- [ ] Test labeled list renders a section label.
- [ ] Test mobile list renders cards.
- [ ] Run focused test and verify RED.
- [ ] Implement `SunList.vue` with semantic table/list markup.
- [ ] Re-run focused test and expect PASS.

## Task 7: TDD SunPagination

- [ ] Write `SunPagination.spec.ts` first.
- [ ] Test desktop page update emits `update:page` and `pageChange`.
- [ ] Test disabled pagination blocks page and load-more events.
- [ ] Test labeled pagination renders a label.
- [ ] Test mobile pagination emits `loadMore`.
- [ ] Test mobile scroll container emits `loadMore` on reaching the bottom.
- [ ] Run focused test and verify RED.
- [ ] Implement `SunPagination.vue` with Element Plus load-more action on mobile plus scroll-bottom load trigger.
- [ ] Re-run focused test and expect PASS.

## Task 8: Package Exports And Docs

- [ ] Export all components and contracts from `src/index.ts`.
- [ ] Export `SunThemeProvider` and `createSunThemeVars` from `src/index.ts`.
- [ ] Add `README.md` with one API table per component and package commands.
- [ ] Add `styles/index.css` import from package entry.
- [ ] Run `pnpm -C packages/ui test`.
- [ ] Run `pnpm -C packages/ui build`.

## Task 9: Workspace Integration

- [ ] Add root scripts `build:ui` and `test:ui`.
- [ ] Add `@sun-world/ui` as a workspace dependency of `apps/web`.
- [ ] Add Vite and TS aliases for source-level local development.
- [ ] Update shared UI classification docs to reference `@sun-world/ui`.
- [ ] Run `pnpm install --lockfile-only` if the lockfile needs workspace updates.
- [ ] Run `pnpm -C apps/web exec vue-tsc --noEmit`.
- [ ] Run `pnpm -C apps/web build`.

## Task 10: Handoff And Verification

- [ ] Update `docs/agent-handoff.md` with goal, touched files, commands, results, blockers, and next suggested step.
- [ ] Run `git diff --check`.
- [ ] Confirm `git status --short --branch` only contains intended task changes plus pre-existing unrelated edits.
