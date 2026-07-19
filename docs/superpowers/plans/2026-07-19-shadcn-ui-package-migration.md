# Shadcn-Style UI Package Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move every public `@sun-world/ui` component into a self-contained shadcn-style directory while preserving all existing import paths, APIs, styles, themes, and application behavior.

**Architecture:** Primitive UI units live under `src/components/<name>` and higher-level assemblies live under `src/patterns/<name>`. Each directory owns implementation, CSS, tests, and its `index.ts`; Vite library entries point directly to those indexes while the package exports map and built filenames remain stable.

**Tech Stack:** React 19, TypeScript, Radix UI, CVA, clsx, tailwind-merge, authored CSS, Vite library mode, Vitest, Testing Library.

## Global Constraints

- Preserve all current `@sun-world/ui/*` public subpaths and built filenames.
- Preserve all existing `Sun*` exports and component behavior.
- Do not add Tailwind or upgrade dependencies.
- Keep semantic design tokens authoritative for Sun World, Apple, light, dark, and system themes.
- Use `corepack pnpm` for every project command.
- Preserve unrelated working-tree changes, including the active blog visual polish.

---

### Task 1: Add The Package Structure Contract

**Files:**
- Create: `scripts/check-ui-shadcn-structure.mjs`
- Modify: `scripts/check-web.mjs`

**Interfaces:**
- Consumes: the approved component/pattern inventory from the design spec.
- Produces: a deterministic repository check for colocated component files and stable public entries.

- [ ] **Step 1: Write the failing structure check**

Define primitive names (`button`, `card`, `checkbox`, `dialog`, `dropdown-menu`, `input`, `label`, `loading-skeleton`, `select`, `tabs`, `tag`, `textarea`, `toast`, `tooltip`) and pattern names (`chat-composer`, `chat-shell`, `date-picker`, `list`, `pagination`, `theme-provider`). For each name, require `<root>/<name>/index.ts`, `<root>/<name>/<name>.tsx`, and component CSS where the current component owns CSS. Reject legacy `src/components/Sun*.tsx` and root forwarding files after migration.

- [ ] **Step 2: Run the check and verify RED**

Run: `corepack pnpm exec node scripts/check-ui-shadcn-structure.mjs`

Expected: FAIL because the directory entrypoints do not exist yet.

- [ ] **Step 3: Register the check in `scripts/check-web.mjs`**

Add a `UI shadcn structure check` immediately before the existing UI package boundary check.

- [ ] **Step 4: Commit the failing contract**

```powershell
git add scripts/check-ui-shadcn-structure.mjs scripts/check-web.mjs
git commit -m "test(ui): define shadcn package structure"
```

### Task 2: Migrate Shared Utilities And Foundational Components

**Files:**
- Create: `packages/ui/src/components/label/{label.tsx,index.ts}`
- Create: `packages/ui/src/components/button/{button.tsx,button.css,index.ts}`
- Create: `packages/ui/src/components/card/{card.tsx,card.css,index.ts}`
- Create: `packages/ui/src/components/input/{input.tsx,input.css,index.ts}`
- Create: `packages/ui/src/components/textarea/{textarea.tsx,textarea.css,index.ts}`
- Modify: `packages/ui/src/components/react-contracts.react.spec.tsx`

**Interfaces:**
- Consumes: `cn()` from `src/lib/cn.ts`, shared semantic tokens from `src/styles/base.css`.
- Produces: unchanged `SunLabel`, `SunButton`, `SunCard`, `SunInput`, and `SunTextarea` exports; additive `Button`, `Card`, `Input`, `Label`, and `Textarea` aliases.

- [ ] **Step 1: Add failing alias/import assertions**

Extend the React contract test to import canonical aliases from the new directory indexes and assert that each alias renders the same accessible element and variants as its `Sun*` counterpart.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `corepack pnpm -C packages/ui test -- react-contracts.react.spec.tsx`

Expected: FAIL because the new directory modules and aliases do not exist.

- [ ] **Step 3: Move implementations and colocate styles**

Move source without changing props or rendered behavior. Export aliases as direct bindings, for example `export { SunButton, SunButton as Button, buttonVariants }`. Update relative imports to `../../lib/cn` and `../../styles/base.css`.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `corepack pnpm -C packages/ui test -- react-contracts.react.spec.tsx`

Expected: PASS.

- [ ] **Step 5: Commit foundational components**

```powershell
git add packages/ui/src/components packages/ui/src/styles
git commit -m "refactor(ui): colocate foundational components"
```

