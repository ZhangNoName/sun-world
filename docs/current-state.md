# Current State

## Frontend Motion System (2026-08-30, deployed main)

- A dependency-free frontend motion system is implemented and deployed.
  `apps/web/src/styles/design-tokens.css` is the sole source of CSS
  duration, delay, and easing values for the app and Sun World-owned packages;
  shared entrance, spin, and pulse keyframes are consolidated in
  `apps/web/src/style.css`. The frozen upstream `packages/base-ui` source is
  intentionally unchanged and excluded from this policy. No animation runtime
  dependency was added.
- `apps/web/src/shared/design/motion.ts` owns the reduced-motion subscription and
  route behavior constants: a `150 ms` pending delay and `180 ms` minimum
  visible time. Data navigation uses the delayed, stable route indicator, while
  the root route's `HydrateFallback` covers an initial unresolved `route.lazy`
  before the layout exists. Later lazy-route fallbacks register the same pending
  state. Both render an accessible skeleton immediately instead of waiting
  through the delay.
- Cold document loading now keeps the untouched Vite shell as `spa.html` while
  public pages retain SSG HTML; Nginx sends non-SSG fallback routes to the
  neutral shell, preventing a homepage flash. Theme is applied before first
  paint, Telegram loads with `defer`, and QWeather icon CSS loads only after
  weather data succeeds.
- New entrance, exit, loading, and spatial motion is limited to `transform` and
  `opacity`; desktop hover movement is gated to hover-capable fine pointers.
  High-frequency pointer/scroll visual updates use `requestAnimationFrame`, and
  CSS plus JavaScript paths honor `prefers-reduced-motion`.
- The Web-package `check:motion` script enforces the shared token and
  route-loading contracts and
  protects the root fallback plus reduced-motion media/global fallbacks, and
  rejects product-level hard-coded timing, local keyframes, and
  `transition: all`; it is wired into `check:web`. The total CSS gzip budget
  remains unchanged at `51,200` bytes (`50 KiB`).
- The frontend-only release is deployed from `main` at `63f1b918` (motion
  implementation `1d2d1cd4`, UI async-test stabilization `63f1b918`) by
  successful GitHub Actions run `33268004016`. The workflow ran the Web checks,
  image build, and frontend deployment while correctly skipping API checks and
  the API image build. Production uses
  `sun-world-frontend:63f1b918394068b9025b7d147c8d337adc25c393`; the API
  container and image remained unchanged at
  `sun-world-api:188a16ddc134062d803786ac7d58fe1885290ea6`. The pre-release
  frontend remains tagged as
  `sun-world-frontend:133ca878289007e6f48e034353e67fa5684319ba` for rollback.
- Final local verification passed: 11 focused regression tests, Web typecheck,
  the complete `check:web` gate with 127 Web tests, 15 AI UI tests, 6 contract
  tests, three consecutive 38-test shared UI runs, production build, SSG/SPA
  contracts, chunk checks, and all budgets. Total CSS is
  `45,955 / 51,200` gzip bytes. Production smoke checks returned HTTP 200 for
  the main site, WWW site, direct `/aigc` route, and API `/healthz`; desktop
  light/dark and mobile AI rendering plus the ICP filing link were confirmed,
  and no fatal browser errors were observed. The automatic deploy timer is
  enabled and active again.

## Optional Identity And Personal AIGC (2026-08-29, local main)

- Integration status (2026-08-30): `zxy/identity-ai-motion-integration` has
  been merged into local `main`, including all recent architecture, security,
  performance, UI, identity, and personal-AIGC work. The merge preserves the
  deployed frontend motion system, route-loading behavior, reduced-motion
  contracts, blog infinite scroll, and shared AI workspace motion. The merged
  tree passed the focused 50-test identity/home/layout suite, `check:motion`,
  and all 19/19 repository gates: 174 Web tests, 338 API tests, 38 shared UI
  tests, 15 AI UI tests, 39 AI composer tests, and 6 contract tests, plus the
  production builds, budgets, workflow/deployment guards, and static Compose
  validation. This local merge has not been pushed or deployed, and it did not
  run database migrations, import production credentials, restart the API, or
  exercise a real OAuth callback.

- Optional authentication is implemented for password, purpose-bound
  phone/email OTP, Google OIDC, QQ, and WeChat. Public browsing and temporary
  AIGC remain available without login; authenticated users gain durable
  conversations, provider profiles, personas, prompt-only skills, verified
  contacts, identity connections, and MCP configuration.
- Identity resolution uses provider subject first and only an explicitly
  provider-verified phone second. Verified email never auto-merges accounts.
  WeChat is keyed by appid/OpenID with transactional legacy UnionID migration.
  Explicit connection requires recent authentication and a user/session-bound
  one-time state or OTP.
- Sessions are HttpOnly-cookie based with access/refresh token typing, atomic
  rotation, production-enforced strict refresh-reuse handling, an independent
  narrow CSRF write-origin list, wildcard-free credentialed CORS, and
  Redis-backed request limits. OTP cooldowns and quotas are reserved in one
  atomic operation; failed deliveries roll back their owned reservation.
- The `/aigc` workspace now provides guest chat plus signed-in persistence,
  role/persona selection, up to eight prompt-only skills, provider profiles,
  and an explicit-confirmation MCP control plane. Provider/MCP egress is HTTPS
  allowlisted with public-DNS validation, IP pinning, SNI/Host preservation,
  no redirects/environment proxy, bounded payloads/deadlines, rate limits,
  daily guest/site circuit breakers, and distributed concurrency leases.
- Conversation writes/edits are owner-scoped transactions with row locks and a
  server-resolved per-conversation run lease. MCP configuration/catalog calls
  are revision-bound; call audit uses pending/succeeded/failed/unknown and does
  not replay unknown side effects.
- The schema checker now validates exact column/index/foreign-key/default/
  `ON UPDATE`/collation contracts and blocks incompatible historical usernames.
  It intentionally does not rewrite an existing non-unique username index.
- A separate identity cutover migrator has an exact DDL allowlist covering only
  the `users.username` unique index and the three identity `auth_*` tables. Its
  default check has no database access, plan/validate are read-only, and apply
  requires the exact migration ID. Unrelated legacy-table drift stays outside
  this scoped path; the generic full-schema checker remains unchanged and
  strict.
- Manual GitHub Actions deploys now expose a default-`full` `schema_mode`.
  `identity-20260829` is accepted only from `refs/heads/main` for an actual
  `deploy-existing` API/all deploy whose workflow SHA and image tag both exactly
  match the temporary 40-character lowercase
  `IDENTITY_CUTOVER_ALLOWED_SHA`, with schema, Docker-maintenance, and masked
  frontend-timer acknowledgements typed exactly. The reviewed first-production
  profile is QQ-only. The workflow verifies live OAuth callback log safety,
  Redis 6.2+, exact QQ-only credential enablement/egress, effective
  `BLOG_RUNTIME_ENV=production`, exact production API/Web origins, and a fully
  clean reviewed server checkout before it preserves and stops the current
  Docker API under a restore trap. The clean check rejects staged, unstaged,
  and non-ignored untracked content even when `HEAD` matches. Candidate and
  public `/auth/methods` must both report QQ enabled and Google/WeChat disabled
  before recovery coverage ends. A matching reviewed
  main/API push remains schema mode `full` but stages quality/build with
  `deploy_needed=false`; all other pushes retain the normal full/fail-closed
  deploy. Clear the temporary variable immediately after success or
  abandonment.
- Google Cloud project `sun-world-507015` and its production Web OAuth client
  now exist. The downloaded client JSON was validated for the exact production
  callback and tightened to local mode `0600`; it remains outside the repository
  and has not been imported into Lighthouse. A stdin-only, project-bound helper
  rejects additional redirect URIs and is ready to update just the two Google
  variables under a shared lock after the server checkout contains the reviewed
  code. Its rollback file retains only prior Google assignments, not the full
  secret environment. The public `/privacy` page and an unchanged official
  Google sign-in brand asset are also ready locally.
- The production Lighthouse host currently times out when reaching all four
  fixed Google HTTPS endpoints. Google login must not be enabled until an
  operator-controlled overseas forward proxy is provided, stored only as
  `AUTH_GOOGLE_OUTBOUND_PROXY_URL`, and passes the candidate-image preflight.
  The callback no-log Nginx snippet and its root-owned include are also not yet
  installed; the live checker and historical/rotated-log audit must pass before
  the first real authorization-code smoke test.
- The QQ Connect application is configured in the protected production
  `auth.env` with App ID `102822211` and a non-empty secret supplied through
  local clipboard/SSH standard input; the secret value was never logged. The
  secret file remains mode `0600`, and its containing configuration directory
  was hardened from mode `0775` to `0700`. Google and WeChat credentials remain
  absent, so the reviewed cutover requires the exact QQ-only provider matrix.
  A read-only production probe reached all four fixed `graph.qq.com` paths
  without credentials or response bodies: authorize returned HTTP `302`, while
  token, OpenID, and user-info returned HTTP `200`.
