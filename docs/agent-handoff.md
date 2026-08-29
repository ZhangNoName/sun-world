## Current Handoff

### Active checkpoint: 2026-08-30 frontend motion system

- Goal: add restrained, centrally managed frontend motion while improving warm
  navigation feedback and cold-load structure without increasing runtime
  dependencies or the CSS budget.
- Status: the isolated frontend-only release candidate contains the motion tokens, reduced-
  motion JavaScript contract, delayed route indicator, immediate cold-route
  skeleton fallback, neutral SPA shell, pre-paint theme bootstrap, shared
  keyframes, component migrations, high-frequency `requestAnimationFrame`
  updates, and the Web-package `check:motion` gate. It is ready for the release
  commit; push and deployment have not yet been performed.
- Important files: `apps/web/src/styles/design-tokens.css`,
  `apps/web/src/shared/design/motion.ts`,
  `apps/web/src/app/router/RouteLoadingIndicator.tsx`,
  `apps/web/src/app/router/create-router.ts`,
  `apps/web/src/layout/layout.tsx`, `apps/web/index.html`,
  `deploy/frontend/nginx.conf`, `apps/web/src/style.css`,
  `packages/ui/src/components/loading-skeleton/`,
  `scripts/check-web-motion.mjs`, and
  `docs/architecture/frontend-motion-system.md`.
- Contract: app and Sun World-owned package CSS timing and easing come only
  from the design tokens; frozen upstream `packages/base-ui` remains unchanged
  and outside the motion gate. The JavaScript route contract uses a `150 ms`
  pending delay and `180 ms` minimum visible time. Lazy-route skeleton fallback
  is immediate, including the root `HydrateFallback` used before the layout can
  mount on a first direct visit. Motion is limited to `transform` and `opacity`,
  hover movement requires a fine pointer, high-frequency updates are
  frame-coalesced, and reduced-motion is honored. No animation dependency was
  added, and the total CSS gzip ceiling remains `51,200` bytes (`50 KiB`).
- Verification: `corepack pnpm -C apps/web check:motion`, 11 focused regression tests,
  and `corepack pnpm -C apps/web typecheck` passed. The final
  `corepack pnpm check:web` passed 127 Web tests, 15 AI UI tests, 6 contract
  tests, production build, SSG/SPA contracts, UI/chunk gates, and all
  performance budgets; 38 shared UI tests also passed. CSS totals
  `45,955 / 51,200` gzip bytes. Desktop
  `1440x900` and mobile `390x844` browser QA covered route/loading states,
  search entrance, navigation drawer, the AI route, and light/dark theme
  persistence with no console warnings or errors. `git diff --check` passed.

### Previous checkpoint: 2026-08-09 security and integrity baseline

- Branch handoff: `docs/handoff/branches/codex-security-integrity-baseline.md`.
- Report: `docs/reviews/2026-08-09-security-integrity-implementation.md`.
- Security containment, initial transaction/session/package boundaries, and UI
  consumer-boundary consolidation are implemented, merged to `main`, and
  deployed from `188a16dd` by GitHub Actions run `31346480765`. Web, WWW, AI,
  API health, and the rendered ICP filing link passed public smoke checks.

### Previous checkpoint: 2026-08-02 Base UI package separation

- Goal: separate frozen generic shadcn/Base UI primitives from Sun World-owned
  protocols and product compositions without changing component styles.
- Status: implemented locally on dirty `main`; `@sun-world/base-ui` now owns
  the current official `base-nova` generic primitive snapshot, while
  `@sun-world/ui` owns protocols/patterns and depends on base-ui one way.
  Application imports, shadcn configs, and boundary scripts were migrated to
  make ownership visible from the import path. The official base source is not
  customized; compatibility lives in `Sw*` adapters and deprecated `Sun*`
  adapters.
- Important files: `packages/base-ui/`, `packages/ui/package.json`,
  `packages/ui/source-aliases.ts`, `apps/web/components.json`,
  `apps/web/vite.config.ts`, and the UI boundary/structure check scripts.
- Follow-up: `packages/ui/src/styles/globals.css` now scans
  `packages/base-ui/src`, so Base UI utility classes are emitted in the
  application bundle. The Base UI root exports use explicit directory entry
  points to avoid a stale flat `components/button.tsx` shadowing the canonical
  `components/button/index.ts` entry. The UI test timeout is 20 seconds because
  the full Base UI source graph makes the Select interaction tests slower on
  this workspace.
- Verification: base/UI builds, Base/UI/Web typechecks, AI UI tests/build, Web
  build, full UI tests (38), boundary checks, native shadcn check, structure
  check, browser checks for home/login/AI at desktop and mobile sizes, and
  targeted formatting passed. No commit, push, or deploy.

This file is the short active handoff entrypoint. Keep it concise so branch
merges stay easy. Put branch-specific work in docs/handoff/branches/ and move
older completed checkpoints to docs/handoff/archive/.

## Current Local Work

- 2026-08-02: tightened the development React source inspector behavior. The
  existing `react-dev-inspector` replacement for the removed
  `click-to-react-component` now remains active across inspector click
  callbacks only while `Alt` is physically held; releasing `Alt` or losing
  window focus immediately disables it. Added a regression test for the
  inspector's self-deactivation callback. Focused test, serial full Web tests
  (47 files, 111 tests), typecheck, and `git diff --check` passed. No commit,
  push, or deploy was performed.

- 2026-08-02: global UI/theme and auth refresh work is implemented locally on
  dirty `main`. The app now uses shadcn semantic color variables for
  light/dark/system modes, with legacy aliases derived from them; the old
  design-family toggle was removed and the shared UI fallback no longer
  overrides an app-mounted dark mode. The login surface follows the
  login-04-style two-column treatment, Manage follows the sidebar-07-style
  full-width shell with a global theme control, and only explicit blog routes
  retain the centered side whitespace. HttpOnly-cookie session restore is
  single-flight, device IDs persist, token refresh retries one request after a
  401, and anonymous startup restore no longer shows a refresh-error toast.
  Markdown editing follows the active theme. Important files include
  `apps/web/src/shared/design/theme.ts`, `apps/web/src/styles/design-tokens.css`,
  `apps/web/src/store/auth.ts`, `apps/web/src/service/http.ts`,
  `apps/web/src/pages/login/AuthPageShell.tsx`, `apps/web/src/pages/login/auth.css`,
  `apps/web/src/modules/admin/components/ManageLayout.tsx`, and
  `apps/api/src/routers/auth/auth.py`. Web tests, UI tests, API auth tests,
  typechecks, package builds, SSG, UI structure/boundary/blog checks, and
  browser checks passed; the final full Web regression passed with 47 files and
  110 tests.
  No deployment, push, or task-code commit was performed; the earlier docs
  commit is `ed1367c5`.

