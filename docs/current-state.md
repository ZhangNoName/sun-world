# Current State

Last updated: 2026-06-19 (monorepo-api-import branch, P1.54 local)

## Server

- Host: Tencent Cloud Lighthouse
- SSH user: lighthouse
- Public IP: 81.70.43.189
- Project path: /home/lighthouse/blog/sun-world
- Primary branch: main

## Repository Layout

`main` is still the production branch. The migration branch `monorepo-api-import`
contains the monorepo candidate:

```text
sun-world/
  apps/
    web/           # blog frontend (Vue 3 + Vite)
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

Backend code is now part of this monorepo, but the production runtime has not
been cut over yet:

- Frontend production is still built from `/home/lighthouse/blog/sun-world`.
- Backend source lives in `apps/api` for monorepo development and contract generation.
- Backend production is still running from `/home/lighthouse/blog/blog_end`.
- Cutting production backend traffic to `apps/api` remains a separate deploy/cutover task.

## Services

- Frontend container: my-frontend
- Frontend image: blog-front:latest
- Frontend host port: 8081
- Backend service: uvicorn on port 8000
- Backend production source path today: `/home/lighthouse/blog/blog_end`
- Backend monorepo source path: `/home/lighthouse/blog/sun-world/apps/api`
- Backend monorepo source exposes `/readyz` for dependency readiness; the
  current production backend remains on the legacy path until deliberate cutover.
- GitHub Actions is consolidated into one pipeline in
  `.github/workflows/deploy.yml`. Pull requests run only the `quality` job.
  Non-documentation `main` pushes run `quality` first, then
  `detect-changes` decides whether web, API, both, or neither need deployment.
  `build-web` and `build-api` run only for their changed target and push
  commit-specific images to Tencent CCR personal edition at
  `ccr.ccs.tencentyun.com`. The final deploy job SSHes to Lighthouse, runs
  `docker pull` for changed images, then switches only the changed target(s).
  If both web and API changed, both images must be pushed before deployment
  starts.
  Production runs share one fixed concurrency group with
  `cancel-in-progress: true`, so newer main/manual runs cancel older
  in-progress production runs. Quality, build, and deploy jobs are capped at
  15 minutes.
  Workflow-only, deploy-doc, and local verification script changes validate
  the workflow but are not deployment targets, so they exit through the
  `no-deploy` job.
- Manual deployment supports `build-and-deploy`, `build-only`, and
  `deploy-existing` modes. `deploy-existing` skips builds and redeploys a
  previous CCR image tag, usually a known-good commit SHA.
- The deploy workflow intentionally avoids GHCR and GitHub-to-server image
  archive uploads. Retained metadata artifacts and CCR commit-SHA image tags
  are the current rollback/audit source for built images.
- API deployment still only runs
  `python -m src.database.mysql.schema_migration --mode apply` from the new API
  image, so missing MySQL application tables/columns can be created
  conservatively. The workflow does not start the API container, change Nginx,
  or restart `blog-api.service`; API traffic still stays on the existing
  production service until explicit cutover approval. During the schema apply,
  the deploy job mounts `/home/lighthouse/.config/blog_end` read-only and, when
  it exists, the legacy backend `src/conf/local.override.yml` read-only into
  `/app/src/conf/local.override.yml` so the transient API container can read the
  same production config without printing secrets.
- The API MySQL schema guard is declared in
  `apps/api/src/database/mysql/schema_migration.py`. `pnpm check:api` runs the
  static `--mode check` path. Database modes (`plan`, `validate`, `apply`) use
  the same API config as the app; `apply` only creates missing tables/columns
  and fails on incompatible existing column types instead of rewriting data.
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

## Domains

- https://sunworld.site -> frontend container on 127.0.0.1:8081
- https://www.sunworld.site -> frontend container on 127.0.0.1:8081
- https://api.sunworld.site -> backend on 127.0.0.1:8000
- https://shop.sunworld.site -> frontend container on 127.0.0.1:8081

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

The desktop footer is rendered in `apps/web/src/layout/deskLayout.vue` via `ZFooter`.
The mobile filing link is rendered in `apps/web/src/layout/mobLayout.vue`.

## Known Issues

- The production build currently prints TypeScript errors from `packages/editor`, but Vite still exits successfully. Treat this as technical debt; do not assume type-checking is clean.
- Use `docker build --no-cache -t blog-front:latest .` when you need to be certain static assets have been regenerated.
- Sensitive-pattern filename scans report existing frontend and backend files that may contain token/password/API-key related text. Do not print their contents in agent logs. Review and rotate/move any real secrets before merging or cutting over runtime.
- `docker-compose.yml`, when present, is a build/orchestration entrypoint. Do
  not use it to start the API profile in production until the backend cutover
  checklist has been completed.
- The compose frontend build can set public build-time values through
  `VITE_BASE_URL` and `VITE_TELEMETRY_ENDPOINT`. Do not put secrets in Vite
  build arguments.
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
- GitHub Actions Docker builds use Tencent CCR registry cache tags for both
  frontend and API images. API build timeout is 30 minutes to allow the first
  Python dependency cache warm-up; quality, frontend build, and deploy jobs
  remain capped at 15 minutes.
- `pnpm check:platform` runs `scripts/check-platform-goal-audit.mjs`, which
  verifies the repository has durable evidence for the commit policy,
  frontend-backend chain, monitoring platform, packaging/build optimization,
  SSR decision, and current handoff checkpoint.
- Root `pnpm check:web` also runs `pnpm check:web:chunks` after build and
  performance budgets. The chunk guard requires route-only `video-player` and
  `tile-export` chunks, requires Vditor read/write split chunks, prevents
  top-level JSZip imports in shared utility code, and prevents article catalog
  rendering from importing the full Vditor editor. It also prevents the manage
  shell from statically importing admin charts and prevents broad admin module
  preloading. It also requires explicit legacy page chunks and rejects the old
  broad `src/pages/**` manual merge into the entry chunk.
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
- Backend AI image model imports are lazy inside image endpoints; `/ai/chat`
  is documented in OpenAPI as `ApiResponse[str]`.
- Frontend route-only heavy dependencies are separated from global vendor:
  Artplayer/HLS build into `video-player`, and JSZip builds into
  `tile-export` through a dynamic import in `saveTilesAsZip()`.
- Vditor is split by workflow: article reading uses `vditor-preview`, article
  writing uses `vditor-editor`, and the blog module preload hook no longer
  warms `ArticleEditorPage` while serving public blog detail pages.
- Admin charts are split from the manage shell: `AdminChartsPage` is async,
  local chart shell code builds into `admin-charts`, and admin module routes no
  longer use a broad preload hook.
- Remaining legacy route shells are no longer folded into the entry chunk:
  `gameTiles`, `tools`, `keep`, `login`, `register`, `me`, `qqCb`, and
  `manage` now emit explicit page chunks with gzip budgets.
- UI package primitives are independent from Element Plus runtime imports.
  `SunButton`, `SunInput`, `SunDatePicker`, and `SunPagination` are native
  package implementations covered by package tests; richer app-only Element
  controls remain route-owned until they receive explicit package protocols.
- Root `pnpm check:web:chunks` rejects full Element theme CSS in
  `apps/web/src/main.ts`, Element runtime imports from `packages/ui`
  components, broad third-party/app chunk collisions, and entry HTML preloads
  for route-only or optional heavy chunks.
- HTTP error notifications lazy-load Element Message and its CSS only when a
  message is shown. The entry HTML should not preload `element`,
  `tile-export`, `vditor-*`, `admin-charts`, `echarts`, `zrender`,
  `manage-shell`, or legacy page chunks.
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
- `pnpm check:api` runs backend migration, metrics snapshot store, request
  metrics, RUM metrics, metrics alert protocol checks, and the static MySQL
  schema contract check. Request metrics expose `p50_duration_ms`,
  `p95_duration_ms`, and `p99_duration_ms`; RUM Web Vitals expose
  `p50_value`, `p95_value`, and `p99_value`. Alert evaluation is local only
  and does not send notifications yet.