- No database migration, push, deploy, API restart, or production smoke test
  has been performed. Before cutover, review and run the controlled identity
  schema migration, install and audit the callback no-log configuration, and
  run the documented QQ login smoke matrix. Resolve the separate full-schema
  drift before the next automatic API deployment. The runbook is
  `docs/deployment/2026-08-29-identity-ai-cutover.md`.
- Route-level gzip budgets were remeasured for the expanded login, account,
  and QQ callback chunks (3/4/2 KiB respectively); global JS, CSS, entry, and
  largest-asset ceilings remain unchanged.
- Integrated-tree verification passed: `corepack pnpm check` completed all 19
  repository gates, including 338 API tests, 174 Web React tests, 38 shared UI
  tests, 15 AI UI tests, 39 AI composer tests, and 6 contract tests. Desktop
  (1440x900) and mobile (390x844) browser QA covered login, registration, and
  the guest AIGC workspace; the tested routes had no horizontal overflow or
  unexpected global error toast. No real QQ/OAuth callback was exercised. The
  callback-log checker passed 27 adversarial tests and the credential importer
  passed 8 tests. The final security assessment and remaining
  P2/product follow-ups are recorded in
  `docs/reviews/2026-08-29-optional-identity-aigc-review.md`.

## Frontend Browser Cache Policy (2026-08-29)

- Frontend Nginx now serves Vite's content-hashed `/assets/` files with a
  one-year public immutable cache policy.
- HTML, extensionless routes, SSG pages, and unhashed public files use
  `no-cache, must-revalidate`, so entry documents are validated before reuse
  and cannot pin an older asset graph across deployments.
- Missing hashed assets return `404` instead of the SPA `index.html` fallback.
  The static frontend deployment guard verifies all three contracts.
- `nginx:alpine` syntax validation passed. A temporary local container verified
  the expected headers for `/`, `/home`, and a current hashed JavaScript file,
  plus an uncached `404` for a missing hashed JavaScript file.

## Security and Integrity Baseline (2026-08-09, feature branch)

- Administrative routes enforce admin access; uploads use bounded UUID storage and byte-based image validation.
- Password writes are hashed, public queries exclude credentials, token refresh/revocation is repaired, and unavailable auth flows return 501.
- MySQL Unit of Work, transactional role-resource replacement, Blog regressions, injected Web SessionPort, AI identity reset and hard package typechecks are implemented.
- API, Web and static Compose gates pass locally. No migration, push or deployment was performed. See `docs/reviews/2026-08-09-security-integrity-implementation.md`.

## Base UI Package Separation (2026-08-02, local main)

- Added `packages/base-ui` as `@sun-world/base-ui`, containing the current
  official `base-nova` shadcn/Base UI registry snapshot and its own manifest,
  build, aliases, and exports. The `sheet` primitive is included as well.
- `@sun-world/ui` now exposes Sun World-owned protocols/integrations and
  product patterns. It may depend on `@sun-world/base-ui`; the reverse
  dependency is prohibited. Application imports were migrated accordingly.
- Existing component source and Tailwind/CSS classes were moved/copied without
  a visual redesign. Future shadcn additions belong in `packages/base-ui`;
  Sun World protocol adapters such as `SwButton`, `SwDialog`,
  `SwDropdownMenu`, and `SwSidebar` belong in `packages/ui`.
- Base/UI builds, Base/UI/Web typechecks, AI UI tests/build, Web build, the full
  UI suite (38 tests), boundary checks, native shadcn check, structure check,
  and targeted formatting passed. No commit, push, or deploy.

## Development React Source Inspector (2026-08-02, local main)

- The development-only `react-dev-inspector` replacement for
  `click-to-react-component` is activated strictly by holding `Alt`. Its
  internal click deactivation callback cannot turn it off while `Alt` remains
  held; releasing `Alt` or losing focus turns it off immediately.
- Focused and serial full Web tests pass, including the new inspector
  regression test. No deployment was performed.

## Global UI, Auth, Login, and Manage Refresh (2026-08-02, local main)

- Consolidated the web and shared UI around shadcn semantic color variables
  with `light`, `dark`, and `system` modes. Compatibility aliases derive from
  those variables, and the package fallback is scoped so it cannot overwrite
  the application theme.
- Reworked login into a responsive login-04-style two-column surface and
  Manage into a full-width sidebar-07-style shell. Only explicit blog routes
  keep the centered side whitespace; other application routes use the full
  width available to them.
- Session state now restores once on startup from HttpOnly cookies, persists a
  stable device ID, coordinates refresh requests, and retries one expired
  request after refresh. API cookie settings are safe for local HTTP and clear
  both current and legacy paths on logout.
- Verification completed: Web/UI/API tests, typechecks, package builds, SSG,
  static UI checks, and browser smoke checks. No deploy was performed.
  Detailed active handoff is in `docs/agent-handoff.md`.

## ChatGPT Work Composer Polish (2026-08-01, local main)

- Removed the inline Markdown preview control and its renderer dependencies;
  Markdown stays as source text until submit and is rendered by the host message
  surface.
- Matched the supplied ChatGPT Work composer crop with a 148px desktop height,
  28px radius, 40px submit control, and neutral focused textarea styling.
- Visual QA evidence and the same-screen reference comparison are recorded in
  `design-qa.md` and `docs/design-qa/ai-composer/`.
- The final `corepack pnpm check` repository gate passes 19/19, including
  package tests/builds, Web typecheck/build, API checks, and static Compose
  validation.
- The model selector now dismisses on outside pointer interaction and Escape;
  Escape and option selection restore trigger focus. Its popover uses a compact
  220px width with 12px labels and 10px descriptions. Composer coverage is now
  23 tests, including both new dismissal regressions.

## Reusable AI Composer (2026-07-31, local main)

- New standalone `@sun-world/ai-composer` provides the ChatGPT Work-style
  controlled input used by `/aigc`: source-only Markdown editing, in-memory
  attachments handed to the host only on submit, controlled model selection,
  searchable slash commands, and loading/cancel states.
- Browser speech is isolated behind `SpeechInputAdapter`. The default adapter
  checks microphone permission where supported, handles denial/unavailable
  states inline, and can be replaced without coupling speech to chat transport.
- Hosts can control the component through `focus`, `setQuestion`, `submit`,
  `cancel`, and `reset`. Submissions contain `markdown`, `files`, `modelId`, and
  optional `commandId`; failed submissions preserve input and attachments.
- `/aigc` maps saved provider profiles into the model selector and delegates
  cancellation to the existing SSE abort path. The current backend transport
  still accepts text only, so its adapter safely rejects attachments and
  commands before starting a stream.
- The complete `corepack pnpm check` gate passes 19/19 after adding composer
  test/build coverage to the root pipeline. This includes composer tests (21),
  AI UI tests (10), Web tests (78), package builds, Web typecheck/build,
  backend checks, and Compose validation. Design and implementation plans live
  under `docs/superpowers/`; package usage is documented in
  `packages/ai-composer/README.md`.
- Browser QA passed on local `/aigc`: the 1280x720 composer measured 900px
  wide with no document overflow; slash filtering/selection, Markdown source
  editing, profile switching, and host-owned command rejection all behaved
  correctly while preserving the draft. A fresh 390x844 load collapsed the
  conversation drawer, kept the composer inside the viewport, and produced no
  horizontal overflow. The only console warning was the existing React Router
  missing `HydrateFallback` warning.
- The composer's package-owned visual and interaction states add 1.69 KiB gzip
  CSS. The measured Web total is 38.7 KiB, so the focused total CSS budget was
  intentionally moved from 38 to 40 KiB; JavaScript and per-route budgets are
  unchanged.

## Modular AI Workspace Platform (2026-07-27, deployed main)

- AI is split into a provider-neutral V1 contract, a standalone FastAPI
  `src/modules/ai` service/repository/provider layer, reusable
  `@sun-world/ai-ui`, and a thin Web adapter. Legacy chat routes stay mounted
  for compatibility.
- V1 streams ordered `run.started`, `content.delta`, `component.upsert`,
  `message.completed`, and `run.failed` events. Render blocks cover sanitized
  Markdown text, tables, lazy ECharts, safe links, saved-record references, and
  namespaced custom components.
- Authenticated conversations, structured messages, likes/dislikes, edits,
  regeneration, and per-user provider profiles persist in four MySQL tables.
  First-turn temporary IDs are reconciled to server IDs and follow-up runs use
  stored history. Guest runs never forge a persistent user identity.
- DeepSeek is the first server default, with correctly paired OpenRouter and
  OpenAI fallbacks. Users can select provider/base URL/model and save an API
  key encrypted by `AI_CREDENTIAL_ENCRYPTION_KEY`; browser storage and API
  responses never contain saved keys.
- The package-owned GPT-style UI supports copy, inline edit/regenerate,
  like/dislike, stop/retry, resizable/collapsible history, provider settings,
  responsive drawers, package renderer injection, and inline owned errors.