- 2026-08-01: authentication/admin reliability work is implemented locally and
  remains uncommitted. Existing users now expose nullable `username`; login
  uses exact username/email/phone matching with deterministic legacy duplicate
  handling, malformed/expired python-jose tokens return clean 401 responses,
  registration keeps the inserted user ID, and login/refresh/logout normalize
  and clear access, refresh, and device cookies, including legacy `/api`
  cookie paths. `/admin/*`, blog creation,
  deletion, and the article editor require the admin role; direct management
  routes have a frontend guard. MySQL now uses a bounded 2-connection pool
  with ping/borrow/return/replacement semantics and propagates database errors,
  so a missing AI catalog table is no longer returned as an empty success.
  Management tabs expose loading/error/empty/data states, request IDs and
  retry actions, and the provider form is responsive at 1280px. Added
  regression coverage for auth identifiers/JWTs, cookie lifecycle, admin and
  blog authorization, missing-table errors, pool concurrency/replacement, and
  frontend session/guard/error behavior. API tests (37), `pnpm check:api`,
  full Web checks (81 React tests, contracts, package builds, typecheck,
  production build, SSG, UI boundary and budgets), Prettier, and
  `git diff --check` pass. The UI boundary check now documents the `sw-input`
  and `sw-select` protocol subpaths. Main task must run the safe schema
  plan/apply and restart the API before browser QA; no commit, push, or deploy
  was performed.

- 2026-08-01: added an authenticated AIGC provider-catalog management flow.
  The API persists provider metadata (ID, display name, default Base URL,
  default model, enabled state, and sort order) without storing API keys;
  `/ai/v1/providers` reads enabled catalog entries when configured and keeps
  the built-in registry as a fallback. The `/manage` AIGC tab now supports
  listing, creating, editing, enabling/disabling, sorting, and deleting
  providers, with a link back to the AI workspace. Contract routes and
  generated OpenAPI types were refreshed. API tests, web typecheck,
  formatting, and `git diff --check` passed. No commit, push, or deploy was
  performed.

- 2026-08-01: fixed the service-provider Select in the AI settings dialog.
  The options were portalled outside the modal, so clicks opened the list but
  did not update the selected provider in a real browser. `SelectContent` now
  uses the shared dialog-safe `forceMount` mode and receives provider item
  metadata. The regression test asserts the list stays in the dialog and that
  selecting OpenAI applies its defaults. Browser QA confirmed the provider,
  name, Base URL, and model all update; AI UI tests (14), build, Prettier, and
  `git diff --check` passed. No commit, push, or deploy was performed.

- 2026-08-01: compacted AI composer model-picker options into single rows.
  The model label is left-aligned and truncates when needed; the provider now
  appears in a right-aligned non-interactive tag, replacing the old second
  line. A UI regression test verifies the tag, and focused/full AI UI tests,
  AI Composer/UI builds, Prettier, and `git diff --check` passed. No commit,
  push, or deploy was performed.

- 2026-08-01: local AI credential encryption now supports the ignored,
  single-purpose `apps/api/src/conf/local.ai-credentials.yml` configuration
  file. Its `ai.credential_encryption_key` takes priority over the deployment
  environment-variable fallback, and the generated local file is ignored by
  Git. A focused application-config test covers this precedence. The local API
  must be restarted to load the new file. Application config test, API checks,
  and `git diff --check` passed; no commit, push, or deploy was performed.

- 2026-08-01: fixed the authenticated AI provider-profile save 500. The auth
  manager returns a dictionary user record, while the AI router assumed an
  object with `.id`; `get_optional_ai_user_id` now accepts either representation
  and passes the numeric ID to the provider-profile service. A router-level
  regression test exercises an authenticated POST with a dict-backed user.
  `apps/api` router tests (3), Python compilation, `pnpm check:api`, and
  `git diff --check` passed. The local API process was started without reload,
  so it must be restarted before browser requests use this change. No commit,
  push, or deploy was performed.

- 2026-08-01: AI provider settings now use the shared shadcn-style `Field`,
  composed `Select`, `Input`, and `Button` primitives. Saving awaits the
  persistence callback, displays a disabled `保存中…` state, clears the
  browser-only key and closes on success, and renders persistence or auth
  failures inside the dialog. The Web adapter rethrows provider-save failures
  so the dialog can expose them instead of hiding them behind the modal.
  Regression tests cover successful close and visible failure. Important files:
  `packages/ai-ui/src/AiProviderSettings.tsx`,
  `packages/ai-ui/src/AiWorkspace.test.tsx`,
  `packages/ai-ui/src/ai-ui.css`, and
  `apps/web/src/modules/ai/composables/useAiChat.ts`. Focused and package AI UI
  tests (12), AI UI build, Web typecheck, Prettier, and `git diff --check`
  passed. A complete `corepack pnpm check` attempt timed out after 120 seconds
  without a task-specific failure. No commit, push, or deploy was performed.

- 2026-08-01: AI composer status feedback and primary-action states are
  implemented on local `main`. The bottom validation copy is now a compact,
  tone-aware notice above the toolbar, stale submission errors clear when the
  draft changes, and the send control has explicit disabled, ready, and
  generating states. Generating renders a white stop square and invokes the
  existing public cancel path; submit payloads and imperative APIs remain
  unchanged. Component tests cover all three states, cancellation, host loading,
  notice tone, and edit-to-clear behavior. Live `/aigc` QA at 1280x720 verified
  40px controls, compact 12px feedback, no overlap, and no horizontal overflow.
  Important files: `packages/ai-composer/src/AiComposer.tsx`,
  `packages/ai-composer/src/feedback/ComposerNotice.tsx`, package tests/CSS,
  `design-qa.md`, and the related specs under `docs/superpowers/`. No blockers
  remain; no push or deploy was performed.

