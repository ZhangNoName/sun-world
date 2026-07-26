# React Source Inspector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `Alt + left click` open the selected React component source in VS Code during Vite development.

**Architecture:** Replace the Fiber-private-field-based inspector with `react-dev-inspector`. Inject stable JSX source coordinates at compile time, expose the editor-launch middleware through Vite, and mount the inspector only in development.

**Tech Stack:** React 19, Vite 5, TypeScript, Vitest, pnpm, react-dev-inspector

## Global Constraints

- The shortcut is hold `Alt` plus left click.
- The inspector is development-only.
- Production behavior and business components must remain unchanged.
- Do not modify or stage unrelated dirty-worktree files.

---

### Task 1: Replace the component inspector

**Files:**
- Create: `apps/web/src/dev/react-source-inspector.test.ts`
- Modify: `apps/web/src/main.tsx`
- Modify: `apps/web/vite.config.ts`
- Modify: `apps/web/package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: Vite development mode and `react-dev-inspector`'s `Inspector` and `inspectorServer` exports.
- Produces: a development-only controlled `Inspector` with its toggle shortcut disabled and Vite editor-launch middleware.

- [ ] **Step 1: Write the failing contract test**

```ts
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const webRoot = resolve(__dirname, '../..')
const read = (path: string) => readFileSync(resolve(webRoot, path), 'utf8')

describe('React source inspector', () => {
  it('uses the compile-time inspector with Alt activation only in development', () => {
    const main = read('src/main.tsx')
    const vite = read('vite.config.ts')
    const pkg = JSON.parse(read('package.json'))

    expect(pkg.devDependencies).toHaveProperty('react-dev-inspector')
    expect(pkg.dependencies).not.toHaveProperty('click-to-react-component')
    expect(main).toContain('<ReactSourceInspector />')
    expect(main).toContain('import.meta.env.DEV')
    expect(vite).toContain('react-dev-inspector/plugins/vite')
    expect(vite).toContain('react-dev-inspector/plugins/babel')
  })
})
```

- [ ] **Step 2: Run the contract test and verify RED**

Run: `corepack pnpm --filter @sun-world/blog exec vitest run --config vitest.config.ts src/dev/react-source-inspector.test.ts`

Expected: FAIL because the project still depends on `click-to-react-component` and has no Alt inspector integration.

- [ ] **Step 3: Replace the dependency using the project package manager**

Run: `corepack pnpm --filter @sun-world/blog remove click-to-react-component`

Run: `corepack pnpm --filter @sun-world/blog add -D react-dev-inspector@2.0.1 @react-dev-inspector/vite-plugin@2.0.1 @react-dev-inspector/babel-plugin@2.0.1`

- [ ] **Step 4: Configure Vite source injection and editor middleware**

Configure `@vitejs/plugin-react` with `babel.plugins: ['@react-dev-inspector/babel-plugin']`, and add `inspectorServer()` from `@react-dev-inspector/vite-plugin` only when `mode !== 'production'`.

- [ ] **Step 5: Replace the runtime component**

Create `ReactSourceInspector` with a controlled `active` prop, `keys={null}`, and Alt keydown/keyup/window-blur listeners. Remove `ClickToComponent`, and render `<ReactSourceInspector />` behind `import.meta.env.DEV`.

- [ ] **Step 6: Verify GREEN and regression coverage**

Run: `corepack pnpm --filter @sun-world/blog exec vitest run --config vitest.config.ts src/dev/react-source-inspector.test.ts`

Expected: PASS.

Run: `corepack pnpm --filter @sun-world/blog typecheck`

Expected: PASS.

Run: `corepack pnpm check:web`

Expected: PASS, including production build.

- [ ] **Step 7: Manually verify the interaction**

Run: `corepack pnpm dev:web`, open `http://127.0.0.1:3000`, hold `Alt`, and left-click a component.

Expected: VS Code opens the corresponding local `.tsx` file at the injected line and column; a normal click without `Alt` retains application behavior.

- [ ] **Step 8: Commit only scoped files**

```bash
git add apps/web/src/dev/react-source-inspector.test.ts apps/web/src/main.tsx apps/web/vite.config.ts apps/web/package.json pnpm-lock.yaml docs/superpowers/specs/2026-07-26-react-source-inspector-design.md docs/superpowers/plans/2026-07-26-react-source-inspector.md
git commit -m "fix(web): restore click-to-source inspection"
```
