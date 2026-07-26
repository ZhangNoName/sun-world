# React Source Inspector Handoff

- Goal: replace the React-19-incompatible `click-to-react-component` integration
  with reliable Alt + left-click source navigation in local development.
- Status: implementation and verification complete on
  `fix/react-source-inspector`; not merged, pushed, or deployed.
- Files touched: `apps/web/package.json`, `apps/web/src/main.tsx`,
  `apps/web/vite.config.ts`, `apps/web/inspector-babel-plugin.ts`,
  `apps/web/src/dev/`, `pnpm-lock.yaml`, and the matching design/plan docs.
- Implementation: `react-dev-inspector` is development-only, activation is
  controlled strictly by holding Alt, and its Vite middleware opens the source
  location in VS Code. A local Babel wrapper makes source metadata injection
  idempotent for source-aliased workspace packages.
- Verification: focused tests passed (3/3); a real Vite session showed exactly
  one inspector attribute set on both Web and shared UI JSX; `pnpm format:check`
  passed; `pnpm check:web` passed all 35 Web test files / 66 tests, typecheck,
  production build, SSG, package guards, performance budgets, and chunk checks.
- Blockers: none. The primary worktree contains unrelated user changes, so this
  isolated branch should be integrated without overwriting them.
- Next step: commit this branch, then merge or cherry-pick it into `main` once
  the primary worktree's unrelated changes are preserved.
