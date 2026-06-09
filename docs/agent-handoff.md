## Current Handoff

- Goal: Create `.ai` workspace for project plans and sync protocol.
- Status: Implemented and verified locally on branch `monorepo-api-import`.
- Repo/path: `/home/lighthouse/blog/sun-world` on server.
- Branch: `monorepo-api-import`

## Design Source

- Figma: `Sun World Design System v1`
- URL: `https://www.figma.com/design/6y7S8Pue0ykCD2trppB2QM`
- Notes:
  - Figma variable collections are single-mode in the current plan, so v1 uses `color/light/...` and `color/dark/...` variables there.
  - Code keeps `.sun-light` / `.sun-dark` CSS variable switching.

## Files Changed

- `.ai/README.md` **(new)**
  - Adds the AI workspace entrypoint and read order.
- `.ai/plans/platform-roadmap.md` **(new)**
  - Summarizes completed platform phases and next candidate phases.
- `.ai/protocols/sync-protocol.md` **(new)**
  - Documents local/server/GitHub branch synchronization and forbidden sync
    actions.
- `.ai/protocols/server-resource-policy.md` **(new)**
  - Documents the 2-core/2GB server constraint and when to avoid server-side
    cc/DeepSeek work.
- `AGENTS.md`
- `CLAUDE.md`
- `docs/engineering-conventions.md`
- `docs/agent-handoff.md`
  - Point future agents at `.ai/README.md`.
- `apps/api/src/routers/health/health.py` **(new)**
  - Moves `/healthz` into a typed health router and adds `/readyz`.
- `apps/api/src/core/readiness.py` **(new)**
  - Runs bounded MySQL, MongoDB, Redis, and PostgreSQL readiness probes.
- `apps/api/src/type/health_type.py` **(new)**
  - Adds Pydantic response models for health/readiness snapshots.
- `apps/api/src/routers/health/__init__.py` **(new)**
- `apps/api/src/routers/__init__.py`
- `apps/api/main.py`
  - Registers the health router with the app.
- `apps/api/src/core/observability.py`
  - Treats `/readyz` as a noisy operational probe for logs/metrics.
- `scripts/export-openapi.py`
  - Includes health routes in schema-only OpenAPI export.
- `apps/api/README.md`
- `apps/api/AGENTS.md`
- `apps/api/CLAUDE.md`
- `apps/api/docs/current-state.md`
- `docs/current-state.md`
- `docs/architecture/api-contracts.md`
- `docs/architecture/api-response-envelope.md`
- `docs/architecture/observability-and-analytics.md`
- `docs/agent-handoff.md`
  - Document the liveness/readiness split and monorepo cutover caveat.
- `apps/web/performance-budgets.json` **(new)**
  - Defines baseline gzip budgets for total JS, total CSS, largest asset,
    entry JS, and the admin metrics lazy chunk.
- `docs/schemas/web-performance-budgets.schema.json` **(new)**
  - Documents and validates the performance budget config shape.
- `scripts/check-web-budgets.mjs` **(new)**
  - Computes raw/gzip asset sizes from `apps/web/dist` and fails on budget
    regressions.
- `scripts/check-web.sh`
  - Runs the performance budget check after the Vite build.
- `package.json`
  - Adds `check:web:budgets` for running the budget gate directly.
- `docs/architecture/frontend-platform-foundation.md`
- `docs/architecture/commercial-platform-blueprint.md`
- `docs/agent-handoff.md`
  - Document the Phase 20 budget gate and current heavy chunk baseline.
- `apps/web/src/shared/seo/index.ts`
  - Upgrades `usePageMeta()` to accept reactive inputs.
  - Adds `useJsonLd()`, `buildWebsiteJsonLd()`, and
    `buildBlogPostingJsonLd()` for schema.org structured data.
- `apps/web/src/pages/home/index.vue`
  - Registers homepage metadata, canonical URL, and WebSite JSON-LD.
- `apps/web/src/pages/blog/index.vue`
  - Registers reactive article metadata and BlogPosting JSON-LD once blog
    detail data loads.
- `apps/web/public/robots.txt` **(new)**
  - Allows public content, excludes private/editor/account routes, and points
    crawlers to the sitemap.
- `apps/web/public/sitemap.xml` **(new)**
  - Adds static public SPA routes for initial discovery.
