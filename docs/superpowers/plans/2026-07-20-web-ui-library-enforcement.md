# Web UI Library Enforcement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure every Web interactive control comes from the native shadcn-based UI package and that its complete style layer is loaded.

**Architecture:** The UI package owns primitives, reusable compositions, and its public CSS entry. Web pages consume package subpaths only; a static guard enforces the boundary.

**Tech Stack:** React 19, TypeScript, shadcn, Radix UI, Tailwind CSS v4, Vitest, Vite, pnpm.

## Global Constraints

- Keep native `<form>` elements for semantics.
- Do not allow raw `button`, `input`, `textarea`, `select`, `option`, `label`, or `dialog` JSX in `apps/web/src`.
- Preserve Sun World/Apple one-click switching and light/dark/system modes.
- Preserve existing application behavior and accessible names.

---

### Task 1: Add the Web native-control and style-entry guard

**Files:**
- Create: `scripts/check-web-ui-library.mjs`
- Modify: `scripts/check-web.mjs`

**Interfaces:**
- Consumes: `apps/web/src`, `apps/web/src/main.tsx`
- Produces: a zero-exit source policy check

- [ ] Write a guard that scans TSX for forbidden raw interactive tags, rejects `apps/web/src/shared/ui`, and requires `@sun-world/ui/styles.css`.
- [ ] Run `corepack pnpm exec node scripts/check-web-ui-library.mjs` and confirm it fails with the current residual elements and CSS import.
- [ ] Wire the guard into `scripts/check-web.mjs` after the native shadcn package check.

### Task 2: Correct the UI package style and composition boundary

**Files:**
- Modify: `packages/ui/src/styles/globals.css`
- Modify: `packages/ui/package.json`
- Modify: `packages/ui/source-aliases.ts`
- Modify: `packages/ui/vite.config.ts`
- Create: `packages/ui/src/patterns/form-controls/form-controls.tsx`
- Create: `packages/ui/src/patterns/form-controls/index.ts`
- Create: `packages/ui/src/patterns/compound-controls/compound-controls.tsx`
- Create: `packages/ui/src/patterns/compound-controls/index.ts`
- Create: `packages/ui/src/patterns/file-picker/file-picker.tsx`
- Create: `packages/ui/src/patterns/file-picker/index.ts`
- Test: `packages/ui/src/components/react-contracts.react.spec.tsx`

**Interfaces:**
- Produces: `LabeledInput`, `SelectField`, `CheckboxField`, `DialogPanel`, `TabsView`, and `FilePicker`

- [ ] Add failing render/interaction tests for each composition and verify the named exports are missing.
- [ ] Move the existing Web compositions into UI patterns and implement `FilePicker` around a hidden native file input.
- [ ] Export each pattern through root, subpath, source alias, and Vite library entry.
- [ ] Point the public `styles.css` source path at `globals.css`, which imports legacy CSS after Tailwind/shadcn.
- [ ] Run UI tests and build until they pass.

### Task 3: Replace Web raw controls and local compositions

**Files:**
- Modify: every TSX file reported by `scripts/check-web-ui-library.mjs`
- Delete: `apps/web/src/shared/ui/form-controls.tsx`
- Delete: `apps/web/src/shared/ui/compound-controls.tsx`
- Modify: `apps/web/src/main.tsx`

**Interfaces:**
- Consumes: UI package subpaths from Task 2

- [ ] Switch the Web global CSS import to `@sun-world/ui/styles.css`.
- [ ] Replace raw buttons with `Button`, preserving variants, sizes, handlers, disabled state, and accessible labels.
- [ ] Replace theme radios with UI `Label` and `Checkbox`/radio-compatible controls.
- [ ] Replace article editor native selects with `SelectField`.
- [ ] Replace file input markup with `FilePicker`.
- [ ] Import all reusable compositions from `@sun-world/ui/*` and delete `apps/web/src/shared/ui`.
- [ ] Run the source guard and confirm it passes.

### Task 4: Full regression and visual verification

**Files:**
- Modify: `docs/current-state.md`
- Modify: `docs/agent-handoff.md`

**Interfaces:**
- Consumes: completed migration

- [ ] Run `corepack pnpm format:check` and `git diff --check`.
- [ ] Run `corepack pnpm -C packages/ui test` and `corepack pnpm -C packages/ui build`.
- [ ] Run `corepack pnpm check:web` and confirm tests, typecheck, build, SSG, package guards, and budgets pass.
- [ ] Inspect the homepage in desktop light mode and verify one-click Sun World/Apple switching has consistently styled buttons, fields, selects, tags, and cards.
- [ ] Record exact verification results in the current-state and handoff docs.
