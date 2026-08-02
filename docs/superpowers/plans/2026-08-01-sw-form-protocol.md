# Sw Form Protocol Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give business code stable `SwInput` and `SwSelect` APIs while keeping shadcn/Base UI composition private to `@sun-world/ui`.

**Architecture:** `SwInput` and `SwSelect` are UI-package protocol components that own accessibility, option metadata, primitive composition, and modal placement. Deprecated adapters forward to this protocol. Business consumers import only the protocol subpaths.

**Tech Stack:** React 19, TypeScript, Base UI, shadcn-style Sun World UI package, Vitest, Testing Library.

## Global Constraints

- Business code must not import `@sun-world/ui/input`, `@sun-world/ui/select`, or Select sub-primitives.
- Export names use the `Sw` prefix: `SwInput` and `SwSelect`.
- `SwSelect surface="modal"` owns the internal `forceMount` compatibility behaviour.
- Do not add dependencies or commit changes.

---

### Task 1: Implement and verify protocol components

**Files:**
- Create: `packages/ui/src/components/sw-input/sw-input.tsx`
- Create: `packages/ui/src/components/sw-input/index.ts`
- Create: `packages/ui/src/components/sw-select/sw-select.tsx`
- Create: `packages/ui/src/components/sw-select/index.ts`
- Modify: `packages/ui/package.json`
- Modify: `packages/ui/vite.config.ts`
- Modify: `packages/ui/src/components/react-contracts.react.spec.tsx`

**Interfaces:**
- Produces: `SwInput` and `SwSelect` public subpath exports.
- Consumes: internal `Input`, `Select`, `SelectTrigger`, `SelectValue`, `SelectContent`, and `SelectItem` primitives.

- [ ] **Step 1: Write failing public-behaviour tests**

Test that `SwInput` associates its label and emits its string value; test that
`SwSelect` receives options and emits a chosen option; test that a modal-surface
Select list is contained by its Dialog.

- [ ] **Step 2: Run the focused UI test to verify it fails**

Run: `corepack pnpm -C packages/ui exec vitest run src/components/react-contracts.react.spec.tsx`

Expected: FAIL because Sw protocol exports do not exist.

- [ ] **Step 3: Implement the minimal protocol components**

Use generated IDs and protocol properties for labels/errors. Map `SwOption[]`
to Base UI item metadata. Map `surface="modal"` to `SelectContent forceMount`.
Add package exports for `./sw-input` and `./sw-select`.

- [ ] **Step 4: Run focused UI tests to verify they pass**

Run: `corepack pnpm -C packages/ui exec vitest run src/components/react-contracts.react.spec.tsx`

Expected: PASS.

### Task 2: Migrate adapters and business consumers

**Files:**
- Modify: `packages/ui/src/components/input/legacy.tsx`
- Modify: `packages/ui/src/components/select/legacy.tsx`
- Modify: `packages/ui/src/patterns/form-controls/form-controls.tsx`
- Modify: `packages/ai-ui/src/AiProviderSettings.tsx`
- Modify: `packages/ai-ui/src/AiWorkspace.test.tsx`
- Modify: `apps/web/src/modules/blog/pages/ArticleEditorPage.tsx`

**Interfaces:**
- Consumes: Task 1 `SwInput` and `SwSelect` exports.
- Produces: business components with no direct input/select primitive imports.

- [ ] **Step 1: Extend the AI settings regression test**

Keep the provider-switch assertion and ensure it uses the modal protocol
component rather than exposed primitive composition.

- [ ] **Step 2: Run focused tests to verify the current migration boundary fails**

Run: `corepack pnpm -C packages/ai-ui exec vitest run src/AiWorkspace.test.tsx`

Expected: the new protocol import is absent before migration.

- [ ] **Step 3: Migrate consumers and forward legacy adapters**

Replace direct imports in business code with `SwInput` and `SwSelect`.
Implement old adapters as deprecated forwarders. Keep the article editor's
native multi-select behaviour behind the protocol adapter; do not change its
submitted category/tag values.

- [ ] **Step 4: Run focused tests to verify they pass**

Run: `corepack pnpm -C packages/ai-ui exec vitest run src/AiWorkspace.test.tsx`

Expected: PASS.

### Task 3: Verify package and application integration

**Files:**
- Test: `packages/ui/src/components/react-contracts.react.spec.tsx`
- Test: `packages/ai-ui/src/AiWorkspace.test.tsx`

- [ ] **Step 1: Run verification**

Run: `corepack pnpm test:ui && corepack pnpm test:ai-ui && corepack pnpm build:ui && corepack pnpm build:ai-ui && corepack pnpm -C apps/web run typecheck && corepack pnpm format:check && git diff --check`

Expected: all commands exit 0.
