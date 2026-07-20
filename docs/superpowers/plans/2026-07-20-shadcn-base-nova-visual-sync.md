# Shadcn Base Nova Visual Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Synchronize every scoped `@sun-world/ui` primitive with the current shadcn Base Nova registry while preserving the public Base UI compatibility contract.

**Architecture:** Generate official `@base-ui` source into a disposable comparison directory, then retain its DOM and utility-class structure in canonical component files. Keep callbacks, force mounting, refs, controlled state, and `Sun*` adapters separate from visual classes; patterns consume canonical primitives.

**Tech Stack:** React 19, TypeScript, `@base-ui/react`, shadcn CLI 4.13.1, Tailwind CSS v4, Vitest, Testing Library, pnpm 10.15.1.

## Global Constraints

- Use `https://ui.shadcn.com/r/styles/base-nova/{name}.json`; generated files are comparison-only and never committed.
- Preserve package subpaths, canonical exports, `Sun*` adapters, refs, controlled/uncontrolled state, `asChild`, loading, and callback adapters.
- Do not introduce Radix imports, legacy `.sun-*` primitive selectors, page-local primitive visuals, dependency upgrades, pushes, or deployment.
- Theme families customize semantic tokens only; primitive geometry and state styling follow Base Nova.
- Use `corepack pnpm`; required verification is `corepack pnpm test:ui` and `corepack pnpm check:web`.

---

### Task 1: Record the generated Base Nova baseline and protect it with source contracts

**Files:**
- Create: `scripts/check-ui-base-nova-sync.mjs`
- Modify: `scripts/check-web.mjs`
- Modify: `packages/ui/src/components/base-ui-contracts.react.spec.tsx`

**Interfaces:**
- Consumes: `packages/ui/components.json`, canonical modules, and existing public imports.
- Produces: a deterministic guard requiring the Base Nova registry, rejecting Radix and `.sun-*` primitive visuals, and preserving Select accessibility/keyboard behavior.

- [ ] **Step 1: Write the failing source/behavior contract**

Add SelectField assertions for Base Nova `data-slot` markers, canonical classes, keyboard selection, disabled options, and hidden-label accessible naming.

- [ ] **Step 2: Verify RED**

Run: `corepack pnpm -F @sun-world/ui exec vitest run src/components/base-ui-contracts.react.spec.tsx`

Expected: FAIL because the legacy Select adapter emits `.sun-select*` classes.

- [ ] **Step 3: Add the source guard and register it**

Scan `packages/ui/src/components`, reject `@radix-ui/` and CSS selectors beginning `.sun-`, require the Base Nova registry URL, and reject direct primitive-style classes from `apps/web/src`.

- [ ] **Step 4: Verify GREEN**

Run: `corepack pnpm exec node scripts/check-ui-base-nova-sync.mjs`

Expected: PASS after the migration is complete.

### Task 2: Synchronize simple primitives and surface composition

**Files:**
- Modify: `packages/ui/src/components/{badge,button,card,checkbox,field,input,label,separator,skeleton,textarea}/**/*.{tsx,css}`
- Modify: `packages/ui/src/components/shadcn-aliases.react.spec.tsx`

**Interfaces:**
- Consumes: generated Base Nova source and `cn`.
- Produces: unchanged public exports with Base-Nova-shaped class strings and markup.

- [ ] **Step 1: Write failing variant/ref contracts**

For every simple primitive, assert a canonical role, ref, state, or variant and verify no rendered class begins with `sun-`.

- [ ] **Step 2: Verify RED**

Run: `corepack pnpm -F @sun-world/ui exec vitest run src/components/shadcn-aliases.react.spec.tsx`

Expected: FAIL before legacy visual wrappers are removed.

- [ ] **Step 3: Port generated Base Nova visual structures**

Copy generated class names and DOM order into canonical files; preserve adapters in `legacy.tsx` only and delete obsolete CSS after its final consumer is migrated.

- [ ] **Step 4: Verify GREEN**

Run: `corepack pnpm -F @sun-world/ui exec vitest run src/components/shadcn-aliases.react.spec.tsx`

Expected: PASS.

### Task 3: Synchronize compound overlays and form composition

**Files:**
- Modify: `packages/ui/src/components/{dialog,dropdown-menu,select,tabs,tooltip}/**/*.{tsx,css}`
- Modify: `packages/ui/src/components/sonner/sonner.tsx`
- Modify: `packages/ui/src/patterns/form-controls/form-controls.tsx`
- Test: `packages/ui/src/components/base-ui-contracts.react.spec.tsx`

**Interfaces:**
- Consumes: Base UI compound exports and current callback-bridge helpers.
- Produces: Base Nova trigger/popup/item/indicator geometry and stable callback signatures.

- [ ] **Step 1: Write failing Select visual/accessibility contracts**

Assert a SelectField uses Base Nova trigger/popup/item/indicator slots while retaining keyboard selection, disabled items, and hidden-label accessible names.

- [ ] **Step 2: Verify RED**

Run: `corepack pnpm -F @sun-world/ui exec vitest run src/components/base-ui-contracts.react.spec.tsx`

Expected: FAIL while legacy Select classes and bespoke item styling remain.

- [ ] **Step 3: Port generated compound visual structures**

Replace visual class sets and component CSS with Base Nova. Retain `compound-compat.ts` solely for event/focus adapters.

- [ ] **Step 4: Verify GREEN**

Run: `corepack pnpm test:ui`

Expected: PASS without React warnings.

### Task 4: Enforce consumer purity and complete verification

**Files:**
- Modify: `packages/ui/README.md`
- Modify: `docs/current-state.md`
- Modify: `docs/agent-handoff.md`

**Interfaces:**
- Consumes: final source guard, UI tests, and web checks.
- Produces: durable Base Nova ownership and verification evidence.

- [ ] **Step 1: Run complete verification**

Run: `corepack pnpm exec node scripts/check-ui-base-nova-sync.mjs`, `corepack pnpm test:ui`, `corepack pnpm check:web`, `corepack pnpm format:check`, and `git diff --check`.

Expected: every command exits 0.

- [ ] **Step 2: Perform browser QA**

Inspect homepage and representative Select/dialog/menu/tab views at desktop/mobile widths, light/dark modes, and Sun World/Apple families. Verify trigger/popup sizing, indicators, keyboard navigation, disabled/error states, ICP filing, and no clipping.

- [ ] **Step 3: Record handoff state**

Document the CLI baseline version, files changed, commands/results, browser QA coverage, no deployment, and any exception.