- 2026-08-01: the AI composer attachment strip is implemented on local `main`.
  Attachments now render above the textarea in one horizontally scrollable row;
  images use revocable local object-URL thumbnails and PDF, spreadsheet,
  archive, audio, video, code, and document files use shared Sun World icons.
  File sizes were removed, duplicate uploads keep one card and show a 2.5-second
  inline reminder, and the `+` trigger has no focus surface. Public submit and
  imperative APIs are unchanged. TDD covers duplicate classification, file
  presentation, preview URL cleanup, and notice timing. Live `/aigc` QA at
  1280x720 verified mixed previews, hidden-scrollbar overflow and actual
  horizontal scrolling. `corepack pnpm check` passes 19/19; no push or deploy
  was performed. Important files: `packages/ai-composer/src/attachments/`,
  `packages/ai-composer/src/AiComposer.tsx`, its package CSS/tests,
  `packages/icons/src/data/ui.ts`, and `design-qa.md`. No blockers remain; the
  next optional step is review, push, or deploy when requested.

- 2026-08-01: model selector popover polish adds outside-pointer dismissal,
  Escape dismissal with trigger focus restoration, and a compact 220px /
  12px / 10px visual scale. Both behavior regressions passed red-green TDD;
  live browser verification passed at 1280x720, and the final
  `corepack pnpm check` repository gate passes 19/19.

- 2026-08-01: the composer was polished against the supplied ChatGPT Work
  reference. Inline Markdown preview and renderer dependencies were removed;
  the focused textarea no longer receives a global focus shadow. Desktop light
  theme QA passed at 1280x720, including the `/` command palette. Evidence is in
  `design-qa.md` and `docs/design-qa/ai-composer/`. The final
  `corepack pnpm check` repository gate passes 19/19.

- 2026-07-31: reusable ChatGPT Work-style `@sun-world/ai-composer` was implemented
  directly on local `main` and integrated into `/aigc`. It supports controlled
  input, source-only Markdown editing, submit-time attachment handoff,
  model profiles, searchable slash commands, modular browser speech permission
  handling, loading/cancel behavior, and imperative host APIs. The existing
  Web adapter maps selected saved profiles to `provider_profile_id` and rejects
  currently unsupported files/commands before opening a stream. Commits through
  `1b6ce266` contain the design, plan, package, styling, and integration.
  The complete `corepack pnpm check` gate passes 19/19 after adding composer
  test/build stages; this includes composer tests (21), AI UI tests (10), Web
  tests (78), package builds, Web typecheck/build, API checks, and Compose
  validation. Browser QA passed at 1280x720 and on
  a fresh 390x844 load with no horizontal overflow; it covered slash command
  display/selection, Markdown source editing, model switching, safe rejection with
  draft preservation, and mobile drawer collapse. Final full repository
  verification remains the next step. The new component adds 1.69 KiB gzip CSS
  and brings the measured Web total to 38.7 KiB, so the total CSS ceiling was
  deliberately updated from 38 to 40 KiB without changing route or JavaScript
  budgets. Implementation, documentation, and verification are complete on
  local `main`. No push or deployment was performed.

- 2026-07-30: fixed the `/aigc` desktop layout regression on local `main`.
  The AI route already supplied `ai-chat-page-wrapper`, but its stylesheet
  targeted the wrong direct child, so the page remained inside the general
  1280px content width and 64px top margin. The corrected selector targets
  `.content.ai-chat-page-wrapper` and makes only that full-screen workspace
  fill the desktop layout. `scripts/check-ai-interface.mjs` now guards this
  opt-out. The focused guard and layout test passed; Web typecheck, all 76 Web
  tests, production build, formatting, and whitespace checks passed. Browser
  QA at 2048x1080 measured the AI wrapper and shell at 2048x1080 from (0,0)
  with no horizontal overflow. Not committed, pushed, or deployed.

- 2026-07-26: modular AI workspace refactor on local `main` introduces the
  versioned `/ai/v1` protocol, a standalone backend AI module, encrypted
  per-user multi-provider profiles, MySQL conversation/message/feedback
  persistence, and reusable `@sun-world/ai-ui`. The package renders text,
  tables, lazy ECharts, links, records, and custom blocks and owns GPT-style
  copy/edit/regenerate/feedback/stop/retry interactions plus responsive
  history and settings. The Web adapter handles ordered SSE, temporary-to-
  persistent conversation IDs, saved history, and inline errors. Verification
  passed the complete `corepack pnpm check` gate (17/17), including 19 backend
  AI tests, 6 contract tests, 8 AI UI tests, 76 Web tests, Web typecheck,
  package builds, performance budgets, and Compose static validation. The
  frontend Docker dependency cache layer now includes the new AI UI manifest.
  Desktop/mobile browser QA also passed.
  Important files and extension rules are documented in
  `docs/architecture/ai-platform.md`; design and execution plans are under
  `docs/superpowers/`. The complete worktree was committed as `ee279f1c`,
  pushed to `origin/main`, and deployed by GitHub Actions run `30211244371`.
  The run passed all quality jobs, built both Lighthouse images, synchronized
  the GitHub Actions `AI_CREDENTIAL_ENCRYPTION_KEY` and `DEEPSEEK_API_KEY`
  secrets without logging their values, applied the production schema, and
  switched both services successfully. Public verification returned HTTP 200
  for `sunworld.site`, `www.sunworld.site`, `/healthz`, and
  `/ai/v1/providers`; health returned `{"status":"ok"}`, and the provider
  endpoint exposed DeepSeek, OpenAI, OpenRouter, and OpenAI-compatible.

- 2026-07-26: `fix/react-source-inspector` replaces the React-19-incompatible
  click-to-component integration with development-only Alt + left-click source
  navigation. Details and verification are in
  `docs/handoff/branches/fix-react-source-inspector.md`.

