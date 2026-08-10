# UI Consumer Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove raw consumer-layer interaction controls and enforce the Sun World component ownership boundary across applications and feature packages.

**Architecture:** Preserve `@sun-world/base-ui` as the generic primitive owner and `@sun-world/ui` as the protocol/composition owner. Migrate consumer JSX to documented package subpaths, isolate the required native file input, and make the boundary checker cover all consumer source roots.

**Tech Stack:** React 19, TypeScript, Base UI/shadcn primitives, Vitest, Testing Library, Node.js boundary scripts, pnpm 10.15.1.

## Global Constraints

- Preserve current visible behavior, accessible names, roles, keyboard controls, and callbacks.
- Do not re-export base primitives from `@sun-world/ui`.
- Do not introduce third-party dependencies.
- Preserve all unrelated dirty-worktree changes.
- Do not commit, push, or deploy automatically from this mixed optimization worktree.

---

### Task 1: Expand the consumer boundary guard

**Files:**
- Modify: `scripts/check-web-ui-library.mjs`
- Modify: `scripts/check-root-check-script.mjs`

**Interfaces:**
- Consumes: repository source roots and the existing root-check orchestration.
- Produces: one deterministic command that rejects raw consumer controls and third-party primitive imports.

- [ ] Extend the checker to recursively scan Web and non-owner package source roots.
- [ ] Add the exact `AiFilePicker.tsx` native input exception.
- [ ] Run `node scripts/check-web-ui-library.mjs` and confirm it fails on the current raw controls and legacy tables.
- [ ] Keep the root script contract checking this guard.

### Task 2: Migrate AI Composer controls

**Files:**
- Create: `packages/ai-composer/src/attachments/AiFilePicker.tsx`
- Modify: `packages/ai-composer/src/AiComposer.tsx`
- Modify: `packages/ai-composer/src/attachments/AttachmentList.tsx`
- Modify: `packages/ai-composer/src/commands/CommandPalette.tsx`
- Modify: `packages/ai-composer/src/model-selector/ModelSelector.tsx`
- Modify: `packages/ai-composer/package.json`
- Test: `packages/ai-composer/src/AiComposer.test.tsx`

**Interfaces:**
- Consumes: `Button`, `Textarea`, and `Label` from documented `base-ui` subpaths.
- Produces: `AiFilePicker` with the existing `ChangeEvent<HTMLInputElement>` callback contract.

- [ ] Add an interaction test proving the file picker remains label-accessible and disabled with the composer.
- [ ] Run the focused test and confirm the new boundary expectation fails before migration.
- [ ] Replace raw buttons and textarea with base primitives.
- [ ] Isolate the raw file input in `AiFilePicker` without changing file validation.
- [ ] Run `corepack pnpm -F @sun-world/ai-composer test` and type/build checks.

### Task 3: Migrate AI UI controls and table composition

**Files:**
- Modify: `packages/ai-ui/src/AiWorkspace.tsx`
- Modify: `packages/ai-ui/src/AiMessageView.tsx`
- Modify: `packages/ai-ui/src/AiBlockRenderer.tsx`
- Test: `packages/ai-ui/src/AiWorkspace.test.tsx`
- Test: `packages/ai-ui/src/AiBlockRenderer.test.tsx`

**Interfaces:**
- Consumes: base `Button`, `Label`, `Textarea`, and compound table slots.
- Produces: the same workspace, editor, scrim, and structured content behavior.

- [ ] Strengthen tests to assert component-owned slots on the editor and table.
- [ ] Run focused tests and confirm they fail against raw elements.
- [ ] Replace raw editor, scrim, and table slots with base primitives.
- [ ] Run `corepack pnpm -F @sun-world/ai-ui test` and type/build checks.

### Task 4: Remove dead and misplaced UI

**Files:**
- Delete: `apps/web/src/pages/manage/blog/index.tsx`
- Delete: `apps/web/src/pages/manage/aigc/index.tsx`
- Move: `apps/web/src/components/Waterfall/waterfall.tsx` to `apps/web/src/modules/blog/ui/BlogWaterfall.tsx`
- Modify: `apps/web/src/modules/blog/ui/BlogHomeFeed.tsx`
- Delete: `packages/icons/src/react/SunIconButton.tsx`
- Modify: `packages/icons/src/react/index.ts`
- Modify: `packages/icons/src/react/SunIcon.react.spec.tsx`

**Interfaces:**
- Consumes: blog module types and `BlogCard` locally.
- Produces: `BlogWaterfall`; the icons package exports only `SunIcon`.

- [ ] Move and rename the blog-specific waterfall and update its only consumer.
- [ ] Delete the unreferenced legacy pages.
- [ ] Remove the unused icon button export and its obsolete test.
- [ ] Run Web typecheck and icon tests.

### Task 5: Documentation and complete verification

**Files:**
- Modify: `docs/current-state.md`
- Modify: `docs/handoff/branches/codex-security-integrity-baseline.md`
- Modify: `docs/reviews/2026-08-09-security-integrity-implementation.md`

**Interfaces:**
- Consumes: completed implementation and fresh command output.
- Produces: durable boundary and verification records.

- [ ] Run the UI consumer guard and affected package tests.
- [ ] Run affected type checks and builds.
- [ ] Run `corepack pnpm check` with sufficient timeout and inspect the full exit status.
- [ ] Run `corepack pnpm format:check` and `git diff --check`.
- [ ] Record exact results and any remaining exceptions in the branch handoff and implementation report.
