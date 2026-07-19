# Native Shadcn UI Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the shadcn-inspired UI layer with canonical shadcn primitives, a real Tailwind pipeline, canonical application imports, and theme-token-driven Sun World and Apple skins.

**Architecture:** `packages/ui` owns canonical primitives and deprecated adapters; `patterns` compose primitives; `apps/web` consumes canonical APIs. Tailwind utilities style components while semantic CSS variables preserve independent design-family and color-mode switching.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, Vite, shadcn/ui, Radix UI, CVA, clsx, tailwind-merge, Vitest, Testing Library.

## Global Constraints

- Preserve routes, workflows, API contracts, persisted theme preferences, and public package subpaths.
- Keep Sun World and Apple independently switchable across light, dark, and system modes.
- Keep `Sun*` compatibility exports for one migration window and mark them `@deprecated`.
- Do not push or deploy.
- Use `corepack pnpm` so pnpm 10.15.1 and Node 24.17.0 project constraints remain authoritative.

---

### Task 1: Establish The Native Shadcn Toolchain Contract

**Files:**
- Modify: `packages/ui/components.json`
- Modify: `packages/ui/package.json`
- Modify: `apps/web/package.json`
- Modify: `pnpm-lock.yaml`
- Create: `apps/web/postcss.config.mjs`
- Create: `apps/web/tailwind.config.ts`
- Create: `scripts/check-ui-native-shadcn.mjs`
- Modify: `scripts/check-web.mjs`

**Interfaces:**
- Consumes: the existing workspace package graph and `packages/ui/src/lib/cn.ts`.
- Produces: a real Tailwind scan/build pipeline and a repository check that rejects descriptive-only shadcn configuration.

- [ ] **Step 1: Write the failing native-shadcn structure check**

The check must assert executable aliases, Tailwind dependencies/configuration,
canonical component exports, and the absence of `.sun-*` selectors in primitive
implementation CSS.

- [ ] **Step 2: Run the check and verify RED**

Run: `corepack pnpm exec node scripts/check-ui-native-shadcn.mjs`
Expected: FAIL because Tailwind configuration and canonical contracts are absent.

- [ ] **Step 3: Install and configure the Tailwind pipeline**

Use workspace-compatible Tailwind/PostCSS packages, point content scanning at
`apps/web/src` and `packages/ui/src`, and make `components.json` aliases match
real directories.

- [ ] **Step 4: Run the focused check and web CSS build**

Run: `corepack pnpm exec node scripts/check-ui-native-shadcn.mjs`
Expected: PASS for toolchain configuration assertions.

Run: `corepack pnpm -C apps/web build`
Expected: CSS processing starts successfully; later component failures are allowed until subsequent tasks.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/components.json packages/ui/package.json apps/web/package.json apps/web/postcss.config.mjs apps/web/tailwind.config.ts pnpm-lock.yaml scripts/check-ui-native-shadcn.mjs scripts/check-web.mjs
git commit -m "build(ui): enable native shadcn toolchain"
```

### Task 2: Replace Core Form And Surface Primitives

**Files:**
- Modify: `packages/ui/src/components/button/button.tsx`
- Modify: `packages/ui/src/components/input/input.tsx`
- Modify: `packages/ui/src/components/textarea/textarea.tsx`
- Modify: `packages/ui/src/components/label/label.tsx`
- Modify: `packages/ui/src/components/card/card.tsx`
- Modify: `packages/ui/src/components/checkbox/checkbox.tsx`
- Modify: `packages/ui/src/components/loading-skeleton/loading-skeleton.tsx`
- Modify: component `index.ts` files in the same directories
- Create: `packages/ui/src/components/native-primitives.react.spec.tsx`

**Interfaces:**
- Consumes: `cn(...inputs)`, CVA, Radix Checkbox, standard shadcn semantic utility names.
- Produces: `Button`, `buttonVariants`, `Input`, `Textarea`, `Label`, all Card parts, `Checkbox`, and `Skeleton` with forwarded refs and canonical props.

- [ ] **Step 1: Add failing canonical contract tests**

Tests render each canonical primitive, assert forwarded refs, standard button
variants, explicit label composition, checkbox accessible state, and complete
Card composition.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `corepack pnpm -C packages/ui test -- native-primitives.react.spec.tsx`
Expected: FAIL on missing standard variants, refs, Card parts, or Skeleton export.

- [ ] **Step 3: Implement canonical shadcn primitives**

Use utility classes and standard props. Move old prop translation into deprecated
adapter exports; do not retain separate `.sun-*` primitive styles.

- [ ] **Step 4: Run UI tests and build**

Run: `corepack pnpm -C packages/ui test`
Expected: PASS.

Run: `corepack pnpm -C packages/ui build`
Expected: ESM, CJS/declarations, and stable subpath outputs succeed.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/components
git commit -m "refactor(ui): adopt canonical shadcn core primitives"
```

