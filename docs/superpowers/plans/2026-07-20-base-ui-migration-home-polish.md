# Base UI Migration And Home Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all shared Radix primitives with Base UI behind stable `@sun-world/ui` APIs and polish the homepage typography, alignment, and unlabeled search toolbar.

**Architecture:** `packages/ui` remains the compatibility boundary: canonical shadcn-style compound exports adapt `@base-ui/react`, while legacy `Sun*` components compose the canonical exports. Homepage changes are restricted to its existing React modules and CSS, with visual labels replaced by accessible names.

**Tech Stack:** React 19, TypeScript, `@base-ui/react`, shadcn Base UI registry, Tailwind CSS v4, Vitest, Testing Library, Vite, pnpm 10.15.1.

## Global Constraints

- Preserve current `@sun-world/ui` import paths, canonical names, application-facing callback contracts, and application-used legacy props.
- Remove every `@radix-ui/*` source import and package dependency from `packages/ui`.
- Keep both Sun World and Apple design families, light/dark/system mode, keyboard access, focus management, disabled states, and portal stacking functional.
- Remove visible labels only from the homepage search and sort controls; keep accessible names.
- Use `corepack pnpm` and the repository-declared Node/pnpm toolchain.
- Do not modify API contracts or unrelated page designs.

---

### Task 1: Lock Base UI dependency and compatibility contracts