- `docs/architecture/frontend-platform-foundation.md`
- `docs/architecture/commercial-platform-blueprint.md`
- `docs/agent-handoff.md`
  - Document the Phase 19 SEO foundation and the future dynamic article
    sitemap task.
- `apps/web/src/modules/blog/types.ts`
  - Adds contract-derived base stats, category, and tag response aliases.
- `apps/web/src/modules/blog/api.ts`
  - Adds `fetchBlogStats()`, `fetchBlogCategories()`, and `fetchBlogTags()`
    through the shared typed API layer.
- `apps/web/src/util/request.ts`
  - Keeps only startup category/tag composition.
- `apps/web/src/App.vue`
  - Loads stats through the blog module API.
- `apps/web/src/modules/blog/composables/useBlogList.ts`
- `apps/web/src/util/data.ts`
- `apps/web/src/components/SelfInfoCard/index.vue`
- `apps/web/src/pages/home/index.vue`
- `apps/web/src/pages/article/index.vue`
- `apps/web/src/pages/manage/blog/index.vue`
  - Import base-data types from `modules/blog/types`.
- `apps/web/src/service/baseRequest.ts` **(deleted)**
  - Removed the legacy base-data request boundary.
- `docs/architecture/api-contracts.md`
- `docs/architecture/frontend-platform-foundation.md`
- `docs/agent-handoff.md`
  - Document the Phase 18 ownership boundary.

## Verification

- `find .ai -maxdepth 3 -type f -print` confirmed the AI workspace files.
- `git diff --check` passed.
- `bash scripts/check-api.sh` passed.
- `SUN_WORLD_API_PYTHON=/home/lighthouse/blog/blog_end/.venv/bin/python pnpm -F @sun-world/contracts generate`
  passed on the server branch and generated `/healthz` + `/readyz` contracts.
- Server venv smoke using file-level health router import and fake dependency
  managers passed: route paths include `/healthz` and `/readyz`; all-ready
  fake app returns `status == "ready"`.
- `rg '"/readyz"|ReadinessSnapshot|HealthSnapshot|readyz_readyz_get' packages/contracts/openapi.json packages/contracts/src/generated-api-types.ts apps/api/src -n`
  confirmed OpenAPI and generated TypeScript contracts include the readiness
  endpoint and models.
- `pnpm exec tsc --noEmit -p apps/web/tsconfig.json` passed.
- `pnpm check:web` passed.
- `git diff --check` passed.
- `node scripts/check-web-budgets.mjs` passed. Current totals:
  - JS gzip: `1052.0 KiB / 1120.0 KiB`
  - CSS gzip: `74.1 KiB / 85.0 KiB`
  - Largest asset gzip: `397.0 KiB / 430.0 KiB`
- `test -f apps/web/dist/robots.txt && test -f apps/web/dist/sitemap.xml`
  passed after the Vite build.
- Browser check on `http://localhost:3001/` confirmed homepage canonical,
  description, Open Graph URL, and WebSite JSON-LD injection.
- `curl -fsS http://localhost:3001/robots.txt` and
  `curl -fsS http://localhost:3001/sitemap.xml` returned the expected static
  discovery assets.

## Next Step

- Push `monorepo-api-import` to the server/GitHub remote and keep the server
  working tree on `main`. Do not deploy this branch yet.
- `apps/web/src/shared/observability/request-id.ts` **(new)**
  - Adds safe request-id generation, normalisation, header reading, and
    `X-Request-ID` constants.
- `apps/web/src/service/http.ts`
  - Adds `X-Request-ID` to every shared Axios request.
  - Captures echoed response request IDs and stores them on `ApiError`.
  - Sends request IDs into API timing/error telemetry.
- `apps/web/src/shared/telemetry/index.ts`
  - Extends `ApiTelemetryContext` with `requestId`.
  - Adds `requestId` to `api_timing` and `api_error` event properties.
- `docs/architecture/observability-and-analytics.md`
  - Documents Phase 17 frontend request correlation and debug flow.
- `docs/architecture/api-response-envelope.md`
  - Documents `ApiError.requestId`.
- `docs/architecture/frontend-platform-foundation.md`
  - Records the shared request-id utility and HTTP/telemetry behavior.