### Task 3: Migrate Form And Display Primitives

**Files:**
- Create: `packages/ui/src/components/checkbox/{checkbox.tsx,checkbox.css,index.ts}`
- Create: `packages/ui/src/components/select/{select.tsx,select.css,index.ts}`
- Create: `packages/ui/src/components/tabs/{tabs.tsx,tabs.css,index.ts}`
- Create: `packages/ui/src/components/tag/{tag.tsx,tag.css,index.ts}`
- Create: `packages/ui/src/components/loading-skeleton/{loading-skeleton.tsx,loading-skeleton.css,index.ts}`
- Modify: `packages/ui/src/components/react-contracts.react.spec.tsx`

**Interfaces:**
- Consumes: the migrated Label and Button directory entrypoints.
- Produces: stable Sun-prefixed exports plus `Checkbox`, `Select`, `Tabs`, `Tag`, and `LoadingSkeleton` aliases.

- [ ] **Step 1: Add failing interaction and alias assertions**

Cover controlled checkbox changes, Select option choice, Tabs activation, disabled Tag behavior, and skeleton line count through new directory imports.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `corepack pnpm -C packages/ui test -- react-contracts.react.spec.tsx`

Expected: FAIL on missing new directory imports.

- [ ] **Step 3: Move implementations and styles**

Keep Radix controlled-state behavior and all current class names. Replace imports of old root forwarding modules with directory indexes.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `corepack pnpm -C packages/ui test -- react-contracts.react.spec.tsx`

Expected: PASS.

- [ ] **Step 5: Commit form and display primitives**

```powershell
git add packages/ui/src/components
git commit -m "refactor(ui): colocate form and display primitives"
```

### Task 4: Migrate Overlay Primitives

**Files:**
- Create: `packages/ui/src/components/dialog/{dialog.tsx,dialog.css,index.ts}`
- Create: `packages/ui/src/components/dropdown-menu/{dropdown-menu.tsx,dropdown-menu.css,index.ts}`
- Create: `packages/ui/src/components/toast/{toast.tsx,toast.css,index.ts}`
- Create: `packages/ui/src/components/tooltip/{tooltip.tsx,tooltip.css,index.ts}`
- Modify: `packages/ui/src/components/react-contracts.react.spec.tsx`

**Interfaces:**
- Consumes: Radix primitives, Sonner, semantic material tokens.
- Produces: stable overlay exports that retain portal behavior under document-level theme attributes.

- [ ] **Step 1: Add failing overlay directory tests**

Import overlays from their proposed directory indexes and assert Dialog labelling/close behavior, DropdownMenu item activation, Tooltip accessible content, and Toast API availability.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `corepack pnpm -C packages/ui test -- react-contracts.react.spec.tsx`

Expected: FAIL on missing overlay directory modules.

- [ ] **Step 3: Move overlay implementations and styles**

Retain Radix portals and current CSS selectors. Move overlay-specific rules from `styles/globals.css` into colocated CSS while leaving only genuinely shared portal/material rules global.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `corepack pnpm -C packages/ui test -- react-contracts.react.spec.tsx`

Expected: PASS.

- [ ] **Step 5: Commit overlay primitives**

```powershell
git add packages/ui/src/components packages/ui/src/styles/globals.css
git commit -m "refactor(ui): colocate overlay primitives"
```

### Task 5: Migrate Higher-Level Patterns

**Files:**
- Create: `packages/ui/src/patterns/chat-composer/{chat-composer.tsx,chat-composer.css,index.ts}`
- Create: `packages/ui/src/patterns/chat-shell/{chat-shell.tsx,chat-shell.css,index.ts}`
- Create: `packages/ui/src/patterns/date-picker/{date-picker.tsx,date-picker.css,index.ts}`
- Create: `packages/ui/src/patterns/list/{list.tsx,list.css,index.ts}`
- Create: `packages/ui/src/patterns/pagination/{pagination.tsx,pagination.css,index.ts}`
- Create: `packages/ui/src/patterns/theme-provider/{theme-provider.tsx,theme-provider.css,index.ts}`
- Modify: `packages/ui/src/components/react-contracts.react.spec.tsx`
- Modify: `packages/ui/src/theme/createSunThemeVars.spec.ts`

**Interfaces:**
- Consumes: migrated Button, Input, Textarea, Dialog, and foundational indexes.
- Produces: unchanged public pattern APIs and theme variable behavior.

- [ ] **Step 1: Add failing pattern directory imports**