- Fresh complete `corepack pnpm check` verification passed 17/17 gates,
  including 19 backend AI tests, 6 contract tests, 8 AI UI tests, 76 Web tests,
  Web typecheck, API checks, package builds, performance budgets, and Compose
  static validation. The frontend Docker cache layer includes the AI UI
  package manifest.
  Browser QA passed at 1280x720 and 390x844, including model settings, full
  viewport sizing, mobile drawer/scrim, controlled send, and inline failure.
- Full architecture and extension rules are in
  `docs/architecture/ai-platform.md`. Commit `ee279f1c` is deployed from
  `main` by successful GitHub Actions run `30211244371`. The run synchronized
  `AI_CREDENTIAL_ENCRYPTION_KEY` and `DEEPSEEK_API_KEY` into the server env,
  applied the MySQL schema, built both images, and switched both services.
  Public frontend, API health, and `/ai/v1/providers` checks returned HTTP 200;
  health returned `{"status":"ok"}` and all four provider descriptors are
  available. Secret values remain outside Git and outside deployment logs.

## Mobile Experience Unification (2026-07-27, deployed main)

- Ordinary routes use `.app-container` as the single page scroll root.
  Mobile header and bottom navigation are sticky, safe-area-aware, and remain
  visible during long-page scrolling.
- A shared layout-level `返回顶部` control appears after 360px on all ordinary
  routes, respects reduced-motion preference, and sits above mobile navigation.
  The older blog-only implementation was removed.
- Mobile navigation is a full-height left drawer with internal overflow,
  background scroll locking, route-aware active state, and correct overlay
  class forwarding through `DialogPanel`. Its prior half-offscreen placement
  came from an unoverridden Base UI `translate: -50% -50%`.
- Homepage CSS no longer duplicates shared shell selectors. Blog cards,
  article reading and authoring, tools, video, game tiles, Keep, administration,
  and canvas have phone-specific sizing and local overflow safeguards.
- Browser QA at 390x844 and 320x700 covered `/home`, `/blog/39`, `/tools`,
  `/video`, `/me`, `/game_tiles`, `/keep`, `/login`, `/register`,
  `/new_article`, `/manage`, `/manage/metrics`, `/manage/logs`, `/canvas`, and
  `/aigc`. Every route kept document width equal to viewport width; wide game
  previews and management tables scroll only inside their containers.
- Fresh verification passed focused layout/home/blog/editor tests, Web
  typecheck, 48 UI tests, and the complete `corepack pnpm check:web` pipeline
  with 70 Web tests, production build, 30 article SSG pages, budgets, and chunk
  checks. The first full UI run had one Select timing failure; its isolated and
  full-suite reruns both passed without a code change.
- The work is included in commit `ee279f1c`, pushed to `origin/main`, and
  deployed successfully by GitHub Actions run `30211244371`.

## Figma-Like Editor Foundation (2026-07-26, local feature branch)

- `@sun-world/editor` now separates persistent scene state (`EditorDocument`),
  transient selection (`SelectionModel`), reversible mutations
  (`CommandManager`), unified input (`InputController`), transform tools, and
  document-scoped persistence (`DocumentRepository`). `SWEditor` remains the
  framework-neutral public facade.
- Selection supports click, Shift add, Ctrl/Command toggle, marquee, move,
  eight-direction resize, rotate, Escape cancellation, and one history entry
  per completed gesture. Locked/hidden elements remain unselectable.
- Persistence is injected by `documentId` and repository. Local storage uses
  versioned per-document keys and migrates the legacy `editor-data` default
  payload once; repository failures do not replace the in-memory document.
- The React `/canvas` adapter exposes history, multi-selection, save state,
  modifier-aware layer selection, and selected-attribute refresh after Canvas
  transforms. Accessible undo/redo controls are available and the unimplemented
  comment tool is hidden.
- Browser QA covered creation, click/add/toggle/marquee selection, move, resize,
  rotate, undo/redo, property editing, save/reload, editable-field shortcut
  safety, and route leave/re-entry. A clean post-HMR browser session had no
  console errors and one creation gesture produced exactly one new layer.
- Layer selection works, but the current React tree exposes no layer-reordering
  interaction, so that planned browser case remains unverified and must be
  implemented before Task 7 can close.
- Browser QA found and fixed two integration bugs: controlled property inputs
  discarded edits before blur, and Canvas transforms did not refresh the right
  property panel. Focused regression tests now cover both paths.
- Fresh editor verification passed 41 tests and the editor production build.
  Focused Web editor tests passed 5 tests, Web typecheck passed, formatting and
  whitespace checks passed. `check:web` remains blocked by four pre-existing,
  non-editor `BlogHomeFeed.test.tsx` assertions expecting the removed
  `阅读更多: 图搜索入门` link; all 59 other Web tests passed in that run.
- The API Extractor warning about bundled TypeScript 5.4.2 being older than the
  workspace TypeScript remains non-blocking.

Last updated: 2026-07-26 (`feat/figma-editor-foundation`, verification blocked
by missing layer-tree reordering and unrelated BlogHomeFeed tests)

## Base UI Migration And Homepage Polish (2026-07-20, local feature branch)

- Formerly Radix-backed `@sun-world/ui` primitives use Base UI 1.6 or
  appropriate semantic native elements while keeping the existing package
  subpaths, canonical compound exports, and deprecated `Sun*` compatibility
  adapters used by the application.
- `@base-ui/react` is the UI package's only third-party primitive dependency.
  Both component manifests pin the `@base-ui` registry.
  `scripts/check-ui-native-shadcn.mjs` requires those entries and rejects any
  `@radix-ui/*` package entry or source import across the supported JavaScript
  module extensions; the synchronized lockfile no longer contains Radix
  packages.
- The Base UI compound internals shared across lazy routes raise the measured
  production entry to 177.8 KiB gzip, so its focused ceiling is 180 KiB. Total
  JavaScript remains 1161.0 / 1200 KiB and CSS 37.0 / 38 KiB; all route and
  largest-asset budgets remain unchanged.
- The homepage search and sort fields omit standalone visible labels only for
  that toolbar, retaining Chinese accessible names through `aria-label`.
  Other form-pattern consumers keep visible labels by default.
- Profile and weather metrics use named, equal-width four-column grids. Article
  cards reserve a trailing desktop action lane and stack that accessible link
  at the lower-right on mobile. Blog/feed styling is owned by
  `blog-experience.css`; a static test protects the toolbar and view-control
  selectors from homepage stylesheet overrides.
- Browser QA covered 1440x900 and 390x844 layouts, Sun World light and Apple
  dark, anchored sort-popup positioning, keyboard focus treatment, and no
  horizontal overflow. Live weather content was unavailable locally, so only
  the weather structure, sizing, and theme behavior were verified.
- Base UI 1.6 Menu has no public popup `initialFocus` equivalent, so Dropdown
  Menu does not promise that Radix behavior. Direct Select items and package
  adapters resolve initial labels; opaque custom/memo/lazy item wrappers need
  Base UI's public `Root.items` metadata. `SelectContent forceMount` is an
  accepted inline, non-portalled compatibility path because Base UI Select
  Portal has no keep-mounted option; no application code consumes it.
- Compound compatibility content adds one `pointerdown` and one `focusin`
  capture listener per mounted content layer. Open-only attachment was not
  applied because Base UI open state is not uniformly exposed to every
  compatibility content/submenu, and changing the timing could weaken
  outside-interaction cancellation; centralize this only with behavior-parity
  coverage.
- Fresh branch verification passed the native-shadcn migration guard, 44 UI
  tests, 56 Web tests plus typecheck/build/SSG/budgets/chunk guards, and the
  root editor/icons/UI/Web build. Formatting and whitespace checks passed, and
  the final source/manifest Radix scan returned no matches. The root build kept
  the known non-blocking API Extractor TypeScript-version warning.

## Web UI Library Enforcement (2026-07-20)

- The Web entry now loads the complete Tailwind v4 + shadcn style entry and
  scans both `apps/web/src` and `packages/ui/src`, fixing unstyled shadcn class
  names that previously rendered like browser-native controls.
- Web source contains no raw `button`, `input`, `textarea`, `select`, `option`,
  `label`, or `dialog` JSX. Reusable field, file-picker, dialog, and tabs
  compositions live in `@sun-world/ui`.
- `scripts/check-web-ui-library.mjs` enforces the boundary in `check:web`.
- The complete UI utility layer raises total CSS gzip to 36.2 KiB; the budget is
  intentionally 38 KiB. JS remains 1139.1 KiB against 1200 KiB.

Last updated: 2026-07-20 (`feat/base-ui-home-polish`, Base UI migration in verification)

## Native Shadcn UI Baseline (2026-07-20, superseded locally)

- `packages/ui` retains the shadcn CLI `new-york` source organization, Tailwind
  CSS v4, canonical compound APIs, and executable monorepo `components.json`
  configuration. Base UI now owns primitive behavior on the active branch.
- Application primitive imports use canonical names. Labeled form fields and
  compound page controls are explicit product compositions; `Sun*` remains only
  as deprecated package compatibility.
- Sun World and Apple map onto the complete shadcn semantic variable surface;
  family selection remains independent from light/dark/system mode.
- The entry gzip budget remains 166 KiB from the native shadcn baseline. Total
  JS remains capped at 1200 KiB and total CSS at 30 KiB.