- `apps/web/src/modules/admin/composables/useAdminMetrics.ts` **(new)**
  - Owns admin metrics loading/error state and derived view models.
  - Sorts route rows by error count and latency.
  - Builds summary cards for total requests, errors, average latency, and max
    latency.
- `apps/web/src/modules/admin/errors.ts` **(new)**
  - Adds admin-domain error resolution through the shared error registry.
- `apps/web/src/modules/admin/pages/AdminMetricsPage.vue` **(new)**
  - Adds responsive token-based operations UI for request metrics, route
    latency, and status-code distribution.
  - Uses loading skeletons, refresh state, reduced-motion handling, and an
    isolated lazy-loaded route chunk.
- `apps/web/src/modules/admin/index.ts`
  - Registers `/manage/metrics` with admin SEO metadata and navigation.
  - Preloads both the legacy manage shell and the metrics page.
  - Exports admin error helpers.
- `apps/web/src/pages/manage/index.vue`
  - Adds a "请求指标" tab to the existing manage shell.
  - Lazy-loads the module-owned metrics page.
  - Adds responsive layout constraints for narrower screens.
- `docs/architecture/observability-and-analytics.md`
  - Documents Phase 16 admin metrics view, UI contract, scope, and future data
    source migration path.
- `apps/web/src/shared/errors/error-codes.ts`
  - Upgrades the frontend error-code constants into a registry with namespace,
    default message, severity, retryability, and resolver helpers.
  - Adds `resolveErrorMessage()`, `isKnownErrorCode()`,
    `isErrorCodeInNamespace()`, `getErrorSeverity()`, and
    `isRetryableErrorCode()`.
- `apps/web/src/service/http.ts`
  - Uses the shared error registry for global API toast copy and warning/error
    severity.
  - Treats stable `AUTH_*` codes as auth warnings even when HTTP status is not
    401.
- `apps/web/src/modules/blog/errors.ts`
  - Uses `resolveErrorMessage()` with the `BLOG` namespace instead of a local
    switch and local Set.
- `apps/web/src/modules/account/errors.ts`
  - Uses `resolveErrorMessage()` with the `AUTH` namespace instead of a local
    switch and local Set.
- `apps/api/src/core/error_codes.py`
  - Adds backend namespace helpers: `ERROR_CODE_NAMESPACES`, `ERROR_CODES`,
    `is_known_error_code()`, `get_error_namespace()`, and
    `is_error_code_in_namespace()`.
- `docs/architecture/api-response-envelope.md`
  - Documents the stable error-code registry and frontend resolver workflow.
- `docs/architecture/api-contracts.md`
  - Documents backend/frontend durable error-code registries.
- `docs/architecture/frontend-platform-foundation.md`
  - Records Phase 15 error registry behavior and module usage rules.
- `packages/contracts/src/api-types.ts` **(new)**
  - Adds reusable OpenAPI helper types: method path lookup, response envelope
    extraction, success data unwrapping, request body, query params, and path
    params.
  - Treats success `data` as non-null when OpenAPI exposes a real schema, while
    preserving `null` for no-content business responses.
- `packages/contracts/src/index.ts`
  - Exports the new API helper types from `@sun-world/contracts`.
- `apps/web/src/shared/api/index.ts`
  - Keeps legacy `request` and `ApiError` exports for compatibility.
  - Adds `apiGet`, `apiPost`, `apiPut`, and `apiDelete` wrappers that are typed
    by OpenAPI path/method and still delegate to the existing Axios layer.
  - Adds typed path-parameter interpolation for paths such as
    `/blogs/{blog_id}`.
- `apps/web/src/modules/blog/api.ts`
  - Migrates list/detail/create calls from legacy service glue to the shared
    typed API boundary.
  - Normalizes blog create category/tag values toward the OpenAPI contract.
- `apps/web/src/modules/blog/types.ts`
  - Reuses `ApiSuccessData` and `ApiRequestBody` instead of repeating envelope
    conditional types.
- `apps/web/src/modules/account/api.ts`
  - Migrates account API calls to `apiGet` / `apiPost`.
- `apps/web/src/modules/account/types.ts`
  - Reuses `ApiSuccessData` and `ApiRequestBody` for login/register/session/user
    types.
- `apps/web/src/modules/admin/api.ts`
  - Migrates admin metrics call to `apiGet`.
- `apps/web/src/modules/admin/types.ts`
  - Reuses `ApiSuccessData` for admin metrics.
