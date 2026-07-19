# Switchable Design Themes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build independently selectable Sun World and Apple design families with light, dark, and system color modes plus a one-click family switch.

**Architecture:** A React theme controller persists `{ family, mode }`, resolves system color preference, and applies root data attributes while retaining legacy color classes. CSS semantic tokens carry each design family through the app and shared UI; a compact theme control exposes one-click switching plus precise choices.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, CSS custom properties, Radix-backed `@sun-world/ui`, Vite.

## Global Constraints

- Sun World remains the default design family.
- Supported families are exactly `sun-world` and `apple`; supported modes are exactly `light`, `dark`, and `system`.
- Preserve and migrate legacy `sun-light` and `sun-dark` local-storage values.
- Do not add a new runtime dependency solely for theming or animation.
- Never lock input during a theme transition.
- Respect `prefers-reduced-motion`, `prefers-reduced-transparency`, and `prefers-contrast: more`.
- Browsers without backdrop filters or View Transitions must remain fully usable.

---

### Task 1: Theme preference model and root application

**Files:**
- Modify: `apps/web/src/shared/design/theme.ts`
- Modify: `apps/web/src/shared/design/theme.test.tsx`
- Modify: `apps/web/src/shared/design/index.ts`

**Interfaces:**
- Produces: `DesignFamily = 'sun-world' | 'apple'`, `ColorMode = 'light' | 'dark' | 'system'`, `ResolvedColorMode = 'light' | 'dark'`, `ThemePreference`, and a `useTheme()` value containing `family`, `mode`, `resolvedMode`, `setFamily`, `setMode`, and `toggleFamily`.
- Root contract: `data-design`, `data-color-mode`, `sun-light|sun-dark`, and `color-scheme` are updated together.

- [ ] **Step 1: Write failing controller tests**

Add tests that assert the default `{ family: 'sun-world', mode: 'system' }`, legacy string migration, JSON persistence, one-click family switching without changing mode, explicit mode changes, media-query updates in system mode, cross-tab synchronization, and fallback when storage throws.

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `corepack pnpm -C apps/web exec vitest run src/shared/design/theme.test.tsx`

Expected: FAIL because the current controller only exposes `sun-light|sun-dark` and `toggleTheme`.

- [ ] **Step 3: Implement the preference model**

Use storage key `sun-world-theme`, parse only the exact supported values, read legacy key `theme` as a migration fallback, subscribe to `matchMedia('(prefers-color-scheme: dark)')`, and apply:

```ts
root.dataset.design = preference.family
root.dataset.colorMode = resolvedMode
root.classList.toggle('sun-light', resolvedMode === 'light')
root.classList.toggle('sun-dark', resolvedMode === 'dark')
root.style.colorScheme = resolvedMode
```

Keep browser APIs guarded for SSR/tests and keep state transitions synchronous from the consumer's perspective.

- [ ] **Step 4: Run focused tests**

Run: `corepack pnpm -C apps/web exec vitest run src/shared/design/theme.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/shared/design/theme.ts apps/web/src/shared/design/theme.test.tsx apps/web/src/shared/design/index.ts
git commit -m "feat(web): add design family theme model"
```

### Task 2: One-click family switch and precise theme menu

**Files:**
- Modify: `apps/web/src/components/ThemeSwitch/index.tsx`
- Create: `apps/web/src/components/ThemeSwitch/ThemeSwitch.test.tsx`
- Modify: `apps/web/src/style.css`

**Interfaces:**
- Consumes: Task 1 `useTheme()` contract.
- Produces: a compact control whose main button calls `toggleFamily`, plus native/radix-compatible menu actions calling `setFamily` and `setMode`.

- [ ] **Step 1: Write failing interaction tests**

Test that the main button has an accessible label naming the destination family, one click changes the family, the expanded control exposes both family choices and all three modes, and selected values use `aria-checked`.

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `corepack pnpm -C apps/web exec vitest run src/components/ThemeSwitch/ThemeSwitch.test.tsx`

Expected: FAIL because the current control only toggles light/dark.

- [ ] **Step 3: Implement the split theme control**

Use the existing `SunButton` and project icons. Keep the primary action one click. Place precise choices in an anchored, keyboard-operable menu using existing UI primitives when available; otherwise use an accessible `<details>`/radio-group implementation without adding a dependency. Labels must clearly distinguish “设计风格” from “明暗模式”.

- [ ] **Step 4: Add physical feedback styling**

Add immediate `:active` scale feedback, source-anchored menu transform origin, opacity/transform transitions using existing motion tokens, focus-visible treatment, and reduced-motion fallback.

- [ ] **Step 5: Run focused tests**

Run: `corepack pnpm -C apps/web exec vitest run src/components/ThemeSwitch/ThemeSwitch.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/ThemeSwitch apps/web/src/style.css
git commit -m "feat(web): add one-click skin switcher"
```

### Task 3: Theme token families and shared UI adoption

**Files:**
- Modify: `apps/web/src/styles/design-tokens.css`
- Modify: `packages/ui/src/styles/base.css`
- Modify: `packages/ui/src/styles/button.css`
- Modify: `packages/ui/src/styles/globals.css`
- Modify: `packages/ui/src/styles/dialog.css` if present; otherwise modify the existing dialog-owning stylesheet.
- Create: `scripts/check-design-themes.mjs`
- Modify: `scripts/check-web.mjs`