## Blog Reading Experience (2026-07-19, local main)

- Blog list filtering uses shared UI controls and a cohesive responsive toolbar;
  list/waterfall selection and article actions no longer render as native browser
  buttons.
- Article detail uses a centered reading column with a sticky catalog and full
  Markdown typography for headings, code, quotes, tables, links, and images.
- The experience responds to both Sun World and Apple design families, including
  dark mode, reduced motion, and reduced transparency preferences.
- Application header/footer/mobile navigation styling is owned by the shared
  layout, fixing direct-route styling that previously depended on homepage CSS.
- Local verification: `corepack pnpm check:web` passed; desktop and 390x844
  browser QA passed. These changes are not pushed or deployed.

## Project-Owned Shadcn UI Package (2026-07-19, local main)

- All 14 primitives live under `packages/ui/src/components/<name>` and all six
  composed patterns live under `packages/ui/src/patterns/<name>`.
- Implementations, styles, and public indexes are colocated. Legacy flat
  forwarding modules, flat `Sun*.tsx` files, and split component contracts were
  removed.
- Existing `@sun-world/ui/*` imports and built filenames remain compatible.
  Canonical shadcn-style aliases are additive; all `Sun*` exports remain.
- Vite, Vitest, and TypeScript source aliases resolve the new directories during
  local development without requiring prebuilt package output.
- Semantic tokens remain authoritative for the Sun World and Apple design
  families. No Tailwind runtime or new dependency was introduced.

## React Frontend Rebuild (2026-07-17, merge-ready branch)

- `apps/web` now runs React 19, React Router, TypeScript, and Vite. The production
  entry is `apps/web/src/main.tsx`; no `.vue` source or Vue runtime dependency
  remains in the web, UI, or icon packages.
- `@sun-world/ui` is the shared shadcn-style component layer; it was originally
  built on Radix and is migrated to Base UI on the active local branch.
  `@sun-world/icons/react` is the React icon surface.
- All existing routes and workflows were migrated: home/blog/SSG, authoring,
  authentication, AI streaming chat, admin metrics/logs/blog management, canvas,
  video, game-tile export, tools, TCX generation, QQ callback, and 404 handling.
- Route modules own lazy imports. Rollup places shared dependencies automatically;
  the chunk guard rejects any initial static import or preload of route-only code.
  This avoids the initialization cycles produced by cross-cutting manual chunks.
- Fresh local evidence: `corepack pnpm check` (15/15), `corepack pnpm check:web`,
  and `corepack pnpm build` pass;
  React tests report 23 files / 29 tests; UI and icon package builds pass; SSG
  generates the homepage, `/home`, 30 article pages, and `sitemap.xml`.
- Production browser smoke covered desktop `/`, `/login`, `/register`, `/aigc`,
  `/canvas`, `/video`, `/game_tiles`, `/tools`, `/keep`, `/manage`, `/blog/1`,
  and a missing route. A 390x844 pass covered `/`, `/manage`, `/game_tiles`, and
  `/aigc`. React mounted on every page with no console errors or horizontal overflow.
- This branch has not been pushed, merged, deployed, or checked against production.
- The latest previously verified production checkpoint remains P1.80; this React
  branch supersedes the frontend locally but does not change that deploy marker.

## Admin Audit Logs (2026-07-17, feature branch)

- The API has a bounded, file-backed audit log read model at `GET /admin/logs`.
  It requires the existing authenticated admin dependency and accepts bounded
  `limit`, optional `severity`, and optional `event_type` filters.
- `apps/api/src/core/audit_log.py` is the storage boundary. Its default JSONL
  retention is one 1 MiB active file plus two rotated files (3 MiB maximum).
  Non-secret `BLOG_AUDIT_LOG_DIR`, `BLOG_AUDIT_LOG_MAX_FILE_BYTES`, and
  `BLOG_AUDIT_LOG_MAX_FILES` settings can adjust storage within hard bounds.
- The centralized observability middleware records successful write requests
  and 5xx failures without changing business controllers. The FastAPI lifespan
  records service start/stop and records `service_restarted_uncleanly` when the
  previous run left its runtime marker behind.
- Audit records intentionally exclude bodies, query strings, cookies,
  authorization headers, IP addresses, user agents, exception text, and user
  data. Storage failures are sent to stderr and never fail application traffic.
- The web admin module exposes `/manage/logs` with typed API access, filters,
  refresh, loading, error, empty, and retention states.
- Compose and the GitHub Actions candidate/production deploy paths mount the
  durable `/data/blog` host directory and set
  `BLOG_AUDIT_LOG_DIR=/data/blog/audit-logs`, so a container replacement keeps
  the audit trail and the unclean-restart marker.

## Server

- Host: Tencent Cloud Lighthouse
- SSH user: lighthouse
- Public IP: 81.70.43.189
- Project path: /home/lighthouse/blog/sun-world
- Primary branch: main

## Handoff Layout

- `docs/agent-handoff.md` is the short active handoff entrypoint.
- Branch-specific active task notes live under `docs/handoff/branches/`.
- Completed or stale historical checkpoints live under `docs/handoff/archive/`.
- Keep secrets, tokens, passwords, private keys, certificates, and full env
  values out of all handoff files.

## Repository Layout

`main` is still the production branch. The migration branch `monorepo-api-import`
contains the monorepo candidate:

```text
sun-world/
  apps/
    web/           # blog frontend (React 19 + React Router + Vite)
    api/           # FastAPI backend (imported from blog_end)
  packages/
    editor/        # rich text editor library
    icons/         # icon component library
    contracts/     # shared API contracts (planned placeholder)
    db/            # database access layer (planned placeholder, inactive)
  deploy/
    frontend/      # frontend deployment docs
    backend/       # backend deployment docs + systemd example
  scripts/         # verification shell scripts
  docs/            # project and architecture documentation
```

Backend code is now part of this monorepo. Production API traffic is cut over
to the monorepo Docker image by the deploy workflow:

- Frontend production is still built from `/home/lighthouse/blog/sun-world`.
- Backend source lives in `apps/api` for monorepo development and contract generation.
- Backend production runs from the `sun-world-api:<commit>` Docker image built
  from `/home/lighthouse/blog/sun-world/apps/api`.
- The legacy `/home/lighthouse/blog/blog_end` path remains mounted read-only for
  production config compatibility.

## Services

- Frontend container: my-frontend
- Frontend image: blog-front:latest
- Frontend host port: 8081
- Backend container: sun-world-api
- Backend image: sun-world-api:<commit>
- Backend service: uvicorn in Docker host network on port 8000
- Backend production source path today: `/home/lighthouse/blog/sun-world/apps/api`
- Backend monorepo source path: `/home/lighthouse/blog/sun-world/apps/api`
- Backend monorepo source exposes `/readyz` for dependency readiness; the
  deploy workflow verifies `/healthz` locally and through
  `https://api.sunworld.site/healthz`.
- GitHub Actions is consolidated into one pipeline in
  `.github/workflows/deploy.yml`. Pull requests and non-documentation `main`
  pushes run `detect-changes` first, then split quality jobs by changed target.
  `quality-common` always validates formatting and workflow protocols,
  `quality-web` runs only for frontend/shared web changes, and `quality-api`
  runs only for API/shared contract changes.
  `quality-web` also builds the production `apps/web/dist` on the
  GitHub-hosted runner. `build-web` downloads only the exact
  `frontend-runtime-<commit>-<run-id>-<run-attempt>` artifact from that run,
  verifies its manifest/hash/size, transfers it over host-key-pinned SSH, then
  repeats those checks on Lighthouse. The server syncs
  `/home/lighthouse/blog/sun-world` to the exact `origin/main` commit and uses
  only the reviewed runtime Dockerfile/Nginx config plus the fixed local
  `sun-world-frontend-runtime-base:bootstrap-v1` image to package
  `sun-world-frontend:<commit>` with `--pull=false --network=none`; it no longer
  runs Node, pnpm, or Vite for the production frontend image. The first artifact
  deployment creates that fixed base tag from the exact image ID behind the
  currently healthy `my-frontend` container, so the workflow does not pull a
  base image and later deployments do not accumulate prior release layers.
  `build-api` still builds
  `sun-world-api:<commit>` from source on Lighthouse. Both jobs share
  `/tmp/sun-world-docker-build.lock` while syncing and packaging/building so
  simultaneous frontend/API changes do not race on the same checkout. The
  final deploy job SSHes to Lighthouse and uses the local images for changed
  services.
  Production runs share one fixed concurrency group with
  `cancel-in-progress: false`, so overlapping main/manual runs queue instead of
  interrupting an in-progress SSH deployment or schema maintenance window.
  Common/web/API quality jobs are capped at 10/15/15 minutes, server-side build
  jobs at 30 minutes, and deploy at 60 minutes.
  Workflow-only, deploy-doc, and local verification script changes validate
  the workflow but are not deployment targets, so they exit through the
  `no-deploy` job.