### Task 3: Replace Compound Radix Primitives

**Files:**
- Modify: `packages/ui/src/components/dialog/dialog.tsx`
- Modify: `packages/ui/src/components/dropdown-menu/dropdown-menu.tsx`
- Modify: `packages/ui/src/components/select/select.tsx`
- Modify: `packages/ui/src/components/tabs/tabs.tsx`
- Modify: `packages/ui/src/components/tooltip/tooltip.tsx`
- Modify: `packages/ui/src/components/toast/toast.tsx`
- Modify: component `index.ts` files in the same directories
- Create: `packages/ui/src/components/native-compounds.react.spec.tsx`

**Interfaces:**
- Consumes: Radix primitive packages, Sonner, canonical Button and utility classes.
- Produces: standard shadcn compound parts such as `DialogTrigger`, `DialogContent`, `SelectTrigger`, `SelectContent`, `SelectItem`, `TabsList`, and `DropdownMenuItem`.

- [ ] **Step 1: Add failing compound composition and keyboard tests**

Tests compose trigger/content/item parts directly, exercise keyboard opening and
selection, and verify accessible dialog naming and tooltip content.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `corepack pnpm -C packages/ui test -- native-compounds.react.spec.tsx`
Expected: FAIL because monolithic `Sun*` contracts do not expose all parts.

- [ ] **Step 3: Implement canonical compound components and adapters**

Export the Radix-aligned parts with forwarded refs and utility classes. Keep old
monolithic behavior only in deprecated adapters that compose canonical parts.

- [ ] **Step 4: Run UI tests and package build**

Run: `corepack pnpm -C packages/ui test && corepack pnpm -C packages/ui build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/components
git commit -m "refactor(ui): adopt canonical shadcn compound primitives"
```

### Task 4: Map Sun World And Apple To Shadcn Theme Variables

**Files:**
- Modify: `packages/ui/src/styles/base.css`
- Modify: `packages/ui/src/styles/globals.css`
- Modify: `packages/ui/src/styles/index.css`
- Modify: `packages/ui/src/theme/createSunThemeVars.ts`
- Modify: `packages/ui/src/theme/createSunThemeVars.spec.ts`
- Modify: `apps/web/src/shared/design/tokens.css`
- Modify: `apps/web/src/shared/design/themes.css`

**Interfaces:**
- Consumes: existing `data-design`, color-mode attributes, and persisted theme controller behavior.
- Produces: the complete shadcn semantic variable surface for both families and all color modes.

- [ ] **Step 1: Extend theme tests to require all shadcn variables**

Assert `background`, `foreground`, `card`, `popover`, `primary`, `secondary`,
`muted`, `accent`, `destructive`, `border`, `input`, `ring`, and foreground pairs.

- [ ] **Step 2: Run the theme tests and verify RED**

Run: `corepack pnpm -C packages/ui test -- createSunThemeVars.spec.ts`
Expected: FAIL on incomplete standard variable mapping.

- [ ] **Step 3: Implement semantic mappings and Apple accessibility fallbacks**

Map both families without component-specific theme forks. Preserve translucent
overlay materials, reduced-transparency solid fallbacks, reduced-motion
cross-fades, high-contrast borders, and system typography.

- [ ] **Step 4: Run theme and UI tests**

Run: `corepack pnpm -C packages/ui test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/styles packages/ui/src/theme apps/web/src/shared/design
git commit -m "feat(ui): map themes to shadcn tokens"
```

### Task 5: Migrate Product Patterns To Canonical Primitives