- 2026-07-26: mobile experience unification on local `main` gives ordinary
  routes one `.app-container` scroll root, sticky safe-area-aware mobile header
  and bottom navigation, a layout-owned reduced-motion-aware `返回顶部` action,
  and a true full-height left drawer. The drawer positioning bug was traced to
  Base UI's independent `translate: -50% -50%`; the mobile popup now overrides
  both transform and translate. Duplicate homepage shell CSS and the
  blog-only back-to-top implementation were removed. Phone layouts were
  tightened for blog reading/authoring, tools, video, game tiles, Keep, admin,
  and canvas; the previously unstyled article authoring page now has a
  responsive editor layout. Browser QA covered 15 source-defined routes at
  390x844 and 320x700 with no document-level horizontal overflow; scoped table
  and tile-preview overflow remains intentional. The drawer measured
  0,0–280,844 after the fix; sticky chrome stayed at viewport edges after
  760px scrolling; and the global button completed a smooth scroll to zero.
  Focused Web tests passed (21 and 19 assertions), Web typecheck passed, UI
  tests passed (48), and `corepack pnpm check:web` passed (70 Web tests,
  production build, 30-page SSG, budgets, and boundary checks). These changes
  were included in `ee279f1c`, pushed to `main`, and deployed successfully in
  run `30211244371`. Existing editor-foundation worktree changes were
  preserved.

- 2026-07-26: `feat/figma-editor-foundation` implements the framework-neutral
  Figma-like editor foundation described in
  `docs/handoff/branches/feat-figma-editor-foundation.md`. Editor tests (41),
  build, focused Web editor tests (5), Web typecheck, formatting, whitespace,
  and comprehensive `/canvas` browser QA passed. Browser QA also produced and
  fixed regressions for property-field commit and transform-to-panel syncing.
  The complete `check:web` gate is still red only for four unrelated
  `BlogHomeFeed.test.tsx` expectations for a missing `阅读更多: 图搜索入门` link;
  59 other Web tests passed. Layer-tree reordering is also not implemented, so
  the corresponding Task 7 browser case remains open. Not pushed or deployed.

- 2026-07-22: homepage blog toolbar is now a compact three-action surface:
  the fixed search icon expands a left-side input with a 240ms eased transition
  and auto-focus, sort cycles newest → most viewed → oldest and applies
  immediately, and layout toggles list / waterfall on desktop. A reusable
  `arrow-up-down` UI icon and shared input ref forwarding were added. Focused
  interaction/style tests, icon boundary/tests/build, UI tests, and `check:web`
  passed. No commit, deployment, or changes to user-owned page files were made.

- 2026-07-22: button cursor feedback adds `cursor-pointer` through the shared
  `Button` primitive and a focused variant-contract assertion. The focused test
  and complete UI suite passed (47 tests); changed task files pass Prettier and
  `git diff --check`. The project-wide changed-file formatting script remains
  red only for the user's existing `apps/web/src/components/Avator/avator.tsx`
  and `apps/web/src/modules/home/pages/home-react.css` edits. No deployment or
  commit was performed.

- 2026-07-20: `feat/base-ui-home-polish` makes formerly Radix-backed primitives
  use Base UI 1.6 or appropriate semantic native elements while preserving
  package subpaths, canonical compound exports, project-used callbacks, and
  deprecated `Sun*` adapters. Both component manifests use the `@base-ui`
  registry, the lockfile contains no Radix packages, and the native-shadcn
  guard now requires Base UI and rejects Radix source/manifest entries across
  all supported JavaScript module extensions. The migration's shared Base UI
  internals produce a measured 177.8 KiB gzip entry, recorded under a focused
  180 KiB ceiling; total JS/CSS and
  every route budget remain under their existing limits. Homepage search/sort
  fields hide only their visual labels while
  retaining accessible Chinese names; metric grids, article actions, toolbar
  alignment, responsive ownership, and both design families were polished and
  browser-checked at 1440x900 and 390x844 with no horizontal overflow. The live
  weather payload was unavailable during QA, so its structure and theme were
  checked without content validation. Base UI's public Menu API has no popup
  `initialFocus` parity, and opaque custom Select item wrappers need explicit
  `Root.items` metadata for initial labels. `SelectContent forceMount` is an
  accepted inline/non-portalled compatibility path with no application
  consumer. Mounted compound compatibility content retains per-content
  document capture listeners because open-only attachment is unsafe without
  uniform Base UI open state and cancellation-parity coverage. Fresh
  verification passed the migration guard, 44 UI tests, 56 Web tests plus the
  full Web pipeline, the root build, formatting, and whitespace checks; the
  final Radix scan found no source/manifest matches. The known API Extractor
  TypeScript-version warning remains non-blocking. Not pushed or deployed.

- 2026-07-20: `feat/web-ui-library-enforcement` fixes the incomplete shadcn
  style pipeline by loading the public UI stylesheet and scanning UI package
  source classes. All Web interactive controls now come from `@sun-world/ui`;
  reusable Web-local controls moved into package patterns, and a new guard
  prevents raw interactive JSX from returning. `check:web` passed through all
  tests, typecheck, build, SSG and package guards; the final CSS budget is 36.2
  / 38 KiB. Browser QA confirmed computed shadcn button styling and Sun World
  to Apple one-click switching. Not pushed or deployed.

- 2026-07-20: `feat/native-shadcn-ui` replaces the earlier shadcn-inspired
  implementation with the real shadcn `new-york` source model, Tailwind CSS v4,
  canonical Radix composition, canonical app imports, and standard semantic
  theme variables for both Sun World and Apple. `Sun*` exports are deprecated
  compatibility adapters. `corepack pnpm -C packages/ui test` passed 12/12,
  the UI package build passed, and `corepack pnpm check:web` passed 47/47 app
  tests, TypeScript, production build, 30-article SSG, package guards, and all
  performance budgets. Browser QA confirmed the homepage renders in Apple dark
  and switches to Sun World dark with one click. Not pushed or deployed.