- Manual deployment supports `build-and-deploy`, `build-only`, and
  `deploy-existing` modes. `deploy-existing` skips builds and redeploys a
  previous image tag, which must be a 40-character lowercase commit SHA. For frontend and API,
  this is a local `sun-world-frontend:<commit>` or `sun-world-api:<commit>`
  image that already exists on Lighthouse.
- The deploy workflow intentionally avoids GHCR/TCR image pulls and pushes, and
  never transports a Docker image archive. GitHub transfers only the small,
  short-lived static `dist` archive and strict manifest. Lighthouse still needs
  outbound Git access for the clean exact-SHA checkout and API source build.
  Retained deployment metadata and local Lighthouse commit-SHA image tags are
  the rollback/audit source for built images.
- Every production SSH job trusts the reviewed ED25519 record in
  `deploy/lighthouse_known_hosts` with strict host-key checking; the workflow no
  longer learns a key from live `ssh-keyscan` output. Frontend archives are
  limited, bound to the current run/attempt, verified before and after transfer,
  and safely unpacked by `deploy/frontend/verify_runtime_artifact.py`. Frontend
  cutover now preserves the healthy current container until the replacement
  passes local and public health; failure or an interrupt restores the recorded
  prior container.
- On 2026-08-30, deploy run `33300288083` for `f55a34ee` failed in the retired
  server-side frontend build path after Vite reached `rendering chunks...` and
  the SSH keepalive timed out. The log did not report ENOSPC or OOM; the last
  recorded root filesystem state had about 8.3 GiB free, so no disk cleanup was
  justified. The public frontend and API remained healthy, but new SSH sessions
  continued to time out during banner exchange while this artifact pipeline was
  prepared. Do not infer a successful deployment of `f55a34ee` from its pushed
  Git commit; production remained on the prior healthy frontend until a later
  run proves the new path end to end.
- Artifact trial run `33313986708` for `5a357935` proved the runner build,
  exact-run upload/download, local and Lighthouse manifest/hash verification,
  host-key-pinned SSH transfer, server Git fast-forward, and safe extraction.
  It stopped before image creation because the server had no `nginx:alpine`
  tag, and the deploy job was skipped. The runtime-base bootstrap described
  above removes that remaining Docker pull/cache dependency while still using
  the currently healthy frontend image as the trusted local runtime source.
- Bootstrap follow-up run `33314484092` for `5fe79d7b` then proved the
  Lighthouse-local base bootstrap and offline frontend image build. It failed
  before inspecting or replacing a production container because OpenSSH had
  collapsed the empty optional shell arguments and the remote script reached
  an unset `$7`. The deploy boundary now encodes optional values as explicit
  non-empty arguments, restores them remotely, requires exactly 11 positional
  arguments, and has regression probes for push/full, dispatch/full, and
  reviewed identity argument layouts.
- Manual Web run `33315007998` successfully deployed commit `46a24856` on
  2026-08-30. Runner checks and exact-run artifact verification passed,
  Lighthouse packaged
  `sun-world-frontend:46a248562cf81978a31d9b5934ea6343f800c894` with the local
  runtime base and no registry or Docker pull, and the rollback-protected
  `my-frontend` cutover passed local port 8081 plus both public site health
  checks. Independent probes returned HTTP 200 for `sunworld.site` and
  `www.sunworld.site`, and `{"status":"ok"}` for API `/healthz`. The final
  dangling-image prune reclaimed `0B`; no low-space cleanup was needed.
- API deployment runs
  `python -m src.database.mysql.schema_migration --mode apply` from the new API
  image first, so missing MySQL application tables/columns can be created
  conservatively. It then starts a short-lived `sun-world-api-candidate`
  container with `BLOG_PORT=18000` on the host network and verifies `/healthz`.
  After the candidate passes, the workflow stops and disables
  `blog-api.service`, starts the persistent `sun-world-api` container with
  `BLOG_PORT=8000` on the host network, and verifies both
  `http://127.0.0.1:8000/healthz` and
  `https://api.sunworld.site/healthz`. If the production container health check
  fails, the workflow removes the container and attempts to re-enable/start
  `blog-api.service` as rollback. During schema apply and runtime, the deploy
  job mounts `/home/lighthouse/.config/blog_end` read-only and, when it exists,
  the legacy backend `src/conf` directory read-only into `/app/src/conf` so the
  container can read the same production config without printing secrets.
- The one-time scoped identity path supports the verified production topology
  only: the existing `sun-world-api` Docker container is running on host
  network with restart `unless-stopped`, while `blog-api.service` is inactive
  and disabled. It records and renames that container before stopping it, then
  validates the backup ID/image before any rollback removes a replacement. It
  never starts the legacy systemd unit. The frontend is switched only after
  candidate/public API health and the exact QQ-only provider matrix pass;
  frontend failure
  at start, direct local port-8081 health, or public health restores the old
  `my-frontend` while leaving the healthy new API active.
- `sun-world-auto-deploy.timer` is outside GitHub Actions concurrency and is
  frontend-only. The identity runbook requires recording, stopping, disabling,
  and masking it before staging/cutover, while freezing `main`; the scoped
  workflow refuses an active or unmasked timer/service and holds the shared
  server lock through the whole cutover. Operators restore its recorded states
  after the final attempt. A read-only preflight found that this host's custom
  `/etc` timer unit takes precedence over a runtime mask, so the timer was
  restored to its original enabled/active state; a persistent mask still needs
  the separate approval required by the runbook. Production Redis was
  read-only verified at `7.0.15`, but every cutover repeats the candidate
  image's read-only `INFO server` gate.
- Identity cutover also requires the three exact Google/QQ/WeChat callback
  locations from the reviewed repository file to be installed at the fixed
  root-owned, mode-`0644`
  `/etc/nginx/snippets/sun-world-oauth-callback-no-log.conf` and included inside
  the API HTTPS server. They disable callback access/error persistence, and the
  workflow checks both file metadata and the effective `nginx -T` output before
  maintenance.
- The API MySQL schema guard is declared in
  `apps/api/src/database/mysql/schema_migration.py`. `pnpm check:api` runs the
  static `--mode check` path. Database modes (`plan`, `validate`, `apply`) use
  the same API config as the app; `apply` only creates missing tables/columns
  and fails on incompatible existing column types instead of rewriting data,
  except for explicit legacy-compatible production differences declared in
  `LEGACY_COMPATIBLE_COLUMN_TYPES`.
- The pipeline `quality` job verifies the Prettier formatting protocol, GitHub
  Actions protocol guards, frontend checks, API checks, UI package tests, and
  contracts tests before any build or deploy job can run. Documentation-only
  push changes are ignored by the workflow trigger.
- Prettier formatting is configured by `.prettierrc.json` and runs through
  `scripts/format-changed.mjs`, which checks or writes changed supported files
  only. Markdown and Python are intentionally excluded in `.prettierignore` for
  the first formatting baseline.
- Monorepo API now includes a process-local RUM telemetry baseline:
  - `POST /telemetry/events`
  - `GET /admin/telemetry`
  - `GET /admin/alerts`
  - `GET /admin/metrics/history`
  - Production frontend delivery requires `VITE_TELEMETRY_ENDPOINT`.
- Monorepo API request metrics and RUM Web Vitals now expose bounded-sample
  p50/p95/p99 percentile fields for admin diagnostics. These are still
  process-local and reset on API restart.
- Admin metrics now exposes active local threshold alerts through
  `GET /admin/alerts`, assembled by `apps/api/src/core/admin_alerts.py` from
  request metrics and RUM snapshots. The admin metrics page displays active
  critical/warning alerts, but notification delivery remains intentionally
  disabled until a channel is selected.
- `GET /admin/alerts` reads current request/RUM aggregates with
  `persist=False`, avoiding duplicate metrics snapshot writes when the admin
  page concurrently refreshes metrics, telemetry, and alert panels.
- Admin metrics history is now exposed through authenticated
  `GET /admin/metrics/history?kind=request|rum&limit=...`, backed by the
  replaceable metrics snapshot store. The admin metrics page shows request and
  RUM history sample counts after refreshing current snapshots.
- Monorepo API metrics snapshots now have a replaceable persistence boundary:
  default in-memory history, or optional single-node JSON snapshots with
  `BLOG_METRICS_STORE=json`, `BLOG_METRICS_STORE_PATH`, and
  `BLOG_METRICS_STORE_HISTORY`.
- Nginx handles HTTPS and proxying.
- HTTPS certificates are managed by Certbot with the nginx plugin.
  `certbot.timer` is enabled and active, running renewal checks twice daily.
  Current certificates:
  - `sunworld.site`: covers `sunworld.site`, `www.sunworld.site`, and
    `api.sunworld.site` with the same Let's Encrypt YE2 certificate; valid from
    `2026-07-30 07:34:56Z` through `2026-10-28 07:34:55Z`. A 2026-08-30
    read-only check returned TLS verify code `0` for all three names, HTTP `200`
    for the two site hosts, and HTTP `200` for API `GET /healthz` (`HEAD` is not
    supported and correctly returned `405`).
  - `shop.sunworld.site`: covers `shop.sunworld.site`; expires on 2026-08-28.
  - `zsf.shopping`: uploaded manually to `/etc/nginx/ssl`; covers
    `zsf.shopping` and `www.zsf.shopping`; expires on 2026-09-19.
  The deploy hook
  `/etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh` validates Nginx
  config with `nginx -t` and then reloads Nginx after successful renewal.
  Renewal dry-run was verified on 2026-06-20 with
  `certbot renew --dry-run --no-random-sleep-on-renew`.