**Interfaces:**
- Consumes: root data attributes from Task 1.
- Produces: semantic variables for canvas, surfaces, materials, typography, borders, focus, radii, shadows, and motion; shared controls consume only those semantic variables.

- [ ] **Step 1: Write a failing static contract check**

The script must assert both `[data-design='sun-world']` and `[data-design='apple']` exist, light/dark selectors exist for each, required semantic tokens are assigned, and reduced motion/transparency plus increased-contrast media queries are present.

- [ ] **Step 2: Run the contract and verify failure**

Run: `corepack pnpm exec node scripts/check-design-themes.mjs`

Expected: FAIL because Apple selectors and accessibility fallbacks do not exist.

- [ ] **Step 3: Refactor tokens into two design families**

Keep base sizing/spacing and compatibility aliases. Define Sun World light/dark values with its blue/teal identity. Define Apple light/dark values with system blue, neutral layered surfaces, restrained radii, size-aware type tracking, translucent material tokens, and surface-size-appropriate shadows. Preserve legacy Element aliases only where still required.

- [ ] **Step 4: Adopt semantic tokens in shared controls**

Replace hard-coded visual values in the touched UI styles with theme tokens. Buttons must respond on press, dialog materials must remain legible, and focus rings must stay visible in all four family/appearance combinations.

- [ ] **Step 5: Add accessibility and capability fallbacks**

Implement solid material fallbacks before `backdrop-filter`, then enhance inside `@supports`. Add the three preference media queries required by the global constraints.

- [ ] **Step 6: Wire and run the contract**

Add `check-design-themes.mjs` to `scripts/check-web.mjs` and run:

`corepack pnpm exec node scripts/check-design-themes.mjs`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/styles/design-tokens.css packages/ui/src/styles scripts/check-design-themes.mjs scripts/check-web.mjs
git commit -m "feat(ui): add Sun World and Apple theme tokens"
```

### Task 4: Global layout and identity polish

**Files:**
- Modify: `apps/web/src/style.css`
- Modify: `apps/web/src/layout/header/index.tsx`
- Modify: `apps/web/src/layout/layout.tsx`
- Modify: relevant existing homepage styles under `apps/web/src/modules/home/`
- Modify: `apps/web/src/layout/layout.test.tsx`

**Interfaces:**
- Consumes: theme semantic tokens and Task 2 switcher.
- Produces: coherent desktop/mobile chrome, cards, and homepage surfaces in both families.

- [ ] **Step 1: Extend layout tests**

Assert the desktop header and mobile theme entry remain reachable, navigation landmarks keep accessible names, and no theme-specific component branch is introduced in layout JSX.

- [ ] **Step 2: Run the layout tests and verify their initial state**

Run: `corepack pnpm -C apps/web exec vitest run src/layout/layout.test.tsx`

Expected: new assertions FAIL until accessible labels and structure are updated.

- [ ] **Step 3: Apply semantic global styling**

Make page canvas, header, mobile navigation, drawer, common cards, and home surfaces consume semantic tokens. Apple uses floating translucent chrome only where hierarchy benefits; Sun World uses warmer solid layers and clearer brand accents. Do not fork markup by family.

- [ ] **Step 4: Add typography and interaction polish**

Use system font fallback and optical sizing, tighten large heading tracking, retain readable Chinese leading, add press feedback to interactive chrome, and ensure enter/exit paths are symmetric.

- [ ] **Step 5: Run layout and theme tests**

Run: `corepack pnpm -C apps/web exec vitest run src/layout/layout.test.tsx src/components/ThemeSwitch/ThemeSwitch.test.tsx src/shared/design/theme.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/style.css apps/web/src/layout apps/web/src/modules/home
git commit -m "feat(web): polish switchable visual identities"
```

### Task 5: Full verification, visual QA, and handoff

**Files:**
- Modify: `docs/current-state.md`
- Modify: `docs/agent-handoff.md`

**Interfaces:**
- Consumes: complete implementation.
- Produces: durable operating/design notes and evidence for completion.

- [ ] **Step 1: Run focused automated verification**

```bash
corepack pnpm -C apps/web exec vitest run src/shared/design/theme.test.tsx src/components/ThemeSwitch/ThemeSwitch.test.tsx src/layout/layout.test.tsx
corepack pnpm exec node scripts/check-design-themes.mjs
corepack pnpm format:check
```

Expected: all commands PASS.

- [ ] **Step 2: Run production verification**

Run: `corepack pnpm check:web`

Expected: frontend tests, TypeScript checks, production build, chunk checks, performance budgets, and the new theme contract all PASS.

- [ ] **Step 3: Perform visual QA**

Start the project-declared dev server and inspect desktop and mobile widths for Sun World light/dark and Apple light/dark. Confirm canvas, header/mobile nav, cards, menu/dialog, focus visibility, one-click switching, precise mode selection, persistence after reload, and reduced-motion behavior. Capture screenshots as local evidence if the browser tooling supports them.

- [ ] **Step 4: Update durable documentation**

Record the theme architecture, storage key, supported attributes, important files, commands, results, limitations, and next suggested design-system step in `docs/current-state.md` and `docs/agent-handoff.md` without secrets.

- [ ] **Step 5: Re-run repository hygiene checks**

Run: `git diff --check` and `git status --short --branch`.

Expected: no whitespace errors; only intentional task files are modified.

- [ ] **Step 6: Commit the verified implementation notes**

```bash
git add docs/current-state.md docs/agent-handoff.md
git commit -m "docs: record switchable theme system"
```