- 2026-07-19: blog list and article reading surfaces were visually rebuilt on
  local `main` after the switchable-theme rollout. The feed now uses the shared
  Radix select, a composed search toolbar, segmented view controls, and refined
  article cards. Article detail has a centered reading surface, sticky styled
  catalog, responsive layout, and complete Markdown typography for code,
  quotes, tables, links, and media. Shared application chrome CSS now loads from
  the layout itself, so direct article routes no longer depend on homepage CSS.
  `corepack pnpm check:web` passed (47 React tests, TypeScript, production build,
  SSG, budgets, and chunk checks). Browser QA passed for desktop Sun World,
  Apple light, and 390x844 mobile layouts. Not pushed or deployed.
- 2026-07-19: local `main` migrates all `@sun-world/ui` primitives
  and composed patterns to project-owned shadcn-style directories while keeping
  public subpaths and `Sun*` APIs compatible. Component source, CSS, and indexes
  are colocated; canonical aliases and `buttonVariants` support local
  composition. `corepack pnpm -C packages/ui test` passed with 12 tests,
  package ESM/CJS/declaration builds passed, and `corepack pnpm check:web`
  passed with 47 application tests, production build, SSG, budgets, and chunk
  checks. Not pushed or deployed.

- 2026-07-19: switchable Sun World and Apple design families are implemented
  on `feat/switchable-design-themes`. The theme controller supports
  `light`/`dark`/`system`, migrates legacy preferences, persists and syncs
  selections, and exposes a one-click family switch plus lazy precise options.
  Global chrome, shared UI controls, and homepage surfaces consume the new
  semantic materials, typography, motion, and accessibility fallbacks.
  `corepack pnpm check:web` passed, including 47 React tests, TypeScript, SSG
  production build, the new theme contract, performance budgets, and chunk
  checks. Browser QA passed for Apple light/dark, desktop one-click and precise
  selection, mobile layout/drawer access, and the ICP filing. The entry bundle
  is 160.2 KiB gzip against the intentionally updated 162 KiB budget; detailed
  options are a 0.48 KiB lazy chunk. Not deployed.

- 2026-07-18: the React guidelines remediation and review documentation were
  pushed and deployed from `main` at `036a680f`. GitHub Actions run
  `29594687950` completed successfully, including frontend checks, the
  Lighthouse frontend image build, and production deployment. Public `/`,
  `/home`, and `/aigc` routes returned HTTP 200; the rendered homepage showed
  the required ICP filing link; and the API health endpoint returned
  `{"status":"ok"}`. All six P2 findings are resolved; the three P3 review
  items remain follow-up debt.
- 2026-07-17: the full React 19 + shadcn/Radix frontend rebuild has been merged
  into `main`. Historical implementation evidence remains in
  `docs/handoff/branches/refactor-react-shadcn.md`.

## Active Branches

- feat/figma-editor-foundation: see
  docs/handoff/branches/feat-figma-editor-foundation.md.

- refactor/react-shadcn: see
  docs/handoff/branches/refactor-react-shadcn.md.
- feat/aigc-ui-polish: see
  docs/handoff/branches/feat-aigc-ui-polish.md.
- codex/ai-cli-skills: see
  docs/handoff/branches/codex-ai-cli-skills.md.
- codex/server-side-web-build: see
  docs/handoff/branches/codex-server-side-web-build.md.
- codex/md-editor-v3-migration: see
  docs/handoff/branches/codex-md-editor-v3-migration.md.
- feat/admin-log-module: see
  docs/handoff/branches/feat-admin-log-module.md.

## Latest Stable Checkpoint

- Current task addendum (2026-07-01, md-editor-v3 / AI entry / back-to-top deploy):
  - Goal: deploy the markdown editor migration, public AI entry, and blog feed
    back-to-top control from `main`.
  - Status: committed, pushed, deployed, and verified.
  - Commits:
    - `8a9cb602` `feat(web): migrate markdown editing to md-editor-v3`
    - `1ac572fc` `feat(web): expose ai entry and add feed back to top`
  - Deployment:
    - Pushed `main` to `origin/main` at `1ac572fc`.
    - GitHub Actions run `28527558861` completed successfully.
    - `Build frontend image on Lighthouse`, `Build API image on Lighthouse`,
      and `Deploy changed services on Lighthouse` all succeeded.
  - Verification:
    - Local pre-push `corepack pnpm check:web` passed.
    - Local pre-push `corepack pnpm format:check` passed.
    - Local pre-push `git diff --check` passed with only LF/CRLF warnings.
    - Public `curl -fsSI https://sunworld.site` returned HTTP 200.
    - Public `curl -fsSI https://www.sunworld.site` returned HTTP 200.
    - Public `curl -fsSI https://sunworld.site/aigc` returned HTTP 200.
    - Public `curl -fsS https://api.sunworld.site/healthz` returned
      `{"status":"ok"}`.

- Completed task addendum (2026-07-01, blog feed back-to-top):
  - Goal: add a one-click back-to-top control while scrolling the blog list.
  - Status: deployed on `main` at `1ac572fc`.
  - Important files touched:
    - `apps/web/src/modules/blog/ui/BlogHomeFeed.vue`
    - `scripts/check-blog-infinite-scroll.mjs`
    - `docs/current-state.md`
    - `docs/agent-handoff.md`
  - Behavior:
    - Blog home feed listens to `.app-container` scroll position.
    - A fixed circular back-to-top button appears after 360px of vertical
      scrolling and smooth-scrolls the app container to top.
    - The button is offset above mobile bottom navigation.
    - `scripts/check-blog-infinite-scroll.mjs` guards the scroll root,
      threshold, accessible label, and smooth scroll behavior.
  - Verification:
    - `corepack pnpm exec node scripts/check-blog-infinite-scroll.mjs` passed.
    - `corepack pnpm -C apps/web exec vue-tsc --noEmit` passed.
    - `corepack pnpm format:check` passed.
    - `git diff --check` passed with only LF/CRLF warnings.
    - `corepack pnpm check:web` passed.