**Files:**
- Modify: all files under `packages/ui/src/patterns/`
- Modify: `packages/ui/src/components/react-contracts.react.spec.tsx`

**Interfaces:**
- Consumes: canonical primitives from Tasks 2-3.
- Produces: behavior-compatible chat, date picker, list, pagination, and theme-provider patterns with no internal `Sun*` primitive dependency.

- [ ] **Step 1: Add a failing pattern boundary assertion**

Reject imports or JSX references to `SunButton`, `SunInput`, `SunDialog`,
`SunSelect`, and other deprecated primitives inside `patterns`.

- [ ] **Step 2: Run the boundary check and verify RED**

Run: `corepack pnpm exec node scripts/check-ui-native-shadcn.mjs`
Expected: FAIL on pattern dependencies.

- [ ] **Step 3: Migrate each pattern to canonical composition**

Keep pattern public behavior stable while replacing primitive calls and CSS
assumptions with standard components and semantic utilities.

- [ ] **Step 4: Run UI tests and build**

Run: `corepack pnpm -C packages/ui test && corepack pnpm -C packages/ui build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/patterns packages/ui/src/components/react-contracts.react.spec.tsx scripts/check-ui-native-shadcn.mjs
git commit -m "refactor(ui): compose patterns from shadcn primitives"
```

### Task 6: Migrate The Web Application To Canonical APIs

**Files:**
- Modify: every `apps/web/src/**/*.tsx` importing `Sun*` from `@sun-world/ui/*`
- Modify: related React tests under `apps/web/src/`
- Modify: `scripts/check-ui-package-boundary.mjs`

**Interfaces:**
- Consumes: canonical primitive subpath exports and migrated patterns.
- Produces: application code with no `Sun*` UI primitive imports and unchanged user workflows.

- [ ] **Step 1: Make the boundary check reject application `Sun*` UI imports**

The check permits icon package names and product-specific pattern names during
their compatibility window, but rejects primitive `SunButton`, `SunInput`,
`SunDialog`, `SunSelect`, `SunTabs`, and equivalent imports from `@sun-world/ui`.

- [ ] **Step 2: Run the boundary check and verify RED**

Run: `corepack pnpm exec node scripts/check-ui-package-boundary.mjs`
Expected: FAIL with the current application import locations.

- [ ] **Step 3: Migrate imports, props, and compound JSX**

Replace embedded label/options/dialog conveniences with explicit Label,
SelectItem, DialogHeader, and related composition. Preserve accessible names,
loading states, and all existing event behavior.

- [ ] **Step 4: Run application tests and typecheck**

Run: `corepack pnpm -C apps/web test:react`
Expected: PASS.

Run: `corepack pnpm -C apps/web typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src scripts/check-ui-package-boundary.mjs
git commit -m "refactor(web): consume canonical shadcn components"
```

### Task 7: Documentation, Full Verification, And Handoff

**Files:**
- Modify: `packages/ui/README.md`
- Modify: `docs/current-state.md`
- Modify: `docs/agent-handoff.md`
- Modify: `scripts/check-web.mjs`

**Interfaces:**
- Consumes: the completed migration and all focused checks.
- Produces: durable usage documentation and a full-project verification record.

- [ ] **Step 1: Update documentation and migration examples**

Document canonical imports, CLI usage, theme variable ownership, deprecated
aliases, and the `patterns` boundary.

- [ ] **Step 2: Run formatting and repository guards**

Run: `corepack pnpm format:check`
Expected: PASS.

Run: `git diff --check`
Expected: PASS.

- [ ] **Step 3: Run focused UI verification**

Run: `corepack pnpm exec node scripts/check-ui-native-shadcn.mjs`
Expected: PASS.

Run: `corepack pnpm -C packages/ui test && corepack pnpm -C packages/ui build`
Expected: PASS.

- [ ] **Step 4: Run the full web verification workflow**

Run: `corepack pnpm check:web`
Expected: PASS including React tests, TypeScript, production build, SSG,
performance budgets, native-shadcn structure, and chunk boundaries.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/README.md docs/current-state.md docs/agent-handoff.md scripts/check-web.mjs
git commit -m "docs(ui): complete native shadcn migration"
```