**Files:**
- Modify: `packages/ui/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `packages/ui/components.json`
- Modify: `apps/web/components.json`
- Create: `packages/ui/src/components/base-ui-contracts.react.spec.tsx`

**Interfaces:**
- Consumes: existing public exports from `@sun-world/ui/{button,checkbox,select,dialog,dropdown-menu,tabs,tooltip}`.
- Produces: regression coverage for refs, controlled values, keyboard interaction, portals, disabled states, and stable callback payloads.

- [ ] **Step 1: Write failing Base UI contract tests**

Add tests that import canonical package exports and assert behavior rather than implementation. The first group must cover a controlled Select:

```tsx
it('preserves the controlled Select value contract', async () => {
  const onValueChange = vi.fn()
  render(
    <Select value="newest" onValueChange={onValueChange}>
      <SelectTrigger aria-label="Sort"><SelectValue /></SelectTrigger>
      <SelectContent><SelectItem value="oldest">Oldest</SelectItem></SelectContent>
    </Select>
  )
  await userEvent.click(screen.getByRole('combobox', { name: 'Sort' }))
  await userEvent.click(screen.getByRole('option', { name: 'Oldest' }))
  expect(onValueChange).toHaveBeenCalledWith('oldest')
})
```

Add equivalent focused assertions for Checkbox boolean state, Dialog open/close,
Dropdown Menu item selection, Tabs value changes, Tooltip accessible content,
and Button ref forwarding.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `corepack pnpm -F @sun-world/ui exec vitest run src/components/base-ui-contracts.react.spec.tsx`

Expected: FAIL because the new Base UI contract test identifies Base UI roots or behavior not yet provided.

- [ ] **Step 3: Install Base UI and select the Base registry**

Run: `corepack pnpm -F @sun-world/ui add @base-ui/react`

Update both `components.json` files with the Base UI-compatible registry setting produced by the current shadcn schema; do not change aliases, `new-york`, `neutral`, CSS variables, or Lucide configuration.

- [ ] **Step 4: Verify dependency resolution**

Run: `corepack pnpm -F @sun-world/ui exec node -e "import('@base-ui/react').then(() => console.log('base-ui-ready'))"`

Expected: `base-ui-ready`.

- [ ] **Step 5: Commit the contract baseline**

```bash
git add packages/ui/package.json pnpm-lock.yaml packages/ui/components.json apps/web/components.json packages/ui/src/components/base-ui-contracts.react.spec.tsx
git commit -m "test(ui): lock Base UI migration contracts"
```

### Task 2: Migrate simple primitives and polymorphic rendering

**Files:**
- Modify: `packages/ui/src/components/button/button.tsx`
- Modify: `packages/ui/src/components/badge/badge.tsx`
- Modify: `packages/ui/src/components/checkbox/checkbox.tsx`
- Modify: `packages/ui/src/components/checkbox/legacy.tsx`
- Modify: `packages/ui/src/components/label/label.tsx`
- Modify: `packages/ui/src/components/label/legacy.tsx`
- Modify: `packages/ui/src/components/separator/separator.tsx`
- Test: `packages/ui/src/components/base-ui-contracts.react.spec.tsx`
- Test: `packages/ui/src/components/shadcn-aliases.react.spec.tsx`

**Interfaces:**
- Produces: unchanged `Button`, `Badge`, `Checkbox`, `Label`, `Separator`, and legacy exports without Radix imports.

- [ ] **Step 1: Extend the failing tests for render composition**

Assert that Button/Badge can render a child link through the compatibility prop,
Checkbox calls `onCheckedChange` with a boolean, Label focuses its associated
input, and Separator exposes the expected orientation.

- [ ] **Step 2: Run tests and verify RED**

Run: `corepack pnpm -F @sun-world/ui exec vitest run src/components/base-ui-contracts.react.spec.tsx src/components/shadcn-aliases.react.spec.tsx`

Expected: FAIL on Base UI-specific composition and primitive behavior.

- [ ] **Step 3: Implement the simple Base UI adapters**

Use Base UI primitives and its `render` composition API. Preserve current class
strings, `data-slot`, `data-size`, `data-variant`, refs, and event names. Legacy
files must import canonical local components, not `@base-ui/react` directly.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the Step 2 command.

Expected: all focused tests pass with no React warnings.

- [ ] **Step 5: Commit simple primitives**

```bash
git add packages/ui/src/components/{button,badge,checkbox,label,separator} packages/ui/src/components/base-ui-contracts.react.spec.tsx
git commit -m "refactor(ui): migrate simple primitives to Base UI"
```

### Task 3: Migrate compound overlay and selection primitives

**Files:**
- Modify: `packages/ui/src/components/select/select.tsx`
- Modify: `packages/ui/src/components/select/legacy.tsx`
- Modify: `packages/ui/src/components/dialog/dialog.tsx`
- Modify: `packages/ui/src/components/dialog/legacy.tsx`
- Modify: `packages/ui/src/components/dropdown-menu/dropdown-menu.tsx`
- Modify: `packages/ui/src/components/dropdown-menu/legacy.tsx`
- Modify: `packages/ui/src/components/tabs/tabs.tsx`
- Modify: `packages/ui/src/components/tabs/legacy.tsx`
- Modify: `packages/ui/src/components/tooltip/tooltip.tsx`
- Modify: `packages/ui/src/components/tooltip/legacy.tsx`
- Modify: `packages/ui/src/patterns/form-controls/form-controls.tsx`
- Test: `packages/ui/src/components/base-ui-contracts.react.spec.tsx`
- Test: `packages/ui/src/components/react-contracts.react.spec.tsx`

**Interfaces:**
- Produces: shadcn-style compound APIs backed exclusively by Base UI and form-control adapters with stable `value`/`onValueChange` behavior.

- [ ] **Step 1: Complete interaction tests for compound components**

Add assertions for Escape dismissal, outside-click dismissal, focus return,
arrow-key selection, disabled items, checked menu items, controlled Tabs, and
Tooltip delay-provider composition. Use user-visible roles and names.

- [ ] **Step 2: Run compound tests and verify RED**

Run: `corepack pnpm -F @sun-world/ui exec vitest run src/components/base-ui-contracts.react.spec.tsx src/components/react-contracts.react.spec.tsx`

Expected: FAIL where the current Radix wrappers do not satisfy the new Base UI adapter contract.

- [ ] **Step 3: Implement Base UI compound adapters**

Map current exports onto Base UI's Root/Trigger/Popup/Portal/Positioner structure.
Keep existing export names and translate Base UI callback payloads to current
string/boolean callbacks. Preserve `data-slot` selectors and replace obsolete
Radix CSS variables with Base UI anchor/popup variables in class names.

- [ ] **Step 4: Rebuild legacy wrappers from canonical exports**

Change every compound `legacy.tsx` file to compose sibling canonical exports.
Keep application-used `Sun*` props and remove direct primitive imports.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run the Step 2 command.

Expected: all compound and legacy contract tests pass without act or hydration warnings.

- [ ] **Step 6: Commit compound primitives**

```bash
git add packages/ui/src/components/{select,dialog,dropdown-menu,tabs,tooltip} packages/ui/src/patterns/form-controls/form-controls.tsx packages/ui/src/components/*.react.spec.tsx
git commit -m "refactor(ui): migrate compound primitives to Base UI"
```

### Task 4: Remove visible homepage toolbar labels

**Files:**
- Modify: `packages/ui/src/patterns/form-controls/form-controls.tsx`
- Modify: `apps/web/src/modules/blog/ui/BlogHomeFeed.tsx`
- Modify: `apps/web/src/modules/blog/ui/BlogHomeFeed.test.tsx`
- Modify: `apps/web/src/modules/blog/styles/blog-experience.css`

**Interfaces:**
- Produces: optional visually hidden/omitted label support on shared field patterns and an unlabeled-looking toolbar with accessible search/sort controls.

- [ ] **Step 1: Write the failing toolbar semantics test**

Render `BlogHomeFeed`, assert both controls are discoverable by accessible name,
then assert those names are not present as standalone visible label elements:

```tsx
expect(screen.getByRole('searchbox', { name: '搜索博客' })).toBeVisible()
expect(screen.getByRole('combobox', { name: '排序方式' })).toBeVisible()
expect(screen.queryByText('搜索博客', { selector: 'label' })).toBeNull()
expect(screen.queryByText('排序方式', { selector: 'label' })).toBeNull()
```

- [ ] **Step 2: Run the test and verify RED**

Run: `corepack pnpm -F @sun-world/blog exec vitest run src/modules/blog/ui/BlogHomeFeed.test.tsx`

Expected: FAIL because both visible labels still render.

- [ ] **Step 3: Implement label-free visual fields**

Add a narrowly named optional field-pattern prop that omits the visible Label
and assigns the text via `aria-label`. Enable it only for the two homepage
toolbar controls. Change toolbar alignment from label-bottom alignment to center
alignment and retain responsive full-width controls.

- [ ] **Step 4: Run the test and verify GREEN**

Run the Step 2 command.

Expected: PASS for both accessible names and absent visible labels.

- [ ] **Step 5: Commit toolbar semantics**

```bash
git add packages/ui/src/patterns/form-controls/form-controls.tsx apps/web/src/modules/blog/ui/BlogHomeFeed.tsx apps/web/src/modules/blog/ui/BlogHomeFeed.test.tsx apps/web/src/modules/blog/styles/blog-experience.css
git commit -m "fix(home): simplify blog search toolbar labels"
```

### Task 5: Refine homepage typography and alignment

**Files:**
- Modify: `apps/web/src/modules/home/pages/home-react.css`
- Modify: `apps/web/src/modules/home/ui/WeatherCard.tsx`
- Modify: `apps/web/src/modules/blog/ui/SelfInfoCard.tsx`
- Modify: `apps/web/src/modules/blog/ui/BlogCard.tsx`
- Modify: `apps/web/src/modules/blog/styles/blog-experience.css`
- Test: `apps/web/src/modules/home/pages/HomePage.test.tsx`
- Test: `apps/web/src/modules/blog/ui/BlogHomeFeed.test.tsx`

**Interfaces:**
- Produces: consistent homepage type scale, aligned metric grids, and trailing read-more actions at desktop/mobile breakpoints.

- [ ] **Step 1: Add failing structural tests**

Assert stable semantic class hooks for the profile metric grid, weather metric
grid, and article action. Tests must verify structure and accessibility, leaving
exact visual dimensions to browser QA.

- [ ] **Step 2: Run focused web tests and verify RED**

Run: `corepack pnpm -F @sun-world/blog exec vitest run src/modules/home/pages/HomePage.test.tsx src/modules/blog/ui/BlogHomeFeed.test.tsx`

Expected: FAIL for the new alignment hooks.

- [ ] **Step 3: Implement the visual refinement**

Use a compact supporting type scale, equal-width metric columns, shared card
insets, consistent line heights, centered metric values, a trailing article
action, and mobile stacking. Preserve existing colors, tokens, shadows,
breakpoints, reduced-motion, and reduced-transparency behavior.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the Step 2 command.

Expected: PASS.

- [ ] **Step 5: Browser QA desktop and mobile**

Run: `corepack pnpm dev:web`

Inspect `/` at approximately `1440x900` and `390x844`. Verify no clipping,
consistent baselines, readable compact text, aligned profile/weather metrics,
stable article actions, keyboard focus, Select popup placement, dark mode, and
both design families.

- [ ] **Step 6: Commit homepage polish**

```bash
git add apps/web/src/modules/home apps/web/src/modules/blog/ui apps/web/src/modules/blog/styles/blog-experience.css
git commit -m "style(home): refine typography and card alignment"
```

### Task 6: Remove Radix and verify the complete migration

**Files:**
- Modify: `packages/ui/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `scripts/check-ui-native-shadcn.mjs`
- Modify: `packages/ui/README.md`
- Modify: `docs/current-state.md`
- Modify: `docs/agent-handoff.md`

**Interfaces:**
- Consumes: all migrated Base UI components and homepage refinements.
- Produces: dependency/source enforcement and durable project handoff state.

- [ ] **Step 1: Strengthen the migration guard and verify RED**

Update `scripts/check-ui-native-shadcn.mjs` to reject `@radix-ui/` in
`packages/ui/src` and `packages/ui/package.json`, and require
`@base-ui/react`. Run it before dependency removal and confirm it reports the
remaining Radix dependency entries.

Run: `corepack pnpm exec node scripts/check-ui-native-shadcn.mjs`

Expected: FAIL listing remaining `@radix-ui/*` dependencies.

- [ ] **Step 2: Remove obsolete dependencies**

Run one project-scoped package-manager command removing every Radix dependency
listed in `packages/ui/package.json`, then run `corepack pnpm install` to keep
the lockfile synchronized.

- [ ] **Step 3: Update durable documentation**

Document the Base UI implementation boundary, preserved public API, homepage
label behavior, commands run, visual QA results, and any remaining limitations
in the UI README, current state, and active handoff.

- [ ] **Step 4: Run full fresh verification**

Run in order:

```bash
corepack pnpm exec node scripts/check-ui-native-shadcn.mjs
corepack pnpm test:ui
corepack pnpm check:web
corepack pnpm build
corepack pnpm format:check
git diff --check
rg -n "@radix-ui/" packages/ui/src packages/ui/package.json
```

Expected: every command exits 0; the final `rg` exits 1 with no matches.

- [ ] **Step 5: Review the final diff against acceptance criteria**

Confirm stable exports, no visible toolbar labels, accessible control names,
Base UI-only primitive dependencies, responsive layout, both design families,
and no unrelated source changes.

- [ ] **Step 6: Commit verification and documentation**

```bash
git add packages/ui/package.json pnpm-lock.yaml scripts/check-ui-native-shadcn.mjs packages/ui/README.md docs/current-state.md docs/agent-handoff.md
git commit -m "docs(ui): record verified Base UI migration"
```