- Completed task addendum (2026-07-01, AI public entry):
  - Goal: expose the AI chat interface entry while keeping `/aigc` as the
    existing full-screen AI workspace.
  - Status: deployed on `main` at `1ac572fc`.
  - Important files touched:
    - `apps/web/src/layout/header/index.vue`
    - `apps/web/src/layout/mobLayout.vue`
    - `apps/web/src/modules/ai/index.ts`
    - `scripts/check-ai-public-entry-visible.mjs`
    - `scripts/check-web.mjs`
    - `docs/current-state.md`
    - `docs/agent-handoff.md`
  - Behavior:
    - Desktop header shows a `message-circle` icon that navigates to `/aigc`.
    - Mobile bottom navigation and drawer expose `/aigc`.
    - AI module nav registration exposes
      `{ label: 'AI', path: '/aigc', icon: 'message-circle' }`.
    - The old hidden-entry guard was replaced with
      `scripts/check-ai-public-entry-visible.mjs`.

- Completed task checkpoint (2026-07-01, md-editor-v3 migration):
  - Goal: replace Vditor runtime editor/preview usage in blog authoring and
    public article detail with md-editor-v3.
  - Status: deployed on `main` at `1ac572fc`.
  - Important files touched:
    - `apps/web/src/modules/blog/pages/ArticleEditorPage.vue`
    - `apps/web/src/modules/blog/composables/useBlogAuthoring.ts`
    - `apps/web/src/modules/blog/composables/useBlogReader.ts`
    - `apps/web/src/modules/blog/pages/BlogDetailPage.vue`
    - `apps/web/vite.config.ts`
    - `scripts/check-web.mjs`
    - `scripts/check-web-chunks.mjs`
    - `scripts/check-md-editor-v3-migration.mjs`
    - `scripts/check-blog-detail-render.mjs`
    - `apps/web/performance-budgets.json`
    - `apps/web/package.json`
    - `docs/current-state.md`
    - `docs/agent-handoff.md`
  - Behavior:
    - `ArticleEditorPage` uses shared component `<SunMarkdownEditor v-model="blogContent" />`.
    - The authoring page imports the Element Plus select/option component CSS it
      uses directly and sizes md-editor-v3 through the shared editor component,
      fixing the oversized select-caret / bottom-pinned editor visual regression.
    - `BlogDetailPage` uses shared component `<SunMarkdownPreview :content="blogInfo.content" />`.
    - `SunMarkdownPreview` emits catalog/rendered events; `useBlogReader`
      consumes those events for catalog state and active-heading scroll setup.
    - md-editor-v3 read/write chunks are now anchored to shared markdown components and
      validated as `md-editor-preview`/`md-editor-editor`.
    - The blog module no longer idle-preloads `BlogDetailPage`, so the public
      shell does not warm `md-editor-preview` before an article route needs it.
  - Verification:
    - `corepack pnpm exec node scripts/check-md-editor-v3-migration.mjs` passed.
    - `corepack pnpm -C apps/web exec vue-tsc --noEmit` passed.
    - `corepack pnpm format:check` passed.
    - `git diff --check` passed with only LF/CRLF warnings.
    - `corepack pnpm check:web` passed, including frontend build, chunk checks,
      migration checks, and performance budgets.
    - Browser visual check on local `/new_article` confirmed normal select
      caret sizing and editor placement.

- Latest task addendum (2026-06-20, P1.80 lazy AI manager startup):
  - Goal: keep the persistent backend container alive even when AI provider
    keys are missing or incomplete.
  - Evidence:
    - GitHub Actions run `27865319566` built the API image successfully and
      reached the candidate health check.
    - New candidate diagnostics showed the container exited with
      `openai.OpenAIError: The api_key client option must be set...`.
    - The stack trace showed startup imported `AiManager`, then `TestAgent`,
      then `src.llm.tools`, then `src.llm.model.gemma`, which initialized an
      OpenAI-compatible model at import time.
  - Status: committed, pushed, deployed, and verified.
  - Important files touched:
    - `apps/api/src/controller/ai_manager.py`
    - `scripts/check-ai-manager-lazy.py`
    - `scripts/run-api-check.mjs`
    - `docs/current-state.md`
    - `docs/agent-handoff.md`
  - Behavior:
    - `AiManager` no longer imports `src.llm.agent` or `src.llm.model.*` at
      module import time.
    - Startup creates an `AiManager` shell with the existing checkpointer, but
      instantiates the chat agent or image model only when an AI endpoint is
      called.
    - `pnpm check:api` now runs `scripts/check-ai-manager-lazy.py` so the
      startup path cannot regress to eager provider-key initialization.
  - Verification:
    - `python scripts/check-ai-manager-lazy.py` passed.
    - `pnpm check:api` passed with the new lazy-import guard.
    - `python -m py_compile apps/api/src/controller/ai_manager.py scripts/check-ai-manager-lazy.py`
      passed.
    - Local deploy protocol checks passed before commit:
      `pnpm check:api-dockerfile`, `pnpm check:github-actions:deploy`,
      `pnpm check:api:deploy-schema`, `pnpm format:check`, and
      `git diff --check`.
    - GitHub Actions run `27865528022` on commit `f1d30925` succeeded.
      `Build API image on Lighthouse` completed in about 22 seconds and
      `Deploy changed services on Lighthouse` completed in about 19 seconds.
    - Public API GET health check returned `{"status":"ok"}`.
    - Public frontend checks for `https://sunworld.site` and
      `https://www.sunworld.site` returned HTTP 200.
    - Server verification showed `sun-world-api` running from image
      `sun-world-api:f1d3092504b37c59930e0ebde6cea11fa48e9b6d`, `my-frontend`
      still running, and `blog-api.service` `inactive` / `disabled`.
  - Next step:
    - Keep monitoring the persistent container. AI endpoints still need a real
      OpenRouter/OpenAI-compatible provider key before they can answer AI
      requests; missing keys no longer block API startup or health checks.

- Latest local feature checkpoint (2026-06-23, icon gallery cleanup):
  - Goal: remove pre-refactor ordinary UI icon Vue components and add a
    Lucide-style local preview for `@sun-world/icons`.
  - Status: merged locally to `main` at commit `84985a96`.
  - Important files touched:
    - `packages/icons/src/App.vue`
    - `packages/icons/src/App.spec.ts`
    - `packages/icons/src/index.spec.ts`
    - `packages/icons/src/icons/index.ts`
    - `docs/handoff/branches/codex-icon-gallery.md`
  - Verification:
    - `pnpm check:icons` passed.
    - `pnpm test:icons` passed.
    - `pnpm build:icons` passed.
    - `pnpm -C apps/web exec vue-tsc --noEmit` passed.
    - `pnpm format:check` passed.
    - `git diff --check` passed.