- `docs/architecture/api-contracts.md`
  - Documents the typed contract helper layer and frontend usage rules.
- `apps/web/tsconfig.json`
  - Removes fragile `vite-plugin-svg-icons/client` types subpath.
  - Enables `skipLibCheck` so type checking focuses on project code instead of dependency declaration noise.
- `apps/web/src/env.d.ts`
  - Adds local declarations for `virtual:svg-icons-register` and `virtual:svg-icons-names`.
- `apps/web/src/components/Table/type.ts`
  - Removes over-coupling to Element Plus internal `TableColumnCtx<T>` constraint.
- `apps/web/src/modules/blog/api.ts`
  - Normalizes legacy blog create payloads before calling compatibility service functions.
- `apps/web/src/modules/blog/types.ts`
  - Fixes contract fallback types and created-time compatibility.
- `apps/web/src/modules/blog/composables/useBlogList.ts`
  - Handles missing `created_at` from list contracts.
- `apps/web/src/shared/design/index.ts`
  - Re-exports actual breakpoint constants and types.
- `apps/web/src/shared/telemetry/index.ts`
  - Removes deprecated FID hook for `web-vitals@5`.
- `apps/web/src/store/auth.ts`
  - Aligns auth store user shape with account module contract types.
- `scripts/check-web.sh`
  - Runs project TypeScript checking before the Vite build.
- `apps/web/src/modules/types.ts`
  - Extends `ModuleSeoDefaults` with `ogType` and `noIndex`.
- `apps/web/src/modules/registry.ts`
  - Applies module SEO defaults to route meta before router creation.
  - Adds memoized `preloadModuleById()` and `installModulePreloading()`.
- `apps/web/src/modules/*/index.ts`
  - Adds preload hooks for blog, AI, editor, account, and admin modules.
  - Adds stronger default SEO descriptions and `noIndex` defaults for
    non-public account/admin/editor routes.
- `apps/web/src/shared/seo/index.ts`
  - Adds stale `og:image` / `twitter:image` cleanup.
  - Adds `installSeoResourceHints()` for conservative public preconnect and
    DNS-prefetch hints.
- `apps/web/src/main.ts`
  - Installs module preloading and SEO resource hints during bootstrap.
- `docs/architecture/frontend-platform-foundation.md`
  - Documents module SEO defaults and preload contract.
- `docs/current-state.md`
  - Corrects `shop.sunworld.site` runtime target to 127.0.0.1:8081.
- `apps/web/src/styles/design-tokens.css`
  - Aligns light/dark palette with the Figma v1 blue + teal accent direction.
  - Adds accent, raised surface, focus, overlay, mobile nav, drawer, card, and reduced-motion tokens.
- `apps/web/src/style.css`
  - Adds page background, selection color, global focus-visible ring, overscroll handling, and reduced-motion guard.
- `apps/web/src/components/BlogCard/index.vue`
  - Uses card semantic tokens, hover lift, focus-visible, refined mobile spacing, and reduced-motion fallback.
- `apps/web/src/pages/home/index.vue`
  - Uses tokenized page background, content entrance motion, stable mobile single-column padding, and horizontal tag scrolling.
- `apps/web/src/layout/mobLayout.vue`
  - Tokenizes mobile header/footer/drawer, safe-area handling, bottom-nav active state, overlay, and drawer transitions.
- `docs/architecture/frontend-theme-system.md`
  - Records the Figma source, single-mode variable limitation, token additions, motion rules, and mobile theme rules.
- `apps/api/src/core/metrics.py` **(new)**
  - Process-local request metrics collector.
  - Tracks total requests, 5xx requests, status distribution, and per-route latency/counts.
  - Bounded route cardinality; excess routes aggregate into `__other__`.
- `apps/api/src/type/admin_type.py` **(new)**
  - Pydantic response models for `RequestMetricsSnapshot`, `RouteMetric`, and `StatusMetric`.
- `apps/api/src/routers/admin/admin.py` **(new)**
  - Authenticated `GET /admin/metrics` endpoint using existing `get_current_user`.
- `apps/api/src/routers/admin/__init__.py` **(new)**
  - Exports `admin_router`.
- `scripts/export-openapi.py`
  - Includes `admin_router` in the schema-only OpenAPI export app.
