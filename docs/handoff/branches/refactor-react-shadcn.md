# React + shadcn Rebuild Handoff

Updated: 2026-07-17

## Goal and status

- Goal: replace the complete Vue frontend with React while preserving business
  behavior and encapsulating shared UI through a shadcn/Radix-based Sun layer.
- Status: implementation and local production browser acceptance are complete on
  `refactor/react-shadcn`. The branch is not pushed, merged, or deployed.
- Worktree: `.worktrees/react-shadcn` under the repository root.

## Architecture and behavior

- React 19 + React Router + Vite own the application entry, routing, SEO, theme,
  i18n, auth, telemetry, and error boundaries.
- `@sun-world/ui` provides documented React subpath exports around shadcn/Radix
  primitives. `@sun-world/icons/react` provides the React icon renderer.
- Migrated business areas: home/blog/SSG, read/write Markdown, login/register/me,
  AI SSE streaming and abort, blog/admin management, metrics/logs/charts, editor
  canvas, Artplayer/HLS video, tile ZIP/JSON export, tools, TCX, QQ callback, 404.
- Vue, Vue Router, Pinia, vue-i18n, Element Plus, md-editor-v3, and plugin-vue
  were removed from the production graph, along with all `.vue` files.
- Rollup now owns shared dependency placement. Route/action dynamic imports define
  lazy boundaries, and `scripts/check-web-chunks.mjs` rejects initial static
  imports or preloads of route-only chunks. This fixed a browser-only ES module
  initialization cycle found during acceptance.

## Key commits

- `3a8cc493` React migration test foundation
- `64ad9c19` shadcn-style React UI and icon layer
- `096a9267` React router/state/application infrastructure
- `2fcb24bb` home layout and blog feed
- `fb056f47` article read/write and SSG
- `b72f588d` authentication and account pages
- `d63c6b5f` AI streaming chat
- `9ddfe07e` admin metrics/logs/blog management
- `50aabeb8` editor canvas adapter
- `be4b79dc` video, tile export, tools, TCX, and remaining pages
- `538efe1a` React production cutover and Vue removal

## Verification evidence

- `corepack pnpm check`: passed all 15 root gates, including frontend, backend,
  shared packages, contracts, deployment protocols, and static Compose checks.
- `corepack pnpm check:web`: passed, including 23 React test files / 29 tests,
  typecheck, contracts, SSG, API route guards, ICP checks, build manifest/summary,
  performance budgets, and chunk boundaries.
- `corepack pnpm build`: passed for editor, icons, UI, and web.
- `corepack pnpm --filter @sun-world/icons build:preview`: passed for the React
  icon preview.
- Production browser desktop routes passed with no console errors or horizontal
  overflow: `/`, `/login`, `/register`, `/aigc`, `/canvas`, `/video`,
  `/game_tiles`, `/tools`, `/keep`, `/manage`, `/blog/1`, `/missing-route`.
- Production browser 390x844 routes passed: `/`, `/manage`, `/game_tiles`, `/aigc`.
- The expected local API-unavailable state appears as an inline `Network Error`
  on management data instead of an uncaught browser error.
- Docker CLI was unavailable locally, so the root gate used its documented
  static Compose validation path; no deploy command ran.

## Files and durable references

- Design: `docs/superpowers/specs/2026-07-17-react-shadcn-rebuild-design.md`
- Implementation plan: `docs/superpowers/plans/2026-07-17-react-shadcn-rebuild.md`
- Stable runtime notes: `docs/current-state.md`
- Main code roots: `apps/web/src`, `packages/ui/src`, `packages/icons/src`
- Cutover/build guards: `scripts/check-react-migration-toolchain.mjs`,
  `scripts/check-web.mjs`, `scripts/check-web-chunks.mjs`,
  `scripts/check-web-budgets.mjs`

## Known warning and next step

- Editor declaration generation reports that API Extractor's bundled TypeScript
  5.4 is older than workspace TypeScript 5.9; output still succeeds.
- Next: review and merge the branch into `main`, push it, then let the existing
  frontend deployment workflow build and deploy. After deployment, verify
  `https://sunworld.site`, `https://www.sunworld.site`, key direct routes, and
  the ICP filing link. No deployment was performed from this branch.