## Domains

- https://sunworld.site -> frontend container on 127.0.0.1:8081
- https://www.sunworld.site -> frontend container on 127.0.0.1:8081
- https://api.sunworld.site -> backend Docker container on 127.0.0.1:8000
- https://shop.sunworld.site -> frontend container on 127.0.0.1:8081
- https://zsf.shopping -> frontend container on 127.0.0.1:8081
- https://www.zsf.shopping -> frontend container on 127.0.0.1:8081
  with HTTP redirected to HTTPS by `/etc/nginx/conf.d/zsf.shopping.conf`.
- API CORS allows the production frontend origins `https://sunworld.site`,
  `https://www.sunworld.site`, `https://zsf.shopping`, and
  `https://www.zsf.shopping`. The deploy workflow passes the same list through
  `BLOG_CORS_ORIGINS` so server-side secret env overrides do not accidentally
  drop these public origins.

## Automation

`sun-world-auto-deploy.timer` checks and deploys `origin/main` daily at 03:30 CST.

Useful commands:

```bash
sudo systemctl status sun-world-auto-deploy.timer
sudo systemctl start sun-world-auto-deploy.service
sudo tail -100 /var/log/sun-world-auto-deploy.log
```

## Compliance

The homepage must display the ICP filing number:

```text
豫ICP备2024081960号
```

It must link to:

```text
https://beian.miit.gov.cn/
```

The filing is rendered only on the homepage by
`apps/web/src/modules/home/ui/IcpFilingCard.tsx`. Desktop placement is after
the left-side weather card; mobile placement is inside
`apps/web/src/modules/home/pages/HomePage.tsx`.

## Switchable Design Themes

- The web app supports two independent design families, `sun-world` and
  `apple`, each with light and dark appearances. Color mode can also follow
  `prefers-color-scheme`.
- Theme preferences are stored as `{ family, mode }` under
  `sun-world-theme`. Legacy `theme=sun-light|sun-dark` values migrate to the
  Sun World family automatically.
- Runtime state is exposed on `<html>` as `data-design` and
  `data-color-mode`; legacy `sun-light` / `sun-dark` classes remain for
  compatibility.
- The main theme button switches design family in one click without changing
  color mode. The adjacent options control selects an exact family and mode;
  its implementation is lazy-loaded as a `ThemeOptions` chunk.
- Theme tokens live in `apps/web/src/styles/design-tokens.css`. Shared UI
  surfaces consume the semantic tokens and include reduced-motion,
  reduced-transparency, and increased-contrast fallbacks.
- `scripts/check-design-themes.mjs` guards the two families, both appearances,
  semantic material tokens, and accessibility preference media queries.
- The entry-module gzip budget was 162 KiB after adding the global theme
  controller. That historical build measured 160.2 KiB; the detailed theme options are
  a separate 0.48 KiB gzip lazy chunk.

## Known Issues

- The editor declaration build warns that API Extractor bundles TypeScript 5.4
  while the workspace uses TypeScript 5.9; declarations and the root build still
  complete successfully. Upgrade API Extractor/vite-plugin-dts when convenient.
- Use `docker build --no-cache -t blog-front:latest .` when you need to be certain static assets have been regenerated.
- Sensitive-pattern filename scans report existing frontend and backend files that may contain token/password/API-key related text. Do not print their contents in agent logs. Review and rotate/move any real secrets before merging or cutting over runtime.
- `docker-compose.yml` covers both frontend and API orchestration. Frontend
  keeps the existing `my-frontend` container and `8081:80` mapping. API stays
  behind the explicit `api` profile and binds to
  `127.0.0.1:${BLOG_API_HOST_PORT:-18000}:8000` by default, so it can run as a
  staging container without taking over the current production
  `blog-api.service` on port `8000`.
- The compose frontend build can set public build-time values through
  `VITE_BASE_URL` and `VITE_TELEMETRY_ENDPOINT`. Do not put secrets in Vite
  build arguments.
- Root `pnpm check:web` runs `scripts/check-web-client-secrets.mjs`, which
  rejects LangSmith personal access token patterns, OpenAI-style private key
  patterns, and client-side LangChain API key variables from `apps/web/src`.
  LangSmith/OpenAI keys must stay server-side only. The backend accepts
  `LANGSMITH_API_KEY` and also falls back to `LANGCHAIN_API_KEY` for
  compatibility with existing secret names.
- The frontend Dockerfile copies workspace manifests before source code and
  runs `pnpm install --frozen-lockfile` before `COPY . .`; `pnpm
  check:dockerfile` guards this cache layout.
- Root `pnpm check:web` is cross-platform through `scripts/check-web.mjs`.
  Root `build:web`, `build:editor`, and `build:icons` use
  `scripts/run-workspace-script.mjs` for portable `NODE_OPTIONS`.
- Root `pnpm check` is cross-platform through `scripts/check-all.mjs`. It runs
  root script protocol, GitHub Actions deploy/CI protocol guards,
  changed-file `pnpm format:check`, platform goal audit, `git diff --check`,
  `pnpm test:ui`, `pnpm build:ui`, `pnpm check:web`, `pnpm check:api`, and
  `pnpm check:compose` without deployment or public health probes.
- `pnpm check:compose` also verifies the API Dockerfile cache layout. The API
  image now exports locked Poetry dependencies to `requirements.txt`, installs
  those dependencies before copying `src`, and then copies API source files in
  the final lightweight layer. Source-only API changes should not invalidate
  the full Python dependency installation layer.
- GitHub Actions Docker builds run on Lighthouse for both frontend and API.
  Frontend images use
  `sudo docker build --progress=plain -t sun-world-frontend:<commit> -f Dockerfile .`.
  API images use
  `sudo docker build --progress=plain -t sun-world-api:<commit> -f apps/api/Dockerfile apps/api`
  instead of GitHub Buildx, so production images no longer use remote registry
  cache export or image push. The SSH build sessions use keepalive options
  because earlier Lighthouse builds disconnected with `client_loop: send
  disconnect: Broken pipe` during quiet download periods. The API Dockerfile
  rewrites Debian apt sources to Tencent Cloud mirrors before installing `bash`
  and `libpq5`, while pip already uses Tencent's PyPI mirror.
  `bash` is required by `apps/api/start.sh`, which is the API image default
  command. Prefer separate manual runs for web and API when only one target
  needs deployment. Frontend and API build timeouts are 30 minutes to allow
  server-side Docker builds; quality jobs remain capped at 10/15 minutes and
  deploy is capped at 60 minutes. The deploy workflow keeps
  `sun-world-api-candidate` long enough to print `docker inspect` and
  `docker logs --tail 120` if candidate health checks fail, then removes the
  failed container before exiting.
- `pnpm check:platform` runs `scripts/check-platform-goal-audit.mjs`, which
  verifies the repository has durable evidence for the commit policy,
  frontend-backend chain, monitoring platform, packaging/build optimization,
  SSR decision, and current handoff checkpoint.
- Root `pnpm check:web` runs `pnpm check:web:chunks` after the React build and
  performance budgets. The chunk guard verifies required route/action chunks,
  prevents top-level JSZip and ECharts imports, and traverses the production
  entry's static import graph to reject route-only code in the initial bundle.
- `pnpm check:contracts:usage` guards module API files so core backend routes
  are consumed through `@sun-world/contracts` route constants.
- `@sun-world/contracts` exports `API_ROUTE_METHODS`, and contracts tests
  verify every `API_ROUTES` value has method metadata and exists in the
  generated backend OpenAPI schema.
- `@sun-world/contracts` OpenAPI generation is cross-platform:
  `pnpm -F @sun-world/contracts generate:openapi` runs
  `scripts/generate-openapi.mjs`, which selects `SUN_WORLD_API_PYTHON`, the
  local API virtualenv Python, `python`, or `python3` before calling
  `scripts/export-openapi.py`. `pnpm check:web` runs
  `pnpm check:contracts:generate` to prevent the generate path from regressing
  to bash.
- `pnpm check:web:legacy-api` guards deleted legacy internal API entrypoints.
  `apps/web/src/service/request.ts`, `apps/web/src/service/auth.req.ts`,
  `apps/web/src/service/manageRequest.ts`, `apps/web/src/service/user.req.ts`,
  `apps/web/src/hooks/auth/auth.ts`, and the old browser-side
  `apps/web/src/aigc` LangChain client are intentionally retired.
- Blog management table data is injected through a module-owned `fetchPage`
  function; table UI must not accept raw backend URL strings.
- AI chat is now owned by `apps/web/src/modules/ai/api.ts`, uses
  `API_ROUTES.ai.*`, and calls the backend instead of bundling browser-side
  LangChain/OpenAI clients.
- The `/aigc` route is exposed as a public AI entry from desktop header,
  mobile bottom navigation, mobile drawer, and the AI module nav registration.