- Latest local feature checkpoint (2026-06-24, public SSG prerender):
  - Goal: improve public loading and SEO by generating static homepage,
    article, and sitemap output during the frontend build without changing the
    Nginx static deployment model.
  - Status: implemented locally and verified.
  - Important files touched:
    - `apps/web/package.json`
    - `apps/web/src/modules/blog/index.ts`
    - `apps/web/src/modules/blog/pages/BlogDetailPage.vue`
    - `apps/web/src/modules/blog/composables/useBlogReader.ts`
    - `apps/web/src/modules/blog/ui/BlogCard.vue`
    - `scripts/web-ssg-utils.mjs`
    - `scripts/prerender-public-pages.mjs`
    - `scripts/check-web-ssg.mjs`
    - `scripts/check-web.mjs`
    - `docs/superpowers/specs/2026-06-23-public-ssg-design.md`
    - `docs/superpowers/plans/2026-06-23-public-ssg.md`
    - `docs/current-state.md`
    - `docs/agent-handoff.md`
  - Behavior:
    - `pnpm -C apps/web build` runs `vite build` and then the public SSG
      prerender script.
    - Public article routes use canonical `/blog/<id>` URLs; legacy
      `/blog?id=<id>` remains supported.
    - Build-time article API failures warn but do not fail the frontend build.
  - Verification:
    - `node scripts/check-web-ssg.mjs` passed.
    - `pnpm -C apps/web exec vue-tsc --noEmit` passed.
    - `pnpm -C apps/web build` passed and generated 30 article pages from the
      public API.
    - `pnpm check:web` passed after formatting and regenerated the SSG article
      pages, build manifest, and build summary.
    - `pnpm format:check` passed.
    - `git diff --check` passed.
    - Manual dist spot check confirmed article canonical tags,
      BlogPosting JSON-LD, static article HTML, and sitemap article URLs.
  - Next step:
    - Commit `bc871052` was pushed to `main` and built successfully on
      Lighthouse, but the first deploy run `28065899403` failed during the
      immediate public frontend `curl` probe with a transient HTTP 502 after
      recreating `my-frontend`.
    - Follow-up local fix changes SSG output from directory `index.html` files
      to extensionless `.html` files, updates frontend Nginx to resolve
      `$uri.html`, and retries public frontend probes in the deploy workflow.
      Commit and push this fix before considering the publish fully green.

## Active checkpoint: 2026-08-01 Manage admin shell and data pages

- Goal: implement the approved Manage backend refactor while preserving the existing dirty workspace changes.
- Status: implemented locally; browser QA passed; no deployment, push, commit, or staging performed.
- Important task files: `apps/web/src/modules/admin/components/`, `apps/web/src/modules/admin/pages/Manage*`, `apps/web/src/modules/admin/index.ts`, `apps/web/src/layout/layout.tsx`, `apps/api/src/modules/dictionaries/`, `apps/api/src/database/mysql/schema_migration.py`, `apps/api/src/controller/blog_manage.py`, `apps/api/src/routers/blog/blog.py`, `packages/contracts/`, `design-qa.md`, and `docs/superpowers/plans/2026-08-01-manage-admin-shell-data-page.md`.
- Behavior: `/manage/*` is an independent guarded shell; generic data pages provide the approved ref API and request lifecycle; dictionaries support cached labels and admin CRUD; blog/provider/log pages use the generic list; create/edit uses right-side SchemaForm drawers; legacy manage paths redirect to canonical paths.
- Commands run: `corepack pnpm check:api`, `corepack pnpm check:icons`, `corepack pnpm test:icons`, `corepack pnpm build:icons`, `corepack pnpm check:web:ui-boundary`, contracts test/generation, focused admin Vitest suites, `corepack pnpm -F @sun-world/blog typecheck`, `corepack pnpm -F @sun-world/blog build`, `corepack pnpm format:check`, and `git diff --check`.
- Verification result: listed focused commands passed. API checks retain existing Pydantic deprecation warnings and expected unauthenticated telemetry logs. Full `corepack pnpm check` passed all preceding stages but stopped at frontend performance budgets: total JS/CSS thresholds remain over limits, and the old `AdminLogsPage` chunk-name budget no longer matches the migrated `ManageLogsDataPage` chunk. The Manage shell was made lazy so the entry-module budget now passes.
- Blockers: local browser/API had no administrator session, so guarded data content was not bypassed for visual QA; component/API tests cover those states. Existing unrelated modifications remain in the shared workspace, and the repository-level performance budget needs a separate decision rather than an unreviewed threshold change.
- Next step: review the task-scoped diff and integrate when the surrounding dirty-worktree work is ready.

## Active checkpoint: 2026-08-02 Manage localization follow-up

- Goal: make `/manage/*` Chinese by default while retaining a lower-left language switch for English and future locale expansion.
- Status: implemented locally on top of the existing dirty workspace; no deployment, push, commit, or staging performed.
- Important files touched: `apps/web/src/modules/admin/manageCopy.ts`, `apps/web/src/modules/admin/components/ManageLanguageSwitch.tsx`, `ManageLayout.tsx`, `ManageTable.tsx`, `ManageSearchForm.tsx`, `SchemaForm.tsx`, `ManageDataPage.tsx`, admin data/metrics/log pages and composables, `apps/web/src/layout/layout.tsx`, and focused admin tests.
- Behavior: no saved locale resolves to `zh`; the lower-left menu switches `zh`/`en`, persists through `setLocale`, updates copy without navigation, and updates the document title. Admin labels, CRUD drawers, table states, guard states, metrics, and accessibility labels use centralized copy.
- Verification: `corepack pnpm -F @sun-world/blog exec vitest run src/modules/admin src/pages/manage` passed (11 files, 19 tests); `corepack pnpm -F @sun-world/blog typecheck`, `corepack pnpm -F @sun-world/blog build`, `corepack pnpm format:check`, and `git diff --check` passed.
- Blockers: none for this localization follow-up. The focused suite still reports the existing `act(...)` warning from `src/pages/manage/index.test.tsx`; it does not fail the suite.

