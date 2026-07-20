# Current State

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
  `build-web` and `build-api` run only for their changed targets, SSH to
  Lighthouse, sync `/home/lighthouse/blog/sun-world` to `origin/main`, and
  build `sun-world-frontend:<commit>` / `sun-world-api:<commit>` locally on the
  server. Both server-side build jobs share
  `/tmp/sun-world-docker-build.lock` while syncing and building so simultaneous
  frontend/API changes do not race on the same checkout. The final deploy job
  SSHes to Lighthouse and uses the local images for changed services.
  Production runs share one fixed concurrency group with
  `cancel-in-progress: true`, so newer main/manual runs cancel older
  in-progress production runs. Common/web/API quality jobs are capped at
  10/15/15 minutes, server-side build jobs at 30 minutes, and deploy at 15
  minutes.
  Workflow-only, deploy-doc, and local verification script changes validate
  the workflow but are not deployment targets, so they exit through the
  `no-deploy` job.
- Manual deployment supports `build-and-deploy`, `build-only`, and
  `deploy-existing` modes. `deploy-existing` skips builds and redeploys a
  previous image tag, usually a known-good commit SHA. For frontend and API,
  this is a local `sun-world-frontend:<commit>` or `sun-world-api:<commit>`
  image that already exists on Lighthouse.
- The deploy workflow intentionally avoids GHCR, GitHub-to-server image archive
  uploads, and GitHub-to-registry image pushes because registry cache export and
  image push paths repeatedly stalled. Retained metadata artifacts and local
  Lighthouse commit-SHA image tags are the current rollback/audit source for
  built images.
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
    `api.sunworld.site`; expires on 2026-08-29.
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
  server-side Docker builds; quality and deploy jobs remain capped at 15
  minutes. The deploy workflow keeps
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