Switch contract-test imports to proposed pattern indexes while preserving assertions for chat submit/clear, responsive date range controls, list selection, pagination/loading, and theme variable mapping.

- [ ] **Step 2: Run tests and verify RED**

Run: `corepack pnpm -C packages/ui test`

Expected: FAIL because pattern directory modules are missing.

- [ ] **Step 3: Move patterns and update internal dependencies**

Move implementation and CSS without altering consumer props. Import primitives only from their directory indexes. Keep theme calculation in `src/theme/createSunThemeVars.ts` and expose it through the theme-provider pattern.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `corepack pnpm -C packages/ui test`

Expected: PASS.

- [ ] **Step 5: Commit patterns**

```powershell
git add packages/ui/src/patterns packages/ui/src/components/react-contracts.react.spec.tsx packages/ui/src/theme
git commit -m "refactor(ui): colocate composite patterns"
```

### Task 6: Switch Public Entries And Build Configuration

**Files:**
- Modify: `packages/ui/vite.config.ts`
- Modify: `packages/ui/src/index.ts`
- Modify: `packages/ui/package.json`
- Modify: `packages/ui/src/styles/index.css`
- Delete: `packages/ui/src/{button,card,chat-composer,chat-shell,checkbox,date-picker,dialog,dropdown-menu,input,label,list,loading-skeleton,pagination,select,tabs,tag,textarea,theme-provider,toast,tooltip}.ts`
- Delete: `packages/ui/src/components/Sun*.tsx`
- Delete: migrated component CSS files from `packages/ui/src/styles/`

**Interfaces:**
- Consumes: every migrated component/pattern directory index.
- Produces: unchanged package subpaths, build artifact names, root exports, and `styles.css` entry.

- [ ] **Step 1: Update the structure test to enforce final cleanup**

Enable rejection of every obsolete root forwarding file, flat `Sun*.tsx`, and migrated flat component stylesheet.

- [ ] **Step 2: Run structure test and verify RED**

Run: `corepack pnpm exec node scripts/check-ui-shadcn-structure.mjs`

Expected: FAIL while legacy files still exist.

- [ ] **Step 3: Redirect entries and remove legacy files**

Change Vite entry mapping to explicit primitive/pattern directory indexes. Point root exports to those indexes. Keep the `package.json` export map and build filenames unchanged. Update `styles/index.css` to import colocated styles or make it import component directory styles directly.

- [ ] **Step 4: Run structure, tests, and build**

Run:

```powershell
corepack pnpm exec node scripts/check-ui-shadcn-structure.mjs
corepack pnpm -C packages/ui test
corepack pnpm -C packages/ui build
```

Expected: all PASS; `dist/button.es.js`, `dist/select.es.js`, and all declared subpath artifacts exist.

- [ ] **Step 5: Commit public entry migration**

```powershell
git add packages/ui scripts/check-ui-shadcn-structure.mjs
git commit -m "refactor(ui): switch public entries to shadcn directories"
```

### Task 7: Update Documentation And Verify Consumers

**Files:**
- Modify: `packages/ui/README.md`
- Modify: `packages/ui/components.json`
- Modify: `docs/current-state.md`
- Modify: `docs/agent-handoff.md`

**Interfaces:**
- Consumes: final package structure and build output.
- Produces: accurate React/shadcn ownership documentation and durable handoff state.

- [ ] **Step 1: Correct package documentation**

Replace obsolete Vue terminology and examples. Document primitives versus patterns, directory ownership, stable subpath imports, aliases, semantic token rules, and component generation expectations. Align `components.json` aliases with the actual directory names.

- [ ] **Step 2: Run complete verification**

Run:

```powershell
corepack pnpm -C packages/ui test
corepack pnpm -C packages/ui build
corepack pnpm check:web
corepack pnpm format:check
git diff --check
```

Expected: all PASS. Existing application imports compile unchanged and frontend performance budgets remain within limits.

- [ ] **Step 3: Inspect generated declarations and imports**

Run:

```powershell
rg -n "components/Sun|src/(button|select|dialog)" packages/ui/dist/types
rg -n "@sun-world/ui" apps/web/src
```

Expected: no obsolete generated declaration paths; application imports remain public subpaths.

- [ ] **Step 4: Update durable handoff documentation**

Record component inventory, commands, verification results, branch status, and that deployment has not occurred.

- [ ] **Step 5: Commit documentation**

```powershell
git add packages/ui/README.md packages/ui/components.json docs/current-state.md docs/agent-handoff.md
git commit -m "docs(ui): document project-owned shadcn library"
```