- Backend AI image model imports are lazy inside image endpoints; `/ai/chat`
  is documented in OpenAPI as `ApiResponse[str]`.
- Backend `AiManager` lazy-loads LLM agents and image models on first AI
  endpoint use. API startup, `/healthz`, and non-AI routes must not require
  `OPENROUTER_API_KEY` or `OPENAI_API_KEY`; missing provider keys should fail
  the AI endpoint path rather than the whole API process.
- Frontend route-only heavy dependencies stay behind dynamic imports:
  Artplayer/HLS load with `VideoPage`, JSZip loads only during tile export,
  ECharts loads only inside chart cards, and the Markdown editor loads only in
  authoring. Rollup automatically places their shared dependencies.
- Markdown reading uses lazy `SunMarkdownPreview`; writing uses lazy
  `SunMarkdownEditor` backed by `@uiw/react-md-editor`. The preview reports
  headings/render completion for the blog catalog without loading authoring code.
- Blog home feed observes the `.app-container` scroll root for infinite loading
  and shows a floating "back to top" control after 360px of scrolling.
- Admin charts, metrics, and logs are lazy React routes. Chart instances load
  ECharts on demand and dispose on unmount.
- Tool, account, callback, management, AI, editor, video, and blog detail pages
  are route chunks with measured gzip budgets for stable named entries.
- `@sun-world/ui` contains the shared shadcn-style Base UI React primitives, including
  buttons, inputs, selection, dialogs, dates, pagination, chat shells, themes,
  tooltips, and toast handling. Package tests and subpath exports are required.
- The production HTML must not preload route-only or optional heavy chunks.
  HTTP errors render through the Sun toast layer; no Element runtime remains.
- Root `pnpm check:web` generates and validates
  `apps/web/dist/build-manifest.json` after the frontend build. The manifest is
  a generated build artifact with total JS/CSS gzip, initial gzip, lazy JS
  gzip, and per-asset `isInitial` metadata for future trend collection.
- Root `pnpm check:web` also generates and validates
  `apps/web/dist/build-summary.json`. The summary is a compact generated
  artifact for CI/release retention: total gzip fields, top 10 largest assets,
  and machine-readable performance budget results.
- Root `pnpm check:web` also runs `pnpm check:web:ui-boundary`, which verifies
  app runtime code imports `@sun-world/ui` components through documented
  subpaths, prevents app imports from the package root/internal paths, and
  rejects a shared `ui.*` web chunk so unused UI components are not pulled into
  the entry bundle.
- Root `pnpm check` now also runs the UI package's independent test and build
  commands, so component protocol tests and package subpath build outputs are
  verified outside the app bundle.
- The frontend production build strips route-only optional heavy assets from
  the generated `index.html` preload/style tags. Those chunks still exist and
  load through route-level dynamic imports when their routes are visited.
- The frontend production build now runs a post-build public SSG prerender
  step through `scripts/prerender-public-pages.mjs`. After Vite writes
  `apps/web/dist`, the script rewrites the root homepage HTML, writes
  `/home.html`, fetches public blog list/detail data from
  `SUN_WORLD_SSG_API_BASE_URL`, `VITE_BASE_URL`, or
  `https://api.sunworld.site`, writes `/blog/<id>.html` pages, and
  regenerates `sitemap.xml` with article URLs. API fetch failures are
  non-blocking warnings so local and PR builds do not depend on production API
  availability; static homepage and base sitemap output are still generated.
- Public blog article URLs now support canonical `/blog/<id>` paths while the
  legacy `/blog?id=<id>` reader path remains accepted by the same page.
- The frontend Nginx config resolves extensionless SSG pages with
  `try_files $uri $uri.html $uri/ /index.html`, so `/blog/<id>` can serve the
  generated `blog/<id>.html` file without a directory slash redirect.
- The deploy workflow retries public frontend `curl -fsSI` checks after
  recreating `my-frontend`, avoiding false failures while the new Nginx
  container becomes ready.
- `scripts/check-web-ssg.mjs` validates the public SSG helper contract:
  canonical article paths, escaped static article HTML, BlogPosting JSON-LD,
  sitemap entries, and API envelope unwrapping.
- `pnpm check:api` runs backend migration, metrics snapshot store, request
  metrics, RUM metrics, metrics alert protocol checks, and the static MySQL
  schema contract check. Request metrics expose `p50_duration_ms`,
  `p95_duration_ms`, and `p99_duration_ms`; RUM Web Vitals expose
  `p50_value`, `p95_value`, and `p99_value`. Alert evaluation is local only
  and does not send notifications yet.

## 2026-08-01 Manage admin shell and data pages

- Implemented the approved independent `/manage/*` shell with recursive navigation, desktop collapse/hide/restore, mobile drawer, account menu, canonical routes, legacy redirects, and administrator guard behavior.
- Added reusable `ManageDataPage`, `ManageSearchForm`, `SchemaForm`, and `ManageTable` primitives with dictionary rendering/cache, stale/error/empty/loading states, race-safe requests, selection/ref APIs, and page correction.
- Added dictionary type/item schema migration, repositories, service, admin CRUD, enabled public read, contracts, and `/manage/system/dictionaries` management UI.
- Migrated blog, AI provider, and audit-log screens to generic data pages; blog management now has administrator PUT update support and a right-side SchemaForm editor drawer.
- Browser QA evidence is in `design-qa.md`; the local browser had no administrator session, so guarded data-page content was validated through focused component tests and API checks.
- Verification passed: `corepack pnpm check:api`, `corepack pnpm check:icons`, `corepack pnpm test:icons`, `corepack pnpm build:icons`, `corepack pnpm check:web:ui-boundary`, contracts tests/generation, focused admin Vitest suites, Web typecheck, Web build, `corepack pnpm format:check`, and `git diff --check`.
- Full `corepack pnpm check` reached the frontend performance budget stage but failed on the repository's total JS/CSS thresholds and the stale `AdminLogsPage` chunk-name budget after the log page moved to `ManageLogsDataPage`; the Manage shell was moved behind a lazy route branch and the entry-module threshold now passes. All earlier check stages passed.
- No deployment, push, commit, or unrelated staging was performed. Next step is review/integration of the task-scoped diff on top of the existing dirty workspace.

## 2026-08-02 Manage localization follow-up

- Management UI copy now defaults to Simplified Chinese when no locale preference exists; the sidebar's lower-left language control switches between Chinese and English and persists through the existing `i18n` preference.
- Centralized manage translations live in `apps/web/src/modules/admin/manageCopy.ts`; the switch is `ManageLanguageSwitch.tsx`, and the shell updates navigation, account actions, document title, data-page primitives, CRUD drawers, logs, charts, metrics, loading/error/empty states, and accessibility labels on locale changes.
- Verification passed: `corepack pnpm -F @sun-world/blog exec vitest run src/modules/admin src/pages/manage`, `corepack pnpm -F @sun-world/blog typecheck`, `corepack pnpm -F @sun-world/blog build`, `corepack pnpm format:check`, and `git diff --check`.
- The focused suite retains one pre-existing `act(...)` warning in `src/pages/manage/index.test.tsx`; all 11 files and 19 tests passed. No deployment, push, commit, or staging was performed.

## 2026-08-02 Manage table shadcn and responsive pagination follow-up

- Replaced the raw management table markup with the canonical shadcn-style `@sun-world/ui/table` composition (`Table`, header/body/row/head/cell primitives). The primitive owns the accessible table slots and its horizontal overflow viewport; ManageTable retains the configured columns, selection, dictionary rendering, and custom cell renderers.
- Added a responsive `manage-table-pagination` viewport around the existing `SunPagination` pattern. Pagination stays keyboard-accessible and can scroll horizontally on narrow screens without widening the management shell.
- Added the Table subpath to UI source aliases, package exports, library build entries, and UI boundary/shadcn structure checks.
- Verification passed: focused `ManageTable.test.tsx` (4 tests), `corepack pnpm -F @sun-world/ui test` (55 tests), `corepack pnpm -F @sun-world/ui build`, UI boundary and shadcn structure checks, Web typecheck, Web build/SSG, `corepack pnpm format:check`, and `git diff --check`.
- The broader `src/modules/admin` suite now passes 11 files and 23 tests, including the search heading regression, sticky header, toolbar composition, and page-size reload coverage. No deployment, push, commit, or staging was performed.
- A root `corepack pnpm check` attempt timed out after 180 seconds without emitting a task-specific failure; the targeted Web and UI checks listed above passed.

## 2026-08-02 Manage table layout correction

- Merged the search form into the reusable table toolbar. Page actions (including create) are grouped on the left, while search and reset remain on the right; mobile stacks the same toolbar without creating a separate search card.
- The table viewport now owns bounded two-axis scrolling, keeps pagination outside that viewport, and uses sticky column headers so vertical scrolling preserves the header. Pagination exposes a page-size selector with Chinese/English copy and reloads from page 1 when the size changes.
- Added regression coverage for toolbar composition, shadcn table slots, two-axis scroll contract, sticky header markers, pagination placement, page-size interaction, and DataPage page-size requests.
- Verification passed: `corepack pnpm -F @sun-world/blog exec vitest run --config vitest.config.ts src/modules/admin src/pages/manage` (11 files, 23 tests), Web typecheck, Web build/SSG, UI shadcn structure check, `corepack pnpm format:check`, and `git diff --check`.