- `apps/api/src/core/request_context.py` **(new)**
  - `ContextVar`-backed `request_id` storage: `get_request_id()`, `set_request_id()`, `reset_request_id()`, `generate_request_id()`.
- `apps/api/src/core/observability.py`
  - `ObservabilityMiddleware` (Starlette `BaseHTTPMiddleware`):
    - Reads `X-Request-ID` / `X-Correlation-ID` or generates UUID4 hex.
    - Rejects oversized or unsafe incoming request IDs.
    - Stores ID in `request_context` contextvar.
    - Resets context after request handling to avoid cross-request leakage.
    - Writes `X-Request-ID` into every response header.
    - Times every request and logs `request_id`, `method`, `path`, `status`, `duration_ms`, `client`, `ua`, `route`.
    - `/healthz`, `/favicon.ico`, `/robots.txt` are logged at `DEBUG` level.
    - Never logs `Authorization`, `Cookie`, query strings, request bodies, or env values.
    - Records non-noisy request metrics after each request.
- `apps/api/main.py`
  - Added `loguru` and `request_context` imports.
  - `http_exception_handler`: logs `request_id`, method, path, status, detail at `WARNING`.
  - `validation_exception_handler`: logs count at `WARNING`, individual field errors at `DEBUG`.
  - `general_exception_handler`: logs `request_id`, method, path, exception type, and bounded detail with traceback via `logger.exception()`.
  - Response envelope structure and status codes are unchanged.
- `apps/api/app_instance.py`
  - Registers `ObservabilityMiddleware` after CORS so Starlette builds it as the outer project middleware.
- `apps/api/src/core/logging.py` **(new)**
  - Adds idempotent `configure_logging()` for loguru.
  - Defaults to human-readable stderr logs.
  - Supports `BLOG_LOG_FORMAT=json` for serialized JSON logs.
  - Supports safe `BLOG_LOG_LEVEL` normalization.
  - Keeps `BLOG_LOG_BACKTRACE` and `BLOG_LOG_DIAGNOSE` disabled by default.
- `apps/api/app_instance.py`
  - Calls `configure_logging()` during module import before `Application` is created.
- `apps/web/src/modules/admin/api.ts` **(new)**
  - Exposes `fetchAdminMetrics()` via the existing HTTP wrapper.
- `apps/web/src/modules/admin/types.ts` **(new)**
  - Derives admin metric types from generated OpenAPI contracts.
- `apps/web/src/modules/admin/index.ts`
  - Exports typed admin API/types from the module boundary.
- `docs/architecture/observability-and-analytics.md`
  - Adds Phase 10 admin request metrics snapshot, endpoint contract, scope, and limitations.

## Commands Run

- `git status --short --branch`
- `bash scripts/check-api.sh`
- `SUN_WORLD_API_PYTHON=/home/lighthouse/blog/blog_end/.venv/bin/python pnpm -F @sun-world/contracts generate`
- `git diff --check`
- `PYTHONPATH=apps/api /home/lighthouse/blog/blog_end/.venv/bin/python - <<'PY' ... minimal ObservabilityMiddleware TestClient smoke ...`
- `curl -fsS https://api.sunworld.site/healthz`
- `grep -RInE "sk-[A-Za-z0-9]|BEGIN (RSA|OPENSSH|PRIVATE)|password\\s*=|token\\s*=|secret\\s*=" ...`
- `BLOG_LOG_FORMAT=json BLOG_LOG_LEVEL=DEBUG PYTHONPATH=apps/api /home/lighthouse/blog/blog_end/.venv/bin/python - <<'PY' ... configure_logging smoke ...`

## Verification

- Phase 17:
  - `pnpm exec tsc --noEmit -p apps/web/tsconfig.json` → passed.
  - `pnpm check:web` → type check and frontend build passed. Existing Vite CJS and Element Plus Sass deprecation warnings remain.
  - `git diff --check` → passed.
  - `curl -fsS -D - -o /dev/null -H 'X-Request-ID: codex-smoke-20260607' https://api.sunworld.site/healthz` → production legacy backend returned 200 but did not expose `X-Request-ID`; end-to-end public header smoke remains pending until the monorepo API runtime is cut over.