## Active checkpoint: 2026-08-02 Manage table shadcn and responsive pagination follow-up

- Goal: make the reusable ManageTable use the project shadcn Table primitives and provide reliable horizontal scrolling and responsive pagination on desktop and mobile.
- Status: implemented locally on top of the existing dirty workspace; no deployment, push, commit, or staging performed.
- Important files touched: `apps/web/src/modules/admin/components/ManageTable.tsx`, `ManageTable.test.tsx`, `manage-data.css`, `packages/ui/src/components/table/`, `packages/ui/package.json`, `packages/ui/source-aliases.ts`, `packages/ui/vite.config.ts`, `packages/ui/src/index.ts`, `scripts/check-ui-package-boundary.mjs`, and `scripts/check-ui-shadcn-structure.mjs`.
- Behavior: the data grid now composes standard shadcn table slots and uses the primitive's overflow viewport; the table keeps its minimum content width for safe horizontal scrolling. Pagination has a separate responsive overflow region so page buttons remain reachable at 390px widths.
- Verification: focused ManageTable tests, UI package tests (55 tests), UI build, UI boundary check, shadcn structure check, Web typecheck, Web build/SSG, format check, and `git diff --check` passed. The broader admin suite now passes 11 files and 23 tests.
- The screenshot follow-up moved search into the table toolbar, keeps create actions on the left, places pagination outside the bounded two-axis table viewport, fixes the header with sticky column heads, and adds a keyboard-accessible page-size selector that reloads from page 1.
- Browser QA at 1280×900 and 390×844 confirmed the independent shell and responsive drawer. The local browser has no administrator session, so guarded data-page behavior was verified through component tests without bypassing authentication.
- A root `corepack pnpm check` attempt timed out after 180 seconds without emitting a task-specific failure. No deployment, push, commit, or staging was performed.
- Next step: review the task-scoped diff and integrate when the surrounding dirty-worktree work is ready.

## Active checkpoint: 2026-08-02 Manage shadcn UI refresh

- Goal: replace the custom Manage visual composition with the approved shadcn
  dashboard/sidebar structure while preserving all existing behavior.
- Status: implemented locally on top of the shared dirty workspace; no
  deployment, push, commit, or staging performed.
- Important files: `packages/ui/src/components/sidebar/`,
  `packages/ui/package.json`, `packages/ui/source-aliases.ts`,
  `packages/ui/vite.config.ts`, `apps/web/src/modules/admin/components/ManageLayout.tsx`,
  `ManageTable.tsx`, `ManageDataPage.tsx`, `manage-layout.css`, and
  `manage-data.css`; design and plan are dated 2026-08-02 under
  `docs/superpowers/`.
- Behavior: Manage now composes `SidebarProvider`, `Sidebar`, and
  `SidebarInset`; data pages use a shadcn Card/Table dashboard surface with
  heading, left action slot, right search slot, sticky header, internal table
  scrolling, and separate page-size/pagination footer. Chinese default,
  lower-left language switch, account menu, routes, guards, and public ref APIs
  remain unchanged.
- Commands and results: focused
  `corepack pnpm -F @sun-world/blog exec vitest run --config vitest.config.ts src/modules/admin src/pages/manage`
  passed (11 files, 23 tests); Web typecheck passed; `corepack pnpm -F @sun-world/ui build`
  passed; Web build/SSG passed; `node scripts/check-ui-shadcn-structure.mjs`
  passed; `corepack pnpm format:check` passed. Desktop browser shell QA passed
  at the available 1280px viewport. The local browser had no administrator
  session, so guarded data content was verified by tests only.
- Known note: the first parallel format-check run raced a Vite temporary
  timestamp config file; a serial rerun passed. Existing `act(...)` warning in
  `src/pages/manage/index.test.tsx` remains non-failing. A fresh root
  `corepack pnpm check` attempt also timed out after 180 seconds without
  emitting a task-specific failure; the targeted Web and UI checks above are
  green.
- Next step: review the task-scoped diff and integrate when the surrounding
  dirty-workspace work is ready.

## Active checkpoint: 2026-08-02 Public AI default provider

- Goal: remove AI mocks, expose one encrypted global DeepSeek provider to all
  front-end visitors, and allow anonymous chat without database persistence.
- Status: implemented locally; database schema/provider seed applied; no
  deployment, push, commit, or staging performed.
- Important files: `apps/api/src/controller/auth_manager.py`,
  `apps/api/src/modules/ai/{router,service,repositories,providers}.py`,
  `apps/api/src/database/mysql/schema_migration.py`,
  `apps/web/src/modules/ai/composables/useAiChat.ts`,
  `packages/ai-ui/src/{AiWorkspace,AiProviderSettings}.tsx`, and
  `scripts/seed-ai-default-provider.py`.
- Behavior: public provider/run routes accept guest requests; stale optional
  cookies downgrade to guest access; global provider credentials are decrypted
  only server-side; guest context is bounded in process; authenticated history
  remains MySQL-backed; provider profiles/catalog mock rows were cleared while
  AI conversation history was preserved.
- Verification: API unittest discovery (47 tests), AI UI tests (14), Web
  tests (47 files/114 tests), Web typecheck, AI UI build, Web production
  build/SSG, live provider listing, anonymous stream, and stale-cookie stream
  all passed. Existing Pydantic/React `act(...)` warnings remain non-failing.
- Next step: review the task-scoped diff and integrate when the surrounding
  dirty workspace is ready.

## Archives

- docs/handoff/archive/2026-06-20-platform-checkpoints.md contains the prior
  platform/deployment checkpoint history, including
  P1.70 compose frontend/API staging and the older P1.x handoff entries.

## Update Rules

- Update this file only with the current active branch links, the newest stable
  checkpoint, and archive pointers.
- Update docs/handoff/branches/<branch-slug>.md for active branch work that
  may diverge from main.
- Archive completed or stale branch notes before merging when they are no
  longer needed as active handoff context.
- Never store secrets, full tokens, passwords, private keys, certificates, or
  full environment values in any handoff file.