## 2026-08-02 Public AI default provider

- Removed code-level AI provider mocks/fallbacks. `GET /ai/v1/providers` now
  reads the enabled provider catalog from MySQL, and an empty catalog returns
  `AI_PROVIDER_NOT_CONFIGURED` instead of synthesizing a provider.
- Public AI provider listing and streaming no longer require login. Optional
  authentication treats invalid or temporarily unverifiable cookies as guest
  access, including when Redis is unavailable.
- Anonymous conversations use the browser-generated conversation ID and a
  bounded in-process transcript only; they are not written to the AI
  conversation/message tables. Authenticated profiles and conversation
  persistence remain unchanged.
- The database now contains one enabled `deepseek` catalog row with an
  encrypted credential, no user provider profiles, and the existing two
  conversations/two messages preserved. The credential is never returned by
  the API or printed by tooling.
- `scripts/seed-ai-default-provider.py` is dry-run by default and accepts the
  provider key only through `DEEPSEEK_API_KEY` when called with `--apply`.
  It clears provider profiles/catalog rows but does not clear conversation
  history. The two catalog credential columns were applied narrowly; unrelated
  pending dictionary-table migration actions were not applied.
- Verification passed: API unittest discovery (47 tests), AI UI tests (14),
  Web tests (47 files/114 tests), Web typecheck, AI UI build, Web production
  build/SSG, and live anonymous/stale-cookie stream checks. No deployment,
  push, commit, or staging was performed.

## 2026-08-02 Manage shadcn UI refresh

- Added a local shadcn-style `@sun-world/ui/sidebar` primitive with provider,
  inset, header/content/footer, menu, trigger, and collapse data contracts;
  no dependency or CLI overwrite was introduced.
- Refactored `ManageLayout` to use the sidebar/inset composition while keeping
  recursive navigation, desktop collapse/hide/restore, mobile drawer,
  language switch, account menu, route redirects, and administrator guard.
- Refactored `ManageTable` to use the existing shadcn Card and Table primitives
  and added the dashboard-style page heading in `ManageDataPage`. Search/reset
  and create actions remain in one toolbar, table scroll remains internal, the
  header is sticky, and pagination remains outside the viewport.
- Important files: `packages/ui/src/components/sidebar/`, `packages/ui/package.json`,
  `packages/ui/source-aliases.ts`, `packages/ui/vite.config.ts`,
  `apps/web/src/modules/admin/components/ManageLayout.tsx`,
  `ManageTable.tsx`, `ManageDataPage.tsx`, `manage-layout.css`, and
  `manage-data.css`; task design/plan are in `docs/superpowers/specs/` and
  `docs/superpowers/plans/` dated 2026-08-02.
- Verification passed: focused Manage suite (11 files, 23 tests), Web
  typecheck, UI package build, Web build/SSG, UI shadcn structure check, and
  `corepack pnpm format:check`. Browser desktop shell inspection passed; the
  local browser had no admin session, so guarded table content was not bypassed.
- A prior parallel format-check attempt saw a transient Vite timestamp-file
  race; the same checks were rerun serially and passed. No deployment, push,
  commit, or unrelated staging was performed.
- Browser QA at 1280×900 and 390×844 confirmed the independent Manage shell and responsive drawer. The local browser has no administrator session, so the guarded data-page surface was validated through the focused component tests; no authentication bypass was used.

## 2026-08-10 UI consumer boundary consolidation

- The two-level UI ownership model remains intentional: `@sun-world/base-ui`
  owns generic accessible primitives, while `@sun-world/ui` owns Sun World
  protocol components and compositions. Consumer packages may import either
  owner through its public package export, but may not import third-party UI
  primitive libraries directly.
- Production JSX under `apps/web/src` and consumer `packages/*/src` no longer
  owns raw interactive or table elements. The sole documented native-element
  exception is the hidden `type="file"` input inside
  `packages/ai-composer/src/attachments/AiFilePicker.tsx`; the adapter owns its
  label, trigger, reset behavior, and accessibility contract.
- AI Composer now uses Base UI Button/Textarea primitives and the file-picker
  adapter; AI UI uses Base UI Button/Label/Textarea and the compound Table
  primitive. Component tests assert the shared `data-slot` ownership contract.
- `@sun-world/icons` is again icon-only: the obsolete `SunIconButton` wrapper
  was removed. The blog waterfall moved from the app-global `components/`
  directory into the blog module, and duplicate unrouted Manage/Admin log
  pages and hooks were removed.
- `scripts/check-web-ui-library.mjs` now scans all consumer packages, rejects
  raw interactive/table JSX, direct third-party primitive imports, and a new
  app-owned `shared/ui` layer. `@sun-world/ai-composer` now has a required
  typecheck, and its library build fails before bundling on TypeScript errors.
- Verification passed with `corepack pnpm check`: all 19 repository gates,
  including 45 Web test files/112 tests, 71 API tests, package builds, SSG,
  budgets, schema checks, formatting, and static Compose validation.
- Commit `9aa5fdb9` was fast-forwarded to `main`. The first automatic deployment
  run `31346060274` exposed a clean-runner dependency-order defect and an unsafe
  skipped-build deploy condition; image inspection failed before either
  production container was replaced. Commit `188a16dd` now builds Icons, UI,
  and AI Composer before Web checks and requires a successful image for every
  changed target unless `deploy-existing` was explicitly requested.
- Manual `build-and-deploy / all` run `31346480765` succeeded for commit
  `188a16dd`: clean CI, frontend and API Lighthouse image builds, schema guard,
  candidate API health, production cutover, and public health checks all passed.
  Independent probes returned 200 for the main, WWW, and `/aigc` pages,
  `{"status":"ok"}` for the API health endpoint, and the rendered homepage
  exposed `豫ICP备2024081960号` with the required MIIT link.

## 2026-08-30 P1.81 model catalog and modular external CLI

- Added the publishable `@sun-world/cli` package. `sun-world ai models` lists
  enabled managed models and `sun-world ai ask` consumes the versioned AI V1
  SSE protocol; omitting `--model-id` exercises the server-selected default.
- Added a reviewed integration adapter contract and registries for Feishu/Lark
  and Zhihu. The public API exposes only secret-free connector manifests at
  `/integrations/v1/connectors`; third-party CLI execution stays on the caller's
  machine and is never spawned by the API container. Fixed argv construction,
  absolute executable paths, JSON/NDJSON output, bounded processes, preview
  redaction, per-platform credential environments, and explicit mutation
  confirmation form the local execution boundary.
- The managed model catalog now supports `auth_mode`, encrypted credential
  status, explicit `is_default`, atomic default switching, and direct selection
  by `model_id`. Public responses never expose plaintext or ciphertext.
- `qwen-public` points to the keyless OpenAI-compatible model
  `qwen38_27b` at `http://211.141.18.165:6195/v1`. A full schema deployment
  idempotently inserts it and selects it when there is no enabled default; the
  first migration leaves existing rows non-default, so the initial rollout
  selects Qwen. Later deployments preserve an enabled administrator-selected
  default.
- The HTTP upstream is an exact-origin exception, not a general downgrade:
  only `http://211.141.18.165:6195` is allowed, only for managed
  `auth_mode=none` models. Bearer catalog models and every personal provider
  profile remain HTTPS-only, with a second runtime rejection before DNS or HTTP
  client creation. The transport validates public DNS/IP results per request,
  pins the validated IP, preserves the Host port, disables redirects and
  environment proxies, and applies time/output bounds. MCP remains HTTPS-only.
- `/manage/ai/models` is the canonical administrator UI for adding, editing,
  enabling, disabling, deleting, and selecting the default model, including
  add/replace API-key flows and default-model protection. Legacy provider and
  AIGC management paths redirect to it. The public model selector distinguishes
  `model:<catalog-id>` from `profile:<profile-id>`.
- A real end-to-end local API smoke used the current provider transport and
  `pnpm sun ai ask` without `--model-id`. For monthly values
  `100, 130, 169, 160`, the default Qwen model returned:
  `2月环比增长30%，3月增长30%，4月约下降5.33%；总体先升后微降，整体仍呈上行。`
- Final verification passed: `corepack pnpm check` completed all 20/20 gates,
  including 61 Web test files/180 tests, 357 API tests, 17 CLI tests, production
  builds and budgets, contract/CI/deploy guards, and Compose static validation.
  The connector catalog parity test also compares the API catalog with the CLI
  safe projection. `npm pack --dry-run` for `@sun-world/cli` passed with 20
  published files (15.6 kB tarball, 53.2 kB unpacked).
- No production deployment, database mutation, npm publish, commit, push, or
  staging was performed. The upstream can emit reasoning tokens before visible
  content; very small experimental output budgets may therefore produce no
  visible answer, while the configured default budget of 4096 returned content.