- Phase 16:
  - `pnpm exec tsc --noEmit -p apps/web/tsconfig.json` → passed.
  - `pnpm check:web` → type check and frontend build passed. Existing Vite CJS and Element Plus Sass deprecation warnings remain.
  - `git diff --check` → passed.
  - Build output confirms `AdminMetricsPage` is emitted as its own lazy chunk.
  - `curl -fsS http://localhost:3001/manage/metrics` → dev server returned the SPA HTML entry.
  - Automated screenshot smoke was skipped because the local Node REPL environment does not have the `playwright` package available.
- Phase 15:
  - `pnpm exec tsc --noEmit -p apps/web/tsconfig.json` → passed.
  - `bash scripts/check-api.sh` → passed; 77 files compiled OK.
  - `pnpm check:web` → type check and frontend build passed. Existing Vite CJS and Element Plus Sass deprecation warnings remain.
  - `git diff --check` → passed.
- Phase 14:
  - `pnpm exec tsc --noEmit -p apps/web/tsconfig.json` → passed.
  - `pnpm check:web` → type check and frontend build passed. Existing Vite CJS and Element Plus Sass deprecation warnings remain.
  - `git diff --check` → passed.
- Phase 13:
  - `pnpm exec tsc --noEmit -p apps/web/tsconfig.json` → passed.
  - `pnpm check:web` → type check and frontend build passed. Existing Vite CJS and Element Plus Sass deprecation warnings remain.
- Phase 12:
  - `pnpm check:web` → frontend build passed. Existing Vite CJS and Element Plus Sass deprecation warnings remain.
  - `pnpm exec tsc --noEmit -p apps/web/tsconfig.json` was attempted but blocked by existing project config: missing type definition entry `vite-plugin-svg-icons/client`.
- Phase 11:
  - `pnpm check:web` → frontend build passed. Existing Vite CJS and Element Plus Sass deprecation warnings remain.
  - `git diff --check` → passed.
  - `rg -n "#[0-9a-fA-F]{3,8}|rgba?\\(" apps/web/src/components/BlogCard/index.vue apps/web/src/pages/home/index.vue apps/web/src/layout/mobLayout.vue apps/web/src/style.css apps/web/src/styles/design-tokens.css` → hardcoded color values are limited to `design-tokens.css` token definitions; component/page/layout/style files use variables.
  - Figma validation via `use_figma` confirmed frames:
    - `Cover / Theme Direction` 1280x720
    - `Desktop Home / 1440` 1440x1024
    - `Mobile Home / 390` 390x844
  - Attempted local Playwright screenshot smoke, but local Node REPL did not have the `playwright` module available.
- `bash scripts/check-api.sh` → 77 files compiled OK.
- `SUN_WORLD_API_PYTHON=/home/lighthouse/blog/blog_end/.venv/bin/python pnpm -F @sun-world/contracts generate` → passed; generated `GET /admin/metrics` contracts.
- `grep -R "get_admin_metrics_admin_metrics_get" packages/contracts/src/generated-api-types.ts packages/contracts/openapi.json` → operation exists in both generated outputs.
- `pnpm check:web` → frontend build passed. Existing Element Plus Sass deprecation warnings remain.
- `pnpm exec tsc --noEmit --skipLibCheck --moduleResolution Bundler --module ESNext --target ES2020 apps/web/src/modules/admin/types.ts` → admin contract type reference passed.
- `PYTHONPATH=apps/api /home/lighthouse/blog/blog_end/.venv/bin/python - <<'PY' ... ObservabilityMiddleware + metrics TestClient smoke ...` → passed:
  - request ID header is propagated.
  - non-noisy routes are counted.
  - 5xx responses increment `error_requests`.
  - `/healthz` is skipped from metrics.
- `git diff --check` → passed.
- Sensitive scan found no secret values. The only match was the benign code variable name `context_token` in `observability.py`.
- `pnpm -F @sun-world/blog exec vue-tsc --noEmit` was attempted but blocked by the repository's existing `vue-tsc@1.8.27` / TypeScript compatibility issue: `Search string not found: "/supportedTSExtensions = .*(?=;)/"`.

## Deployment

- Not deployed.
- No Docker, Nginx, systemd, database, certificate, or secret files were changed.

## Next Step

- Run Phase 17 verification, commit on `monorepo-api-import`, push it for
  review, then continue with persistent analytics/log views or remaining
  module/service boundaries.
- Keep production `main` clean and do not deploy this feature branch until the broader refactor is ready.
